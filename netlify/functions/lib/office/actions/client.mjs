import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG, TYPES } from '../store.mjs';
import { loadPipelines, findPipeline, advance } from '../pipeline.mjs';
import { validateClient, newClient, applyEdit, clientFields, slugify, uniqueSlug } from '../clients.mjs';
import { todayIn } from '../dates.mjs';
import { ID } from '../ids.mjs';

// Errors go back to the form in the query string rather than as a 400 page,
// so the admin keeps the form and sees what to fix.
const back = (to, errors) => redirect(`${to}?error=${encodeURIComponent(errors.join('; '))}`);

export async function client(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

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
    // Two creates in flight together (a double-clicked Save) read the same
    // taken set and settle on the same slug; the second must not replace the
    // first client or add a second set of its tasks. A second click that
    // arrives after the first finished still gets "-2": nothing tells it
    // apart from a new client that shares a business name.
    if (!(await s.clients.putIfNew(slug, created))) return redirect(`/office/clients/${slug}/`);
    for (const t of tasks) await s.tasks.put(slug, t.id, t);
    // The contact is a courtesy link, not a parent: a stale or deleted one
    // must not stop a client from being created.
    const contactId = field(data, 'contact');
    if (ID.test(contactId)) {
      const linked = await s.contacts.get(contactId);
      if (linked) await s.contacts.put(contactId, { ...linked, clientSlug: slug, updatedAt: now.toISOString() });
    }
    return redirect(`/office/clients/${slug}/`);
  }

  if (op === 'update') {
    const slug = field(data, 'slug');
    if (!SLUG.test(slug)) return problem(400, 'bad slug');
    const existing = await s.clients.get(slug);
    if (!existing) return problem(404, 'no such client');
    const errors = validateClient(fields, existing);
    if (errors.length) return back(`/office/clients/${slug}/`, errors);
    await s.clients.put(slug, applyEdit(existing, fields, now));
    return redirect(`/office/clients/${slug}/`);
  }

  if (op === 'delete') {
    const slug = field(data, 'slug');
    if (!SLUG.test(slug)) return problem(400, 'bad slug');
    const existing = await s.clients.get(slug);
    if (!existing) return problem(404, 'no such client');
    // A signed agreement is a legal record and a payment is a financial one;
    // both outlive the relationship. Delete is for leads and test clients.
    const keeps = [];
    if ((await s.agreements.list(slug)).some((a) => a.status === 'completed')) keeps.push('a signed agreement');
    if ((await s.payments.list(slug)).some((p) => p.status === 'paid' || (p.kind === 'subscription' && p.status === 'active'))) keeps.push('a payment on record');
    if (keeps.length) return back(`/office/clients/${slug}/`, [`this client has ${keeps.join(' and ')}, which must be kept; move them to Live or leave them as they are`]);
    // A contact's clientSlug is a link, not an owner; the client going away
    // must return the contact to "Start a client", not leave a dead link.
    for (const c of await s.contacts.list()) {
      if (c.clientSlug === slug) await s.contacts.put(c.id, { ...c, clientSlug: null, updatedAt: now.toISOString() });
    }
    for (const type of TYPES) {
      for (const doc of await s[type].list(slug)) await s[type].remove(slug, doc.id);
    }
    for (const meta of await s.documents.list(slug)) {
      if (meta?.name) await s.documents.remove(slug, meta.name);
    }
    await s.clients.remove(slug);
    return redirect('/office/clients/');
  }

  return problem(400, 'unknown op');
}
