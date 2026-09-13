# Office Own Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasks that belong to the business rather than to a client: a project label, weekly or monthly repeat, their own page, and rows on Today and the Calendar.

**Architecture:** Own tasks are ordinary task documents stored under the reserved client slug `office`, so the store, calendar, digest, dashboard split and export keep working unchanged. Two new fields on every task (`project`, `repeat`), one new module for recurrence, one new page, and small branches in the task action and the task row where a client link would otherwise appear.

**Tech Stack:** Node 20, Astro 5 server-rendered pages, Netlify Blobs through `store.mjs`, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-office-two-brands-design.md`, sections "Own tasks", "Digest and reminders", "Migration", "Testing", phase 1.

## Global Constraints

- Node 20; office modules are `.mjs` under `netlify/functions/lib/office/`, tests beside them as `*.test.mjs`, run with `node --test`.
- Every office page exports `prerender = false`; the middleware guards `/office/`.
- `store.mjs` is the only module that knows key shapes. Actions are `(request, ctx, s = defaultStore(), now = new Date()) => Response`.
- Day dates are `YYYY-MM-DD` strings; times are `HH:MM`; "today" is Mountain time via `todayIn()`.
- Design system: `.interface-design/system.md`. One green, clay only for late or destructive, no shadows, no italics, empty states are a plain sentence in graphite.
- Comments explain why, never what. Same term for the same thing throughout a file.
- Missing `project` and `repeat` on stored tasks read as null; no data rewrite.
- The gate is `npm run gate` and must pass at the end of every task.
- The working tree currently holds uncommitted CRM changes on a detached HEAD. Before Task 1 the owner commits or stashes them and checks out a branch; this plan does not touch them.
- Commit subjects imperative, under 50 characters, body only when the diff does not explain the reason, ending with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VYmuCNkVUYjjjbpbAe9d6J
  ```

## File map

| File | Responsibility |
|---|---|
| `netlify/functions/lib/office/dates.mjs` | Gains `addMonths(ymd, n)`: same day next month, clamped to that month's end. |
| `netlify/functions/lib/office/calendar.mjs` | `shiftMonth` delegates to `addMonths`. |
| `netlify/functions/lib/office/clients.mjs` | Gains `OWN_SLUG = 'office'`; `uniqueSlug` never returns it. |
| `netlify/functions/lib/office/recurrence.mjs` (new) | `REPEATS`, `isRepeat`, `nextDue`, `nextTask`. |
| `netlify/functions/lib/office/actions/task.mjs` | Accepts the reserved slug without a client lookup; reads `project` and `repeat`; Done on a repeating task creates the next one. |
| `netlify/functions/lib/office/digest.mjs` | Names own tasks "Office" instead of the bare slug. |
| `src/components/office/TaskRow.astro` | Project label in the client column for own tasks; repeat select in the Move sheet; repeat word in the meta. |
| `src/pages/office/tasks.astro` (new) | The own-tasks page: add form, open tasks grouped by project, done fold. |
| `src/layouts/OfficeLayout.astro` | Nav gains Tasks. |
| `src/pages/office/calendar.astro` | The add form's client select gains an Office option. |
| `README.md` | "Own tasks" section under the office. |

---

### Task 1: `addMonths` in dates, used by the calendar

**Files:**
- Modify: `netlify/functions/lib/office/dates.mjs`
- Modify: `netlify/functions/lib/office/calendar.mjs:20-31`
- Test: `netlify/functions/lib/office/dates.test.mjs`

**Interfaces:**
- Produces: `addMonths(ymd: string, n: number): string`, the same day of month `n` months away, clamped to the last day of the target month. Negative `n` allowed.

- [ ] **Step 1: Write the failing test**

Append to `netlify/functions/lib/office/dates.test.mjs` (add `addMonths` to the existing import from `./dates.mjs`):

```js
test('addMonths keeps the day of month and clamps to the month end', () => {
  assert.equal(addMonths('2026-01-15', 1), '2026-02-15');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-12-10', 1), '2027-01-10');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2026-10-31', 12), '2027-10-31');
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/dates.test.mjs`
Expected: FAIL, `addMonths` is not exported.

- [ ] **Step 3: Implement**

Append to `dates.mjs`:

```js
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Same day of month, clamped to the target month's last day, so a task
// repeating from the 31st lands on the 28th and not in the month after.
export function addMonths(ymd, n) {
  const [y, m, d] = parts(ymd);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysIn(ny, nm)))}`;
}
```

In `calendar.mjs`, import `addMonths` from `./dates.mjs`, delete the local `shiftMonth` and its comment, and in `monthGrid` replace the two calls:

```js
return { label, prev: addMonths(ymd, -1), next: addMonths(ymd, 1), weeks };
```

Keep `pad`, `ymdOf` and `daysIn` in `calendar.mjs` because `monthGrid` still uses them.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/dates.test.mjs netlify/functions/lib/office/calendar.test.mjs`
Expected: PASS, including "monthGrid clamps prev and next to real dates".

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/dates.mjs netlify/functions/lib/office/dates.test.mjs netlify/functions/lib/office/calendar.mjs
git commit -m "Add addMonths and use it for month paging"
```

---

### Task 2: Reserve the `office` slug

**Files:**
- Modify: `netlify/functions/lib/office/clients.mjs:17-24`
- Test: `netlify/functions/lib/office/clients.test.mjs`

**Interfaces:**
- Produces: `OWN_SLUG = 'office'` exported from `clients.mjs`. `uniqueSlug(base, taken)` treats `OWN_SLUG` as taken. Both `client.mjs` create and `inquiry.mjs` already go through `uniqueSlug`, so neither can create a client at that slug.

- [ ] **Step 1: Write the failing test**

Append to `clients.test.mjs` (add `OWN_SLUG` to the import):

```js
test('the own-tasks slug is never handed to a client', () => {
  assert.equal(OWN_SLUG, 'office');
  assert.equal(uniqueSlug('office', new Set()), 'office-2');
  assert.equal(uniqueSlug('office', new Set(['office-2'])), 'office-3');
  assert.equal(slugify('Office'), 'office');
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/clients.test.mjs`
Expected: FAIL, `OWN_SLUG` undefined.

- [ ] **Step 3: Implement**

In `clients.mjs`, above `uniqueSlug`:

```js
// Tasks with no client live under this slug in the tasks store, so no
// client may ever be created at it.
export const OWN_SLUG = 'office';

export function uniqueSlug(base, taken) {
  if (base !== OWN_SLUG && !taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 64 - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/clients.test.mjs netlify/functions/lib/office/actions/client.test.mjs netlify/functions/lib/office/inquiry.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/clients.mjs netlify/functions/lib/office/clients.test.mjs
git commit -m "Reserve the office slug for own tasks"
```

---

### Task 3: Recurrence module

**Files:**
- Create: `netlify/functions/lib/office/recurrence.mjs`
- Test: `netlify/functions/lib/office/recurrence.test.mjs`

**Interfaces:**
- Consumes: `addDays`, `addMonths` from `./dates.mjs`; `newId` from `./ids.mjs`.
- Produces:
  - `REPEATS = ['weekly', 'monthly']`
  - `isRepeat(value): boolean`
  - `nextDue(ymd, repeat): string`, throws on an unknown repeat.
  - `nextTask(task, now = new Date()): object`, a fresh open task document with a new id, the same `slug`, `title`, `time`, `project`, `repeat`, `notes`, `source`, `due` from `nextDue(task.due, task.repeat)`, `done: false`, `doneAt: null`, `stage`, `questionnaire`, `payment`, `agreement` all null, `createdAt: now.toISOString()`.

- [ ] **Step 1: Write the failing test**

`netlify/functions/lib/office/recurrence.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPEATS, isRepeat, nextDue, nextTask } from './recurrence.mjs';
import { ID } from './ids.mjs';

const NOW = new Date('2026-09-12T15:00:00Z');
const base = {
  id: '20260901T100000aaaaaa', slug: 'office', title: 'Post on LinkedIn', due: '2026-09-10', time: '09:00',
  done: true, doneAt: NOW.toISOString(), source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null,
  notes: 'three posts', project: 'Marketing', repeat: 'weekly', createdAt: '2026-09-01T10:00:00.000Z',
};

test('isRepeat accepts the two words and nothing else', () => {
  assert.deepEqual(REPEATS, ['weekly', 'monthly']);
  assert.equal(isRepeat('weekly'), true);
  assert.equal(isRepeat('monthly'), true);
  assert.equal(isRepeat(''), false);
  assert.equal(isRepeat(null), false);
  assert.equal(isRepeat('daily'), false);
});

test('nextDue counts from the due date, not from today', () => {
  assert.equal(nextDue('2026-09-10', 'weekly'), '2026-09-17');
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28');
  assert.throws(() => nextDue('2026-09-10', 'daily'), /repeat/);
});

test('nextTask copies what recurs and resets what does not', () => {
  const n = nextTask(base, NOW);
  assert.match(n.id, ID);
  assert.notEqual(n.id, base.id);
  assert.equal(n.due, '2026-09-17');
  assert.equal(n.done, false);
  assert.equal(n.doneAt, null);
  assert.equal(n.createdAt, NOW.toISOString());
  for (const k of ['slug', 'title', 'time', 'project', 'repeat', 'notes', 'source']) assert.equal(n[k], base[k], k);
  for (const k of ['stage', 'questionnaire', 'payment', 'agreement']) assert.equal(n[k], null, k);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/recurrence.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/recurrence.mjs`:

```js
// A repeating task is a chain of ordinary tasks: Done on one creates the
// next, dated from the one just finished so a task done late does not drift.
import { addDays, addMonths } from './dates.mjs';
import { newId } from './ids.mjs';

export const REPEATS = ['weekly', 'monthly'];
export const isRepeat = (value) => REPEATS.includes(value);

export function nextDue(ymd, repeat) {
  if (repeat === 'weekly') return addDays(ymd, 7);
  if (repeat === 'monthly') return addMonths(ymd, 1);
  throw new Error(`unknown repeat: ${repeat}`);
}

export function nextTask(task, now = new Date()) {
  return {
    id: newId(now),
    slug: task.slug,
    title: task.title,
    due: nextDue(task.due, task.repeat),
    time: task.time ?? null,
    done: false,
    doneAt: null,
    source: task.source ?? 'manual',
    stage: null,
    questionnaire: null,
    payment: null,
    agreement: null,
    notes: task.notes ?? '',
    project: task.project ?? null,
    repeat: task.repeat,
    createdAt: now.toISOString(),
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node --test netlify/functions/lib/office/recurrence.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/recurrence.mjs netlify/functions/lib/office/recurrence.test.mjs
git commit -m "Add task recurrence module"
```

---

### Task 4: Task action learns own tasks, project and repeat

**Files:**
- Modify: `netlify/functions/lib/office/actions/task.mjs`
- Test: `netlify/functions/lib/office/actions/task.test.mjs`

**Interfaces:**
- Consumes: `OWN_SLUG` from `../clients.mjs`; `isRepeat`, `nextTask` from `../recurrence.mjs`.
- Produces: the form contract every page posts against.
  - `slug` may be `office`; then no client lookup happens and the default `back` is `/office/tasks/`.
  - `op=add` also reads `project` (trimmed text, stored as null when empty) and `repeat` (`weekly`, `monthly` or empty for null; any other value is 400 `repeat must be weekly or monthly`).
  - `op=reschedule` reads `due`, `time` and, when the field is present in the form, `repeat` (same validation). A form that omits `repeat` leaves it unchanged, so the calendar's Move sheet and the client page's stay valid.
  - `op=done` on a task with a repeat writes the finished task and then a new task from `nextTask`. A task already done is written again unchanged and creates nothing.
  - Every task document written by `add` carries `project` and `repeat`.

- [ ] **Step 1: Write the failing tests**

Append to `task.test.mjs`:

```js
test('own tasks live under the office slug without a client', async () => {
  const s = await make();
  const res = await task(post({ csrf, op: 'add', slug: 'office', title: 'Referral outreach', due: '2026-09-15', project: 'Referral program' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/tasks/');
  const [t] = await s.tasks.list('office');
  assert.equal(t.slug, 'office');
  assert.equal(t.project, 'Referral program');
  assert.equal(t.repeat, null);
  assert.equal(await s.clients.get('office'), null);
});

test('add stores project and repeat on client tasks too, and rejects a bad repeat', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'lova', title: 'Check in', due: '2026-09-15', repeat: 'monthly' }), ctx(), s);
  const [t] = await s.tasks.list('lova');
  assert.equal(t.project, null);
  assert.equal(t.repeat, 'monthly');
  const res = await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-15', repeat: 'daily' }), ctx(), s);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /repeat/);
});

test('done on a repeating task creates the next one, once', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'office', title: 'Invoices', due: '2026-09-30', time: '10:00', repeat: 'monthly', project: 'Admin' }), ctx(), s);
  const [{ id }] = await s.tasks.list('office');
  const at = new Date('2026-10-02T00:00:00Z');
  await task(post({ csrf, op: 'done', slug: 'office', id }), ctx(), s, at);
  let all = (await s.tasks.list('office')).sort((a, b) => a.due.localeCompare(b.due));
  assert.equal(all.length, 2);
  assert.equal(all[0].done, true);
  assert.equal(all[1].due, '2026-10-30');
  assert.equal(all[1].time, '10:00');
  assert.equal(all[1].project, 'Admin');
  assert.equal(all[1].repeat, 'monthly');
  assert.equal(all[1].done, false);
  await task(post({ csrf, op: 'done', slug: 'office', id }), ctx(), s, at);
  all = await s.tasks.list('office');
  assert.equal(all.length, 2);
});

test('reschedule changes repeat only when the form sends it', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'office', title: 'x', due: '2026-09-15', repeat: 'weekly' }), ctx(), s);
  const [{ id }] = await s.tasks.list('office');
  await task(post({ csrf, op: 'reschedule', slug: 'office', id, due: '2026-09-16', time: '' }), ctx(), s);
  assert.equal((await s.tasks.get('office', id)).repeat, 'weekly');
  await task(post({ csrf, op: 'reschedule', slug: 'office', id, due: '2026-09-16', time: '', repeat: '' }), ctx(), s);
  assert.equal((await s.tasks.get('office', id)).repeat, null);
  const res = await task(post({ csrf, op: 'reschedule', slug: 'office', id, due: '2026-09-16', time: '', repeat: 'yearly' }), ctx(), s);
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test netlify/functions/lib/office/actions/task.test.mjs`
Expected: the four new tests FAIL (404 no such client; `project` undefined).

- [ ] **Step 3: Implement**

Replace `task.mjs` with:

```js
import { readForm, redirect, problem, field, checkCsrf, safeNext, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { newId, ID } from '../ids.mjs';
import { isYmd, isHhmm } from '../dates.mjs';
import { OWN_SLUG } from '../clients.mjs';
import { isRepeat, nextTask } from '../recurrence.mjs';

const when = (data) => {
  const due = field(data, 'due');
  const time = field(data, 'time');
  if (!isYmd(due)) return { error: 'due must be a date' };
  if (time && !isHhmm(time)) return { error: 'time must be HH:MM' };
  return { due, time: time || null };
};

// An empty select means "does not repeat"; anything but the two words is a
// form we did not write.
const repeatOf = (data) => {
  const value = field(data, 'repeat');
  if (!value) return { repeat: null };
  if (!isRepeat(value)) return { error: 'repeat must be weekly or monthly' };
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
  if (!own && !(await s.clients.get(slug))) return problem(404, 'no such client');
  // A `back` that safeNext would rewrite is one we did not issue; fall to
  // the task's own page rather than the dashboard.
  const back = field(data, 'back');
  const home = own ? '/office/tasks/' : `/office/clients/${slug}/?tab=tasks`;
  const to = safeNext(back) === back ? back : home;
  const op = field(data, 'op');
  const at = now.toISOString();

  if (op === 'add') {
    const title = field(data, 'title');
    if (!title) return problem(400, 'title is required');
    const w = when(data);
    if (w.error) return problem(400, w.error);
    const r = repeatOf(data);
    if (r.error) return problem(400, r.error);
    const id = newId(now);
    await s.tasks.put(slug, id, {
      id, slug, title, due: w.due, time: w.time, done: false, doneAt: null,
      source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null,
      notes: field(data, 'notes'), project: field(data, 'project') || null, repeat: r.repeat, createdAt: at,
    });
    return redirect(to);
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.tasks.get(slug, id);
  if (!existing) return problem(404, 'no such task');

  if (op === 'done') {
    // A replayed Done finds the task already done and must not add a
    // second next task; the chain grows only on the open-to-done edge.
    const spawn = !existing.done && isRepeat(existing.repeat);
    await s.tasks.put(slug, id, { ...existing, done: true, doneAt: at });
    if (spawn) {
      const next = nextTask(existing, now);
      await s.tasks.put(slug, next.id, next);
    }
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
```

Check `readForm` in `http.mjs` returns a `FormData` (it does: `data.get` is used by `field`), so `data.has('repeat')` is valid.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/actions/task.test.mjs`
Expected: PASS, all eight tests.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/task.mjs netlify/functions/lib/office/actions/task.test.mjs
git commit -m "Let tasks stand alone, group and repeat"
```

---

### Task 5: Digest names own tasks

**Files:**
- Modify: `netlify/functions/lib/office/digest.mjs:14-16`
- Test: `netlify/functions/lib/office/digest.test.mjs`

**Interfaces:**
- Consumes: `OWN_SLUG` from `./clients.mjs`.
- Produces: digest lines for own tasks read `Office: <title>`; a task with a project reads `Office, <project>: <title>`.

- [ ] **Step 1: Write the failing test**

Append to `digest.test.mjs`:

```js
test('own tasks are named Office, with their project when they have one', () => {
  const tasks = [
    t('office', today, { title: 'Send invoices', project: 'Admin' }),
    t('office', today, { title: 'Read the mail' }),
  ];
  const d = buildDigest({ clients, tasks, meetings: [], submitted: new Set(), today, now });
  assert.match(d.text, /- Office, Admin: Send invoices/);
  assert.match(d.text, /- Office: Read the mail/);
  assert.doesNotMatch(d.text, /- office:/);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/digest.test.mjs`
Expected: FAIL, the line reads `office: Send invoices`.

- [ ] **Step 3: Implement**

In `digest.mjs`, import `OWN_SLUG` from `./clients.mjs` and replace the `who` line:

```js
const who = (doc) => (doc.slug === OWN_SLUG
  ? `Office${doc.project ? `, ${doc.project}` : ''}`
  : name.get(doc.slug) ?? doc.slug);
```

Then change every `who(x.slug)` call in `buildDigest` to `who(x)` (task lines, meeting lines, waiting, failed, unsigned). Meetings, payments and agreements have no `project`, so they read as before.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/digest.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/digest.mjs netlify/functions/lib/office/digest.test.mjs
git commit -m "Name own tasks in the digest"
```

---

### Task 6: Task row shows project and repeat

**Files:**
- Modify: `src/components/office/TaskRow.astro`

**Interfaces:**
- Consumes: task documents with `project` and `repeat` (possibly undefined on old documents); `OWN_SLUG`, `REPEATS`.
- Produces: with `showClient`, an own task shows its project label (or "Office") in the client column, unlinked; a client task shows the linked business as today. The meta shows `· weekly` or `· monthly` when set. The Move sheet gains a `repeat` select that always posts, so `reschedule` from a row always carries it.

- [ ] **Step 1: Implement**

Replace the frontmatter and the two affected spans in `TaskRow.astro`:

```astro
---
import { formatYmd, formatTime } from '../../../netlify/functions/lib/office/dates.mjs';
import { relative, nudge } from '../../../netlify/functions/lib/office/attention.mjs';
import { OWN_SLUG } from '../../../netlify/functions/lib/office/clients.mjs';
import { REPEATS } from '../../../netlify/functions/lib/office/recurrence.mjs';
interface Props { task: any; csrf: string; today: string; back: string; showClient?: boolean; business?: string; stageNames?: Record<string, string> }
const { task: t, csrf, today, back, showClient = false, business = '', stageNames = {} } = Astro.props;
const late = !t.done && t.due < today;
const chase = t.done ? null : nudge(t);
const own = t.slug === OWN_SLUG;
const repeat: string | null = t.repeat ?? null;
---
```

In the `.what` span:

```astro
  <span class="what">
    {showClient && own && <span class="client">{t.project || 'Office'}</span>}
    {showClient && !own && <><a class="client" href={`/office/clients/${t.slug}/`}>{business || t.slug}</a> </>}
    <span class="title">{t.title}</span>
    {t.source === 'pipeline' && t.stage && <span class="meta"> · {stageNames[t.stage] ?? t.stage}</span>}
    {repeat && <span class="meta"> · {repeat}</span>}
  </span>
```

In the Move sheet, after the Time field:

```astro
        <label class="field"><span>Repeat</span>
          <select name="repeat">
            <option value="" selected={!repeat}>Does not repeat</option>
            {REPEATS.map((r) => <option value={r} selected={repeat === r}>{r}</option>)}
          </select>
        </label>
```

`src/styles/office.css:311` styles `.ledger .client` by class, so the unlinked span reads at the same weight as the anchor with no CSS change.

- [ ] **Step 2: Type-check and gate the forms**

Run: `npm run check && npm run check:office`
Expected: both clean. The check-office form rule sees `repeat` once per form.

- [ ] **Step 3: Commit**

```bash
git add src/components/office/TaskRow.astro
git commit -m "Show project and repeat on task rows"
```

---

### Task 7: The Tasks page and its nav item

**Files:**
- Create: `src/pages/office/tasks.astro`
- Modify: `src/layouts/OfficeLayout.astro:10-16`

**Interfaces:**
- Consumes: `store().tasks.list(OWN_SLUG)`, `TaskRow`, `todayIn`, `REPEATS`.
- Produces: `/office/tasks/`. Add form posts `op=add`, `slug=office`, `back=/office/tasks/`, `title`, `due`, `time`, `project`, `repeat`, `notes`. Open tasks grouped by project, groups sorted by name with the unlabelled group last under the heading "No project"; tasks within a group by due then time. A fold "Done" with the last twenty done tasks, newest done first.

- [ ] **Step 1: Write the page**

`src/pages/office/tasks.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../layouts/OfficeLayout.astro';
import TaskRow from '../../components/office/TaskRow.astro';
import { store } from '../../../netlify/functions/lib/office/store.mjs';
import { todayIn } from '../../../netlify/functions/lib/office/dates.mjs';
import { OWN_SLUG } from '../../../netlify/functions/lib/office/clients.mjs';
import { REPEATS } from '../../../netlify/functions/lib/office/recurrence.mjs';

// store.mjs has no type declarations, so astro check sees list() as any;
// this narrows it to what the page reads.
type Task = { id: string; slug: string; title: string; due: string; time: string | null; done: boolean; doneAt: string | null; project: string | null; repeat: string | null };

const s = store();
const today = todayIn();
const here = '/office/tasks/';
const csrf = Astro.locals.csrf;
const all = (await s.tasks.list(OWN_SLUG)) as Task[];
const byDue = (a: Task, b: Task) => a.due.localeCompare(b.due) || (a.time ?? '').localeCompare(b.time ?? '');
const open = all.filter((t) => !t.done).sort(byDue);
const done = all.filter((t) => t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 20);
const groups = new Map<string, Task[]>();
for (const t of open) {
  const key = t.project ?? '';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(t);
}
// Named projects alphabetically, the unlabelled tasks last.
const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
const late = open.filter((t) => t.due < today).length;
---
<OfficeLayout title="Tasks">
  <div class="page-head">
    <h1>Tasks</h1>
    <span class="sub">Business work with no client behind it.{open.length > 0 && ` ${open.length} open${late ? `, ${late} late` : ''}.`}</span>
  </div>

  <form method="POST" action="/office/api/task" class="sheet">
    <input type="hidden" name="csrf" value={csrf} />
    <input type="hidden" name="op" value="add" />
    <input type="hidden" name="slug" value={OWN_SLUG} />
    <input type="hidden" name="back" value={here} />
    <div class="row">
      <label class="field"><span>Task</span><input name="title" required /></label>
      <label class="field"><span>Project</span><input name="project" placeholder="Referral program" /></label>
      <label class="field"><span>Due</span><input type="date" name="due" value={today} required /></label>
      <label class="field"><span>Time</span><input type="time" name="time" /></label>
      <label class="field"><span>Repeat</span>
        <select name="repeat">
          <option value="">Does not repeat</option>
          {REPEATS.map((r) => <option value={r}>{r}</option>)}
        </select>
      </label>
    </div>
    <label class="field"><span>Notes</span><textarea name="notes" rows="2"></textarea></label>
    <div class="form-foot"><button type="submit" class="btn">Add task</button></div>
  </form>

  {open.length === 0 && <p class="empty">Nothing open.</p>}
  {ordered.map(([project, tasks]) => (
    <>
      <h2>{project || 'No project'} <span class="count">{tasks.length}</span></h2>
      <ul class="ledger">{tasks.map((t) => <TaskRow task={t} csrf={csrf} today={today} back={here} />)}</ul>
    </>
  ))}

  {done.length > 0 && (
    <details class="fold">
      <summary>Done<span class="sub">last {done.length}</span></summary>
      <div class="fold-body"><ul class="ledger">{done.map((t) => <TaskRow task={t} csrf={csrf} today={today} back={here} />)}</ul></div>
    </details>
  )}
</OfficeLayout>
```

Check `.form-foot` exists in `office.css` (it does, listed in the class inventory); if the sheet's row layout wraps five fields badly at desktop width, put the Repeat select on its own line with the Notes textarea rather than adding CSS.

- [ ] **Step 2: Add the nav item**

In `OfficeLayout.astro`, the `nav` array becomes:

```ts
const nav = [
  { label: 'Today', href: '/office/' },
  { label: 'Clients', href: '/office/clients/' },
  { label: 'Tasks', href: '/office/tasks/' },
  { label: 'Calendar', href: '/office/calendar/' },
  { label: 'Settings', href: '/office/settings/' },
  { label: 'Data', href: '/office/data/' },
];
```

- [ ] **Step 3: Check and look at it**

Run: `npm run check && npm run check:office`
Expected: clean.

Then, with the local harness from `README.md` "Local development" (`KEEPSITE_SESSION_SECRET=dev KEEPSITE_TOKEN_SECRET=x npm run dev:office`), open `/office/tasks/`, add a weekly task with a project, tick it done, and confirm the next one appears a week later in the same group and the done one sits in the fold. Under WSL on `/mnt/c` restart the dev server after each edit.

- [ ] **Step 4: Commit**

```bash
git add src/pages/office/tasks.astro src/layouts/OfficeLayout.astro
git commit -m "Add the own-tasks page"
```

---

### Task 8: Own tasks on Today and the Calendar

**Files:**
- Modify: `src/pages/office/calendar.astro:66-75`
- Modify: `src/pages/office/index.astro` (no code change expected; verify)

**Interfaces:**
- Consumes: `OWN_SLUG`.
- Produces: the calendar's "Add a task for this day" select offers "Office (no client)" first, value `office`. Today's "On you" already includes own tasks through `splitOpen`, and Task 6 renders them; the empty-clients branch on Today hides every list, which is acceptable because a business with no clients has the Tasks page.

- [ ] **Step 1: Change the calendar select**

In `calendar.astro`, import `OWN_SLUG` from `../../../netlify/functions/lib/office/clients.mjs` and make the select:

```astro
        <select name="slug" aria-label="Client" required>
          <option value={OWN_SLUG}>Office (no client)</option>
          {clients.map((c) => <option value={c.slug}>{c.business}</option>)}
        </select>
```

- [ ] **Step 2: Verify Today**

Open `/office/` with at least one client and one own task due today. Expected: the own task appears under "On you" with its project label where the client name goes, and Move works from that row (its `back` is `/office/`).

- [ ] **Step 3: Gate**

Run: `npm run gate`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/office/calendar.astro
git commit -m "Add own tasks from the calendar"
```

---

### Task 9: README

**Files:**
- Modify: `README.md` (after the "### Meetings" section of "## The office")

- [ ] **Step 1: Write the section**

Insert:

```markdown
### Own tasks

Work that belongs to the business and not to a client: business
development, admin, projects. They live on `/office/tasks/`, grouped by
a free-text project label, and show up on Today and the Calendar like
any other task, with the project where the client name would be. The
calendar's add form has an "Office (no client)" choice for them.

A task can repeat weekly or monthly. Marking it done creates the next
one, dated from the one just finished, on the same day of the month
clamped to a shorter month's end. Reopening a done task does not remove
the next one; delete it if it was a mistake.

In the store these are ordinary task documents under the reserved slug
`office`, so the export, the digest and the calendar need nothing
special. No client can be created at that slug.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document own tasks"
```
