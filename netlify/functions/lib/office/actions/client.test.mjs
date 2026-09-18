import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client as action } from './client.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';
import { newContact } from '../contacts.mjs';

const SECRET = 's';
const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
// The questionnaire endpoint writes through its own store handle, so the
// office store exposes no writer; a test that seeds answers must hold the
// backend itself.
const makeWithIntake = () => {
  const intake = memoryBackend();
  return { s: createStore({ office: memoryBackend(), questionnaires: intake }), intake };
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/client', { method: 'POST', body: d });
};
const good = { name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Growth', pipeline: 'website' };

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

// A slug is reusable, so anything left behind under it is inherited by the
// next client of the same name — and nothing in the office would show it.
test('delete clears the research study and the questionnaire answers', async () => {
  const { s, intake } = makeWithIntake();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  await s.research.put('lova', { slug: 'lova', createdAt: 'a', updatedAt: 'a', rounds: [] });
  await intake.setText('lova/build.json', JSON.stringify({ answers: { business: 'Lova' } }));
  await intake.setBytes('lova/logo.png', new Uint8Array([1, 2, 3]), { type: 'image/png' });

  await action(post({ op: 'delete', csrf, slug: 'lova' }), ctx(), s);

  assert.equal(await s.clients.get('lova'), null);
  assert.equal(await s.research.get('lova'), null);
  assert.equal(await s.questionnaires.get('lova', 'build'), null);
  assert.deepEqual(await s.questionnaires.files('lova'), []);
});

test('create picks a free slug when the business name is taken', async () => {
  const s = make();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  const res = await action(post({ op: 'create', csrf, ...good, email: 'other@example.com' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova-2/');
});

test('two creates in flight together make one client and one task set', async () => {
  const s = make();
  const [a, b] = await Promise.all([
    action(post({ op: 'create', csrf, ...good }), ctx(), s),
    action(post({ op: 'create', csrf, ...good }), ctx(), s),
  ]);
  assert.equal(a.headers.get('Location'), '/office/clients/lova/');
  assert.equal(b.headers.get('Location'), '/office/clients/lova/');
  assert.deepEqual((await s.clients.list()).map((c) => c.slug), ['lova']);
  assert.deepEqual((await s.tasks.list('lova')).map((t) => t.title), ['Reply with recommendation']);
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

test('create from a contact links the contact to the new client', async () => {
  const s = make();
  const c = newContact({ business: 'Lova', owner: 'Sierra', email: 's@example.com', type: 'partner' });
  await s.contacts.put(c.id, c);
  const res = await action(post({ op: 'create', csrf, ...good, contact: c.id }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  assert.equal((await s.contacts.get(c.id)).clientSlug, 'lova');
});

test('a stale contact id does not stop the client being created', async () => {
  const s = make();
  const res = await action(post({ op: 'create', csrf, ...good, contact: '20260912T000000aaaaaa' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
});

test('deleting a client clears the clientSlug of its linked contact', async () => {
  const s = make();
  const c = newContact({ business: 'Lova', owner: 'Sierra', email: 's@example.com', type: 'partner' });
  await s.contacts.put(c.id, c);
  await action(post({ op: 'create', csrf, ...good, contact: c.id }), ctx(), s);
  assert.equal((await s.contacts.get(c.id)).clientSlug, 'lova');
  await action(post({ op: 'delete', csrf, slug: 'lova' }), ctx(), s);
  assert.equal((await s.contacts.get(c.id)).clientSlug, null);
  assert.equal(await s.clients.get('lova'), null);
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

test('update keeps a stored retired tier but refuses a different retired one', async () => {
  const s = await make();
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search', pipeline: 'website', stage: 'inquiry', stages: [], dates: {}, createdAt: 'x' });
  let res = await action(post({ csrf, op: 'update', slug: 'lova', name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  res = await action(post({ csrf, op: 'update', slug: 'lova', name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search Plus' }), ctx(), s);
  assert.match(res.headers.get('Location'), /error=.*tier/);
});

test('update of an unknown client is a 404 and an unknown op a 400', async () => {
  const s = make();
  assert.equal((await action(post({ op: 'update', csrf, slug: 'ghost', ...good }), ctx(), s)).status, 404);
  assert.equal((await action(post({ op: 'nope', csrf }), ctx(), s)).status, 400);
});

test('delete removes the client and everything filed under it, then lands on the list', async () => {
  const s = make();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  await s.meetings.put('lova', '20260901T120000abcdef', { id: '20260901T120000abcdef', slug: 'lova', title: 'Call' });
  await s.documents.put('lova', 'logo.png', new Uint8Array([1, 2, 3]), { type: 'image/png' });
  const res = await action(post({ op: 'delete', csrf, slug: 'lova' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/');
  assert.equal(await s.clients.get('lova'), null);
  assert.deepEqual(await s.tasks.list('lova'), []);
  assert.deepEqual(await s.meetings.list('lova'), []);
  assert.deepEqual(await s.documents.list('lova'), []);
});

test('delete refuses a client with a signed agreement or a payment on record', async () => {
  const s = make();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  await s.agreements.put('lova', '20260901T120000abcdef', { id: '20260901T120000abcdef', slug: 'lova', status: 'completed' });
  let res = await action(post({ op: 'delete', csrf, slug: 'lova' }), ctx(), s);
  assert.match(decodeURIComponent(res.headers.get('Location')), /signed agreement/);
  assert.ok(await s.clients.get('lova'));
  await s.agreements.remove('lova', '20260901T120000abcdef');
  await s.payments.put('lova', '20260901T120000abcdeg', { id: '20260901T120000abcdeg', slug: 'lova', kind: 'deposit', status: 'paid' });
  res = await action(post({ op: 'delete', csrf, slug: 'lova' }), ctx(), s);
  assert.match(decodeURIComponent(res.headers.get('Location')), /payment on record/);
  assert.ok(await s.clients.get('lova'));
});
