// CSV for a bookkeeper's spreadsheet. Nested values go out as JSON text
// rather than being dropped; a leading formula character gets an apostrophe
// because Excel and Sheets would otherwise execute it.
const cell = (v) => {
  let s;
  if (v == null) s = '';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  if (rows.length === 0) return '';
  const keys = [];
  const seen = new Set();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  const lines = [keys.map(cell).join(',')];
  for (const r of rows) lines.push(keys.map((k) => cell(r[k])).join(','));
  return lines.join('\r\n') + '\r\n';
}
