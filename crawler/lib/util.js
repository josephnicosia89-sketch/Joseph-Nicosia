// Shared helpers for the SafeTech morning-brief crawler.

export function normKey(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return toISODate(v);
  return String(v).trim();
}

export function isBlank(v) {
  return v == null || String(v).trim() === '';
}

export function nonEmptyCells(row) {
  const out = [];
  (row || []).forEach((v, i) => { if (!isBlank(v)) out.push({ i, v }); });
  return out;
}

export function parseMoney(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  s = s.replace(/[$,\s]/g, '');
  if (/%$/.test(s)) return 0;
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}

export function round2(n) { return Math.round((n || 0) * 100) / 100; }

// Excel serial (1900 date system) -> Date at UTC midnight.
export function excelSerialToDate(n) {
  return new Date(Math.round((n - 25569) * 86400000));
}

function pad(n) { return String(n).padStart(2, '0'); }

export function dateToISO(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

/**
 * Best-effort date normalisation to YYYY-MM-DD.
 * Accepts Date, Excel serial numbers, "MM/DD/YYYY", "M/D/YY", "M-D-YY", "YYYY-MM-DD".
 * `refYear` supplies the year for "M/D" strings with no year.
 * Returns '' when the value is not a date (e.g. "TBD", "Mid-June").
 */
export function toISODate(v, refYear) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : dateToISO(v);
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return dateToISO(excelSerialToDate(v));
    return '';
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s.*)?$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    return build(y, +m[1], +m[2]);
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const y = refYear || new Date().getFullYear();
    return build(y, +m[1], +m[2]);
  }
  return '';
}

function build(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return '';
  return dateToISO(dt);
}

export function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = Date.parse(isoA + 'T00:00:00Z'), b = Date.parse(isoB + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function addDays(iso, n) {
  const t = Date.parse(iso + 'T00:00:00Z');
  return dateToISO(new Date(t + n * 86400000));
}

export function todayISO(now) {
  const d = now || new Date();
  // Local calendar day, expressed as YYYY-MM-DD.
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function computePaySt(amt, paid) {
  if (amt <= 0) return 'Unpaid';
  if (paid >= amt - 0.005) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
}

// Same mapping the SafeTech app uses for the Inwork "Ship Via" column.
export function deliveryTypeFromShipMethod(sm) {
  const s = String(sm || '').toLowerCase();
  if (!s) return '';
  if (/empire|field|pick|truck|install/.test(s)) return 'Local Delivery';
  if (/abf|ups|daylight|fedex|freight|ltl|ship|carrier|estes|xpo|saia|r\+l|yrc/.test(s)) return 'Ship Out';
  return '';
}

export function truthy(v) {
  if (v === true) return true;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return ['x', 'y', 'yes', 'true', '1', 'done', 'complete', 'completed', '✓', '✔'].includes(s);
}

export function fmtMoney(n) {
  const v = round2(n || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
