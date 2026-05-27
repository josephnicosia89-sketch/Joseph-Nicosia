import { STAGES, SCOL, SHIPS, SHIPCLS, PAYS, PAYCLS, PAYICON, QF, CL_DEF } from './constants.js';
import {
  orders, setOrders, save, getO, newOrder, loadO, loadAudit, dedupe, seed,
  getCurrentUser, setCurrentUser, acquireLock, releaseLock,
  appendNote, saveWithAudit, writeAudit, getAuditLog,
  computeDepositStatus, depositBadgeClass, resetData as storeReset
} from './store.js';
import {
  fmtD, fmtTs, escapeHTML, toast, parseNotesToTimeline,
  buildMergedTimeline, computePaySt, parseCSV, autoMap, toDirectUrl
} from './utils.js';

let flt = { tp: '', vl: '' };
let selId = null;
let xlR = [], xlH = [], xlM = {};

// ── Stats ──
function rStats() {
  var active = orders.filter(function (o) { return o.stage !== 'Completed'; });
  var prod = active.filter(function (o) { return ['Mechanics shop', 'Paint booth', 'Drying station'].indexOf(o.stage) >= 0; });
  var ready = active.filter(function (o) { return ['Packaging', 'Loading dock', 'Awaiting pickup'].indexOf(o.stage) >= 0; });
  var shipped = active.filter(function (o) { return o.stage === 'Shipped'; });
  document.getElementById('st-t').textContent = orders.length;
  document.getElementById('st-p').textContent = prod.length;
  document.getElementById('st-r').textContent = ready.length;
  document.getElementById('st-s').textContent = shipped.length;
}

// ── Sidebar ──
function rSidebar() {
  var active = orders.filter(function (o) { return o.stage !== 'Completed'; });
  var comp = orders.filter(function (o) { return o.stage === 'Completed'; });
  document.getElementById('cnt-all').textContent = orders.length;
  var stNav = document.getElementById('stNav');
  stNav.innerHTML = '';
  STAGES.forEach(function (s) {
    var c = orders.filter(function (o) { return o.stage === s; }).length;
    var sc = SCOL[s] || { d: '#888' };
    var div = document.createElement('div');
    div.className = 'sbi' + (flt.tp === 'stage' && flt.vl === s ? ' act' : '');
    div.dataset.f = 'stage'; div.dataset.v = s;
    div.innerHTML = '<span style="display:flex;align-items:center;gap:6px"><span class="sdot" style="background:' + sc.d + '"></span>' + s + '</span><span class="scnt">' + c + '</span>';
    stNav.appendChild(div);
  });
  document.getElementById('scnt-all').textContent = orders.length;
  var shNav = document.getElementById('shNav');
  shNav.innerHTML = '';
  SHIPS.forEach(function (s) {
    var c = orders.filter(function (o) { return o.shippingStatus === s; }).length;
    var div = document.createElement('div');
    div.className = 'sbi' + (flt.tp === 'ship' && flt.vl === s ? ' act' : '');
    div.dataset.f = 'ship'; div.dataset.v = s;
    div.innerHTML = '<span style="display:flex;align-items:center;gap:6px"><span class="sdot" style="background:var(--mid)"></span>' + s + '</span><span class="scnt">' + c + '</span>';
    shNav.appendChild(div);
  });
  document.getElementById('pcnt-all').textContent = orders.length;
  var payNav = document.getElementById('payNav');
  payNav.innerHTML = '';
  PAYS.forEach(function (s) {
    var c = orders.filter(function (o) { return (o.paymentStatus || 'Unpaid') === s; }).length;
    var div = document.createElement('div');
    div.className = 'sbi' + (flt.tp === 'pay' && flt.vl === s ? ' act' : '');
    div.dataset.f = 'pay'; div.dataset.v = s;
    div.innerHTML = '<span style="display:flex;align-items:center;gap:6px"><span class="sdot" style="background:var(--mid)"></span>' + s + '</span><span class="scnt">' + c + '</span>';
    payNav.appendChild(div);
  });
  document.getElementById('cnt-comp').textContent = comp.length;
  document.getElementById('st-iq').textContent = orders.filter(function (o) { return o.stage === 'Intake queue'; }).length;
  document.getElementById('tdy').textContent = orders.filter(function (o) { return o.date === new Date().toISOString().slice(0, 10); }).length;
  var cycles = orders.filter(function (o) { return o.stage === 'Completed' && o.created; }).map(function (o) {
    return (Date.now() - new Date(o.created).getTime()) / 86400000;
  });
  document.getElementById('avg').textContent = cycles.length ? (cycles.reduce(function (a, b) { return a + b; }, 0) / cycles.length).toFixed(1) + 'd' : '--';
}

// ── Table ──
export function rTbl() {
  var q = (document.getElementById('srch').value || '').toLowerCase();
  var srt = document.getElementById('srt').value;
  var list = orders.filter(function (o) {
    if (flt.tp === 'completed') { if (o.stage !== 'Completed') return false; }
    else { if (o.stage === 'Completed') return false; }
    if (flt.tp === 'stage' && o.stage !== flt.vl) return false;
    if (flt.tp === 'ship' && o.shippingStatus !== flt.vl) return false;
    if (flt.tp === 'pay' && (o.paymentStatus || 'Unpaid') !== flt.vl) return false;
    if (q) {
      var hay = [o.so, o.make, o.model, o.type, o.customer, o.rep, o.dest, o.bolNumber || '', o.deliverBy].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  list.sort(function (a, b) {
    if (srt === 'new') return new Date(b.created) - new Date(a.created);
    if (srt === 'old') return new Date(a.created) - new Date(b.created);
    if (srt === 'stg') return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);
    if (srt === 'so') return a.so.localeCompare(b.so);
    if (srt === 'dby') {
      var ad = a.deliverBy && ['TBD', 'TBA', ''].indexOf(a.deliverBy) < 0 ? a.deliverBy : 'z';
      var bd = b.deliverBy && ['TBD', 'TBA', ''].indexOf(b.deliverBy) < 0 ? b.deliverBy : 'z';
      return ad.localeCompare(bd);
    }
    return 0;
  });
  document.getElementById('rcnt').textContent = list.length + ' order' + (list.length !== 1 ? 's' : '');
  var tb = document.getElementById('tb'), em = document.getElementById('emp');
  if (!list.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  var frag = document.createDocumentFragment();
  list.forEach(function (o) {
    var sc = SCOL[o.stage] || { d: '#888', bg: 'transparent', t: '#888' };
    var sh = SHIPCLS[o.shippingStatus] || 'ship-p';
    var pm = o.paymentStatus || 'Unpaid';
    var pc = PAYCLS[pm] || 'pay-unp';
    var pi = PAYICON[pm] || '?';
    var clDone = o.checklist ? o.checklist.filter(function (c) { return c.done; }).length : 0;
    var clTot = o.checklist ? o.checklist.length : 0;
    var clPct = clTot ? Math.round(clDone / clTot * 100) : 0;
    var dbc = o.deliverBy && ['TBD', 'TBA', ''].indexOf(o.deliverBy) < 0 ? 'dby-hi' : 'dby-lo';
    var tr = document.createElement('tr');
    tr.dataset.oid = o.id;
    if (selId === o.id) tr.className = 'sel';
    var stB = '<span class="badge" style="background:' + sc.bg + ';color:' + sc.t + '"><span class="dot" style="background:' + sc.d + '"></span>' + o.stage + '</span>';
    if (clPct > 0 && clPct < 100) stB += '<span style="font-size:9px;color:var(--gry);margin-left:4px">' + clPct + '%</span>';
    if (clPct === 100) stB += '<span style="font-size:9px;color:#5ed49a;margin-left:4px">&#10003;</span>';
    var dt = o.deliveryType || '';
    var dtCls = dt === 'Local Delivery' ? 'dt-local' : dt === 'Ship Out' ? 'dt-ship' : 'dt-none';
    var dtLabel = dt || '&mdash;';
    var isComp = o.stage === 'Completed';
    var compBtn = isComp
      ? '<button class="btn btn-s" style="font-size:9px;padding:2px 6px;color:#3fffaa;border-color:rgba(32,184,110,.3);background:rgba(32,184,110,.1)" data-reopen="' + o.id + '">Reopen</button>'
      : '<button class="btn btn-s" style="font-size:9px;padding:2px 6px;color:#3fffaa;border-color:rgba(32,184,110,.3);background:rgba(32,184,110,.1)" data-complete="' + o.id + '">&#10003; Complete</button>';
    if (isComp) tr.className = 'comp-row';
    tr.innerHTML = '<td><span class="sonum">' + o.so + '</span></td><td><div class="mm">' + o.make + '<span>' + o.model + '</span></div></td><td><div style="font-weight:500">' + (o.customer || '&mdash;') + '</div><div style="font-size:9px;color:var(--gry)">' + (o.dest || '') + '</div></td><td style="color:var(--gry)">' + (o.rep || '&mdash;') + '</td><td style="font-family:var(--mono);font-size:10px;color:var(--lt)">' + fmtD(o.date) + '</td><td><span class="' + dbc + '" style="font-family:var(--mono);font-size:10px">' + (o.deliverBy || 'TBD') + '</span></td><td>' + stB + '</td><td><span class="badge ' + dtCls + '">' + dtLabel + '</span></td><td><span class="badge ' + sh + '">' + (o.shippingStatus || 'Pending') + '</span></td><td><span class="badge ' + pc + '">' + pi + ' ' + pm + '</span></td><td style="white-space:nowrap;display:flex;gap:3px;align-items:center">' + compBtn + '<button class="btn btn-gh btn-s btn-d" data-del="' + o.id + '">&#10005;</button></td>';
    frag.appendChild(tr);
  });
  tb.innerHTML = '';
  tb.appendChild(frag);
}

export function rAll() { rStats(); rSidebar(); rTbl(); if (selId) { var o = getO(selId); if (o) rDet(o); else closeDet(); } }

export function setF(tp, vl) { flt = { tp: tp, vl: vl }; rAll(); }

function saveOpenNotes() {
  if (!selId) return;
  var o = getO(selId);
  if (!o) return;
  var el = document.getElementById('nf_' + selId);
  if (!el) return;
  var typed = el.value.trim();
  var existing = (o.notes || '').trim();
  if (typed === '' || typed === existing) return;
  var lock = acquireLock(o);
  if (!lock.ok) return;
  if (existing === '') { o.notes = typed; }
  else if (typed.indexOf(existing) === 0 && typed.length > existing.length) {
    var added = typed.slice(existing.length).trim();
    if (added) appendNote(o, added);
    else { releaseLock(o); return; }
  } else { o.notes = typed; }
  saveWithAudit(o, 'Notes auto-saved', 'Notes captured on panel close for SO-' + o.so);
}

function closeDet() { saveOpenNotes(); selId = null; var d = document.getElementById('det'); if (d) d.style.display = 'none'; rTbl(); }

function selO(id) { saveOpenNotes(); selId = id; var o = getO(id); if (o) { rDet(o); rTbl(); } }

function makeDZ(type, oid, title, sub) {
  var dz = document.createElement('div');
  dz.className = 'dz';
  dz.innerHTML = '<input type="file" accept=".pdf,application/pdf"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-5m-2 2l2-2 2 2"/></svg><div style="font-weight:500;margin-top:3px">' + title + '</div><div style="font-size:9px;margin-top:2px">' + sub + '</div>';
  dz.querySelector('input').addEventListener('change', function (e) { if (e.target.files[0]) rdPDF(type, oid, e.target.files[0]); });
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('ov'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('ov'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault(); dz.classList.remove('ov');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (!f.type.includes('pdf') && !f.name.toLowerCase().endsWith('.pdf')) { toast('Please drop a PDF file', 'er'); return; }
    rdPDF(type, oid, f);
  });
  return dz;
}

function rdPDF(tp, id, file) {
  var rd = new FileReader();
  rd.onload = function (e) {
    var o = getO(id); if (!o) return;
    if (tp === 'bol') { o.bolName = file.name; o.bol = e.target.result; }
    else { o.woPdfName = file.name; o.woPdf = e.target.result; }
    save(); rAll(); rDet(o);
    toast('Uploaded: ' + file.name, 'ok');
  };
  rd.readAsDataURL(file);
}

function vPDF(tp, id) {
  var o = getO(id); if (!o) return;
  var d = tp === 'bol' ? o.bol : o.woPdf;
  if (!d) return;
  var w = window.open();
  w.document.write('<iframe src="' + d + '" style="width:100%;height:100vh;border:none"></iframe>');
}

function rPDF(tp, id) {
  var o = getO(id);
  if (!o || !confirm('Remove this document?')) return;
  if (tp === 'bol') { o.bol = null; o.bolName = null; }
  else { o.woPdf = null; o.woPdfName = null; }
  save(); rDet(o); toast('Document removed');
}

// ── Detail Panel ──
function rDet(o) {
  var si = STAGES.indexOf(o.stage);
  var sc = SCOL[o.stage] || { d: '#888', bg: 'transparent', t: '#888' };
  var pm = o.paymentStatus || 'Unpaid';
  var nxt = si < STAGES.length - 1 ? STAGES[si + 1] : null;
  var dbc = o.deliverBy && ['TBD', 'TBA', ''].indexOf(o.deliverBy) < 0 ? 'color:var(--acc)' : 'color:var(--gry)';
  saveOpenNotes();
  var det = document.getElementById('det');
  if (!det) return;
  det.innerHTML = '';

  // Header
  var dh = document.createElement('div'); dh.className = 'dh';
  var dhL = document.createElement('div'); dhL.style.flex = '1';
  dhL.innerHTML = '<div class="dso">' + o.so + '</div><div class="dmk">' + o.make + ' — ' + o.model + ' <span style="font-weight:300;color:var(--gry)">' + (o.type || '') + '</span></div><div class="dmt">Rep: ' + (o.rep || '—') + ' &nbsp;&middot;&nbsp; Ordered: ' + fmtD(o.date) + ' &nbsp;&middot;&nbsp; Deliver by: <span style="' + dbc + '">' + (o.deliverBy || 'TBD') + '</span> &nbsp;&middot;&nbsp; Customer: ' + (o.customer || '—') + '</div>';
  var dhR = document.createElement('div');
  dhR.style.cssText = 'display:flex;align-items:center;gap:7px';
  dhR.innerHTML = '<span class="badge" style="background:' + sc.bg + ';color:' + sc.t + ';font-size:10px;padding:4px 11px"><span class="dot" style="background:' + sc.d + '"></span>' + o.stage + '</span>';
  if (o.stage !== 'Completed') {
    var complBtn = document.createElement('button');
    complBtn.className = 'btn btn-s';
    complBtn.style.cssText = 'background:rgba(32,184,110,.15);border-color:rgba(32,184,110,.4);color:#3fffaa;font-weight:600';
    complBtn.innerHTML = '&#10003; Mark Complete';
    complBtn.dataset.complete = o.id;
    dhR.appendChild(complBtn);
  } else {
    var reopBtn = document.createElement('button');
    reopBtn.className = 'btn btn-s';
    reopBtn.style.cssText = 'background:rgba(232,160,32,.1);border-color:rgba(232,160,32,.3);color:var(--acc)';
    reopBtn.innerHTML = '&#8634; Reopen';
    reopBtn.dataset.reopen = o.id;
    dhR.appendChild(reopBtn);
  }
  var cb = document.createElement('button');
  cb.className = 'btn btn-gh btn-s'; cb.textContent = '✕ Close'; cb.onclick = closeDet;
  dhR.appendChild(cb);
  dh.appendChild(dhL); dh.appendChild(dhR); det.appendChild(dh);

  // Pipeline
  var pw = document.createElement('div');
  pw.style.cssText = 'padding:11px 15px;border-bottom:1px solid var(--brd)';
  pw.innerHTML = '<div style="font-size:9px;color:var(--gry);font-family:var(--mono);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Production Location — click any stage to update</div>';
  var pipe = document.createElement('div'); pipe.className = 'pipe';
  STAGES.forEach(function (s, i) {
    var ps = document.createElement('div');
    ps.className = 'ps' + (i < si ? ' dn' : i === si ? ' ac' : '');
    ps.dataset.stageId = o.id; ps.dataset.stageIdx = i;
    ps.innerHTML = '<span class="psn">' + String(i + 1).padStart(2, '0') + '</span>' + s;
    pipe.appendChild(ps);
  });
  pw.appendChild(pipe);
  var pa = document.createElement('div');
  pa.style.cssText = 'display:flex;gap:7px;margin-top:8px';
  if (nxt) {
    var ab = document.createElement('button');
    ab.className = 'btn btn-p btn-s'; ab.innerHTML = '&#8594; Move to: ' + nxt;
    ab.dataset.adv = o.id; pa.appendChild(ab);
  } else { pa.innerHTML = '<span style="color:#5ed49a;font-size:11px;font-weight:500">&#10003; Fully Shipped</span>'; }
  var pb = document.createElement('button');
  pb.className = 'btn btn-s'; pb.textContent = 'Print Order';
  pb.dataset.print = o.id; pa.appendChild(pb);
  pw.appendChild(pa); det.appendChild(pw);

  // Two columns
  var d2 = document.createElement('div'); d2.className = 'd2col'; det.appendChild(d2);
  var lc = document.createElement('div'); lc.className = 'dcol'; d2.appendChild(lc);

  var pmColors = { Paid: '#5ed49a', Partial: 'var(--acc)', Unpaid: '#ff8080', COD: '#7ab0e8' };
  var pmLabels = { Paid: '&#10003; Paid in full', Partial: '&#189; Partial payment', Unpaid: '&#9888; Payment required', COD: '$ Cash on delivery' };

  lc.innerHTML = '<div class="sh"><span class="sht">Order Details</span><span class="shl"></span></div><div class="fg3"><div class="fg"><div class="fl">Sales Order #</div><div class="fv" style="font-family:var(--mono);color:var(--acc)">' + o.so + '</div></div><div class="fg"><div class="fl">Make</div><div class="fv">' + o.make + '</div></div><div class="fg"><div class="fl">Model</div><div class="fv">' + o.model + '</div></div></div><div class="fg3"><div class="fg"><div class="fl">Type / Class</div><div class="fv">' + (o.type || '—') + '</div></div><div class="fg"><div class="fl">Date to Production</div><div class="fv" style="font-family:var(--mono);font-size:10px">' + fmtD(o.date) + '</div></div><div class="fg"><div class="fl">Deliver By</div><div class="fv" style="font-family:var(--mono);font-size:10px;' + dbc + '">' + (o.deliverBy || 'TBD') + '</div></div></div><div class="fg2"><div class="fg"><div class="fl">Customer Name</div><div class="fv">' + (o.customer || '—') + '</div></div><div class="fg"><div class="fl">Phone</div><div class="fv" style="font-family:var(--mono)">' + (o.phone || '—') + '</div></div></div><div class="fg"><div class="fl">Sales Rep</div><div class="fv">' + (o.rep || '—') + '</div></div><div class="fg"><div class="fl">Destination / Address</div><div class="fv">' + (o.dest || '—') + '</div></div>';

  // Payment select
  var pmDiv = document.createElement('div'); pmDiv.className = 'fg';
  pmDiv.innerHTML = '<div class="fl">Payment Status</div>';
  var pmRow = document.createElement('div');
  pmRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:3px';
  var pmSel = document.createElement('select');
  pmSel.className = 'fi'; pmSel.id = 'pms_' + o.id;
  pmSel.style.fontSize = '11px'; pmSel.style.borderColor = pmColors[pm] || '#ff8080';
  PAYS.forEach(function (s) {
    var opt = document.createElement('option'); opt.value = s; opt.textContent = s;
    if (s === pm) opt.selected = true; pmSel.appendChild(opt);
  });
  pmSel.addEventListener('change', function () { svPm(o.id); });
  var pmSp = document.createElement('span');
  pmSp.id = 'pml_' + o.id;
  pmSp.style.cssText = 'font-size:10px;font-weight:700;color:' + (pmColors[pm] || '#ff8080');
  pmSp.innerHTML = pmLabels[pm] || '';
  pmRow.appendChild(pmSel); pmRow.appendChild(pmSp);
  pmDiv.appendChild(pmRow); lc.appendChild(pmDiv);

  lc.innerHTML += '<div class="div-line"></div>';

  // Deposit section
  var depStatus = computeDepositStatus(o.depositRequired, o.depositReceived);
  var depCls = depositBadgeClass(depStatus);
  var depWrap = document.createElement('div');
  depWrap.className = 'fg3'; depWrap.style.marginBottom = '8px';
  depWrap.innerHTML = '<div class="fg"><div class="fl">Deposit Required ($)</div><input class="fi" id="dreq_' + o.id + '" type="number" value="' + (o.depositRequired || 0) + '" min="0" step="0.01" style="font-family:var(--mono)"></div><div class="fg"><div class="fl">Deposit Received ($)</div><input class="fi" id="drec_' + o.id + '" type="number" value="' + (o.depositReceived || 0) + '" min="0" step="0.01" style="font-family:var(--mono)"></div><div class="fg"><div class="fl">Deposit Status</div><div class="fv" id="depStat_' + o.id + '"><span class="badge ' + depCls + '">' + depStatus + '</span></div></div>';
  lc.appendChild(depWrap);
  setTimeout(function () {
    var dreq = document.getElementById('dreq_' + o.id);
    var drec = document.getElementById('drec_' + o.id);
    function updDep() {
      o.depositRequired = parseFloat(dreq ? dreq.value : 0) || 0;
      o.depositReceived = parseFloat(drec ? drec.value : 0) || 0;
      var ns = computeDepositStatus(o.depositRequired, o.depositReceived);
      var nc = depositBadgeClass(ns);
      var ds = document.getElementById('depStat_' + o.id);
      if (ds) ds.innerHTML = '<span class="badge ' + nc + '">' + ns + '</span>';
      saveWithAudit(o, 'Deposit updated', 'Req:$' + o.depositRequired + ' Rec:$' + o.depositReceived);
    }
    if (dreq) dreq.addEventListener('change', updDep);
    if (drec) drec.addEventListener('change', updDep);
  }, 0);

  // Version + audit
  var verWrap = document.createElement('div');
  verWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:9px;color:var(--gry);font-family:var(--mono)';
  verWrap.innerHTML = '<span>v' + (o.rowVersion || 1) + (o.updatedBy ? ' &middot; ' + o.updatedBy : '') + '</span><a onclick="window.__openAuditLog(' + JSON.stringify(o.so) + ')" style="color:#5ab0f8;cursor:pointer">&#128196; audit log</a>';
  lc.appendChild(verWrap);

  // Delivery Type
  var dtWrap = document.createElement('div'); dtWrap.className = 'fg';
  var dtColors = { 'Local Delivery': '#5ed49a', 'Ship Out': '#f0c060', '': 'var(--gry)' };
  var dtIcons = { 'Local Delivery': '&#128690; ', 'Ship Out': '&#9992; ', '': '' };
  dtWrap.innerHTML = '<div class="fl">Delivery Type</div>';
  var dtRow = document.createElement('div');
  dtRow.style.cssText = 'display:flex;gap:10px;margin-top:4px;flex-wrap:wrap';
  ['Local Delivery', 'Ship Out', ''].forEach(function (val) {
    var lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px';
    var inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'dt_' + o.id; inp.value = val;
    if ((o.deliveryType || '') === val) inp.checked = true;
    inp.addEventListener('change', function () { o.deliveryType = val; save(); rTbl(); toast((val || 'TBD') + ' saved', 'ok'); });
    var sp = document.createElement('span');
    sp.style.cssText = 'color:' + (dtColors[val] || 'var(--gry)') + ';font-weight:500';
    sp.innerHTML = val ? dtIcons[val] + val : 'TBD / Not set';
    lbl.appendChild(inp); lbl.appendChild(sp); dtRow.appendChild(lbl);
  });
  dtWrap.appendChild(dtRow); lc.appendChild(dtWrap);

  lc.innerHTML += '<div class="div-line"></div><div class="sh"><span class="sht">Notes / Special Instructions</span><span class="shl"></span></div>';

  // Notes
  var noteHdr = document.createElement('div');
  noteHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px';
  noteHdr.innerHTML = '<span style="font-size:9px;color:var(--gry);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px">Notes</span><span id="noteInd_' + o.id + '" style="display:none;font-size:9px;color:var(--acc);font-family:var(--mono)">&#9679; unsaved</span>';
  lc.appendChild(noteHdr);
  var nt = document.createElement('textarea');
  nt.className = 'fi'; nt.id = 'nf_' + o.id; nt.rows = 5; nt.value = o.notes || '';
  nt.placeholder = 'Type notes here... Click Save or press Ctrl+S to save. Notes are stamped with your name and time.';
  lc.appendChild(nt);
  var noteRow = document.createElement('div');
  noteRow.style.cssText = 'display:flex;gap:6px;margin-top:5px;align-items:center';
  var snb = document.createElement('button');
  snb.className = 'btn btn-g btn-s'; snb.id = 'saveNoteBtn_' + o.id;
  snb.innerHTML = '&#10003; Save Notes';
  snb.onclick = function () { svN(o.id); };
  var stampBtn = document.createElement('button');
  stampBtn.className = 'btn btn-s'; stampBtn.style.cssText = 'font-size:9px';
  stampBtn.innerHTML = '&#43; Add Stamped Note';
  stampBtn.title = 'Append a new note with your name and timestamp';
  stampBtn.onclick = function () {
    var ta = document.getElementById('nf_' + o.id); if (!ta) return;
    var stamp = '\n[' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' | ' + getCurrentUser() + '] ';
    ta.value = (ta.value || '').trimEnd() + stamp;
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  noteRow.appendChild(snb); noteRow.appendChild(stampBtn); lc.appendChild(noteRow);
  nt.addEventListener('blur', function () { var cur = nt.value.trim(); var existing = (o.notes || '').trim(); if (cur !== '' && cur !== existing) { svN(o.id); } });
  nt.addEventListener('input', function () { var ind = document.getElementById('noteInd_' + o.id); if (ind) ind.style.display = nt.value.trim() !== (o.notes || '').trim() ? 'inline' : 'none'; });
  nt.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); svN(o.id); } });

  lc.innerHTML += '<div class="div-line"></div>';

  // Timeline
  var noteEntries = parseNotesToTimeline(o.notes || '');
  var stageCount = (o.stageHistory || []).length;
  var shWrap = document.createElement('div');
  shWrap.className = 'sh stage-hdr';
  shWrap.innerHTML = '<span class="sht">Stage History &amp; Updates</span><span class="stage-count">' + stageCount + ' stage move' + (stageCount === 1 ? '' : 's') + ' &middot; ' + noteEntries.length + ' note' + (noteEntries.length === 1 ? '' : 's') + '</span>';
  lc.appendChild(shWrap);
  var tlDiv = document.createElement('div'); tlDiv.className = 'tl';
  var merged = buildMergedTimeline(o.stageHistory || [], noteEntries);
  if (merged.length === 0) {
    var empty = document.createElement('div');
    empty.style.cssText = 'padding:12px;text-align:center;color:var(--gry);font-size:10px;font-style:italic';
    empty.textContent = 'No stage changes or notes yet';
    tlDiv.appendChild(empty);
  } else {
    merged.forEach(function (entry, ei) {
      var last = ei === merged.length - 1;
      var item = document.createElement('div');
      if (entry.type === 'stage') {
        item.className = 'tli';
        item.innerHTML = '<div class="tld ' + (last ? 'ac' : 'dn') + '" style="background:' + (last ? 'var(--acc)' : 'var(--gry)') + '"></div><div style="flex:1"><div class="tls">&#9654; ' + entry.stage + '</div><div class="tlt">' + fmtTs(entry.ts) + (entry.by ? ' &middot; ' + entry.by : '') + '</div></div>';
      } else {
        item.className = 'tli-note';
        item.innerHTML = '<div class="tln-hdr"><span class="tln-icon">&#128221;</span><span class="tln-user">' + (entry.user || 'Unknown') + '</span><span class="tln-time">' + entry.timeLabel + '</span>' + (entry.stageAtTime ? '<span class="tln-stage">' + entry.stageAtTime + '</span>' : '') + '</div><div class="tln-text">' + escapeHTML(entry.text) + '</div>';
      }
      tlDiv.appendChild(item);
    });
  }
  lc.appendChild(tlDiv);

  // Right column — Checklist
  var rc = document.createElement('div'); rc.className = 'dcol'; d2.appendChild(rc);
  var cl = o.checklist || [];
  var clDone = cl.filter(function (c) { return c.done; }).length;
  var clPct = cl.length ? Math.round(clDone / cl.length * 100) : 0;
  rc.innerHTML = '<div class="sh"><span class="sht">Intake Checklist</span><span class="shl"></span></div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><span style="font-size:10px;color:var(--gry)">' + clDone + ' of ' + cl.length + ' complete</span><span style="font-size:10px;font-weight:700;color:' + (clPct === 100 ? '#5ed49a' : 'var(--acc)') + '">' + clPct + '%</span></div><div class="cpb"><div class="cpbf" style="width:' + clPct + '%"></div></div>';
  var clWrap = document.createElement('div');
  cl.forEach(function (c, i) {
    var item = document.createElement('div');
    item.className = 'cli' + (c.done ? ' chk' : '');
    item.dataset.cl = i; item.dataset.oid = o.id;
    item.innerHTML = '<div class="clcb">' + (c.done ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</div><span class="cll">' + c.label + '</span>';
    clWrap.appendChild(item);
  });
  rc.appendChild(clWrap);

  // Work Order PDF
  rc.innerHTML += '<div class="div-line"></div><div class="sh"><span class="sht">Work Order / Checklist Form PDF</span><span class="shl"></span></div>';
  if (o.woPdfName) {
    var woCard = document.createElement('div'); woCard.className = 'pdfa';
    woCard.innerHTML = '<div class="pdfi" style="background:#7ab0e8">WO</div><span class="pdfnm">' + o.woPdfName + '</span>';
    if (o.woPdf) { var vb = document.createElement('button'); vb.className = 'btn btn-g btn-s'; vb.textContent = 'View'; vb.dataset.vpdf = 'wo'; vb.dataset.oid = o.id; woCard.appendChild(vb); }
    var rb = document.createElement('button'); rb.className = 'btn btn-d btn-s'; rb.textContent = 'Remove'; rb.dataset.rpdf = 'wo'; rb.dataset.oid = o.id; woCard.appendChild(rb);
    rc.appendChild(woCard);
  }
  rc.appendChild(makeDZ('wo', o.id, o.woPdfName ? 'Replace Work Order PDF' : 'Drag & Drop Work Order PDF', 'or click to browse'));

  // Shipping & BOL
  rc.innerHTML += '<div class="div-line"></div><div class="sh"><span class="sht">Shipping &amp; BOL</span><span class="shl"></span></div>';
  var bolRow = document.createElement('div');
  bolRow.className = 'fg2'; bolRow.style.marginBottom = '10px';
  bolRow.innerHTML = '<div class="fr"><label class="flb">BOL Number</label><input class="fi" id="bn_' + o.id + '" value="' + (o.bolNumber || '') + '" placeholder="BOL-2026-XXXX"></div><div class="fr"><label class="flb">Shipping Status</label><select class="fi" id="shs_' + o.id + '">' + SHIPS.map(function (s) { return '<option' + (o.shippingStatus === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>';
  rc.appendChild(bolRow);
  setTimeout(function () {
    var bn = document.getElementById('bn_' + o.id);
    if (bn) bn.addEventListener('change', function () { svBN(o.id); });
    var sh = document.getElementById('shs_' + o.id);
    if (sh) sh.addEventListener('change', function () { svSh(o.id); });
  }, 0);
  if (o.bolName) {
    var bolCard = document.createElement('div'); bolCard.className = 'pdfa';
    bolCard.innerHTML = '<div class="pdfi" style="background:var(--acc)">BOL</div><span class="pdfnm">' + o.bolName + '</span>';
    if (o.bol) { var vb2 = document.createElement('button'); vb2.className = 'btn btn-g btn-s'; vb2.textContent = 'View'; vb2.dataset.vpdf = 'bol'; vb2.dataset.oid = o.id; bolCard.appendChild(vb2); }
    var rb2 = document.createElement('button'); rb2.className = 'btn btn-d btn-s'; rb2.textContent = 'Remove'; rb2.dataset.rpdf = 'bol'; rb2.dataset.oid = o.id; bolCard.appendChild(rb2);
    rc.appendChild(bolCard);
  }
  rc.appendChild(makeDZ('bol', o.id, o.bolName ? 'Replace BOL PDF' : 'Drag & Drop BOL PDF here', 'or click to browse'));

  det.style.display = 'block';
  if (det.scrollIntoView) det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Field savers ──
function svN(id) {
  var o = getO(id); if (!o) return;
  var el = document.getElementById('nf_' + id);
  var newText = el ? el.value : (o.notes || '');
  var trimNew = newText.trim();
  if (trimNew === '') { if (el && o.notes) el.value = o.notes; toast('Notes preserved — existing notes kept', 'ok'); return; }
  if (trimNew === (o.notes || '').trim()) { toast('No changes to save', 'ok'); return; }
  var lock = acquireLock(o);
  if (!lock.ok) { toast('&#9888; ' + lock.msg, 'er'); return; }
  var oldNotes = o.notes || '';
  if (oldNotes === '') { o.notes = newText.trim(); }
  else if (newText.indexOf(oldNotes) === 0 && newText.length > oldNotes.length) {
    var added = newText.slice(oldNotes.length).trim();
    if (added) appendNote(o, added); else { releaseLock(o); return; }
  } else { o.notes = newText; }
  saveWithAudit(o, 'Notes saved', 'SO-' + o.so);
  if (el) el.value = o.notes;
  var ind = document.getElementById('noteInd_' + id);
  if (ind) ind.style.display = 'none';
  toast('&#10003; Notes saved', 'ok');
}

function svBN(id) {
  var o = getO(id); if (!o) return;
  var el = document.getElementById('bn_' + id);
  if (el) { var prev = o.bolNumber; o.bolNumber = el.value; if (o.bolNumber !== prev) saveWithAudit(o, 'BOL number updated', o.bolNumber); }
}

function svSh(id) {
  var o = getO(id); if (!o) return;
  var el = document.getElementById('shs_' + id);
  if (el) { var prev = o.shippingStatus; o.shippingStatus = el.value; saveWithAudit(o, 'Shipping status', prev + ' > ' + o.shippingStatus); }
  rAll(); if (selId === o.id) rDet(o);
  toast('Status: ' + o.shippingStatus, 'ok');
}

function svPm(id) {
  var o = getO(id); if (!o) return;
  var el = document.getElementById('pms_' + id); if (!el) return;
  o.paymentStatus = el.value;
  var colors = { Paid: '#5ed49a', Partial: 'var(--acc)', Unpaid: '#ff8080', COD: '#7ab0e8' };
  var labels = { Paid: '&#10003; Paid in full', Partial: '&#189; Partial payment', Unpaid: '&#9888; Payment required', COD: '$ Cash on delivery' };
  el.style.borderColor = colors[o.paymentStatus] || '#ff8080';
  var lbl = document.getElementById('pml_' + id);
  if (lbl) { lbl.style.color = colors[o.paymentStatus]; lbl.innerHTML = labels[o.paymentStatus] || ''; }
  save(); rTbl(); toast('Payment: ' + o.paymentStatus, 'ok');
}

function togCL(id, idx) {
  var o = getO(id); if (!o) return;
  if (!o.checklist) o.checklist = JSON.parse(JSON.stringify(CL_DEF));
  o.checklist[idx].done = !o.checklist[idx].done;
  save(); rDet(o);
}

function advSt(id) {
  var o = getO(id); if (!o) return;
  var lock = acquireLock(o);
  if (!lock.ok) { toast('&#9888; ' + lock.msg, 'er'); return; }
  var si = STAGES.indexOf(o.stage);
  if (si < STAGES.length - 1) {
    var prev = o.stage; o.stage = STAGES[si + 1];
    o.stageHistory.push({ stage: o.stage, ts: new Date().toISOString(), by: getCurrentUser() });
    saveOpenNotes(); saveWithAudit(o, 'Stage advanced', prev + ' > ' + o.stage);
    rAll(); if (selId === o.id) rDet(o);
    toast('Moved to: ' + o.stage, 'ok');
  }
}

function setSt(id, idx) {
  var o = getO(id); if (!o) return;
  var lock = acquireLock(o);
  if (!lock.ok) { toast('&#9888; ' + lock.msg, 'er'); return; }
  var prev = o.stage; o.stage = STAGES[idx];
  o.stageHistory.push({ stage: o.stage, ts: new Date().toISOString(), by: getCurrentUser() });
  saveOpenNotes(); saveWithAudit(o, 'Stage set', prev + ' > ' + o.stage);
  rAll(); if (selId === o.id) rDet(o);
  toast('Stage: ' + o.stage, 'ok');
}

function delO(id) {
  var o = getO(id);
  if (!o || !confirm('Remove ' + o.so + ' — ' + (o.customer || o.make) + '?')) return;
  var idx = orders.indexOf(o);
  if (idx >= 0) orders.splice(idx, 1);
  if (selId === id) closeDet();
  save(); rAll(); toast('Order removed');
}

function completeO(id) {
  var o = getO(id); if (!o) return;
  if (!confirm('Mark SO-' + o.so + ' (' + (o.customer || o.make) + ') as Completed?\n\nThis moves it to the Completed tab.')) return;
  o.stage = 'Completed';
  o.stageHistory.push({ stage: 'Completed', ts: new Date().toISOString(), by: getCurrentUser() });
  o.shippingStatus = 'Delivered';
  saveWithAudit(o, 'Job completed', 'Marked complete by ' + getCurrentUser());
  if (selId === id) closeDet();
  rAll(); toast('&#10003; SO-' + o.so + ' moved to Completed', 'ok');
}

function reopenO(id) {
  var o = getO(id); if (!o) return;
  o.stage = 'Shipped';
  o.stageHistory.push({ stage: 'Shipped (Reopened)', ts: new Date().toISOString() });
  save(); rAll();
  toast('Order reopened — moved back to Shipped', 'ok');
}

// ── Add Order Modal ──
export function openAdd() {
  document.getElementById('addMod').classList.add('op');
  document.getElementById('a_dt').value = new Date().toISOString().slice(0, 10);
  var mkEl = document.getElementById('a_mk');
  if (mkEl && !mkEl.value) mkEl.value = 'Empire Safe';
  setTimeout(function () { document.getElementById('a_so').focus(); }, 100);
}

export function closeAdd() {
  document.getElementById('addMod').classList.remove('op');
  ['a_so', 'a_mk', 'a_mo', 'a_ty', 'a_cu', 'a_ph', 'a_db', 'a_ds', 'a_nt'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var repEl = document.getElementById('a_rp'); if (repEl) repEl.value = '';
  var def = document.querySelector('input[name="a_pm"][value="Unpaid"]'); if (def) def.checked = true;
  var defDt = document.querySelector('input[name="a_dt_type"][value=""]'); if (defDt) defDt.checked = true;
}

export function addOrder() {
  var so = document.getElementById('a_so').value.trim();
  if (!so) { toast('&#9888; Please enter the Sales Order # to continue', 'er'); document.getElementById('a_so').focus(); return; }
  var mk = document.getElementById('a_mk').value.trim() || 'Empire Safe';
  var mo = document.getElementById('a_mo').value.trim() || '(model TBD)';
  var pmEl = document.querySelector('input[name="a_pm"]:checked');
  orders.unshift(newOrder({
    so: so, make: mk, model: mo,
    type: document.getElementById('a_ty').value.trim(),
    customer: document.getElementById('a_cu').value.trim(),
    phone: document.getElementById('a_ph').value.trim(),
    dest: document.getElementById('a_ds').value.trim(),
    rep: document.getElementById('a_rp').value,
    date: document.getElementById('a_dt').value,
    deliverBy: document.getElementById('a_db').value.trim(),
    paymentStatus: pmEl ? pmEl.value : 'Unpaid',
    deliveryType: (function () { var dtEl = document.querySelector('input[name="a_dt_type"]:checked'); return dtEl ? dtEl.value : ''; })(),
    notes: document.getElementById('a_nt').value.trim()
  }));
  save(); closeAdd(); rAll();
  toast('&#10003; Order ' + so + ' added to Intake Queue — click it to add more details', 'ok');
}

// ── Export / Import ──
export function expCSV() {
  var cols = ['SO#', 'Make', 'Model', 'Type', 'Customer', 'Phone', 'Destination', 'Rep', 'Order Date', 'Deliver By', 'Stage', 'Ship Status', 'Payment', 'Amount Paid', 'Balance Due', 'Payment Method', 'BOL Number', 'Notes'];
  var clean = function (v) { return (v == null ? '' : v).toString().replace(/\r\n|\r|\n/g, ' ').replace(/\t/g, ' '); };
  var rows = orders.map(function (o) {
    return [o.so, o.make, o.model, o.type || '', o.customer || '', o.phone || '', o.dest || '', o.rep || '', o.date || '', o.deliverBy || '', o.stage, o.shippingStatus, o.paymentStatus || 'Unpaid', o.amountPaid || '', o.balanceDue || '', o.paymentMethod || '', o.bolNumber || '', o.notes || ''].map(function (v) { return '"' + clean(v).replace(/"/g, '""') + '"'; }).join(',');
  });
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([cols.join(',')].concat(rows).join('\n'));
  a.download = 'SafeTech_Queue_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click(); toast('CSV exported', 'ok');
}

export function shareQ() {
  var nm = prompt('Your name (for export label):', '');
  var p = { version: '3.0', exportedAt: new Date().toISOString(), exportedBy: nm || 'SafeTech', orders: orders };
  var a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(p, null, 2));
  a.download = 'SafeTech_Queue_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); toast('Queue exported', 'ok');
}

export function loadQ(inp) {
  var f = inp.files[0]; if (!f) return;
  var rd = new FileReader();
  rd.onload = function (e) {
    try {
      var p = JSON.parse(e.target.result);
      if (!p.orders || !Array.isArray(p.orders)) { toast('Invalid file', 'er'); return; }
      var inc = p.orders, exSOs = new Set(orders.map(function (o) { return o.so; }));
      var nw = inc.filter(function (o) { return !exSOs.has(o.so); });
      var up = inc.filter(function (o) { return exSOs.has(o.so); });
      var msg = inc.length + ' orders from ' + (p.exportedBy || 'teammate') + '. ' + nw.length + ' new, ' + up.length + ' exist.\n\nOK = Merge   Cancel = Replace all';
      if (confirm(msg)) {
        up.forEach(function (ni) { var idx = orders.findIndex(function (o) { return o.so === ni.so; }); if (idx >= 0) { if (!ni.bol && orders[idx].bol) ni.bol = orders[idx].bol; orders[idx] = ni; } });
        nw.forEach(function (o) { orders.unshift(o); });
        toast(nw.length + ' added · ' + up.length + ' updated', 'ok');
      } else {
        if (!confirm('Replace ALL ' + orders.length + ' orders?')) return;
        orders.length = 0;
        inc.forEach(function (o) { orders.push(o); });
        toast('Queue replaced', 'ok');
      }
      var d = dedupe(true);
      if (d > 0) toast(d + ' duplicates removed', 'ok');
      save(); rAll();
    } catch (err) { toast('Could not read file: ' + err.message, 'er'); }
    inp.value = '';
  };
  rd.readAsText(f);
}

export function prtO(id) {
  var o = getO(id); if (!o) return;
  var w = window.open('', '_blank');
  var sty = 'body{font-family:Arial,sans-serif;margin:32px;color:#111;font-size:12px}h1{font-size:18px;margin-bottom:3px}h2{font-size:12px;font-weight:700;margin:14px 0 5px;border-bottom:1px solid #ddd;padding-bottom:3px}.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 18px;margin-bottom:12px}.f label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:1px}.f span{font-weight:700}.notes{background:#f8f8f8;padding:8px;border-radius:3px}@media print{body{margin:16px}}';
  var bdy = '<h1>' + o.so + ' — ' + o.make + ' ' + o.model + '</h1><p style="color:#888;font-size:10px">' + (o.type || '') + ' · Printed: ' + new Date().toLocaleString() + '</p><h2>Order Information</h2><div class="g"><div class="f"><label>Sales Order #</label><span>' + o.so + '</span></div><div class="f"><label>Make</label><span>' + o.make + '</span></div><div class="f"><label>Model</label><span>' + o.model + '</span></div><div class="f"><label>Type</label><span>' + (o.type || '—') + '</span></div><div class="f"><label>Sales Rep</label><span>' + (o.rep || '—') + '</span></div><div class="f"><label>Date</label><span>' + (o.date || '—') + '</span></div></div><h2>Customer &amp; Delivery</h2><div class="g"><div class="f"><label>Customer</label><span>' + (o.customer || '—') + '</span></div><div class="f"><label>Phone</label><span>' + (o.phone || '—') + '</span></div><div class="f"><label>Deliver By</label><span>' + (o.deliverBy || 'TBD') + '</span></div></div><h2>Payment &amp; Shipping</h2><div class="g"><div class="f"><label>Payment</label><span>' + (o.paymentStatus || 'Unpaid') + '</span></div><div class="f"><label>Ship Status</label><span>' + (o.shippingStatus || '—') + '</span></div><div class="f"><label>BOL Number</label><span>' + (o.bolNumber || '—') + '</span></div></div><h2>Stage: ' + o.stage + '</h2>' + (o.stageHistory || []).map(function (h) { return '<div>• <strong>' + h.stage + '</strong> — ' + fmtTs(h.ts) + '</div>'; }).join('') + (o.notes ? '<h2>Notes</h2><div class="notes">' + o.notes + '</div>' : '');
  w.document.write('<!DOCTYPE html><html><head><title>' + o.so + '</title><style>' + sty + '</style></head><body>' + bdy + '</body></html>');
  w.document.close();
  setTimeout(function () { w.print(); }, 400);
}

// ── Excel/CSV Import ──
export function impXL(inp) {
  var f = inp.files[0]; if (!f) return;
  var isCSV = f.name.toLowerCase().endsWith('.csv');
  var go = function () {
    var rd = new FileReader();
    rd.onload = function (e) {
      try {
        var rows = [], hdrs = [];
        if (isCSV) {
          var lines = e.target.result.split(/\r?\n/).filter(function (l) { return l.trim(); });
          var pL = function (l) { var r = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var c = l[i]; if (c === '"') q = !q; else if (c === ',' && !q) { r.push(cur.trim()); cur = ''; } else cur += c; } r.push(cur.trim()); return r; };
          hdrs = pL(lines[0]).map(function (h) { return h.replace(/^"|"$/g, '').trim(); });
          rows = lines.slice(1).map(function (l) { var v = pL(l); var o = {}; hdrs.forEach(function (h, i) { o[h] = (v[i] || '').replace(/^"|"$/g, '').trim(); }); return o; }).filter(function (r) { return Object.values(r).some(function (v) { return v; }); });
        } else if (typeof XLSX !== 'undefined') {
          var wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var data = XLSX.utils.sheet_to_json(ws, { raw: false, dateNF: 'yyyy-mm-dd' });
          if (!data.length) { toast('Spreadsheet empty', 'er'); return; }
          hdrs = Object.keys(data[0]); rows = data;
        } else { toast('Save Excel as CSV first then import', 'er'); inp.value = ''; return; }
        xlR = rows; xlH = hdrs; xlM = autoMap(hdrs, QF);
        rXLMod(f.name, rows.length);
        document.getElementById('xlMod').classList.add('op');
      } catch (err) { toast('Could not read: ' + err.message, 'er'); }
      inp.value = '';
    };
    isCSV ? rd.readAsText(f) : rd.readAsArrayBuffer(f);
  };
  if (!isCSV && typeof XLSX === 'undefined') {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = go;
    s.onerror = function () { toast('No internet. Save as CSV first.', 'er'); inp.value = ''; };
    document.head.appendChild(s);
  } else go();
}

function rXLMod(fn, cnt) {
  var op = function (sel) { return ['__skip__'].concat(xlH).map(function (h) { return '<option value="' + h + '"' + (sel === h ? ' selected' : '') + '>' + (h === '__skip__' ? '-- Skip --' : h) + '</option>'; }).join(''); };
  var html = '<div style="padding:8px 10px;background:rgba(42,157,92,.08);border:1px solid rgba(42,157,92,.2);border-radius:7px;font-size:11px;color:var(--lt);margin-bottom:12px"><strong style="color:#5ed49a">' + fn + '</strong> &mdash; ' + cnt + ' rows detected</div>';
  html += '<div style="overflow-x:auto;margin-bottom:11px"><table style="width:100%;border-collapse:collapse;font-size:10px;font-family:var(--mono)"><thead><tr style="background:var(--bg3)">';
  xlH.forEach(function (h) { html += '<th style="padding:4px 8px;text-align:left;color:var(--gry);border-bottom:1px solid var(--brd);white-space:nowrap">' + h + '</th>'; });
  html += '</tr></thead><tbody>';
  xlR.slice(0, 3).forEach(function (r) { html += '<tr>'; xlH.forEach(function (h) { html += '<td style="padding:3px 8px;color:var(--lt);white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis">' + (r[h] || '') + '</td>'; }); html += '</tr>'; });
  html += '</tbody></table></div><div style="font-size:10px;color:var(--gry);margin-bottom:8px">Map your columns. <span style="color:#ff8080">* required</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">';
  QF.forEach(function (f) {
    var mp = xlM[f.k], ok = mp && mp !== '__skip__';
    html += '<div style="padding:8px 10px;background:var(--bg);border:1px solid ' + (ok ? 'rgba(42,157,92,.3)' : f.r ? 'rgba(217,64,64,.2)' : 'var(--brd)') + ';border-radius:6px"><div style="font-size:9px;font-family:var(--mono);color:' + (f.r ? '#ff8080' : ok ? '#5ed49a' : 'var(--gry)') + ';margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">' + (f.r ? '* ' : '') + f.l + (ok ? ' ✓' : '') + '</div><select class="fi" id="xm_' + f.k + '" style="font-size:10px">' + op(mp || '__skip__') + '</select></div>';
  });
  html += '</div>';
  document.getElementById('xlBd').innerHTML = html;
}

export function closeXL() { document.getElementById('xlMod').classList.remove('op'); xlR = []; xlH = []; xlM = {}; }

export function doXL() {
  QF.forEach(function (f) { var el = document.getElementById('xm_' + f.k); xlM[f.k] = el ? el.value : '__skip__'; });
  var miss = QF.filter(function (f) { return f.r && xlM[f.k] === '__skip__'; });
  if (miss.length) { toast('Map required: ' + miss.map(function (f) { return f.l; }).join(', '), 'er'); return; }
  var added = 0, updated = 0, skipped = 0;
  var exSOs = new Map(orders.map(function (o) { return [o.so, o]; }));
  xlR.forEach(function (row) {
    var gv = function (k) { var col = xlM[k]; if (!col || col === '__skip__') return ''; return (row[col] || '').toString().trim(); };
    var so = gv('so'); if (!so) { skipped++; return; }
    var dv = gv('date'); if (dv) { var p = new Date(dv); if (!isNaN(p)) dv = p.toISOString().slice(0, 10); else dv = new Date().toISOString().slice(0, 10); } else dv = new Date().toISOString().slice(0, 10);
    if (exSOs.has(so)) {
      var ex = exSOs.get(so);
      ['make', 'model', 'type', 'customer', 'phone', 'dest', 'rep', 'deliverBy'].forEach(function (k) { var v = gv(k); if (v) ex[k] = v; });
      if (dv) ex.date = dv;
      if (gv('notes') && !ex.notes) ex.notes = gv('notes');
      updated++;
    } else {
      var fresh = newOrder({ so: so, make: gv('make') || 'Empire Safe', model: gv('model'), type: gv('type'), customer: gv('customer'), phone: gv('phone'), dest: gv('dest'), rep: gv('rep'), date: dv, deliverBy: gv('deliverBy'), notes: gv('notes') });
      orders.unshift(fresh); exSOs.set(so, fresh); added++;
    }
  });
  var dupes = dedupe(true);
  save(); closeXL(); rAll();
  toast([added && added + ' added', updated && updated + ' updated', skipped && skipped + ' skipped', dupes && dupes + ' duplicates removed'].filter(Boolean).join(' · '), 'ok');
}

// ── Audit Modal ──
export function openAuditLog(soFilter) {
  loadAudit();
  var entries = soFilter ? getAuditLog().filter(function (e) { return e.so === soFilter; }) : getAuditLog();
  var html = '<div style="max-height:400px;overflow-y:auto">';
  if (!entries.length) { html += '<div style="padding:20px;text-align:center;color:var(--gry)">No audit entries yet</div>'; }
  else {
    entries.slice(0, 200).forEach(function (e) {
      var d = new Date(e.ts);
      var ds = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      html += '<div class="audit-row"><span style="color:var(--gry);min-width:90px">' + ds + '</span>' + (e.so ? '<span style="color:var(--acc)">SO-' + e.so + '</span>' : '') + '<span style="color:var(--wht);flex:1">' + e.action + '</span>' + (e.detail ? '<span style="color:var(--gry)">' + e.detail + '</span>' : '') + '<span style="color:#5ab0f8;min-width:70px;text-align:right">' + e.user + '</span></div>';
    });
  }
  html += '</div>';
  var mod = document.getElementById('auditMod');
  var bd = document.getElementById('auditBd');
  var ttl = document.getElementById('auditTitle');
  if (ttl) ttl.textContent = soFilter ? 'Audit: SO-' + soFilter : 'Full Audit Log';
  if (bd) bd.innerHTML = html;
  if (mod) mod.classList.add('op');
}

export function closeAudit() { var m = document.getElementById('auditMod'); if (m) m.classList.remove('op'); }

export function exportAuditCSV() {
  var cols = ['Timestamp', 'User', 'SalesOrder', 'Action', 'Detail'];
  var rows = getAuditLog().map(function (e) { return [e.ts, e.user, e.so, e.action, e.detail].map(function (v) { return '"' + (v || '').toString().replace(/"/g, '""') + '"'; }).join(','); });
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([cols.join(',')].concat(rows).join('\n'));
  a.download = 'SafeTech_AuditLog_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click(); toast('Audit CSV exported', 'ok');
}

// ── User ──
export function promptSetUser() {
  var cur = getCurrentUser();
  var name = prompt('Your name (used in notes and audit trail):', cur === 'SafeTech' ? '' : cur);
  if (name && name.trim()) { setCurrentUser(name.trim()); updateUserLabel(); toast('Name set to: ' + name.trim(), 'ok'); }
}

function updateUserLabel() { var lbl = document.getElementById('userLabel'); if (lbl) lbl.textContent = getCurrentUser(); }

// ── Theme ──
export function togTheme() {
  var isLt = document.body.classList.toggle('lt');
  try { localStorage.setItem('stq_theme', isLt ? 'light' : 'dark'); } catch (e) { /* */ }
  var btn = document.getElementById('themeTgl');
  if (btn) btn.innerHTML = isLt ? '&#9728; Light Mode' : '&#9790; Dark Mode';
}

function loadTheme() {
  var saved = null;
  try { saved = localStorage.getItem('stq_theme'); } catch (e) { /* */ }
  if (saved === 'light') {
    document.body.classList.add('lt');
    var btn = document.getElementById('themeTgl');
    if (btn) btn.innerHTML = '&#9728; Light Mode';
  }
}

// ── OneDrive Sync ──
function getSyncUrl() { try { return localStorage.getItem('stq_sync_url') || ''; } catch (e) { return ''; } }
function setSyncUrl(u) { try { localStorage.setItem('stq_sync_url', u); } catch (e) { /* */ } }

export function openSync() {
  var url = getSyncUrl();
  var el = document.getElementById('syncUrl'); if (el) el.value = url || '';
  var box = document.getElementById('syncStatusBox');
  if (box) {
    if (url) { box.style.background = 'rgba(42,157,92,.1)'; box.style.borderColor = 'rgba(42,157,92,.25)'; box.innerHTML = '&#10003; Link saved. Click <strong>Pull New Orders</strong> to import.'; }
    else { box.style.background = 'rgba(74,111,165,.1)'; box.style.borderColor = 'rgba(74,111,165,.25)'; box.innerHTML = 'Not configured &mdash; paste your OneDrive link below.'; }
  }
  var log = document.getElementById('syncLog'); if (log) log.textContent = '';
  document.getElementById('syncMod').classList.add('op');
}

export function closeSync() { document.getElementById('syncMod').classList.remove('op'); }

export function svSyncUrl() {
  var el = document.getElementById('syncUrl');
  var url = el ? el.value.trim() : '';
  setSyncUrl(url);
  var box = document.getElementById('syncStatusBox');
  if (box) { box.style.background = 'rgba(42,157,92,.1)'; box.style.borderColor = 'rgba(42,157,92,.25)'; box.innerHTML = '&#10003; Link saved. Click <strong>Pull New Orders</strong> to sync.'; }
  toast('&#10003; OneDrive link saved', 'ok');
}

export function doSyncPull() {
  var urlEl = document.getElementById('syncUrl');
  var url = urlEl ? urlEl.value.trim() : getSyncUrl();
  if (!url) { toast('Paste your OneDrive sharing link first', 'er'); openSync(); return; }
  setSyncUrl(url);
  var log = document.getElementById('syncLog');
  var btn = document.getElementById('syncPullBtn');
  var setLog = function (msg, color) { if (log) log.innerHTML = '<span style="color:' + (color || 'var(--gry)') + '">' + msg + '</span>'; };
  var setBusy = function (busy) { if (btn) { btn.disabled = busy; btn.textContent = busy ? 'Pulling…' : 'Pull New Orders from OneDrive'; } };
  setBusy(true); setLog('Connecting to OneDrive…');
  var apiUrl = toDirectUrl(url);
  fetch(apiUrl, { method: 'GET', mode: 'cors', redirect: 'follow' })
    .then(function (r) { if (r.status === 302 || r.redirected) return r.text(); if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + r.statusText); return r.text(); })
    .then(function (text) {
      setBusy(false);
      if (!text || text.trim().length < 5) { setLog('Empty response from OneDrive', '#ff8080'); toast('No data received', 'er'); return; }
      var data = null; try { data = JSON.parse(text); } catch (e) { /* */ }
      if (data && data.orders && Array.isArray(data.orders)) { importSyncData(data.orders); return; }
      if (data && Array.isArray(data)) { importSyncData(data); return; }
      var rows = parseCSV(text);
      if (rows.length > 1) {
        var hdr = rows[0].map(function (h) { return h.toLowerCase().replace(/[^a-z0-9]/g, ''); });
        var si = hdr.indexOf('so'); if (si < 0) si = hdr.indexOf('sono'); if (si < 0) si = hdr.indexOf('salesorder'); if (si < 0) si = hdr.indexOf('ordernumber');
        if (si >= 0) {
          var imp = rows.slice(1).map(function (r) { var o = {}; hdr.forEach(function (h, i) { o[h] = r[i] || ''; }); return { so: r[si], make: o['make'] || o['manufacturer'] || 'Empire Safe', model: o['model'] || o['item'] || o['description'] || '', type: o['type'] || o['class'] || '', customer: o['customer'] || o['client'] || o['name'] || '', rep: o['rep'] || o['salesrep'] || o['salesperson'] || '', deliverBy: o['deliverby'] || o['duedate'] || o['deliverydate'] || '', notes: o['notes'] || o['comments'] || '' }; }).filter(function (o) { return o.so && o.so.length > 0; });
          if (imp.length > 0) { importSyncData(imp); return; }
        }
        setLog('Found spreadsheet data but couldn\'t find the Sales Order column.', '#ff8080');
      } else { setLog('Received unrecognized data format.', '#ff8080'); }
    })
    .catch(function (err) {
      setBusy(false);
      if (err.message === 'HTML_RESPONSE' || err.message.indexOf('CORS') >= 0 || err.message.indexOf('Failed to fetch') >= 0 || err.message.indexOf('NetworkError') >= 0 || err.message.indexOf('Load failed') >= 0) {
        setLog('<strong style="color:#ff8080">&#9888; CORS Error</strong> — OneDrive blocks direct browser requests.<br><br><strong>Fix:</strong> Download the file from OneDrive and drag it into <strong>Import Excel/CSV</strong> above.');
      } else { setLog('<strong style="color:#ff8080">Error:</strong> ' + err.message, '#ff8080'); }
    });
}

function importSyncData(incoming) {
  var log = document.getElementById('syncLog');
  var ex = new Set(orders.map(function (o) { return o.so; }));
  var added = 0, skip = 0;
  incoming.forEach(function (o) {
    if (!o.so || ex.has(String(o.so))) { skip++; return; }
    var stmap = { 'In Production': 'Intake queue', 'Service': 'Mechanics shop', 'Hold for Confirm': 'Intake queue', 'In Transit': 'Shipped', 'In Storage/On Rental': 'Awaiting pickup', 'Vault': 'Intake queue' };
    var mappedStage = stmap[o.status || o.inworkStatus || ''] || o.stage || 'Intake queue';
    var mappedDt = o.deliveryType || '';
    if (!mappedDt && o.shipMethod) { var sm = (o.shipMethod || '').toLowerCase(); if (sm.indexOf('empire') >= 0 || sm.indexOf('field') >= 0 || sm.indexOf('pick') >= 0) mappedDt = 'Local Delivery'; else if (sm.indexOf('abf') >= 0 || sm.indexOf('ups') >= 0 || sm.indexOf('daylight') >= 0) mappedDt = 'Ship Out'; }
    orders.unshift(newOrder({
      so: String(o.so), make: o.make || 'Empire Safe', model: o.model || o.memo || o.item || '', type: o.type || '', customer: o.customer || '', rep: o.rep || '',
      date: o.date || new Date().toISOString().slice(0, 10), deliverBy: o.deliverBy || o['del date'] || o['deliver by date'] || o.reqDate || '',
      paymentStatus: o.paymentStatus || computePaySt(parseFloat(o.total || o.amount || 0), parseFloat(o.paid || 0)),
      paymentMethod: o.paymentMethod || o['payment method'] || '', amountPaid: parseFloat(o.paid || o.amountPaid) || 0, balanceDue: parseFloat(o.balance || o.balanceDue) || 0,
      depositRequired: parseFloat(o.total || o.amount || o.depositRequired) || 0, depositReceived: parseFloat(o.paid || o.depositReceived) || 0,
      deliveryType: mappedDt, stage: mappedStage, shippingStatus: mappedStage === 'Shipped' ? 'Delivered' : 'Pending', notes: o.notes || ''
    }));
    ex.add(String(o.so)); added++;
  });
  var dupes = dedupe(true); save(); closeSync(); rAll();
  var msg = added + ' order' + (added !== 1 ? 's' : '') + ' imported' + (skip ? ' (' + skip + ' exist)' : '') + (dupes ? ', ' + dupes + ' dupes removed' : '');
  toast('&#10003; ' + msg, 'ok');
  if (log) log.textContent = msg;
}

// ── Reset ──
export function handleResetData() {
  if (!confirm('Clear ALL queue data and reload live orders from the Empire Safe Inwork Report?\n\nNotes, BOL docs, stage progress, and manually added orders will be lost.')) return;
  storeReset();
  selId = null;
  document.getElementById('det').style.display = 'none';
  rAll();
  toast('&#10003; Reset complete — Empire Safe orders loaded', 'ok');
}

// ── Global event delegation ──
document.addEventListener('click', function (e) {
  var el = e.target;
  var sbi = el.closest('.sbi[data-f]');
  if (sbi) { setF(sbi.dataset.f, sbi.dataset.v || ''); return; }
  var ps = el.closest('.ps[data-stage-id]');
  if (ps) { setSt(ps.dataset.stageId, parseInt(ps.dataset.stageIdx)); return; }
  var adv = el.closest('[data-adv]');
  if (adv) { advSt(adv.dataset.adv); return; }
  var prt = el.closest('[data-print]');
  if (prt) { prtO(prt.dataset.print); return; }
  var del = el.closest('[data-del]');
  if (del) { e.stopPropagation(); delO(del.dataset.del); return; }
  var comp = el.closest('[data-complete]');
  if (comp) { e.stopPropagation(); completeO(comp.dataset.complete); return; }
  var reop = el.closest('[data-reopen]');
  if (reop) { e.stopPropagation(); reopenO(reop.dataset.reopen); return; }
  var cli = el.closest('.cli[data-oid]');
  if (cli) { togCL(cli.dataset.oid, parseInt(cli.dataset.cl)); return; }
  var vpdf = el.closest('[data-vpdf]');
  if (vpdf) { vPDF(vpdf.dataset.vpdf, vpdf.dataset.oid); return; }
  var rpdf = el.closest('[data-rpdf]');
  if (rpdf) { rPDF(rpdf.dataset.rpdf, rpdf.dataset.oid); return; }
  var tr = el.closest('tr[data-oid]');
  if (tr && !el.closest('button') && !el.closest('select') && !el.closest('input')) { selO(tr.dataset.oid); return; }
});

// Clock
setInterval(function () {
  document.getElementById('clk').textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}, 1000);

// Auto-save
window.addEventListener('beforeunload', function () { saveOpenNotes(); });
document.addEventListener('visibilitychange', function () { if (document.hidden) saveOpenNotes(); });

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { saveOpenNotes(); closeDet(); document.getElementById('addMod').classList.remove('op'); document.getElementById('xlMod').classList.remove('op'); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openAdd(); }
});

// Expose for inline onclick in detail panel
window.__openAuditLog = openAuditLog;

// ── Boot ──
export function boot() {
  try { loadTheme(); } catch (e) { console.warn('theme error:', e.message); }
  try { loadAudit(); updateUserLabel(); } catch (e) { console.warn('audit:', e.message); }
  try { loadO(); } catch (e) {
    console.error('loadO threw:', e.message);
    try { localStorage.removeItem('stq_q1'); } catch (e2) { /* */ }
    orders.length = 0; try { seed(); } catch (e3) { console.error('seed also failed:', e3.message); }
  }
  try { rAll(); } catch (e) { console.error('rAll threw:', e.message); }
}
