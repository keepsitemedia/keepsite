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

test('own tasks live under the office slug without a client', async () => {
  const s = await make();
  const res = await task(post({ csrf, op: 'add', slug: 'office', title: 'Referral outreach', due: '2026-09-15', project: 'Referral program' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/tasks/');
  const [t] = await s.tasks.list('office');
  assert.equal(t.slug, 'office');
  assert.equal(t.project, 'Referral program');
  assert.equal(t.repeat, null);
  assert.equal(await s.clients.get('office'), null);
});

test('add stores project and repeat on client tasks too, and rejects a bad repeat', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'lova', title: 'Check in', due: '2026-09-15', repeat: 'monthly' }), ctx(), s);
  const [t] = await s.tasks.list('lova');
  assert.equal(t.project, null);
  assert.equal(t.repeat, 'monthly');
  const res = await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-15', repeat: 'daily' }), ctx(), s);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /repeat/);
});

test('done on a repeating task creates the next one, once', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'office', title: 'Invoices', due: '2026-09-30', time: '10:00', repeat: 'monthly', project: 'Admin' }), ctx(), s);
  const [{ id }] = await s.tasks.list('office');
  const at = new Date('2026-10-02T00:00:00Z');
  await task(post({ csrf, op: 'done', slug: 'office', id }), ctx(), s, at);
  let all = (await s.tasks.list('office')).sort((a, b) => a.due.localeCompare(b.due));
  assert.equal(all.length, 2);
  assert.equal(all[0].done, true);
  assert.equal(all[1].due, '2026-10-30');
  assert.equal(all[1].time, '10:00');
  assert.equal(all[1].project, 'Admin');
  assert.equal(all[1].repeat, 'monthly');
  assert.equal(all[1].done, false);
  await task(post({ csrf, op: 'done', slug: 'office', id }), ctx(), s, at);
  all = await s.tasks.list('office');
  assert.equal(all.length, 2);
});

test('reopen then done again does not duplicate the chain link', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'office', title: 'Invoices', due: '2026-09-30', repeat: 'monthly' }), ctx(), s);
  const [{ id }] = await s.tasks.list('office');
  const at = new Date('2026-10-02T00:00:00Z');
  await task(post({ csrf, op: 'done', slug: 'office', id }), ctx(), s, at);
  const original = await s.tasks.get('office', id);
  await task(post({ csrf, op: 'reopen', slug: 'office', id }), ctx(), s);
  await task(post({ csrf, op: 'done', slug: 'office', id }), ctx(), s, at);
  const all = await s.tasks.list('office');
  assert.equal(all.length, 2);
  const done = await s.tasks.get('office', id);
  assert.equal(done.nextId, original.nextId);
  const successor = all.find((t) => t.id === done.nextId);
  assert.ok(successor);
  assert.equal(successor.id, done.nextId);
});

test('reschedule changes repeat only when the form sends it', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'office', title: 'x', due: '2026-09-15', repeat: 'weekly' }), ctx(), s);
  const [{ id }] = await s.tasks.list('office');
  await task(post({ csrf, op: 'reschedule', slug: 'office', id, due: '2026-09-16', time: '' }), ctx(), s);
  assert.equal((await s.tasks.get('office', id)).repeat, 'weekly');
  await task(post({ csrf, op: 'reschedule', slug: 'office', id, due: '2026-09-16', time: '', repeat: '' }), ctx(), s);
  assert.equal((await s.tasks.get('office', id)).repeat, null);
  const res = await task(post({ csrf, op: 'reschedule', slug: 'office', id, due: '2026-09-16', time: '', repeat: 'yearly' }), ctx(), s);
  assert.equal(res.status, 400);
});
