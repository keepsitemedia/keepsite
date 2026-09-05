# Client Office Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 3 of the client office: a Stripe Customer per client, deposit and balance collected through Stripe-hosted Checkout with ACH and card, a monthly Subscription started from the client page, a signature-verified webhook that records every outcome, a Payments tab, and a dashboard section.

**Architecture:** Stripe is the system of record; the office stores IDs and outcomes. One module (`stripe.mjs`) talks to Stripe's HTTP API with form-encoded requests over an injectable `fetch` and verifies webhook signatures by hand, so nothing needs the Stripe SDK and every path is testable with a fake fetch. A domain module (`payments.mjs`) builds payment documents, creates customers, Checkout sessions and subscriptions, and applies webhook events idempotently. The webhook is a raw Netlify function because Stripe calls it anonymously; the admin's payment actions go through the guarded `/office/api/payment` endpoint like every other office action.

**Tech Stack:** Astro 5.18 with `@astrojs/netlify`, Netlify Blobs, Stripe HTTP API (Customers, Checkout Sessions, Products, Subscriptions, Payment Methods, Webhooks), `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-client-office-design.md` (sections Payments, Data model, Pipelines and tasks (payment tasks), Internal digest (failed payments), Secrets, Testing).

## Global Constraints

- Node 20; no TypeScript under `netlify/functions/`, `.mjs` only, so `node --test` runs it directly.
- Every office page exports `prerender = false`. No third-party script or stylesheet anywhere; Stripe pages are Stripe-hosted redirects, never embedded.
- `netlify/functions/lib/office/stripe.mjs` is the only module that calls Stripe; every call takes an injectable `fetchFn`.
- Secrets fail closed: a missing `STRIPE_SECRET_KEY` makes every payment action refuse with a clear message; a missing `STRIPE_WEBHOOK_SECRET` makes the webhook refuse every event with 400.
- The tool never stores card or bank details; only Stripe object IDs, amounts, statuses and dates.
- Payment documents are created (status `pending`) by the payment action and thereafter written only by the webhook; the client document's `stripeCustomerId` is written by the admin's action. Nothing else touches `payments/`.
- Webhook events are idempotent on the Stripe event ID; a redelivered event changes nothing. The webhook returns 200 for any verified event, including ones it ignores.
- A paid deposit or balance marks the matching `payment`-tagged task done. No payment advances a stage.
- Amounts are integer cents in `usd`. Tier prices come from `src/data/packages.json` only.
- Comments explain why, never what. Commit subjects imperative, under 50 characters, with the session trailers.
- `npm run gate` must pass at the end of every task that touches `src/`, `package.json` or `netlify.toml`.

## File structure

```
netlify/functions/lib/office/
  stripe.mjs           encodeForm, stripeRequest, stripeConfigured, verifyWebhook, dashboardUrl
  payments.mjs         tierPrices, newPayment, ensureCustomer, createCheckout, startSubscription, applyEvent, slugFor
  actions/payment.mjs  ops customer, checkout, subscribe
netlify/functions/stripe-webhook.mjs      anonymous: verify, apply, 200
src/pages/office/clients/[slug].astro     + Payments tab
src/pages/office/index.astro              + Payments section
README.md, docs/superpowers/specs/...     + payments docs and two spec amendments
```

Modified: `actions.mjs` (one entry), `actions/stage.mjs` (create the Stripe customer on entering Agreement, best-effort).

---

### Task 1: The Stripe client and webhook verification

**Files:**
- Create: `netlify/functions/lib/office/stripe.mjs`
- Create: `netlify/functions/lib/office/stripe.test.mjs`

**Interfaces:**
- Produces:
  - `encodeForm(params): string` — Stripe's bracket form encoding: `{ a: { b: 1 }, c: ['x', 'y'] }` → `a[b]=1&c[0]=x&c[1]=y`; `null`/`undefined` values are skipped; booleans become `true`/`false`.
  - `stripeConfigured(): boolean` — `STRIPE_SECRET_KEY` is set.
  - `stripeRequest(method, path, params?, fetchFn?): Promise<object>` — `https://api.stripe.com/v1{path}` with `Authorization: Bearer <key>`; GET puts params in the query string, POST form-encodes them. Resolves the parsed JSON; rejects with an `Error` whose message is Stripe's `error.message` (or `Stripe responded <status>`) and whose `.stripe` holds the error object. Throws before fetching when the key is missing.
  - `verifyWebhook(rawBody, signatureHeader, secret, now?, toleranceSeconds = 300): object | null` — parses `t=…,v1=…`, computes HMAC-SHA256 of `${t}.${rawBody}` with `secret`, compares in constant time against every `v1`, rejects timestamps outside tolerance, returns the parsed event or `null`.
  - `signWebhook(rawBody, secret, now): string` — builds a valid header, for tests.
  - `dashboardUrl(kind, id): string` — `kind` in `customer|payment|subscription|invoice` → `https://dashboard.stripe.com/{customers|payments|subscriptions|invoices}/{id}`.

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/stripe.test.mjs`:

```js
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

test('dashboardUrl points at the right Stripe page', () => {
  assert.equal(dashboardUrl('customer', 'cus_1'), 'https://dashboard.stripe.com/customers/cus_1');
  assert.equal(dashboardUrl('payment', 'pi_1'), 'https://dashboard.stripe.com/payments/pi_1');
  assert.equal(dashboardUrl('subscription', 'sub_1'), 'https://dashboard.stripe.com/subscriptions/sub_1');
  assert.equal(dashboardUrl('invoice', 'in_1'), 'https://dashboard.stripe.com/invoices/in_1');
  assert.throws(() => dashboardUrl('nope', 'x'), /unknown/);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/stripe.test.mjs`
Expected: FAIL, cannot find module `./stripe.mjs`.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/stripe.mjs`:

```js
// Stripe over plain fetch. The SDK would save a few lines and cost a
// dependency, a mocking story, and a second way to verify webhooks; the
// HTTP API is small enough that a fake fetch covers every path in tests.
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.stripe.com/v1';

function flatten(value, prefix, out) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push([prefix, String(value)]);
  }
}

// Bracket keys stay literal: Stripe reads `line_items[0][quantity]`, not its
// percent-encoded form. Values are encoded the usual way.
export function encodeForm(params) {
  const pairs = [];
  flatten(params ?? {}, '', pairs);
  return pairs.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`).join('&');
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

export async function stripeRequest(method, path, params = {}, fetchFn = fetch) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const encoded = encodeForm(params);
  const url = method === 'GET' && encoded ? `${API}${path}?${encoded}` : `${API}${path}`;
  const init = { method, headers: { Authorization: `Bearer ${key}` } };
  if (method !== 'GET') {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = encoded;
  }
  const res = await fetchFn(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    const err = new Error(body?.error?.message ?? `Stripe responded ${res.status}`);
    err.stripe = body?.error ?? { status: res.status };
    throw err;
  }
  return body;
}

const sign = (secret, t, rawBody) => createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');

export function signWebhook(rawBody, secret, now = new Date()) {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${sign(secret, t, rawBody)}`;
}

// Stripe's scheme: HMAC-SHA256 of "<t>.<body>" with the endpoint secret,
// hex, and a timestamp so a captured request cannot be replayed later.
export function verifyWebhook(rawBody, signatureHeader, secret, now = new Date(), toleranceSeconds = 300) {
  if (!secret || typeof signatureHeader !== 'string') return null;
  const parts = Object.create(null);
  for (const kv of signatureHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    const k = kv.slice(0, i).trim();
    const v = kv.slice(i + 1).trim();
    (parts[k] ??= []).push(v);
  }
  const t = Number(parts.t?.[0]);
  if (!Number.isInteger(t) || !parts.v1?.length) return null;
  if (Math.abs(Math.floor(now.getTime() / 1000) - t) > toleranceSeconds) return null;
  const expected = Buffer.from(sign(secret, t, rawBody));
  const ok = parts.v1.some((v) => {
    const given = Buffer.from(v);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) return null;
  try { return JSON.parse(rawBody); } catch { return null; }
}

const DASHBOARD = { __proto__: null, customer: 'customers', payment: 'payments', subscription: 'subscriptions', invoice: 'invoices' };

export function dashboardUrl(kind, id) {
  const seg = DASHBOARD[kind];
  if (!seg) throw new Error(`unknown dashboard kind: ${kind}`);
  return `https://dashboard.stripe.com/${seg}/${id}`;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/stripe.test.mjs`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/stripe.mjs netlify/functions/lib/office/stripe.test.mjs
git commit -m "Add the Stripe client and webhook verification"
```

---

### Task 2: Payment documents, customers, Checkout and subscriptions

**Files:**
- Create: `netlify/functions/lib/office/payments.mjs`
- Create: `netlify/functions/lib/office/payments.test.mjs`

**Interfaces:**
- Consumes: `stripeRequest` (Task 1); `newId`; `todayIn`, `toInstant`; `siteUrl` (`context.mjs`); store (`clients.put`, `payments.put/list`); `src/data/packages.json`.
- Produces:
  - Payment document: `{ id, slug, kind: 'deposit'|'balance'|'monthly'|'subscription', amount, currency: 'usd', status: 'pending'|'paid'|'failed'|'active'|'cancelled', description, stripe: { customerId, checkoutSessionId, paymentIntentId, invoiceId, subscriptionId }, url, eventIds: string[], paidAt, failureReason, createdAt, updatedAt }`. Exactly one `kind: 'subscription'` document per client holds the subscription's state; `monthly` documents are one per Stripe invoice.
  - `parseMoney('$1,100'): number` → cents (`110000`).
  - `tierPrices(tierName): { build, monthly } | null` — cents from `packages.json`.
  - `newPayment(fields, now): PaymentDoc`.
  - `ensureCustomer(client, s, fetchFn?, now?): Promise<string>` — returns the existing `stripeCustomerId` or creates a Customer (`email`, `name`, `description` = business, `metadata.slug`) and writes it onto the client document.
  - `createCheckout({ client, kind, amount, description }, s, fetchFn?, now?): Promise<PaymentDoc>` — Checkout Session in `payment` mode with `card` and `us_bank_account`, `setup_future_usage: 'off_session'`, metadata `slug` and `kind` on both the session and the payment intent, success and cancel URLs on the site; stores a `pending` document with the session `url`.
  - `startSubscription({ client, amount, description, startYmd? }, s, fetchFn?, now?): Promise<PaymentDoc>` — finds the customer's most recent saved payment method (`us_bank_account` first, then `card`), creates a Product and a Subscription with inline monthly `price_data`, `default_payment_method`, metadata `slug`; when `startYmd` is a future day, sets `billing_cycle_anchor` to that day at 09:00 Mountain with `proration_behavior: 'none'`; stores a `subscription` document with status `active`. Throws with a plain message when no payment method is saved.

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/payments.test.mjs`:

```js
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
  await assert.rejects(() => startSubscription({ client: await s.clients.get('lova'), amount: 5500, description: 'x' }, s, stripe([]).fetchFn, NOW), /no Stripe customer/);
  await s.clients.put('lova', { ...(await s.clients.get('lova')), stripeCustomerId: 'cus_1' });
  await assert.rejects(() => startSubscription({ client: await s.clients.get('lova'), amount: 5500, description: 'x' }, s, stripe([{ data: [] }, { data: [] }]).fetchFn, NOW), /no saved payment method/);
  assert.equal((await s.payments.list('lova')).length, 0);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/payments.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/payments.mjs` (the `applyEvent` half comes in Task 3):

```js
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
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/payments.test.mjs`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/payments.mjs netlify/functions/lib/office/payments.test.mjs
git commit -m "Create Stripe customers, checkouts and subscriptions"
```

---

### Task 3: Applying webhook events and the webhook function

**Files:**
- Modify: `netlify/functions/lib/office/payments.mjs`
- Modify: `netlify/functions/lib/office/payments.test.mjs`
- Create: `netlify/functions/stripe-webhook.mjs`

**Interfaces:**
- Consumes: `verifyWebhook`; store (`payments.list/put`, `clients.list`, `tasks.list/put`).
- Produces:
  - `slugFor(object, clients): string | null` — `object.metadata?.slug`, else `object.subscription_details?.metadata?.slug`, else the client whose `stripeCustomerId` equals `object.customer`.
  - `applyEvent(event, s, now?): Promise<{ handled: boolean, slug: string|null, change: string }>` — idempotent on `event.id`; handles the six event types below; unknown types return `{ handled: false }`.
  - `markPaymentTasks(slug, kind, s, now)` — sets `done` on open tasks whose `payment === kind`.
  - Netlify function `stripe-webhook` at `/.netlify/functions/stripe-webhook`: POST only; reads the raw body; verifies with `STRIPE_WEBHOOK_SECRET` (400 when missing or invalid); applies; always 200 after a verified event, even when the handler throws (the error is logged so Stripe does not retry forever).

Event handling:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Find the `pending` document by `checkoutSessionId`. `payment_status === 'paid'` → `paid` with `paidAt`; otherwise stays `pending` (ACH settling). Record `paymentIntentId`. |
| `checkout.session.async_payment_succeeded` | Same lookup → `paid`, `paidAt`. |
| `checkout.session.async_payment_failed` | Same lookup → `failed`, `failureReason: 'bank payment failed'`. |
| `invoice.paid` | Find by `invoiceId`; if none, create a `monthly` document (`amount = amount_paid`, `subscriptionId`, `invoiceId`, `customerId`) → `paid`. |
| `invoice.payment_failed` | Find or create as above → `failed`, `failureReason` from `last_payment_error.message` when present, else `'payment failed'`. |
| `customer.subscription.deleted` | The `subscription` document with that `subscriptionId` → `cancelled`. |

When a `deposit` or `balance` document becomes `paid`, `markPaymentTasks` runs for that kind. Every write appends `event.id` to `eventIds`; a document that already has the id is left untouched.

- [ ] **Step 1: Failing tests**

Append to `netlify/functions/lib/office/payments.test.mjs`:

```js
import { slugFor, applyEvent } from './payments.mjs';
import { newId } from './ids.mjs';

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
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/payments.test.mjs`
Expected: the new tests fail with `slugFor`/`applyEvent` not exported; the seven earlier tests still pass.

- [ ] **Step 3: Implement applyEvent**

Append to `netlify/functions/lib/office/payments.mjs`:

```js
export function slugFor(object, clients) {
  const meta = object?.metadata?.slug ?? object?.subscription_details?.metadata?.slug;
  if (meta) return meta;
  const customerId = typeof object?.customer === 'string' ? object.customer : object?.customer?.id;
  return clients.find((c) => c.stripeCustomerId && c.stripeCustomerId === customerId)?.slug ?? null;
}

export async function markPaymentTasks(slug, kind, s, now = new Date()) {
  for (const t of await s.tasks.list(slug)) {
    if (t.payment === kind && !t.done) await s.tasks.put(slug, t.id, { ...t, done: true, doneAt: now.toISOString() });
  }
}

const CHECKOUT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed']);
const INVOICE_EVENTS = new Set(['invoice.paid', 'invoice.payment_failed']);

// Idempotent by construction: every write records the event id, and a
// document that already carries it is returned untouched. Stripe redelivers
// on any non-2xx and sometimes on a 2xx too.
export async function applyEvent(event, s, now = new Date()) {
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
    if (!doc) {
      doc = newPayment({
        slug, kind: 'monthly', amount: object.amount_paid ?? object.amount_due ?? 0, description: 'Monthly',
        stripe: { customerId: client?.stripeCustomerId ?? object.customer ?? null, invoiceId: object.id, subscriptionId: object.subscription ?? null },
      }, now);
    }
    if (type === 'invoice.paid') {
      await save(doc, { status: 'paid', paidAt: at, failureReason: null, amount: object.amount_paid ?? doc.amount });
      return { handled: true, slug, change: 'monthly paid' };
    }
    await save(doc, { status: 'failed', failureReason: object.last_payment_error?.message ?? 'payment failed', amount: object.amount_due ?? doc.amount });
    return { handled: true, slug, change: 'monthly failed' };
  }

  const sub = payments.find((p) => p.kind === 'subscription' && p.stripe.subscriptionId === object.id);
  if (!sub) return { handled: false, slug, change: `no subscription document for ${object.id}` };
  if (sub.eventIds.includes(event.id)) return { handled: true, slug, change: 'duplicate event' };
  await save(sub, { status: 'cancelled' });
  return { handled: true, slug, change: 'subscription cancelled' };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/payments.test.mjs`
Expected: 14 passing.

- [ ] **Step 5: The webhook function**

`netlify/functions/stripe-webhook.mjs`:

```js
// Stripe calls this anonymously, so it lives outside the office guard and
// trusts nothing but the signature. A verified event always gets a 200,
// even if applying it threw: Stripe retries non-2xx for days, and a
// document we cannot apply today will not apply tomorrow either.
import { verifyWebhook } from './lib/office/stripe.mjs';
import { applyEvent } from './lib/office/payments.mjs';
import { store } from './lib/office/store.mjs';

export default async (request) => {
  if (request.method !== 'POST') return new Response('POST only', { status: 405 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await request.text();
  const event = verifyWebhook(raw, request.headers.get('stripe-signature'), secret);
  if (!event) return new Response('bad signature', { status: 400 });
  try {
    const result = await applyEvent(event, store());
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('stripe webhook failed', event.id, e);
    return new Response(JSON.stringify({ handled: false, error: e.message }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
};
```

The function's own tests are the `verifyWebhook` and `applyEvent` suites; the file is an adapter with no logic of its own.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/office/payments.mjs netlify/functions/lib/office/payments.test.mjs netlify/functions/stripe-webhook.mjs
git commit -m "Apply Stripe webhook events to payments"
```

---

### Task 4: The payment action and the Agreement-stage customer

**Files:**
- Create: `netlify/functions/lib/office/actions/payment.mjs`
- Create: `netlify/functions/lib/office/actions/payment.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Modify: `netlify/functions/lib/office/actions/stage.mjs`
- Modify: `netlify/functions/lib/office/actions/stage.test.mjs`

**Interfaces:**
- Consumes: `stripeConfigured`, `ensureCustomer`, `createCheckout`, `startSubscription`, `tierPrices`; http helpers; store.
- Produces:
  - Action `payment` (POST, csrf): `op=customer` (`slug`) creates the Stripe Customer; `op=checkout` (`slug`, `kind` in `deposit|balance`, `amount` in dollars as typed, e.g. `875` or `875.00`, `description`) creates a Checkout link; `op=subscribe` (`slug`, `amount` dollars, `description`, `start` optional `YYYY-MM-DD`) starts the subscription. All redirect to `/office/clients/{slug}/?tab=payments`, with `&error=` carrying any Stripe or validation message. A missing `STRIPE_SECRET_KEY` redirects with `error=STRIPE_SECRET_KEY is not set`.
  - `stage.mjs`: on first entry into a stage whose id is `agreement`, call `ensureCustomer` when Stripe is configured; a failure there is logged and does not block the stage change.

- [ ] **Step 1: Failing action tests**

`netlify/functions/lib/office/actions/payment.test.mjs`:

```js
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
const stripe = (answers) => async (url, init) => {
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
```

- [ ] **Step 2: Implement the action**

`netlify/functions/lib/office/actions/payment.mjs`:

```js
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
```

Add to `actions.mjs`:

```js
import { payment } from './actions/payment.mjs';
export const actions = { __proto__: null, login, logout, client, stage, task, settings, export: exportData, send, meeting, payment };
```

Run: `node --test netlify/functions/lib/office/actions/payment.test.mjs` — 6 passing.

- [ ] **Step 3: Stage hook test**

Append to `netlify/functions/lib/office/actions/stage.test.mjs`:

```js
test('entering Agreement creates the Stripe customer when Stripe is configured, best-effort', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_1';
  try {
    const s = await seeded();
    const calls = [];
    const fetchFn = async (url, init) => { calls.push(url); return new Response('{"id":"cus_1"}'); };
    await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s, new Date('2026-09-04T16:00:00Z'), fetchFn);
    assert.equal(calls[0], 'https://api.stripe.com/v1/customers');
    assert.equal((await s.clients.get('lova')).stripeCustomerId, 'cus_1');
    assert.equal((await s.clients.get('lova')).stage, 'agreement');
    // A Stripe failure does not block the stage change.
    const s2 = await seeded();
    const res = await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s2, new Date(), async () => { throw new Error('offline'); });
    assert.equal(res.status, 303);
    assert.equal((await s2.clients.get('lova')).stage, 'agreement');
    assert.equal((await s2.clients.get('lova')).stripeCustomerId, null);
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
  }
});
```

- [ ] **Step 4: Stage hook**

In `netlify/functions/lib/office/actions/stage.mjs`: add `import { stripeConfigured } from '../stripe.mjs';` and `import { ensureCustomer } from '../payments.mjs';`, change the signature to `export async function stage(request, ctx, s = defaultStore(), now = new Date(), fetchFn = fetch)`, and after `await s.clients.put(slug, updated);` insert:

```js
  // The Stripe customer exists from the moment there is something to bill,
  // so the deposit link is one click later. Best-effort: Stripe being down
  // must not stop a stage change, and the Payments tab has a button for it.
  if (entered && stageId === 'agreement' && stripeConfigured()) {
    try { await ensureCustomer(updated, s, fetchFn, now); } catch (e) { console.error('stripe customer', e.message); }
  }
```

where `entered` is computed before this block (move the existing `const entered = ...` line above it). `ensureCustomer` writes the client document again with the customer id; because it is passed `updated`, the stage change is preserved.

Run: `node --test netlify/functions/lib/office/actions/stage.test.mjs` — 4 passing.

- [ ] **Step 5: Run everything and commit**

Run: `npm test` — all passing.

```bash
git add netlify/functions/lib/office/actions/payment.mjs netlify/functions/lib/office/actions/payment.test.mjs netlify/functions/lib/office/actions.mjs netlify/functions/lib/office/actions/stage.mjs netlify/functions/lib/office/actions/stage.test.mjs
git commit -m "Add the payment action and Agreement customer"
```

---

### Task 5: Payments tab, dashboard section and the two static pay pages

**Files:**
- Modify: `src/pages/office/clients/[slug].astro`
- Modify: `src/pages/office/index.astro`
- Create: `src/pages/pay/thanks.astro`
- Create: `src/pages/pay/cancelled.astro`
- Modify: `astro.config.mjs` (sitemap filter), `public/robots.txt`, `netlify.toml` (noindex header for `/pay/*`), `scripts/verify.mjs` (routes list)

**Interfaces:**
- Consumes: payment documents, `tierPrices`, `dashboardUrl`, `formatYmd`, `todayIn`.
- Produces: a Payments tab at `?tab=payments` with the Stripe customer link or a create button, three forms (deposit link, balance link, start monthly) prefilled from the tier, and a table of payment documents newest first with status, amount, links; a dashboard Payments section listing pending checkouts older than seven days and failed payments; two prerendered public pages `/pay/thanks/` and `/pay/cancelled/` that Checkout returns to.

- [ ] **Step 1: Payments tab**

In `src/pages/office/clients/[slug].astro`, add imports:

```astro
import { tierPrices } from '../../../../netlify/functions/lib/office/payments.mjs';
import { dashboardUrl, stripeConfigured } from '../../../../netlify/functions/lib/office/stripe.mjs';
```

add the type and loads after the existing tab loads:

```ts
type PaymentDoc = { id: string; kind: string; amount: number; status: string; description: string; url: string | null; paidAt: string | null; failureReason: string | null; createdAt: string; stripe: { customerId: string | null; checkoutSessionId: string | null; paymentIntentId: string | null; invoiceId: string | null; subscriptionId: string | null } };
```

```astro
const payments = tab === 'payments' ? ((await s.payments.list(slug)) as PaymentDoc[]).reverse() : [];
const prices = tierPrices(client.tier) as { build: number; monthly: number } | null;
const dollars = (cents: number) => (cents / 100).toFixed(2);
const paidTotal = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
const subscription = payments.find((p) => p.kind === 'subscription');
const stripeCustomerId = (client as unknown as { stripeCustomerId: string | null }).stripeCustomerId;
const stripeOn = stripeConfigured();
const pipelinePlan = (pipeline as unknown as { payments?: { plan?: string } } | undefined)?.payments?.plan;
```

Add `['payments', 'Payments']` to `tabs` after `meetings` when `pipelinePlan` is set (a pipeline with no payment plan has no Payments tab). Add the tab body:

```astro
  {tab === 'payments' && (
    <>
      {!stripeOn && <p class="error">STRIPE_SECRET_KEY is not set, so nothing here can talk to Stripe.</p>}
      <h2>Stripe customer</h2>
      {stripeCustomerId ? (
        <p><a href={dashboardUrl('customer', stripeCustomerId)}>{stripeCustomerId}</a> in the Stripe dashboard</p>
      ) : (
        <form method="POST" action="/office/api/payment" class="inline">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="op" value="customer" />
          <button class="btn-outline btn-small" disabled={!stripeOn}>Create Stripe customer</button>
        </form>
      )}

      <h2>Collect</h2>
      <div class="row">
        {(['deposit', 'balance'] as const).map((kind) => (
          <form method="POST" action="/office/api/payment" class="card">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="op" value="checkout" />
            <input type="hidden" name="kind" value={kind} />
            <h3>{kind === 'deposit' ? 'Deposit link' : 'Balance link'}</h3>
            <label class="field"><span>Amount (USD)</span><input name="amount" inputmode="decimal" value={prices ? dollars(prices.build / 2) : ''} required /></label>
            <label class="field"><span>Shown to the client</span><input name="description" value={`${kind === 'deposit' ? 'Deposit' : 'Balance'} for ${client.business} website`} required /></label>
            <button class="btn btn-small" disabled={!stripeOn}>Create link</button>
          </form>
        ))}
        <form method="POST" action="/office/api/payment" class="card">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="op" value="subscribe" />
          <h3>Monthly</h3>
          {subscription && <p class="muted">Subscription {subscription.status}{subscription.stripe.subscriptionId && <> · <a href={dashboardUrl('subscription', subscription.stripe.subscriptionId)}>Stripe</a></>}</p>}
          <label class="field"><span>Amount per month (USD)</span><input name="amount" inputmode="decimal" value={prices ? dollars(prices.monthly) : ''} required /></label>
          <label class="field"><span>Shown on the invoice</span><input name="description" value={`${client.tier || 'Keepsite'} monthly`} required /></label>
          <label class="field"><span>First charge on (blank = today)</span><input type="date" name="start" /></label>
          <p class="field-hint">Charges the payment method saved by the deposit or balance. A discount is a lower amount here; say so in the description.</p>
          <button class="btn btn-small" disabled={!stripeOn || Boolean(subscription && subscription.status === 'active')}>Start monthly</button>
        </form>
      </div>

      <h2>Payments <span class="muted">paid ${dollars(paidTotal)}</span></h2>
      {payments.length === 0 && <p class="empty">Nothing yet.</p>}
      {payments.length > 0 && (
        <div class="table-scroll"><table>
          <thead><tr><th>Created</th><th>Kind</th><th class="num">Amount</th><th>Status</th><th>Links</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr>
                <td>{formatYmd(todayIn(undefined, new Date(p.createdAt)))}</td>
                <td>{p.kind}<div class="muted">{p.description}</div></td>
                <td class="num">${dollars(p.amount)}</td>
                <td class={p.status === 'failed' ? 'overdue' : ''}>{p.status}{p.paidAt && ` · ${formatYmd(todayIn(undefined, new Date(p.paidAt)))}`}{p.failureReason && ` · ${p.failureReason}`}</td>
                <td>
                  {p.status === 'pending' && p.url && <><a href={p.url}>Checkout link</a> </>}
                  {p.stripe.paymentIntentId && <><a href={dashboardUrl('payment', p.stripe.paymentIntentId)}>payment</a> </>}
                  {p.stripe.invoiceId && <><a href={dashboardUrl('invoice', p.stripe.invoiceId)}>invoice</a> </>}
                  {p.stripe.subscriptionId && <a href={dashboardUrl('subscription', p.stripe.subscriptionId)}>subscription</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  )}
```

Each of the four forms is its own `<form>`, so `check:office` sees one control per name in each. The prefilled amount for deposit and balance is half the tier's build price, matching the agreements' default of 50 percent on signing and 50 percent on launch; the admin edits it for a discount.

- [ ] **Step 2: Dashboard section**

In `src/pages/office/index.astro`, add `type PaymentDoc = { id: string; slug: string; kind: string; amount: number; status: string; createdAt: string; url: string | null; failureReason: string | null }` and load:

```astro
const weekAgo = addDays(today, -7);
const allPayments = (await s.payments.listAll()) as PaymentDoc[];
const stalePending = allPayments.filter((p) => p.status === 'pending' && todayIn(undefined, new Date(p.createdAt)) <= weekAgo);
const failedPayments = allPayments.filter((p) => p.status === 'failed');
const dollars = (cents: number) => (cents / 100).toFixed(2);
```

(`addDays` is already imported for the meetings section.) Replace the Payments placeholder:

```astro
  <h2>Payments</h2>
  {stalePending.length === 0 && failedPayments.length === 0 && <p class="empty">Nothing waiting.</p>}
  {(stalePending.length > 0 || failedPayments.length > 0) && (
    <div class="table-scroll"><table>
      <tbody>
        {failedPayments.map((p) => <tr><td class="overdue">failed</td><td><a href={`/office/clients/${p.slug}/?tab=payments`}>{names.get(p.slug) ?? p.slug}</a></td><td>{p.kind} ${dollars(p.amount)}</td><td>{p.failureReason}</td></tr>)}
        {stalePending.map((p) => <tr><td>unpaid a week</td><td><a href={`/office/clients/${p.slug}/?tab=payments`}>{names.get(p.slug) ?? p.slug}</a></td><td>{p.kind} ${dollars(p.amount)}</td><td>{p.url && <a href={p.url}>Checkout link</a>}</td></tr>)}
      </tbody>
    </table></div>
  )}
```

- [ ] **Step 3: The two pay pages**

`src/pages/pay/thanks.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
// Stripe Checkout returns here after payment. Static and indexable by
// nobody: the receipt itself comes from Stripe.
---
<BaseLayout title="Payment received | Keepsite Media" description="Thank you. Your payment is on its way." noindex>
  <section class="section">
    <div class="container narrow">
      <h1>Thank you</h1>
      <p class="lead">Your payment is on its way. Stripe will email you a receipt, and we will be in touch about the next step.</p>
      <p class="muted">Bank payments can take a few business days to settle; that is normal and nothing more is needed from you.</p>
    </div>
  </section>
</BaseLayout>
```

`src/pages/pay/cancelled.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import site from '../../data/site.json';
---
<BaseLayout title="Payment not completed | Keepsite Media" description="No payment was made." noindex>
  <section class="section">
    <div class="container narrow">
      <h1>No payment was made</h1>
      <p class="lead">The payment link is still good whenever you are ready. If something on the payment page did not work, email <a href={`mailto:${site.email}`}>{site.email}</a> and we will sort it out.</p>
    </div>
  </section>
</BaseLayout>
```

Add `!page.includes('/pay/')` to the sitemap filter in `astro.config.mjs`; add `Disallow: /pay/` to `public/robots.txt`; add a `netlify.toml` headers block after the `/questionnaire/*` one:

```toml
# Stripe Checkout lands here. Nothing on these pages is worth indexing.
[[headers]]
  for = "/pay/*"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
```

and add `'pay/thanks/index.html'` and `'pay/cancelled/index.html'` to `PAGES` in `scripts/verify.mjs`, plus `Disallow: /pay/` to the robots assertion in the same file's "office is disallowed and unlisted" check (rename that check's label to "private routes are disallowed and unlisted").

- [ ] **Step 4: Gate and commit**

Run: `npm run gate` — passes; `verify` sees both pay pages, and the "noindex on ..." structure check should include them (extend that check's list if it enumerates routes).

```bash
git add "src/pages/office/clients/[slug].astro" src/pages/office/index.astro src/pages/pay astro.config.mjs public/robots.txt netlify.toml scripts/verify.mjs
git commit -m "Add the payments tab, dashboard and pay pages"
```

---

### Task 6: Documentation, spec amendments and the deploy checklist

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-04-client-office-design.md`

- [ ] **Step 1: README**

Extend the office environment table:

| Variable | What it does |
|---|---|
| `STRIPE_SECRET_KEY` | Creates customers, Checkout links and subscriptions. Without it the Payments tab shows a banner and every payment button is disabled. Use the test key until the first real client. |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures. Without it every webhook is refused with 400 and no payment is ever marked paid. |

Add after the Meetings subsection:

````markdown
### Payments

Stripe is the system of record; the office stores IDs and outcomes.
Entering the Agreement stage creates the Stripe customer. The Payments tab
makes a deposit or balance link (Stripe Checkout, card and US bank account,
the method is saved for the monthly) and starts the monthly subscription
against that saved method. Amounts prefill from `src/data/packages.json`
and are edited on the form for a discount.

Outcomes arrive through one webhook. In Stripe → Developers → Webhooks add
an endpoint at

```
https://www.keepsitemedia.com/.netlify/functions/stripe-webhook
```

listening to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `invoice.paid`,
`invoice.payment_failed` and `customer.subscription.deleted`, and put its
signing secret in `STRIPE_WEBHOOK_SECRET`. A paid deposit or balance
closes the matching task; nothing advances a stage on its own. Failed
payments show on the dashboard and in the digest; a bank payment shows as
pending until Stripe confirms it, usually within four business days.

Give a bookkeeper a read-only role in Stripe rather than an office login;
`/office/data/` exports the payment documents as CSV for revenue by
client.
````

- [ ] **Step 2: Spec amendments**

In the spec's Data model table, change the `payments/{slug}/{id}.json` row's writer to "the payment action creates the document as `pending`; the Stripe webhook writes every later change". In the Payments section, replace "any discount from the agreement as a coupon" with "any discount as a reduced amount named in the invoice description; Stripe coupons are not used", and add after the bullet list: "Until phase 4 exists, the deposit and balance amounts prefill from half the tier's build price and the admin edits them; phase 4 fills them from the signed agreement." In the Routes table add `| /pay/thanks/, /pay/cancelled/ | none | Where Stripe Checkout returns. Prerendered, noindex. |`.

- [ ] **Step 3: Full gate**

Run: `npm test && npm run gate` — both pass.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-04-client-office-design.md
git commit -m "Document office payments and the Stripe webhook"
```

- [ ] **Step 5: Deploy checklist (by hand, after merge)**

1. Stripe → Developers → API keys: put the test secret key in Netlify as `STRIPE_SECRET_KEY`.
2. Stripe → Webhooks: add the endpoint above with the six events; put the signing secret in `STRIPE_WEBHOOK_SECRET`. Deploy.
3. On a test client, enter Agreement: the Payments tab shows a Stripe customer link.
4. Create a deposit link, open it, pay with Stripe's test card `4242 4242 4242 4242`: `/pay/thanks/` shows, the document turns `paid` within seconds, the "Deposit received" task closes.
5. Create a second link and pay with the test bank account (routing `110000000`, account `000123456789`): the document stays `pending`; Stripe's test clock or the dashboard's "succeed" action flips it to `paid`.
6. Start the monthly: a subscription appears in Stripe against the saved method; the next `invoice.paid` creates a `monthly` document.
7. Switch to live keys only when the first real client reaches Agreement.
