import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login } from './login.mjs';
import { logout } from './logout.mjs';

const admin = { email: 'me@keepsitemedia.com', app_metadata: { roles: ['admin'] } };
const post = (fields, path = '/office/api/login') => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request(`https://site.test${path}`, { method: 'POST', body: d });
};
const identity = (ok) => async (url) => {
  if (url.endsWith('/token')) {
    return ok
      ? new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }))
      : new Response('{}', { status: 401 });
  }
  if (url.endsWith('/user')) return new Response(JSON.stringify(admin));
  return new Response('', { status: 204 });
};

test('login sets cookies and lands on next', async () => {
  process.env.KEEPSITE_SESSION_SECRET = 's';
  try {
    const res = await login(post({ email: 'me@keepsitemedia.com', password: 'pw', next: '/office/calendar/' }), {}, identity(true));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('Location'), '/office/calendar/');
    assert.equal(res.headers.getSetCookie().length, 3);
  } finally {
    delete process.env.KEEPSITE_SESSION_SECRET;
  }
});

test('login failure goes back to the form with a generic flag and no cookies', async () => {
  const res = await login(post({ email: 'a', password: 'b' }), {}, identity(false));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/office/login/?error=1&next=%2Foffice%2F');
  assert.equal(res.headers.getSetCookie().length, 0);
});

test('login refuses non-POST and non-form bodies', async () => {
  assert.equal((await login(new Request('https://site.test/office/api/login'), {})).status, 405);
  const res = await login(new Request('https://site.test/office/api/login', { method: 'POST', body: 'x' }), {});
  assert.equal(res.status, 400);
});

test('logout clears cookies and lands on the login page', async () => {
  const res = await logout(post({}, '/office/api/logout'), { admin: { email: 'x' }, csrf: '' }, identity(true));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/office/login/');
  assert.ok(res.headers.getSetCookie().every((c) => c.includes('Max-Age=0')));
});
