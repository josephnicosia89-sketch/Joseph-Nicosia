export const STAGES = [
  'Intake queue', 'Mechanics shop', 'Paint booth', 'Drying station',
  'Packaging', 'Loading dock', 'Awaiting pickup', 'Shipped', 'Completed'
];

export const SCOL = {
  'Intake queue':    { d: '#7b5ea7', bg: 'rgba(123,94,167,.15)', t: '#b89fdc' },
  'Mechanics shop':  { d: '#e8a020', bg: 'rgba(232,160,32,.12)', t: '#e8a020' },
  'Paint booth':     { d: '#d94040', bg: 'rgba(217,64,64,.12)',  t: '#ff8080' },
  'Drying station':  { d: '#e8a020', bg: 'rgba(232,160,32,.1)',  t: '#f0c060' },
  'Packaging':       { d: '#4a6fa5', bg: 'rgba(74,111,165,.15)', t: '#7ab0e8' },
  'Loading dock':    { d: '#1a8fa0', bg: 'rgba(26,143,160,.15)', t: '#5cdae8' },
  'Awaiting pickup': { d: '#1a8fa0', bg: 'rgba(26,143,160,.12)', t: '#40c8d8' },
  'Shipped':         { d: '#2a9d5c', bg: 'rgba(42,157,92,.12)',  t: '#5ed49a' },
  'Completed':       { d: '#20b86e', bg: 'rgba(32,184,110,.18)', t: '#3fffaa' }
};

export const SHIPS = ['Pending', 'Scheduled', 'In transit', 'Delivered', 'Exception'];
export const SHIPCLS = { Pending: 'ship-p', Scheduled: 'ship-s', 'In transit': 'ship-t', Delivered: 'ship-d', Exception: 'ship-e' };

export const PAYS = ['Unpaid', 'Partial', 'Paid', 'COD'];
export const PAYCLS = { Unpaid: 'pay-unp', Partial: 'pay-part', Paid: 'pay-paid', COD: 'pay-cod' };
export const PAYICON = { Unpaid: '&#9888;', Partial: '&#189;', Paid: '&#10003;', COD: '$' };

export const STORE_KEY = 'stq_q1';
export const AUDIT_KEY = 'stq_audit';

export const QF = [
  { k: 'so',        l: 'Sales Order # *', r: true,  h: ['sales order', 'so#', 'order number', 'num', 'order#'] },
  { k: 'make',      l: 'Make',            r: false, h: ['make', 'manufacturer', 'brand', 'mfg'] },
  { k: 'model',     l: 'Model',           r: false, h: ['model', 'item', 'description', 'product'] },
  { k: 'type',      l: 'Type / Class',    r: false, h: ['type', 'class', 'security', 'category'] },
  { k: 'customer',  l: 'Customer Name',   r: false, h: ['customer', 'client', 'company', 'account', 'name'] },
  { k: 'phone',     l: 'Phone',           r: false, h: ['phone', 'telephone', 'tel', 'mobile'] },
  { k: 'dest',      l: 'Destination',     r: false, h: ['destination', 'address', 'ship to', 'delivery', 'location'] },
  { k: 'rep',       l: 'Sales Rep',       r: false, h: ['rep', 'sales rep', 'salesperson', 'agent'] },
  { k: 'date',      l: 'Order Date',      r: false, h: ['date', 'order date', 'created'] },
  { k: 'deliverBy', l: 'Deliver By',      r: false, h: ['deliver by', 'due date', 'delivery date', 'requested'] },
  { k: 'notes',     l: 'Notes',           r: false, h: ['notes', 'comments', 'remarks', 'memo', 'special'] }
];

export const CL_DEF = [
  { label: 'Work order reviewed & confirmed', done: false },
  { label: 'Safe inspected for damage on arrival', done: false },
  { label: 'Lock mechanism tested', done: false },
  { label: 'Combination / key documented', done: false },
  { label: 'Interior accessories accounted for', done: false },
  { label: 'Serial number recorded', done: false },
  { label: 'Photos taken (before work)', done: false },
  { label: 'Special instructions noted', done: false },
  { label: 'Customer notified of timeline', done: false },
  { label: 'Ready to move to next stage', done: false }
];
