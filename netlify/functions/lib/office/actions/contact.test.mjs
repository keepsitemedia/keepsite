import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contact as action } from './contact.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/contact', { method: 'POST', body: d });
};
const good = { business: 'Peak Print Co', owner: 'Dana', email: 'dana@example.com', type: 'vendor' };
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });
const idFrom = (res) => res.headers.get('Location').match(/\/office\/contacts\/([^/]+)\//)[1];

test('create writes the contact and lands on its page', async () => {
  const s = make();
  const res = await action(post({ csrf, op: 'create', ...good }), ctx(), s);
  assert.equal(res.status, 303);
  const id = idFrom(res);
  const c = await s.contacts.get(id);
  assert.equal(c.business, 'Peak Print Co');
  assert.equal(c.type, 'vendor');
  assert.deepEqual(c.notes, []);
});

test('create sends errors back to the form', async () => {
  const s = make();
  const res = await action(post({ csrf, op: 'create', ...good, business: '' }), ctx(), s);
  assert.equal(res.status, 303);
  assert.match(res.headers.get('Location'), /^\/office\/contacts\/new\/\?error=.*business/);
  assert.equal(await s.contacts.count(), 0);
});

test('edit, note and delete', async () => {
  const s = make();
  const id = idFrom(await action(post({ csrf, op: 'create', ...good }), ctx(), s));
  await action(post({ csrf, op: 'edit', id, ...good, owner: 'Dana K' }), ctx(), s);
  assert.equal((await s.contacts.get(id)).owner, 'Dana K');
  const bad = await action(post({ csrf, op: 'edit', id, ...good, type: 'friend' }), ctx(), s);
  assert.match(bad.headers.get('Location'), new RegExp(`^/office/contacts/${id}/\\?error=.*type`));
  const at = new Date('2026-09-13T10:00:00Z');
  await action(post({ csrf, op: 'note', id, text: 'Sent two leads' }), ctx(), s, at);
  const c = await s.contacts.get(id);
  assert.deepEqual(c.notes, [{ at: at.toISOString(), text: 'Sent two leads' }]);
  const empty = await action(post({ csrf, op: 'note', id, text: '  ' }), ctx(), s);
  assert.match(empty.headers.get('Location'), /error=/);
  assert.equal((await s.contacts.get(id)).notes.length, 1);
  const gone = await action(post({ csrf, op: 'delete', id }), ctx(), s);
  assert.equal(gone.headers.get('Location'), '/office/contacts/');
  assert.equal(await s.contacts.get(id), null);
});

test('bad and unknown ids, unknown op, missing csrf', async () => {
  const s = make();
  assert.equal((await action(post({ csrf, op: 'edit', id: '../x', ...good }), ctx(), s)).status, 400);
  assert.equal((await action(post({ csrf, op: 'note', id: '20260912T000000aaaaaa', text: 'x' }), ctx(), s)).status, 404);
  assert.equal((await action(post({ csrf, op: 'nope' }), ctx(), s)).status, 400);
  assert.equal((await action(post({ op: 'create', ...good }), ctx(), s)).status, 403);
});
