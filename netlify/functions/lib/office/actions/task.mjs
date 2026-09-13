import { readForm, redirect, problem, field, checkCsrf, safeNext, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { ID } from '../ids.mjs';
import { isYmd, isHhmm } from '../dates.mjs';
import { OWN_SLUG } from '../clients.mjs';
import { REPEATS, isRepeat } from '../recurrence.mjs';
import { newTask, finishTask } from '../tasks.mjs';

const when = (data) => {
  const due = field(data, 'due');
  const time = field(data, 'time');
  if (!isYmd(due)) return { error: 'due must be a date' };
  if (time && !isHhmm(time)) return { error: 'time must be HH:MM' };
  return { due, time: time || null };
};

// An empty select means "does not repeat"; anything outside the vocabulary
// is a form we did not write.
const repeatOf = (data) => {
  const value = field(data, 'repeat');
  if (!value) return { repeat: null };
  if (!isRepeat(value)) return { error: `repeat must be one of ${REPEATS.join(', ')}` };
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
  const client = own ? null : await s.clients.get(slug);
  if (!own && !client) return problem(404, 'no such client');
  // A `back` that safeNext would rewrite is one we did not issue; fall to
  // the task's own page rather than the dashboard.
  const back = field(data, 'back');
  const home = own ? '/office/tasks/' : `/office/clients/${slug}/?tab=tasks`;
  const to = safeNext(back) === back ? back : home;
  const op = field(data, 'op');

  if (op === 'add') {
    const { task: doc, error } = newTask({
      slug, title: field(data, 'title'), due: field(data, 'due'), time: field(data, 'time'),
      project: field(data, 'project'), repeat: field(data, 'repeat'), notes: field(data, 'notes'),
    }, now);
    if (error) return problem(400, error);
    await s.tasks.put(slug, doc.id, doc);
    return redirect(to);
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.tasks.get(slug, id);
  if (!existing) return problem(404, 'no such task');

  if (op === 'done') {
    const { finished, next } = finishTask(existing, now, { client });
    await s.tasks.put(slug, id, finished);
    if (next) await s.tasks.put(slug, next.id, next);
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
