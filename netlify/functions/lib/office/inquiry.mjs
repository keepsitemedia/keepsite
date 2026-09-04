// Turns a /start/ submission into a client at the first stage. Deliberately
// lenient: the form already validated, and a lead that fails to land is worse
// than a lead with a blank field.
import { store as defaultStore } from './store.mjs';
import { loadPipelines, advance } from './pipeline.mjs';
import { newClient, slugify, uniqueSlug, TIERS } from './clients.mjs';
import { todayIn } from './dates.mjs';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const note = (data, when) =>
  [`[${when} inquiry]`, str(data.about), str(data.notes)].filter(Boolean).join('\n');

export async function recordInquiry(data, s = defaultStore(), now = new Date()) {
  const today = todayIn(undefined, now);
  const email = str(data.email).toLowerCase();
  const clients = await s.clients.list();
  const existing = email && clients.find((c) => c.email.toLowerCase() === email);
  if (existing) {
    const notes = [existing.notes, note(data, today)].filter(Boolean).join('\n\n');
    await s.clients.put(existing.slug, { ...existing, notes, updatedAt: now.toISOString() });
    return { slug: existing.slug, created: false };
  }

  const [pipeline] = await loadPipelines(s);
  const first = pipeline.stages[0];
  const slug = uniqueSlug(slugify(data.business), new Set(clients.map((c) => c.slug)));
  const tier = TIERS.includes(str(data.package)) ? str(data.package) : '';
  const base = newClient(
    { slug, name: str(data.name), business: str(data.business) || slug, email: str(data.email), website: str(data.website), tier, notes: note(data, today) },
    { pipeline: pipeline.id, stage: first.id, today, now },
  );
  const { client, tasks } = advance({ client: { ...base, stages: [] }, pipeline, stageId: first.id, today, now });
  for (const t of tasks) await s.tasks.put(slug, t.id, t);
  await s.clients.put(slug, client);
  return { slug, created: true };
}
