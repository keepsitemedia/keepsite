import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payment } from './payment.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com', tier: 'Search', stripeCustomerId: null });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/payment', { method: 'POST', body: d });
};
const stripe = (answers) => async (url) => {
  const next = answers.shift();
  if (!next) throw new Error(`unexpected Stripe call: ${url}`);
  return new Response(JSON.stringify(next), { status: next.error ? 400 : 200 });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; process.env.STRIPE_SECRET_KEY = 'sk_test_1'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; delete process.env.STRIPE_SECRET_KEY; });
const ctx = () => ({ admin: { email: 'me' }, csrf });
const NOW = new Date('2026-09-08T16:00:00Z');
const loc = (res) => decodeURIComponent(res.headers.get('Location'));

test('checkout creates a customer and a pending payment and lands on the payments tab', async () => {
  const s = await make();
  const res = await payment(post({ csrf, op: 'checkout', slug: 'lova', kind: 'deposit', amount: '875', description: 'Deposit for Lova' }), ctx(), s, stripe([{ id: 'cus_1' }, { id: 'cs_1', url: 'https://checkout/cs_1', payment_intent: 'pi_1' }]), NOW);
  assert.equal(loc(res), '/office/clients/lova/?tab=payments');
  const [p] = await s.payments.list('lova');
  assert.equal(p.kind, 'deposit');
  assert.equal(p.amount, 87500);
  assert.equal(p.status, 'pending');
  assert.equal((await s.clients.get('lova')).stripeCustomerId, 'cus_1');
});

test('checkout validates kind and amount', async () => {
  const s = await make();
  const none = async () => { throw new Error('must not call Stripe'); };
  assert.match(loc(await payment(post({ csrf, op: 'checkout', slug: 'lova', kind: 'tip', amount: '10', description: 'x' }), ctx(), s, none)), /error=kind must be deposit or balance/);
  assert.match(loc(await payment(post({ csrf, op: 'checkout', slug: 'lova', kind: 'deposit', amount: '0', description: 'x' }), ctx(), s, none)), /error=amount must be a positive dollar amount/);
  assert.match(loc(await payment(post({ csrf, op: 'checkout', slug: 'lova', kind: 'deposit', amount: 'abc', description: 'x' }), ctx(), s, none)), /error=amount must be/);
  assert.match(loc(await payment(post({ csrf, op: 'checkout', slug: 'lova', kind: 'deposit', amount: '875', description: '' }), ctx(), s, none)), /error=description is required/);
  assert.equal((await s.payments.list('lova')).length, 0);
});

test('a Stripe error becomes a readable redirect and stores nothing', async () => {
  const s = await make();
  const res = await payment(post({ csrf, op: 'checkout', slug: 'lova', kind: 'balance', amount: '875', description: 'Balance' }), ctx(), s, stripe([{ error: { message: 'Invalid API Key provided' } }]), NOW);
  assert.match(loc(res), /error=Invalid API Key provided/);
  assert.equal((await s.payments.list('lova')).length, 0);
});

test('subscribe starts the monthly with an optional start day', async () => {
  const s = await make();
  await s.clients.put('lova', { ...(await s.clients.get('lova')), stripeCustomerId: 'cus_1' });
  const res = await payment(post({ csrf, op: 'subscribe', slug: 'lova', amount: '150', description: 'Search monthly', start: '2026-10-01' }), ctx(), s, stripe([{ data: [{ id: 'pm_1', type: 'us_bank_account', created: 1 }] }, { id: 'prod_1' }, { id: 'sub_1', status: 'active' }]), NOW);
  assert.equal(loc(res), '/office/clients/lova/?tab=payments');
  const [p] = await s.payments.list('lova');
  assert.equal(p.kind, 'subscription');
  assert.equal(p.amount, 15000);
  const bad = await payment(post({ csrf, op: 'subscribe', slug: 'lova', amount: '150', description: 'x', start: '2026-13-01' }), ctx(), s, async () => { throw new Error('no'); });
  assert.match(loc(bad), /error=start must be a date/);
});

test('customer op creates the Stripe customer by itself', async () => {
  const s = await make();
  await payment(post({ csrf, op: 'customer', slug: 'lova' }), ctx(), s, stripe([{ id: 'cus_9' }]), NOW);
  assert.equal((await s.clients.get('lova')).stripeCustomerId, 'cus_9');
});

test('refusals: csrf, unknown client, unknown op, and a missing Stripe key', async () => {
  const s = await make();
  const none = async () => { throw new Error('no'); };
  assert.equal((await payment(post({ csrf: 'x', op: 'customer', slug: 'lova' }), ctx(), s, none)).status, 403);
  assert.equal((await payment(post({ csrf, op: 'customer', slug: 'ghost' }), ctx(), s, none)).status, 404);
  assert.equal((await payment(post({ csrf, op: 'refund', slug: 'lova' }), ctx(), s, none)).status, 400);
  delete process.env.STRIPE_SECRET_KEY;
  try {
    assert.match(loc(await payment(post({ csrf, op: 'customer', slug: 'lova' }), ctx(), s, none)), /error=STRIPE_SECRET_KEY is not set/);
  } finally {
    process.env.STRIPE_SECRET_KEY = 'sk_test_1';
  }
});
