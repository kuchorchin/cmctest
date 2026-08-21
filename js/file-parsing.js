/* ------------------------------------------------------------------ *
 *  Sales file reader
 *  Drop-in replacement for COLS / matchCol / rowsFromMatrix / readFile.
 *
 *  readFile(file) -> { rows, columns, warnings, headers }
 *    rows     : [{ date, customer, amount, rate }]
 *    columns  : which heading was used for each field (show this to the user)
 *    warnings : non-fatal things worth telling the user
 *    headers  : every heading found, for error messages
 * ------------------------------------------------------------------ */

/* Each field is scored, not just matched.
   exact   — full heading, best match first
   contains— fallback keywords, only used if no exact hit
   never   — if the heading contains any of these, the column is disqualified */
const FIELDS = {
  amount: {
    exact: [
      'amount after vat', 'amount paid vat', 'amount paid', 'net amount',
      'net value', 'sale amount', 'sales amount', 'order value', 'sales value',
      'amount', 'revenue', 'total', 'sale', 'sales', 'value', 'price',
    ],
    contains: ['amount', 'revenue', 'value', 'total'],
    never: ['reject', 'discount', 'zdj', 'rate', 'qty', 'quantity', 'tax', 'freight'],
  },
  date: {
    exact: [
      'document date', 'billing date', 'sale date', 'closed date', 'order date',
      'actual gi date', 'date', 'closed', 'day',
    ],
    contains: ['date'],
    never: ['time', 'planned', 'delivery status'],
  },
  customer: {
    exact: [
      'sold-to party name (en)', 'sold-to party name', 'ship-to party name (en)',
      'ship-to party name', 'customer name', 'customer', 'client', 'account name',
      'account', 'company', 'name',
    ],
    contains: ['party name', 'customer', 'client', 'account'],
    never: ['no.', 'number', 'code', 'id', 'material', 'plant', 'zone'],
  },
  rate: {
    exact: ['commission rate', 'commission %', 'comm rate', 'commission', 'rate'],
    contains: ['commission'],
    never: ['discount', 'vat', 'tax', 'exchange', 'special'],
  },
};

const norm = (h) =>
  String(h == null ? '' : h)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** How well does this heading fit this field? Higher wins, 0 = no fit. */
function score(heading, field) {
  const s = norm(heading);
  if (!s) return 0;
  const rule = FIELDS[field];
  if (rule.never.some((bad) => s.includes(bad))) return 0;

  const i = rule.exact.indexOf(s);
  if (i !== -1) return 1000 - i;                       // exact heading
  const j = rule.exact.findIndex((a) => s.startsWith(a));
  if (j !== -1) return 700 - j;                        // 'amount after vat ($)'
  if (rule.contains.some((c) => s.includes(c))) return 300 - s.length;
  return 0;
}

/** Pick the single best column index for each field. */
function resolveColumns(headerRow) {
  const chosen = {};
  Object.keys(FIELDS).forEach((field) => {
    let best = { index: -1, points: 0 };
    headerRow.forEach((h, i) => {
      const p = score(h, field);
      if (p > best.points) best = { index: i, points: p };
    });
    if (best.index !== -1) chosen[field] = best.index;
  });
  return chosen;
}

/** Real exports often have title rows above the headings. Find the real one. */
function findHeaderRow(matrix) {
  let best = { index: 0, hits: -1 };
  const limit = Math.min(matrix.length, 20);
  for (let i = 0; i < limit; i++) {
    const cols = resolveColumns(matrix[i] || []);
    const hits = Object.keys(cols).length;
    if (hits > best.hits) best = { index: i, hits };
  }
  return best;
}

/* ---------- value coercion ---------- */

function toNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s || s === '-' || s === '$-') return null;
  const negative = /^\(.*\)$/.test(s);              // (1,275.00) = -1275
  s = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function toDate(v, dayFirst) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    return new Date(EXCEL_EPOCH + v * 864e5);        // Excel serial number
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m.map(Number);
    if (y < 100) y += 2000;
    const [day, month] = dayFirst ? [a, b] : [b, a];
    const d = new Date(y, month - 1, day);
    return isNaN(d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** 3/7/2026 is ambiguous. If any value has a first part above 12, it's D/M. */
function detectDayFirst(values) {
  let dayFirst = false;
  for (const v of values) {
    const m = String(v == null ? '' : v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}$/);
    if (m && Number(m[1]) > 12) { dayFirst = true; break; }
  }
  return dayFirst;
}

/* ---------- main ---------- */

function rowsFromMatrix(matrix) {
  const clean = matrix.filter((r) => r && r.some((c) => c !== null && c !== ''));
  if (!clean.length) throw new Error('That file looks empty.');

  const { index: headerIndex } = findHeaderRow(clean);
  const headerRow = clean[headerIndex];
  const cols = resolveColumns(headerRow);
  const headers = headerRow.map((h) => String(h == null ? '' : h).trim()).filter(Boolean);

  if (cols.amount === undefined) {
    throw new Error(
      'No sale amount column found. The headings in this file are: ' +
      headers.slice(0, 25).join(', ') +
      '. Rename the one holding the sale value to "Amount".'
    );
  }

  const body = clean.slice(headerIndex + 1);
  const headerFingerprint = norm(headerRow.join('|'));
  const warnings = [];

  const dayFirst = detectDayFirst(
    cols.date === undefined ? [] : body.map((r) => r[cols.date])
  );

  const rows = [];
  let skippedHeaders = 0;
  let skippedBlank = 0;

  for (const line of body) {
    if (norm(line.join('|')) === headerFingerprint) { skippedHeaders++; continue; }

    const amount = toNumber(line[cols.amount]);
    if (amount === null || amount === 0) { skippedBlank++; continue; }

    let rate = cols.rate === undefined ? null : toNumber(line[cols.rate]);
    if (rate !== null && rate > 1) rate = rate / 100;

    rows.push({
      date: cols.date === undefined ? null : toDate(line[cols.date], dayFirst),
      customer: cols.customer === undefined ? '' : String(line[cols.customer] ?? '').trim().slice(0, 200),
      amount,
      rate,
    });
  }

  if (!rows.length) {
    throw new Error('Found the "' + headers[cols.amount] + '" column, but no row in it had a number.');
  }

  if (headerIndex > 0) warnings.push('Skipped ' + headerIndex + ' row(s) above the headings.');
  if (skippedHeaders) warnings.push('Ignored ' + skippedHeaders + ' repeated heading row(s) inside the file.');
  if (skippedBlank) warnings.push('Skipped ' + skippedBlank + ' row(s) with no sale amount.');
  if (cols.customer === undefined) warnings.push('No customer column found — sales are not split by customer.');
  if (cols.date === undefined) warnings.push('No date column found — sales are not split by month.');
  if (cols.rate === undefined) warnings.push('No commission rate column — using your default rate.');
  if (dayFirst) warnings.push('Dates read as day/month/year.');

  const seen = new Set();
  let dupes = 0;
  rows.forEach((r) => {
    const k = (r.date ? r.date.getTime() : '') + '|' + r.customer + '|' + r.amount;
    if (seen.has(k)) dupes++; else seen.add(k);
  });
  if (dupes) warnings.push(dupes + ' row(s) look like exact duplicates — check the file before trusting the total.');

  const columns = {};
  Object.entries(cols).forEach(([field, i]) => { columns[field] = String(headerRow[i]).trim(); });

  return { rows, columns, warnings, headers };
}

/* ---------- file loading ---------- */

function splitCSVLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; continue; }
      q = !q; continue;
    }
    if ((ch === ',' || ch === '\t') && !q) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDelimitedText(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length);
  return rowsFromMatrix(lines.map(splitCSVLine));
}

function readFile(file) {
  const n = file.name.toLowerCase();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('That file could not be opened.'));

    if (n.endsWith('.csv') || n.endsWith('.tsv') || n.endsWith('.txt') || file.type === 'text/csv') {
      r.onload = () => { try { resolve(parseDelimitedText(r.result)); } catch (e) { reject(e); } };
      r.readAsText(file);
    } else if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.xlsm')) {
      if (typeof XLSX === 'undefined') {
        return reject(new Error('The spreadsheet reader did not load. Save your sheet as .csv and try again.'));
      }
      r.onload = () => {
        try {
          const wb = XLSX.read(new Uint8Array(r.result), { type: 'array', cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const m = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false, defval: null });
          resolve(rowsFromMatrix(m));
        } catch (e) { reject(e); }
      };
      r.readAsArrayBuffer(file);
    } else {
      reject(new Error('Only .csv and .xlsx files can be read. Save your sheet in one of those formats.'));
    }
  });
}
