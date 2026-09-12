// A repeating task is a chain of ordinary tasks: Done on one creates the
// next, dated from the one just finished so a task done late does not drift.
import { addDays, addMonths } from './dates.mjs';
import { newId } from './ids.mjs';

export const REPEATS = ['weekly', 'monthly'];
export const isRepeat = (value) => REPEATS.includes(value);

export function nextDue(ymd, repeat) {
  if (repeat === 'weekly') return addDays(ymd, 7);
  if (repeat === 'monthly') return addMonths(ymd, 1);
  throw new Error(`unknown repeat: ${repeat}`);
}

export function nextTask(task, now = new Date()) {
  return {
    id: newId(now),
    slug: task.slug,
    title: task.title,
    due: nextDue(task.due, task.repeat),
    time: task.time ?? null,
    done: false,
    doneAt: null,
    source: 'manual',
    stage: null,
    questionnaire: null,
    payment: null,
    agreement: null,
    notes: task.notes ?? '',
    project: task.project ?? null,
    repeat: task.repeat,
    nextId: null,
    createdAt: now.toISOString(),
  };
}
