// A pipeline is data, not code: stages, the tasks each one creates, and the
// email each one opens. New products are new entries in the settings page.
import seed from '../../../../src/data/office/pipelines.json' with { type: 'json' };
import { newId } from './ids.mjs';
import { addDays } from './dates.mjs';
import { TIERS } from './clients.mjs';
import { isRepeat } from './recurrence.mjs';

// The client page's tab ids. A task that names one gets a link to it on
// Today and the client's Tasks tab, the way a payment task links to Payments.
export const TABS = ['overview', 'tasks', 'questionnaires', 'meetings', 'payments', 'emails', 'documents', 'agreements', 'research'];

const KEY = /^[a-z][a-z0-9-]{0,31}$/;

export function validatePipelines(value) {
  const errors = [];
  if (!Array.isArray(value)) return ['pipelines must be a list'];
  // Every new client starts at pipelines[0].stages[0], from the inquiry
  // handler as well as the create form; with nothing there a lead would be
  // lost at submission time instead of refused here.
  if (value.length === 0) return ['at least one pipeline is required'];
  const ids = new Set();
  value.forEach((p, i) => {
    const at = `pipeline ${i + 1}`;
    if (!p || typeof p !== 'object') return errors.push(`${at}: not an object`);
    if (!KEY.test(String(p.id))) errors.push(`${at}: id must be lowercase letters, digits and hyphens`);
    if (ids.has(p.id)) errors.push(`${at}: duplicate pipeline id "${p.id}"`);
    ids.add(p.id);
    if (!p.name) errors.push(`${at}: name is required`);
    if (p.questionnaires !== undefined && !Array.isArray(p.questionnaires)) errors.push(`${at}: questionnaires must be a list`);
    if (p.payments !== undefined && (typeof p.payments !== 'object' || p.payments === null || typeof p.payments.plan !== 'string' || !p.payments.plan)) {
      errors.push(`${at}: payments.plan is required and must be a non-empty string`);
    }
    if (!Array.isArray(p.stages)) return errors.push(`${at}: stages must be a list`);
    if (p.stages.length === 0) errors.push(`${at}: at least one stage is required`);
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
        if (t.payment !== undefined && t.payment !== 'deposit' && t.payment !== 'balance') {
          errors.push(`${tat}: payment must be "deposit" or "balance"`);
        }
        if (t.agreement !== undefined && !['sent', 'completed'].includes(t.agreement)) errors.push(`${tat}: agreement must be sent or completed`);
        if (t.tiers !== undefined) {
          if (!Array.isArray(t.tiers) || t.tiers.length === 0) errors.push(`${tat}: tiers must be a non-empty list`);
          else for (const name of t.tiers) if (!TIERS.includes(name)) errors.push(`${tat}: tiers names unknown tier "${name}"`);
        }
        if (t.repeat !== undefined && !isRepeat(t.repeat)) errors.push(`${tat}: repeat must be weekly, biweekly, monthly, quarterly or yearly`);
        if (t.tab !== undefined && !TABS.includes(t.tab)) errors.push(`${tat}: tab must be one of ${TABS.join(', ')}`);
        // hooks.mjs, payments.mjs and agreements.mjs close these three task
        // kinds without rolling a repeat forward, so combining them would
        // silently drop the repeat after the first completion.
        if (t.repeat !== undefined && (t.questionnaire || t.payment || t.agreement)) errors.push(`${tat}: a repeating task cannot also wait on a questionnaire, payment or agreement`);
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
  // Re-entering the just-recorded stage (the admin re-submits the same
  // value) is not a move; recording it would grow history with entries that
  // carry no new information. Compared against the last history entry, not
  // client.stage: client creation pre-sets stage to the first stage id while
  // resetting stages to [], relying on this call to advance() to record it.
  const reentering = client.stages.at(-1)?.stage === stageId;
  const at = now.toISOString();
  const dates = { ...client.dates };
  if (stageId === 'live' && !dates.launched) dates.launched = today;
  const updated = {
    ...client,
    stage: stageId,
    stages: reentering ? client.stages : [...client.stages, { stage: stageId, at }],
    dates,
    updatedAt: at,
  };
  // A task that names tiers is for those packages only; an undecided tier
  // gets the tasks every package shares and nothing more.
  const forTier = (t) => !t.tiers || t.tiers.includes(client.tier);
  const tasks = first
    ? stage.tasks.filter(forTier).map((t) => ({
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
        agreement: t.agreement ?? null,
        repeat: t.repeat ?? null,
        tab: t.tab ?? null,
        notes: '',
        createdAt: at,
      }))
    : [];
  return { client: updated, tasks };
}
