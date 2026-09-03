import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInworkWorkbook } from '../inwork.js';
import { normalizeQuickBooksJson } from '../quickbooks.js';
import { buildBrief, renderBriefMarkdown, ordersToCsv, ordersForApp } from '../brief.js';
import { inworkWorkbook, qbJsonExport } from './fixtures.js';

const NOW = new Date(2026, 8, 3, 6, 0, 0); // 2026-09-03 local

test('builds a brief from Inwork + QuickBooks with diff against previous run', () => {
  const inwork = parseInworkWorkbook(inworkWorkbook());
  const qb = normalizeQuickBooksJson(qbJsonExport());
  const first = buildBrief({ inwork, quickbooks: qb, previous: null, now: NOW, lookbackDays: 1 });

  assert.equal(first.today, '2026-09-03');
  assert.equal(first.summary.openOrders, 6, '5 open Inwork orders + 1 QuickBooks-only order');
  assert.equal(first.summary.byStatus['In Production'].count, 2);
  assert.equal(first.newOrders.length, 1);
  assert.equal(first.newOrders[0].so, '64999');
  assert.equal(first.newOrders[0].source, 'qb');
  assert.ok(first.overdue.some(o => o.so === '62925' && o.daysLate > 700));
  assert.ok(first.dueSoon.some(o => o.so === '64999'));
  assert.equal(first.recentPayments.length, 1);
  assert.equal(first.sources.quickbooks.openInvoices, 1);
  assert.equal(first.sources.quickbooks.pastDueInvoices, 1);
  const kinds = first.discrepancies.map(d => d.kind + ':' + d.so).sort();
  assert.ok(kinds.includes('qb-only:64999'));
  assert.ok(kinds.includes('inwork-only:62925'));
  assert.ok(!kinds.some(k => k.startsWith('amount:62746')), 'matching totals produce no discrepancy');
  assert.ok(first.headlines.length >= 3);

  // Second run: a payment posts, a status changes, an order completes, one is brand new.
  const inwork2 = parseInworkWorkbook(inworkWorkbook());
  const lj = inwork2.orders.find(o => o.so === '62911');
  lj.paid = 1000; lj.balance = 1715.62;
  const fe = inwork2.orders.find(o => o.so === '63185'); fe.inworkStatus = 'In Transit';
  const mp = inwork2.orders.find(o => o.so === '63361'); mp.complete = true; mp.inworkStatus = 'Completed';
  inwork2.orders.push({ ...lj, so: '65001', customer: 'Fresh Order', date: '2026-08-20', paid: 0, balance: 500, amount: 500, complete: false, inworkStatus: 'In Production' });
  const second = buildBrief({ inwork: inwork2, quickbooks: qb, previous: first, now: NOW, lookbackDays: 1 });
  assert.deepEqual(second.changes.paymentsPosted.map(c => [c.so, c.delta]), [['62911', 1000]]);
  assert.deepEqual(second.changes.statusChanged.map(c => [c.so, c.from, c.to]), [['63185', 'Service', 'In Transit']]);
  assert.deepEqual(second.changes.completed.map(c => c.so), ['63361']);
  assert.deepEqual(second.changes.added.map(c => c.so), ['65001']);
  assert.ok(second.newOrders.some(o => o.so === '65001'), 'orders not in the previous snapshot count as new even if dated earlier');
});

test('renders markdown, csv and app payload', () => {
  const inwork = parseInworkWorkbook(inworkWorkbook());
  const brief = buildBrief({ inwork, quickbooks: null, previous: null, now: NOW });
  const md = renderBriefMarkdown(brief);
  assert.match(md, /^# Empire Safe — Orders & QuickBooks brief for 2026-09-03/);
  assert.match(md, /\| In Production \| 2 \|/);
  assert.match(md, /Past deliver-by date/);
  assert.doesNotMatch(md, /undefined|NaN/);
  const csv = ordersToCsv(brief.orders);
  assert.equal(csv.split('\n')[0], 'so,customer,model,rep,date,deliverBy,deliverByDate,inworkStatus,complete,amount,paid,balance,paymentStatus,paymentMethod,shipMethod,deliveryType,dest,source');
  assert.equal(csv.trim().split('\n').length, 7);
  const app = ordersForApp(brief.orders);
  assert.equal(app.orders.length, 5);
  assert.equal(app.orders[0].make, 'Empire Safe');
  assert.ok(app.orders.every(o => o.inworkStatus !== 'Completed'));
});
