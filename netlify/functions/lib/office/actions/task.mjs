import { readForm, redirect, problem, field, checkCsrf, safeNext, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { newId, ID } from '../ids.mjs';
import { isYmd, isHhmm } from '../dates.mjs';

const when = (data) => {
  const due = field(data, 'due');
  const time = field(data, 'time');
  if (!isYmd(due)) return { error: 'due must be a date' };
  if (time && !isHhmm(time)) return { error: 'time must be HH:MM' };
  return { due, time: time || null };
};

export async function task(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  if (!(await s.clients.get(slug))) return problem(404, 'no such client');
  // A `back` that safeNext would rewrite is one we did not issue; fall to
  // the client page rather than the dashboard.
  const back = field(data, 'back');
  const to = safeNext(back) === back ? back : `/office/clients/${slug}/?tab=tasks`;
  const op = field(data, 'op');
  const at = now.toISOString();

  if (op === 'add') {
    const title = field(data, 'title');
    if (!title) return problem(400, 'title is required');
    const w = when(data);
    if (w.error) return problem(400, w.error);
    const id = newId(now);
    await s.tasks.put(slug, id, {
      id, slug, title, due: w.due, time: w.time, done: false, doneAt: null,
      source: 'manual', stage: null, questionnaire: null, payment: null,
      notes: field(data, 'notes'), createdAt: at,
    });
    return redirect(to);
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.tasks.get(slug, id);
  if (!existing) return problem(404, 'no such task');

  if (op === 'done') await s.tasks.put(slug, id, { ...existing, done: true, doneAt: at });
  else if (op === 'reopen') await s.tasks.put(slug, id, { ...existing, done: false, doneAt: null });
  else if (op === 'reschedule') {
    const w = when(data);
    if (w.error) return problem(400, w.error);
    await s.tasks.put(slug, id, { ...existing, due: w.due, time: w.time });
  } else if (op === 'delete') await s.tasks.remove(slug, id);
  else return problem(400, 'unknown op');
  return redirect(to);
}
