// What the family calendar sees of the office: tasks and meetings in a day
// window, each with enough to draw it and a link back to act on it. Pure,
// so the route stays a thin auth-and-parse layer.
import { waitsOnClient } from './attention.mjs';
import { OWN_SLUG } from './clients.mjs';
import { addDays, isYmd } from './dates.mjs';

const BRANDS = ['keepsite', 'lova'];

export function parseWindow({ from, to, brand } = {}, today) {
  const f = from || addDays(today, -30);
  const t = to || addDays(today, 90);
  if (!isYmd(f)) return { error: 'from must be a date' };
  if (!isYmd(t)) return { error: 'to must be a date' };
  if (t < f) return { error: 'to must not be before from' };
  if (brand && !BRANDS.includes(brand)) return { error: 'brand must be keepsite or lova' };
  return { from: f, to: t, brand: brand || null };
}

// Every client is Keepsite's until the brand field ships; own tasks belong
// to neither business and pass every brand filter.
const brandOf = (client) => (client ? 'keepsite' : null);

const inWindow = (day, w) => day >= w.from && day <= w.to;
const keep = (brand, w) => brand === null || w.brand === null || brand === w.brand;

const dayOf = (i) => (i.kind === 'task' ? i.due : i.ymd);
const order = (a, b) =>
  dayOf(a).localeCompare(dayOf(b)) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);

export function feedItems({ tasks, meetings, clients, window, office }) {
  const byslug = new Map(clients.map((c) => [c.slug, c]));
  const items = [];
  for (const t of tasks) {
    if (!inWindow(t.due, window)) continue;
    const own = t.slug === OWN_SLUG;
    const client = own ? null : byslug.get(t.slug);
    if (!own && !client) continue;
    const brand = brandOf(client);
    if (!keep(brand, window)) continue;
    items.push({
      kind: 'task', id: t.id, brand, slug: t.slug, business: client?.business ?? null, title: t.title,
      due: t.due, time: t.time ?? null, done: Boolean(t.done), waitsOnClient: waitsOnClient(t),
      source: t.source ?? 'manual', stage: t.stage ?? null, project: t.project ?? null, repeat: t.repeat ?? null,
      url: own ? `${office}tasks/` : `${office}clients/${t.slug}/?tab=tasks`,
    });
  }
  for (const m of meetings) {
    if (!inWindow(m.ymd, window)) continue;
    const client = byslug.get(m.slug);
    if (!client) continue;
    const brand = brandOf(client);
    if (!keep(brand, window)) continue;
    items.push({
      kind: 'meeting', id: m.id, brand, slug: m.slug, business: client.business, title: m.title,
      ymd: m.ymd, time: m.time, minutes: m.minutes, link: m.link ?? '', url: `${office}clients/${m.slug}/?tab=meetings`,
    });
  }
  return items.sort(order);
}
