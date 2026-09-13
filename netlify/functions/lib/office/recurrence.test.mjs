import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPEATS, isRepeat, nextDue, nextTask, repeatLabel } from './recurrence.mjs';

const NOW = new Date('2026-09-20T16:00:00Z');
const task = {
  id: '20260912T020750tuf2fw', slug: 'lova', title: 'Strategy meeting', due: '2026-09-15', time: '10:00',
  done: true, doneAt: '2026-09-20T16:00:00.000Z', source: 'pipeline', stage: 'live',
  questionnaire: null, payment: null, agreement: null, notes: 'bring numbers', repeat: 'monthly', createdAt: '2026-08-15T00:00:00.000Z',
};

test('the repeat vocabulary', () => {
  assert.deepEqual(REPEATS, ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);
  assert.equal(isRepeat('biweekly'), true);
  assert.equal(isRepeat('daily'), false);
  assert.equal(isRepeat(null), false);
});

test('nextDue steps from the due date, not from today', () => {
  assert.equal(nextDue('2026-09-15', 'weekly'), '2026-09-22');
  assert.equal(nextDue('2026-09-15', 'biweekly'), '2026-09-29');
  assert.equal(nextDue('2026-09-15', 'monthly'), '2026-10-15');
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextDue('2026-09-15', 'quarterly'), '2026-12-15');
  assert.equal(nextDue('2026-09-15', 'yearly'), '2027-09-15');
  assert.throws(() => nextDue('2026-09-15', 'daily'), /repeat/);
});

test('nextTask copies the task forward with a fresh id and an open state', () => {
  const n = nextTask(task, NOW);
  assert.notEqual(n.id, task.id);
  assert.equal(n.due, '2026-10-15');
  assert.equal(n.done, false);
  assert.equal(n.doneAt, null);
  assert.equal(n.createdAt, NOW.toISOString());
  assert.equal(n.time, '10:00');
  assert.equal(n.notes, 'bring numbers');
  assert.equal(n.stage, 'live');
  assert.equal(n.repeat, 'monthly');
  assert.equal(n.source, 'pipeline');
});

test('repeatLabel reads like a sentence', () => {
  assert.equal(repeatLabel('biweekly'), 'every two weeks');
  assert.equal(repeatLabel('weekly'), 'weekly');
  assert.equal(repeatLabel('quarterly'), 'quarterly');
});
