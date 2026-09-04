import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../../../src/data/office/pipelines.json' with { type: 'json' };
import { validatePipelines, loadPipelines, findPipeline, findStage, advance } from './pipeline.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const website = () => findPipeline(seed, 'website');
const fresh = () => ({
  slug: 'lova', pipeline: 'website', stage: 'inquiry',
  stages: [{ stage: 'inquiry', at: '2026-09-01T00:00:00.000Z' }], dates: { inquiry: '2026-09-01' },
});
const NOW = new Date('2026-09-04T16:00:00Z');

test('the seed validates and every id is unique', () => {
  assert.deepEqual(validatePipelines(seed), []);
});

test('validatePipelines names what is wrong', () => {
  assert.match(validatePipelines('x').join(), /must be a list/);
  assert.match(validatePipelines([{ id: 'A', name: 'x', stages: [] }]).join(), /id/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: '', due: 1 }] }] }]).join(), /title/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: 't', due: -1 }] }] }]).join(), /due/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [] }, { id: 's', name: 'T', tasks: [] }] }]).join(), /duplicate stage/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [] }, { id: 'a', name: 'y', stages: [] }]).join(), /duplicate pipeline/);
});

test('loadPipelines falls back to the seed and prefers the stored copy', async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  assert.equal((await loadPipelines(s))[0].id, 'website');
  await s.settings.put('pipelines', [{ id: 'other', name: 'Other', stages: [] }]);
  assert.equal((await loadPipelines(s))[0].id, 'other');
});

test('findStage returns undefined for unknown ids', () => {
  assert.equal(findStage(website(), 'nope'), undefined);
  assert.equal(findStage(website(), 'demo').name, 'Demo');
});

test('advancing creates the stage tasks with due dates from today', () => {
  const { client, tasks } = advance({ client: fresh(), pipeline: website(), stageId: 'agreement', today: '2026-09-04', now: NOW });
  assert.equal(client.stage, 'agreement');
  assert.equal(client.stages.at(-1).stage, 'agreement');
  assert.deepEqual(tasks.map((t) => [t.title, t.due, t.payment]), [
    ['Send agreement', '2026-09-04', null],
    ['Deposit received', '2026-09-11', 'deposit'],
  ]);
  for (const t of tasks) {
    assert.equal(t.slug, 'lova');
    assert.equal(t.source, 'pipeline');
    assert.equal(t.stage, 'agreement');
    assert.equal(t.done, false);
    assert.match(t.id, /^20260904T160000/);
  }
});

test('re-entering a stage creates no tasks; moving back creates none either', () => {
  const first = advance({ client: fresh(), pipeline: website(), stageId: 'demo', today: '2026-09-04', now: NOW });
  const back = advance({ client: first.client, pipeline: website(), stageId: 'inquiry', today: '2026-09-05', now: NOW });
  assert.equal(back.client.stage, 'inquiry');
  assert.deepEqual(back.tasks, []);
  const again = advance({ client: back.client, pipeline: website(), stageId: 'demo', today: '2026-09-06', now: NOW });
  assert.deepEqual(again.tasks, []);
  assert.equal(again.client.stages.length, 4);
});

test('questionnaire tasks carry the form name and live records the launch date', () => {
  const { tasks } = advance({ client: fresh(), pipeline: website(), stageId: 'post-demo', today: '2026-09-04', now: NOW });
  assert.deepEqual(tasks.map((t) => t.questionnaire), ['brand', 'build']);
  const live = advance({ client: fresh(), pipeline: website(), stageId: 'live', today: '2026-10-01', now: NOW });
  assert.equal(live.client.dates.launched, '2026-10-01');
});

test('advance throws on a stage the pipeline does not have', () => {
  assert.throws(() => advance({ client: fresh(), pipeline: website(), stageId: 'nope', today: '2026-09-04', now: NOW }), /unknown stage/);
});
