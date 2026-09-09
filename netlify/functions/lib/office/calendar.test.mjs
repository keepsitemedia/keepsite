import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsForDay, monthGrid, dueBucket } from './calendar.mjs';

const t = (due, time = null, extra = {}) => ({ id: due + (time ?? ''), due, time, done: false, ...extra });

test('itemsForDay picks that day, untimed first, then by time, meetings merged', () => {
  const tasks = [t('2026-09-04', '15:00'), t('2026-09-05'), t('2026-09-04'), t('2026-09-04', '09:30')];
  const meetings = [{ id: 'm', ymd: '2026-09-04', time: '11:00', title: 'Kickoff' }];
  const items = itemsForDay(tasks, meetings, '2026-09-04');
  assert.deepEqual(items.map((i) => [i.kind, i.time]), [
    ['task', null], ['task', '09:30'], ['meeting', '11:00'], ['task', '15:00'],
  ]);
});

test('monthGrid lays out September 2026 from Sunday with marks and today', () => {
  const g = monthGrid('2026-09-04', new Set(['2026-09-04', '2026-09-30']), '2026-09-04');
  assert.equal(g.label, 'September 2026');
  assert.equal(g.prev, '2026-08-04');
  assert.equal(g.next, '2026-10-04');
  assert.equal(g.weeks.length, 5);
  assert.equal(g.weeks[0][0].ymd, '2026-08-30');
  assert.equal(g.weeks[0][0].inMonth, false);
  assert.equal(g.weeks[0][2].ymd, '2026-09-01');
  const fourth = g.weeks[0][5];
  assert.equal(fourth.day, 4);
  assert.ok(fourth.marked && fourth.today);
  assert.equal(g.weeks[4][3].ymd, '2026-09-30');
  assert.ok(g.weeks[4][3].marked);
});

test('monthGrid clamps prev and next to real dates', () => {
  assert.equal(monthGrid('2026-03-31', new Set(), '2026-03-31').prev, '2026-02-28');
  assert.equal(monthGrid('2026-01-31', new Set(), '2026-01-31').next, '2026-02-28');
  assert.equal(monthGrid('2026-12-15', new Set(), '2026-12-15').next, '2027-01-15');
});

test('dueBucket', () => {
  const today = '2026-09-04';
  assert.equal(dueBucket(t('2026-09-01', null, { done: true }), today), 'done');
  assert.equal(dueBucket(t('2026-09-03'), today), 'overdue');
  assert.equal(dueBucket(t('2026-09-04'), today), 'today');
  assert.equal(dueBucket(t('2026-09-07'), today), 'soon');
  assert.equal(dueBucket(t('2026-09-08'), today), 'later');
});
