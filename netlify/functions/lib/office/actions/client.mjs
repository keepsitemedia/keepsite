import { readForm, redirect, problem, field, checkCsrf } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { loadPipelines, findPipeline, advance } from '../pipeline.mjs';
import { validateClient, newClient, applyEdit, clientFields, slugify, uniqueSlug } from '../clients.mjs';
import { todayIn } from '../dates.mjs';

// Errors go back to the form in the query string rather than as a 400 page,
// so the admin keeps the form and sees what to fix.
const back = (to, errors) => redirect(`${to}?error=${encodeURIComponent(errors.join('; '))}`);

export async function client(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, 'stale form, reload and try again');

  const op = field(data, 'op');
  const fields = clientFields(data);

  if (op === 'create') {
    const pipelines = await loadPipelines(s);
    const pipeline = findPipeline(pipelines, field(data, 'pipeline'));
    if (!pipeline) return problem(400, 'unknown pipeline');
    const errors = validateClient(fields);
    if (errors.length) return back('/office/clients/new/', errors);
    const taken = new Set((await s.clients.list()).map((c) => c.slug));
    const slug = uniqueSlug(slugify(fields.business), taken);
    const today = todayIn(undefined, now);
    const first = pipeline.stages[0];
    const base = newClient({ ...fields, slug }, { pipeline: pipeline.id, stage: first.id, today, now });
    // newClient already records the first stage; advance() would record it
    // twice, so create the first stage's tasks from a client with no history.
    const { client: created, tasks } = advance({ client: { ...base, stages: [] }, pipeline, stageId: first.id, today, now });
    await s.clients.put(slug, created);
    for (const t of tasks) await s.tasks.put(slug, t.id, t);
    return redirect(`/office/clients/${slug}/`);
  }

  if (op === 'update') {
    const slug = field(data, 'slug');
    if (!SLUG.test(slug)) return problem(400, 'bad slug');
    const existing = await s.clients.get(slug);
    if (!existing) return problem(404, 'no such client');
    const errors = validateClient(fields);
    if (errors.length) return back(`/office/clients/${slug}/`, errors);
    await s.clients.put(slug, applyEdit(existing, fields, now));
    return redirect(`/office/clients/${slug}/`);
  }

  return problem(400, 'unknown op');
}
