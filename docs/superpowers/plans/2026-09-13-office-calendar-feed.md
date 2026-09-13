# Office Calendar Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A token-authenticated JSON and ICS route at `/office/api/feed` that lets the homebase family calendar read the office's tasks and meetings and add or complete own tasks.

**Architecture:** The task rules that the form action and the feed share move into `tasks.mjs`. A pure `feed.mjs` turns tasks, meetings and clients into feed items for a day window; `ics.mjs` gains a multi-event builder. The action `actions/feed.mjs` authenticates a bearer token against `KEEPSITE_FEED_TOKEN` in constant time, parses the request, and answers JSON or ICS. The guard lists the route as public so the middleware never asks Identity for it.

**Tech Stack:** Node 20, Astro 5 route dispatcher already in place, Netlify Blobs through `store.mjs`, `node --test`. No new dependencies.

**Spec:** `docs/office-calendar-feed.md` (the contract), on top of `docs/superpowers/specs/2026-09-12-office-two-brands-design.md`.

## Global Constraints

- Node 20; office modules are `.mjs` under `netlify/functions/lib/office/`, tests beside them as `*.test.mjs`, run with `node --test`.
- Actions are `(request, ctx, s = defaultStore(), now = new Date()) => Response`, registered in `actions.mjs`; `store.mjs` is the only module that knows key shapes.
- Day dates are `YYYY-MM-DD`, times `HH:MM`, zone `America/Denver` via `todayIn()` and `toInstant()` from `dates.mjs`.
- The feed never sets cookies and never reads the session; auth is the bearer token only. A missing `KEEPSITE_FEED_TOKEN` fails closed with 401. Token comparison uses `timingSafeEqual` on equal-length buffers.
- Responses carry `Cache-Control: private, no-store`. The middleware applies the office headers to every `/office/` response, including public ones.
- Own tasks live under `OWN_SLUG` (`office`) from `clients.mjs`; recurrence via `recurrence.mjs`; `waitsOnClient` from `attention.mjs`.
- Until the brand phase ships, a client item's `brand` is `'keepsite'` and an own task's is `null`.
- Comments explain why, never what. Same term for the same thing throughout a file.
- The gate is `npm run gate` and must pass at the end.
- Commit subjects imperative, under 50 characters, ending with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VYmuCNkVUYjjjbpbAe9d6J
  ```

## File map

| File | Responsibility |
|---|---|
| `netlify/functions/lib/office/tasks.mjs` (new) | `newTask(fields, now)` and `finishTask(existing, now)`: the two rules the form action and the feed share. |
| `netlify/functions/lib/office/actions/task.mjs` | Uses `tasks.mjs`; behaviour unchanged. |
| `netlify/functions/lib/office/feed.mjs` (new) | `parseWindow`, `feedItems`: pure item building for a day window. |
| `netlify/functions/lib/office/ics.mjs` | Gains `buildFeedIcs(items, now)`: one VCALENDAR, many VEVENTs, all-day or timed. |
| `netlify/functions/lib/office/actions/feed.mjs` (new) | The route: bearer auth, GET JSON/ICS, POST add/done/reopen. |
| `netlify/functions/lib/office/actions.mjs` | Registers `feed`. |
| `netlify/functions/lib/office/guard.mjs` | `/office/api/feed` is public. |
| `README.md`, `docs/office-calendar-feed.md` | Env var row, a "Calendar feed" section, status table updated. |

---

### Task 1: Shared task rules in `tasks.mjs`

**Files:**
- Create: `netlify/functions/lib/office/tasks.mjs`
- Modify: `netlify/functions/lib/office/actions/task.mjs`
- Test: `netlify/functions/lib/office/tasks.test.mjs`

**Interfaces:**
- Consumes: `newId` from `./ids.mjs`; `isRepeat`, `nextTask` from `./recurrence.mjs`; `isYmd`, `isHhmm` from `./dates.mjs`.
- Produces:
  - `newTask({ slug, title, due, time, project, repeat, notes }, now): { task } | { error }`. Validates: `title` non-empty after trim (`'title is required'`), `due` a real day (`'due must be a date'`), `time` empty or `HH:MM` (`'time must be HH:MM'`), `repeat` empty/null or weekly/monthly (`'repeat must be weekly or monthly'`). Returns the full document the form action writes today (`source: 'manual'`, nulls for stage/questionnaire/payment/agreement, `project` null when empty, `repeat` null when empty, `nextId: null`, `notes` trimmed string, `createdAt`).
  - `finishTask(existing, now): { finished, next }` where `next` is `null` unless the task is open, repeating and has no `nextId`; when `next` exists, `finished.nextId === next.id`. A done task returns `{ finished: { ...existing, done: true, doneAt }, next: null }`.

- [ ] **Step 1: Write the failing test**

`netlify/functions/lib/office/tasks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTask, finishTask } from './tasks.mjs';
import { ID } from './ids.mjs';

const NOW = new Date('2026-09-13T15:00:00Z');
const good = { slug: 'office', title: ' Post on LinkedIn ', due: '2026-09-19', time: '09:00', project: ' Marketing ', repeat: 'weekly', notes: ' three posts ' };

test('newTask builds the full document and trims text', () => {
  const { task, error } = newTask(good, NOW);
  assert.equal(error, undefined);
  assert.match(task.id, ID);
  assert.equal(task.title, 'Post on LinkedIn');
  assert.equal(task.project, 'Marketing');
  assert.equal(task.notes, 'three posts');
  assert.equal(task.repeat, 'weekly');
  assert.equal(task.source, 'manual');
  assert.equal(task.done, false);
  assert.equal(task.nextId, null);
  assert.equal(task.stage, null);
  assert.equal(task.createdAt, NOW.toISOString());
});

test('newTask nulls empty optionals and rejects bad fields', () => {
  const { task } = newTask({ slug: 'lova', title: 'x', due: '2026-09-19' }, NOW);
  assert.equal(task.time, null);
  assert.equal(task.project, null);
  assert.equal(task.repeat, null);
  assert.equal(task.notes, '');
  assert.match(newTask({ ...good, title: '  ' }, NOW).error, /title/);
  assert.match(newTask({ ...good, due: '2026-9-1' }, NOW).error, /due/);
  assert.match(newTask({ ...good, time: '25:00' }, NOW).error, /time/);
  assert.match(newTask({ ...good, repeat: 'daily' }, NOW).error, /repeat/);
});

test('finishTask spawns once for an open repeating task', () => {
  const { task } = newTask(good, NOW);
  const first = finishTask(task, NOW);
  assert.equal(first.finished.done, true);
  assert.equal(first.finished.doneAt, NOW.toISOString());
  assert.equal(first.next.due, '2026-09-26');
  assert.equal(first.finished.nextId, first.next.id);
  const again = finishTask(first.finished, NOW);
  assert.equal(again.next, null);
  const reopened = finishTask({ ...first.finished, done: false, doneAt: null }, NOW);
  assert.equal(reopened.next, null);
  const plain = finishTask(newTask({ slug: 'lova', title: 'x', due: '2026-09-19' }, NOW).task, NOW);
  assert.equal(plain.next, null);
  assert.equal(plain.finished.nextId, null);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/tasks.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/tasks.mjs`:

```js
// The rules a task obeys no matter which door it came through: the office
// form and the calendar feed both build and finish tasks here, so neither
// can drift from the other.
import { newId } from './ids.mjs';
import { isYmd, isHhmm } from './dates.mjs';
import { isRepeat, nextTask } from './recurrence.mjs';

const text = (v) => String(v ?? '').trim();

export function newTask(fields, now = new Date()) {
  const title = text(fields.title);
  const due = text(fields.due);
  const time = text(fields.time);
  const repeat = text(fields.repeat);
  if (!title) return { error: 'title is required' };
  if (!isYmd(due)) return { error: 'due must be a date' };
  if (time && !isHhmm(time)) return { error: 'time must be HH:MM' };
  if (repeat && !isRepeat(repeat)) return { error: 'repeat must be weekly or monthly' };
  return {
    task: {
      id: newId(now), slug: fields.slug, title, due, time: time || null, done: false, doneAt: null,
      source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null,
      notes: text(fields.notes), project: text(fields.project) || null, repeat: repeat || null, nextId: null,
      createdAt: now.toISOString(),
    },
  };
}

// A replayed Done finds the task already done, and a Reopen-then-Done finds
// it still carrying the nextId from the first Done (reopen does not clear
// it); either way a successor already exists, so a task spawns at most once.
export function finishTask(existing, now = new Date()) {
  const at = now.toISOString();
  const spawn = !existing.done && isRepeat(existing.repeat) && !existing.nextId;
  if (!spawn) return { finished: { ...existing, done: true, doneAt: at }, next: null };
  const next = nextTask(existing, now);
  return { finished: { ...existing, done: true, doneAt: at, nextId: next.id }, next };
}
```

In `actions/task.mjs`: import `newTask`, `finishTask` from `../tasks.mjs`; drop the `when`/`repeatOf` use in `add` and the `isRepeat`/`nextTask`/`newId` imports if nothing else uses them (`when` and `repeatOf` stay for `reschedule`). The `add` branch becomes:

```js
  if (op === 'add') {
    const { task: doc, error } = newTask({
      slug, title: field(data, 'title'), due: field(data, 'due'), time: field(data, 'time'),
      project: field(data, 'project'), repeat: field(data, 'repeat'), notes: field(data, 'notes'),
    }, now);
    if (error) return problem(400, error);
    await s.tasks.put(slug, doc.id, doc);
    return redirect(to);
  }
```

and the `done` branch becomes:

```js
  if (op === 'done') {
    const { finished, next } = finishTask(existing, now);
    await s.tasks.put(slug, id, finished);
    if (next) await s.tasks.put(slug, next.id, next);
  }
```

Move the spawn-once comment to `tasks.mjs` (it is there above) rather than keeping two copies.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/tasks.test.mjs netlify/functions/lib/office/actions/task.test.mjs`
Expected: PASS; the existing action tests are the regression net for the refactor.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/tasks.mjs netlify/functions/lib/office/tasks.test.mjs netlify/functions/lib/office/actions/task.mjs
git commit -m "Share task rules between the form and the feed"
```

---

### Task 2: Feed items and the multi-event ICS

**Files:**
- Create: `netlify/functions/lib/office/feed.mjs`
- Modify: `netlify/functions/lib/office/ics.mjs`
- Test: `netlify/functions/lib/office/feed.test.mjs`, `netlify/functions/lib/office/ics.test.mjs`

**Interfaces:**
- Consumes: `waitsOnClient` from `./attention.mjs`; `OWN_SLUG` from `./clients.mjs`; `addDays`, `isYmd`, `toInstant` from `./dates.mjs`.
- Produces:
  - `parseWindow({ from, to, brand }, today): { from, to, brand } | { error }`. Defaults `from = addDays(today, -30)`, `to = addDays(today, 90)`. Errors: `'from must be a date'`, `'to must be a date'`, `'to must not be before from'`, `'brand must be keepsite or lova'`. `brand` is `null` when absent.
  - `feedItems({ tasks, meetings, clients, window, office }): item[]` where `office` is the office base URL ending in `/office/`. Tasks with `due` in the window and meetings with `ymd` in the window, sorted by day then time (untimed first) then title. Shapes exactly as `docs/office-calendar-feed.md`: task items carry `kind, id, brand, slug, business, title, due, time, done, waitsOnClient, source, stage, project, repeat, url`; meeting items carry `kind, id, brand, slug, business, title, ymd, time, minutes, link, url`. `brand` is `'keepsite'` for anything with a client and `null` for own tasks. A brand filter keeps own tasks and items of that brand. A task whose slug is neither `office` nor a known client (a deleted client's leftover) is skipped.
  - `buildFeedIcs(items, now): string`, one VCALENDAR without METHOD, `PRODID:-//Keepsite Media//Office//EN`, one VEVENT per item: `UID:<id>@keepsitemedia.com`, `DTSTAMP`, all-day `DTSTART;VALUE=DATE:YYYYMMDD` and `DTEND;VALUE=DATE:<next day>` for a task with no time, otherwise `DTSTART`/`DTEND` in UTC from `toInstant` with 30 minutes for a timed task and `minutes` for a meeting; `SUMMARY` is `business: title` or just the title for own tasks; done tasks get `STATUS:COMPLETED`; `URL` is the item's `url`.

- [ ] **Step 1: Write the failing tests**

`netlify/functions/lib/office/feed.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWindow, feedItems } from './feed.mjs';

const today = '2026-09-13';
const office = 'https://www.keepsitemedia.com/office/';
const clients = [{ slug: 'acme', business: 'Acme' }];
const t = (over) => ({ id: '20260901T000000aaaaaa', slug: 'acme', title: 'T', due: today, time: null, done: false, source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null, project: null, repeat: null, ...over });
const m = (over) => ({ id: '20260901T000000bbbbbb', slug: 'acme', title: 'M', ymd: today, time: '10:00', minutes: 30, link: '', ...over });

test('parseWindow defaults and validates', () => {
  assert.deepEqual(parseWindow({}, today), { from: '2026-08-14', to: '2026-12-12', brand: null });
  assert.deepEqual(parseWindow({ from: '2026-09-01', to: '2026-09-30', brand: 'lova' }, today), { from: '2026-09-01', to: '2026-09-30', brand: 'lova' });
  assert.match(parseWindow({ from: 'x' }, today).error, /from/);
  assert.match(parseWindow({ to: '2026-13-01' }, today).error, /to/);
  assert.match(parseWindow({ from: '2026-09-02', to: '2026-09-01' }, today).error, /before/);
  assert.match(parseWindow({ brand: 'acme' }, today).error, /brand/);
});

test('feedItems shapes tasks and meetings, filters the window, and sorts', () => {
  const window = { from: '2026-09-10', to: '2026-09-20', brand: null };
  const tasks = [
    t({ id: '20260901T000000aaaaa1', title: 'Late', due: '2026-09-12', time: '14:00', done: true }),
    t({ id: '20260901T000000aaaaa2', title: 'Sign', due: '2026-09-12', agreement: 'completed', source: 'pipeline', stage: 'agreement' }),
    t({ id: '20260901T000000aaaaa3', slug: 'office', title: 'Post', due: '2026-09-12', project: 'Marketing', repeat: 'weekly' }),
    t({ id: '20260901T000000aaaaa4', title: 'Out', due: '2026-09-25' }),
    t({ id: '20260901T000000aaaaa5', slug: 'ghost', title: 'Orphan', due: '2026-09-12' }),
  ];
  const meetings = [m({ ymd: '2026-09-12' }), m({ id: '20260901T000000bbbbb2', ymd: '2026-10-01' })];
  const items = feedItems({ tasks, meetings, clients, window, office });
  assert.deepEqual(items.map((i) => i.title), ['Post', 'Sign', 'M', 'Late']);
  const sign = items[1];
  assert.deepEqual(sign, {
    kind: 'task', id: '20260901T000000aaaaa2', brand: 'keepsite', slug: 'acme', business: 'Acme', title: 'Sign',
    due: '2026-09-12', time: null, done: false, waitsOnClient: true, source: 'pipeline', stage: 'agreement',
    project: null, repeat: null, url: `${office}clients/acme/?tab=tasks`,
  });
  const post = items[0];
  assert.equal(post.brand, null);
  assert.equal(post.business, null);
  assert.equal(post.url, `${office}tasks/`);
  assert.equal(post.project, 'Marketing');
  const meeting = items[2];
  assert.deepEqual(meeting, {
    kind: 'meeting', id: '20260901T000000bbbbbb', brand: 'keepsite', slug: 'acme', business: 'Acme', title: 'M',
    ymd: '2026-09-12', time: '10:00', minutes: 30, link: '', url: `${office}clients/acme/?tab=meetings`,
  });
});

test('a brand filter keeps own tasks and drops the other brand', () => {
  const window = { from: '2026-09-10', to: '2026-09-20', brand: 'lova' };
  const tasks = [t({ id: '20260901T000000aaaaa1' }), t({ id: '20260901T000000aaaaa3', slug: 'office', title: 'Own' })];
  assert.deepEqual(feedItems({ tasks, meetings: [], clients, window, office }).map((i) => i.title), ['Own']);
  const all = { ...window, brand: 'keepsite' };
  assert.equal(feedItems({ tasks, meetings: [], clients, window: all, office }).length, 2);
});
```

Append to `ics.test.mjs` (add `buildFeedIcs` to its import):

```js
test('buildFeedIcs writes all-day and timed events for a whole window', () => {
  const now = new Date('2026-09-13T15:00:00Z');
  const items = [
    { kind: 'task', id: 'a1', business: null, title: 'Post', due: '2026-09-19', time: null, done: false, url: 'https://x/office/tasks/' },
    { kind: 'task', id: 'a2', business: 'Acme', title: 'Call', due: '2026-09-19', time: '09:00', done: true, url: 'https://x/office/clients/acme/?tab=tasks' },
    { kind: 'meeting', id: 'b1', business: 'Acme', title: 'Kickoff', ymd: '2026-09-20', time: '10:00', minutes: 45, url: 'https://x/office/clients/acme/?tab=meetings' },
  ];
  const ics = buildFeedIcs(items, now);
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-\/\/Keepsite Media\/\/Office\/\/EN\r\n/);
  assert.doesNotMatch(ics, /METHOD:/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.match(ics, /UID:a1@keepsitemedia.com\r\nDTSTAMP:20260913T150000Z\r\nDTSTART;VALUE=DATE:20260919\r\nDTEND;VALUE=DATE:20260920\r\nSUMMARY:Post\r\n/);
  assert.match(ics, /UID:a2@keepsitemedia.com\r\n[^]*?DTSTART:20260919T150000Z\r\nDTEND:20260919T153000Z\r\nSUMMARY:Acme: Call\r\nSTATUS:COMPLETED\r\n/);
  assert.match(ics, /UID:b1@keepsitemedia.com\r\n[^]*?DTSTART:20260920T160000Z\r\nDTEND:20260920T164500Z\r\nSUMMARY:Acme: Kickoff\r\n/);
  assert.match(ics, /URL:https:\/\/x\/office\/tasks\/\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
```

(2026-09-19 09:00 Mountain is 15:00 UTC in daylight time; 10:00 is 16:00.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test netlify/functions/lib/office/feed.test.mjs netlify/functions/lib/office/ics.test.mjs`
Expected: FAIL, missing module and missing export.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/feed.mjs`:

```js
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
```

In `ics.mjs`, import `addDays`, `toInstant` from `./dates.mjs` and append:

```js
// The whole window as one calendar the family app can import. No METHOD:
// this is a listing, not an invitation, so nothing here asks for a reply.
export function buildFeedIcs(items, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keepsite Media//Office//EN'];
  for (const i of items) {
    const day = i.kind === 'task' ? i.due : i.ymd;
    const summary = i.business ? `${i.business}: ${i.title}` : i.title;
    lines.push('BEGIN:VEVENT', `UID:${esc(i.id)}@keepsitemedia.com`, `DTSTAMP:${stamp(now)}`);
    if (i.time) {
      const start = toInstant(day, i.time);
      const minutes = i.kind === 'meeting' ? i.minutes : 30;
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + minutes * 60e3))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${esc(summary)}`);
    if (i.kind === 'task' && i.done) lines.push('STATUS:COMPLETED');
    if (i.url) lines.push(`URL:${esc(i.url)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/feed.test.mjs netlify/functions/lib/office/ics.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/feed.mjs netlify/functions/lib/office/feed.test.mjs netlify/functions/lib/office/ics.mjs netlify/functions/lib/office/ics.test.mjs
git commit -m "Build calendar feed items and a window ICS"
```

---

### Task 3: The feed route

**Files:**
- Create: `netlify/functions/lib/office/actions/feed.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`, `netlify/functions/lib/office/guard.mjs`
- Test: `netlify/functions/lib/office/actions/feed.test.mjs`, `netlify/functions/lib/office/guard.test.mjs`

**Interfaces:**
- Consumes: `parseWindow`, `feedItems` from `../feed.mjs`; `buildFeedIcs` from `../ics.mjs`; `newTask`, `finishTask` from `../tasks.mjs`; `siteUrl` from `../context.mjs`; `todayIn` from `../dates.mjs`; `OWN_SLUG` from `../clients.mjs`; `ID` from `../ids.mjs`; `timingSafeEqual` from `node:crypto`.
- Produces: `POST`/`GET /office/api/feed` exactly per `docs/office-calendar-feed.md`. Auth: `Authorization: Bearer <token>` compared against `process.env.KEEPSITE_FEED_TOKEN`; missing env, missing header, wrong length or wrong value all give 401 with an empty body. Other methods 405. GET: `?from`, `?to`, `?brand`, and `?format=ics` or `Accept: text/calendar` for ICS (`Content-Type: text/calendar; charset=utf-8`), else JSON `{ generatedAt, timezone: 'America/Denver', office, items }`. POST: JSON body; `op: 'add'` creates an own task and returns 201 with the created item in the read shape; `op: 'done'` / `op: 'reopen'` take `id`, search every task for it (`tasks.listAll()`), 404 when absent, return 200 with the updated item; other ops 400. Errors are JSON `{ error }` with 400, except auth (401, empty). Every response carries `Cache-Control: private, no-store`. `guard.isPublic('/office/api/feed')` is true.

- [ ] **Step 1: Write the failing tests**

`netlify/functions/lib/office/actions/feed.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feed } from './feed.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { newId } from '../ids.mjs';

const TOKEN = 'a'.repeat(43);
const NOW = new Date('2026-09-13T15:00:00Z');
const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('acme', { slug: 'acme', business: 'Acme' });
  const a = newId(NOW);
  await s.tasks.put('acme', a, { id: a, slug: 'acme', title: 'Layouts', due: '2026-09-15', time: null, done: false, source: 'pipeline', stage: 'layouts', questionnaire: null, payment: null, agreement: null });
  const b = newId(new Date(NOW.getTime() + 1000));
  await s.tasks.put('office', b, { id: b, slug: 'office', title: 'Post', due: '2026-09-19', time: '09:00', done: false, source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null, project: 'Marketing', repeat: 'weekly', nextId: null });
  const c = newId(new Date(NOW.getTime() + 2000));
  await s.meetings.put('acme', c, { id: c, slug: 'acme', title: 'Kickoff', ymd: '2026-09-16', time: '10:00', minutes: 30, link: '' });
  return { s, a, b, c };
};
const get = (q = '', headers = {}) => new Request(`https://site.test/office/api/feed${q}`, { headers: { Authorization: `Bearer ${TOKEN}`, ...headers } });
const post = (body, headers = {}) => new Request('https://site.test/office/api/feed', {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const ctx = { admin: null, csrf: '' };

test.before(() => { process.env.KEEPSITE_FEED_TOKEN = TOKEN; });
test.after(() => { delete process.env.KEEPSITE_FEED_TOKEN; });

test('the token is required, checked, and fails closed when unset', async () => {
  const { s } = await make();
  assert.equal((await feed(new Request('https://site.test/office/api/feed'), ctx, s, NOW)).status, 401);
  assert.equal((await feed(get('', { Authorization: `Bearer ${'b'.repeat(43)}` }), ctx, s, NOW)).status, 401);
  assert.equal((await feed(get('', { Authorization: 'Bearer short' }), ctx, s, NOW)).status, 401);
  const saved = process.env.KEEPSITE_FEED_TOKEN;
  delete process.env.KEEPSITE_FEED_TOKEN;
  const res = await feed(get(), ctx, s, NOW);
  process.env.KEEPSITE_FEED_TOKEN = saved;
  assert.equal(res.status, 401);
  assert.equal(await res.text(), '');
  assert.equal((await feed(new Request('https://site.test/office/api/feed', { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } }), ctx, s, NOW)).status, 405);
});

test('GET returns the window as JSON with the office headers it owns', async () => {
  const { s, a, b, c } = await make();
  const res = await feed(get('?from=2026-09-10&to=2026-09-20'), ctx, s, NOW);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.match(res.headers.get('Content-Type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.timezone, 'America/Denver');
  assert.equal(body.generatedAt, NOW.toISOString());
  assert.match(body.office, /\/office\/$/);
  assert.deepEqual(body.items.map((i) => i.id), [a, c, b]);
  assert.equal(body.items[0].brand, 'keepsite');
  assert.equal(body.items[2].brand, null);
  const bad = await feed(get('?from=nope'), ctx, s, NOW);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /from/);
});

test('GET can answer ICS by query or by Accept', async () => {
  const { s } = await make();
  for (const req of [get('?format=ics'), get('', { Accept: 'text/calendar' })]) {
    const res = await feed(req, ctx, s, NOW);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Type'), /text\/calendar/);
    assert.match(await res.text(), /BEGIN:VCALENDAR/);
  }
});

test('POST add creates an own task and returns it', async () => {
  const { s } = await make();
  const res = await feed(post({ op: 'add', title: 'Renew domain', due: '2026-10-01', project: 'Admin' }), ctx, s, NOW);
  assert.equal(res.status, 201);
  const item = await res.json();
  assert.equal(item.kind, 'task');
  assert.equal(item.slug, 'office');
  assert.equal(item.project, 'Admin');
  assert.equal(item.brand, null);
  assert.equal((await s.tasks.get('office', item.id)).title, 'Renew domain');
  const bad = await feed(post({ op: 'add', title: '', due: '2026-10-01' }), ctx, s, NOW);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /title/);
  assert.equal((await feed(post({ op: 'nope' }), ctx, s, NOW)).status, 400);
  assert.equal((await feed(new Request('https://site.test/office/api/feed', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: 'not json' }), ctx, s, NOW)).status, 400);
});

test('POST done and reopen work on any task by id and spawn like the office', async () => {
  const { s, a, b } = await make();
  const done = await feed(post({ op: 'done', id: b }), ctx, s, NOW);
  assert.equal(done.status, 200);
  assert.equal((await done.json()).done, true);
  const own = await s.tasks.list('office');
  assert.equal(own.length, 2);
  assert.ok(own.some((t) => t.due === '2026-09-26' && !t.done));
  const client = await feed(post({ op: 'done', id: a }), ctx, s, NOW);
  assert.equal(client.status, 200);
  assert.equal((await s.tasks.get('acme', a)).done, true);
  const reopened = await feed(post({ op: 'reopen', id: a }), ctx, s, NOW);
  assert.equal((await reopened.json()).done, false);
  assert.equal((await feed(post({ op: 'done', id: '20260101T000000zzzzzz' }), ctx, s, NOW)).status, 404);
  assert.equal((await feed(post({ op: 'done', id: '../x' }), ctx, s, NOW)).status, 400);
});
```

Append to `guard.test.mjs` (read its existing tests to match the style):

```js
test('the calendar feed is public to the middleware and checks its own token', () => {
  assert.equal(isPublic('/office/api/feed'), true);
  assert.equal(decide('/office/api/feed', { ok: false }).kind, 'public');
  assert.equal(isPublic('/office/api/feedx'), false);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test netlify/functions/lib/office/actions/feed.test.mjs netlify/functions/lib/office/guard.test.mjs`
Expected: FAIL, missing module and `isPublic` false.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/actions/feed.mjs`:

```js
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
```

Note `itemFor` for an own task: `feedItems` needs `clients` only for client tasks, so passing `data` as loaded is right; for a client task the client is in `data.clients`.

In `actions.mjs`: import `feed` from `./actions/feed.mjs` and add it to the map.

In `guard.mjs`:

```js
// The calendar feed authenticates with its own bearer token, so the session
// guard steps aside for it the way it does for the login route.
export const isPublic = (pathname) =>
  pathname === '/office/login/' || pathname === '/office/api/login' || pathname === '/office/api/feed';
```

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/actions/feed.test.mjs netlify/functions/lib/office/guard.test.mjs`, then `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/feed.mjs netlify/functions/lib/office/actions/feed.test.mjs netlify/functions/lib/office/actions.mjs netlify/functions/lib/office/guard.mjs netlify/functions/lib/office/guard.test.mjs
git commit -m "Add the calendar feed route"
```

---

### Task 4: Docs

**Files:**
- Modify: `README.md`, `docs/office-calendar-feed.md`

- [ ] **Step 1: README**

In "## The office", "### Environment variables" table, add a row after `STRIPE_WEBHOOK_SECRET`:

```markdown
| `KEEPSITE_FEED_TOKEN` | Bearer token for the calendar feed at `/office/api/feed`. Any long random string; generate one the way `KEEPSITE_TOKEN_SECRET` is generated. Without it every feed request is refused with 401. |
```

After the "### Own tasks" section, add:

```markdown
### Calendar feed

`/office/api/feed` is the one office route a machine calls. The family
calendar at homebase.samnichols.dev reads tasks and meetings from it and
adds or finishes own tasks through it. It sits outside the login: the
caller sends `Authorization: Bearer $KEEPSITE_FEED_TOKEN` and nothing
else, and the token lives only in Netlify and in the caller's own
secrets, never in a browser.

`GET` takes `from`, `to` (days, default 30 back to 90 ahead) and `brand`,
and answers JSON, or ICS with `?format=ics`. `POST` takes a JSON body
with `op` of `add` (an own task: `title`, `due`, optional `time`,
`project`, `repeat`, `notes`), `done` or `reopen` (an `id`). The full
contract, with a sample response, is `docs/office-calendar-feed.md`.
```

- [ ] **Step 2: Handoff status**

In `docs/office-calendar-feed.md`, change the status table row for the feed endpoint to "Built on the `office-additions` branch; live once that branch deploys and `KEEPSITE_FEED_TOKEN` is set in Netlify." and change the heading "## The feed contract (to be built on the keepsite side)" to "## The feed contract". In the "Names and addresses" table, drop "(to be built)". Also copy the updated file over `/mnt/c/Users/Snic9/homebase/docs/office-calendar-feed.md` so both repos carry the same text.

- [ ] **Step 3: Gate and commit**

Run: `npm run gate`
Expected: PASS.

```bash
git add README.md docs/office-calendar-feed.md
git commit -m "Document the calendar feed"
```
