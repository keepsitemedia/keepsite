import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreement } from './agreement.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com', phone: '', address: '', tier: 'Search' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/agreement', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me@x' }, csrf });
const NOW = new Date('2026-09-08T16:00:00Z');
const loc = (res) => decodeURIComponent(res.headers.get('Location'));
const createFields = {
  csrf, op: 'create', slug: 'lova', template: 'search',
  legalName: 'Lova Content Creation LLC', entityType: 'LLC', address: '1 Main St', signerName: 'Sierra Lee', signerTitle: 'Owner', email: 's@example.com', phone: '(801) 555-0100',
  buildFee: '1750', monthlyFee: '150', deposit: '875', balance: '875', pages: '8',
};

test('create stores a draft with cents and redirects to the admin signing page', async () => {
  const s = await make();
  const res = await agreement(post(createFields), ctx(), s, NOW);
  const [a] = await s.agreements.list('lova');
  assert.equal(loc(res), `/office/agreements/lova/${a.id}/sign/`);
  assert.equal(a.status, 'draft');
  assert.equal(a.fields.buildFee, 175000);
  assert.equal(a.fields.deposit, 87500);
  assert.equal(a.fields.pages, 8);
  assert.equal(a.fields.discountApplied, false);
  assert.equal(a.signers.client.email, 's@example.com');
});

test('create with a discount stores Exhibit D values', async () => {
  const s = await make();
  await agreement(post({ ...createFields, discountApplied: 'on', deposit: '700', balance: '700', discount_name: 'Founding client', discount_type: 'Fixed dollar amount', discount_amount: '$350', discount_adjustedBuildFee: '1400', discount_months: '6', discount_conditions: 'Testimonial' }), ctx(), s, NOW);
  const [a] = await s.agreements.list('lova');
  assert.equal(a.fields.discountApplied, true);
  assert.equal(a.fields.discount.adjustedBuildFee, 140000);
  assert.equal(a.fields.discount.months, 6);
  assert.equal(a.fields.discount.name, 'Founding client');
});

test('create validates', async () => {
  const s = await make();
  assert.match(loc(await agreement(post({ ...createFields, template: 'nope' }), ctx(), s, NOW)), /error=unknown template/);
  assert.match(loc(await agreement(post({ ...createFields, legalName: '' }), ctx(), s, NOW)), /error=legal business name/);
  assert.match(loc(await agreement(post({ ...createFields, email: 'bad' }), ctx(), s, NOW)), /error=email/);
  assert.match(loc(await agreement(post({ ...createFields, deposit: 'abc' }), ctx(), s, NOW)), /error=deposit/);
  assert.match(loc(await agreement(post({ ...createFields, deposit: '1000', balance: '1000' }), ctx(), s, NOW)), /error=deposit and balance must add up/);
  assert.equal((await s.agreements.list('lova')).length, 0);
});

test('send signs as Keepsite and lands on the agreement email; void marks voided', async () => {
  const s = await make();
  await agreement(post(createFields), ctx(), s, NOW);
  const [a] = await s.agreements.list('lova');
  const res = await agreement(post({ csrf, op: 'send', slug: 'lova', id: a.id, signature: DATA_URL }), ctx(), s, NOW);
  assert.equal(loc(res), '/office/send/lova/agreement/');
  const sent = await s.agreements.get('lova', a.id);
  assert.equal(sent.status, 'sent');
  assert.equal(sent.signers.keepsite.status, 'signed');
  assert.match(loc(await agreement(post({ csrf, op: 'send', slug: 'lova', id: a.id, signature: 'nope' }), ctx(), s, NOW)), /error=/);
  const v = await agreement(post({ csrf, op: 'void', slug: 'lova', id: a.id, note: 'typo' }), ctx(), s, NOW);
  assert.equal(loc(v), '/office/clients/lova/?tab=agreements');
  assert.equal((await s.agreements.get('lova', a.id)).status, 'voided');
});

test('refusals', async () => {
  const s = await make();
  assert.equal((await agreement(post({ ...createFields, csrf: 'x' }), ctx(), s, NOW)).status, 403);
  assert.equal((await agreement(post({ ...createFields, slug: 'ghost' }), ctx(), s, NOW)).status, 404);
  assert.equal((await agreement(post({ csrf, op: 'nope', slug: 'lova' }), ctx(), s, NOW)).status, 400);
  assert.equal((await agreement(post({ csrf, op: 'void', slug: 'lova', id: '20260908T160000aaaaaa' }), ctx(), s, NOW)).status, 404);
});
