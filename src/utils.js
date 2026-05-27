export function fmtD(d) {
  if (!d) return '&mdash;';
  var dt = new Date(d + 'T12:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTs(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toast(msg, t) {
  var el = document.getElementById('tst');
  if (!el) return;
  el.innerHTML = msg;
  el.className = 'tst sh ' + (t || '');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = 'tst'; }, 6000);
}

export function parseNotesToTimeline(notesText) {
  if (!notesText || !notesText.trim()) return [];
  var entries = [];
  var stampRe = /^\[([^\]]+)\]\s*/;
  var lines = notesText.split(/\r?\n/);
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(stampRe);
    if (m) {
      if (current) entries.push(current);
      var stampContent = m[1];
      var rest = line.slice(m[0].length);
      var parts = stampContent.split('|').map(function (s) { return s.trim(); });
      var timeLabel = parts[0] || '';
      var user = parts[1] || 'Unknown';
      current = { type: 'note', timeLabel: timeLabel, user: user, text: rest, stageAtTime: '' };
    } else if (current) {
      current.text += '\n' + line;
    } else if (line.trim()) {
      current = { type: 'note', timeLabel: '', user: '', text: line, stageAtTime: '' };
    }
  }
  if (current) entries.push(current);
  entries.forEach(function (e) { e.text = (e.text || '').trim(); });
  return entries.filter(function (e) { return e.text.length > 0; });
}

export function buildMergedTimeline(stageHist, noteEntries) {
  var items = [];
  stageHist.forEach(function (h) {
    var ts = new Date(h.ts).getTime();
    if (isNaN(ts)) ts = 0;
    items.push({ type: 'stage', ts: ts, tsRaw: h.ts, stage: h.stage, by: h.by || '' });
  });
  noteEntries.forEach(function (n) {
    var ts = 0;
    if (n.timeLabel) {
      var parsed = new Date(n.timeLabel + ' ' + (new Date().getFullYear()));
      if (!isNaN(parsed.getTime())) ts = parsed.getTime();
    }
    items.push({ type: 'note', ts: ts, timeLabel: n.timeLabel, user: n.user, text: n.text, stageAtTime: '' });
  });
  items.sort(function (a, b) {
    if (a.ts === 0 && b.ts === 0) return 0;
    if (a.ts === 0) return -1;
    if (b.ts === 0) return 1;
    return a.ts - b.ts;
  });
  var lastStage = '';
  for (var i = 0; i < items.length; i++) {
    if (items[i].type === 'stage') { lastStage = items[i].stage; }
    else if (items[i].type === 'note') { items[i].stageAtTime = lastStage; }
  }
  return items;
}

export function computePaySt(amt, paid) {
  if (amt <= 0) return 'Unpaid';
  if (paid >= amt) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
}

export function parseCSV(text) {
  var rows = [], cur = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { cur.push(field.trim()); field = ''; }
      else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
        if (c === '\r') i++;
        cur.push(field.trim());
        if (cur.some(function (v) { return v.length > 0; })) rows.push(cur);
        cur = []; field = '';
      } else { field += c; }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field.trim());
    if (cur.some(function (v) { return v.length > 0; })) rows.push(cur);
  }
  return rows;
}

export function autoMap(headers, QF) {
  var m = {};
  QF.forEach(function (f) {
    var found = null;
    headers.forEach(function (hh) {
      if (!found && f.h.some(function (hint) {
        return hh.toLowerCase().replace(/[^a-z0-9]/g, '').indexOf(hint.replace(/[^a-z0-9]/g, '')) >= 0;
      })) found = hh;
    });
    m[f.k] = found || '__skip__';
  });
  return m;
}

export function toDirectUrl(url) {
  if (!url) return '';
  var u = url.trim();
  if (u.indexOf('api.onedrive.com') >= 0 || u.indexOf('download=1') >= 0) return u;
  try {
    var b64 = btoa(u).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return 'https://api.onedrive.com/v1.0/shares/u!' + b64 + '/root/content';
  } catch (e) { return u; }
}
