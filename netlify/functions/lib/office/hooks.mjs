// The one place a non-admin writer touches the office store: a submitted
// questionnaire closes the task that was waiting for it. Anything missing is
// a quiet no-op, because the questionnaire must never fail on office state.
import { store as defaultStore } from './store.mjs';

export async function markQuestionnaireDone(slug, form, s = defaultStore(), now = new Date()) {
  if (!(await s.clients.get(slug))) return false;
  const task = (await s.tasks.list(slug)).find((t) => t.questionnaire === form && !t.done);
  if (!task) return false;
  await s.tasks.put(slug, task.id, { ...task, done: true, doneAt: now.toISOString() });
  return true;
}
