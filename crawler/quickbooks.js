// QuickBooks Desktop data loader.
//
// Two inputs are supported:
//   1. quickbooks-export.json written by crawler/quickbooks-export.ps1, which
//      talks to QuickBooks Desktop through its qbXML request processor on the
//      PC where QuickBooks is installed.
//   2. An Excel/CSV export of the QuickBooks "Open Sales Orders by Customer"
//      report (Type / Date / Num / Item / Item Description / Memo / Sales
//      Price / Amount / Open Balance, grouped by customer with Total rows).

import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  normKey, cellText, isBlank, nonEmptyCells, parseMoney, round2, toISODate,
  deliveryTypeFromShipMethod
} from './lib/util.js';

const REPORT_COLS = {
  type: ['type', 'txntype', 'transactiontype'],
  date: ['date', 'txndate'],
  so: ['num', 'refnumber', 'so', 'salesorder', 'number'],
  item: ['item'],
  itemDesc: ['itemdescription', 'description'],
  memo: ['memo', 'memodescription'],
  price: ['salesprice', 'rate', 'price'],
  qty: ['qty', 'quantity'],
  amount: ['amount'],
  openBalance: ['openbalance', 'balance'],
  customer: ['name', 'customer', 'customername', 'customerjob'],
  rep: ['rep', 'salesrep'],
  shipVia: ['shipvia', 'via', 'shipmethod'],
  shipDate: ['shipdate', 'deliverby', 'duedate'],
  po: ['pono', 'ponumber', 'po#']
};

function mapReportColumns(header) {
  const keys = header.map(normKey);
  const map = {}, claimed = new Set();
  for (const [col, hints] of Object.entries(REPORT_COLS)) {
    for (const h of hints) {
      const i = keys.findIndex((k, idx) => k === h && !claimed.has(idx));
      if (i >= 0) { map[col] = i; claimed.add(i); break; }
    }
  }
  for (const [col, hints] of Object.entries(REPORT_COLS)) {
    if (map[col] != null) continue;
    for (const h of hints) {
      const i = keys.findIndex((k, idx) => k && !claimed.has(idx) && k.includes(h));
      if (i >= 0) { map[col] = i; claimed.add(i); break; }
    }
  }
  return map;
}

function isReportHeader(row) {
  const keys = row.map(normKey);
  return keys.includes('type') && keys.includes('num') && (keys.includes('amount') || keys.includes('openbalance'));
}

const TXN_TYPES = { salesorder: 'Sales Order', invoice: 'Invoice', estimate: 'Estimate', creditmemo: 'Credit Memo', payment: 'Payment' };

export function destinationFromText(text) {
  const s = String(text || '');
  let m = s.match(/ship\s*to:?\s*([^\n]*)/i);
  if (m && m[1].trim()) return m[1].trim().replace(/\s{2,}/g, ' ').slice(0, 120);
  // "... in Chicago, IL" — the city may be several words but never spans another "in"/"to".
  m = s.match(/\b(?:to|in)\s+([A-Z][A-Za-z.]*(?:\s+(?!(?:in|to)\s)[A-Za-z.]+)*,\s*[A-Z]{2})\b/);
  if (m) return m[1].trim();
  return '';
}

/**
 * Parse the "Open Sales Orders by Customer" report layout (array-of-arrays).
 */
export function parseSalesOrderReportRows(rows) {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) if (isReportHeader(rows[i] || [])) { headerIdx = i; break; }
  if (headerIdx < 0) return null;
  const cols = mapReportColumns(rows[headerIdx].map(cellText));
  const txns = [];
  const byNum = new Map();
  let currentCustomer = '';
  let currentTxn = null;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const ne = nonEmptyCells(row);
    if (!ne.length) continue;
    if (isReportHeader(row)) continue;
    const typeRaw = cols.type != null ? cellText(row[cols.type]) : '';
    const type = TXN_TYPES[normKey(typeRaw)] || '';

    if (!type) {
      // Group label or total row (one populated cell, or a "Total X" line)
      const text = cellText(ne[0].v);
      if (/^total\b/i.test(text)) { currentCustomer = ''; currentTxn = null; continue; }
      if (ne.length <= 2 && text && !/\d{4,}/.test(text)) { currentCustomer = text; currentTxn = null; continue; }
      continue;
    }

    const num = (cols.so != null ? cellText(row[cols.so]) : '').replace(/\.0+$/, '');
    const item = cols.item != null ? cellText(row[cols.item]) : '';
    const memo = cols.memo != null ? cellText(row[cols.memo]) : '';
    const desc = cols.itemDesc != null ? cellText(row[cols.itemDesc]) : '';
    const amount = parseMoney(cols.amount != null ? row[cols.amount] : 0);
    const openBal = cols.openBalance != null && !isBlank(row[cols.openBalance]) ? parseMoney(row[cols.openBalance]) : null;
    const customerCell = cols.customer != null ? cellText(row[cols.customer]) : '';

    const isTxnHeader = !item || !currentTxn || currentTxn.so !== num;
    if (isTxnHeader && !item) {
      currentTxn = {
        type,
        so: num,
        customer: customerCell || currentCustomer,
        date: toISODate(cols.date != null ? row[cols.date] : ''),
        memo,
        amount: round2(Math.abs(amount)),
        openBalance: openBal == null ? null : round2(Math.abs(openBal)),
        rep: cols.rep != null ? cellText(row[cols.rep]) : '',
        shipVia: cols.shipVia != null ? cellText(row[cols.shipVia]) : '',
        shipDate: toISODate(cols.shipDate != null ? row[cols.shipDate] : ''),
        po: cols.po != null ? cellText(row[cols.po]) : '',
        lines: []
      };
      txns.push(currentTxn);
      if (num) byNum.set(type + ':' + num, currentTxn);
      continue;
    }
    // Line item row
    let txn = byNum.get(type + ':' + num);
    if (!txn) {
      txn = { type, so: num, customer: customerCell || currentCustomer, date: toISODate(cols.date != null ? row[cols.date] : ''), memo: '', amount: 0, openBalance: null, rep: '', shipVia: '', shipDate: '', po: '', lines: [], amountFromLines: true };
      txns.push(txn); byNum.set(type + ':' + num, txn); currentTxn = txn;
    }
    txn.lines.push({
      item, description: desc, memo,
      price: cols.price != null ? cellText(row[cols.price]) : '',
      qty: cols.qty != null ? parseMoney(row[cols.qty]) : null,
      amount: round2(Math.abs(amount))
    });
    if (txn.amountFromLines) txn.amount = round2(txn.amount + Math.abs(amount));
  }

  for (const t of txns) finishTxn(t);
  return { transactions: txns, columns: cols };
}

function finishTxn(t) {
  const lineText = t.lines.map(l => [l.item, l.description, l.memo].join(' ')).join('\n');
  const all = (t.memo + '\n' + lineText).toLowerCase();
  let deliveryType = '';
  if (/by empire truck|delivery\s*&\s*installation|delivery and installation|field tech|customer pick/.test(all)) deliveryType = 'Local Delivery';
  else if (/shipping\s*&\s*handling|shipping and handling|freight|ltl|ship to/.test(all)) deliveryType = 'Ship Out';
  if (!deliveryType && t.shipVia) deliveryType = deliveryTypeFromShipMethod(t.shipVia);
  t.deliveryType = deliveryType;
  t.dest = destinationFromText(lineText) || destinationFromText(t.memo);
  if (!t.dest) {
    // Sales-tax line like "10021 (New York City)" names the delivery city.
    const tax = t.lines.find(l => /^\d{5}\s*\(/.test(l.item));
    if (tax) t.dest = tax.item.replace(/^\d{5}\s*\(|\)$/g, '');
  }
  if (!t.model) {
    const first = t.lines.find(l => l.item && !/tax|shipping|delivery|discount|non taxable|^\d{5}/i.test(l.item));
    t.model = t.memo || (first ? (first.item.split('(')[0].split(':').pop().trim()) : '');
  }
  delete t.amountFromLines;
}

export function parseQuickBooksReportWorkbook(wb) {
  const out = { source: 'report', salesOrders: [], invoices: [], estimates: [], payments: [], customers: [], sheets: [] };
  const seen = new Set();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const parsed = parseSalesOrderReportRows(rows);
    if (!parsed) continue;
    out.sheets.push({ name, transactions: parsed.transactions.length });
    for (const t of parsed.transactions) {
      const key = t.type + ':' + t.so;
      if (seen.has(key)) continue;
      seen.add(key);
      if (t.type === 'Sales Order') out.salesOrders.push(t);
      else if (t.type === 'Invoice') out.invoices.push(t);
      else if (t.type === 'Estimate') out.estimates.push(t);
    }
  }
  return out;
}

/**
 * Normalise the JSON written by quickbooks-export.ps1.
 */
export function normalizeQuickBooksJson(raw) {
  const j = raw || {};
  const so = (j.salesOrders || []).map(s => {
    const lines = (s.lines || []).map(l => ({
      item: l.item || '', description: l.description || '', qty: l.qty == null ? null : +l.qty,
      rate: l.rate == null ? null : +l.rate, amount: round2(+l.amount || 0), invoiced: l.invoiced == null ? null : +l.invoiced
    }));
    const t = {
      type: 'Sales Order',
      txnId: s.txnId || '',
      so: String(s.refNumber || s.so || '').trim(),
      customer: s.customer || '',
      date: toISODate(s.txnDate || s.date || ''),
      dueDate: toISODate(s.dueDate || ''),
      shipDate: toISODate(s.shipDate || ''),
      memo: s.memo || '',
      po: s.po || '',
      rep: s.salesRep || s.rep || '',
      shipVia: s.shipMethod || s.shipVia || '',
      shipAddress: s.shipAddress || '',
      amount: round2(+s.totalAmount || +s.amount || 0),
      openBalance: s.openBalance == null ? null : round2(+s.openBalance),
      isFullyInvoiced: !!s.isFullyInvoiced,
      isManuallyClosed: !!s.isManuallyClosed,
      linkedTxns: s.linkedTxns || [],
      modified: s.timeModified || '',
      lines
    };
    finishTxn(t);
    if (t.shipAddress) t.dest = t.shipAddress.replace(/\s*\n\s*/g, ', ');
    return t;
  });
  const invoices = (j.invoices || []).map(i => ({
    type: 'Invoice', txnId: i.txnId || '', so: String(i.refNumber || '').trim(), customer: i.customer || '',
    date: toISODate(i.txnDate || ''), dueDate: toISODate(i.dueDate || ''), amount: round2(+i.totalAmount || 0),
    balance: round2(+i.balanceRemaining || 0), applied: round2(+i.appliedAmount || 0), isPaid: !!i.isPaid,
    memo: i.memo || '', linkedTxns: i.linkedTxns || []
  }));
  const payments = (j.payments || []).map(p => ({
    txnId: p.txnId || '', refNumber: p.refNumber || '', customer: p.customer || '', date: toISODate(p.txnDate || ''),
    amount: round2(+p.totalAmount || 0), method: p.paymentMethod || '', memo: p.memo || '', unapplied: round2(+p.unusedPayment || 0),
    appliedTo: p.appliedTo || []
  }));
  const customers = (j.customers || []).map(c => ({ name: c.name || '', balance: round2(+c.balance || 0), totalBalance: round2(+c.totalBalance || 0), phone: c.phone || '', email: c.email || '' }));

  // Paid-to-date per SO = amount invoiced from it minus what is still owed on
  // those invoices. Deposits taken before invoicing show up as unapplied payments.
  const invById = new Map(invoices.map(i => [i.txnId, i]));
  for (const s of so) {
    let paid = 0, invoiced = 0;
    for (const l of s.linkedTxns) {
      const inv = invById.get(l.txnId);
      if (inv) { invoiced += inv.amount; paid += inv.amount - inv.balance; }
    }
    s.invoiced = round2(invoiced);
    s.paid = round2(paid);
    if (s.openBalance == null) s.openBalance = round2(s.amount - s.paid);
  }
  return {
    source: 'qbxml',
    exportedAt: j.exportedAt || '',
    company: j.company || '',
    salesOrders: so,
    openSalesOrders: so.filter(s => !s.isFullyInvoiced && !s.isManuallyClosed),
    invoices, payments, customers,
    errors: j.errors || []
  };
}

export function loadQuickBooks(file) {
  const ext = path.extname(file).toLowerCase();
  let out;
  if (ext === '.json') {
    out = normalizeQuickBooksJson(JSON.parse(fs.readFileSync(file, 'utf8')));
  } else {
    const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
    out = parseQuickBooksReportWorkbook(wb);
    out.openSalesOrders = out.salesOrders.filter(s => s.openBalance == null || s.openBalance > 0);
  }
  out.file = file;
  try { out.modified = fs.statSync(file).mtime.toISOString(); } catch (e) { /* */ }
  return out;
}
