import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInworkWorkbook, mapColumns, canonicalStatus } from '../inwork.js';
import { inworkWorkbook } from './fixtures.js';

test('maps Inwork headers to fields', () => {
  const m = mapColumns(['In Production', 'Customer Name', 'Date', 'On Calendar', 'Deliver By Date', 'Num', 'Item', 'Amount', 'Rep', 'Paid', 'Balance', 'Ship Via', 'Payment Method', 'Complete']);
  assert.equal(m.customer, 1); assert.equal(m.date, 2); assert.equal(m.onCalendar, 3); assert.equal(m.deliverBy, 4);
  assert.equal(m.so, 5); assert.equal(m.item, 6); assert.equal(m.amount, 7); assert.equal(m.rep, 8); assert.equal(m.paid, 9);
  assert.equal(m.balance, 10); assert.equal(m.shipVia, 11); assert.equal(m.paymentMethod, 12); assert.equal(m.complete, 13);
});

test('canonicalises status labels', () => {
  assert.equal(canonicalStatus('In Production'), 'In Production');
  assert.equal(canonicalStatus('in storage / on rental'), 'In Storage/On Rental');
  assert.equal(canonicalStatus('HOLD FOR CONFIRM'), 'Hold for Confirm');
  assert.equal(canonicalStatus('Tourneau'), '');
});

test('parses the Inwork workbook with status sections', () => {
  const r = parseInworkWorkbook(inworkWorkbook());
  assert.deepEqual(r.skippedSheets, ['Morning Brief']);
  assert.equal(r.orders.length, 6);
  const bySo = Object.fromEntries(r.orders.map(o => [o.so, o]));

  const t = bySo['62746'];
  assert.equal(t.customer, 'Tourneau');
  assert.equal(t.inworkStatus, 'In Production');
  assert.equal(t.date, '2024-06-17');
  assert.equal(t.amount, 42329);
  assert.equal(t.paid, 16346);
  assert.equal(t.balance, 25983);
  assert.equal(t.paymentStatus, 'Partial');
  assert.equal(t.deliverBy, 'Mid-June');
  assert.equal(t.deliverByDate, '');
  assert.equal(t.deliveryType, 'Ship Out');
  assert.equal(t.paymentMethod, 'E-Check');

  const gs = bySo['62925'];
  assert.equal(gs.date, '2024-08-14', 'Excel serial dates are converted');
  assert.equal(gs.deliverByDate, '2024-08-27');
  assert.equal(gs.paymentStatus, 'Paid');

  assert.equal(bySo['63185'].inworkStatus, 'Service');
  assert.equal(bySo['63185'].deliveryType, 'Local Delivery');
  assert.equal(bySo['63361'].inworkStatus, 'Hold for Confirm');
  assert.equal(bySo['63361'].deliverByDate, '');

  const lj = bySo['62911'];
  assert.equal(lj.inworkStatus, 'In Storage/On Rental');
  assert.equal(lj.deliverByDate, '2024-08-13', 'M/D without a year borrows the order year');

  const done = bySo['64444'];
  assert.equal(done.complete, true);
  assert.equal(done.inworkStatus, 'Completed');
  assert.ok(!r.orders.some(o => /total/i.test(o.so) || /total/i.test(o.customer)), 'total rows are skipped');
});
