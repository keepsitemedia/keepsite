import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../stripe-webhook.mjs';
import { signWebhook } from './stripe.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newPayment } from './payments.mjs';

const NOW = new Date('2026-09-08T16:00:00Z');
const SECRET = 'whsec_test';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com', tier: 'Search', stripeCustomerId: 'cus_1' });
  return s;
};

const post = (body, header) => new Request('https://site.test/.netlify/functions/stripe-webhook', {
  method: 'POST', body, headers: header ? { 'stripe-signature': header } : {},
});

// The handler verifies against the real clock (it takes no injectable now),
// so sign with it rather than the fixed NOW used for document timestamps.
const send = (event, s, fetchFn = fetch) => {
  const raw = JSON.stringify(event);
  const header = signWebhook(raw, SECRET, new Date());
  return handler(post(raw, header), {}, s, fetchFn);
};

test.before(() => { process.env.STRIPE_WEBHOOK_SECRET = SECRET; });
test.after(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

test('GET is refused before touching the signature or the store', async () => {
  const res = await handler(new Request('https://site.test/x', { method: 'GET' }), {}, await make());
  assert.equal(res.status, 405);
});

test('a missing STRIPE_WEBHOOK_SECRET is a bad signature without touching the store', async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const s = await make();
    let touched = false;
    const guarded = new Proxy(s, { get(t, k) { touched = true; return t[k]; } });
    const res = await handler(post('{}', 't=1,v1=x'), {}, guarded);
    assert.equal(res.status, 400);
    assert.equal(touched, false);
  } finally {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  }
});

test('a bad signature is refused', async () => {
  const res = await handler(post('{"id":"evt_1"}', 't=1,v1=notreal'), {}, await make());
  assert.equal(res.status, 400);
});

test('a signed but unhandled event returns 200 with handled: false', async () => {
  const s = await make();
  const res = await send({ id: 'evt_1', type: 'charge.refunded', data: { object: { id: 'ch_1' } } }, s);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.handled, false);
});

test('a signed checkout.session.completed marks a pending document paid', async () => {
  const s = await make();
  const doc = newPayment({ slug: 'lova', kind: 'deposit', amount: 87500, description: 'Deposit', stripe: { customerId: 'cus_1', checkoutSessionId: 'cs_1' }, url: 'https://checkout' }, NOW);
  await s.payments.put('lova', doc.id, doc);
  const res = await send({
    id: 'evt_2', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', customer: 'cus_1', payment_status: 'paid', metadata: { slug: 'lova', kind: 'deposit' } } },
  }, s);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.handled, true);
  assert.equal((await s.payments.get('lova', doc.id)).status, 'paid');
});

test('an event that throws while applying still returns 200 with handled: false', async () => {
  const s = await make();
  const throwing = { ...s, clients: { ...s.clients, list: async () => { throw new Error('store down'); } } };
  const res = await send({ id: 'evt_3', type: 'invoice.paid', data: { object: { id: 'in_1', customer: 'cus_1', amount_paid: 100 } } }, throwing);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.handled, false);
});
