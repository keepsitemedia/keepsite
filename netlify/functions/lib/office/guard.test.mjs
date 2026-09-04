import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decide, applyHeaders, OFFICE_HEADERS, isOffice, isPublic, isApi } from './guard.mjs';

const ok = { ok: true, user: { email: 'me@keepsitemedia.com' }, cookies: [], csrf: 'c.s' };
const refused = { ok: false, cookies: [] };

test('a non-office path skips the guard entirely', () => {
  assert.deepEqual(decide('/', refused), { kind: 'skip' });
  assert.deepEqual(decide('/packages/', ok), { kind: 'skip' });
});

test('the login page and login api are public', () => {
  assert.deepEqual(decide('/office/login/', refused), { kind: 'public' });
  assert.deepEqual(decide('/office/api/login', refused), { kind: 'public' });
});

test('an unauthenticated office page redirects to login with next', () => {
  const d = decide('/office/clients/', refused);
  assert.deepEqual(d, { kind: 'refuse', status: 302, location: '/office/login/?next=%2Foffice%2Fclients%2F' });
});

test('an unauthenticated office api call gets 401, not a redirect', () => {
  assert.deepEqual(decide('/office/api/task', refused), { kind: 'refuse', status: 401 });
});

test('an authenticated request passes with admin and csrf', () => {
  assert.deepEqual(decide('/office/clients/', ok), { kind: 'pass', admin: ok.user, csrf: 'c.s' });
});

test('applyHeaders sets every office header on the response', () => {
  const res = applyHeaders(new Response('hi'));
  for (const [k, v] of Object.entries(OFFICE_HEADERS)) assert.equal(res.headers.get(k), v);
});

test('OFFICE_HEADERS matches the "/*" values in netlify.toml', () => {
  const toml = fs.readFileSync(new URL('../../../../netlify.toml', import.meta.url), 'utf8');
  const starBlock = toml.slice(toml.indexOf('for = "/*"'));
  const csp = starBlock.match(/Content-Security-Policy = "([^"]+)"/);
  assert.ok(csp, 'no Content-Security-Policy found after for = "/*"');
  assert.equal(OFFICE_HEADERS['Content-Security-Policy'], csp[1]);
  const hsts = starBlock.match(/Strict-Transport-Security = "([^"]+)"/);
  assert.equal(OFFICE_HEADERS['Strict-Transport-Security'], hsts[1]);
  const pp = starBlock.match(/Permissions-Policy = "([^"]+)"/);
  assert.equal(OFFICE_HEADERS['Permissions-Policy'], pp[1]);
  assert.equal(OFFICE_HEADERS['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(OFFICE_HEADERS['Cache-Control'], 'private, no-store');
});

test('isOffice, isPublic and isApi classify paths as expected', () => {
  assert.equal(isOffice('/office'), true);
  assert.equal(isOffice('/office/'), true);
  assert.equal(isOffice('/officex'), false);
  assert.equal(isPublic('/office/login/'), true);
  assert.equal(isPublic('/office/clients/'), false);
  assert.equal(isApi('/office/api/task'), true);
  assert.equal(isApi('/office/clients/'), false);
});
