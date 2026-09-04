import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, runMeetingReminders } from './reminders.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';

// 2026-09-08 14:30 Mountain is 20:30Z.
const m = (over = {}) => ({ id: newId(), slug: 'lova', title: 'Kickoff', ymd: '2026-09-08', time: '14:30', minutes: 30, link: 'https://meet/x', notes: '', remindersSent: { day: null, hour: null }, ...over });

test('dueReminders picks day within 25 hours and hour within 2, never both, never past', () => {
  const dayBefore = new Date('2026-09-07T20:00:00Z');
  assert.deepEqual(dueReminders([m()], dayBefore).map((d) => d.kind), ['day']);
  assert.deepEqual(dueReminders([m({ remindersSent: { day: '2026-09-07T19:00:00.000Z', hour: null } })], dayBefore), []);
  const ninetyMinutesBefore = new Date('2026-09-08T19:00:00Z');
  assert.deepEqual(dueReminders([m()], ninetyMinutesBefore).map((d) => d.kind), ['hour']);
  assert.deepEqual(dueReminders([m({ remindersSent: { day: 'x', hour: 'y' } })], ninetyMinutesBefore), []);
  assert.deepEqual(dueReminders([m()], new Date('2026-09-06T00:00:00Z')), []);
  assert.deepEqual(dueReminders([m()], new Date('2026-09-08T21:00:00Z')), []);
});

test('runMeetingReminders flags then sends to client and admin, and never sends twice', async () => {
  process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@x';
  try {
    const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
    await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' });
    const doc = m();
    await s.meetings.put('lova', doc.id, doc);
    const sent = [];
    const fetchFn = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); };
    // Exactly 24 hours before 20:30Z on the 8th, so formatHours reads "about 24 hours".
    const now = new Date('2026-09-07T20:30:00Z');
    const r = await runMeetingReminders({ s, now, fetchFn });
    assert.deepEqual(r, { considered: 1, sent: 1 });
    assert.equal(sent.length, 2);
    assert.match(sent[0].subject, /^Reminder: Kickoff in about 24 hours$/);
    assert.equal((await s.meetings.get('lova', doc.id)).remindersSent.day, now.toISOString());
    const again = await runMeetingReminders({ s, now: new Date('2026-09-07T21:00:00Z'), fetchFn });
    assert.equal(again.sent, 0);
    const near = await runMeetingReminders({ s, now: new Date('2026-09-08T19:00:00Z'), fetchFn });
    assert.equal(near.sent, 1);
    assert.equal(sent.length, 4);
    const after = await s.meetings.get('lova', doc.id);
    assert.ok(after.remindersSent.hour);
  } finally {
    delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; delete process.env.KEEPSITE_NOTIFY_TO;
  }
});

test('a meeting whose client is gone is skipped, and a send failure does not throw', async () => {
  process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x';
  try {
    const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
    const orphan = m({ slug: 'ghost' });
    await s.meetings.put('ghost', orphan.id, orphan);
    await s.clients.put('lova', { slug: 'lova', name: 'S', business: 'Lova', email: 's@example.com' });
    const doc = m();
    await s.meetings.put('lova', doc.id, doc);
    const boom = async () => { throw new Error('offline'); };
    const r = await runMeetingReminders({ s, now: new Date('2026-09-07T20:00:00Z'), fetchFn: boom });
    assert.deepEqual(r, { considered: 2, sent: 1 });
    assert.equal((await s.emails.list('lova'))[0].status, 'failed');
  } finally {
    delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM;
  }
});
