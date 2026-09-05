import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAgreement, sha256, toPdfText, signaturePng } from './pdf.mjs';
import { findAgreementTemplate, fillBlocks } from './agreement-templates.mjs';

const fields = {
  legalName: 'Lova Content Creation LLC', entityType: 'LLC', address: '1 Main St, Lehi, Utah 84043', signerName: 'Sierra Lee', signerTitle: 'Owner',
  email: 's@example.com', phone: '(801) 555-0100', buildFee: 175000, monthlyFee: 15000, deposit: 87500, balance: 87500, pages: 8,
  discountApplied: true,
  discount: { name: 'Founding client', type: 'Fixed dollar amount', amount: '$350', adjustedBuildFee: 140000, monthlyType: '', monthlyAmount: '', discountedMonthlyFee: null, months: null, conditions: 'Testimonial' },
};
// A 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;

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
