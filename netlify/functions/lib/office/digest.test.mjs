import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, runDigest } from './digest.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';

const today = '2026-09-08';
const now = new Date('2026-09-08T13:00:00Z');
const clients = [{ slug: 'lova', business: 'Lova' }, { slug: 'acme', business: 'Acme' }];
const t = (slug, due, over = {}) => ({ id: newId(), slug, title: 'Task', due, time: null, done: false, questionnaire: null, ...over });

test('an empty office produces an empty digest', () => {
  const d = buildDigest({ clients, tasks: [], meetings: [], submitted: new Set(), today, now });
  assert.equal(d.empty, true);
});

test('every section renders with its items and a nudge link', () => {
  const tasks = [
    t('lova', '2026-09-01', { title: 'Late' }),
    t('acme', today, { title: 'Today', time: '09:00' }),
    t('lova', '2026-09-10', { title: 'Soon' }),
    t('lova', '2026-09-20', { title: 'Later' }),
    t('lova', '2026-09-01', { title: 'Brand questionnaire back', questionnaire: 'brand' }),
    t('acme', '2026-09-01', { title: 'Intro questionnaire back', questionnaire: 'intro' }),
    t('lova', '2026-09-02', { title: 'Done', done: true }),
  ];
  const meetings = [
    { slug: 'acme', title: 'Kickoff', ymd: today, time: '14:00', minutes: 30 },
    { slug: 'lova', title: 'Tomorrow', ymd: '2026-09-09', time: '10:00', minutes: 30 },
    { slug: 'lova', title: 'Far', ymd: '2026-09-15', time: '10:00', minutes: 30 },
  ];
  const submitted = new Set(['acme/intro']);
  const payments = [{ slug: 'acme', kind: 'monthly', amount: 15000, status: 'failed', failureReason: 'card declined' }];
  const agreements = [{ slug: 'lova', status: 'sent', sentAt: '2026-09-01T00:00:00.000Z' }, { slug: 'acme', status: 'sent', sentAt: '2026-09-06T00:00:00.000Z' }];
  const d = buildDigest({ clients, tasks, meetings, submitted, agreements, payments, today, now });
  assert.equal(d.empty, false);
  assert.equal(d.subject, 'Office digest for Tue, Sep 8');
  // Late, plus the two overdue questionnaire tasks.
  assert.match(d.text, /Overdue \(3\)[\s\S]*Lova: Late \(Tue, Sep 1\)/);
  assert.match(d.text, /Due today \(1\)[\s\S]*Acme: Today at 9:00 am/);
  assert.match(d.text, /Next three days \(1\)[\s\S]*Lova: Soon \(Thu, Sep 10\)/);
  assert.ok(!d.text.includes('Later'));
  assert.ok(!d.text.includes('Done'));
  assert.match(d.text, /Meetings today and tomorrow \(2\)[\s\S]*Acme: Kickoff, Tue, Sep 8 at 2:00 pm[\s\S]*Lova: Tomorrow, Wed, Sep 9 at 10:00 am/);
  assert.ok(!d.text.includes('Far'));
  assert.match(d.text, /Questionnaires waiting \(1\)[\s\S]*Lova: brand, due Tue, Sep 1[\s\S]*\/office\/send\/lova\/questionnaire-reminder\/\?form=brand/);
  assert.ok(!d.text.includes('/office/send/acme/questionnaire-reminder'));
  assert.match(d.text, /Failed payments \(1\)[\s\S]*Acme: monthly \$150\.00, card declined/);
  assert.match(d.text, /Agreements unsigned \(1\)[\s\S]*Lova: sent Tue, Sep 1/);
  assert.match(d.text, /Generated .*Mountain$/);
});

test('an overdue questionnaire counts in Overdue once and in Questionnaires waiting once', () => {
  const tasks = [t('lova', '2026-09-01', { title: 'Brand questionnaire back', questionnaire: 'brand' })];
  const d = buildDigest({ clients, tasks, meetings: [], submitted: new Set(), today, now });
  assert.match(d.text, /Overdue \(1\)/);
  assert.match(d.text, /Questionnaires waiting \(1\)/);
  const recent = buildDigest({ clients, tasks: [t('lova', '2026-09-06', { questionnaire: 'brand' })], meetings: [], submitted: new Set(), today, now });
  assert.ok(!recent.text.includes('Questionnaires waiting'));
});

test('runDigest sends to the admin under the office slug, and sends nothing when empty', async () => {
  process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@x';
  try {
    const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
    let called = 0;
    const fetchFn = async () => { called += 1; return new Response('{"id":"re"}'); };
    assert.deepEqual(await runDigest({ s, now, fetchFn }), { sent: false });
    assert.equal(called, 0);
    await s.clients.put('lova', { slug: 'lova', business: 'Lova', email: 'l@x' });
    const task = t('lova', '2026-09-01');
    await s.tasks.put('lova', task.id, task);
    assert.deepEqual(await runDigest({ s, now, fetchFn }), { sent: true });
    assert.equal(called, 1);
    const [log] = await s.emails.list('office');
    assert.equal(log.kind, 'digest');
    assert.deepEqual(log.to, ['me@x']);
  } finally {
    delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; delete process.env.KEEPSITE_NOTIFY_TO;
  }
});
