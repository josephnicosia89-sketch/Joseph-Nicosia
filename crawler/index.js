#!/usr/bin/env node
// SafeTech morning-brief crawler.
//
//   node crawler/index.js                 # uses crawler/config.json (or config.example.json)
//   node crawler/index.js --inwork "C:\...\Sales Order Inwork Report.xlsm" --qb "C:\...\quickbooks-export.json"
//   node crawler/index.js --login         # force a fresh Microsoft sign-in (device code)
//   node crawler/index.js --no-publish    # keep output local only
//
// Output (default data/brief/): latest.json, brief-YYYY-MM-DD.json, brief.md,
// orders.csv, orders.json. The same files are copied/uploaded to the OneDrive
// folder named by publishFolder so Claude can read them via Microsoft 365.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInworkBuffer } from './inwork.js';
import { loadQuickBooks } from './quickbooks.js';
import { fetchSource, publishToOneDrive, resolveLocal, localOneDriveRoot } from './onedrive.js';
import { buildBrief, renderBriefMarkdown, ordersToCsv, ordersForApp } from './brief.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { publish: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--config') a.config = next();
    else if (k === '--inwork') a.inwork = next();
    else if (k === '--qb' || k === '--quickbooks') a.qb = next();
    else if (k === '--out') a.out = next();
    else if (k === '--lookback') a.lookbackDays = +next();
    else if (k === '--due-soon') a.dueSoonDays = +next();
    else if (k === '--no-publish') a.publish = false;
    else if (k === '--login') a.forceLogin = true;
    else if (k === '--quiet') a.quiet = true;
    else if (k === '-h' || k === '--help') a.help = true;
  }
  return a;
}

export function loadConfig(explicit) {
  const candidates = [explicit, path.join(here, 'config.json'), path.join(here, 'config.example.json')].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return { ...JSON.parse(fs.readFileSync(c, 'utf8')), _file: c };
  }
  return {};
}

function log(quiet, ...m) { if (!quiet) console.log(...m); }

export async function run(args) {
  const cfg = loadConfig(args.config);
  const inworkSrc = args.inwork || cfg.inworkSource;
  const qbSrc = args.qb || cfg.quickbooksSource;
  const outDir = path.resolve(args.out || cfg.outputDir || path.join(here, '..', 'data', 'brief'));
  const lookbackDays = args.lookbackDays || cfg.lookbackDays || 1;
  const dueSoonDays = args.dueSoonDays || cfg.dueSoonDays || 7;
  const state = { forceLogin: !!args.forceLogin };
  fs.mkdirSync(outDir, { recursive: true });

  if (!inworkSrc) throw new Error('No Inwork source. Set inworkSource in crawler/config.json or pass --inwork.');

  log(args.quiet, 'OneDrive sync folder:', localOneDriveRoot(cfg) || '(none — will use Microsoft Graph)');
  log(args.quiet, 'Fetching Inwork report:', inworkSrc);
  const fetched = await fetchSource(inworkSrc, cfg, state);
  const inwork = parseInworkBuffer(fetched.buffer, fetched.path);
  inwork.modified = fetched.modified;
  inwork.via = fetched.via;
  log(args.quiet, '  parsed', inwork.orders.length, 'orders from', inwork.sheets.map(s => s.name + ' (' + s.orders + ')').join(', ') || 'no recognisable sheets', inwork.skippedSheets.length ? '· skipped: ' + inwork.skippedSheets.join(', ') : '');
  if (!inwork.orders.length) console.warn('  WARNING: no orders parsed. Check that the sheet has a header row with "Num" and "Customer Name".');

  let quickbooks = null;
  if (qbSrc) {
    let qbPath = resolveLocal(qbSrc, cfg);
    if (!qbPath) {
      try {
        const f = await fetchSource(qbSrc, cfg, state);
        qbPath = path.join(outDir, 'quickbooks-source' + path.extname(qbSrc.split(/[?#]/)[0]) || '.json');
        fs.writeFileSync(qbPath, f.buffer);
      } catch (e) { console.warn('QuickBooks source unavailable:', e.message); }
    }
    if (qbPath) {
      try {
        quickbooks = loadQuickBooks(qbPath);
        log(args.quiet, 'QuickBooks:', quickbooks.source, '·', (quickbooks.openSalesOrders || quickbooks.salesOrders).length, 'open sales orders', quickbooks.invoices.length, 'invoices', quickbooks.payments.length, 'payments');
        if (quickbooks.errors && quickbooks.errors.length) console.warn('  QuickBooks export reported errors:', quickbooks.errors.join('; '));
      } catch (e) { console.warn('Could not parse QuickBooks data:', e.message); }
    }
  } else log(args.quiet, 'QuickBooks: no source configured (Inwork only)');

  let previous = null;
  const latestPath = path.join(outDir, 'latest.json');
  if (fs.existsSync(latestPath)) { try { previous = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch (e) { /* */ } }

  const brief = buildBrief({ inwork, quickbooks, previous, lookbackDays, dueSoonDays });
  const md = renderBriefMarkdown(brief);
  const dated = path.join(outDir, 'brief-' + brief.today + '.json');
  const files = {
    latest: latestPath,
    dated,
    md: path.join(outDir, 'brief.md'),
    csv: path.join(outDir, 'orders.csv'),
    appJson: path.join(outDir, 'orders.json')
  };
  fs.writeFileSync(files.latest, JSON.stringify(brief, null, 2));
  fs.writeFileSync(files.dated, JSON.stringify(brief, null, 2));
  fs.writeFileSync(files.md, md);
  fs.writeFileSync(files.csv, ordersToCsv(brief.orders));
  fs.writeFileSync(files.appJson, JSON.stringify(ordersForApp(brief.orders), null, 2));

  // keep 60 dated snapshots
  const snaps = fs.readdirSync(outDir).filter(f => /^brief-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of snaps.slice(0, Math.max(0, snaps.length - 60))) fs.unlinkSync(path.join(outDir, f));

  let published = [];
  if (args.publish && cfg.publish !== false) {
    try {
      published = await publishToOneDrive([files.latest, files.md, files.csv, files.appJson], cfg, state);
      for (const p of published) log(args.quiet, p.skipped ? 'Publish skipped: ' + p.reason : 'Published → ' + p.file);
    } catch (e) { console.warn('Publish to OneDrive failed:', e.message); }
  }

  log(args.quiet, '');
  for (const h of brief.headlines) log(args.quiet, '• ' + h);
  log(args.quiet, '\nWrote', files.latest, 'and', files.md);
  return { brief, files, published };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  }
  run(args).catch(err => { console.error('Crawler failed:', err.message); process.exit(1); });
}
