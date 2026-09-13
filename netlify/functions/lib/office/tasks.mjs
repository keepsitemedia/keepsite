// The rules a task obeys no matter which door it came through: the office
// form and the calendar feed both build and finish tasks here, so neither
// can drift from the other.
import { newId } from './ids.mjs';
import { isYmd, isHhmm } from './dates.mjs';
import { REPEATS, isRepeat, nextTask } from './recurrence.mjs';
import { SLUG } from './store.mjs';

const text = (v) => String(v ?? '').trim();

export function newTask(fields, now = new Date()) {
  if (!SLUG.test(String(fields.slug))) return { error: 'bad slug' };
  const title = text(fields.title);
  const due = text(fields.due);
  const time = text(fields.time);
  const repeat = text(fields.repeat);
  if (!title) return { error: 'title is required' };
  if (!isYmd(due)) return { error: 'due must be a date' };
  if (time && !isHhmm(time)) return { error: 'time must be HH:MM' };
  if (repeat && !isRepeat(repeat)) return { error: `repeat must be one of ${REPEATS.join(', ')}` };
  return {
    task: {
      id: newId(now), slug: fields.slug, title, due, time: time || null, done: false, doneAt: null,
      source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null,
      notes: text(fields.notes), project: text(fields.project) || null, repeat: repeat || null, nextId: null,
      createdAt: now.toISOString(),
    },
  };
}

// A replayed Done finds the task already done, and a Reopen-then-Done finds
// it still carrying the nextId from the first Done (reopen does not clear
// it); either way a successor already exists, so a task spawns at most once.
// A pipeline task also rolls forward only while its client is still in the
// stage that created it, so build-phase check-ins stop at launch and Live
// tasks run for as long as the client is live.
export function finishTask(existing, now = new Date(), { client = null } = {}) {
  const at = now.toISOString();
  const staged = existing.stage ? client?.stage === existing.stage : true;
  const spawn = !existing.done && isRepeat(existing.repeat) && !existing.nextId && staged;
  if (!spawn) return { finished: { ...existing, done: true, doneAt: at }, next: null };
  const next = nextTask(existing, now);
  return { finished: { ...existing, done: true, doneAt: at, nextId: next.id }, next };
}
