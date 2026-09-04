// A pipeline is data, not code: stages, the tasks each one creates, and the
// email each one opens. New products are new entries in the settings page.
import seed from '../../../../src/data/office/pipelines.json' with { type: 'json' };
import { newId } from './ids.mjs';
import { addDays } from './dates.mjs';

const KEY = /^[a-z][a-z0-9-]{0,31}$/;

export function validatePipelines(value) {
  const errors = [];
  if (!Array.isArray(value)) return ['pipelines must be a list'];
  const ids = new Set();
  value.forEach((p, i) => {
    const at = `pipeline ${i + 1}`;
    if (!p || typeof p !== 'object') return errors.push(`${at}: not an object`);
    if (!KEY.test(String(p.id))) errors.push(`${at}: id must be lowercase letters, digits and hyphens`);
    if (ids.has(p.id)) errors.push(`${at}: duplicate pipeline id "${p.id}"`);
    ids.add(p.id);
    if (!p.name) errors.push(`${at}: name is required`);
    if (p.questionnaires !== undefined && !Array.isArray(p.questionnaires)) errors.push(`${at}: questionnaires must be a list`);
    if (!Array.isArray(p.stages)) return errors.push(`${at}: stages must be a list`);
    const stageIds = new Set();
    p.stages.forEach((s, j) => {
      const sat = `${at}, stage ${j + 1}`;
      if (!s || typeof s !== 'object') return errors.push(`${sat}: not an object`);
      if (!KEY.test(String(s.id))) errors.push(`${sat}: id must be lowercase letters, digits and hyphens`);
      if (stageIds.has(s.id)) errors.push(`${sat}: duplicate stage id "${s.id}"`);
      stageIds.add(s.id);
      if (!s.name) errors.push(`${sat}: name is required`);
      if (!Array.isArray(s.tasks)) return errors.push(`${sat}: tasks must be a list`);
      s.tasks.forEach((t, k) => {
        const tat = `${sat}, task ${k + 1}`;
        if (!t || typeof t !== 'object') return errors.push(`${tat}: not an object`);
        if (!t.title) errors.push(`${tat}: title is required`);
        if (!Number.isInteger(t.due) || t.due < 0) errors.push(`${tat}: due must be a whole number of days, 0 or more`);
      });
    });
  });
  return errors;
}

export async function loadPipelines(store) {
  return (await store.settings.get('pipelines')) ?? seed;
}

export const findPipeline = (pipelines, id) => pipelines.find((p) => p.id === id);
export const findStage = (pipeline, stageId) => pipeline?.stages.find((s) => s.id === stageId);

export function advance({ client, pipeline, stageId, today, now = new Date() }) {
  const stage = findStage(pipeline, stageId);
  if (!stage) throw new Error(`unknown stage: ${stageId}`);
  // Tasks are created the first time a client reaches a stage and never
  // again, so moving back and forward does not pile up duplicates.
  const first = !client.stages.some((s) => s.stage === stageId);
  const at = now.toISOString();
  const dates = { ...client.dates };
  if (stageId === 'live' && !dates.launched) dates.launched = today;
  const updated = {
    ...client,
    stage: stageId,
    stages: [...client.stages, { stage: stageId, at }],
    dates,
    updatedAt: at,
  };
  const tasks = first
    ? stage.tasks.map((t) => ({
        id: newId(now),
        slug: client.slug,
        title: t.title,
        due: addDays(today, t.due),
        time: null,
        done: false,
        doneAt: null,
        source: 'pipeline',
        stage: stageId,
        questionnaire: t.questionnaire ?? null,
        payment: t.payment ?? null,
        notes: '',
        createdAt: at,
      }))
    : [];
  return { client: updated, tasks };
}
