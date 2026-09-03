import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickBooksReportWorkbook, normalizeQuickBooksJson, destinationFromText } from '../quickbooks.js';
import { qbReportWorkbook, qbJsonExport } from './fixtures.js';

test('parses the Open Sales Orders by Customer report', () => {
  const r = parseQuickBooksReportWorkbook(qbReportWorkbook());
  assert.equal(r.salesOrders.length, 2);
  const a = r.salesOrders.find(s => s.so === '63441');
  assert.equal(a.customer, 'Adamas Diamonds USA Limited');
  assert.equal(a.date, '2025-02-13');
  assert.equal(a.amount, 15735);
  assert.equal(a.openBalance, 15735);
  assert.equal(a.lines.length, 3);
  assert.equal(a.deliveryType, 'Local Delivery');
  assert.match(a.dest, /Elk Grove/);
  assert.equal(a.model, 'Tag#6012 Rec ISM TR 4722');

  const t = r.salesOrders.find(s => s.so === '62746');
  assert.equal(t.customer, 'Tourneau');
  assert.equal(t.amount, 42329);
  assert.equal(t.openBalance, 25983);
  assert.equal(t.dest, 'Honolulu', 'tax line city used when no ship-to text');
});

test('normalises the qbXML JSON export and derives paid-to-date', () => {
  const q = normalizeQuickBooksJson(qbJsonExport());
  assert.equal(q.source, 'qbxml');
  assert.equal(q.salesOrders.length, 3);
  assert.equal(q.openSalesOrders.length, 2, 'fully invoiced SO is not open');
  const t = q.salesOrders.find(s => s.so === '62746');
  assert.equal(t.paid, 16346);
  assert.equal(t.invoiced, 16346);
  assert.equal(t.openBalance, 25983);
  assert.equal(t.dest, 'Tourneau, Ala Moana, Honolulu, HI 96814');
  const n = q.salesOrders.find(s => s.so === '64999');
  assert.equal(n.deliveryType, 'Local Delivery');
  assert.equal(n.dueDate, '2026-09-08');
  assert.equal(q.invoices[1].balance, 5000);
  assert.equal(q.payments[0].method, 'Wire');
});

test('extracts destinations', () => {
  assert.equal(destinationFromText('Shipping To Empire Network Installer: SHIP TO: Jane Doe 12 Main St, Austin, TX'), 'Jane Doe 12 Main St, Austin, TX');
  assert.equal(destinationFromText('Delivery and Installation to Commercial Building Location in Chicago, IL with NO Steps'), 'Chicago, IL');
});
