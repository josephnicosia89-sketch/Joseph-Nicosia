// Reads the Inwork workbook (and QuickBooks export) from OneDrive and writes
// brief output back, either through the locally synced OneDrive folder or
// through Microsoft Graph (device-code sign-in, token cached on disk).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Directory of the synced OneDrive for Business folder on this machine, if any. */
export function localOneDriveRoot(config) {
  const candidates = [
    config && config.oneDriveLocalRoot,
    process.env.OneDriveCommercial,
    process.env.OneDrive,
    process.env.OneDriveConsumer
  ].filter(Boolean);
  for (const c of candidates) {
    const p = expandHome(c);
    if (fs.existsSync(p)) return p;
  }
  return '';
}

export function expandHome(p) {
  if (!p) return p;
  let s = String(p);
  s = s.replace(/%([^%]+)%/g, (m, name) => process.env[name] || process.env[name.toUpperCase()] || m);
  if (s.startsWith('~')) s = path.join(os.homedir(), s.slice(1));
  return s;
}

export function isAbsolutePath(p) {
  return path.isAbsolute(p) || path.win32.isAbsolute(p) || /^\\\\/.test(p);
}

export function isUncOrDrivePath(p) {
  return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]+\\/.test(p);
}

/**
 * Mapped network drives (Q:) are per-logon and often invisible to scheduled
 * tasks. `driveMap` in config ("Q:" -> "\\\\server\\share") lets the crawler
 * fall back to the UNC path when the letter is not mounted.
 */
export function alternatePaths(p, config) {
  const out = [];
  const map = (config && config.driveMap) || {};
  const m = p.match(/^([A-Za-z]:)([\\/].*)?$/);
  if (m) {
    const unc = map[m[1].toUpperCase()] || map[m[1].toLowerCase()] || map[m[1]];
    // Keep UNC separators on Windows; on other platforms (tests, WSL mounts) use the native separator.
    const tail = (m[2] || '').replace(/[\\/]+/g, process.platform === 'win32' ? '\\' : path.sep);
    if (unc) out.push(unc.replace(/[\\/]+$/, '') + tail);
  }
  return out;
}

export function isSharingUrl(s) {
  return /^https:\/\/(?:[\w-]+\.sharepoint\.com|1drv\.ms|onedrive\.live\.com)\//i.test(String(s || ''));
}

export function encodeSharingUrl(url) {
  const b64 = Buffer.from(url, 'utf8').toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return 'u!' + b64;
}

/**
 * Resolve a configured source to a local file path when the OneDrive folder is
 * synced on this machine. Returns '' when it must be fetched through Graph.
 */
export function resolveLocal(source, config) {
  if (!source) return '';
  if (isSharingUrl(source) || source.startsWith('graph:')) return '';
  const expanded = expandHome(source);
  if (isAbsolutePath(expanded)) {
    if (fs.existsSync(expanded)) return expanded;
    for (const alt of alternatePaths(expanded, config)) if (fs.existsSync(alt)) return alt;
    return '';
  }
  if (fs.existsSync(expanded)) return path.resolve(expanded);
  const root = localOneDriveRoot(config);
  if (root) {
    const joined = path.join(root, expanded);
    if (fs.existsSync(joined)) return joined;
  }
  return '';
}

// ── Microsoft Graph ──────────────────────────────────────────────────────────

function cacheFile(config) {
  const dir = expandHome((config && config.tokenCacheDir) || path.join(os.homedir(), '.safetech-crawler'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'msal-cache.json');
}

export async function getGraphToken(config, opts = {}) {
  const graph = (config && config.graph) || {};
  if (!graph.clientId) {
    throw new Error('Graph access needs graph.clientId in crawler/config.json (an Entra app registration with Files.ReadWrite delegated permission and "Allow public client flows" enabled).');
  }
  const { PublicClientApplication } = await import('@azure/msal-node');
  const file = cacheFile(config);
  const cachePlugin = {
    beforeCacheAccess: async (ctx) => { if (fs.existsSync(file)) ctx.tokenCache.deserialize(fs.readFileSync(file, 'utf8')); },
    afterCacheAccess: async (ctx) => { if (ctx.cacheHasChanged) fs.writeFileSync(file, ctx.tokenCache.serialize(), { mode: 0o600 }); }
  };
  const pca = new PublicClientApplication({
    auth: { clientId: graph.clientId, authority: 'https://login.microsoftonline.com/' + (graph.tenantId || 'organizations') },
    cache: { cachePlugin }
  });
  const scopes = graph.scopes || ['Files.ReadWrite', 'User.Read'];
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length && !opts.forceLogin) {
    try {
      const r = await pca.acquireTokenSilent({ account: accounts[0], scopes });
      return r.accessToken;
    } catch (e) { /* fall through to device code */ }
  }
  const r = await pca.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (resp) => { console.log('\n' + resp.message + '\n'); }
  });
  return r.accessToken;
}

async function graphFetch(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + token, ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Graph ' + res.status + ' ' + res.statusText + ' for ' + url + (body ? ' — ' + body.slice(0, 300) : ''));
  }
  return res;
}

function itemUrl(source) {
  // graph:drives/{driveId}/items/{itemId}   graph:me/drive/root:/Desktop/File.xlsm
  // graph:/Desktop/File.xlsm (path relative to the signed-in user's OneDrive root)
  const s = source.replace(/^graph:/, '');
  if (/^drives\//.test(s) || /^me\//.test(s) || /^users\//.test(s) || /^sites\//.test(s)) return GRAPH + '/' + s;
  const rel = s.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return GRAPH + '/me/drive/root:/' + rel;
}

/** Download a file's bytes from OneDrive via Graph. */
export async function downloadFromGraph(token, source) {
  let url;
  if (isSharingUrl(source)) url = GRAPH + '/shares/' + encodeSharingUrl(source) + '/driveItem/content';
  else {
    const u = itemUrl(source);
    url = u.includes('/root:/') ? u + ':/content' : u + '/content';
  }
  const res = await graphFetch(token, url);
  return Buffer.from(await res.arrayBuffer());
}

export async function getGraphMetadata(token, source) {
  let url;
  if (isSharingUrl(source)) url = GRAPH + '/shares/' + encodeSharingUrl(source) + '/driveItem';
  else url = itemUrl(source);
  const res = await graphFetch(token, url + '?$select=id,name,size,lastModifiedDateTime,webUrl,parentReference');
  return res.json();
}

/** Upload (create or replace) a small file under the signed-in user's OneDrive. */
export async function uploadToGraph(token, relPath, data, contentType = 'application/octet-stream') {
  const rel = relPath.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  const url = GRAPH + '/me/drive/root:/' + rel + ':/content?@microsoft.graph.conflictBehavior=replace';
  const res = await graphFetch(token, url, { method: 'PUT', body: data, headers: { 'Content-Type': contentType } });
  return res.json();
}

/**
 * Fetch a configured source as a Buffer. Local paths and synced OneDrive paths
 * are read from disk; sharing links and graph: sources go through Graph.
 */
export async function fetchSource(source, config, state = {}) {
  const local = resolveLocal(source, config);
  if (local) {
    const st = fs.statSync(local);
    return { buffer: fs.readFileSync(local), path: local, modified: st.mtime.toISOString(), via: 'local' };
  }
  if (isUncOrDrivePath(source)) {
    const alts = alternatePaths(expandHome(source), config);
    throw new Error('Cannot reach ' + source + (alts.length ? ' (also tried ' + alts.join(', ') + ')' : '') +
      '. If this is a mapped network drive, make sure the drive is connected for the account running the crawler, ' +
      'or add its UNC path under "driveMap" in crawler/config.json (e.g. "Q:": "\\\\server\\share").');
  }
  if (!isSharingUrl(source) && !source.startsWith('graph:') && !(config && config.graph && config.graph.clientId)) {
    throw new Error('Source not found locally and no Graph credentials configured: ' + source);
  }
  state.token = state.token || await getGraphToken(config, state);
  const src = (!isSharingUrl(source) && !source.startsWith('graph:')) ? 'graph:' + source.replace(/\\/g, '/') : source;
  let meta = null;
  try { meta = await getGraphMetadata(state.token, src); } catch (e) { /* metadata is optional */ }
  const buffer = await downloadFromGraph(state.token, src);
  return { buffer, path: (meta && meta.webUrl) || source, modified: meta ? meta.lastModifiedDateTime : '', via: 'graph', meta };
}

const MIME = { '.json': 'application/json', '.md': 'text/markdown', '.csv': 'text/csv', '.txt': 'text/plain', '.html': 'text/html' };

/**
 * Publish brief output files to OneDrive so Claude can read them through the
 * Microsoft 365 connector. Uses the synced folder when present, Graph otherwise.
 */
export async function publishToOneDrive(files, config, state = {}) {
  const folder = ((config && config.publishFolder) || 'MorningBrief').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const results = [];
  const root = localOneDriveRoot(config);
  if (root) {
    const dir = path.join(root, folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const dest = path.join(dir, path.basename(f));
      fs.copyFileSync(f, dest);
      results.push({ file: dest, via: 'local' });
    }
    return results;
  }
  if (!(config && config.graph && config.graph.clientId)) {
    return [{ skipped: true, reason: 'No synced OneDrive folder and no graph.clientId configured' }];
  }
  state.token = state.token || await getGraphToken(config, state);
  for (const f of files) {
    const name = path.basename(f);
    const r = await uploadToGraph(state.token, folder + '/' + name, fs.readFileSync(f), MIME[path.extname(name).toLowerCase()] || 'application/octet-stream');
    results.push({ file: r.webUrl || (folder + '/' + name), via: 'graph' });
  }
  return results;
}
