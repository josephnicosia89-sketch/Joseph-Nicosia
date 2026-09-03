// Turns parsed Inwork + QuickBooks data into the morning-brief dataset:
// what is new, what is due, what is overdue, who owes money, what changed
// since the last run, and where the two sources disagree.

import { round2, todayISO, addDays, daysBetween, fmtMoney, csvEscape, computePaySt } from './lib/util.js';
import { INWORK_STATUSES } from './inwork.js';

function idx(list, key) {
  const m = new Map();
  for (const x of list || []) { const k = String(x[key] || '').trim(); if (k) m.set(k, x); }
  return m;
}

export function mergeOrders(inwork, qb) {
  const qbMap = idx((qb && qb.salesOrders) || [], 'so');
  const merged = [];
  const seen = new Set();
  for (const o of (inwork && inwork.orders) || []) {
    const q = qbMap.get(o.so);
    const m = { ...o, source: q ? 'inwork+qb' : 'inwork' };
    if (q) {
      m.qb = {
        amount: q.amount, openBalance: q.openBalance, paid: q.paid, invoiced: q.invoiced, date: q.date,
        dueDate: q.dueDate || q.shipDate || '', rep: q.rep, shipVia: q.shipVia, memo: q.memo,
        isFullyInvoiced: !!q.isFullyInvoiced, isManuallyClosed: !!q.isManuallyClosed, lines: q.lines ? q.lines.length : 0
      };
      if (!m.customer) m.customer = q.customer;
      if (!m.model) m.model = q.model || q.memo;
      if (!m.rep) m.rep = q.rep || '';
      if (!m.date) m.date = q.date || '';
      if (!m.dest) m.dest = q.dest || '';
      if (!m.deliveryType) m.deliveryType = q.deliveryType || '';
      if (!m.amount && q.amount) { m.amount = q.amount; m.total = q.amount; m.balance = round2(q.amount - m.paid); m.paymentStatus = computePaySt(m.amount, m.paid); }
      if (!m.deliverByDate && (q.dueDate || q.shipDate)) { m.deliverByDate = q.dueDate || q.shipDate; if (!m.deliverBy) m.deliverBy = m.deliverByDate; }
    }
    merged.push(m); seen.add(o.so);
  }
  for (const q of (qb && qb.salesOrders) || []) {
    if (seen.has(q.so)) continue;
    const open = q.openBalance == null ? true : q.openBalance > 0;
    const paid = q.paid != null ? q.paid : round2(q.amount - (q.openBalance || 0));
    merged.push({
      so: q.so, customer: q.customer, date: q.date, onCalendar: '', deliverBy: q.dueDate || q.shipDate || '', deliverByDate: q.dueDate || q.shipDate || '',
      model: q.model || q.memo, amount: q.amount, total: q.amount, paid, balance: round2(q.amount - paid), rep: q.rep || '',
      shipMethod: q.shipVia || '', deliveryType: q.deliveryType || '', paymentMethod: '', paymentStatus: computePaySt(q.amount, paid),
      complete: !open || !!q.isFullyInvoiced || !!q.isManuallyClosed, inworkStatus: '', dest: q.dest || '', notes: '', source: 'qb',
      qb: { amount: q.amount, openBalance: q.openBalance, paid: q.paid, invoiced: q.invoiced, date: q.date, dueDate: q.dueDate || q.shipDate || '', rep: q.rep, shipVia: q.shipVia, memo: q.memo, isFullyInvoiced: !!q.isFullyInvoiced, isManuallyClosed: !!q.isManuallyClosed, lines: q.lines ? q.lines.length : 0 }
    });
  }
  return merged;
}

function slim(o) {
  return {
    so: o.so, customer: o.customer, model: o.model, rep: o.rep, date: o.date, deliverBy: o.deliverBy, deliverByDate: o.deliverByDate,
    amount: o.amount, paid: o.paid, balance: o.balance, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
    shipMethod: o.shipMethod, deliveryType: o.deliveryType, inworkStatus: o.inworkStatus, productionComplete: !!o.productionComplete,
    shipDate: o.shipDate || '', reqDate: o.reqDate || '', dest: o.dest || '', source: o.source
  };
}

export function buildBrief({ inwork, quickbooks, previous, now = new Date(), lookbackDays = 1, dueSoonDays = 7, maxItems = 15 }) {
  const today = todayISO(now);
  const since = addDays(today, -Math.max(1, lookbackDays));
  const horizon = addDays(today, dueSoonDays);
  const orders = mergeOrders(inwork, quickbooks);
  const open = orders.filter(o => !o.complete);
  const prevMap = idx((previous && previous.orders) || [], 'so');
  const hasPrev = prevMap.size > 0;

  const byStatus = {};
  for (const s of INWORK_STATUSES) byStatus[s] = { count: 0, amount: 0, balance: 0 };
  byStatus['(unlabeled)'] = { count: 0, amount: 0, balance: 0 };
  for (const o of open) {
    const k = o.inworkStatus || '(unlabeled)';
    if (!byStatus[k]) byStatus[k] = { count: 0, amount: 0, balance: 0 };
    byStatus[k].count++; byStatus[k].amount = round2(byStatus[k].amount + o.amount); byStatus[k].balance = round2(byStatus[k].balance + o.balance);
  }
  for (const k of Object.keys(byStatus)) if (!byStatus[k].count && k !== 'In Production') delete byStatus[k];

  const newOrders = open.filter(o => (o.date && o.date >= since) || (hasPrev && !prevMap.has(o.so)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  // Storage/rental jobs are not deliveries: their dates never count as overdue.
  const deliverable = open.filter(o => o.inworkStatus !== 'In Storage/On Rental');
  const storageJobs = open.filter(o => o.inworkStatus === 'In Storage/On Rental');
  const dueSoon = deliverable.filter(o => o.deliverByDate && o.deliverByDate >= today && o.deliverByDate <= horizon)
    .sort((a, b) => a.deliverByDate.localeCompare(b.deliverByDate));
  const overdue = deliverable.filter(o => o.deliverByDate && o.deliverByDate < today)
    .sort((a, b) => a.deliverByDate.localeCompare(b.deliverByDate))
    .map(o => ({ ...o, daysLate: daysBetween(o.deliverByDate, today) }));
  const noDate = deliverable.filter(o => !o.deliverByDate);
  const built = open.filter(o => o.productionComplete);
  const unpaid = open.filter(o => o.balance > 0.5).sort((a, b) => b.balance - a.balance);
  const noDeposit = open.filter(o => o.amount > 0 && o.paid <= 0);

  // Changes since the previous snapshot
  const changes = { added: [], completed: [], statusChanged: [], paymentsPosted: [], deliverByChanged: [], amountChanged: [] };
  if (hasPrev) {
    const curMap = idx(orders, 'so');
    for (const o of orders) {
      const p = prevMap.get(o.so);
      if (!p) { if (!o.complete) changes.added.push(slim(o)); continue; }
      if (o.complete && !p.complete) changes.completed.push(slim(o));
      if (!o.complete && o.inworkStatus && p.inworkStatus && o.inworkStatus !== p.inworkStatus) changes.statusChanged.push({ ...slim(o), from: p.inworkStatus, to: o.inworkStatus });
      if (round2(o.paid - (p.paid || 0)) > 0.5) changes.paymentsPosted.push({ ...slim(o), delta: round2(o.paid - (p.paid || 0)) });
      if (o.deliverBy && p.deliverBy && o.deliverBy !== p.deliverBy) changes.deliverByChanged.push({ ...slim(o), from: p.deliverBy, to: o.deliverBy });
      if (Math.abs(round2(o.amount - (p.amount || 0))) > 0.5 && p.amount) changes.amountChanged.push({ ...slim(o), from: p.amount, to: o.amount });
    }
    for (const [so, p] of prevMap) if (!curMap.has(so) && !p.complete) changes.completed.push({ ...p, droppedFromReport: true });
  }

  // QuickBooks cross-checks
  const discrepancies = [];
  let recentPayments = [];
  let qbSummary = null;
  if (quickbooks) {
    const qbOpen = quickbooks.openSalesOrders || quickbooks.salesOrders || [];
    const inMap = idx(((inwork && inwork.orders) || []).filter(o => !o.complete), 'so');
    const qbMap = idx(qbOpen, 'so');
    for (const q of qbOpen) if (!inMap.has(q.so)) discrepancies.push({ kind: 'qb-only', so: q.so, customer: q.customer, amount: q.amount, detail: 'Open in QuickBooks but not on the Inwork report' });
    for (const o of inMap.values()) if (quickbooks.source === 'qbxml' && !qbMap.has(o.so)) discrepancies.push({ kind: 'inwork-only', so: o.so, customer: o.customer, amount: o.amount, detail: 'On the Inwork report but not an open Sales Order in QuickBooks' });
    for (const o of inMap.values()) {
      const q = qbMap.get(o.so);
      if (q && o.amount && q.amount && Math.abs(o.amount - q.amount) > 1) discrepancies.push({ kind: 'amount', so: o.so, customer: o.customer, inwork: o.amount, quickbooks: q.amount, detail: 'Order total differs: Inwork ' + fmtMoney(o.amount) + ' vs QuickBooks ' + fmtMoney(q.amount) });
      if (q && q.paid != null && Math.abs((o.paid || 0) - q.paid) > 1) discrepancies.push({ kind: 'paid', so: o.so, customer: o.customer, inwork: o.paid, quickbooks: q.paid, detail: 'Paid-to-date differs: Inwork ' + fmtMoney(o.paid) + ' vs QuickBooks ' + fmtMoney(q.paid) });
    }
    recentPayments = (quickbooks.payments || []).filter(p => p.date && p.date >= since).sort((a, b) => b.date.localeCompare(a.date));
    const openInv = (quickbooks.invoices || []).filter(i => i.balance > 0.5);
    qbSummary = {
      source: quickbooks.source, exportedAt: quickbooks.exportedAt || quickbooks.modified || '', company: quickbooks.company || '',
      openSalesOrders: qbOpen.length, openSalesOrderValue: round2(qbOpen.reduce((a, q) => a + (q.amount || 0), 0)),
      openInvoices: openInv.length, openInvoiceBalance: round2(openInv.reduce((a, i) => a + i.balance, 0)),
      pastDueInvoices: openInv.filter(i => i.dueDate && i.dueDate < today).length,
      paymentsSince: round2(recentPayments.reduce((a, p) => a + p.amount, 0)),
      errors: quickbooks.errors || []
    };
  }

  const summary = {
    openOrders: open.length,
    openValue: round2(open.reduce((a, o) => a + o.amount, 0)),
    openBalance: round2(open.reduce((a, o) => a + o.balance, 0)),
    collected: round2(open.reduce((a, o) => a + o.paid, 0)),
    newOrders: newOrders.length,
    dueSoon: dueSoon.length,
    overdue: overdue.length,
    noDeliverByDate: noDate.length,
    unpaid: unpaid.length,
    noDeposit: noDeposit.length,
    productionComplete: built.length,
    productionCompleteValue: round2(built.reduce((a, o) => a + o.amount, 0)),
    storageJobs: storageJobs.length,
    byStatus
  };

  const headlines = [];
  if (newOrders.length) headlines.push(newOrders.length + ' new sales order' + (newOrders.length === 1 ? '' : 's') + ' since ' + since + ' (' + fmtMoney(newOrders.reduce((a, o) => a + o.amount, 0)) + ')');
  if (overdue.length) headlines.push(overdue.length + ' open order' + (overdue.length === 1 ? '' : 's') + ' past the deliver-by date');
  if (dueSoon.length) headlines.push(dueSoon.length + ' due in the next ' + dueSoonDays + ' days');
  if (built.length) headlines.push(built.length + ' built and waiting to deliver (' + fmtMoney(built.reduce((a, o) => a + o.amount, 0)) + ')');
  if (changes.paymentsPosted.length) headlines.push(fmtMoney(changes.paymentsPosted.reduce((a, c) => a + c.delta, 0)) + ' in payments posted on ' + changes.paymentsPosted.length + ' order' + (changes.paymentsPosted.length === 1 ? '' : 's'));
  if (changes.completed.length) headlines.push(changes.completed.length + ' order' + (changes.completed.length === 1 ? '' : 's') + ' completed or dropped off the report');
  if (discrepancies.length) headlines.push(discrepancies.length + ' Inwork/QuickBooks mismatch' + (discrepancies.length === 1 ? '' : 'es') + ' to reconcile');
  if (inwork && inwork.usedFallback) headlines.push('Inwork report was read from the fallback copy (' + (inwork.file || 'unknown') + '), not the Q: drive original — check the share connection.');
  if (!headlines.length) headlines.push('No new orders, nothing overdue, no changes since the last run.');

  return {
    version: 1,
    generatedAt: now.toISOString(),
    today, since, horizon, lookbackDays, dueSoonDays,
    sources: {
      inwork: inwork ? { file: inwork.file || '', modified: inwork.modified || '', via: inwork.via || '', usedFallback: !!inwork.usedFallback, orders: (inwork.orders || []).length, sheets: inwork.sheets || [], skippedSheets: inwork.skippedSheets || [] } : null,
      quickbooks: qbSummary,
      previous: previous ? { generatedAt: previous.generatedAt || '', orders: (previous.orders || []).length } : null
    },
    headlines,
    summary,
    newOrders: newOrders.slice(0, maxItems * 2).map(slim),
    overdue: overdue.slice(0, maxItems).map(o => ({ ...slim(o), daysLate: o.daysLate })),
    dueSoon: dueSoon.slice(0, maxItems).map(slim),
    unpaid: unpaid.slice(0, maxItems).map(slim),
    noDeposit: noDeposit.slice(0, maxItems).map(slim),
    recentPayments: recentPayments.slice(0, maxItems),
    changes,
    discrepancies: discrepancies.slice(0, maxItems * 2),
    orders: orders.map(o => ({ ...slim(o), complete: o.complete, onCalendar: o.onCalendar || '', notes: o.notes || '', qb: o.qb || null }))
  };
}

// ── Renderers ───────────────────────────────────────────────────────────────

function line(o, extra) {
  const bits = ['SO ' + o.so, o.customer || '(no customer)', o.model ? '— ' + o.model : '', o.rep ? '(' + o.rep + ')' : ''];
  const money = fmtMoney(o.amount) + (o.balance > 0.5 ? ', balance ' + fmtMoney(o.balance) : ', paid in full');
  return '- **' + bits.filter(Boolean).join(' ') + '** · ' + money + (extra ? ' · ' + extra : '');
}

export function renderBriefMarkdown(b) {
  const L = [];
  L.push('# Empire Safe — Orders & QuickBooks brief for ' + b.today);
  L.push('');
  L.push('_Generated ' + b.generatedAt + '. Inwork report: ' + (b.sources.inwork ? (b.sources.inwork.orders + ' rows from ' + (b.sources.inwork.file || 'unknown path') + ', modified ' + (b.sources.inwork.modified || 'unknown')) : 'not loaded') + '. QuickBooks: ' + (b.sources.quickbooks ? (b.sources.quickbooks.source + ', ' + b.sources.quickbooks.openSalesOrders + ' open SOs' + (b.sources.quickbooks.exportedAt ? ', exported ' + b.sources.quickbooks.exportedAt : '')) : 'off') + '._');
  L.push('');
  L.push('## Headlines');
  for (const h of b.headlines) L.push('- ' + h);
  L.push('');
  L.push('## Pipeline');
  const s = b.summary;
  L.push('| Open orders | Open value | Collected | Outstanding | New | Built, awaiting delivery | Due ≤' + b.dueSoonDays + 'd | Overdue | No deliver-by | Storage/rental |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  L.push('| ' + [s.openOrders, fmtMoney(s.openValue), fmtMoney(s.collected), fmtMoney(s.openBalance), s.newOrders, s.productionComplete, s.dueSoon, s.overdue, s.noDeliverByDate, s.storageJobs].join(' | ') + ' |');
  L.push('');
  L.push('| Inwork status | Orders | Value | Outstanding |');
  L.push('|---|---|---|---|');
  for (const [k, v] of Object.entries(s.byStatus)) L.push('| ' + k + ' | ' + v.count + ' | ' + fmtMoney(v.amount) + ' | ' + fmtMoney(v.balance) + ' |');
  L.push('');
  if (b.newOrders.length) { L.push('## New orders (since ' + b.since + ')'); for (const o of b.newOrders) L.push(line(o, 'ordered ' + (o.date || '?') + (o.deliverBy ? ', deliver by ' + o.deliverBy : '') + (o.inworkStatus ? ', ' + o.inworkStatus : ''))); L.push(''); }
  if (b.overdue.length) { L.push('## Past deliver-by date'); for (const o of b.overdue) L.push(line(o, 'deliver by ' + o.deliverBy + ' (' + o.daysLate + 'd late), ' + (o.inworkStatus || 'status unknown') + (o.productionComplete ? ', built' : ''))); L.push(''); }
  if (b.dueSoon.length) { L.push('## Due in the next ' + b.dueSoonDays + ' days'); for (const o of b.dueSoon) L.push(line(o, 'deliver by ' + o.deliverBy + ', ' + (o.inworkStatus || 'status unknown') + (o.deliveryType ? ', ' + o.deliveryType : ''))); L.push(''); }
  const c = b.changes;
  const anyChange = c.added.length || c.completed.length || c.statusChanged.length || c.paymentsPosted.length || c.deliverByChanged.length || c.amountChanged.length;
  if (anyChange) {
    L.push('## Changed since last run');
    for (const o of c.paymentsPosted) L.push(line(o, 'payment posted ' + fmtMoney(o.delta) + (o.paymentMethod ? ' via ' + o.paymentMethod : '')));
    for (const o of c.statusChanged) L.push(line(o, 'moved ' + o.from + ' → ' + o.to));
    for (const o of c.deliverByChanged) L.push(line(o, 'deliver-by changed ' + o.from + ' → ' + o.to));
    for (const o of c.amountChanged) L.push(line(o, 'total changed ' + fmtMoney(o.from) + ' → ' + fmtMoney(o.to)));
    for (const o of c.completed) L.push(line(o, o.droppedFromReport ? 'no longer on the report' : 'marked complete'));
    L.push('');
  }
  if (b.recentPayments.length) { L.push('## Payments received in QuickBooks'); for (const p of b.recentPayments) L.push('- ' + p.date + ' · ' + p.customer + ' · ' + fmtMoney(p.amount) + (p.method ? ' via ' + p.method : '') + (p.refNumber ? ' (ref ' + p.refNumber + ')' : '')); L.push(''); }
  if (b.unpaid.length) { L.push('## Largest outstanding balances'); for (const o of b.unpaid) L.push(line(o, o.paymentStatus + (o.paymentMethod ? ', ' + o.paymentMethod : ''))); L.push(''); }
  if (b.noDeposit.length) { L.push('## Open orders with no deposit'); for (const o of b.noDeposit) L.push(line(o, o.inworkStatus || '')); L.push(''); }
  if (b.discrepancies.length) { L.push('## Inwork vs QuickBooks'); for (const d of b.discrepancies) L.push('- SO ' + d.so + ' · ' + (d.customer || '') + ' · ' + d.detail); L.push(''); }
  return L.join('\n');
}

export function ordersToCsv(orders) {
  const cols = ['so', 'customer', 'model', 'rep', 'date', 'deliverBy', 'deliverByDate', 'inworkStatus', 'complete', 'amount', 'paid', 'balance', 'paymentStatus', 'paymentMethod', 'shipMethod', 'deliveryType', 'dest', 'source'];
  const out = [cols.join(',')];
  for (const o of orders) out.push(cols.map(c => csvEscape(o[c] == null ? '' : o[c])).join(','));
  return out.join('\n') + '\n';
}

/** Payload the SafeTech app's OneDrive "Pull New Orders" import understands. */
export function ordersForApp(orders) {
  return {
    orders: orders.filter(o => !o.complete).map(o => ({
      so: o.so, make: 'Empire Safe', model: o.model, customer: o.customer, rep: o.rep, date: o.date, deliverBy: o.deliverBy,
      total: o.amount, paid: o.paid, balance: o.balance, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
      shipMethod: o.shipMethod, deliveryType: o.deliveryType, inworkStatus: o.inworkStatus, productionComplete: !!o.productionComplete, dest: o.dest || '', notes: o.notes || ''
    }))
  };
}
