import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  login, requireAdmin, logout, mintCsrf, verifyCsrf, parseCookies, identityUrl, COOKIES,
} from './session.mjs';

const BASE = 'https://site.test/.netlify/identity';
const SECRET = 'session-secret';
const admin = { email: 'me@keepsitemedia.com', app_metadata: { roles: ['admin'] } };
const plain = { email: 'x@example.com', app_metadata: { roles: [] } };

// A scripted Identity: each entry is [url suffix, status, body]. Records calls.
function fakeIdentity(script) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, init });
    const hit = script.find(([suffix]) => url.endsWith(suffix));
    if (!hit) return new Response('nope', { status: 404 });
    const [, status, body] = hit;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchFn, calls };
}

const req = (cookie) =>
  new Request('https://site.test/office/', { headers: cookie ? { cookie } : {} });

const withSecret = async (fn) => {
  process.env.KEEPSITE_SESSION_SECRET = SECRET;
  try { return await fn(); } finally { delete process.env.KEEPSITE_SESSION_SECRET; }
};

test('identityUrl is same-origin unless overridden', () => {
  assert.equal(identityUrl(req()), BASE);
  process.env.IDENTITY_URL = 'https://elsewhere.test/.netlify/identity';
  try { assert.equal(identityUrl(req()), 'https://elsewhere.test/.netlify/identity'); }
  finally { delete process.env.IDENTITY_URL; }
});

test('parseCookies splits a header', () => {
  assert.deepEqual(parseCookies('a=1; ks_access=tok; b=x=y'), { a: '1', ks_access: 'tok', b: 'x=y' });
  assert.deepEqual(parseCookies(null), {});
});

test('login with an admin sets access, refresh and csrf cookies', async () => {
  await withSecret(async () => {
    const { fetchFn, calls } = fakeIdentity([
      ['/token', 200, { access_token: 'A', refresh_token: 'R', expires_in: 3600 }],
      ['/user', 200, admin],
    ]);
    const cookies = await login(BASE, 'me@keepsitemedia.com', 'pw', fetchFn);
    assert.equal(cookies.length, 3);
    assert.match(cookies[0], /^ks_access=A; Max-Age=3600; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
    assert.match(cookies[1], /^ks_refresh=R; /);
    assert.match(cookies[2], /^ks_csrf=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; /);
    assert.equal(calls[0].init.method, 'POST');
    assert.match(String(calls[0].init.body), /grant_type=password/);
  });
});

test('login refuses bad credentials and non-admins', async () => {
  await withSecret(async () => {
    const bad = fakeIdentity([['/token', 401, { error: 'invalid_grant' }]]);
    assert.equal(await login(BASE, 'a', 'b', bad.fetchFn), null);
    const notAdmin = fakeIdentity([
      ['/token', 200, { access_token: 'A', refresh_token: 'R', expires_in: 3600 }],
      ['/user', 200, plain],
    ]);
    assert.equal(await login(BASE, 'x@example.com', 'pw', notAdmin.fetchFn), null);
  });
});

test('requireAdmin passes a valid admin token and reports the csrf cookie', async () => {
  const { fetchFn } = fakeIdentity([['/user', 200, admin]]);
  const r = await requireAdmin(req('ks_access=A; ks_csrf=c.s'), fetchFn);
  assert.equal(r.ok, true);
  assert.equal(r.user.email, admin.email);
  assert.deepEqual(r.cookies, []);
  assert.equal(r.csrf, 'c.s');
});

test('requireAdmin refreshes an expired token and sets new cookies', async () => {
  let userCalls = 0;
  const fetchFn = async (url, init = {}) => {
    if (url.endsWith('/user')) {
      userCalls += 1;
      const ok = init.headers.Authorization === 'Bearer NEW';
      return new Response(JSON.stringify(ok ? admin : {}), { status: ok ? 200 : 401 });
    }
    if (url.endsWith('/token')) {
      assert.match(String(init.body), /grant_type=refresh_token&refresh_token=R/);
      return new Response(JSON.stringify({ access_token: 'NEW', refresh_token: 'R2', expires_in: 3600 }));
    }
    return new Response('', { status: 404 });
  };
  const r = await requireAdmin(req('ks_access=OLD; ks_refresh=R'), fetchFn);
  assert.equal(r.ok, true);
  assert.equal(userCalls, 2);
  assert.match(r.cookies[0], /^ks_access=NEW; /);
  assert.match(r.cookies[1], /^ks_refresh=R2; /);
});

test('requireAdmin refuses when there is no session, a bad refresh, or no admin role', async () => {
  const none = await requireAdmin(req(''), fakeIdentity([]).fetchFn);
  assert.equal(none.ok, false);
  const badRefresh = await requireAdmin(
    req('ks_access=OLD; ks_refresh=R'),
    fakeIdentity([['/user', 401, {}], ['/token', 401, {}]]).fetchFn,
  );
  assert.equal(badRefresh.ok, false);
  assert.match(badRefresh.cookies[0], /^ks_access=; Max-Age=0; /);
  const notAdmin = await requireAdmin(req('ks_access=A'), fakeIdentity([['/user', 200, plain]]).fetchFn);
  assert.equal(notAdmin.ok, false);
});

test('logout clears all three cookies and tells Identity', async () => {
  const { fetchFn, calls } = fakeIdentity([['/logout', 204, {}]]);
  const cookies = await logout(req('ks_access=A; ks_refresh=R'), fetchFn);
  assert.equal(cookies.length, 3);
  assert.ok(cookies.every((c) => c.includes('Max-Age=0')));
  assert.equal(calls[0].init.headers.Authorization, 'Bearer A');
});

test('requireAdmin with a throwing fetchFn resolves to ok: false', async () => {
  const fetchFn = async () => { throw new Error('network error'); };
  const r = await requireAdmin(req('ks_access=A'), fetchFn);
  assert.equal(r.ok, false);
});

test('login with non-JSON token response returns null', async () => {
  await withSecret(async () => {
    const fetchFn = async (url) => {
      if (url.endsWith('/token')) return new Response('not json', { status: 200 });
      return new Response('', { status: 404 });
    };
    assert.equal(await login(BASE, 'a', 'b', fetchFn), null);
  });
});

test('csrf tokens verify only with the same secret and an exact match', () => {
  const t = mintCsrf(SECRET);
  assert.ok(verifyCsrf(SECRET, t, t));
  assert.ok(!verifyCsrf(SECRET, t, t + 'x'));
  assert.ok(!verifyCsrf('other', t, t));
  assert.ok(!verifyCsrf(SECRET, 'forged.forged', 'forged.forged'));
  assert.ok(!verifyCsrf('', t, t));
  assert.ok(!verifyCsrf(SECRET, '', ''));
});

test('COOKIES names are the ones the middleware and pages use', () => {
  assert.deepEqual(COOKIES, { access: 'ks_access', refresh: 'ks_refresh', csrf: 'ks_csrf' });
});
