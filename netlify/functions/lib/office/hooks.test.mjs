import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markQuestionnaireDone } from './hooks.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const NOW = new Date('2026-09-04T16:00:00Z');

test('marks the open task for that form and no other', async () => {
  const s = make();
  await s.clients.put('lova', { slug: 'lova' });
  const a = newId(new Date('2026-09-01T00:00:00Z'));
  const b = newId(new Date('2026-09-01T00:00:01Z'));
  await s.tasks.put('lova', a, { id: a, questionnaire: 'brand', done: false, doneAt: null });
  await s.tasks.put('lova', b, { id: b, questionnaire: 'build', done: false, doneAt: null });
  assert.equal(await markQuestionnaireDone('lova', 'brand', s, NOW), true);
  assert.equal((await s.tasks.get('lova', a)).doneAt, NOW.toISOString());
  assert.equal((await s.tasks.get('lova', b)).done, false);
});

test('is a no-op without a client record or an open task', async () => {
  const s = make();
  assert.equal(await markQuestionnaireDone('ghost', 'intro', s, NOW), false);
  await s.clients.put('lova', { slug: 'lova' });
  assert.equal(await markQuestionnaireDone('lova', 'intro', s, NOW), false);
});
