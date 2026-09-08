import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeForm, stripeRequest, stripeConfigured, verifyWebhook, signWebhook, dashboardUrl } from './stripe.mjs';

const withKey = async (key, fn) => {
  const prior = process.env.STRIPE_SECRET_KEY;
  if (key === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = key;
  try { return await fn(); } finally {
    if (prior === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = prior;
  }
};

test('encodeForm uses Stripe bracket notation and skips empty values', () => {
  assert.equal(
    encodeForm({ mode: 'payment', customer: 'cus_1', line_items: [{ price_data: { currency: 'usd', unit_amount: 55000 }, quantity: 1 }], metadata: { slug: 'lova' }, nothing: null, flag: true }),
    'mode=payment&customer=cus_1&line_items[0][price_data][currency]=usd&line_items[0][price_data][unit_amount]=55000&line_items[0][quantity]=1&metadata[slug]=lova&flag=true',
  );
  assert.equal(encodeForm({ name: 'A & B' }), 'name=A+%26+B');
  assert.equal(encodeForm({ metadata: { 'a&b': 2, 'c d': 'x' } }), 'metadata[a%26b]=2&metadata[c%20d]=x');
});

test('stripeRequest posts form data with the bearer key and parses the answer', async () => {
  await withKey('sk_test_1', async () => {
    let seen;
    const fetchFn = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 }); };
    const out = await stripeRequest('POST', '/customers', { email: 'a@b.co', metadata: { slug: 'lova' } }, fetchFn);
    assert.equal(out.id, 'cus_1');
    assert.equal(seen.url, 'https://api.stripe.com/v1/customers');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.Authorization, 'Bearer sk_test_1');
    assert.equal(seen.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(seen.init.headers['Stripe-Version'], '2024-06-20');
    assert.equal(seen.init.body, 'email=a%40b.co&metadata[slug]=lova');
  });
});

test('stripeRequest puts GET params in the query and surfaces Stripe errors', async () => {
  await withKey('sk_test_1', async () => {
    let seen;
    const ok = async (url, init) => { seen = { url, init }; return new Response('{"data":[]}'); };
    await stripeRequest('GET', '/payment_methods', { customer: 'cus_1', type: 'card' }, ok);
    assert.equal(seen.url, 'https://api.stripe.com/v1/payment_methods?customer=cus_1&type=card');
    assert.equal(seen.init.body, undefined);
    const bad = async () => new Response(JSON.stringify({ error: { message: 'No such customer', type: 'invalid_request_error' } }), { status: 404 });
    await assert.rejects(() => stripeRequest('GET', '/customers/cus_x', {}, bad), (e) => e.message === 'No such customer' && e.stripe.type === 'invalid_request_error');
    const garbage = async () => new Response('<html>', { status: 502 });
    await assert.rejects(() => stripeRequest('GET', '/customers/cus_x', {}, garbage), /Stripe responded 502/);
  });
});

test('stripeRequest refuses before fetching when the key is missing', async () => {
  await withKey(undefined, async () => {
    assert.equal(stripeConfigured(), false);
    let called = false;
    await assert.rejects(() => stripeRequest('POST', '/customers', {}, async () => { called = true; }), /STRIPE_SECRET_KEY/);
    assert.equal(called, false);
  });
});

test('verifyWebhook accepts a correctly signed body inside the tolerance and rejects the rest', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
  const now = new Date('2026-09-08T13:00:00Z');
  const header = signWebhook(body, 'whsec_test', now);
  assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(verifyWebhook(body, header, 'whsec_test', now).id, 'evt_1');
  assert.equal(verifyWebhook(body + ' ', header, 'whsec_test', now), null);
  assert.equal(verifyWebhook(body, header, 'whsec_other', now), null);
  assert.equal(verifyWebhook(body, header, 'whsec_test', new Date(now.getTime() + 301e3)), null);
  assert.equal(verifyWebhook(body, header, 'whsec_test', new Date(now.getTime() + 299e3)).id, 'evt_1');
  assert.equal(verifyWebhook(body, 'garbage', 'whsec_test', now), null);
  assert.equal(verifyWebhook(body, header, '', now), null);
  // Stripe may send several v1 values during a secret rollover; any one matching is enough.
  assert.equal(verifyWebhook(body, `${header},v1=${'0'.repeat(64)}`, 'whsec_test', now).id, 'evt_1');
});

test('dashboardUrl points at the right Stripe page, test mode under /test', async () => {
  await withKey('sk_live_1', async () => {
    assert.equal(dashboardUrl('customer', 'cus_1'), 'https://dashboard.stripe.com/customers/cus_1');
    assert.equal(dashboardUrl('payment', 'pi_1'), 'https://dashboard.stripe.com/payments/pi_1');
    assert.equal(dashboardUrl('subscription', 'sub_1'), 'https://dashboard.stripe.com/subscriptions/sub_1');
    assert.equal(dashboardUrl('invoice', 'in_1'), 'https://dashboard.stripe.com/invoices/in_1');
    assert.throws(() => dashboardUrl('nope', 'x'), /unknown/);
  });
  await withKey('sk_test_1', async () => {
    assert.equal(dashboardUrl('customer', 'cus_1'), 'https://dashboard.stripe.com/test/customers/cus_1');
    assert.equal(dashboardUrl('payment', 'pi_1'), 'https://dashboard.stripe.com/test/payments/pi_1');
    assert.equal(dashboardUrl('subscription', 'sub_1'), 'https://dashboard.stripe.com/test/subscriptions/sub_1');
    assert.equal(dashboardUrl('invoice', 'in_1'), 'https://dashboard.stripe.com/test/invoices/in_1');
  });
});

test('stripeRequest sends an Idempotency-Key on a POST when given one, never on a GET', async () => {
  await withKey('sk_test_1', async () => {
    let seen;
    const fetchFn = async (url, init) => { seen = init; return new Response('{"id":"sub_1"}'); };
    await stripeRequest('POST', '/subscriptions', { customer: 'cus_1' }, fetchFn, { idempotencyKey: 'lova:subscription:2026-10-01' });
    assert.equal(seen.headers['Idempotency-Key'], 'lova:subscription:2026-10-01');
    await stripeRequest('POST', '/subscriptions', { customer: 'cus_1' }, fetchFn);
    assert.equal(seen.headers['Idempotency-Key'], undefined);
    await stripeRequest('GET', '/subscriptions/sub_1', {}, fetchFn, { idempotencyKey: 'ignored' });
    assert.equal(seen.headers['Idempotency-Key'], undefined);
  });
});
