import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId, ID } from './ids.mjs';

test('an id starts with the creation second and matches ID', () => {
  const id = newId(new Date('2026-09-04T15:01:02.007Z'));
  assert.ok(id.startsWith('20260904T150102'));
  assert.match(id, ID);
});

test('two ids minted in the same second differ', () => {
  const now = new Date('2026-09-04T15:01:02.007Z');
  assert.notEqual(newId(now), newId(now));
});

test('ids sort in creation order', () => {
  const a = newId(new Date('2026-09-04T15:01:02Z'));
  const b = newId(new Date('2026-09-04T15:01:03Z'));
  assert.ok(a < b);
});
