// Stripe calls this anonymously, so it lives outside the office guard and
// trusts nothing but the signature. A verified event always gets a 200,
// even if applying it threw: Stripe retries non-2xx for days, and a
// document we cannot apply today will not apply tomorrow either.
import { verifyWebhook } from './lib/office/stripe.mjs';
import { applyEvent } from './lib/office/payments.mjs';
import { store } from './lib/office/store.mjs';

// Netlify calls this as (request, context); the injectable store and fetch
// come after, so a test can supply them without touching Netlify's own args.
export default async (request, _context, s = store(), fetchFn = fetch) => {
  if (request.method !== 'POST') return new Response('POST only', { status: 405 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await request.text();
  const event = verifyWebhook(raw, request.headers.get('stripe-signature'), secret);
  if (!event) return new Response('bad signature', { status: 400 });
  try {
    const result = await applyEvent(event, s, new Date(), fetchFn);
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('stripe webhook failed', event.id, e);
    return new Response(JSON.stringify({ handled: false, error: e.message }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
};
