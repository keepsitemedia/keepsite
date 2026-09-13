import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTask, finishTask } from './tasks.mjs';
import { ID } from './ids.mjs';

const NOW = new Date('2026-09-13T15:00:00Z');
const good = { slug: 'office', title: ' Post on LinkedIn ', due: '2026-09-19', time: '09:00', project: ' Marketing ', repeat: 'weekly', notes: ' three posts ' };

test('newTask builds the full document and trims text', () => {
  const { task, error } = newTask(good, NOW);
  assert.equal(error, undefined);
  assert.match(task.id, ID);
  assert.equal(task.title, 'Post on LinkedIn');
  assert.equal(task.project, 'Marketing');
  assert.equal(task.notes, 'three posts');
  assert.equal(task.repeat, 'weekly');
  assert.equal(task.source, 'manual');
  assert.equal(task.done, false);
  assert.equal(task.nextId, null);
  assert.equal(task.stage, null);
  assert.equal(task.createdAt, NOW.toISOString());
});

test('newTask nulls empty optionals and rejects bad fields', () => {
  const { task } = newTask({ slug: 'lova', title: 'x', due: '2026-09-19' }, NOW);
  assert.equal(task.time, null);
  assert.equal(task.project, null);
  assert.equal(task.repeat, null);
  assert.equal(task.notes, '');
  assert.match(newTask({ ...good, title: '  ' }, NOW).error, /title/);
  assert.match(newTask({ ...good, due: '2026-9-1' }, NOW).error, /due/);
  assert.match(newTask({ ...good, time: '25:00' }, NOW).error, /time/);
  assert.match(newTask({ ...good, repeat: 'daily' }, NOW).error, /repeat/);
});

test('finishTask spawns once for an open repeating task', () => {
  const { task } = newTask(good, NOW);
  const first = finishTask(task, NOW);
  assert.equal(first.finished.done, true);
  assert.equal(first.finished.doneAt, NOW.toISOString());
  assert.equal(first.next.due, '2026-09-26');
  assert.equal(first.finished.nextId, first.next.id);
  const again = finishTask(first.finished, NOW);
  assert.equal(again.next, null);
  const reopened = finishTask({ ...first.finished, done: false, doneAt: null }, NOW);
  assert.equal(reopened.next, null);
  const plain = finishTask(newTask({ slug: 'lova', title: 'x', due: '2026-09-19' }, NOW).task, NOW);
  assert.equal(plain.next, null);
  assert.equal(plain.finished.nextId, null);
});

// A pipeline task rolls forward only while the client is still in the
// stage that created it; own tasks and manual tasks have no stage to match.
test('finishTask rolls a pipeline task forward only while the stage matches', () => {
  const { task } = newTask(good, NOW);
  const staged = { ...task, slug: 'lova', source: 'pipeline', stage: 'live', repeat: 'monthly', project: null };
  assert.notEqual(finishTask(staged, NOW, { client: { stage: 'live' } }).next, null);
  assert.equal(finishTask(staged, NOW, { client: { stage: 'copy' } }).next, null);
  assert.equal(finishTask(staged, NOW, { client: null }).next, null);
  assert.notEqual(finishTask(task, NOW, { client: null }).next, null);
  assert.notEqual(finishTask({ ...task, slug: 'lova' }, NOW, { client: { stage: 'copy' } }).next, null);
});
