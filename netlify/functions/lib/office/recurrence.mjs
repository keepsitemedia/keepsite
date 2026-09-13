// A repeating task is not a schedule: marking one done creates the next one
// from its own due date, so a late completion does not drift the cadence.
import { addDays, addMonths } from './dates.mjs';
import { newId } from './ids.mjs';

export const REPEATS = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
export const isRepeat = (v) => REPEATS.includes(v);

const STEP = {
  weekly: (d) => addDays(d, 7),
  biweekly: (d) => addDays(d, 14),
  monthly: (d) => addMonths(d, 1),
  quarterly: (d) => addMonths(d, 3),
  yearly: (d) => addMonths(d, 12),
};

export function nextDue(ymd, repeat) {
  if (!isRepeat(repeat)) throw new Error(`unknown repeat: ${repeat}`);
  return STEP[repeat](ymd);
}

// The successor starts its own chain: nextId is what the finished task uses
// to remember it spawned once, so the copy must not inherit that memory.
export function nextTask(task, now = new Date()) {
  return { ...task, id: newId(now), due: nextDue(task.due, task.repeat), done: false, doneAt: null, nextId: null, createdAt: now.toISOString() };
}

const LABEL = { weekly: 'weekly', biweekly: 'every two weeks', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' };
export const repeatLabel = (repeat) => LABEL[repeat] ?? '';
