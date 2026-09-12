import { readForm, redirect, problem, field, checkCsrf, safeNext, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { newId, ID } from '../ids.mjs';
import { isYmd, isHhmm } from '../dates.mjs';
import { OWN_SLUG } from '../clients.mjs';
import { isRepeat, nextTask } from '../recurrence.mjs';

const when = (data) => {
  const due = field(data, 'due');
  const time = field(data, 'time');
  if (!isYmd(due)) return { error: 'due must be a date' };
  if (time && !isHhmm(time)) return { error: 'time must be HH:MM' };
  return { due, time: time || null };
};

// An empty select means "does not repeat"; anything but the two words is a
// form we did not write.
const repeatOf = (data) => {
  const value = field(data, 'repeat');
  if (!value) return { repeat: null };
  if (!isRepeat(value)) return { error: 'repeat must be weekly or monthly' };
  return { repeat: value };
};

export async function task(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const own = slug === OWN_SLUG;
  if (!own && !(await s.clients.get(slug))) return problem(404, 'no such client');
  // A `back` that safeNext would rewrite is one we did not issue; fall to
  // the task's own page rather than the dashboard.
  const back = field(data, 'back');
  const home = own ? '/office/tasks/' : `/office/clients/${slug}/?tab=tasks`;
  const to = safeNext(back) === back ? back : home;
  const op = field(data, 'op');
  const at = now.toISOString();

  if (op === 'add') {
    const title = field(data, 'title');
    if (!title) return problem(400, 'title is required');
    const w = when(data);
    if (w.error) return problem(400, w.error);
    const r = repeatOf(data);
    if (r.error) return problem(400, r.error);
    const id = newId(now);
    await s.tasks.put(slug, id, {
      id, slug, title, due: w.due, time: w.time, done: false, doneAt: null,
      source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null,
      notes: field(data, 'notes'), project: field(data, 'project') || null, repeat: r.repeat, createdAt: at,
    });
    return redirect(to);
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.tasks.get(slug, id);
  if (!existing) return problem(404, 'no such task');

  if (op === 'done') {
    // A replayed Done finds the task already done and must not add a
    // second next task; the chain grows only on the open-to-done edge.
    const spawn = !existing.done && isRepeat(existing.repeat);
    await s.tasks.put(slug, id, { ...existing, done: true, doneAt: at });
    if (spawn) {
      const next = nextTask(existing, now);
      await s.tasks.put(slug, next.id, next);
    }
  } else if (op === 'reopen') await s.tasks.put(slug, id, { ...existing, done: false, doneAt: null });
  else if (op === 'reschedule') {
    const w = when(data);
    if (w.error) return problem(400, w.error);
    const updated = { ...existing, due: w.due, time: w.time };
    if (data.has('repeat')) {
      const r = repeatOf(data);
      if (r.error) return problem(400, r.error);
      updated.repeat = r.repeat;
    }
    await s.tasks.put(slug, id, updated);
  } else if (op === 'delete') await s.tasks.remove(slug, id);
  else return problem(400, 'unknown op');
  return redirect(to);
}
