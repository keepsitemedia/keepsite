import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgreementTemplates, findAgreementTemplate, validateAgreementTemplate, formatMoney, fieldValues, fillBlocks, PLACEHOLDERS, RETIRED } from './agreement-templates.mjs';

const fields = {
  legalName: 'Lova Content Creation LLC', entityType: 'LLC', address: '1 Main St, Lehi, Utah', signerName: 'Sierra Lee', signerTitle: 'Owner',
  email: 's@example.com', phone: '(801) 555-0100',
  buildFee: 180000, monthlyFee: 16000, deposit: 90000, balance: 90000, pages: 8,
  paymentPlan: 'Half and half', arms: '',
  discountApplied: false,
  discount: { name: '', type: '', amount: '', adjustedBuildFee: null, monthlyType: '', monthlyAmount: '', discountedMonthlyFee: null, months: null, conditions: '' },
};

test('the four current templates load, validate and carry their tier; the retired two still resolve', () => {
  const all = loadAgreementTemplates();
  assert.deepEqual(all.map((t) => t.id), ['presence', 'growth', 'agile', 'range']);
  assert.deepEqual(all.map((t) => t.tier), ['Presence', 'Growth', 'Agile', 'Range']);
  for (const t of all) assert.deepEqual(validateAgreementTemplate(t), [], t.id);
  assert.deepEqual(findAgreementTemplate('growth').defaults, { buildFee: '$1,800', monthlyFee: '$160', pages: 8 });
  assert.deepEqual(findAgreementTemplate('range').defaults, { buildFee: '$2,100', monthlyFee: '$350', pages: 16 });
  assert.equal(findAgreementTemplate('search').id, 'search');
  assert.equal(findAgreementTemplate('search-plus').id, 'search-plus');
  assert.ok(RETIRED.has('search') && RETIRED.has('search-plus'));
  assert.equal(findAgreementTemplate('nope'), undefined);
});

test('validateAgreementTemplate requires a current tier unless the template is retired', () => {
  const base = { name: 'X', version: 'v', defaults: {}, blocks: [{ type: 'signatures', intro: '', parties: [], note: '' }] };
  assert.match(validateAgreementTemplate({ ...base, id: 'x' }).join(), /tier/);
  assert.match(validateAgreementTemplate({ ...base, id: 'x', tier: 'Search' }).join(), /tier/);
  assert.deepEqual(validateAgreementTemplate({ ...base, id: 'x', tier: 'Agile' }), []);
  assert.deepEqual(validateAgreementTemplate({ ...base, id: 'search' }), []);
});

test('every placeholder in every template is known', () => {
  for (const t of loadAgreementTemplates()) {
    const text = JSON.stringify(t.blocks);
    for (const m of text.matchAll(/\{\{([a-zA-Z.]+)\}\}/g)) assert.ok(PLACEHOLDERS.includes(m[1]), `${t.id}: ${m[1]}`);
  }
  assert.ok(PLACEHOLDERS.includes('paymentPlan') && PLACEHOLDERS.includes('arms'));
});

test('validateAgreementTemplate names problems', () => {
  assert.match(validateAgreementTemplate({ id: 'x' }).join(), /blocks/);
  assert.match(validateAgreementTemplate({ id: 'x', name: 'X', version: 'v', defaults: {}, blocks: [{ type: 'weird' }] }).join(), /type/);
  assert.match(validateAgreementTemplate({ id: 'x', name: 'X', version: 'v', defaults: {}, blocks: [{ type: 'p', text: 'Hi {{ghost}}' }] }).join(), /ghost/);
  assert.match(validateAgreementTemplate({ id: 'x', name: 'X', version: 'v', defaults: {}, blocks: [{ type: 'p', text: 'no signatures block' }] }).join(), /signatures/);
});

test('formatMoney drops cents when whole', () => {
  assert.equal(formatMoney(110000), '$1,100');
  assert.equal(formatMoney(110050), '$1,100.50');
  assert.equal(formatMoney(0), '$0');
});

test('fieldValues formats money, computes percents and spells out the discount flag', () => {
  const v = fieldValues(fields);
  assert.equal(v.buildFee, '$1,800');
  assert.equal(v.deposit, '$900');
  assert.equal(v.depositPercent, '50');
  assert.equal(v.balancePercent, '50');
  assert.equal(v.pages, '8');
  assert.equal(v.discountApplied, 'No');
  assert.equal(v['discount.name'], '—');
  const d = fieldValues({ ...fields, discountApplied: true, deposit: 70000, balance: 70000, discount: { ...fields.discount, name: 'Founding client', type: 'Fixed dollar amount', amount: '$350', adjustedBuildFee: 140000, months: 6, conditions: 'Testimonial; portfolio use' } });
  assert.equal(d.discountApplied, 'Yes — Exhibit D attached');
  assert.equal(d['discount.adjustedBuildFee'], '$1,400');
  assert.equal(d.depositPercent, '50');
  assert.equal(d['discount.months'], '6');
});

test('fillBlocks substitutes and drops Exhibit D unless a discount applies', () => {
  const t = findAgreementTemplate('growth');
  const plain = fillBlocks(t, fields);
  assert.ok(!plain.some((b) => b.section === 'discount'));
  assert.ok(!JSON.stringify(plain).includes('{{'));
  const schedule = plain.find((b) => b.type === 'table' && b.rows[1]?.[0] === 'Legal business name');
  assert.equal(schedule.rows[1][1], 'Lova Content Creation LLC');
  const terms = plain.find((b) => b.type === 'table' && b.rows[0]?.[2] === 'If left blank');
  assert.equal(terms.rows[4][1], '$900 (50%)');
  const sig = plain.find((b) => b.type === 'signatures');
  assert.equal(sig.parties[1].name, 'Sierra Lee');
  assert.equal(sig.parties[0].name, 'Sierra Nichols');
  const withDiscount = fillBlocks(t, { ...fields, discountApplied: true });
  assert.ok(withDiscount.some((b) => b.section === 'discount'));
  assert.ok(withDiscount.length > plain.length);
});
