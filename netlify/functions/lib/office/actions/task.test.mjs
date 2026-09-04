import { test } from 'node:test';
import assert from 'node:assert/strict';
import { task } from './task.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', business: 'Lova' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/task', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });

test('add creates a manual task and returns to the caller', async () => {
  const s = await make();
  const res = await task(post({ csrf, op: 'add', slug: 'lova', title: 'Call about photos', due: '2026-09-10', time: '14:30', back: '/office/calendar/?d=2026-09-10' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/calendar/?d=2026-09-10');
  const [t] = await s.tasks.list('lova');
  assert.equal(t.source, 'manual');
  assert.equal(t.stage, null);
  assert.equal(t.time, '14:30');
  assert.equal(t.due, '2026-09-10');
});

test('add validates title, date and time', async () => {
  const s = await make();
  assert.equal((await task(post({ csrf, op: 'add', slug: 'lova', title: '', due: '2026-09-10' }), ctx(), s)).status, 400);
  assert.equal((await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-9-1' }), ctx(), s)).status, 400);
  assert.equal((await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-10', time: '25:00' }), ctx(), s)).status, 400);
  assert.equal((await task(post({ csrf, op: 'add', slug: 'ghost', title: 'x', due: '2026-09-10' }), ctx(), s)).status, 404);
});

test('done, reopen, reschedule and delete', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-10' }), ctx(), s);
  const [{ id }] = await s.tasks.list('lova');
  await task(post({ csrf, op: 'done', slug: 'lova', id }), ctx(), s, new Date('2026-09-05T00:00:00Z'));
  let t = await s.tasks.get('lova', id);
  assert.equal(t.done, true);
  assert.equal(t.doneAt, '2026-09-05T00:00:00.000Z');
  await task(post({ csrf, op: 'reopen', slug: 'lova', id }), ctx(), s);
  t = await s.tasks.get('lova', id);
  assert.equal(t.done, false);
  assert.equal(t.doneAt, null);
  await task(post({ csrf, op: 'reschedule', slug: 'lova', id, due: '2026-09-12', time: '' }), ctx(), s);
  t = await s.tasks.get('lova', id);
  assert.equal(t.due, '2026-09-12');
  assert.equal(t.time, null);
  const res = await task(post({ csrf, op: 'delete', slug: 'lova', id }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=tasks');
  assert.equal(await s.tasks.get('lova', id), null);
});

test('an unknown id is 404 and a bad back path falls to the client page', async () => {
  const s = await make();
  assert.equal((await task(post({ csrf, op: 'done', slug: 'lova', id: '20260904T000000aaaaaa' }), ctx(), s)).status, 404);
  const res = await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-10', back: 'https://evil.test/' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=tasks');
});
