// The agreements the office fills. The docx is the legal source; these JSON
// block lists are generated from it by scripts/agreement-from-docx.py and
// rendered to HTML for reading and to PDF for the record.
import presence from '../../../../src/data/office/agreements/presence.json' with { type: 'json' };
import search from '../../../../src/data/office/agreements/search.json' with { type: 'json' };
import searchPlus from '../../../../src/data/office/agreements/search-plus.json' with { type: 'json' };

const TEMPLATES = [presence, search, searchPlus];
const BLOCK_TYPES = new Set(['title', 'subtitle', 'h1', 'h2', 'h3', 'p', 'table', 'signatures']);
const PLACEHOLDER = /\{\{([a-zA-Z.]+)\}\}/g;

export const PLACEHOLDERS = [
  'legalName', 'entityType', 'address', 'signerName', 'signerTitle', 'email', 'phone',
  'buildFee', 'monthlyFee', 'deposit', 'depositPercent', 'balance', 'balancePercent', 'pages', 'discountApplied',
  'discount.name', 'discount.type', 'discount.amount', 'discount.adjustedBuildFee',
  'discount.monthlyType', 'discount.monthlyAmount', 'discount.discountedMonthlyFee', 'discount.months', 'discount.conditions',
];

export const loadAgreementTemplates = () => TEMPLATES;
export const findAgreementTemplate = (id) => TEMPLATES.find((t) => t.id === id);

export function validateAgreementTemplate(t) {
  const errors = [];
  if (!t || typeof t !== 'object') return ['template is not an object'];
  for (const k of ['id', 'name', 'version']) if (!t[k]) errors.push(`${k} is required`);
  if (!t.defaults || typeof t.defaults !== 'object') errors.push('defaults must be an object');
  if (!Array.isArray(t.blocks)) return [...errors, 'blocks must be a list'];
  let signatures = 0;
  t.blocks.forEach((b, i) => {
    if (!b || !BLOCK_TYPES.has(b.type)) return errors.push(`block ${i + 1}: unknown type ${b?.type}`);
    if (b.type === 'signatures') signatures += 1;
    if (b.type === 'table' && !Array.isArray(b.rows)) errors.push(`block ${i + 1}: table without rows`);
    for (const m of JSON.stringify(b).matchAll(PLACEHOLDER)) {
      if (!PLACEHOLDERS.includes(m[1])) errors.push(`block ${i + 1}: unknown placeholder ${m[1]}`);
    }
  });
  if (signatures !== 1) errors.push('exactly one signatures block is required');
  return errors;
}

export function formatMoney(cents) {
  const n = Number(cents ?? 0);
  const whole = Number.isInteger(n / 100);
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const percent = (part, whole) => (whole > 0 ? String(Math.round((part / whole) * 100)) : '—');
const text = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const money = (v) => (v === null || v === undefined || v === '' ? '—' : formatMoney(v));

export function fieldValues(fields) {
  const d = fields.discount ?? {};
  // Percentages are of the fee the client actually pays: the adjusted one
  // when a discount applies, otherwise the standard one.
  const effectiveBuild = fields.discountApplied && d.adjustedBuildFee ? d.adjustedBuildFee : fields.buildFee;
  return {
    legalName: text(fields.legalName), entityType: text(fields.entityType), address: text(fields.address),
    signerName: text(fields.signerName), signerTitle: text(fields.signerTitle), email: text(fields.email), phone: text(fields.phone),
    buildFee: money(fields.buildFee), monthlyFee: money(fields.monthlyFee),
    deposit: money(fields.deposit), depositPercent: percent(fields.deposit, effectiveBuild),
    balance: money(fields.balance), balancePercent: percent(fields.balance, effectiveBuild),
    pages: text(fields.pages),
    discountApplied: fields.discountApplied ? 'Yes — Exhibit D attached' : 'No',
    'discount.name': text(d.name), 'discount.type': text(d.type), 'discount.amount': text(d.amount),
    'discount.adjustedBuildFee': money(d.adjustedBuildFee),
    'discount.monthlyType': text(d.monthlyType), 'discount.monthlyAmount': text(d.monthlyAmount),
    'discount.discountedMonthlyFee': money(d.discountedMonthlyFee), 'discount.months': text(d.months),
    'discount.conditions': text(d.conditions),
  };
}

const sub = (s, values) => String(s).replace(PLACEHOLDER, (whole, name) => (name in values ? values[name] : whole));

export function fillBlocks(template, fields) {
  const values = fieldValues(fields);
  return template.blocks
    .filter((b) => b.section !== 'discount' || fields.discountApplied)
    .map((b) => {
      if (b.type === 'table') return { ...b, rows: b.rows.map((r) => r.map((c) => sub(c, values))) };
      if (b.type === 'signatures') {
        return { ...b, intro: sub(b.intro, values), note: sub(b.note, values),
          parties: b.parties.map((p) => ({ ...p, name: sub(p.name, values), title: sub(p.title, values), email: sub(p.email ?? '', values) })) };
      }
      return { ...b, text: sub(b.text, values) };
    });
}
