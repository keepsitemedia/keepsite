import { readForm, redirect, problem, field, checkCsrf } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { loadPipelines, findPipeline, findStage, advance } from '../pipeline.mjs';
import { todayIn } from '../dates.mjs';

export async function stage(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, 'stale form, reload and try again');

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const pipeline = findPipeline(await loadPipelines(s), client.pipeline);
  const stageId = field(data, 'stage');
  if (!pipeline || !findStage(pipeline, stageId)) return problem(400, 'unknown stage');

  const { client: updated, tasks } = advance({ client, pipeline, stageId, today: todayIn(undefined, now), now });
  // Tasks first so a crash between the two writes leaves extra tasks, which
  // the admin can see, rather than a stage with no tasks, which they cannot.
  for (const t of tasks) await s.tasks.put(slug, t.id, t);
  await s.clients.put(slug, updated);
  return redirect(`/office/clients/${slug}/`);
}
