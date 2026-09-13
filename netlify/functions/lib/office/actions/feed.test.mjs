import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feed } from './feed.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { newId } from '../ids.mjs';

const TOKEN = 'a'.repeat(43);
const NOW = new Date('2026-09-13T15:00:00Z');
const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('acme', { slug: 'acme', business: 'Acme' });
  const a = newId(NOW);
  await s.tasks.put('acme', a, { id: a, slug: 'acme', title: 'Layouts', due: '2026-09-15', time: null, done: false, source: 'pipeline', stage: 'layouts', questionnaire: null, payment: null, agreement: null });
  const b = newId(new Date(NOW.getTime() + 1000));
  await s.tasks.put('office', b, { id: b, slug: 'office', title: 'Post', due: '2026-09-19', time: '09:00', done: false, source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null, project: 'Marketing', repeat: 'weekly', nextId: null });
  const c = newId(new Date(NOW.getTime() + 2000));
  await s.meetings.put('acme', c, { id: c, slug: 'acme', title: 'Kickoff', ymd: '2026-09-16', time: '10:00', minutes: 30, link: '' });
  return { s, a, b, c };
};
const get = (q = '', headers = {}) => new Request(`https://site.test/office/api/feed${q}`, { headers: { Authorization: `Bearer ${TOKEN}`, ...headers } });
const post = (body, headers = {}) => new Request('https://site.test/office/api/feed', {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const ctx = { admin: null, csrf: '' };

test.before(() => { process.env.KEEPSITE_FEED_TOKEN = TOKEN; });
test.after(() => { delete process.env.KEEPSITE_FEED_TOKEN; });

test('the token is required, checked, and fails closed when unset', async () => {
  const { s } = await make();
  assert.equal((await feed(new Request('https://site.test/office/api/feed'), ctx, s, NOW)).status, 401);
  assert.equal((await feed(get('', { Authorization: `Bearer ${'b'.repeat(43)}` }), ctx, s, NOW)).status, 401);
  assert.equal((await feed(get('', { Authorization: 'Bearer short' }), ctx, s, NOW)).status, 401);
  const saved = process.env.KEEPSITE_FEED_TOKEN;
  delete process.env.KEEPSITE_FEED_TOKEN;
  const res = await feed(get(), ctx, s, NOW);
  process.env.KEEPSITE_FEED_TOKEN = saved;
  assert.equal(res.status, 401);
  assert.equal(await res.text(), '');
  assert.equal((await feed(new Request('https://site.test/office/api/feed', { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } }), ctx, s, NOW)).status, 405);
});

test('GET returns the window as JSON with the office headers it owns', async () => {
  const { s, a, b, c } = await make();
  const res = await feed(get('?from=2026-09-10&to=2026-09-20'), ctx, s, NOW);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.match(res.headers.get('Content-Type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.timezone, 'America/Denver');
  assert.equal(body.generatedAt, NOW.toISOString());
  assert.match(body.office, /\/office\/$/);
  assert.deepEqual(body.items.map((i) => i.id), [a, c, b]);
  assert.equal(body.items[0].brand, 'keepsite');
  assert.equal(body.items[2].brand, null);
  const bad = await feed(get('?from=nope'), ctx, s, NOW);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /from/);
});

test('GET can answer ICS by query or by Accept', async () => {
  const { s } = await make();
  for (const req of [get('?format=ics'), get('', { Accept: 'text/calendar' })]) {
    const res = await feed(req, ctx, s, NOW);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Type'), /text\/calendar/);
    assert.match(await res.text(), /BEGIN:VCALENDAR/);
  }
});

test('POST add creates an own task and returns it', async () => {
  const { s } = await make();
  const res = await feed(post({ op: 'add', title: 'Renew domain', due: '2026-10-01', project: 'Admin' }), ctx, s, NOW);
  assert.equal(res.status, 201);
  const item = await res.json();
  assert.equal(item.kind, 'task');
  assert.equal(item.slug, 'office');
  assert.equal(item.project, 'Admin');
  assert.equal(item.brand, null);
  assert.equal((await s.tasks.get('office', item.id)).title, 'Renew domain');
  const bad = await feed(post({ op: 'add', title: '', due: '2026-10-01' }), ctx, s, NOW);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /title/);
  assert.equal((await feed(post({ op: 'nope' }), ctx, s, NOW)).status, 400);
  assert.equal((await feed(new Request('https://site.test/office/api/feed', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: 'not json' }), ctx, s, NOW)).status, 400);
});

test('POST done and reopen work on any task by id and spawn like the office', async () => {
  const { s, a, b } = await make();
  const done = await feed(post({ op: 'done', id: b }), ctx, s, NOW);
  assert.equal(done.status, 200);
  assert.equal((await done.json()).done, true);
  const own = await s.tasks.list('office');
  assert.equal(own.length, 2);
  assert.ok(own.some((t) => t.due === '2026-09-26' && !t.done));
  const client = await feed(post({ op: 'done', id: a }), ctx, s, NOW);
  assert.equal(client.status, 200);
  assert.equal((await s.tasks.get('acme', a)).done, true);
  const reopened = await feed(post({ op: 'reopen', id: a }), ctx, s, NOW);
  assert.equal((await reopened.json()).done, false);
  assert.equal((await feed(post({ op: 'done', id: '20260101T000000zzzzzz' }), ctx, s, NOW)).status, 404);
  assert.equal((await feed(post({ op: 'done', id: '../x' }), ctx, s, NOW)).status, 400);
});
