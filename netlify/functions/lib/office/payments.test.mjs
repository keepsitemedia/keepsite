import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, tierPrices, newPayment, ensureCustomer, createCheckout, startSubscription, slugFor, applyEvent } from './payments.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';

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

const evt = (id, type, object) => ({ id, type, data: { object } });

async function withPendingDeposit() {
  const s = await make();
  await s.clients.put('lova', { ...(await s.clients.get('lova')), stripeCustomerId: 'cus_1' });
  const doc = newPayment({ slug: 'lova', kind: 'deposit', amount: 87500, description: 'Deposit', stripe: { customerId: 'cus_1', checkoutSessionId: 'cs_1' }, url: 'https://checkout' }, NOW);
  await s.payments.put('lova', doc.id, doc);
  const taskId = newId(NOW);
  await s.tasks.put('lova', taskId, { id: taskId, slug: 'lova', title: 'Deposit received', due: '2026-09-15', done: false, doneAt: null, payment: 'deposit', questionnaire: null });
  return { s, doc, taskId };
}

test('slugFor prefers metadata and falls back to the customer id', () => {
  const clients = [{ slug: 'lova', stripeCustomerId: 'cus_1' }];
  assert.equal(slugFor({ metadata: { slug: 'acme' }, customer: 'cus_1' }, clients), 'acme');
  assert.equal(slugFor({ subscription_details: { metadata: { slug: 'acme' } } }, clients), 'acme');
  assert.equal(slugFor({ customer: 'cus_1' }, clients), 'lova');
  assert.equal(slugFor({ customer: 'cus_x' }, clients), null);
});

test('a paid checkout marks the document paid, records the intent, and closes the deposit task', async () => {
  const { s, doc, taskId } = await withPendingDeposit();
  const later = new Date('2026-09-09T10:00:00Z');
  const r = await applyEvent(evt('evt_1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { slug: 'lova', kind: 'deposit' } }), s, later);
  assert.deepEqual(r, { handled: true, slug: 'lova', change: 'deposit paid' });
  const p = await s.payments.get('lova', doc.id);
  assert.equal(p.status, 'paid');
  assert.equal(p.paidAt, later.toISOString());
  assert.equal(p.stripe.paymentIntentId, 'pi_1');
  assert.deepEqual(p.eventIds, ['evt_1']);
  assert.equal((await s.tasks.get('lova', taskId)).done, true);
});

test('an unpaid completion stays pending until the async event, and a redelivery changes nothing', async () => {
  const { s, doc, taskId } = await withPendingDeposit();
  await applyEvent(evt('evt_1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', payment_status: 'unpaid', payment_intent: 'pi_1', metadata: { slug: 'lova', kind: 'deposit' } }), s, NOW);
  let p = await s.payments.get('lova', doc.id);
  assert.equal(p.status, 'pending');
  assert.equal((await s.tasks.get('lova', taskId)).done, false);
  await applyEvent(evt('evt_2', 'checkout.session.async_payment_succeeded', { id: 'cs_1', customer: 'cus_1', metadata: { slug: 'lova', kind: 'deposit' } }), s, NOW);
  p = await s.payments.get('lova', doc.id);
  assert.equal(p.status, 'paid');
  assert.deepEqual(p.eventIds, ['evt_1', 'evt_2']);
  const again = await applyEvent(evt('evt_2', 'checkout.session.async_payment_succeeded', { id: 'cs_1', customer: 'cus_1', metadata: { slug: 'lova' } }), s, NOW);
  assert.equal(again.change, 'duplicate event');
  assert.deepEqual((await s.payments.get('lova', doc.id)).eventIds, ['evt_1', 'evt_2']);
});

test('a failed bank payment marks the document failed and leaves the task open', async () => {
  const { s, doc, taskId } = await withPendingDeposit();
  await applyEvent(evt('evt_3', 'checkout.session.async_payment_failed', { id: 'cs_1', customer: 'cus_1', metadata: { slug: 'lova' } }), s, NOW);
  const p = await s.payments.get('lova', doc.id);
  assert.equal(p.status, 'failed');
  assert.equal(p.failureReason, 'bank payment failed');
  assert.equal((await s.tasks.get('lova', taskId)).done, false);
});

test('invoices create monthly documents, paid or failed, found by customer when metadata is absent', async () => {
  const s = await make();
  await s.clients.put('lova', { ...(await s.clients.get('lova')), stripeCustomerId: 'cus_1' });
  const paid = await applyEvent(evt('evt_4', 'invoice.paid', { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', amount_paid: 15000 }), s, NOW);
  assert.deepEqual(paid, { handled: true, slug: 'lova', change: 'monthly paid' });
  const [m] = await s.payments.list('lova');
  assert.equal(m.kind, 'monthly');
  assert.equal(m.amount, 15000);
  assert.equal(m.status, 'paid');
  assert.equal(m.stripe.invoiceId, 'in_1');
  assert.equal(m.stripe.subscriptionId, 'sub_1');
  await applyEvent(evt('evt_5', 'invoice.payment_failed', { id: 'in_2', customer: 'cus_1', subscription: 'sub_1', amount_due: 15000, last_payment_error: { message: 'Your card was declined.' } }), s, NOW);
  const failed = (await s.payments.list('lova')).find((p) => p.stripe.invoiceId === 'in_2');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.amount, 15000);
  assert.equal(failed.failureReason, 'Your card was declined.');
  // A retry of the same invoice later succeeds: same document, now paid.
  await applyEvent(evt('evt_6', 'invoice.paid', { id: 'in_2', customer: 'cus_1', subscription: 'sub_1', amount_paid: 15000 }), s, NOW);
  const retried = (await s.payments.list('lova')).find((p) => p.stripe.invoiceId === 'in_2');
  assert.equal(retried.status, 'paid');
  assert.equal(retried.failureReason, null);
  assert.equal((await s.payments.list('lova')).length, 2);
});

test('a deleted subscription cancels the subscription document', async () => {
  const s = await make();
  const sub = newPayment({ slug: 'lova', kind: 'subscription', amount: 15000, status: 'active', stripe: { customerId: 'cus_1', subscriptionId: 'sub_1' } }, NOW);
  await s.payments.put('lova', sub.id, sub);
  const r = await applyEvent(evt('evt_7', 'customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1', metadata: { slug: 'lova' } }), s, NOW);
  assert.equal(r.change, 'subscription cancelled');
  assert.equal((await s.payments.get('lova', sub.id)).status, 'cancelled');
});

test('unknown events, unknown clients and unknown sessions are reported, not thrown', async () => {
  const s = await make();
  assert.deepEqual(await applyEvent(evt('evt_8', 'charge.refunded', { id: 'ch_1' }), s, NOW), { handled: false, slug: null, change: 'ignored charge.refunded' });
  assert.equal((await applyEvent(evt('evt_9', 'invoice.paid', { id: 'in_9', customer: 'cus_ghost', amount_paid: 1 }), s, NOW)).change, 'no client for customer cus_ghost');
  assert.equal((await applyEvent(evt('evt_10', 'checkout.session.completed', { id: 'cs_ghost', customer: 'cus_1', payment_status: 'paid', metadata: { slug: 'lova' } }), s, NOW)).change, 'no payment for session cs_ghost');
});
