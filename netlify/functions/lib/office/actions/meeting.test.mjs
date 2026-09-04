import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meeting } from './meeting.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/meeting', { method: 'POST', body: d });
};
let csrf;
test.before(() => {
  process.env.KEEPSITE_SESSION_SECRET = 's'; process.env.RESEND_API_KEY = 'k';
  process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@x';
  csrf = mintCsrf('s');
});
test.after(() => { for (const k of ['KEEPSITE_SESSION_SECRET', 'RESEND_API_KEY', 'KEEPSITE_NOTIFY_FROM', 'KEEPSITE_NOTIFY_TO']) delete process.env[k]; });
const ctx = () => ({ admin: { email: 'me@x' }, csrf });
const NOW = new Date('2026-09-04T16:00:00Z');
const add = { csrf, op: 'add', slug: 'lova', title: 'Kickoff', date: '2026-09-08', time: '14:30', minutes: '30', link: 'https://meet/x', notes: 'Bring the logo' };

test('add stores the meeting and emails the client and the admin with a calendar file', async () => {
  const s = await make();
  const sent = [];
  const fetchFn = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); };
  const res = await meeting(post(add), ctx(), s, fetchFn, NOW);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=meetings');
  const [m] = await s.meetings.list('lova');
  assert.equal(m.title, 'Kickoff');
  assert.equal(m.ymd, '2026-09-08');
  assert.equal(m.time, '14:30');
  assert.equal(m.minutes, 30);
  assert.deepEqual(m.remindersSent, { day: null, hour: null });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((x) => x.to), [['s@example.com'], ['me@x']]);
  assert.match(sent[0].subject, /Confirmed: Kickoff on Tue, Sep 8 at 2:30 pm Mountain/);
  assert.equal(sent[0].attachments[0].filename, 'kickoff.ics');
  assert.match(Buffer.from(sent[0].attachments[0].content, 'base64').toString(), /DTSTART:20260908T203000Z/);
  assert.equal((await s.emails.list('lova')).length, 2);
});

test('add validates its fields and refuses an unknown client', async () => {
  const s = await make();
  const none = async () => { throw new Error('must not send'); };
  assert.equal((await meeting(post({ ...add, title: '' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, date: '2026-9-8' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, time: '2:30' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, minutes: '0' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, link: 'javascript:alert(1)' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, slug: 'ghost' }), ctx(), s, none)).status, 404);
  assert.equal((await meeting(post({ ...add, csrf: 'x' }), ctx(), s, none)).status, 403);
  assert.equal((await s.meetings.list('lova')).length, 0);
});

test('reschedule moves the meeting, resets reminders and re-confirms; delete removes it', async () => {
  const s = await make();
  const sent = [];
  const fetchFn = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); };
  await meeting(post(add), ctx(), s, fetchFn, NOW);
  const [{ id }] = await s.meetings.list('lova');
  await s.meetings.put('lova', id, { ...(await s.meetings.get('lova', id)), remindersSent: { day: '2026-09-07T20:00:00.000Z', hour: null } });
  const res = await meeting(post({ csrf, op: 'reschedule', slug: 'lova', id, date: '2026-09-09', time: '09:00', back: '/office/calendar/?d=2026-09-09' }), ctx(), s, fetchFn, NOW);
  assert.equal(res.headers.get('Location'), '/office/calendar/?d=2026-09-09');
  const m = await s.meetings.get('lova', id);
  assert.equal(m.ymd, '2026-09-09');
  assert.deepEqual(m.remindersSent, { day: null, hour: null });
  assert.equal(sent.length, 4);
  const del = await meeting(post({ csrf, op: 'delete', slug: 'lova', id }), ctx(), s, fetchFn, NOW);
  assert.equal(del.status, 303);
  assert.equal(await s.meetings.get('lova', id), null);
  assert.equal(sent.length, 4);
});

test('a failed confirmation still keeps the meeting', async () => {
  const s = await make();
  const bad = async () => new Response('{"message":"nope"}', { status: 500 });
  const res = await meeting(post(add), ctx(), s, bad, NOW);
  assert.equal(res.status, 303);
  assert.equal((await s.meetings.list('lova')).length, 1);
  assert.ok((await s.emails.list('lova')).every((e) => e.status === 'failed'));
});
