// Parser for the "Sales Order Inwork Report" workbook (QuickBooks Desktop
// "Open Sales Orders by Customer" export, maintained by hand in Excel).
//
// The parser is header-driven: it finds the row that contains a Sales Order
// number column plus a customer column, maps every other column by fuzzy
// header match, and tracks the status section (In Production, Service, Hold
// for Confirm, In Transit, In Storage/On Rental, Vault) that each row sits in.

import fs from 'node:fs';
import XLSX from 'xlsx';
import {
  normKey, cellText, isBlank, nonEmptyCells, parseMoney, round2, toISODate,
  computePaySt, deliveryTypeFromShipMethod, truthy
} from './lib/util.js';

export const INWORK_STATUSES = ['In Production', 'Service', 'Hold for Confirm', 'In Transit', 'In Storage/On Rental', 'Vault', 'Completed'];

const STATUS_ALIASES = {
  inproduction: 'In Production', production: 'In Production',
  service: 'Service', svc: 'Service',
  holdforconfirm: 'Hold for Confirm', hold: 'Hold for Confirm', onhold: 'Hold for Confirm',
  intransit: 'In Transit', transit: 'In Transit', shipped: 'In Transit',
  instorageonrental: 'In Storage/On Rental', instorage: 'In Storage/On Rental', onrental: 'In Storage/On Rental', storage: 'In Storage/On Rental', rental: 'In Storage/On Rental',
  vault: 'Vault',
  completed: 'Completed', complete: 'Completed', done: 'Completed'
};

export function canonicalStatus(text) {
  const k = normKey(text);
  if (!k) return '';
  if (STATUS_ALIASES[k]) return STATUS_ALIASES[k];
  // "In Production (12)" style labels
  const stripped = k.replace(/\d+$/, '');
  return STATUS_ALIASES[stripped] || '';
}

// Column hints, checked exact-first then substring. Order matters for the
// substring pass (more specific keys claim their columns first).
const COLS = {
  deliverBy: ['deliverbydate', 'deliverby', 'deliveryby', 'duedate', 'deliverydate', 'deldate', 'requested'],
  onCalendar: ['oncalendar', 'calendar', 'scheduled'],
  so: ['num', 'so', 'sonum', 'sono', 'so#', 'salesorder', 'salesorder#', 'ordernumber', 'order#', 'ordernum'],
  customer: ['customername', 'customer', 'client', 'company', 'account', 'name'],
  date: ['date', 'sodate', 'orderdate', 'txndate'],
  item: ['item', 'model', 'itemdescription', 'description', 'product', 'memo'],
  amount: ['amount', 'total', 'sototal', 'ordertotal'],
  rep: ['rep', 'salesrep', 'salesperson'],
  paid: ['paid', 'amountpaid', 'deposit', 'depositreceived', 'received'],
  balance: ['balance', 'balancedue', 'openbalance', 'due'],
  shipVia: ['shipvia', 'shipmethod', 'shipping', 'ship', 'via'],
  paymentMethod: ['paymentmethod', 'paymethod', 'method', 'payment'],
  complete: ['complete', 'completed', 'done', 'closed'],
  notes: ['notes', 'comments', 'remarks']
};

export function mapColumns(headerRow) {
  const keys = headerRow.map(normKey);
  const map = {};
  const claimed = new Set();
  // exact pass
  for (const [col, hints] of Object.entries(COLS)) {
    for (const h of hints) {
      const i = keys.findIndex((k, idx) => k === h && !claimed.has(idx));
      if (i >= 0) { map[col] = i; claimed.add(i); break; }
    }
  }
  // substring pass
  for (const [col, hints] of Object.entries(COLS)) {
    if (map[col] != null) continue;
    for (const h of hints) {
      const i = keys.findIndex((k, idx) => k && !claimed.has(idx) && k.includes(h));
      if (i >= 0) { map[col] = i; claimed.add(i); break; }
    }
  }
  return map;
}

function isHeaderRow(row) {
  const keys = row.map(normKey);
  const hasSo = keys.some(k => COLS.so.includes(k));
  const hasCust = keys.some(k => COLS.customer.includes(k) || k.includes('customer'));
  return hasSo && hasCust;
}

/**
 * Parse one worksheet (array-of-arrays). Returns { orders, header, columns } or
 * null when the sheet has no recognisable header.
 */
export function parseInworkRows(rows, sheetName) {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (isHeaderRow(rows[i] || [])) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return null;
  const header = rows[headerIdx].map(cellText);
  const cols = mapColumns(header);

  // A status label sitting in the header row (e.g. column A = "In Production")
  // marks that column as the section column.
  let statusCol = -1;
  let currentStatus = '';
  header.forEach((h, i) => {
    if (statusCol < 0 && canonicalStatus(h) && !Object.values(cols).includes(i)) {
      statusCol = i; currentStatus = canonicalStatus(h);
    }
  });
  // Section labels above the header (e.g. "In Production" on row 1).
  for (let i = 0; i < headerIdx; i++) {
    const ne = nonEmptyCells(rows[i] || []);
    if (ne.length === 1 && canonicalStatus(ne[0].v)) currentStatus = canonicalStatus(ne[0].v);
  }

  const orders = [];
  let currentCustomer = '';
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const ne = nonEmptyCells(row);
    if (!ne.length) continue;
    if (isHeaderRow(row)) continue; // repeated header (printed pages)

    const soRaw = cols.so != null ? cellText(row[cols.so]) : '';
    const custRaw = cols.customer != null ? cellText(row[cols.customer]) : '';

    // Section / group label rows: a single populated cell.
    if (ne.length === 1) {
      const text = cellText(ne[0].v);
      const st = canonicalStatus(text);
      if (st) { currentStatus = st; currentCustomer = ''; continue; }
      if (/^total\b/i.test(text)) { currentCustomer = ''; continue; }
      if (!soRaw) { currentCustomer = text; continue; }
    }
    if (statusCol >= 0 && canonicalStatus(row[statusCol])) currentStatus = canonicalStatus(row[statusCol]);
    if (!soRaw) continue;
    if (/^total\b/i.test(soRaw) || /^total\b/i.test(custRaw)) continue;
    if (!/\d/.test(soRaw)) continue; // SO numbers always carry digits

    const so = soRaw.replace(/\.0+$/, '');
    const amount = round2(parseMoney(cols.amount != null ? row[cols.amount] : 0));
    const paid = round2(parseMoney(cols.paid != null ? row[cols.paid] : 0));
    let balance = cols.balance != null && !isBlank(row[cols.balance]) ? round2(parseMoney(row[cols.balance])) : round2(amount - paid);
    const date = toISODate(cols.date != null ? row[cols.date] : '');
    const refYear = date ? +date.slice(0, 4) : undefined;
    const deliverBy = cols.deliverBy != null ? cellText(row[cols.deliverBy]) : '';
    let deliverByDate = toISODate(cols.deliverBy != null ? row[cols.deliverBy] : '', refYear);
    // "8/13" with no year: if that lands before the order date, roll a year forward.
    if (deliverByDate && date && deliverByDate < date && !/\d{4}|\d{2}$/.test(deliverBy.replace(/^\d{1,2}[\/\-]\d{1,2}[\/\-]?/, ''))) {
      const y = +deliverByDate.slice(0, 4) + 1;
      deliverByDate = String(y) + deliverByDate.slice(4);
    }
    const shipMethod = cols.shipVia != null ? cellText(row[cols.shipVia]) : '';
    const completeFlag = cols.complete != null ? truthy(row[cols.complete]) : false;
    const status = completeFlag ? 'Completed' : (currentStatus || '');
    const customer = custRaw || currentCustomer;

    orders.push({
      so,
      customer,
      date,
      onCalendar: cols.onCalendar != null ? cellText(row[cols.onCalendar]) : '',
      deliverBy,
      deliverByDate,
      model: cols.item != null ? cellText(row[cols.item]) : '',
      amount,
      total: amount,
      paid,
      balance,
      rep: cols.rep != null ? cellText(row[cols.rep]) : '',
      shipMethod,
      deliveryType: deliveryTypeFromShipMethod(shipMethod),
      paymentMethod: cols.paymentMethod != null ? cellText(row[cols.paymentMethod]) : '',
      paymentStatus: computePaySt(amount, paid),
      complete: completeFlag || status === 'Completed',
      inworkStatus: status,
      notes: cols.notes != null ? cellText(row[cols.notes]) : '',
      sheet: sheetName,
      row: r + 1
    });
  }
  return { orders, header, columns: cols };
}

export function parseInworkWorkbook(wb) {
  const result = { orders: [], sheets: [], skippedSheets: [] };
  const seen = new Map();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) { result.skippedSheets.push(name); continue; }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const parsed = parseInworkRows(rows, name);
    if (!parsed) { result.skippedSheets.push(name); continue; }
    result.sheets.push({ name, orders: parsed.orders.length, columns: parsed.columns });
    for (const o of parsed.orders) {
      // Same SO on two sheets (e.g. a "current" tab and a full tab): keep the
      // richer record but never lose a Completed flag.
      const prev = seen.get(o.so);
      if (!prev) { seen.set(o.so, o); result.orders.push(o); continue; }
      if (o.complete && !prev.complete) { prev.complete = true; prev.inworkStatus = 'Completed'; }
      ['deliverBy', 'deliverByDate', 'rep', 'shipMethod', 'paymentMethod', 'notes', 'model', 'onCalendar'].forEach(k => { if (!prev[k] && o[k]) prev[k] = o[k]; });
    }
  }
  return result;
}

export function parseInworkBuffer(buf, filename) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  const out = parseInworkWorkbook(wb);
  out.file = filename || '';
  return out;
}

export function parseInworkFile(path) {
  const buf = fs.readFileSync(path);
  const out = parseInworkBuffer(buf, path);
  try { out.modified = fs.statSync(path).mtime.toISOString(); } catch (e) { /* */ }
  return out;
}
