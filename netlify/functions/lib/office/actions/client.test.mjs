import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client as action } from './client.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const SECRET = 's';
const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/client', { method: 'POST', body: d });
};
const good = { name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search', pipeline: 'website' };

let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = SECRET; csrf = mintCsrf(SECRET); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });

test('create writes the client, its inquiry tasks, and redirects to it', async () => {
  const s = make();
  const res = await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  const c = await s.clients.get('lova');
  assert.equal(c.stage, 'inquiry');
  assert.equal(c.pipeline, 'website');
  assert.deepEqual((await s.tasks.list('lova')).map((t) => t.title), ['Reply with recommendation']);
});

test('create picks a free slug when the business name is taken', async () => {
  const s = make();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  const res = await action(post({ op: 'create', csrf, ...good, email: 'other@example.com' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova-2/');
});

test('create refuses a bad csrf token, a bad pipeline, and bad fields', async () => {
  const s = make();
  assert.equal((await action(post({ op: 'create', csrf: 'x', ...good }), ctx(), s)).status, 403);
  assert.equal((await action(post({ op: 'create', csrf, ...good, pipeline: 'nope' }), ctx(), s)).status, 400);
  const res = await action(post({ op: 'create', csrf, ...good, email: 'bad' }), ctx(), s);
  assert.equal(res.status, 303);
  assert.match(res.headers.get('Location'), /^\/office\/clients\/new\/\?error=/);
  assert.equal((await s.clients.list()).length, 0);
});

test('update edits fields and keeps the slug and stage', async () => {
  const s = make();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  const res = await action(post({ op: 'update', csrf, slug: 'lova', ...good, phone: '555', stage: 'live' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  const c = await s.clients.get('lova');
  assert.equal(c.phone, '555');
  assert.equal(c.stage, 'inquiry');
});

test('update of an unknown client is a 404 and an unknown op a 400', async () => {
  const s = make();
  assert.equal((await action(post({ op: 'update', csrf, slug: 'ghost', ...good }), ctx(), s)).status, 404);
  assert.equal((await action(post({ op: 'nope', csrf }), ctx(), s)).status, 400);
});
