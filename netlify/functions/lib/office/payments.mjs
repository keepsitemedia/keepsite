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
