// The whole login: Identity's token endpoint on the way in, its user endpoint
// on every request, and cookies in between. The widget is not used because
// it would need unpkg in the CSP; these three endpoints are same-origin and
// the browser never talks to Identity at all.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIES = { access: 'ks_access', refresh: 'ks_refresh', csrf: 'ks_csrf' };
const HOUR = 3600;
const MONTH = 30 * 86400;

export function identityUrl(request) {
  return process.env.IDENTITY_URL ?? new URL('/.netlify/identity', request.url).href;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const cookie = (name, value, maxAge) =>
  `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
const clear = (name) => cookie(name, '', 0);

async function token(base, params, fetchFn) {
  const res = await fetchFn(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.access_token && body?.refresh_token ? body : null;
}

async function user(base, access, fetchFn) {
  const res = await fetchFn(`${base}/user`, { headers: { Authorization: `Bearer ${access}` } });
  return res.ok ? res.json() : null;
}

const isAdmin = (u) => Array.isArray(u?.app_metadata?.roles) && u.app_metadata.roles.includes('admin');

const sessionCookies = (tok) => [
  cookie(COOKIES.access, tok.access_token, tok.expires_in ?? HOUR),
  cookie(COOKIES.refresh, tok.refresh_token, MONTH),
];

export async function login(base, email, password, fetchFn = fetch) {
  const tok = await token(base, { grant_type: 'password', username: email, password }, fetchFn);
  if (!tok) return null;
  const u = await user(base, tok.access_token, fetchFn);
  if (!isAdmin(u)) return null;
  return [...sessionCookies(tok), cookie(COOKIES.csrf, mintCsrf(process.env.KEEPSITE_SESSION_SECRET), MONTH)];
}

export async function requireAdmin(request, fetchFn = fetch) {
  const base = identityUrl(request);
  const jar = parseCookies(request.headers.get('cookie'));
  const cookies = [];
  let u = jar[COOKIES.access] ? await user(base, jar[COOKIES.access], fetchFn) : null;
  if (!u && jar[COOKIES.refresh]) {
    const tok = await token(base, { grant_type: 'refresh_token', refresh_token: jar[COOKIES.refresh] }, fetchFn);
    if (tok) {
      u = await user(base, tok.access_token, fetchFn);
      if (u) cookies.push(...sessionCookies(tok));
    }
  }
  if (!isAdmin(u)) return { ok: false, cookies: [clear(COOKIES.access), clear(COOKIES.refresh)] };
  return { ok: true, user: { email: u.email }, cookies, csrf: jar[COOKIES.csrf] ?? '' };
}

export async function logout(request, fetchFn = fetch) {
  const jar = parseCookies(request.headers.get('cookie'));
  if (jar[COOKIES.access]) {
    try {
      await fetchFn(`${identityUrl(request)}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jar[COOKIES.access]}` },
      });
    } catch {
      // The cookies clear either way; a failed revoke leaves a token that
      // expires within the hour.
    }
  }
  return [clear(COOKIES.access), clear(COOKIES.refresh), clear(COOKIES.csrf)];
}

// nonce.hmac rather than a bare nonce, so a cookie planted from a sibling
// subdomain does not pass just by echoing itself into the form.
const sign = (secret, nonce) => createHmac('sha256', secret).update(nonce).digest('base64url');

export function mintCsrf(secret) {
  if (!secret) return '';
  const nonce = randomBytes(16).toString('base64url');
  return `${nonce}.${sign(secret, nonce)}`;
}

export function verifyCsrf(secret, cookieValue, fieldValue) {
  if (!secret || !cookieValue || !fieldValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(fieldValue);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [nonce, mac] = cookieValue.split('.');
  if (!nonce || !mac) return false;
  const want = Buffer.from(sign(secret, nonce));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}
