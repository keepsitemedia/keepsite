import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { loadPipelines, findPipeline, findStage, advance } from '../pipeline.mjs';
import { todayIn } from '../dates.mjs';
import { stripeConfigured } from '../stripe.mjs';
import { ensureCustomer } from '../payments.mjs';
import { loadTemplates, findTemplate, placeholdersIn } from '../templates.mjs';
import { latestSent } from '../agreements.mjs';

export async function stage(request, ctx, s = defaultStore(), now = new Date(), fetchFn = fetch) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const pipeline = findPipeline(await loadPipelines(s), client.pipeline);
  const stageId = field(data, 'stage');
  if (!pipeline || !findStage(pipeline, stageId)) return problem(400, 'unknown stage');

  const { client: updated, tasks } = advance({ client, pipeline, stageId, today: todayIn(undefined, now), now });
  const entered = updated.stages.length > client.stages.length;
  // Two requests for the same first entry (a double-clicked Advance) both
  // read a client without the stage and would both create its tasks. The
  // first to take the lock writes; the other writes nothing and lands where
  // the winner did. createdAt is in the name so a client re-created under
  // the same slug does not inherit the old client's lock.
  const first = !client.stages.some((h) => h.stage === stageId);
  const lock = `stage-${slug}-${stageId}-${String(client.createdAt ?? '').replace(/\D/g, '')}`;
  const write = !first || (await s.locks.acquire(lock));
  if (write) {
    // Tasks first so a crash between the two writes leaves extra tasks, which
    // the admin can see, rather than a stage with no tasks, which they cannot.
    for (const t of tasks) await s.tasks.put(slug, t.id, t);
    await s.clients.put(slug, updated);
  }
  // The Stripe customer exists from the moment there is something to bill,
  // so the deposit link is one click later. Best-effort: Stripe being down
  // must not stop a stage change, and the Payments tab has a button for it.
  if (write && entered && stageId === 'agreement' && stripeConfigured()) {
    try { await ensureCustomer(updated, s, fetchFn, now); } catch (e) { console.error('stripe customer', e.message); }
  }
  // A stage with an entry email opens the send screen rather than sending:
  // the admin reads it with the client in mind and clicks Send themselves.
  const target = findStage(pipeline, stageId);
  if (entered && target.email) {
    // An email that carries the signing link has nothing to carry until an
    // agreement has been signed as Keepsite and sent; that send opens this
    // same email with the link filled. Land on the Agreements tab instead.
    if (await needsAgreementFirst(target.email, slug, s)) return redirect(`/office/clients/${slug}/?tab=agreements&hint=agreement`);
    return redirect(`/office/send/${slug}/${target.email}/`);
  }
  return redirect(`/office/clients/${slug}/`);
}

async function needsAgreementFirst(templateId, slug, s) {
  const t = findTemplate(await loadTemplates(s), templateId);
  if (!t || !placeholdersIn(`${t.subject}\n${t.body}`).includes('links.sign')) return false;
  return !latestSent(await s.agreements.list(slug));
}
