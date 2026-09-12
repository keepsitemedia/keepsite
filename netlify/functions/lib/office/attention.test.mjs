import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitsOnClient, splitOpen, nudge, glance, daysBetween } from './attention.mjs';

const task = (over) => ({ id: 'a', slug: 'acme', title: 'T', due: '2026-09-11', time: null, done: false, source: 'pipeline', stage: 'x', questionnaire: null, payment: null, agreement: null, ...over });

test('a task waits on the client when it is gated on a questionnaire, a payment or the client signature', () => {
  assert.equal(waitsOnClient(task({ questionnaire: 'intro' })), true);
  assert.equal(waitsOnClient(task({ payment: 'deposit' })), true);
  assert.equal(waitsOnClient(task({ agreement: 'completed' })), true);
  assert.equal(waitsOnClient(task({ agreement: 'sent' })), false);
  assert.equal(waitsOnClient(task({})), false);
  assert.equal(waitsOnClient(task({ source: 'manual' })), false);
});

test('splitOpen separates the admin list from the waiting list and hides the far future', () => {
  const tasks = [
    task({ id: '1', due: '2026-09-20' }),
    task({ id: '2', due: '2026-09-09' }),
    task({ id: '3', due: '2026-09-12', questionnaire: 'brand' }),
    task({ id: '4', due: '2026-09-11', done: true }),
    task({ id: '5', due: '2026-09-14' }),
  ];
  const out = splitOpen(tasks, '2026-09-11');
  assert.deepEqual(out.onYou.map((t) => t.id), ['2', '5']);
  assert.equal(out.later, 1);
  assert.deepEqual(out.waiting.map((t) => t.id), ['3']);
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-09-08', '2026-09-11'), 3);
  assert.equal(daysBetween('2026-09-11', '2026-09-11'), 0);
  assert.equal(daysBetween('2026-09-12', '2026-09-11'), -1);
});

test('nudge points at the screen that chases each kind of waiting task', () => {
  assert.deepEqual(nudge(task({ questionnaire: 'brand' })), { href: '/office/send/acme/questionnaire-reminder/?form=brand', label: 'Remind' });
  assert.deepEqual(nudge(task({ agreement: 'completed' })), { href: '/office/send/acme/agreement/', label: 'Resend link' });
  assert.deepEqual(nudge(task({ payment: 'deposit' })), { href: '/office/clients/acme/?tab=payments', label: 'Payments' });
  assert.equal(nudge(task({})), null);
});

test('glance summarises the agreement, the money, the questionnaires and the next task', () => {
  const facts = glance({
    today: '2026-09-11',
    tasks: [task({ id: 'n', title: 'Build demo', due: '2026-09-09' }), task({ id: 'q', questionnaire: 'brand', due: '2026-09-15' })],
    agreements: [{ status: 'sent', sentAt: '2026-09-08T12:00:00Z', completedAt: null, signers: { client: { expiresAt: '2026-09-22T12:00:00Z' } } }],
    payments: [{ kind: 'deposit', status: 'pending', createdAt: '2026-09-08T12:00:00Z', paidAt: null }],
    forms: ['intro', 'brand', 'build'],
    submitted: ['intro'],
    plan: true,
  });
  const by = Object.fromEntries(facts.map((f) => [f.label, f]));
  assert.equal(by.Agreement.state, 'waiting');
  assert.match(by.Agreement.text, /Out for signature.*Sep 22/);
  assert.equal(by.Deposit.state, 'waiting');
  assert.match(by.Deposit.text, /Link sent.*Sep 8/);
  assert.equal(by.Questionnaires.state, 'waiting');
  assert.equal(by.Questionnaires.text, '1 of 3 back');
  assert.equal(by['Next on you'].state, 'late');
  assert.match(by['Next on you'].text, /Build demo.*2 days late/);
});

test('glance reads done and late states and omits money when the pipeline has no plan', () => {
  const facts = glance({
    today: '2026-09-11',
    tasks: [],
    agreements: [
      { status: 'voided', sentAt: null, completedAt: null, signers: { client: { expiresAt: null } } },
      { status: 'completed', sentAt: '2026-08-20T12:00:00Z', completedAt: '2026-08-23T12:00:00Z', signers: { client: { expiresAt: null } } },
    ],
    payments: [{ kind: 'deposit', status: 'failed', createdAt: '2026-09-01T12:00:00Z', paidAt: null }],
    forms: [],
    submitted: [],
    plan: false,
  });
  const by = Object.fromEntries(facts.map((f) => [f.label, f]));
  assert.equal(by.Agreement.state, 'done');
  assert.match(by.Agreement.text, /Signed.*Aug 23/);
  assert.equal(by.Deposit, undefined);
  assert.equal(by.Questionnaires, undefined);
  assert.equal(by['Next on you'].state, 'none');
  const expired = glance({ today: '2026-09-11', tasks: [], agreements: [{ status: 'sent', sentAt: '2026-08-01T12:00:00Z', completedAt: null, signers: { client: { expiresAt: '2026-08-15T12:00:00Z' } } }], payments: [{ kind: 'deposit', status: 'failed', createdAt: '2026-09-01T12:00:00Z', paidAt: null }], forms: [], submitted: [], plan: true });
  const e = Object.fromEntries(expired.map((f) => [f.label, f]));
  assert.equal(e.Agreement.state, 'late');
  assert.match(e.Agreement.text, /expired/);
  assert.equal(e.Deposit.state, 'late');
});
