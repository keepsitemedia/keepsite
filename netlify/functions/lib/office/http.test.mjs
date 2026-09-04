import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readForm, redirect, problem, checkCsrf, field, safeNext } from './http.mjs';
import { mintCsrf } from './session.mjs';

const form = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('http://x/office/api/task', { method: 'POST', body: d });
};

test('readForm returns null for a body that is not a form', async () => {
  assert.equal(await readForm(new Request('http://x/', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })), null);
  const d = await readForm(form({ a: ' 1 ' }));
  assert.equal(field(d, 'a'), '1');
  assert.equal(field(d, 'missing'), '');
});

test('redirect and problem build the expected responses', async () => {
  const r = redirect('/office/');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('Location'), '/office/');
  const p = problem(400, 'no');
  assert.equal(p.status, 400);
  assert.equal(await p.text(), 'no');
});

test('checkCsrf compares the cookie value the guard saw with the form field', async () => {
  process.env.KEEPSITE_SESSION_SECRET = 's';
  try {
    const t = mintCsrf('s');
    assert.ok(checkCsrf({ csrf: t }, await readForm(form({ csrf: t }))));
    assert.ok(!checkCsrf({ csrf: t }, await readForm(form({ csrf: 'other' }))));
    assert.ok(!checkCsrf({ csrf: '' }, await readForm(form({ csrf: '' }))));
  } finally {
    delete process.env.KEEPSITE_SESSION_SECRET;
  }
});

test('safeNext only allows office paths', () => {
  assert.equal(safeNext('/office/clients/'), '/office/clients/');
  assert.equal(safeNext('/office//evil.test'), '/office/');
  assert.equal(safeNext('https://evil.test/office/'), '/office/');
  assert.equal(safeNext('/office/api/logout'), '/office/');
  assert.equal(safeNext(''), '/office/');
  assert.equal(safeNext('/office/x\\evil'), '/office/');
});
