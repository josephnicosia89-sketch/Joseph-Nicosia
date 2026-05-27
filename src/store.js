import { STORE_KEY, AUDIT_KEY, CL_DEF, STAGES } from './constants.js';
import seedData from './seed-data.json';

const _mem = {};

export function _set(k, v) {
  _mem[k] = v;
  try { localStorage.setItem(k, v); } catch (e) { /* quota */ }
}

export function _get(k) {
  if (_mem[k] !== undefined) return _mem[k];
  try {
    var v = localStorage.getItem(k);
    if (v !== null) { _mem[k] = v; return v; }
  } catch (e) { /* private */ }
  return null;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function newOrder(ov) {
  return Object.assign({
    id: uid(), so: '', make: '', model: '', type: '',
    customer: '', phone: '', dest: '', rep: '', date: '', deliverBy: '',
    stage: 'Intake queue',
    stageHistory: [{ stage: 'Intake queue', ts: new Date().toISOString() }],
    checklist: JSON.parse(JSON.stringify(CL_DEF)),
    bol: null, bolName: null, bolNumber: '',
    woPdf: null, woPdfName: null,
    deliveryType: '', shippingStatus: 'Pending', paymentStatus: 'Unpaid',
    depositRequired: 0, depositReceived: 0, notes: '',
    paymentMethod: '', amountPaid: 0, balanceDue: 0,
    rowVersion: 1, updatedBy: '', lockUser: '', lockTime: null,
    created: new Date().toISOString()
  }, ov || {});
}

export let orders = [];

export function setOrders(arr) { orders = arr; }

export function save() {
  try { _set(STORE_KEY, JSON.stringify(orders)); } catch (e) { console.warn('Save failed:', e.message); }
}

export function getO(id) {
  return orders.find(function (x) { return x.id === id; });
}

function purgeOldKeys() {
  ['stq6', 'stq7', 'stq8', 'stq_final', 'stq_v1', 'stq_v2', 'stq_v3', 'stq_v4', 'stq_v5'].forEach(function (k) {
    try { localStorage.removeItem(k); } catch (e) { /* */ }
  });
  delete _mem['stq6']; delete _mem['stq7']; delete _mem['stq8'];
}

function ensureOrder(o) {
  if (!o.checklist || !Array.isArray(o.checklist) || o.checklist.length < 10) o.checklist = JSON.parse(JSON.stringify(CL_DEF));
  if (!o.stageHistory || !Array.isArray(o.stageHistory)) o.stageHistory = [{ stage: o.stage || 'Intake queue', ts: new Date().toISOString() }];
  if (!o.stage) o.stage = 'Intake queue';
  if (!o.shippingStatus) o.shippingStatus = 'Pending';
  if (!o.paymentStatus) o.paymentStatus = 'Unpaid';
  if (!o.id) o.id = uid();
  return o;
}

export function seed() {
  var stmap = {
    'In Production': 'Intake queue', 'Service': 'Mechanics shop',
    'Hold for Confirm': 'Intake queue', 'In Transit': 'Shipped',
    'In Storage/On Rental': 'Awaiting pickup', 'Vault': 'Intake queue'
  };
  orders = seedData.map(function (r) {
    var stage = stmap[r.inworkStatus || ''] || r.stage || 'Intake queue';
    var dt = r.deliveryType || '';
    if (!dt && r.shipMethod) {
      var sm = (r.shipMethod || '').toLowerCase();
      if (sm.indexOf('empire') >= 0 || sm.indexOf('field') >= 0 || sm.indexOf('pick') >= 0) dt = 'Local Delivery';
      else if (sm.indexOf('abf') >= 0 || sm.indexOf('ups') >= 0 || sm.indexOf('daylight') >= 0) dt = 'Ship Out';
    }
    return newOrder({
      so: String(r.so), make: r.make || 'Empire Safe', model: r.model || '',
      type: r.type || '', customer: r.customer || '', rep: r.rep || '',
      date: r.date || '', deliverBy: r.deliverBy || '',
      paymentStatus: r.paymentStatus || 'Unpaid', paymentMethod: r.paymentMethod || '',
      amountPaid: parseFloat(r.amountPaid) || 0, balanceDue: parseFloat(r.balanceDue) || 0,
      depositRequired: parseFloat(r.depositRequired) || 0,
      depositReceived: parseFloat(r.depositReceived) || 0,
      deliveryType: dt, stage: stage,
      shippingStatus: stage === 'Shipped' || stage === 'Completed' ? 'Delivered' : 'Pending',
      notes: r.notes || ''
    });
  });
  save();
}

export function loadO() {
  orders = [];
  purgeOldKeys();
  try {
    var raw = _get(STORE_KEY);
    if (raw && raw.length > 10) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && parsed[0].so) {
        orders = parsed.map(ensureOrder);
      }
    }
  } catch (e) {
    console.warn('loadO: bad localStorage data, clearing and re-seeding. Error:', e.message);
    try { localStorage.removeItem(STORE_KEY); } catch (e2) { /* */ }
    delete _mem[STORE_KEY];
    orders = [];
  }
  if (!orders.length) seed();
}

// ── Audit Log ──
let _auditLog = [];

export function loadAudit() {
  try { var r = localStorage.getItem(AUDIT_KEY); if (r) _auditLog = JSON.parse(r) || []; } catch (e) { _auditLog = []; }
}

export function saveAudit() {
  try {
    if (_auditLog.length > 500) _auditLog = _auditLog.slice(_auditLog.length - 500);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(_auditLog));
  } catch (e) { /* */ }
}

export function writeAudit(so, action, detail) {
  _auditLog.unshift({ ts: new Date().toISOString(), user: getCurrentUser(), so: so || '', action: action || '', detail: detail || '' });
  saveAudit();
}

export function getAuditLog() { return _auditLog; }

// ── User ──
export function getCurrentUser() {
  var u = null;
  try { u = localStorage.getItem('stq_username'); } catch (e) { /* */ }
  return u || 'SafeTech';
}

export function setCurrentUser(n) {
  try { localStorage.setItem('stq_username', n); } catch (e) { /* */ }
}

// ── Row versioning & locking ──
export function bumpVersion(o) {
  o.rowVersion = (o.rowVersion || 0) + 1;
  o.updatedBy = getCurrentUser();
  o.lastUpdated = new Date().toISOString();
}

var LOCK_MS = 30 * 60 * 1000;
export function acquireLock(o) {
  if (o.lockUser && o.lockUser !== '' && o.lockUser !== getCurrentUser()) {
    var el = Date.now() - new Date(o.lockTime || 0).getTime();
    if (el < LOCK_MS) return { ok: false, msg: 'Currently being edited by ' + o.lockUser + '. Try in a few minutes.' };
  }
  o.lockUser = getCurrentUser();
  o.lockTime = new Date().toISOString();
  return { ok: true };
}

export function releaseLock(o) {
  o.lockUser = '';
  o.lockTime = null;
}

export function appendNote(o, newText) {
  if (!newText || !newText.trim()) return;
  var stamp = '[' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' | ' + getCurrentUser() + '] ';
  if (!o.notes || !o.notes.trim()) { o.notes = stamp + newText.trim(); }
  else { o.notes = o.notes + '\n' + stamp + newText.trim(); }
}

export function saveWithAudit(o, action, detail) {
  bumpVersion(o); releaseLock(o); writeAudit(o.so, action, detail); save();
}

// ── Deposit ──
export function computeDepositStatus(req, rec) {
  var r = parseFloat(req) || 0, e = parseFloat(rec) || 0;
  if (r <= 0) return 'Check Required';
  if (e <= 0) return 'No Deposit';
  if (e < r) return 'Partial Deposit';
  return 'Deposit OK';
}

export function depositBadgeClass(s) {
  if (s === 'Deposit OK') return 'dep-ok';
  if (s === 'Partial Deposit') return 'dep-part';
  if (s === 'No Deposit') return 'dep-no';
  return 'dep-chk';
}

// ── Dedupe ──
function scoreO(o) {
  var s = 0;
  var si = STAGES.indexOf(o.stage);
  if (si > 0) s += si * 10;
  if (o.checklist) s += o.checklist.filter(function (c) { return c.done; }).length;
  if (o.notes && o.notes.trim()) s += 5;
  if (o.bol) s += 10;
  if (o.woPdf) s += 10;
  if (o.bolNumber) s += 3;
  if (o.stageHistory && o.stageHistory.length > 1) s += o.stageHistory.length * 2;
  return s;
}

function mergeO(dst, src) {
  ['notes', 'bol', 'bolName', 'bolNumber', 'woPdf', 'woPdfName', 'phone', 'dest'].forEach(function (k) {
    if (src[k] && !dst[k]) dst[k] = src[k];
  });
  if (src.checklist && dst.checklist) {
    src.checklist.forEach(function (sc, i) { if (sc.done && dst.checklist[i]) dst.checklist[i].done = true; });
  }
  if (src.stageHistory && dst.stageHistory && src.stageHistory.length > dst.stageHistory.length) {
    dst.stageHistory = src.stageHistory; dst.stage = src.stage;
  }
  return dst;
}

export function dedupe(silent) {
  var seen = {}, keep = [];
  orders.forEach(function (o) {
    var so = o.so;
    if (!seen[so]) { seen[so] = { order: o, idx: keep.length }; keep.push(o); }
    else {
      var ex = seen[so].order;
      if (scoreO(o) > scoreO(ex)) { mergeO(o, ex); keep[seen[so].idx] = o; seen[so].order = o; }
      else { mergeO(ex, o); }
    }
  });
  var removed = orders.length - keep.length;
  orders = keep;
  save();
  return removed;
}

export function resetData() {
  ['stq6', 'stq7', 'stq8', 'stq_final', 'stq_q1', STORE_KEY].forEach(function (k) {
    try { localStorage.removeItem(k); } catch (e) { /* */ }
  });
  Object.keys(_mem).forEach(function (k) { delete _mem[k]; });
  orders = [];
  seed();
}
