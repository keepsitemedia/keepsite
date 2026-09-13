// The one office route a machine calls: the family calendar reads tasks and
// meetings here and adds or finishes own tasks. It sits outside the session
// guard and trusts a single shared token instead, so it never touches
// cookies or CSRF, and it fails closed when the token is not configured.
import { timingSafeEqual } from 'node:crypto';
import { store as defaultStore } from '../store.mjs';
import { parseWindow, feedItems } from '../feed.mjs';
import { buildFeedIcs } from '../ics.mjs';
import { newTask, finishTask } from '../tasks.mjs';
import { siteUrl } from '../context.mjs';
import { todayIn, TZ } from '../dates.mjs';
import { OWN_SLUG } from '../clients.mjs';
import { ID } from '../ids.mjs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE } });
const refused = () => new Response(null, { status: 401, headers: NO_STORE });

function authorized(request) {
  const want = process.env.KEEPSITE_FEED_TOKEN;
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!want || !given) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

const wantsIcs = (request, url) =>
  url.searchParams.get('format') === 'ics' || /text\/calendar/.test(request.headers.get('accept') ?? '');

async function load(s) {
  const [tasks, meetings, clients] = await Promise.all([s.tasks.listAll(), s.meetings.listAll(), s.clients.list()]);
  return { tasks, meetings, clients };
}

// The read shape for one task, built the same way the window is so a POST
// answers with exactly what the next GET would show.
function itemFor(task, data, office) {
  const window = { from: task.due, to: task.due, brand: null };
  return feedItems({ ...data, tasks: [task], meetings: [], window, office }).find((i) => i.id === task.id) ?? null;
}

export async function feed(request, _ctx, s = defaultStore(), now = new Date()) {
  if (!authorized(request)) return refused();
  const office = `${siteUrl()}/office/`;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const window = parseWindow({
      from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '', brand: url.searchParams.get('brand') ?? '',
    }, todayIn(undefined, now));
    if (window.error) return json(400, { error: window.error });
    const items = feedItems({ ...(await load(s)), window, office });
    if (wantsIcs(request, url)) {
      return new Response(buildFeedIcs(items, now), { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...NO_STORE } });
    }
    return json(200, { generatedAt: now.toISOString(), timezone: TZ, office, items });
  }

  if (request.method !== 'POST') return json(405, { error: 'GET or POST only' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'expected a JSON body' }); }
  if (!body || typeof body !== 'object') return json(400, { error: 'expected a JSON object' });

  if (body.op === 'add') {
    const { task, error } = newTask({ ...body, slug: OWN_SLUG }, now);
    if (error) return json(400, { error });
    await s.tasks.put(OWN_SLUG, task.id, task);
    return json(201, itemFor(task, await load(s), office));
  }

  if (body.op === 'done' || body.op === 'reopen') {
    const id = String(body.id ?? '');
    if (!ID.test(id)) return json(400, { error: 'bad id' });
    const data = await load(s);
    const existing = data.tasks.find((t) => t.id === id);
    if (!existing) return json(404, { error: 'no such task' });
    let updated;
    if (body.op === 'done') {
      const { finished, next } = finishTask(existing, now);
      await s.tasks.put(existing.slug, id, finished);
      if (next) await s.tasks.put(existing.slug, next.id, next);
      updated = finished;
    } else {
      updated = { ...existing, done: false, doneAt: null };
      await s.tasks.put(existing.slug, id, updated);
    }
    return json(200, itemFor(updated, data, office));
  }

  return json(400, { error: 'unknown op' });
}
