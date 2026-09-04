import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayIn, addDays, isYmd, formatYmd, formatTime } from './dates.mjs';

test('todayIn reports the Mountain date, not the UTC one', () => {
  // 05:30 UTC on the 5th is still 23:30 on the 4th in Denver.
  assert.equal(todayIn('America/Denver', new Date('2026-09-05T05:30:00Z')), '2026-09-04');
});

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-09-28', 5), '2026-10-03');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('isYmd accepts real dates only', () => {
  assert.ok(isYmd('2026-09-04'));
  assert.ok(!isYmd('2026-9-4'));
  assert.ok(!isYmd('2026-13-01'));
  assert.ok(!isYmd(''));
  assert.ok(!isYmd(undefined));
});

test('formatYmd and formatTime read like a calendar', () => {
  assert.equal(formatYmd('2026-09-04'), 'Fri, Sep 4');
  assert.equal(formatTime('14:30'), '2:30 pm');
  assert.equal(formatTime('09:05'), '9:05 am');
});
