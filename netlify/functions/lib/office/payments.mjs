// Stripe is the system of record for money. This module creates the Stripe
// objects and keeps a document per outcome so the office can show "did that
// get paid?" without a Stripe login.
import packages from '../../../../src/data/packages.json' with { type: 'json' };
import { stripeRequest } from './stripe.mjs';
import { newId } from './ids.mjs';
import { todayIn, toInstant } from './dates.mjs';
import { siteUrl } from './context.mjs';

export const parseMoney = (s) => Math.round(Number(String(s).replace(/[^0-9.]/g, '')) * 100);

export function tierPrices(tierName) {
  const tier = packages.tiers.find((t) => t.name === tierName);
  return tier ? { build: parseMoney(tier.buildPrice), monthly: parseMoney(tier.monthlyPrice) } : null;
}

export function newPayment({ slug, kind, amount, description = '', status = 'pending', stripe = {}, url = null }, now = new Date()) {
  const at = now.toISOString();
  return {
    id: newId(now), slug, kind, amount, currency: 'usd', status, description,
    stripe: {
      customerId: stripe.customerId ?? null,
      checkoutSessionId: stripe.checkoutSessionId ?? null,
      paymentIntentId: stripe.paymentIntentId ?? null,
      invoiceId: stripe.invoiceId ?? null,
      subscriptionId: stripe.subscriptionId ?? null,
    },
    url, eventIds: [], paidAt: null, failureReason: null, createdAt: at, updatedAt: at,
  };
}

export async function ensureCustomer(client, s, fetchFn = fetch, now = new Date()) {
  if (client.stripeCustomerId) return client.stripeCustomerId;
  const customer = await stripeRequest('POST', '/customers', {
    email: client.email, name: client.name, description: client.business, metadata: { slug: client.slug },
  }, fetchFn);
  await s.clients.put(client.slug, { ...client, stripeCustomerId: customer.id, updatedAt: now.toISOString() });
  return customer.id;
}

export async function createCheckout({ client, kind, amount, description }, s, fetchFn = fetch, now = new Date()) {
  const customerId = await ensureCustomer(client, s, fetchFn, now);
  const site = siteUrl();
  const session = await stripeRequest('POST', '/checkout/sessions', {
    mode: 'payment',
    customer: customerId,
    payment_method_types: ['card', 'us_bank_account'],
    line_items: [{ price_data: { currency: 'usd', unit_amount: amount, product_data: { name: description } }, quantity: 1 }],
    // The method used here is what the monthly will charge later.
    payment_intent_data: { setup_future_usage: 'off_session', metadata: { slug: client.slug, kind } },
    metadata: { slug: client.slug, kind },
    success_url: `${site}/pay/thanks/`,
    cancel_url: `${site}/pay/cancelled/`,
  }, fetchFn);
  const doc = newPayment({
    slug: client.slug, kind, amount, description,
    stripe: { customerId, checkoutSessionId: session.id, paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null },
    url: session.url,
  }, now);
  await s.payments.put(client.slug, doc.id, doc);
  return doc;
}

async function savedPaymentMethod(customerId, fetchFn) {
  // Bank first: it is what the deposit most likely used and the cheaper rail.
  for (const type of ['us_bank_account', 'card']) {
    const { data } = await stripeRequest('GET', '/payment_methods', { customer: customerId, type }, fetchFn);
    if (data?.length) return data.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0].id;
  }
  return null;
}

export async function startSubscription({ client, amount, description, startYmd }, s, fetchFn = fetch, now = new Date()) {
  if (!client.stripeCustomerId) throw new Error('no Stripe customer yet; create the deposit link first');
  // A disabled button is not a guard: a double click or a replayed POST
  // would otherwise start a second subscription and bill the client twice
  // a month. Check before any Stripe call, not just before the write.
  const existing = (await s.payments.list(client.slug)).find((p) => p.kind === 'subscription' && p.status === 'active');
  if (existing) throw new Error(`a monthly subscription is already active (${existing.stripe.subscriptionId}); cancel it in Stripe first`);
  const pm = await savedPaymentMethod(client.stripeCustomerId, fetchFn);
  if (!pm) throw new Error('no saved payment method on the Stripe customer; the deposit or balance must be paid first');
  const product = await stripeRequest('POST', '/products', { name: description, metadata: { slug: client.slug } }, fetchFn);
  const params = {
    customer: client.stripeCustomerId,
    default_payment_method: pm,
    items: [{ price_data: { currency: 'usd', unit_amount: amount, recurring: { interval: 'month' }, product: product.id } }],
    metadata: { slug: client.slug },
  };
  // A future launch day becomes the anchor with no proration, so the first
  // charge lands on launch day exactly as the agreement says.
  if (startYmd && startYmd > todayIn(undefined, now)) {
    params.billing_cycle_anchor = Math.floor(toInstant(startYmd, '09:00').getTime() / 1000);
    params.proration_behavior = 'none';
  }
  const sub = await stripeRequest('POST', '/subscriptions', params, fetchFn);
  const doc = newPayment({
    slug: client.slug, kind: 'subscription', amount, description, status: 'active',
    stripe: { customerId: client.stripeCustomerId, subscriptionId: sub.id },
  }, now);
  await s.payments.put(client.slug, doc.id, doc);
  return doc;
}

export function slugFor(object, clients) {
  const meta = object?.metadata?.slug
    ?? object?.subscription_details?.metadata?.slug
    ?? object?.parent?.subscription_details?.metadata?.slug;
  if (meta) return meta;
  const customerId = typeof object?.customer === 'string' ? object.customer : object?.customer?.id;
  return clients.find((c) => c.stripeCustomerId && c.stripeCustomerId === customerId)?.slug ?? null;
}

export async function markPaymentTasks(slug, kind, s, now = new Date()) {
  for (const t of await s.tasks.list(slug)) {
    if (t.payment === kind && !t.done) await s.tasks.put(slug, t.id, { ...t, done: true, doneAt: now.toISOString() });
  }
}

const CHECKOUT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']);
const INVOICE_EVENTS = new Set(['invoice.paid', 'invoice.payment_failed']);

// Idempotent by construction: every write records the event id, and a
// document that already carries it is returned untouched. Stripe redelivers
// on any non-2xx and sometimes on a 2xx too. The store has no compare-and-
// swap, so a lost update between two concurrent deliveries leaves a stale
// status the admin can see and correct, never a wrong charge.
export async function applyEvent(event, s, now = new Date(), fetchFn = fetch) {
  const type = event.type;
  const object = event.data?.object ?? {};
  if (!CHECKOUT_EVENTS.has(type) && !INVOICE_EVENTS.has(type) && type !== 'customer.subscription.deleted') {
    return { handled: false, slug: null, change: `ignored ${type}` };
  }
  const clients = await s.clients.list();
  const slug = slugFor(object, clients);
  if (!slug) return { handled: false, slug: null, change: `no client for customer ${object.customer ?? 'unknown'}` };
  const client = clients.find((c) => c.slug === slug);
  const payments = await s.payments.list(slug);
  const at = now.toISOString();
  const save = async (doc, patch) => {
    const next = { ...doc, ...patch, eventIds: [...doc.eventIds, event.id], updatedAt: at };
    await s.payments.put(slug, doc.id, next);
    return next;
  };

  if (CHECKOUT_EVENTS.has(type)) {
    const doc = payments.find((p) => p.stripe.checkoutSessionId === object.id);
    if (!doc) return { handled: false, slug, change: `no payment for session ${object.id}` };
    if (doc.eventIds.includes(event.id)) return { handled: true, slug, change: 'duplicate event' };
    const intent = typeof object.payment_intent === 'string' ? object.payment_intent : doc.stripe.paymentIntentId;
    const stripe = { ...doc.stripe, paymentIntentId: intent };
    if (type === 'checkout.session.async_payment_failed') {
      await save(doc, { status: 'failed', failureReason: 'bank payment failed', stripe });
      return { handled: true, slug, change: `${doc.kind} failed` };
    }
    if (type === 'checkout.session.expired') {
      await save(doc, { status: 'expired', failureReason: 'payment link expired after 24 hours', stripe });
      return { handled: true, slug, change: `${doc.kind} expired` };
    }
    const paid = type === 'checkout.session.async_payment_succeeded' || object.payment_status === 'paid';
    if (!paid) {
      await save(doc, { stripe });
      return { handled: true, slug, change: `${doc.kind} pending` };
    }
    await save(doc, { status: 'paid', paidAt: at, failureReason: null, stripe });
    await markPaymentTasks(slug, doc.kind, s, now);
    return { handled: true, slug, change: `${doc.kind} paid` };
  }

  if (INVOICE_EVENTS.has(type)) {
    let doc = payments.find((p) => p.stripe.invoiceId === object.id);
    if (doc?.eventIds.includes(event.id)) return { handled: true, slug, change: 'duplicate event' };
    // Newer API versions moved the subscription id and its metadata under
    // `parent.subscription_details`; read both shapes so a version bump on
    // the Stripe account does not silently orphan new monthly documents.
    const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription ?? null;
    if (!doc) {
      doc = newPayment({
        slug, kind: 'monthly', amount: object.amount_paid ?? object.amount_due ?? 0, description: 'Monthly',
        stripe: { customerId: client?.stripeCustomerId ?? object.customer ?? null, invoiceId: object.id, subscriptionId },
      }, now);
    }
    if (type === 'invoice.paid') {
      await save(doc, { status: 'paid', paidAt: at, failureReason: null, amount: object.amount_paid ?? doc.amount });
      return { handled: true, slug, change: 'monthly paid' };
    }
    // The decline reason lives on the PaymentIntent, which invoice webhooks
    // deliver as a bare id, not an expanded object.
    let reason = null;
    if (typeof object.payment_intent === 'string') {
      try {
        const pi = await stripeRequest('GET', `/payment_intents/${object.payment_intent}`, {}, fetchFn);
        reason = pi.last_payment_error?.message ?? null;
      } catch { reason = null; }
    }
    const failureReason = reason ?? object.last_finalization_error?.message ?? 'payment failed';
    await save(doc, { status: 'failed', failureReason, amount: object.amount_due ?? doc.amount });
    return { handled: true, slug, change: 'monthly failed' };
  }

  const sub = payments.find((p) => p.kind === 'subscription' && p.stripe.subscriptionId === object.id);
  if (!sub) return { handled: false, slug, change: `no subscription document for ${object.id}` };
  if (sub.eventIds.includes(event.id)) return { handled: true, slug, change: 'duplicate event' };
  await save(sub, { status: 'cancelled' });
  return { handled: true, slug, change: 'subscription cancelled' };
}
