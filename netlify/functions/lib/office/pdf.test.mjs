import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAgreement, sha256, toPdfText, signaturePng } from './pdf.mjs';
import { findAgreementTemplate, fillBlocks } from './agreement-templates.mjs';
import { PNG, DATA_URL, pngDeclaring } from './test-fixtures.mjs';

const fields = {
  legalName: 'Lova Content Creation LLC', entityType: 'LLC', address: '1 Main St, Lehi, Utah 84043', signerName: 'Sierra Lee', signerTitle: 'Owner',
  email: 's@example.com', phone: '(801) 555-0100', buildFee: 175000, monthlyFee: 15000, deposit: 87500, balance: 87500, pages: 8,
  discountApplied: true,
  discount: { name: 'Founding client', type: 'Fixed dollar amount', amount: '$350', adjustedBuildFee: 140000, monthlyType: '', monthlyAmount: '', discountedMonthlyFee: null, months: null, conditions: 'Testimonial' },
};

test('toPdfText keeps WinAnsi characters and replaces the rest', () => {
  assert.equal(toPdfText('Fee — “quoted” ☐ Yes ☑ No • ok'), 'Fee — “quoted” [ ] Yes [x] No • ok');
  assert.equal(toPdfText('中文'), '??');
});

test('signaturePng accepts a small PNG data URL and nothing else', () => {
  assert.deepEqual([...signaturePng(DATA_URL)], [...PNG]);
  assert.equal(signaturePng('data:image/jpeg;base64,AAAA'), null);
  assert.equal(signaturePng(`data:image/png;base64,${Buffer.from('not a png').toString('base64')}`), null);
  assert.equal(signaturePng(`data:image/png;base64,${Buffer.alloc(250_000, 1).toString('base64')}`), null);
  assert.equal(signaturePng(''), null);
});

test('signaturePng rejects magic bytes with a corrupt chunk body', () => {
  const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const garbage = Buffer.concat([magic, Buffer.alloc(64, 7)]);
  assert.equal(signaturePng(`data:image/png;base64,${garbage.toString('base64')}`), null);
});

test('signaturePng refuses a small file that declares a huge bitmap', () => {
  assert.equal(signaturePng(pngDeclaring(7000, 7000)), null);
  assert.equal(signaturePng(pngDeclaring(2001, 100)), null);
  assert.equal(signaturePng(pngDeclaring(100, 801)), null);
  assert.notEqual(signaturePng(pngDeclaring(600, 200)), null);
  assert.notEqual(signaturePng(DATA_URL), null);
});

test('a full agreement renders to a multi-page PDF without throwing', async () => {
  const blocks = fillBlocks(findAgreementTemplate('search-plus'), fields);
  const bytes = await renderAgreement({ blocks });
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  const text = Buffer.from(bytes).toString('latin1');
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.ok(pages >= 8, `expected many pages, got ${pages}`);
  assert.ok(bytes.byteLength > 20_000);
});

test('signatures and the certificate page are drawn, and the hash is stable', async () => {
  const blocks = fillBlocks(findAgreementTemplate('presence'), { ...fields, discountApplied: false });
  const plain = await renderAgreement({ blocks });
  const signed = await renderAgreement({
    blocks,
    signatures: { keepsite: { png: PNG, name: 'Sierra Nichols', signedAt: '2026-09-08T16:00:00.000Z' }, client: { png: PNG, name: 'Sierra Lee', signedAt: '2026-09-09T10:00:00.000Z' } },
    certificate: {
      agreementId: '20260908T160000abcdef', template: 'presence', version: '2026-09-04', hash: 'deadbeef',
      signers: [{ party: 'keepsite', name: 'Sierra Nichols', email: 'k@x', ip: '1.1.1.1', userAgent: 'UA', signedAt: '2026-09-08T16:00:00.000Z' }],
      audit: [{ at: '2026-09-08T16:00:00.000Z', event: 'created', party: 'admin', ip: null, note: null }],
    },
  });
  const count = (b) => (Buffer.from(b).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.equal(count(signed), count(plain) + 1);
  assert.ok(Buffer.from(signed).toString('latin1').includes('/Subtype /Image'));
  assert.equal(sha256(new Uint8Array([1, 2, 3])), '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
});

test('renders of the same blocks are byte-identical', async () => {
  const blocks = fillBlocks(findAgreementTemplate('presence'), { ...fields, discountApplied: false });
  const a = await renderAgreement({ blocks });
  const b = await renderAgreement({ blocks });
  assert.deepEqual(Buffer.from(a), Buffer.from(b));

  const renderedAt = new Date('2026-01-01T00:00:00.000Z');
  const c = await renderAgreement({ blocks, renderedAt });
  const d = await renderAgreement({ blocks, renderedAt });
  assert.deepEqual(Buffer.from(c), Buffer.from(d));
  assert.notDeepEqual(Buffer.from(a), Buffer.from(c));
});

test('an unknown block kind renders as a paragraph instead of throwing', async () => {
  const bytes = await renderAgreement({ blocks: [{ type: 'title', text: 'Doc' }, { type: 'list', text: 'x' }] });
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
});
