import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { stripeConfigured } from '../stripe.mjs';
import { ensureCustomer, createCheckout, startSubscription } from '../payments.mjs';
import { isYmd } from '../dates.mjs';

const KINDS = new Set(['deposit', 'balance']);

// Dollars as typed on the form to integer cents; "875", "875.00" and
// "$1,750" all work, anything that is not a positive amount does not.
export function dollarsToCents(text) {
  const n = Number(String(text).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function payment(request, ctx, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const op = field(data, 'op');
  if (!['customer', 'checkout', 'subscribe'].includes(op)) return problem(400, 'unknown op');

  const tab = `/office/clients/${slug}/?tab=payments`;
  const back = (message) => redirect(`${tab}&error=${encodeURIComponent(message)}`);
  if (!stripeConfigured()) return back('STRIPE_SECRET_KEY is not set');

  try {
    if (op === 'customer') {
      await ensureCustomer(client, s, fetchFn, now);
      return redirect(tab);
    }
    const kind = field(data, 'kind');
    if (op === 'checkout' && !KINDS.has(kind)) return back('kind must be deposit or balance');
    const amount = dollarsToCents(field(data, 'amount'));
    if (amount === null) return back('amount must be a positive dollar amount');
    const description = field(data, 'description');
    if (!description) return back('description is required');
    if (op === 'checkout') {
      await createCheckout({ client, kind, amount, description }, s, fetchFn, now);
      return redirect(tab);
    }
    const start = field(data, 'start');
    if (start && !isYmd(start)) return back('start must be a date');
    await startSubscription({ client, amount, description, startYmd: start || undefined }, s, fetchFn, now);
    return redirect(tab);
  } catch (e) {
    // Stripe's own message is the most useful thing the admin can read here.
    return back(e.message);
  }
}
