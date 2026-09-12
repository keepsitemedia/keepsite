import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPEATS, isRepeat, nextDue, nextTask } from './recurrence.mjs';
import { ID } from './ids.mjs';

const NOW = new Date('2026-09-12T15:00:00Z');
const base = {
  id: '20260901T100000aaaaaa', slug: 'office', title: 'Post on LinkedIn', due: '2026-09-10', time: '09:00',
  done: true, doneAt: NOW.toISOString(), source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null,
  notes: 'three posts', project: 'Marketing', repeat: 'weekly', createdAt: '2026-09-01T10:00:00.000Z',
};

test('isRepeat accepts the two words and nothing else', () => {
  assert.deepEqual(REPEATS, ['weekly', 'monthly']);
  assert.equal(isRepeat('weekly'), true);
  assert.equal(isRepeat('monthly'), true);
  assert.equal(isRepeat(''), false);
  assert.equal(isRepeat(null), false);
  assert.equal(isRepeat('daily'), false);
});

test('nextDue counts from the due date, not from today', () => {
  assert.equal(nextDue('2026-09-10', 'weekly'), '2026-09-17');
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28');
  assert.throws(() => nextDue('2026-09-10', 'daily'), /repeat/);
});

test('nextTask copies what recurs and resets what does not', () => {
  const n = nextTask(base, NOW);
  assert.match(n.id, ID);
  assert.notEqual(n.id, base.id);
  assert.equal(n.due, '2026-09-17');
  assert.equal(n.done, false);
  assert.equal(n.doneAt, null);
  assert.equal(n.createdAt, NOW.toISOString());
  for (const k of ['slug', 'title', 'time', 'project', 'repeat', 'notes', 'source']) assert.equal(n[k], base[k], k);
  for (const k of ['stage', 'questionnaire', 'payment', 'agreement', 'nextId']) assert.equal(n[k], null, k);
});
