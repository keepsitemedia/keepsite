import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, tierPrices, newPayment, ensureCustomer, createCheckout, startSubscription } from './payments.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const NOW = new Date('2026-09-08T16:00:00Z');
const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com', tier: 'Search', stripeCustomerId: null });
  return s;
};
// A scripted Stripe: each call pops the next answer; every call is recorded.
const stripe = (answers) => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init, body: Object.fromEntries(new URLSearchParams(init?.body ?? '')) });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected Stripe call: ${url}`);
    return new Response(JSON.stringify(next), { status: next.error ? 400 : 200 });
  };
  return { calls, fetchFn };
};
test.before(() => { process.env.STRIPE_SECRET_KEY = 'sk_test_1'; delete process.env.URL; });
test.after(() => { delete process.env.STRIPE_SECRET_KEY; });

test('money and tier prices come from packages.json', () => {
  assert.equal(parseMoney('$1,100'), 110000);
  assert.equal(parseMoney('$55'), 5500);
  assert.deepEqual(tierPrices('Search'), { build: 175000, monthly: 15000 });
  assert.deepEqual(tierPrices('Presence'), { build: 110000, monthly: 5500 });
  assert.equal(tierPrices('Gold'), null);
});

test('newPayment fills every field', () => {
  const p = newPayment({ slug: 'lova', kind: 'deposit', amount: 87500, description: 'Deposit', stripe: { customerId: 'cus_1', checkoutSessionId: 'cs_1' }, url: 'https://checkout' }, NOW);
  assert.match(p.id, /^20260908T160000/);
  assert.equal(p.status, 'pending');
  assert.equal(p.currency, 'usd');
  assert.deepEqual(p.stripe, { customerId: 'cus_1', checkoutSessionId: 'cs_1', paymentIntentId: null, invoiceId: null, subscriptionId: null });
  assert.deepEqual(p.eventIds, []);
  assert.equal(p.paidAt, null);
  assert.equal(p.createdAt, NOW.toISOString());
});

test('ensureCustomer creates once and reuses', async () => {
  const s = await make();
  const { calls, fetchFn } = stripe([{ id: 'cus_1' }]);
  const client = await s.clients.get('lova');
  assert.equal(await ensureCustomer(client, s, fetchFn, NOW), 'cus_1');
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/customers');
  assert.equal(calls[0].body.email, 's@example.com');
  assert.equal(calls[0].body['metadata[slug]'], 'lova');
  assert.equal((await s.clients.get('lova')).stripeCustomerId, 'cus_1');
  assert.equal(await ensureCustomer(await s.clients.get('lova'), s, fetchFn, NOW), 'cus_1');
  assert.equal(calls.length, 1);
});

test('createCheckout builds an ACH-and-card session and stores a pending document', async () => {
  const s = await make();
  const { calls, fetchFn } = stripe([{ id: 'cus_1' }, { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1', payment_intent: 'pi_1' }]);
  const p = await createCheckout({ client: await s.clients.get('lova'), kind: 'deposit', amount: 87500, description: 'Deposit for Lova' }, s, fetchFn, NOW);
  const b = calls[1].body;
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(b.mode, 'payment');
  assert.equal(b.customer, 'cus_1');
  assert.equal(b['payment_method_types[0]'], 'card');
  assert.equal(b['payment_method_types[1]'], 'us_bank_account');
  assert.equal(b['line_items[0][price_data][unit_amount]'], '87500');
  assert.equal(b['line_items[0][price_data][product_data][name]'], 'Deposit for Lova');
  assert.equal(b['payment_intent_data[setup_future_usage]'], 'off_session');
  assert.equal(b['metadata[slug]'], 'lova');
  assert.equal(b['metadata[kind]'], 'deposit');
  assert.equal(b['payment_intent_data[metadata][slug]'], 'lova');
  assert.equal(b.success_url, 'https://www.keepsitemedia.com/pay/thanks/');
  assert.equal(b.cancel_url, 'https://www.keepsitemedia.com/pay/cancelled/');
  assert.equal(p.status, 'pending');
  assert.equal(p.url, 'https://checkout.stripe.com/c/cs_1');
  assert.equal(p.stripe.checkoutSessionId, 'cs_1');
  assert.equal(p.stripe.paymentIntentId, 'pi_1');
  assert.equal((await s.payments.list('lova')).length, 1);
});

test('startSubscription uses the saved bank account, an inline monthly price, and an optional anchor', async () => {
  const s = await make();
  await s.clients.put('lova', { ...(await s.clients.get('lova')), stripeCustomerId: 'cus_1' });
  const { calls, fetchFn } = stripe([
    { data: [{ id: 'pm_bank', type: 'us_bank_account', created: 10 }] },
    { id: 'prod_1' },
    { id: 'sub_1', status: 'active', current_period_end: 1760000000 },
  ]);
  const p = await startSubscription({ client: await s.clients.get('lova'), amount: 15000, description: 'Search monthly', startYmd: '2026-10-01' }, s, fetchFn, NOW);
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/payment_methods?customer=cus_1&type=us_bank_account');
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/products');
  assert.equal(calls[1].body.name, 'Search monthly');
  const b = calls[2].body;
  assert.equal(calls[2].url, 'https://api.stripe.com/v1/subscriptions');
  assert.equal(b.customer, 'cus_1');
  assert.equal(b.default_payment_method, 'pm_bank');
  assert.equal(b['items[0][price_data][product]'], 'prod_1');
  assert.equal(b['items[0][price_data][unit_amount]'], '15000');
  assert.equal(b['items[0][price_data][recurring][interval]'], 'month');
  assert.equal(b['metadata[slug]'], 'lova');
  // 2026-10-01 09:00 Mountain (MDT) is 15:00Z.
  assert.equal(b.billing_cycle_anchor, String(Math.floor(Date.parse('2026-10-01T15:00:00Z') / 1000)));
  assert.equal(b.proration_behavior, 'none');
  assert.equal(p.kind, 'subscription');
  assert.equal(p.status, 'active');
  assert.equal(p.stripe.subscriptionId, 'sub_1');
  assert.equal(p.amount, 15000);
});

test('startSubscription falls back to a card and omits the anchor for today or the past', async () => {
  const s = await make();
  await s.clients.put('lova', { ...(await s.clients.get('lova')), stripeCustomerId: 'cus_1' });
  const { calls, fetchFn } = stripe([
    { data: [] },
    { data: [{ id: 'pm_card', type: 'card', created: 5 }, { id: 'pm_card2', type: 'card', created: 9 }] },
    { id: 'prod_1' },
    { id: 'sub_1', status: 'active' },
  ]);
  await startSubscription({ client: await s.clients.get('lova'), amount: 5500, description: 'Presence monthly', startYmd: '2026-09-08' }, s, fetchFn, NOW);
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/payment_methods?customer=cus_1&type=card');
  assert.equal(calls[3].body.default_payment_method, 'pm_card2');
  assert.equal(calls[3].body.billing_cycle_anchor, undefined);
});

test('startSubscription refuses without a saved payment method or a customer', async () => {
  const s = await make();
  await assert.rejects(async () => startSubscription({ client: await s.clients.get('lova'), amount: 5500, description: 'x' }, s, stripe([]).fetchFn, NOW), /no Stripe customer/);
  await s.clients.put('lova', { ...(await s.clients.get('lova')), stripeCustomerId: 'cus_1' });
  await assert.rejects(async () => startSubscription({ client: await s.clients.get('lova'), amount: 5500, description: 'x' }, s, stripe([{ data: [] }, { data: [] }]).fetchFn, NOW), /no saved payment method/);
  assert.equal((await s.payments.list('lova')).length, 0);
});
