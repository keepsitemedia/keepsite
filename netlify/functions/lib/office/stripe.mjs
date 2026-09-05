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
    for (const [k, v] of Object.entries(value)) {
      const key = encodeURIComponent(k);
      flatten(v, prefix ? `${prefix}[${key}]` : key, out);
    }
  } else {
    out.push([prefix, String(value)]);
  }
}

// Brackets stay literal: Stripe reads `line_items[0][quantity]`, not its
// percent-encoded form. The segments inside them, like every value, are
// percent-encoded — an unescaped `&` or `=` in a key would otherwise be read
// as a second field by a form parser.
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
