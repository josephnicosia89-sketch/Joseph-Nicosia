import XLSX from 'xlsx';

export function inworkWorkbook() {
  const rows = [
    ['In Production', 'Customer Name', 'Date', 'On Calendar', 'Deliver By Date', 'Num', 'Item', 'Amount', 'Rep', 'Paid', 'Balance', 'Ship Via', 'Payment Method', 'Complete'],
    ['', 'Tourneau', '06/17/2024', 'Y', 'Mid-June', 62746, 'HI-Wailea- 2025 / (2) TDR5-5927-19CD Right Swing', '42,329.00', 'RK', '16,346.00', '25,983.00', 'ABF', 'E-Check', ''],
    ['', 'Grand Seiko Corporation of America', 45518, '', '8/27/24', 62925, 'TDR5-5927-19CD, VCART-154SS', 23501.4, 'BS', 23501.4, 0, 'ABF', 'ACH', ''],
    ['Service'],
    ['', 'Ferrari Express Inc.', '11/11/2024', '', '11/12/24', 63185, 'Svc- Vault Door Repair', 5141.08, 'TD', 4714.29, 426.79, 'Field Tech', '', ''],
    ['Hold for Confirm'],
    ['', 'Marlene Perlmutter', '01/22/2025', '', 'TBD', 63361, 'AV 5018-16 with Interior', 26835, 'JT', 25935, 900, 'Empire Truck', 'WIRE', ''],
    ['In Storage/On Rental'],
    ['', 'London Jewelers', '08/12/2024', '', '8/13', 62911, 'Rental / for Repairs', 2715.62, 'RK', 0, 2715.62, 'Empire Truck', 'Check', ''],
    ['Total', '', '', '', '', '', '', 100522.1],
    ['In Transit'],
    ['', 'Done Customer', '02/01/2026', '', '02/10/2026', 64444, 'AV 1814-14', 4627.19, 'JT', 4627.19, 0, 'Empire Truck', 'Card', 'x']
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sales Order Inwork');
  const brief = [['Morning Brief'], ['MORNING BRIEF - New & Recent Sales Orders'], ['Generated:', '8/27/26 7:09 AM'], ['Lookback (days):', 1]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(brief), 'Morning Brief');
  return wb;
}

export function qbReportWorkbook() {
  const H = ['', '', '', '', '', 'Type', '', 'Date', '', 'Num', '', 'Item', '', 'Item Description', '', 'Memo', '', 'Sales Price', '', 'Amount', '', 'Open Balance'];
  const rows = [
    H,
    ['', 'Adamas Diamonds USA Limited'],
    ['', '', '', '', '', 'Sales Order', '', '02/13/2025', '', '63441', '', '', '', '', '', 'Tag#6012 Rec ISM TR 4722', '', '', '', '15,735.00', '', '15,735.00'],
    ['', '', '', '', '', 'Sales Order', '', '02/13/2025', '', '63441', '', 'Used Inventory:6012 (Recond ISM Treasury)', '', 'Recond ISM Treasury', '', 'Reconditioned ISM Treasury RIGHT Swing Safe', '', '8,950.00', '', '-8,950.00', '', '-8,950.00'],
    ['', '', '', '', '', 'Sales Order', '', '02/13/2025', '', '63441', '', 'Shipping & Handling (Shipping & Handling)', '', 'Shipping & Handling', '', 'Shipping and Handling To Empire Network Safe Installer:    SHIP TO:    MLange-Taft  1251 Pagni Dr, Elk Grove, CA', '', '745.00', '', '-745.00', '', '-745.00'],
    ['', '', '', '', '', 'Sales Order', '', '02/13/2025', '', '63441', '', 'Delivery & Installation (By Empire Truck)', '', 'By Empire Truck', '', 'Delivery and Installation to Commercial Building Location in Chicago, IL', '', '6,040.00', '', '-6,040.00', '', '-6,040.00'],
    ['', 'Total Adamas Diamonds USA Limited', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '0.00', '', '0.00'],
    ['', 'Tourneau'],
    ['', '', '', '', '', 'Sales Order', '', '06/17/2024', '', '62746', '', '', '', '', '', 'HI-Wailea', '', '', '', '42,329.00', '', '25,983.00'],
    ['', '', '', '', '', 'Sales Order', '', '06/17/2024', '', '62746', '', 'New Safes:TDR5-5927-19CD', '', 'TDR5', '', 'Two safes', '', '21,000.00', '', '-42,000.00', '', '-42,000.00'],
    ['', '', '', '', '', 'Sales Order', '', '06/17/2024', '', '62746', '', '96814 (Honolulu)', '', 'Honolulu', '', 'Honolulu', '', '4.712%', '', '-329.00', '', '-329.00'],
    ['', 'Total Tourneau', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '0.00', '', '0.00'],
    ['', 'TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '0.00', '', '0.00']
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return wb;
}

export function qbJsonExport() {
  return {
    exportedAt: '2026-09-03T05:45:00-04:00',
    company: 'C:\\QB\\Empire Safe.QBW',
    salesOrders: [
      { txnId: 'SO-1', txnDate: '2024-06-17', refNumber: '62746', customer: 'Tourneau', totalAmount: 42329, isFullyInvoiced: false, isManuallyClosed: false, salesRep: 'RK', shipMethod: 'ABF', shipAddress: 'Tourneau\nAla Moana\nHonolulu, HI 96814', linkedTxns: [{ txnId: 'INV-1', type: 'Invoice' }], lines: [{ item: 'New Safes:TDR5-5927-19CD', description: 'Two safes', qty: 2, rate: 21000, amount: 42000 }] },
      { txnId: 'SO-2', txnDate: '2026-09-02', refNumber: '64999', customer: 'Brand New Customer', totalAmount: 8000, isFullyInvoiced: false, isManuallyClosed: false, dueDate: '2026-09-08', lines: [{ item: 'New Safes:AV 1814-14', amount: 7250 }, { item: 'Delivery & Installation (By Empire Truck)', amount: 750 }] },
      { txnId: 'SO-3', txnDate: '2025-01-01', refNumber: '63000', customer: 'Closed Co', totalAmount: 1000, isFullyInvoiced: true, isManuallyClosed: false, lines: [] }
    ],
    invoices: [
      { txnId: 'INV-1', txnDate: '2024-06-20', refNumber: '10001', customer: 'Tourneau', totalAmount: 16346, appliedAmount: 16346, balanceRemaining: 0, isPaid: true, dueDate: '2024-07-20' },
      { txnId: 'INV-2', txnDate: '2026-07-01', refNumber: '10002', customer: 'Slow Payer', totalAmount: 5000, appliedAmount: 0, balanceRemaining: 5000, isPaid: false, dueDate: '2026-08-01' }
    ],
    payments: [
      { txnId: 'PAY-1', txnDate: '2026-09-02', refNumber: '5541', customer: 'Tourneau', totalAmount: 5000, paymentMethod: 'Wire', appliedTo: [] },
      { txnId: 'PAY-0', txnDate: '2026-08-01', refNumber: '5500', customer: 'Old', totalAmount: 100, paymentMethod: 'Check', appliedTo: [] }
    ],
    customers: [{ name: 'Slow Payer', balance: 5000, totalBalance: 5000 }],
    errors: []
  };
}
