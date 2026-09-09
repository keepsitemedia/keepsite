# Client Office Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 of the client office: an admin login on keepsitemedia.com with client records, a per-product pipeline that creates tasks, a calendar, a dashboard, each client's questionnaire submissions, an inquiry hook, and a data export page.

**Architecture:** The existing static Astro site gains the Netlify adapter; pages under `src/pages/office/` opt out of prerendering and render per request behind an Astro middleware guard backed by Netlify Identity. Form actions post to one Astro endpoint, `/office/api/{action}`, which dispatches to plain `(Request) => Response` handler modules under `netlify/functions/lib/office/`, tested under `node --test` like the questionnaire function. All data is JSON documents in one Netlify Blobs store behind a single storage module with a file-backed local mode.

**Tech Stack:** Astro 5.18 (`output: 'static'` plus `@astrojs/netlify@^6.6.5`), `@netlify/blobs`, Netlify Identity (GoTrue endpoints, no widget), `node --test`, no client-side framework, no third-party scripts.

**Spec:** `docs/superpowers/specs/2026-09-04-client-office-design.md` (sections Routes and rendering, Auth, Data model, Pipelines and tasks, Calendar, Documents (Questionnaires tab only), Secrets, Phases (1), Testing).

## Global Constraints

- Node 20 (`netlify.toml` pins `NODE_VERSION = "20"`); no TypeScript in `netlify/functions/`, `.mjs` only, so `node --test` runs it directly.
- `@astrojs/netlify` must be a 6.x release; 7.x and 8.x require Astro 6 and 7.
- Slugs match `/^[a-z0-9][a-z0-9-]{0,63}$/`, the regex in `netlify/functions/questionnaire.mjs`.
- Every office page exports `prerender = false`, except `/office/login/`, which is prerendered.
- No third-party script or stylesheet anywhere. The `/*` Content-Security-Policy in `netlify.toml` is the policy office responses must carry too.
- Office responses carry `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`.
- Secrets fail closed: a missing `KEEPSITE_SESSION_SECRET` refuses every CSRF check; a missing Identity answer refuses login.
- Cookies: `HttpOnly; Secure; SameSite=Strict; Path=/`.
- Dates that are days are `YYYY-MM-DD` strings; "today" is computed in `America/Denver`.
- One writer per key (spec, Data model). In phase 1 the admin writes everything, and the questionnaire function flips `done` on the one task it owns.
- Comments explain why, never what. Commit subjects imperative, under 50 characters.
- `npm run gate` (check, check:forms, build, verify) must pass at the end of every task that touches `src/` or `netlify.toml`.

## File structure

New files, one responsibility each:

```
netlify/functions/lib/office/
  ids.mjs            newId(): time-prefixed, collision-safe ids; ID regex
  dates.mjs          todayIn(), addDays(), isYmd(), formatYmd(); Mountain time
  backends.mjs       memoryBackend(), fileBackend(dir), blobsBackend(name)
  store.mjs          createStore(), store(); typed accessors per document type
  session.mjs        Identity login/refresh/logout, cookies, requireAdmin(), CSRF
  http.mjs           readForm(), redirect(), problem(), checkCsrf()
  pipeline.mjs       validatePipelines(), advance(), stage lookups
  clients.mjs        slugify(), uniqueSlug(), newClient(), validateClient(), applyEdit()
  hooks.mjs          markQuestionnaireDone()
  inquiry.mjs        recordInquiry()
  calendar.mjs       itemsForDay(), monthGrid(), dueBucket()
  csv.mjs            toCsv()
  actions/
    login.mjs, logout.mjs, client.mjs, stage.mjs, task.mjs, settings.mjs, export.mjs
  actions.mjs        the { name: handler } map the endpoint dispatches on
netlify/functions/submission-created.mjs   Netlify form event → recordInquiry()
src/data/office/pipelines.json             seed pipelines
src/middleware.ts                          guard + office headers
src/layouts/OfficeLayout.astro             office chrome and nav
src/styles/office.css                      dense office styles on the site's tokens
src/components/office/                     small render-only pieces
src/pages/office/
  login.astro, index.astro, calendar.astro, settings.astro, data.astro
  clients/index.astro, clients/new.astro, clients/[slug].astro
  api/[action].ts
scripts/check-office.mjs                   structural check of the seed pipelines
```

Modified: `package.json`, `astro.config.mjs`, `netlify.toml`, `public/robots.txt`, `.gitignore`, `src/env.d.ts`, `scripts/verify.mjs`, `netlify/functions/questionnaire.mjs`, `README.md`.

Tests sit beside their module as `*.test.mjs`, the existing convention. `npm test` runs `node --test`, which finds them all.

---

### Task 1: Adapter, config and route plumbing

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`
- Modify: `netlify.toml`
- Modify: `public/robots.txt`
- Modify: `.gitignore`
- Modify: `scripts/verify.mjs`

**Interfaces:**
- Produces: a build that emits an SSR function for any page exporting `prerender = false`, with the marketing pages still static in `dist/`.

- [ ] **Step 1: Install the adapter**

```bash
npm install @astrojs/netlify@^6.6.5
```

Confirm `package.json` shows `"@astrojs/netlify": "^6.6.5"` under `dependencies`. If npm resolved a 7.x or 8.x, it will fail peer resolution against Astro 5; pin `6.6.5` exactly.

- [ ] **Step 2: Add the adapter and sitemap filter**

Replace `astro.config.mjs` with:

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://www.keepsitemedia.com',
  // Static stays the default. Only pages that export `prerender = false`
  // (the office) render per request; the adapter exists for those alone.
  output: 'static',
  adapter: netlify(),
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/start/thanks') &&
        !page.includes('/404') &&
        !page.includes('/questionnaire/') &&
        !page.includes('/office/'),
    }),
  ],
});
```

- [ ] **Step 3: Robots, gitignore, headers**

Add to `public/robots.txt` after the `/questionnaire/` line:

```
Disallow: /office/
```

Add to `.gitignore`:

```
.netlify/
.office-data/
```

Add to `netlify.toml` after the `/questionnaire/*` headers block. This reaches only the prerendered login page; the middleware in Task 5 sets the same on rendered responses, and the comment says so:

```toml
# Only the prerendered login page gets these from here. Netlify applies
# netlify.toml headers to static files alone, so every server-rendered
# office response sets its own copy in src/middleware.ts.
[[headers]]
  for = "/office/*"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
    Cache-Control = "private, no-store"
```

- [ ] **Step 4: Extend verify**

In `scripts/verify.mjs`, in the `Routes` section, add:

```js
check('office is disallowed and unlisted', () => {
  const robots = read('robots.txt');
  if (!robots.includes('Disallow: /office/')) throw new Error('robots.txt lacks /office/');
  if (read('sitemap-0.xml').includes('/office/')) throw new Error('office in sitemap');
  // Rendered pages never land in dist/; if one does, it was prerendered by mistake
  // and would be served to anyone.
  for (const p of ['office/index.html', 'office/clients/index.html', 'office/calendar/index.html']) {
    if (fs.existsSync(path.join('dist', p))) throw new Error('prerendered office page: ' + p);
  }
});
```

- [ ] **Step 5: Build and verify**

Run: `npm run gate`
Expected: passes. `dist/` still holds every marketing page. Netlify's build output directory `.netlify/` now exists; it is ignored.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json astro.config.mjs netlify.toml public/robots.txt .gitignore scripts/verify.mjs
git commit -m "Add the Netlify adapter for office routes"
```

---

### Task 2: Ids and dates

**Files:**
- Create: `netlify/functions/lib/office/ids.mjs`
- Create: `netlify/functions/lib/office/ids.test.mjs`
- Create: `netlify/functions/lib/office/dates.mjs`
- Create: `netlify/functions/lib/office/dates.test.mjs`

**Interfaces:**
- Produces: `newId(now?: Date): string`, `ID: RegExp`; `TZ`, `todayIn(tz?, now?): 'YYYY-MM-DD'`, `addDays(ymd, n): ymd`, `isYmd(s): boolean`, `isHhmm(s): boolean`, `formatYmd(ymd): string` (e.g. `Fri, Sep 4`), `formatTime(hhmm): string` (e.g. `2:30 pm`).

- [ ] **Step 1: Failing tests for ids**

`netlify/functions/lib/office/ids.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId, ID } from './ids.mjs';

test('an id starts with the creation second and matches ID', () => {
  const id = newId(new Date('2026-09-04T15:01:02.007Z'));
  assert.ok(id.startsWith('20260904T150102'));
  assert.match(id, ID);
});

test('two ids minted in the same second differ', () => {
  const now = new Date('2026-09-04T15:01:02.007Z');
  assert.notEqual(newId(now), newId(now));
});

test('ids sort in creation order', () => {
  const a = newId(new Date('2026-09-04T15:01:02Z'));
  const b = newId(new Date('2026-09-04T15:01:03Z'));
  assert.ok(a < b);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/ids.test.mjs`
Expected: FAIL, cannot find module `./ids.mjs`.

- [ ] **Step 3: Implement ids**

`netlify/functions/lib/office/ids.mjs`:

```js
// Ids sort by creation time because Blobs lists keys in byte order and the
// office shows every list newest-last. Six random base32 characters after the
// second keep two writes in the same second apart.
import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const ID = /^[0-9]{8}T[0-9]{6}[a-z2-7]{6}$/;

export function newId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  let rand = '';
  for (const b of randomBytes(6)) rand += ALPHABET[b % 32];
  return `${stamp}${rand}`;
}
```

- [ ] **Step 4: Run ids tests**

Run: `node --test netlify/functions/lib/office/ids.test.mjs`
Expected: 3 passing.

- [ ] **Step 5: Failing tests for dates**

`netlify/functions/lib/office/dates.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayIn, addDays, isYmd, formatYmd, formatTime } from './dates.mjs';

test('todayIn reports the Mountain date, not the UTC one', () => {
  // 05:30 UTC on the 5th is still 23:30 on the 4th in Denver.
  assert.equal(todayIn('America/Denver', new Date('2026-09-05T05:30:00Z')), '2026-09-04');
});

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-09-28', 5), '2026-10-03');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('isYmd accepts real dates only', () => {
  assert.ok(isYmd('2026-09-04'));
  assert.ok(!isYmd('2026-9-4'));
  assert.ok(!isYmd('2026-13-01'));
  assert.ok(!isYmd(''));
  assert.ok(!isYmd(undefined));
});

test('formatYmd and formatTime read like a calendar', () => {
  assert.equal(formatYmd('2026-09-04'), 'Fri, Sep 4');
  assert.equal(formatTime('14:30'), '2:30 pm');
  assert.equal(formatTime('09:05'), '9:05 am');
});
```

- [ ] **Step 6: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/dates.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 7: Implement dates**

`netlify/functions/lib/office/dates.mjs`:

```js
// Day-granular dates are plain YYYY-MM-DD strings: they compare with <, they
// survive JSON, and they carry no zone to get wrong. The only place a zone
// matters is deciding what "today" is, and that is always Mountain time.
export const TZ = 'America/Denver';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function todayIn(tz = TZ, now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

const parts = (ymd) => ymd.split('-').map(Number);

export function addDays(ymd, n) {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isYmd(s) {
  if (typeof s !== 'string' || !YMD.test(s)) return false;
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export const isHhmm = (s) => typeof s === 'string' && HHMM.test(s);

export function formatYmd(ymd) {
  const [y, m, d] = parts(ymd);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
```

- [ ] **Step 8: Run dates tests**

Run: `node --test netlify/functions/lib/office/dates.test.mjs`
Expected: 4 passing.

- [ ] **Step 9: Commit**

```bash
git add netlify/functions/lib/office/ids.mjs netlify/functions/lib/office/ids.test.mjs netlify/functions/lib/office/dates.mjs netlify/functions/lib/office/dates.test.mjs
git commit -m "Add office id and date helpers"
```

---

### Task 3: Storage backends and the store module

**Files:**
- Create: `netlify/functions/lib/office/backends.mjs`
- Create: `netlify/functions/lib/office/backends.test.mjs`
- Create: `netlify/functions/lib/office/store.mjs`
- Create: `netlify/functions/lib/office/store.test.mjs`

**Interfaces:**
- Consumes: `ID` from `ids.mjs`.
- Produces: a backend is `{ getText(key): Promise<string|null>, setText(key, text): Promise<void>, list(prefix): Promise<string[]>, remove(key): Promise<void> }`. `createStore({ office, questionnaires })` returns:
  - `clients.get(slug)`, `clients.put(slug, doc)`, `clients.list()`, `clients.remove(slug)`
  - `tasks|meetings|payments|agreements|emails` each with `get(slug, id)`, `put(slug, id, doc)`, `remove(slug, id)`, `list(slug)`, `listAll()`
  - `settings.get(name)`, `settings.put(name, doc)`
  - `questionnaires.get(slug, form)`, `questionnaires.files(slug)` (keys under the slug that are not `.json`)
  - `counts()` → `{ clients, tasks, meetings, payments, agreements, emails }`
  - `store()` returns a process-wide instance chosen by `OFFICE_STORE_DIR`.
  - `SLUG`, `assertSlug(slug)`.

- [ ] **Step 1: Failing backend tests**

`netlify/functions/lib/office/backends.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { memoryBackend, fileBackend } from './backends.mjs';

// Both local backends must behave identically; Blobs is not testable here.
for (const [name, make] of [
  ['memory', async () => memoryBackend()],
  ['file', async () => fileBackend(await fs.mkdtemp(path.join(os.tmpdir(), 'office-')))],
]) {
  test(`${name}: round-trips text and lists by prefix in key order`, async () => {
    const b = await make();
    assert.equal(await b.getText('clients/a.json'), null);
    await b.setText('clients/b.json', 'B');
    await b.setText('clients/a.json', 'A');
    await b.setText('tasks/a/1.json', 'T');
    assert.equal(await b.getText('clients/a.json'), 'A');
    assert.deepEqual(await b.list('clients/'), ['clients/a.json', 'clients/b.json']);
    assert.deepEqual(await b.list('nothing/'), []);
    await b.remove('clients/a.json');
    assert.equal(await b.getText('clients/a.json'), null);
    await b.remove('clients/never.json');
  });
}
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/backends.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement backends**

`netlify/functions/lib/office/backends.mjs`:

```js
// Three backends behind one four-method shape. Blobs is the real one; the
// file backend lets `astro dev` run without the Netlify CLI, and memory keeps
// tests free of disk and network. Text only for now: phase 5 adds bytes for
// uploads, and nothing in phase 1 needs them.
import fs from 'node:fs/promises';
import path from 'node:path';

export function memoryBackend() {
  const map = new Map();
  return {
    async getText(key) { return map.has(key) ? map.get(key) : null; },
    async setText(key, text) { map.set(key, text); },
    async list(prefix) { return [...map.keys()].filter((k) => k.startsWith(prefix)).sort(); },
    async remove(key) { map.delete(key); },
  };
}

export function fileBackend(dir) {
  const file = (key) => path.join(dir, key);
  async function walk(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const out = [];
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
    return out;
  }
  return {
    async getText(key) {
      try { return await fs.readFile(file(key), 'utf8'); } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async setText(key, text) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), text);
    },
    async list(prefix) { return (await walk(dir)).filter((k) => k.startsWith(prefix)).sort(); },
    async remove(key) { await fs.rm(file(key), { force: true }); },
  };
}

export function blobsBackend(name) {
  let store;
  // Imported lazily so a test process that never touches Blobs never loads it.
  const open = async () => (store ??= (await import('@netlify/blobs')).getStore(name));
  return {
    async getText(key) { return (await (await open()).get(key)) ?? null; },
    async setText(key, text) { await (await open()).set(key, text); },
    async list(prefix) {
      const { blobs } = await (await open()).list({ prefix });
      return blobs.map((b) => b.key).sort();
    },
    async remove(key) { await (await open()).delete(key); },
  };
}
```

- [ ] **Step 4: Run backend tests**

Run: `node --test netlify/functions/lib/office/backends.test.mjs`
Expected: 2 passing.

- [ ] **Step 5: Failing store tests**

`netlify/functions/lib/office/store.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryBackend } from './backends.mjs';
import { createStore, assertSlug } from './store.mjs';
import { newId } from './ids.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });

test('clients round-trip and list', async () => {
  const s = make();
  await s.clients.put('lova', { slug: 'lova', business: 'Lova' });
  await s.clients.put('acme', { slug: 'acme', business: 'Acme' });
  assert.deepEqual(await s.clients.get('lova'), { slug: 'lova', business: 'Lova' });
  assert.equal(await s.clients.get('none'), null);
  assert.deepEqual((await s.clients.list()).map((c) => c.slug), ['acme', 'lova']);
});

test('per-client documents list by client and in creation order', async () => {
  const s = make();
  const a = newId(new Date('2026-09-04T10:00:00Z'));
  const b = newId(new Date('2026-09-04T10:00:01Z'));
  await s.tasks.put('lova', b, { id: b, title: 'second' });
  await s.tasks.put('lova', a, { id: a, title: 'first' });
  await s.tasks.put('acme', a, { id: a, title: 'other' });
  assert.deepEqual((await s.tasks.list('lova')).map((t) => t.title), ['first', 'second']);
  assert.equal((await s.tasks.listAll()).length, 3);
  await s.tasks.remove('lova', a);
  assert.equal((await s.tasks.list('lova')).length, 1);
});

test('a bad slug or id is refused before any backend call', async () => {
  const s = make();
  await assert.rejects(() => s.clients.get('Bad Slug'), /bad slug/);
  await assert.rejects(() => s.tasks.put('lova', '../x', {}), /bad id/);
  assert.throws(() => assertSlug('../etc'), /bad slug/);
});

test('settings and questionnaires read from their own places', async () => {
  const q = memoryBackend();
  await q.setText('lova/intro.json', JSON.stringify({ form: 'intro', answers: {} }));
  await q.setText('lova/logo-mark.png', 'bytes');
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  assert.equal(await s.settings.get('pipelines'), null);
  await s.settings.put('pipelines', [{ id: 'website' }]);
  assert.deepEqual(await s.settings.get('pipelines'), [{ id: 'website' }]);
  assert.equal((await s.questionnaires.get('lova', 'intro')).form, 'intro');
  assert.equal(await s.questionnaires.get('lova', 'brand'), null);
  assert.deepEqual(await s.questionnaires.files('lova'), ['lova/logo-mark.png']);
  await assert.rejects(() => s.settings.get('../x'), /bad setting/);
  await assert.rejects(() => s.questionnaires.get('lova', 'x/y'), /bad form/);
});

test('counts every type', async () => {
  const s = make();
  await s.clients.put('lova', { slug: 'lova' });
  await s.tasks.put('lova', newId(), { title: 't' });
  assert.deepEqual(await s.counts(), { clients: 1, tasks: 1, meetings: 0, payments: 0, agreements: 0, emails: 0 });
});
```

- [ ] **Step 6: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/store.test.mjs`
Expected: FAIL, cannot find module `./store.mjs`.

- [ ] **Step 7: Implement the store**

`netlify/functions/lib/office/store.mjs`:

```js
// The only office module that knows what a key looks like. Pages and actions
// call these accessors and nothing lower, so moving to a database later is a
// rewrite of this file and no other.
import { memoryBackend, fileBackend, blobsBackend } from './backends.mjs';
import { ID } from './ids.mjs';

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SETTING = /^[a-z]+$/;
const FORM = /^[a-z]+$/;

export function assertSlug(slug) {
  if (!SLUG.test(String(slug))) throw new Error(`bad slug: ${slug}`);
  return slug;
}
const assertId = (id) => {
  if (!ID.test(String(id))) throw new Error(`bad id: ${id}`);
  return id;
};
const assertName = (re, what) => (v) => {
  if (!re.test(String(v))) throw new Error(`bad ${what}: ${v}`);
  return v;
};
const assertSetting = assertName(SETTING, 'setting');
const assertForm = assertName(FORM, 'form');

async function readJSON(backend, key) {
  const text = await backend.getText(key);
  return text == null ? null : JSON.parse(text);
}
const writeJSON = (backend, key, doc) => backend.setText(key, JSON.stringify(doc, null, 2));
const readAll = async (backend, prefix) =>
  Promise.all((await backend.list(prefix)).map((k) => readJSON(backend, k)));

function perClient(backend, type) {
  const key = (slug, id) => `${type}/${assertSlug(slug)}/${assertId(id)}.json`;
  return {
    get: (slug, id) => readJSON(backend, key(slug, id)),
    put: (slug, id, doc) => writeJSON(backend, key(slug, id), doc),
    remove: (slug, id) => backend.remove(key(slug, id)),
    list: (slug) => readAll(backend, `${type}/${assertSlug(slug)}/`),
    listAll: () => readAll(backend, `${type}/`),
    count: async () => (await backend.list(`${type}/`)).length,
  };
}

export const TYPES = ['tasks', 'meetings', 'payments', 'agreements', 'emails'];

export function createStore({ office, questionnaires }) {
  const clientKey = (slug) => `clients/${assertSlug(slug)}.json`;
  const s = {
    clients: {
      get: (slug) => readJSON(office, clientKey(slug)),
      put: (slug, doc) => writeJSON(office, clientKey(slug), doc),
      remove: (slug) => office.remove(clientKey(slug)),
      list: () => readAll(office, 'clients/'),
      count: async () => (await office.list('clients/')).length,
    },
    settings: {
      get: (name) => readJSON(office, `settings/${assertSetting(name)}.json`),
      put: (name, doc) => writeJSON(office, `settings/${assertSetting(name)}.json`, doc),
    },
    questionnaires: {
      get: (slug, form) => readJSON(questionnaires, `${assertSlug(slug)}/${assertForm(form)}.json`),
      files: async (slug) =>
        (await questionnaires.list(`${assertSlug(slug)}/`)).filter((k) => !k.endsWith('.json')),
    },
    async counts() {
      const out = { clients: await s.clients.count() };
      for (const t of TYPES) out[t] = await s[t].count();
      return out;
    },
  };
  for (const t of TYPES) s[t] = perClient(office, t);
  return s;
}

let instance;
export function store() {
  if (instance) return instance;
  const dir = process.env.OFFICE_STORE_DIR;
  instance = dir
    ? createStore({ office: fileBackend(`${dir}/office`), questionnaires: fileBackend(`${dir}/questionnaires`) })
    : createStore({ office: blobsBackend('office'), questionnaires: blobsBackend('questionnaires') });
  return instance;
}
```

- [ ] **Step 8: Run store tests**

Run: `node --test netlify/functions/lib/office/`
Expected: all passing (ids, dates, backends, store).

- [ ] **Step 9: Commit**

```bash
git add netlify/functions/lib/office/backends.mjs netlify/functions/lib/office/backends.test.mjs netlify/functions/lib/office/store.mjs netlify/functions/lib/office/store.test.mjs
git commit -m "Add the office store with file and Blobs backends"
```

---

### Task 4: Session module

**Files:**
- Create: `netlify/functions/lib/office/session.mjs`
- Create: `netlify/functions/lib/office/session.test.mjs`

**Interfaces:**
- Produces:
  - `identityUrl(request): string` — `IDENTITY_URL` env or `<origin>/.netlify/identity`.
  - `login(base, email, password, fetchFn?): Promise<string[]|null>` — Set-Cookie strings, or null.
  - `requireAdmin(request, fetchFn?): Promise<{ ok: true, user: { email }, cookies: string[], csrf: string } | { ok: false, cookies: string[] }>`
  - `logout(request, fetchFn?): Promise<string[]>` — cookies that clear the session.
  - `mintCsrf(secret): string`, `verifyCsrf(secret, cookieValue, fieldValue): boolean`
  - `parseCookies(header): Record<string,string>`
  - `COOKIES = { access: 'ks_access', refresh: 'ks_refresh', csrf: 'ks_csrf' }`

Identity is GoTrue. Endpoints used, all relative to `identityUrl`: `POST /token` (form-encoded `grant_type=password&username&password`, or `grant_type=refresh_token&refresh_token`) returning `{ access_token, refresh_token, expires_in }`; `GET /user` with `Authorization: Bearer` returning the user with `app_metadata.roles`; `POST /logout` with the bearer.

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/session.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  login, requireAdmin, logout, mintCsrf, verifyCsrf, parseCookies, identityUrl, COOKIES,
} from './session.mjs';

const BASE = 'https://site.test/.netlify/identity';
const SECRET = 'session-secret';
const admin = { email: 'me@keepsitemedia.com', app_metadata: { roles: ['admin'] } };
const plain = { email: 'x@example.com', app_metadata: { roles: [] } };

// A scripted Identity: each entry is [url suffix, status, body]. Records calls.
function fakeIdentity(script) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, init });
    const hit = script.find(([suffix]) => url.endsWith(suffix));
    if (!hit) return new Response('nope', { status: 404 });
    const [, status, body] = hit;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchFn, calls };
}

const req = (cookie) =>
  new Request('https://site.test/office/', { headers: cookie ? { cookie } : {} });

const withSecret = async (fn) => {
  process.env.KEEPSITE_SESSION_SECRET = SECRET;
  try { return await fn(); } finally { delete process.env.KEEPSITE_SESSION_SECRET; }
};

test('identityUrl is same-origin unless overridden', () => {
  assert.equal(identityUrl(req()), BASE);
  process.env.IDENTITY_URL = 'https://elsewhere.test/.netlify/identity';
  try { assert.equal(identityUrl(req()), 'https://elsewhere.test/.netlify/identity'); }
  finally { delete process.env.IDENTITY_URL; }
});

test('parseCookies splits a header', () => {
  assert.deepEqual(parseCookies('a=1; ks_access=tok; b=x=y'), { a: '1', ks_access: 'tok', b: 'x=y' });
  assert.deepEqual(parseCookies(null), {});
});

test('login with an admin sets access, refresh and csrf cookies', async () => {
  await withSecret(async () => {
    const { fetchFn, calls } = fakeIdentity([
      ['/token', 200, { access_token: 'A', refresh_token: 'R', expires_in: 3600 }],
      ['/user', 200, admin],
    ]);
    const cookies = await login(BASE, 'me@keepsitemedia.com', 'pw', fetchFn);
    assert.equal(cookies.length, 3);
    assert.match(cookies[0], /^ks_access=A; Max-Age=3600; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
    assert.match(cookies[1], /^ks_refresh=R; /);
    assert.match(cookies[2], /^ks_csrf=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; /);
    assert.equal(calls[0].init.method, 'POST');
    assert.match(String(calls[0].init.body), /grant_type=password/);
  });
});

test('login refuses bad credentials and non-admins', async () => {
  await withSecret(async () => {
    const bad = fakeIdentity([['/token', 401, { error: 'invalid_grant' }]]);
    assert.equal(await login(BASE, 'a', 'b', bad.fetchFn), null);
    const notAdmin = fakeIdentity([
      ['/token', 200, { access_token: 'A', refresh_token: 'R', expires_in: 3600 }],
      ['/user', 200, plain],
    ]);
    assert.equal(await login(BASE, 'x@example.com', 'pw', notAdmin.fetchFn), null);
  });
});

test('requireAdmin passes a valid admin token and reports the csrf cookie', async () => {
  const { fetchFn } = fakeIdentity([['/user', 200, admin]]);
  const r = await requireAdmin(req('ks_access=A; ks_csrf=c.s'), fetchFn);
  assert.equal(r.ok, true);
  assert.equal(r.user.email, admin.email);
  assert.deepEqual(r.cookies, []);
  assert.equal(r.csrf, 'c.s');
});

test('requireAdmin refreshes an expired token and sets new cookies', async () => {
  let userCalls = 0;
  const fetchFn = async (url, init = {}) => {
    if (url.endsWith('/user')) {
      userCalls += 1;
      const ok = init.headers.Authorization === 'Bearer NEW';
      return new Response(JSON.stringify(ok ? admin : {}), { status: ok ? 200 : 401 });
    }
    if (url.endsWith('/token')) {
      assert.match(String(init.body), /grant_type=refresh_token&refresh_token=R/);
      return new Response(JSON.stringify({ access_token: 'NEW', refresh_token: 'R2', expires_in: 3600 }));
    }
    return new Response('', { status: 404 });
  };
  const r = await requireAdmin(req('ks_access=OLD; ks_refresh=R'), fetchFn);
  assert.equal(r.ok, true);
  assert.equal(userCalls, 2);
  assert.match(r.cookies[0], /^ks_access=NEW; /);
  assert.match(r.cookies[1], /^ks_refresh=R2; /);
});

test('requireAdmin refuses when there is no session, a bad refresh, or no admin role', async () => {
  const none = await requireAdmin(req(''), fakeIdentity([]).fetchFn);
  assert.equal(none.ok, false);
  const badRefresh = await requireAdmin(
    req('ks_access=OLD; ks_refresh=R'),
    fakeIdentity([['/user', 401, {}], ['/token', 401, {}]]).fetchFn,
  );
  assert.equal(badRefresh.ok, false);
  assert.match(badRefresh.cookies[0], /^ks_access=; Max-Age=0; /);
  const notAdmin = await requireAdmin(req('ks_access=A'), fakeIdentity([['/user', 200, plain]]).fetchFn);
  assert.equal(notAdmin.ok, false);
});

test('logout clears all three cookies and tells Identity', async () => {
  const { fetchFn, calls } = fakeIdentity([['/logout', 204, {}]]);
  const cookies = await logout(req('ks_access=A; ks_refresh=R'), fetchFn);
  assert.equal(cookies.length, 3);
  assert.ok(cookies.every((c) => c.includes('Max-Age=0')));
  assert.equal(calls[0].init.headers.Authorization, 'Bearer A');
});

test('csrf tokens verify only with the same secret and an exact match', () => {
  const t = mintCsrf(SECRET);
  assert.ok(verifyCsrf(SECRET, t, t));
  assert.ok(!verifyCsrf(SECRET, t, t + 'x'));
  assert.ok(!verifyCsrf('other', t, t));
  assert.ok(!verifyCsrf(SECRET, 'forged.forged', 'forged.forged'));
  assert.ok(!verifyCsrf('', t, t));
  assert.ok(!verifyCsrf(SECRET, '', ''));
});

test('COOKIES names are the ones the middleware and pages use', () => {
  assert.deepEqual(COOKIES, { access: 'ks_access', refresh: 'ks_refresh', csrf: 'ks_csrf' });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/session.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/session.mjs`:

```js
// The whole login: Identity's token endpoint on the way in, its user endpoint
// on every request, and cookies in between. The widget is not used because
// it would need unpkg in the CSP; these three endpoints are same-origin and
// the browser never talks to Identity at all.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIES = { access: 'ks_access', refresh: 'ks_refresh', csrf: 'ks_csrf' };
const HOUR = 3600;
const MONTH = 30 * 86400;

export function identityUrl(request) {
  return process.env.IDENTITY_URL ?? new URL('/.netlify/identity', request.url).href;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const cookie = (name, value, maxAge) =>
  `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
const clear = (name) => cookie(name, '', 0);

async function token(base, params, fetchFn) {
  const res = await fetchFn(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.access_token && body?.refresh_token ? body : null;
}

async function user(base, access, fetchFn) {
  const res = await fetchFn(`${base}/user`, { headers: { Authorization: `Bearer ${access}` } });
  return res.ok ? res.json() : null;
}

const isAdmin = (u) => Array.isArray(u?.app_metadata?.roles) && u.app_metadata.roles.includes('admin');

const sessionCookies = (tok) => [
  cookie(COOKIES.access, tok.access_token, tok.expires_in ?? HOUR),
  cookie(COOKIES.refresh, tok.refresh_token, MONTH),
];

export async function login(base, email, password, fetchFn = fetch) {
  const tok = await token(base, { grant_type: 'password', username: email, password }, fetchFn);
  if (!tok) return null;
  const u = await user(base, tok.access_token, fetchFn);
  if (!isAdmin(u)) return null;
  return [...sessionCookies(tok), cookie(COOKIES.csrf, mintCsrf(process.env.KEEPSITE_SESSION_SECRET), MONTH)];
}

export async function requireAdmin(request, fetchFn = fetch) {
  const base = identityUrl(request);
  const jar = parseCookies(request.headers.get('cookie'));
  const cookies = [];
  let u = jar[COOKIES.access] ? await user(base, jar[COOKIES.access], fetchFn) : null;
  if (!u && jar[COOKIES.refresh]) {
    const tok = await token(base, { grant_type: 'refresh_token', refresh_token: jar[COOKIES.refresh] }, fetchFn);
    if (tok) {
      u = await user(base, tok.access_token, fetchFn);
      if (u) cookies.push(...sessionCookies(tok));
    }
  }
  if (!isAdmin(u)) return { ok: false, cookies: [clear(COOKIES.access), clear(COOKIES.refresh)] };
  return { ok: true, user: { email: u.email }, cookies, csrf: jar[COOKIES.csrf] ?? '' };
}

export async function logout(request, fetchFn = fetch) {
  const jar = parseCookies(request.headers.get('cookie'));
  if (jar[COOKIES.access]) {
    try {
      await fetchFn(`${identityUrl(request)}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jar[COOKIES.access]}` },
      });
    } catch {
      // The cookies clear either way; a failed revoke leaves a token that
      // expires within the hour.
    }
  }
  return [clear(COOKIES.access), clear(COOKIES.refresh), clear(COOKIES.csrf)];
}

// nonce.hmac rather than a bare nonce, so a cookie planted from a sibling
// subdomain does not pass just by echoing itself into the form.
const sign = (secret, nonce) => createHmac('sha256', secret).update(nonce).digest('base64url');

export function mintCsrf(secret) {
  if (!secret) return '';
  const nonce = randomBytes(16).toString('base64url');
  return `${nonce}.${sign(secret, nonce)}`;
}

export function verifyCsrf(secret, cookieValue, fieldValue) {
  if (!secret || !cookieValue || !fieldValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(fieldValue);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [nonce, mac] = cookieValue.split('.');
  if (!nonce || !mac) return false;
  const want = Buffer.from(sign(secret, nonce));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/session.test.mjs`
Expected: 10 passing.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/session.mjs netlify/functions/lib/office/session.test.mjs
git commit -m "Add the office session module"
```

---

### Task 5: Middleware, office layout, login page and the action endpoint

**Files:**
- Create: `netlify/functions/lib/office/http.mjs`
- Create: `netlify/functions/lib/office/http.test.mjs`
- Create: `netlify/functions/lib/office/actions/login.mjs`
- Create: `netlify/functions/lib/office/actions/logout.mjs`
- Create: `netlify/functions/lib/office/actions/login.test.mjs`
- Create: `netlify/functions/lib/office/actions.mjs`
- Create: `src/middleware.ts`
- Modify: `src/env.d.ts`
- Create: `src/styles/office.css`
- Create: `src/layouts/OfficeLayout.astro`
- Create: `src/pages/office/login.astro`
- Create: `src/pages/office/index.astro` (placeholder dashboard; Task 11 fills it)
- Create: `src/pages/office/api/[action].ts`
- Modify: `package.json` (a `dev:office` script)

**Interfaces:**
- Consumes: `session.mjs`.
- Produces:
  - `http.mjs`: `readForm(request): Promise<FormData|null>`, `redirect(to): Response`, `problem(status, text): Response`, `checkCsrf(ctx, data): boolean`, `field(data, name): string` (trimmed string or `''`), `safeNext(value): string`.
  - An action handler is `(request: Request, ctx: { admin: { email } | null, csrf: string }) => Promise<Response>`.
  - `actions.mjs` exports `actions: Record<string, handler>`; later tasks add entries.
  - `App.Locals` has `admin: { email: string } | null` and `csrf: string`.
  - `OfficeLayout` props: `title: string`; slot for content; renders nav and a logout form. Reads `Astro.locals`.

- [ ] **Step 1: Failing http tests**

`netlify/functions/lib/office/http.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readForm, redirect, problem, checkCsrf, field, safeNext } from './http.mjs';
import { mintCsrf } from './session.mjs';

const form = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('http://x/office/api/task', { method: 'POST', body: d });
};

test('readForm returns null for a body that is not a form', async () => {
  assert.equal(await readForm(new Request('http://x/', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })), null);
  const d = await readForm(form({ a: ' 1 ' }));
  assert.equal(field(d, 'a'), '1');
  assert.equal(field(d, 'missing'), '');
});

test('redirect and problem build the expected responses', async () => {
  const r = redirect('/office/');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('Location'), '/office/');
  const p = problem(400, 'no');
  assert.equal(p.status, 400);
  assert.equal(await p.text(), 'no');
});

test('checkCsrf compares the cookie value the guard saw with the form field', async () => {
  process.env.KEEPSITE_SESSION_SECRET = 's';
  try {
    const t = mintCsrf('s');
    assert.ok(checkCsrf({ csrf: t }, await readForm(form({ csrf: t }))));
    assert.ok(!checkCsrf({ csrf: t }, await readForm(form({ csrf: 'other' }))));
    assert.ok(!checkCsrf({ csrf: '' }, await readForm(form({ csrf: '' }))));
  } finally {
    delete process.env.KEEPSITE_SESSION_SECRET;
  }
});

test('safeNext only allows office paths', () => {
  assert.equal(safeNext('/office/clients/'), '/office/clients/');
  assert.equal(safeNext('/office//evil.test'), '/office/');
  assert.equal(safeNext('https://evil.test/office/'), '/office/');
  assert.equal(safeNext('/office/api/logout'), '/office/');
  assert.equal(safeNext(''), '/office/');
  assert.equal(safeNext('/office/x\\evil'), '/office/');
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/http.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement http helpers**

`netlify/functions/lib/office/http.mjs`:

```js
// Shared shape for every office action: a form in, a redirect or a plain-text
// problem out. 303 rather than 302 so a browser always follows with GET and
// a refresh on the landing page never re-posts.
import { verifyCsrf } from './session.mjs';

export async function readForm(request) {
  try { return await request.formData(); } catch { return null; }
}

export const field = (data, name) => {
  const v = data.get(name);
  return typeof v === 'string' ? v.trim() : '';
};

export const redirect = (to) => new Response(null, { status: 303, headers: { Location: to } });

export const problem = (status, text) =>
  new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export const checkCsrf = (ctx, data) =>
  verifyCsrf(process.env.KEEPSITE_SESSION_SECRET, ctx?.csrf ?? '', field(data, 'csrf'));

// Open redirects are the one thing a login `next` can do wrong. Only an
// office page path, and never the api prefix, which would land on a 405.
export function safeNext(value) {
  const s = String(value ?? '');
  const ok = s.startsWith('/office/') && !s.startsWith('/office/api/') && !/[\\]|\/\//.test(s);
  return ok ? s : '/office/';
}
```

- [ ] **Step 4: Run http tests**

Run: `node --test netlify/functions/lib/office/http.test.mjs`
Expected: 4 passing.

- [ ] **Step 5: Failing login action tests**

`netlify/functions/lib/office/actions/login.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login } from './login.mjs';
import { logout } from './logout.mjs';

const admin = { email: 'me@keepsitemedia.com', app_metadata: { roles: ['admin'] } };
const post = (fields, path = '/office/api/login') => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request(`https://site.test${path}`, { method: 'POST', body: d });
};
const identity = (ok) => async (url) => {
  if (url.endsWith('/token')) {
    return ok
      ? new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }))
      : new Response('{}', { status: 401 });
  }
  if (url.endsWith('/user')) return new Response(JSON.stringify(admin));
  return new Response('', { status: 204 });
};

test('login sets cookies and lands on next', async () => {
  process.env.KEEPSITE_SESSION_SECRET = 's';
  try {
    const res = await login(post({ email: 'me@keepsitemedia.com', password: 'pw', next: '/office/calendar/' }), {}, identity(true));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('Location'), '/office/calendar/');
    assert.equal(res.headers.getSetCookie().length, 3);
  } finally {
    delete process.env.KEEPSITE_SESSION_SECRET;
  }
});

test('login failure goes back to the form with a generic flag and no cookies', async () => {
  const res = await login(post({ email: 'a', password: 'b' }), {}, identity(false));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/office/login/?error=1&next=%2Foffice%2F');
  assert.equal(res.headers.getSetCookie().length, 0);
});

test('login refuses non-POST and non-form bodies', async () => {
  assert.equal((await login(new Request('https://site.test/office/api/login'), {})).status, 405);
  const res = await login(new Request('https://site.test/office/api/login', { method: 'POST', body: 'x' }), {});
  assert.equal(res.status, 400);
});

test('logout clears cookies and lands on the login page', async () => {
  const res = await logout(post({}, '/office/api/logout'), { admin: { email: 'x' }, csrf: '' }, identity(true));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/office/login/');
  assert.ok(res.headers.getSetCookie().every((c) => c.includes('Max-Age=0')));
});
```

- [ ] **Step 6: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/actions/login.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 7: Implement login, logout and the action map**

`netlify/functions/lib/office/actions/login.mjs`:

```js
import { readForm, redirect, problem, field, safeNext } from '../http.mjs';
import { login as identityLogin, identityUrl } from '../session.mjs';

// The third argument exists for tests; production always uses global fetch.
export async function login(request, _ctx, fetchFn = fetch) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  const next = safeNext(field(data, 'next'));
  const cookies = await identityLogin(identityUrl(request), field(data, 'email'), field(data, 'password'), fetchFn);
  if (!cookies) return redirect(`/office/login/?error=1&next=${encodeURIComponent(next)}`);
  const res = redirect(next);
  for (const c of cookies) res.headers.append('Set-Cookie', c);
  return res;
}
```

`netlify/functions/lib/office/actions/logout.mjs`:

```js
import { redirect, problem } from '../http.mjs';
import { logout as identityLogout } from '../session.mjs';

// No CSRF check: the worst a forged logout does is log the admin out.
export async function logout(request, _ctx, fetchFn = fetch) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const res = redirect('/office/login/');
  for (const c of await identityLogout(request, fetchFn)) res.headers.append('Set-Cookie', c);
  return res;
}
```

`netlify/functions/lib/office/actions.mjs`:

```js
// The endpoint at src/pages/office/api/[action].ts dispatches on this map.
// Every entry except login runs behind the middleware guard.
import { login } from './actions/login.mjs';
import { logout } from './actions/logout.mjs';

export const actions = { __proto__: null, login, logout };
```

- [ ] **Step 8: Run action tests**

Run: `node --test netlify/functions/lib/office/actions/login.test.mjs`
Expected: 4 passing.

- [ ] **Step 9: Middleware and locals**

`src/env.d.ts`:

```ts
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    admin: { email: string } | null;
    csrf: string;
  }
}
```

`src/middleware.ts`:

```ts
import { defineMiddleware } from 'astro:middleware';
import { requireAdmin } from '../netlify/functions/lib/office/session.mjs';

const OFFICE = /^\/office(\/|$)/;
const PUBLIC = new Set(['/office/login/', '/office/api/login']);

// netlify.toml headers reach static files only, so every rendered office
// response carries its own. The CSP is the "/*" policy from netlify.toml,
// verbatim; keep the two in step.
const HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
};

const withHeaders = (res: Response) => {
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.admin = null;
  context.locals.csrf = '';
  if (!OFFICE.test(pathname)) return next();
  if (PUBLIC.has(pathname)) return withHeaders(await next());

  const auth = await requireAdmin(context.request);
  if (!auth.ok) {
    const res = pathname.startsWith('/office/api/')
      ? new Response('sign in first', { status: 401 })
      : context.redirect(`/office/login/?next=${encodeURIComponent(pathname)}`, 302);
    for (const c of auth.cookies) res.headers.append('Set-Cookie', c);
    return withHeaders(res);
  }
  context.locals.admin = auth.user;
  context.locals.csrf = auth.csrf;
  const res = withHeaders(await next());
  for (const c of auth.cookies) res.headers.append('Set-Cookie', c);
  return res;
});
```

- [ ] **Step 10: Endpoint**

`src/pages/office/api/[action].ts`:

```ts
export const prerender = false;
import type { APIRoute } from 'astro';
import { actions } from '../../../../netlify/functions/lib/office/actions.mjs';

export const ALL: APIRoute = async ({ params, request, locals }) => {
  const handler = actions[params.action ?? ''];
  if (!handler) return new Response('no such action', { status: 404 });
  return handler(request, { admin: locals.admin, csrf: locals.csrf });
};
```

- [ ] **Step 11: Office styles**

`src/styles/office.css`. Built on the tokens in `global.css`; denser than the marketing pages because these are working screens:

```css
/* The office is a working screen, not a marketing page: tighter spacing,
   tabular numbers everywhere, and tables that scroll rather than wrap. */
.office { font-size: var(--step--1); }
.office main { padding: var(--space-3) 0 var(--space-5); }
.office h1 { font-size: var(--step-3); margin: 0 0 var(--space-2); }
.office h2 { font-size: var(--step-1); margin: var(--space-4) 0 var(--space-2); }

.office-header {
  position: sticky; top: 0; z-index: 10;
  background: var(--color-brand-deep); color: var(--color-bg);
}
.office-header .container { display: flex; align-items: center; gap: var(--space-3); padding-top: var(--space-1); padding-bottom: var(--space-1); flex-wrap: wrap; }
.office-header .brand { color: inherit; font-weight: 600; text-decoration: none; }
.office-header nav { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.office-header nav a { color: inherit; text-decoration: none; padding: var(--space-0) var(--space-1); border-radius: 6px; }
.office-header nav a[aria-current="page"] { background: rgba(255,255,255,0.15); }
.office-header .who { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); color: var(--color-brand-tint); }
.office-header .who button { background: none; border: 1px solid currentColor; color: inherit; border-radius: 6px; padding: 0.2rem 0.6rem; cursor: pointer; }

.office table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.office th, .office td { text-align: left; padding: var(--space-1) var(--space-1); border-bottom: 1px solid var(--color-border); vertical-align: top; }
.office th { font-weight: 600; color: var(--color-muted); font-size: 0.85em; }
.office .num { text-align: right; }

.office .toolbar { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; margin-bottom: var(--space-2); }
.office .btn, .office .btn-outline { padding: 0.45rem 0.9rem; font-size: inherit; }
.office .btn-small { padding: 0.2rem 0.6rem; font-size: 0.9em; }
.office form.inline { display: inline; }
.office .field { margin-bottom: var(--space-2); }
.office .field input, .office .field select, .office .field textarea { font-size: inherit; }
.office .row { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }

.office .tabs { display: flex; gap: var(--space-1); border-bottom: 1px solid var(--color-border); margin: var(--space-2) 0; flex-wrap: wrap; }
.office .tabs a { padding: var(--space-1) var(--space-2); text-decoration: none; color: var(--color-muted); border-bottom: 2px solid transparent; }
.office .tabs a[aria-current="page"] { color: var(--color-brand); border-bottom-color: var(--color-brand); }

.office .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--color-brand-tint); color: var(--color-brand); font-size: 0.85em; }
.office .overdue { color: var(--color-accent); font-weight: 600; }
.office .done { color: var(--color-muted); text-decoration: line-through; }
.office .error { color: var(--color-accent); }
.office .empty { color: var(--color-muted); font-style: italic; }

.office .board { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
.office .board .col { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: var(--space-1) var(--space-2); }
.office .board .col h3 { font-size: 0.9em; color: var(--color-muted); margin: 0 0 var(--space-1); }
.office .board .col a { display: block; padding: 0.15rem 0; }

.office .month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; max-width: 22rem; }
.office .month a, .office .month span { text-align: center; padding: 0.25rem 0; border-radius: 6px; text-decoration: none; }
.office .month .out { color: var(--color-border); }
.office .month .marked { font-weight: 600; }
.office .month .marked::after { content: '•'; display: block; line-height: 0.4; color: var(--color-brand); }
.office .month [aria-current="date"] { background: var(--color-brand-tint); }

.office textarea.json { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-height: 30rem; width: 100%; }
```

- [ ] **Step 12: Layout**

`src/layouts/OfficeLayout.astro`:

```astro
---
import '../styles/global.css';
import '../styles/office.css';
import '@fontsource-variable/instrument-sans/wght.css';

interface Props { title: string }
const { title } = Astro.props;
const path = Astro.url.pathname;
const admin = Astro.locals.admin;
const nav = [
  { label: 'Dashboard', href: '/office/' },
  { label: 'Clients', href: '/office/clients/' },
  { label: 'Calendar', href: '/office/calendar/' },
  { label: 'Settings', href: '/office/settings/' },
  { label: 'Data', href: '/office/data/' },
];
const current = (href: string) => (href === '/office/' ? path === href : path.startsWith(href));
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>{title} | Keepsite office</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body class="office">
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="office-header">
      <div class="container">
        <a class="brand" href="/office/">Keepsite office</a>
        <nav aria-label="Office">
          {nav.map((n) => <a href={n.href} aria-current={current(n.href) ? 'page' : undefined}>{n.label}</a>)}
        </nav>
        {admin && (
          <div class="who">
            <span>{admin.email}</span>
            <form method="POST" action="/office/api/logout" class="inline"><button type="submit">Log out</button></form>
          </div>
        )}
      </div>
    </header>
    <main id="main" tabindex="-1">
      <div class="container">
        <slot />
      </div>
    </main>
  </body>
</html>
```

- [ ] **Step 13: Login page (prerendered)**

`src/pages/office/login.astro`:

```astro
---
import OfficeLayout from '../../layouts/OfficeLayout.astro';
// Prerendered on purpose: nothing here depends on the request, and a static
// page is one Lighthouse can audit. The error flag and next path are read
// from the query string in the browser.
---
<OfficeLayout title="Log in">
  <h1>Log in</h1>
  <p class="error" id="error" hidden>That email and password did not match an admin account.</p>
  <form method="POST" action="/office/api/login" class="narrow" id="login">
    <input type="hidden" name="next" value="/office/" />
    <label class="field">
      <span>Email</span>
      <input type="email" name="email" required autocomplete="username" />
    </label>
    <label class="field">
      <span>Password</span>
      <input type="password" name="password" required autocomplete="current-password" />
    </label>
    <button type="submit" class="btn">Log in</button>
  </form>
  <script is:inline>
    (function () {
      var p = new URLSearchParams(location.search);
      if (p.get('error')) document.getElementById('error').hidden = false;
      var next = p.get('next') || '';
      if (next.indexOf('/office/') === 0) document.querySelector('#login input[name="next"]').value = next;
    })();
  </script>
</OfficeLayout>
```

- [ ] **Step 14: Placeholder dashboard**

`src/pages/office/index.astro` (Task 11 replaces the body):

```astro
---
export const prerender = false;
import OfficeLayout from '../../layouts/OfficeLayout.astro';
---
<OfficeLayout title="Dashboard">
  <h1>Dashboard</h1>
  <p class="empty">Nothing here yet.</p>
</OfficeLayout>
```

- [ ] **Step 15: Local dev script**

In `package.json` scripts add:

```json
"dev:office": "OFFICE_STORE_DIR=.office-data IDENTITY_URL=https://www.keepsitemedia.com/.netlify/identity astro dev"
```

`KEEPSITE_SESSION_SECRET` comes from the shell: `KEEPSITE_SESSION_SECRET=anything npm run dev:office`. The file store lands in `.office-data/`, which is gitignored.

- [ ] **Step 16: Gate and manual check**

Run: `npm run gate`
Expected: passes; `dist/office/login/index.html` exists; no other office HTML in `dist/`.

Run: `KEEPSITE_SESSION_SECRET=dev npm run dev:office`, open `http://localhost:4321/office/`.
Expected: redirected to `/office/login/?next=%2Foffice%2F`. Logging in with a real Identity admin account lands on the placeholder dashboard with the email in the header; Log out returns to the login page. (Identity must have the `admin` role on your user: Netlify → Identity → the user → Roles.)

- [ ] **Step 17: Commit**

```bash
git add netlify/functions/lib/office/http.mjs netlify/functions/lib/office/http.test.mjs netlify/functions/lib/office/actions netlify/functions/lib/office/actions.mjs src/middleware.ts src/env.d.ts src/styles/office.css src/layouts/OfficeLayout.astro src/pages/office package.json
git commit -m "Add the office login, guard and layout"
```

---

### Task 6: Pipelines seed and the pipeline module

**Files:**
- Create: `src/data/office/pipelines.json`
- Create: `netlify/functions/lib/office/pipeline.mjs`
- Create: `netlify/functions/lib/office/pipeline.test.mjs`
- Create: `scripts/check-office.mjs`
- Modify: `package.json` (`check:office` script, added to `gate`)

**Interfaces:**
- Consumes: `newId` from `ids.mjs`, `addDays` from `dates.mjs`.
- Produces:
  - `validatePipelines(value): string[]` — empty when valid.
  - `loadPipelines(store): Promise<Pipeline[]>` — stored settings or the seed.
  - `findPipeline(pipelines, id)`, `findStage(pipeline, stageId)` — or `undefined`.
  - `advance({ client, pipeline, stageId, today, now }): { client, tasks }` — the updated client and the new task documents (with ids), empty on a repeat visit.
  - Shapes:

```js
// Pipeline
{ id: 'website', name: 'Website build', questionnaires: ['intro','brand','build'],
  payments: { plan: 'deposit-balance-monthly' },
  stages: [{ id, name, email?: string, tasks: [{ title, due: number, questionnaire?: string, payment?: string }] }] }
// Task document
{ id, slug, title, due: 'YYYY-MM-DD', time: null | 'HH:MM', done: false, doneAt: null,
  source: 'pipeline' | 'manual', stage: string | null, questionnaire: string | null,
  payment: string | null, notes: '', createdAt: ISO }
// Client stage history entry
{ stage: string, at: ISO }
```

- [ ] **Step 1: Seed pipelines**

`src/data/office/pipelines.json`. Offsets are days from the day the stage begins, so a task that follows another inside a stage carries the sum:

```json
[
  {
    "id": "website",
    "name": "Website build",
    "questionnaires": ["intro", "brand", "build"],
    "payments": { "plan": "deposit-balance-monthly" },
    "stages": [
      { "id": "inquiry", "name": "Inquiry",
        "tasks": [{ "title": "Reply with recommendation", "due": 1 }] },
      { "id": "agreement", "name": "Agreement", "email": "agreement",
        "tasks": [{ "title": "Send agreement", "due": 0 }, { "title": "Deposit received", "due": 7, "payment": "deposit" }] },
      { "id": "intro", "name": "Intro questionnaire", "email": "intro",
        "tasks": [{ "title": "Intro questionnaire back", "due": 5, "questionnaire": "intro" }] },
      { "id": "demo", "name": "Demo",
        "tasks": [{ "title": "Build demo", "due": 5 }, { "title": "Send demo", "due": 5 }] },
      { "id": "post-demo", "name": "Post-demo questionnaires", "email": "post-demo",
        "tasks": [{ "title": "Brand questionnaire back", "due": 7, "questionnaire": "brand" }, { "title": "Build questionnaire back", "due": 7, "questionnaire": "build" }] },
      { "id": "layouts", "name": "Layouts", "email": "layouts",
        "tasks": [{ "title": "Layouts to client", "due": 10 }, { "title": "Layout changes back", "due": 15 }] },
      { "id": "copy", "name": "Copy and photos", "email": "copy",
        "tasks": [{ "title": "Copy in place", "due": 10 }, { "title": "Client review back", "due": 15 }] },
      { "id": "launch", "name": "Launch", "email": "launch",
        "tasks": [{ "title": "Balance received", "due": 0, "payment": "balance" }, { "title": "Launch", "due": 3 }, { "title": "Start monthly", "due": 3 }] },
      { "id": "live", "name": "Live", "tasks": [] }
    ]
  }
]
```

- [ ] **Step 2: Failing tests**

`netlify/functions/lib/office/pipeline.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../../../src/data/office/pipelines.json' with { type: 'json' };
import { validatePipelines, loadPipelines, findPipeline, findStage, advance } from './pipeline.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const website = () => findPipeline(seed, 'website');
const fresh = () => ({
  slug: 'lova', pipeline: 'website', stage: 'inquiry',
  stages: [{ stage: 'inquiry', at: '2026-09-01T00:00:00.000Z' }], dates: { inquiry: '2026-09-01' },
});
const NOW = new Date('2026-09-04T16:00:00Z');

test('the seed validates and every id is unique', () => {
  assert.deepEqual(validatePipelines(seed), []);
});

test('validatePipelines names what is wrong', () => {
  assert.match(validatePipelines('x').join(), /must be a list/);
  assert.match(validatePipelines([{ id: 'A', name: 'x', stages: [] }]).join(), /id/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: '', due: 1 }] }] }]).join(), /title/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: 't', due: -1 }] }] }]).join(), /due/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [] }, { id: 's', name: 'T', tasks: [] }] }]).join(), /duplicate stage/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [] }, { id: 'a', name: 'y', stages: [] }]).join(), /duplicate pipeline/);
});

test('loadPipelines falls back to the seed and prefers the stored copy', async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  assert.equal((await loadPipelines(s))[0].id, 'website');
  await s.settings.put('pipelines', [{ id: 'other', name: 'Other', stages: [] }]);
  assert.equal((await loadPipelines(s))[0].id, 'other');
});

test('findStage returns undefined for unknown ids', () => {
  assert.equal(findStage(website(), 'nope'), undefined);
  assert.equal(findStage(website(), 'demo').name, 'Demo');
});

test('advancing creates the stage tasks with due dates from today', () => {
  const { client, tasks } = advance({ client: fresh(), pipeline: website(), stageId: 'agreement', today: '2026-09-04', now: NOW });
  assert.equal(client.stage, 'agreement');
  assert.equal(client.stages.at(-1).stage, 'agreement');
  assert.deepEqual(tasks.map((t) => [t.title, t.due, t.payment]), [
    ['Send agreement', '2026-09-04', null],
    ['Deposit received', '2026-09-11', 'deposit'],
  ]);
  for (const t of tasks) {
    assert.equal(t.slug, 'lova');
    assert.equal(t.source, 'pipeline');
    assert.equal(t.stage, 'agreement');
    assert.equal(t.done, false);
    assert.match(t.id, /^20260904T160000/);
  }
});

test('re-entering a stage creates no tasks; moving back creates none either', () => {
  const first = advance({ client: fresh(), pipeline: website(), stageId: 'demo', today: '2026-09-04', now: NOW });
  const back = advance({ client: first.client, pipeline: website(), stageId: 'inquiry', today: '2026-09-05', now: NOW });
  assert.equal(back.client.stage, 'inquiry');
  assert.deepEqual(back.tasks, []);
  const again = advance({ client: back.client, pipeline: website(), stageId: 'demo', today: '2026-09-06', now: NOW });
  assert.deepEqual(again.tasks, []);
  assert.equal(again.client.stages.length, 4);
});

test('questionnaire tasks carry the form name and live records the launch date', () => {
  const { tasks } = advance({ client: fresh(), pipeline: website(), stageId: 'post-demo', today: '2026-09-04', now: NOW });
  assert.deepEqual(tasks.map((t) => t.questionnaire), ['brand', 'build']);
  const live = advance({ client: fresh(), pipeline: website(), stageId: 'live', today: '2026-10-01', now: NOW });
  assert.equal(live.client.dates.launched, '2026-10-01');
});

test('advance throws on a stage the pipeline does not have', () => {
  assert.throws(() => advance({ client: fresh(), pipeline: website(), stageId: 'nope', today: '2026-09-04', now: NOW }), /unknown stage/);
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/pipeline.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 4: Implement**

`netlify/functions/lib/office/pipeline.mjs`:

```js
// A pipeline is data, not code: stages, the tasks each one creates, and the
// email each one opens. New products are new entries in the settings page.
import seed from '../../../../src/data/office/pipelines.json' with { type: 'json' };
import { newId } from './ids.mjs';
import { addDays } from './dates.mjs';

const KEY = /^[a-z][a-z0-9-]{0,31}$/;

export function validatePipelines(value) {
  const errors = [];
  if (!Array.isArray(value)) return ['pipelines must be a list'];
  const ids = new Set();
  value.forEach((p, i) => {
    const at = `pipeline ${i + 1}`;
    if (!p || typeof p !== 'object') return errors.push(`${at}: not an object`);
    if (!KEY.test(String(p.id))) errors.push(`${at}: id must be lowercase letters, digits and hyphens`);
    if (ids.has(p.id)) errors.push(`${at}: duplicate pipeline id "${p.id}"`);
    ids.add(p.id);
    if (!p.name) errors.push(`${at}: name is required`);
    if (p.questionnaires !== undefined && !Array.isArray(p.questionnaires)) errors.push(`${at}: questionnaires must be a list`);
    if (!Array.isArray(p.stages)) return errors.push(`${at}: stages must be a list`);
    const stageIds = new Set();
    p.stages.forEach((s, j) => {
      const sat = `${at}, stage ${j + 1}`;
      if (!s || typeof s !== 'object') return errors.push(`${sat}: not an object`);
      if (!KEY.test(String(s.id))) errors.push(`${sat}: id must be lowercase letters, digits and hyphens`);
      if (stageIds.has(s.id)) errors.push(`${sat}: duplicate stage id "${s.id}"`);
      stageIds.add(s.id);
      if (!s.name) errors.push(`${sat}: name is required`);
      if (!Array.isArray(s.tasks)) return errors.push(`${sat}: tasks must be a list`);
      s.tasks.forEach((t, k) => {
        const tat = `${sat}, task ${k + 1}`;
        if (!t || typeof t !== 'object') return errors.push(`${tat}: not an object`);
        if (!t.title) errors.push(`${tat}: title is required`);
        if (!Number.isInteger(t.due) || t.due < 0) errors.push(`${tat}: due must be a whole number of days, 0 or more`);
      });
    });
  });
  return errors;
}

export async function loadPipelines(store) {
  return (await store.settings.get('pipelines')) ?? seed;
}

export const findPipeline = (pipelines, id) => pipelines.find((p) => p.id === id);
export const findStage = (pipeline, stageId) => pipeline?.stages.find((s) => s.id === stageId);

export function advance({ client, pipeline, stageId, today, now = new Date() }) {
  const stage = findStage(pipeline, stageId);
  if (!stage) throw new Error(`unknown stage: ${stageId}`);
  // Tasks are created the first time a client reaches a stage and never
  // again, so moving back and forward does not pile up duplicates.
  const first = !client.stages.some((s) => s.stage === stageId);
  const at = now.toISOString();
  const dates = { ...client.dates };
  if (stageId === 'live' && !dates.launched) dates.launched = today;
  const updated = {
    ...client,
    stage: stageId,
    stages: [...client.stages, { stage: stageId, at }],
    dates,
    updatedAt: at,
  };
  const tasks = first
    ? stage.tasks.map((t) => ({
        id: newId(now),
        slug: client.slug,
        title: t.title,
        due: addDays(today, t.due),
        time: null,
        done: false,
        doneAt: null,
        source: 'pipeline',
        stage: stageId,
        questionnaire: t.questionnaire ?? null,
        payment: t.payment ?? null,
        notes: '',
        createdAt: at,
      }))
    : [];
  return { client: updated, tasks };
}
```

- [ ] **Step 5: Run tests**

Run: `node --test netlify/functions/lib/office/pipeline.test.mjs`
Expected: 8 passing.

- [ ] **Step 6: Structural check script**

`scripts/check-office.mjs`:

```js
// The seed is read by the settings page, the pipeline module, and the
// dashboard. A malformed seed fails in three places; catch it here.
import fs from 'node:fs';
import { validatePipelines } from '../netlify/functions/lib/office/pipeline.mjs';

const seed = JSON.parse(fs.readFileSync('src/data/office/pipelines.json', 'utf8'));
const errors = validatePipelines(seed);
const forms = new Set(fs.readdirSync('src/data/questionnaires').map((f) => f.replace(/\.json$/, '')));
for (const p of seed) {
  for (const q of p.questionnaires ?? []) {
    if (!forms.has(q)) errors.push(`${p.id}: questionnaire "${q}" has no definition in src/data/questionnaires`);
  }
  for (const s of p.stages) {
    for (const t of s.tasks) {
      if (t.questionnaire && !(p.questionnaires ?? []).includes(t.questionnaire)) {
        errors.push(`${p.id}/${s.id}: task "${t.title}" names questionnaire "${t.questionnaire}" the pipeline does not declare`);
      }
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('office seed ok');
```

In `package.json`:

```json
"check:office": "node scripts/check-office.mjs",
"gate": "npm run check && npm run check:forms && npm run check:office && npm run build && npm run verify",
```

- [ ] **Step 7: Run the check**

Run: `npm run check:office`
Expected: `office seed ok`.

- [ ] **Step 8: Commit**

```bash
git add src/data/office/pipelines.json netlify/functions/lib/office/pipeline.mjs netlify/functions/lib/office/pipeline.test.mjs scripts/check-office.mjs package.json
git commit -m "Add pipelines and stage advancement"
```

---

### Task 7: Client records, list and creation

**Files:**
- Create: `netlify/functions/lib/office/clients.mjs`
- Create: `netlify/functions/lib/office/clients.test.mjs`
- Create: `netlify/functions/lib/office/actions/client.mjs`
- Create: `netlify/functions/lib/office/actions/client.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Create: `src/components/office/ClientFields.astro`
- Create: `src/pages/office/clients/index.astro`
- Create: `src/pages/office/clients/new.astro`

**Interfaces:**
- Consumes: `store()`, `newId`, `todayIn`, `loadPipelines`, `findPipeline`, `advance`, http helpers.
- Produces:
  - `TIERS = ['Presence', 'Search', 'Search Plus']`
  - `slugify(text): string`, `uniqueSlug(base, taken: Set<string>): string`
  - `validateClient(fields): string[]`
  - `newClient(fields, { pipeline, stage, today, now }): Client`
  - `applyEdit(client, fields, now): Client`
  - `clientFields(data): fields` — reads name, business, email, phone, address, website, tier, notes from a `FormData`.
  - Action `client`: `op=create` creates and redirects to the client page; `op=update` with `slug` edits.
  - Client shape:

```js
{ slug, name, business, email, phone, address, website, tier, pipeline, stage,
  stages: [{ stage, at }], stripeCustomerId: null,
  dates: { inquiry: 'YYYY-MM-DD', signed: null, launched: null }, notes, createdAt, updatedAt }
```

- [ ] **Step 1: Failing tests for clients.mjs**

`netlify/functions/lib/office/clients.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug, validateClient, newClient, applyEdit, TIERS } from './clients.mjs';

const NOW = new Date('2026-09-04T16:00:00Z');
const good = { name: 'Sierra', business: 'Lova Content Creation', email: 'sierra@example.com', tier: 'Search' };

test('slugify makes a usable slug from a business name', () => {
  assert.equal(slugify('Lova Content Creation'), 'lova-content-creation');
  assert.equal(slugify("  P&P Bakery, LLC. "), 'p-p-bakery-llc');
  assert.equal(slugify('###'), 'client');
  assert.equal(slugify('x'.repeat(100)).length, 64);
  assert.equal(slugify('-leading'), 'leading');
});

test('uniqueSlug appends a counter only when taken', () => {
  assert.equal(uniqueSlug('lova', new Set()), 'lova');
  assert.equal(uniqueSlug('lova', new Set(['lova'])), 'lova-2');
  assert.equal(uniqueSlug('lova', new Set(['lova', 'lova-2'])), 'lova-3');
});

test('validateClient requires name, business and a plausible email', () => {
  assert.deepEqual(validateClient(good), []);
  assert.match(validateClient({ ...good, name: '' }).join(), /name/);
  assert.match(validateClient({ ...good, email: 'nope' }).join(), /email/);
  assert.match(validateClient({ ...good, tier: 'Gold' }).join(), /tier/);
  assert.deepEqual(validateClient({ ...good, tier: '' }), []);
});

test('newClient fills every field with a value', () => {
  const c = newClient(good, { pipeline: 'website', stage: 'inquiry', today: '2026-09-04', now: NOW });
  assert.equal(c.slug, 'lova-content-creation');
  assert.equal(c.phone, '');
  assert.equal(c.stage, 'inquiry');
  assert.deepEqual(c.stages, [{ stage: 'inquiry', at: NOW.toISOString() }]);
  assert.deepEqual(c.dates, { inquiry: '2026-09-04', signed: null, launched: null });
  assert.equal(c.stripeCustomerId, null);
  assert.equal(c.createdAt, NOW.toISOString());
});

test('newClient honours a given slug and applyEdit changes only editable fields', () => {
  const c = newClient({ ...good, slug: 'lova' }, { pipeline: 'website', stage: 'inquiry', today: '2026-09-04', now: NOW });
  assert.equal(c.slug, 'lova');
  const later = new Date('2026-09-05T00:00:00Z');
  const e = applyEdit(c, { ...good, phone: '555', slug: 'hacked', stage: 'live' }, later);
  assert.equal(e.slug, 'lova');
  assert.equal(e.stage, 'inquiry');
  assert.equal(e.phone, '555');
  assert.equal(e.updatedAt, later.toISOString());
});

test('TIERS matches packages.json', async () => {
  const packages = (await import('../../../../src/data/packages.json', { with: { type: 'json' } })).default;
  assert.deepEqual(TIERS, packages.tiers.map((t) => t.name));
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/clients.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement clients.mjs**

`netlify/functions/lib/office/clients.mjs`:

```js
import packages from '../../../../src/data/packages.json' with { type: 'json' };

export const TIERS = packages.tiers.map((t) => t.name);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EDITABLE = ['name', 'business', 'email', 'phone', 'address', 'website', 'tier', 'notes'];

export function slugify(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return s || 'client';
}

export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 64 - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function validateClient(fields) {
  const errors = [];
  if (!fields.name) errors.push('name is required');
  if (!fields.business) errors.push('business is required');
  if (!EMAIL.test(fields.email ?? '')) errors.push('email does not look like an address');
  if (fields.tier && !TIERS.includes(fields.tier)) errors.push(`tier must be one of ${TIERS.join(', ')}`);
  return errors;
}

const pick = (fields) => Object.fromEntries(EDITABLE.map((k) => [k, String(fields[k] ?? '').trim()]));

export function newClient(fields, { pipeline, stage, today, now = new Date() }) {
  const at = now.toISOString();
  return {
    slug: fields.slug || slugify(fields.business),
    ...pick(fields),
    pipeline,
    stage,
    stages: [{ stage, at }],
    stripeCustomerId: null,
    dates: { inquiry: today, signed: null, launched: null },
    createdAt: at,
    updatedAt: at,
  };
}

export function applyEdit(client, fields, now = new Date()) {
  return { ...client, ...pick(fields), updatedAt: now.toISOString() };
}

export const clientFields = (data) =>
  Object.fromEntries(EDITABLE.map((k) => [k, String(data.get(k) ?? '').trim()]));
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/clients.test.mjs`
Expected: 6 passing.

- [ ] **Step 5: Failing action tests**

`netlify/functions/lib/office/actions/client.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client as action } from './client.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const SECRET = 's';
const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/client', { method: 'POST', body: d });
};
const good = { name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search', pipeline: 'website' };

let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = SECRET; csrf = mintCsrf(SECRET); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });

test('create writes the client, its inquiry tasks, and redirects to it', async () => {
  const s = make();
  const res = await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  const c = await s.clients.get('lova');
  assert.equal(c.stage, 'inquiry');
  assert.equal(c.pipeline, 'website');
  assert.deepEqual((await s.tasks.list('lova')).map((t) => t.title), ['Reply with recommendation']);
});

test('create picks a free slug when the business name is taken', async () => {
  const s = make();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  const res = await action(post({ op: 'create', csrf, ...good, email: 'other@example.com' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova-2/');
});

test('create refuses a bad csrf token, a bad pipeline, and bad fields', async () => {
  const s = make();
  assert.equal((await action(post({ op: 'create', csrf: 'x', ...good }), ctx(), s)).status, 403);
  assert.equal((await action(post({ op: 'create', csrf, ...good, pipeline: 'nope' }), ctx(), s)).status, 400);
  const res = await action(post({ op: 'create', csrf, ...good, email: 'bad' }), ctx(), s);
  assert.equal(res.status, 303);
  assert.match(res.headers.get('Location'), /^\/office\/clients\/new\/\?error=/);
  assert.equal((await s.clients.list()).length, 0);
});

test('update edits fields and keeps the slug and stage', async () => {
  const s = make();
  await action(post({ op: 'create', csrf, ...good }), ctx(), s);
  const res = await action(post({ op: 'update', csrf, slug: 'lova', ...good, phone: '555', stage: 'live' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  const c = await s.clients.get('lova');
  assert.equal(c.phone, '555');
  assert.equal(c.stage, 'inquiry');
});

test('update of an unknown client is a 404 and an unknown op a 400', async () => {
  const s = make();
  assert.equal((await action(post({ op: 'update', csrf, slug: 'ghost', ...good }), ctx(), s)).status, 404);
  assert.equal((await action(post({ op: 'nope', csrf }), ctx(), s)).status, 400);
});
```

- [ ] **Step 6: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/actions/client.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 7: Implement the client action**

`netlify/functions/lib/office/actions/client.mjs`:

```js
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
```

Add to `netlify/functions/lib/office/actions.mjs`:

```js
import { client } from './actions/client.mjs';
export const actions = { __proto__: null, login, logout, client };
```

- [ ] **Step 8: Run action tests**

Run: `node --test netlify/functions/lib/office/actions/client.test.mjs`
Expected: 5 passing.

- [ ] **Step 9: Shared form fields component**

`src/components/office/ClientFields.astro`:

```astro
---
import { TIERS } from '../../../netlify/functions/lib/office/clients.mjs';
interface Props { client?: Record<string, string> }
const c = Astro.props.client ?? {};
---
<div class="row">
  <label class="field"><span>Contact name</span><input name="name" required value={c.name ?? ''} /></label>
  <label class="field"><span>Business</span><input name="business" required value={c.business ?? ''} /></label>
  <label class="field"><span>Email</span><input type="email" name="email" required value={c.email ?? ''} /></label>
  <label class="field"><span>Phone</span><input name="phone" value={c.phone ?? ''} /></label>
  <label class="field"><span>Website</span><input name="website" value={c.website ?? ''} placeholder="https://" /></label>
  <label class="field"><span>Tier</span>
    <select name="tier">
      <option value="" selected={!c.tier}>Not decided</option>
      {TIERS.map((t) => <option value={t} selected={c.tier === t}>{t}</option>)}
    </select>
  </label>
</div>
<label class="field"><span>Address</span><input name="address" value={c.address ?? ''} /></label>
<label class="field"><span>Notes</span><textarea name="notes" rows="4">{c.notes ?? ''}</textarea></label>
```

- [ ] **Step 10: Client list page**

`src/pages/office/clients/index.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../../layouts/OfficeLayout.astro';
import { store } from '../../../../netlify/functions/lib/office/store.mjs';
import { loadPipelines, findPipeline, findStage } from '../../../../netlify/functions/lib/office/pipeline.mjs';
import { todayIn, formatYmd } from '../../../../netlify/functions/lib/office/dates.mjs';

const s = store();
const pipelines = await loadPipelines(s);
const clients = (await s.clients.list()).sort((a, b) => a.business.localeCompare(b.business));
const today = todayIn();

// The next open task per client, one store read per client. Fine at fifty.
const next = new Map();
for (const c of clients) {
  const open = (await s.tasks.list(c.slug)).filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due));
  next.set(c.slug, open[0] ?? null);
}
const stageName = (c) => findStage(findPipeline(pipelines, c.pipeline), c.stage)?.name ?? c.stage;
---
<OfficeLayout title="Clients">
  <div class="toolbar">
    <h1>Clients</h1>
    <a class="btn btn-small" href="/office/clients/new/">New client</a>
  </div>
  {clients.length === 0 ? (
    <p class="empty">No clients yet.</p>
  ) : (
    <div class="table-scroll">
      <table>
        <thead><tr><th>Business</th><th>Contact</th><th>Tier</th><th>Stage</th><th>Next due</th></tr></thead>
        <tbody>
          {clients.map((c) => {
            const t = next.get(c.slug);
            return (
              <tr>
                <td><a href={`/office/clients/${c.slug}/`}>{c.business}</a></td>
                <td>{c.name}</td>
                <td>{c.tier || <span class="muted">—</span>}</td>
                <td><span class="badge">{stageName(c)}</span></td>
                <td>{t ? <span class={t.due < today ? 'overdue' : ''}>{formatYmd(t.due)} · {t.title}</span> : <span class="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</OfficeLayout>
```

- [ ] **Step 11: New client page**

`src/pages/office/clients/new.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../../layouts/OfficeLayout.astro';
import ClientFields from '../../../components/office/ClientFields.astro';
import { store } from '../../../../netlify/functions/lib/office/store.mjs';
import { loadPipelines } from '../../../../netlify/functions/lib/office/pipeline.mjs';

const pipelines = await loadPipelines(store());
const error = Astro.url.searchParams.get('error');
---
<OfficeLayout title="New client">
  <h1>New client</h1>
  {error && <p class="error">{error}</p>}
  <form method="POST" action="/office/api/client">
    <input type="hidden" name="csrf" value={Astro.locals.csrf} />
    <input type="hidden" name="op" value="create" />
    <label class="field"><span>Pipeline</span>
      <select name="pipeline">{pipelines.map((p) => <option value={p.id}>{p.name}</option>)}</select>
    </label>
    <ClientFields />
    <button type="submit" class="btn">Create client</button>
  </form>
</OfficeLayout>
```

- [ ] **Step 12: Gate and manual check**

Run: `npm run gate` — passes.
Run: `KEEPSITE_SESSION_SECRET=dev npm run dev:office`, log in, open `/office/clients/`, create a client.
Expected: lands on `/office/clients/{slug}/` (404 until Task 8; the list shows the client with stage Inquiry and its task).

- [ ] **Step 13: Commit**

```bash
git add netlify/functions/lib/office/clients.mjs netlify/functions/lib/office/clients.test.mjs netlify/functions/lib/office/actions/client.mjs netlify/functions/lib/office/actions/client.test.mjs netlify/functions/lib/office/actions.mjs src/components/office/ClientFields.astro src/pages/office/clients
git commit -m "Add client records, list and creation"
```

---

### Task 8: Client page with stage and task actions

**Files:**
- Create: `netlify/functions/lib/office/actions/stage.mjs`
- Create: `netlify/functions/lib/office/actions/stage.test.mjs`
- Create: `netlify/functions/lib/office/actions/task.mjs`
- Create: `netlify/functions/lib/office/actions/task.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Create: `src/components/office/TaskRow.astro`
- Create: `src/pages/office/clients/[slug].astro`

**Interfaces:**
- Consumes: store, pipeline, clients, dates, http.
- Produces:
  - Action `stage`: fields `slug`, `stage`, `csrf`. Advances (or moves back), writes tasks, redirects to the client page.
  - Action `task`: `op=add` (`slug`, `title`, `due`, `time?`, `notes?`), `op=done` (`slug`, `id`), `op=reopen`, `op=reschedule` (`slug`, `id`, `due`, `time?`), `op=delete`. All redirect to `back` if it is a safe office path, else the client page.
  - `TaskRow` props: `task`, `csrf`, `today`, `back` (the page to return to), `showClient?: boolean`.
  - Client page tabs are query-driven: `/office/clients/{slug}/?tab=overview|tasks|questionnaires`. Task 9 adds the questionnaires body.

- [ ] **Step 1: Failing stage tests**

`netlify/functions/lib/office/actions/stage.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stage } from './stage.mjs';
import { client as clientAction } from './client.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields, path = 'stage') => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request(`https://site.test/office/api/${path}`, { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });

async function seeded() {
  const s = make();
  await clientAction(post({ op: 'create', csrf, name: 'S', business: 'Lova', email: 's@example.com', pipeline: 'website' }, 'client'), ctx(), s);
  return s;
}

test('advancing writes the stage and its tasks', async () => {
  const s = await seeded();
  const res = await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s, new Date('2026-09-04T16:00:00Z'));
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  assert.equal((await s.clients.get('lova')).stage, 'agreement');
  const titles = (await s.tasks.list('lova')).map((t) => t.title).sort();
  assert.deepEqual(titles, ['Deposit received', 'Reply with recommendation', 'Send agreement']);
});

test('unknown client or stage is refused, bad csrf is 403', async () => {
  const s = await seeded();
  assert.equal((await stage(post({ csrf, slug: 'ghost', stage: 'demo' }), ctx(), s)).status, 404);
  assert.equal((await stage(post({ csrf, slug: 'lova', stage: 'nope' }), ctx(), s)).status, 400);
  assert.equal((await stage(post({ csrf: 'x', slug: 'lova', stage: 'demo' }), ctx(), s)).status, 403);
});
```

- [ ] **Step 2: Failing task tests**

`netlify/functions/lib/office/actions/task.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { task } from './task.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', business: 'Lova' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/task', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });

test('add creates a manual task and returns to the caller', async () => {
  const s = await make();
  const res = await task(post({ csrf, op: 'add', slug: 'lova', title: 'Call about photos', due: '2026-09-10', time: '14:30', back: '/office/calendar/?d=2026-09-10' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/calendar/?d=2026-09-10');
  const [t] = await s.tasks.list('lova');
  assert.equal(t.source, 'manual');
  assert.equal(t.stage, null);
  assert.equal(t.time, '14:30');
  assert.equal(t.due, '2026-09-10');
});

test('add validates title, date and time', async () => {
  const s = await make();
  assert.equal((await task(post({ csrf, op: 'add', slug: 'lova', title: '', due: '2026-09-10' }), ctx(), s)).status, 400);
  assert.equal((await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-9-1' }), ctx(), s)).status, 400);
  assert.equal((await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-10', time: '25:00' }), ctx(), s)).status, 400);
  assert.equal((await task(post({ csrf, op: 'add', slug: 'ghost', title: 'x', due: '2026-09-10' }), ctx(), s)).status, 404);
});

test('done, reopen, reschedule and delete', async () => {
  const s = await make();
  await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-10' }), ctx(), s);
  const [{ id }] = await s.tasks.list('lova');
  await task(post({ csrf, op: 'done', slug: 'lova', id }), ctx(), s, new Date('2026-09-05T00:00:00Z'));
  let t = await s.tasks.get('lova', id);
  assert.equal(t.done, true);
  assert.equal(t.doneAt, '2026-09-05T00:00:00.000Z');
  await task(post({ csrf, op: 'reopen', slug: 'lova', id }), ctx(), s);
  t = await s.tasks.get('lova', id);
  assert.equal(t.done, false);
  assert.equal(t.doneAt, null);
  await task(post({ csrf, op: 'reschedule', slug: 'lova', id, due: '2026-09-12', time: '' }), ctx(), s);
  t = await s.tasks.get('lova', id);
  assert.equal(t.due, '2026-09-12');
  assert.equal(t.time, null);
  const res = await task(post({ csrf, op: 'delete', slug: 'lova', id }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=tasks');
  assert.equal(await s.tasks.get('lova', id), null);
});

test('an unknown id is 404 and a bad back path falls to the client page', async () => {
  const s = await make();
  assert.equal((await task(post({ csrf, op: 'done', slug: 'lova', id: '20260904T000000aaaaaa' }), ctx(), s)).status, 404);
  const res = await task(post({ csrf, op: 'add', slug: 'lova', title: 'x', due: '2026-09-10', back: 'https://evil.test/' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=tasks');
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/actions/`
Expected: stage and task suites fail with cannot find module; login and client suites still pass.

- [ ] **Step 4: Implement the stage action**

`netlify/functions/lib/office/actions/stage.mjs`:

```js
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
```

- [ ] **Step 5: Implement the task action**

`netlify/functions/lib/office/actions/task.mjs`:

```js
import { readForm, redirect, problem, field, checkCsrf, safeNext } from '../http.mjs';
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
  if (!checkCsrf(ctx, data)) return problem(403, 'stale form, reload and try again');

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
```

Add both to `netlify/functions/lib/office/actions.mjs`:

```js
import { stage } from './actions/stage.mjs';
import { task } from './actions/task.mjs';
export const actions = { __proto__: null, login, logout, client, stage, task };
```

- [ ] **Step 6: Run tests**

Run: `node --test netlify/functions/lib/office/`
Expected: all passing.

- [ ] **Step 7: Task row component**

`src/components/office/TaskRow.astro`. One row, every action a tiny form, because the tool has no client-side state:

```astro
---
import { formatYmd, formatTime } from '../../../netlify/functions/lib/office/dates.mjs';
interface Props { task: any; csrf: string; today: string; back: string; showClient?: boolean; business?: string }
const { task: t, csrf, today, back, showClient = false, business = '' } = Astro.props;
const cls = t.done ? 'done' : t.due < today ? 'overdue' : '';
---
<tr>
  <td class={cls}>{formatYmd(t.due)}{t.time && ` · ${formatTime(t.time)}`}</td>
  {showClient && <td><a href={`/office/clients/${t.slug}/`}>{business || t.slug}</a></td>}
  <td class={cls}>{t.title}{t.source === 'pipeline' && <span class="muted"> · {t.stage}</span>}</td>
  <td>
    <form method="POST" action="/office/api/task" class="inline">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="slug" value={t.slug} />
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="back" value={back} />
      <button class="btn-outline btn-small" name="op" value={t.done ? 'reopen' : 'done'}>{t.done ? 'Reopen' : 'Done'}</button>
    </form>
    <details class="inline">
      <summary class="btn-outline btn-small">Move</summary>
      <form method="POST" action="/office/api/task" class="inline">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="slug" value={t.slug} />
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="op" value="reschedule" />
        <input type="date" name="due" value={t.due} required aria-label="New date" />
        <input type="time" name="time" value={t.time ?? ''} aria-label="Time" />
        <button class="btn-small">Save</button>
        <button class="btn-small" name="op" value="delete" formnovalidate>Delete</button>
      </form>
    </details>
  </td>
</tr>
```

- [ ] **Step 8: Client page**

`src/pages/office/clients/[slug].astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../../layouts/OfficeLayout.astro';
import ClientFields from '../../../components/office/ClientFields.astro';
import TaskRow from '../../../components/office/TaskRow.astro';
import { store, SLUG } from '../../../../netlify/functions/lib/office/store.mjs';
import { loadPipelines, findPipeline } from '../../../../netlify/functions/lib/office/pipeline.mjs';
import { todayIn, formatYmd } from '../../../../netlify/functions/lib/office/dates.mjs';

const slug = Astro.params.slug ?? '';
if (!SLUG.test(slug)) return new Response('not found', { status: 404 });
const s = store();
const client = await s.clients.get(slug);
if (!client) return new Response('not found', { status: 404 });

const pipeline = findPipeline(await loadPipelines(s), client.pipeline);
const stages = pipeline?.stages ?? [];
const stageIndex = stages.findIndex((st) => st.id === client.stage);
const nextStage = stages[stageIndex + 1];
const tasks = (await s.tasks.list(slug)).sort((a, b) => a.due.localeCompare(b.due) || (a.time ?? '').localeCompare(b.time ?? ''));
const open = tasks.filter((t) => !t.done);
const closed = tasks.filter((t) => t.done);
const today = todayIn();
const tab = Astro.url.searchParams.get('tab') ?? 'overview';
const error = Astro.url.searchParams.get('error');
const csrf = Astro.locals.csrf;
const here = `/office/clients/${slug}/?tab=${tab}`;
const tabs = [
  ['overview', 'Overview'],
  ['tasks', `Tasks (${open.length})`],
  ...(pipeline?.questionnaires?.length ? [['questionnaires', 'Questionnaires']] : []),
];
---
<OfficeLayout title={client.business}>
  <div class="toolbar">
    <h1>{client.business}</h1>
    <span class="badge">{stages[stageIndex]?.name ?? client.stage}</span>
    {client.tier && <span class="muted">{client.tier}</span>}
  </div>
  {error && <p class="error">{error}</p>}
  <nav class="tabs" aria-label="Client sections">
    {tabs.map(([id, label]) => <a href={`/office/clients/${slug}/?tab=${id}`} aria-current={tab === id ? 'page' : undefined}>{label}</a>)}
  </nav>

  {tab === 'overview' && (
    <>
      <h2>Stage</h2>
      <form method="POST" action="/office/api/stage" class="toolbar">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="slug" value={slug} />
        <select name="stage" aria-label="Stage">
          {stages.map((st) => <option value={st.id} selected={st.id === client.stage}>{st.name}</option>)}
        </select>
        <button class="btn btn-small">Set stage</button>
        {nextStage && <button class="btn-outline btn-small" name="stage" value={nextStage.id}>Advance to {nextStage.name}</button>}
      </form>
      <p class="muted">
        Inquiry {formatYmd(client.dates.inquiry)}
        {client.dates.signed && ` · Signed ${formatYmd(client.dates.signed)}`}
        {client.dates.launched && ` · Launched ${formatYmd(client.dates.launched)}`}
      </p>

      <h2>Details</h2>
      <form method="POST" action="/office/api/client">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="op" value="update" />
        <input type="hidden" name="slug" value={slug} />
        <ClientFields client={client} />
        <button class="btn btn-small">Save</button>
      </form>

      <h2>History</h2>
      <ul>
        {client.stages.map((h) => <li>{formatYmd(h.at.slice(0, 10))} · {stages.find((st) => st.id === h.stage)?.name ?? h.stage}</li>)}
      </ul>
    </>
  )}

  {tab === 'tasks' && (
    <>
      <form method="POST" action="/office/api/task" class="toolbar">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="op" value="add" />
        <input type="hidden" name="back" value={here} />
        <input name="title" placeholder="New task" required aria-label="Task title" />
        <input type="date" name="due" value={today} required aria-label="Due date" />
        <input type="time" name="time" aria-label="Time" />
        <button class="btn btn-small">Add</button>
      </form>
      {open.length === 0 && <p class="empty">Nothing open.</p>}
      {open.length > 0 && (
        <div class="table-scroll"><table>
          <thead><tr><th>Due</th><th>Task</th><th></th></tr></thead>
          <tbody>{open.map((t) => <TaskRow task={t} csrf={csrf} today={today} back={here} />)}</tbody>
        </table></div>
      )}
      {closed.length > 0 && (
        <details>
          <summary>Done ({closed.length})</summary>
          <div class="table-scroll"><table>
            <tbody>{closed.map((t) => <TaskRow task={t} csrf={csrf} today={today} back={here} />)}</tbody>
          </table></div>
        </details>
      )}
    </>
  )}

  {tab === 'questionnaires' && <p class="empty">Questionnaires arrive in the next task.</p>}
</OfficeLayout>
```

- [ ] **Step 9: Gate and manual check**

Run: `npm run gate` — passes.
Run the dev server, open a client. Advance to Agreement: two new tasks appear under Tasks. Set stage back to Inquiry: no new tasks. Add a manual task, mark it done, reopen it, move it, delete it.

- [ ] **Step 10: Commit**

```bash
git add netlify/functions/lib/office/actions/stage.mjs netlify/functions/lib/office/actions/stage.test.mjs netlify/functions/lib/office/actions/task.mjs netlify/functions/lib/office/actions/task.test.mjs netlify/functions/lib/office/actions.mjs src/components/office/TaskRow.astro "src/pages/office/clients/[slug].astro"
git commit -m "Add the client page with stage and task actions"
```

---

### Task 9: Questionnaires tab and the submission hook

**Files:**
- Create: `netlify/functions/lib/office/hooks.mjs`
- Create: `netlify/functions/lib/office/hooks.test.mjs`
- Modify: `netlify/functions/questionnaire.mjs`
- Create: `src/components/office/QuestionnaireAnswers.astro`
- Modify: `src/pages/office/clients/[slug].astro`

**Interfaces:**
- Consumes: `store()`, `mint` from `netlify/functions/lib/token.mjs`, the definitions in `src/data/questionnaires/*.json`.
- Produces: `markQuestionnaireDone(slug, form, s?, now?): Promise<boolean>`.

- [ ] **Step 1: Failing hook tests**

`netlify/functions/lib/office/hooks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markQuestionnaireDone } from './hooks.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const NOW = new Date('2026-09-04T16:00:00Z');

test('marks the open task for that form and no other', async () => {
  const s = make();
  await s.clients.put('lova', { slug: 'lova' });
  const a = newId(new Date('2026-09-01T00:00:00Z'));
  const b = newId(new Date('2026-09-01T00:00:01Z'));
  await s.tasks.put('lova', a, { id: a, questionnaire: 'brand', done: false, doneAt: null });
  await s.tasks.put('lova', b, { id: b, questionnaire: 'build', done: false, doneAt: null });
  assert.equal(await markQuestionnaireDone('lova', 'brand', s, NOW), true);
  assert.equal((await s.tasks.get('lova', a)).doneAt, NOW.toISOString());
  assert.equal((await s.tasks.get('lova', b)).done, false);
});

test('is a no-op without a client record or an open task', async () => {
  const s = make();
  assert.equal(await markQuestionnaireDone('ghost', 'intro', s, NOW), false);
  await s.clients.put('lova', { slug: 'lova' });
  assert.equal(await markQuestionnaireDone('lova', 'intro', s, NOW), false);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/hooks.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement the hook and call it**

`netlify/functions/lib/office/hooks.mjs`:

```js
// The one place a non-admin writer touches the office store: a submitted
// questionnaire closes the task that was waiting for it. Anything missing is
// a quiet no-op, because the questionnaire must never fail on office state.
import { store as defaultStore } from './store.mjs';

export async function markQuestionnaireDone(slug, form, s = defaultStore(), now = new Date()) {
  if (!(await s.clients.get(slug))) return false;
  const task = (await s.tasks.list(slug)).find((t) => t.questionnaire === form && !t.done);
  if (!task) return false;
  await s.tasks.put(slug, task.id, { ...task, done: true, doneAt: now.toISOString() });
  return true;
}
```

In `netlify/functions/questionnaire.mjs`, add the import at the top:

```js
import { markQuestionnaireDone } from './lib/office/hooks.mjs';
```

and after `await store.setJSON(...)` and before the `notify` block:

```js
  // Office bookkeeping is best-effort for the same reason the email is: the
  // answers are already durable, and nothing after this may cost the client
  // their redirect.
  try {
    await markQuestionnaireDone(slug, form);
  } catch {
    // Nothing to do.
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all suites pass, including the existing `questionnaire.test.mjs`.

- [ ] **Step 5: Answers component**

`src/components/office/QuestionnaireAnswers.astro`. Renders a submission against its definition so labels, not keys, show:

```astro
---
interface Props { definition: any; submission: any }
const { definition, submission } = Astro.props;
const questions = definition.sections.flatMap((s: any) => s.questions);
const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '' : String(v));
---
<dl>
  {questions.map((q: any) => {
    const v = show(submission.answers?.[q.key]);
    return (
      <>
        <dt>{q.label}</dt>
        <dd class={v ? '' : 'empty'}>{v || 'Skipped'}</dd>
      </>
    );
  })}
</dl>
{submission.files?.length > 0 && (
  <p class="muted">Files: {submission.files.map((f: any) => f.name).join(', ')}</p>
)}
```

- [ ] **Step 6: Questionnaires tab**

In `src/pages/office/clients/[slug].astro`, add to the imports:

```astro
import QuestionnaireAnswers from '../../../components/office/QuestionnaireAnswers.astro';
import { mint } from '../../../../netlify/functions/lib/token.mjs';
import intro from '../../../data/questionnaires/intro.json';
import brand from '../../../data/questionnaires/brand.json';
import build from '../../../data/questionnaires/build.json';
```

add after `const here = ...`:

```astro
const DEFINITIONS: Record<string, any> = { intro, brand, build };
const secret = process.env.KEEPSITE_TOKEN_SECRET ?? '';
const site = Astro.site?.origin ?? '';
const forms = tab === 'questionnaires'
  ? await Promise.all((pipeline?.questionnaires ?? []).map(async (form: string) => {
      const submission = await s.questionnaires.get(slug, form);
      const task = tasks.find((t) => t.questionnaire === form);
      return {
        form,
        definition: DEFINITIONS[form],
        submission,
        status: submission ? 'submitted' : task ? 'sent' : 'not sent',
        link: secret ? `${site}/questionnaire/${form}/?c=${slug}&t=${mint(secret, slug, form)}` : '',
      };
    }))
  : [];
const files = tab === 'questionnaires' ? await s.questionnaires.files(slug) : [];
```

and replace the placeholder questionnaires block with:

```astro
  {tab === 'questionnaires' && (
    <>
      {!secret && <p class="error">KEEPSITE_TOKEN_SECRET is not set, so links cannot be shown.</p>}
      {forms.map((f) => (
        <section>
          <h2>{f.definition?.title ?? f.form} <span class="badge">{f.status}</span></h2>
          {f.submission ? (
            <>
              <p class="muted">Submitted {f.submission.submittedAt.slice(0, 10)} · form version {f.submission.formVersion}</p>
              <details><summary>Answers</summary><QuestionnaireAnswers definition={f.definition} submission={f.submission} /></details>
            </>
          ) : (
            f.link && <p>Link: <code>{f.link}</code></p>
          )}
        </section>
      ))}
      {files.length > 0 && (
        <>
          <h2>Uploaded files</h2>
          <ul>{files.map((k) => <li>{k.slice(slug.length + 1)}</li>)}</ul>
        </>
      )}
    </>
  )}
```

`KEEPSITE_TOKEN_SECRET` is already a Netlify environment variable; the SSR function sees it. Locally, pass it on the `dev:office` command line.

- [ ] **Step 7: Gate and manual check**

Run: `npm run gate` — passes.
Locally with `OFFICE_STORE_DIR` set, copy a real `intro.json` into `.office-data/questionnaires/{slug}/intro.json` and open the tab: status reads submitted and the answers render with labels. Other forms show a link.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/lib/office/hooks.mjs netlify/functions/lib/office/hooks.test.mjs netlify/functions/questionnaire.mjs src/components/office/QuestionnaireAnswers.astro "src/pages/office/clients/[slug].astro"
git commit -m "Show questionnaires and close their tasks on submit"
```

---

### Task 10: Calendar

**Files:**
- Create: `netlify/functions/lib/office/calendar.mjs`
- Create: `netlify/functions/lib/office/calendar.test.mjs`
- Create: `src/pages/office/calendar.astro`

**Interfaces:**
- Consumes: store, dates, `TaskRow`.
- Produces:
  - `itemsForDay(tasks, meetings, ymd): Item[]` — `{ kind: 'task'|'meeting', time: 'HH:MM'|null, ...doc }`, untimed first, then by time.
  - `monthGrid(ymd, marked: Set<string>, today: string): { label, prev, next, weeks: Cell[][] }` where `Cell = { ymd, day, inMonth, marked, today }`; weeks start on Sunday; `prev`/`next` are the same day-of-month in the adjacent months, clamped.
  - `dueBucket(task, today): 'done'|'overdue'|'today'|'soon'|'later'` — soon is within three days.
  - Meetings in phase 1 are always `[]`; the function takes them so phase 2 adds nothing here. A meeting document has `start` as an ISO string in Mountain time is not assumed; the page passes meetings with a precomputed `ymd` and `time`.

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/calendar.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsForDay, monthGrid, dueBucket } from './calendar.mjs';

const t = (due, time = null, extra = {}) => ({ id: due + (time ?? ''), due, time, done: false, ...extra });

test('itemsForDay picks that day, untimed first, then by time, meetings merged', () => {
  const tasks = [t('2026-09-04', '15:00'), t('2026-09-05'), t('2026-09-04'), t('2026-09-04', '09:30')];
  const meetings = [{ id: 'm', ymd: '2026-09-04', time: '11:00', title: 'Kickoff' }];
  const items = itemsForDay(tasks, meetings, '2026-09-04');
  assert.deepEqual(items.map((i) => [i.kind, i.time]), [
    ['task', null], ['task', '09:30'], ['meeting', '11:00'], ['task', '15:00'],
  ]);
});

test('monthGrid lays out September 2026 from Sunday with marks and today', () => {
  const g = monthGrid('2026-09-04', new Set(['2026-09-04', '2026-09-30']), '2026-09-04');
  assert.equal(g.label, 'September 2026');
  assert.equal(g.prev, '2026-08-04');
  assert.equal(g.next, '2026-10-04');
  assert.equal(g.weeks.length, 5);
  assert.equal(g.weeks[0][0].ymd, '2026-08-30');
  assert.equal(g.weeks[0][0].inMonth, false);
  assert.equal(g.weeks[0][2].ymd, '2026-09-01');
  const fourth = g.weeks[0][5];
  assert.equal(fourth.day, 4);
  assert.ok(fourth.marked && fourth.today);
  assert.equal(g.weeks[4][3].ymd, '2026-09-30');
  assert.ok(g.weeks[4][3].marked);
});

test('monthGrid clamps prev and next to real dates', () => {
  assert.equal(monthGrid('2026-03-31', new Set(), '2026-03-31').prev, '2026-02-28');
  assert.equal(monthGrid('2026-01-31', new Set(), '2026-01-31').next, '2026-02-28');
  assert.equal(monthGrid('2026-12-15', new Set(), '2026-12-15').next, '2027-01-15');
});

test('dueBucket', () => {
  const today = '2026-09-04';
  assert.equal(dueBucket(t('2026-09-01', null, { done: true }), today), 'done');
  assert.equal(dueBucket(t('2026-09-03'), today), 'overdue');
  assert.equal(dueBucket(t('2026-09-04'), today), 'today');
  assert.equal(dueBucket(t('2026-09-07'), today), 'soon');
  assert.equal(dueBucket(t('2026-09-08'), today), 'later');
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/calendar.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/calendar.mjs`:

```js
import { addDays } from './dates.mjs';

const byTime = (a, b) => {
  if (a.time === b.time) return 0;
  if (a.time === null) return -1;
  if (b.time === null) return 1;
  return a.time < b.time ? -1 : 1;
};

export function itemsForDay(tasks, meetings, ymd) {
  const items = [
    ...tasks.filter((t) => t.due === ymd).map((t) => ({ ...t, kind: 'task', time: t.time ?? null })),
    ...meetings.filter((m) => m.ymd === ymd).map((m) => ({ ...m, kind: 'meeting', time: m.time ?? null })),
  ];
  return items.sort(byTime);
}

const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Same day of month in the neighbouring month, clamped to its last day, so
// paging from the 31st never skips a month.
function shiftMonth(y, m, d, delta) {
  let ny = y;
  let nm = m + delta;
  if (nm < 1) { nm = 12; ny -= 1; }
  if (nm > 12) { nm = 1; ny += 1; }
  return ymdOf(ny, nm, Math.min(d, daysIn(ny, nm)));
}

export function monthGrid(ymd, marked, today) {
  const [y, m, d] = ymd.split('-').map(Number);
  const first = ymdOf(y, m, 1);
  const startOffset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = daysIn(y, m);
  const cells = [];
  for (let i = -startOffset; cells.length < Math.ceil((startOffset + total) / 7) * 7; i += 1) {
    const cell = addDays(first, i);
    cells.push({
      ymd: cell,
      day: Number(cell.slice(8)),
      inMonth: cell.slice(0, 7) === ymd.slice(0, 7),
      marked: marked.has(cell),
      today: cell === today,
    });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
  return { label, prev: shiftMonth(y, m, d, -1), next: shiftMonth(y, m, d, 1), weeks };
}

export function dueBucket(task, today) {
  if (task.done) return 'done';
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  if (task.due <= addDays(today, 3)) return 'soon';
  return 'later';
}
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/calendar.test.mjs`
Expected: 4 passing.

- [ ] **Step 5: Calendar page**

`src/pages/office/calendar.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../layouts/OfficeLayout.astro';
import TaskRow from '../../components/office/TaskRow.astro';
import { store } from '../../../netlify/functions/lib/office/store.mjs';
import { todayIn, addDays, isYmd, formatYmd } from '../../../netlify/functions/lib/office/dates.mjs';
import { itemsForDay, monthGrid } from '../../../netlify/functions/lib/office/calendar.mjs';

const s = store();
const today = todayIn();
const requested = Astro.url.searchParams.get('d') ?? '';
const day = isYmd(requested) ? requested : today;

const clients = await s.clients.list();
const names = new Map(clients.map((c) => [c.slug, c.business]));
const tasks = await s.tasks.listAll();
const items = itemsForDay(tasks, [], day);
const marked = new Set(tasks.filter((t) => !t.done).map((t) => t.due));
const grid = monthGrid(day, marked, today);
const here = `/office/calendar/?d=${day}`;
const csrf = Astro.locals.csrf;
---
<OfficeLayout title="Calendar">
  <div class="toolbar">
    <a class="btn-outline btn-small" href={`/office/calendar/?d=${addDays(day, -1)}`} aria-label="Previous day">‹</a>
    <h1>{formatYmd(day)}{day === today && <span class="badge">Today</span>}</h1>
    <a class="btn-outline btn-small" href={`/office/calendar/?d=${addDays(day, 1)}`} aria-label="Next day">›</a>
    <form method="GET" action="/office/calendar/" class="inline">
      <input type="date" name="d" value={day} aria-label="Go to date" />
      <button class="btn-outline btn-small">Go</button>
    </form>
    {day !== today && <a href="/office/calendar/">Today</a>}
  </div>

  <div class="row">
    <div>
      {items.length === 0 && <p class="empty">Nothing due.</p>}
      {items.length > 0 && (
        <div class="table-scroll"><table>
          <thead><tr><th>When</th><th>Client</th><th>What</th><th></th></tr></thead>
          <tbody>
            {items.map((i) => <TaskRow task={i} csrf={csrf} today={today} back={here} showClient business={names.get(i.slug)} />)}
          </tbody>
        </table></div>
      )}
      <h2>Add a task</h2>
      <form method="POST" action="/office/api/task" class="toolbar">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="op" value="add" />
        <input type="hidden" name="back" value={here} />
        <input type="hidden" name="due" value={day} />
        <select name="slug" aria-label="Client" required>
          {clients.map((c) => <option value={c.slug}>{c.business}</option>)}
        </select>
        <input name="title" placeholder="Task" required aria-label="Task title" />
        <input type="time" name="time" aria-label="Time" />
        <button class="btn btn-small">Add</button>
      </form>
    </div>
    <div>
      <div class="toolbar">
        <a href={`/office/calendar/?d=${grid.prev}`} aria-label="Previous month">‹</a>
        <strong>{grid.label}</strong>
        <a href={`/office/calendar/?d=${grid.next}`} aria-label="Next month">›</a>
      </div>
      <div class="month" role="grid" aria-label={grid.label}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => <span class="muted" aria-hidden="true">{d}</span>)}
        {grid.weeks.flat().map((c) => (
          <a
            href={`/office/calendar/?d=${c.ymd}`}
            class:list={[{ out: !c.inMonth, marked: c.marked }]}
            aria-current={c.today ? 'date' : undefined}
            aria-label={c.ymd}
          >{c.day}</a>
        ))}
      </div>
    </div>
  </div>
</OfficeLayout>
```

- [ ] **Step 6: Gate and manual check**

Run: `npm run gate` — passes.
Open `/office/calendar/`: today's tasks list, month grid marks days with open tasks, arrows move a day, the date input jumps. Add a task from the page; it appears in place.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/office/calendar.mjs netlify/functions/lib/office/calendar.test.mjs src/pages/office/calendar.astro
git commit -m "Add the office calendar"
```

---

### Task 11: Dashboard

**Files:**
- Modify: `src/pages/office/index.astro`

**Interfaces:**
- Consumes: store, pipeline, calendar's `dueBucket`, `TaskRow`.

- [ ] **Step 1: Replace the placeholder**

`src/pages/office/index.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../layouts/OfficeLayout.astro';
import TaskRow from '../../components/office/TaskRow.astro';
import { store } from '../../../netlify/functions/lib/office/store.mjs';
import { loadPipelines } from '../../../netlify/functions/lib/office/pipeline.mjs';
import { todayIn } from '../../../netlify/functions/lib/office/dates.mjs';
import { dueBucket } from '../../../netlify/functions/lib/office/calendar.mjs';

const s = store();
const today = todayIn();
const pipelines = await loadPipelines(s);
const clients = await s.clients.list();
const names = new Map(clients.map((c) => [c.slug, c.business]));
const tasks = (await s.tasks.listAll()).filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due));
const buckets = { overdue: [], today: [], soon: [] };
for (const t of tasks) {
  const b = dueBucket(t, today);
  if (b in buckets) buckets[b].push(t);
}
const csrf = Astro.locals.csrf;
const boards = pipelines.map((p) => ({
  pipeline: p,
  columns: p.stages.map((st) => ({ stage: st, clients: clients.filter((c) => c.pipeline === p.id && c.stage === st.id) })),
})).filter((b) => b.columns.some((c) => c.clients.length));
---
<OfficeLayout title="Dashboard">
  <h1>Dashboard</h1>
  {clients.length === 0 && <p class="empty">No clients yet. <a href="/office/clients/new/">Add the first one.</a></p>}

  {[['overdue', 'Overdue'], ['today', 'Due today'], ['soon', 'Next three days']].map(([key, label]) => (
    <>
      <h2>{label} <span class="muted">({buckets[key].length})</span></h2>
      {buckets[key].length === 0 ? <p class="empty">Nothing.</p> : (
        <div class="table-scroll"><table>
          <tbody>{buckets[key].map((t) => <TaskRow task={t} csrf={csrf} today={today} back="/office/" showClient business={names.get(t.slug)} />)}</tbody>
        </table></div>
      )}
    </>
  ))}

  {boards.map((b) => (
    <>
      <h2>{b.pipeline.name}</h2>
      <div class="board">
        {b.columns.map((col) => (
          <div class="col">
            <h3>{col.stage.name} <span class="muted">{col.clients.length || ''}</span></h3>
            {col.clients.map((c) => <a href={`/office/clients/${c.slug}/`}>{c.business}</a>)}
          </div>
        ))}
      </div>
    </>
  ))}

  <h2>Meetings</h2>
  <p class="empty">Meetings arrive with phase 2.</p>
  <h2>Payments</h2>
  <p class="empty">Payments arrive with phase 3.</p>
</OfficeLayout>
```

- [ ] **Step 2: Gate and manual check**

Run: `npm run gate` — passes. The dashboard shows the three task groups and one board per pipeline with clients in their stage columns.

- [ ] **Step 3: Commit**

```bash
git add src/pages/office/index.astro
git commit -m "Add the office dashboard"
```

---

### Task 12: Inquiry hook

**Files:**
- Create: `netlify/functions/lib/office/inquiry.mjs`
- Create: `netlify/functions/lib/office/inquiry.test.mjs`
- Create: `netlify/functions/submission-created.mjs`

**Interfaces:**
- Consumes: `clients.mjs`, `pipeline.mjs`, store.
- Produces: `recordInquiry(data, s?, now?): Promise<{ slug, created: boolean }>` where `data` is the Netlify form payload's `data` object (`name`, `email`, `business`, `website`, `package`, `about`, `notes`).

Netlify invokes a function named exactly `submission-created` after each verified form submission, with a JSON body `{ payload: { form_name, data: {...}, created_at, ... } }`. Event functions use the classic `handler(event)` signature.

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/inquiry.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordInquiry } from './inquiry.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const NOW = new Date('2026-09-04T16:00:00Z');
const data = {
  name: 'Sierra', email: 'Sierra@Example.com', business: 'Lova Content Creation',
  website: 'https://lova.example', package: 'Search', about: 'Content for creators.', notes: 'Soon please',
};

test('a new inquiry becomes a client at the first stage with its tasks', async () => {
  const s = make();
  const r = await recordInquiry(data, s, NOW);
  assert.deepEqual(r, { slug: 'lova-content-creation', created: true });
  const c = await s.clients.get('lova-content-creation');
  assert.equal(c.stage, 'inquiry');
  assert.equal(c.tier, 'Search');
  assert.equal(c.email, 'Sierra@Example.com');
  assert.match(c.notes, /Content for creators\./);
  assert.match(c.notes, /Soon please/);
  assert.equal((await s.tasks.list('lova-content-creation')).length, 1);
});

test('a repeat inquiry from the same email is appended as a note', async () => {
  const s = make();
  await recordInquiry(data, s, NOW);
  const r = await recordInquiry({ ...data, email: 'sierra@example.com', notes: 'Second thoughts' }, s, new Date('2026-09-06T00:00:00Z'));
  assert.deepEqual(r, { slug: 'lova-content-creation', created: false });
  assert.equal((await s.clients.list()).length, 1);
  assert.match((await s.clients.get('lova-content-creation')).notes, /2026-09-06.*Second thoughts/s);
});

test('"Not sure yet" and unknown packages leave the tier blank', async () => {
  const s = make();
  await recordInquiry({ ...data, package: 'Not sure yet' }, s, NOW);
  assert.equal((await s.clients.get('lova-content-creation')).tier, '');
});

test('a garbage submission still lands rather than throwing', async () => {
  const s = make();
  const r = await recordInquiry({ email: 'x@example.com' }, s, NOW);
  assert.equal(r.created, true);
  assert.equal(r.slug, 'client');
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/inquiry.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/inquiry.mjs`:

```js
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
```

`netlify/functions/submission-created.mjs`:

```js
// Netlify calls this after every verified form submission on the site. Only
// the inquiry form matters; anything else is acknowledged and ignored. It
// must return 200 whatever happens, or Netlify retries and the log fills.
import { recordInquiry } from './lib/office/inquiry.mjs';

export const handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body ?? '{}');
    if (payload?.form_name === 'inquiry') await recordInquiry(payload.data ?? {});
  } catch (e) {
    console.error('inquiry hook failed', e);
  }
  return { statusCode: 200, body: '' };
};
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/inquiry.mjs netlify/functions/lib/office/inquiry.test.mjs netlify/functions/submission-created.mjs
git commit -m "Create a client from each inquiry submission"
```

---

### Task 13: Settings page for pipelines

**Files:**
- Create: `netlify/functions/lib/office/actions/settings.mjs`
- Create: `netlify/functions/lib/office/actions/settings.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Create: `src/pages/office/settings.astro`

**Interfaces:**
- Consumes: `validatePipelines`, `loadPipelines`, store, http.
- Produces: action `settings` with `name=pipelines`, `value=<json>`; on success writes `settings/pipelines.json` and redirects to `/office/settings/?saved=1`; on failure redirects with `?error=`.

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/actions/settings.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settings } from './settings.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/settings', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });
const valid = JSON.stringify([{ id: 'photo', name: 'Photo shoot', stages: [{ id: 'booked', name: 'Booked', tasks: [{ title: 'Confirm', due: 1 }] }] }]);

test('valid pipelines are stored', async () => {
  const s = make();
  const res = await settings(post({ csrf, name: 'pipelines', value: valid }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/settings/?saved=1');
  assert.equal((await s.settings.get('pipelines'))[0].id, 'photo');
});

test('invalid JSON and invalid pipelines go back with the reason', async () => {
  const s = make();
  let res = await settings(post({ csrf, name: 'pipelines', value: '{not json' }), ctx(), s);
  assert.match(decodeURIComponent(res.headers.get('Location')), /error=.*JSON/);
  res = await settings(post({ csrf, name: 'pipelines', value: '[{"id":"BAD","name":"x","stages":[]}]' }), ctx(), s);
  assert.match(decodeURIComponent(res.headers.get('Location')), /error=.*id must be/);
  assert.equal(await s.settings.get('pipelines'), null);
});

test('unknown setting names and bad csrf are refused', async () => {
  const s = make();
  assert.equal((await settings(post({ csrf, name: 'other', value: '[]' }), ctx(), s)).status, 400);
  assert.equal((await settings(post({ csrf: 'x', name: 'pipelines', value: valid }), ctx(), s)).status, 403);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/actions/settings.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/actions/settings.mjs`:

```js
import { readForm, redirect, problem, field, checkCsrf } from '../http.mjs';
import { store as defaultStore } from '../store.mjs';
import { validatePipelines } from '../pipeline.mjs';

// One validator per setting name. Phase 2 adds templates here.
const VALIDATORS = { __proto__: null, pipelines: validatePipelines };

const back = (errors) => redirect(`/office/settings/?error=${encodeURIComponent(errors.join('; '))}`);

export async function settings(request, ctx, s = defaultStore()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, 'stale form, reload and try again');

  const name = field(data, 'name');
  const validate = VALIDATORS[name];
  if (!validate) return problem(400, 'unknown setting');

  let value;
  try {
    value = JSON.parse(field(data, 'value'));
  } catch (e) {
    return back([`not valid JSON: ${e.message}`]);
  }
  const errors = validate(value);
  if (errors.length) return back(errors);
  await s.settings.put(name, value);
  return redirect('/office/settings/?saved=1');
}
```

Add to `actions.mjs`:

```js
import { settings } from './actions/settings.mjs';
export const actions = { __proto__: null, login, logout, client, stage, task, settings };
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/actions/settings.test.mjs`
Expected: 3 passing.

- [ ] **Step 5: Settings page**

`src/pages/office/settings.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../layouts/OfficeLayout.astro';
import { store } from '../../../netlify/functions/lib/office/store.mjs';
import { loadPipelines } from '../../../netlify/functions/lib/office/pipeline.mjs';

const s = store();
const pipelines = await loadPipelines(s);
const stored = (await s.settings.get('pipelines')) !== null;
const error = Astro.url.searchParams.get('error');
const saved = Astro.url.searchParams.get('saved');
---
<OfficeLayout title="Settings">
  <h1>Settings</h1>
  <h2>Pipelines</h2>
  <p class="muted">
    {stored ? 'Edited in the office; the copy in git is the seed.' : 'Showing the seed from src/data/office/pipelines.json. Saving stores a copy here that survives deploys.'}
    A pipeline is a list of stages; each stage lists the tasks it creates, with <code>due</code> as days after the stage starts, and optionally the <code>email</code> it opens and the <code>questionnaire</code> or <code>payment</code> a task waits on.
  </p>
  {error && <p class="error">{error}</p>}
  {saved && <p class="badge">Saved</p>}
  <form method="POST" action="/office/api/settings">
    <input type="hidden" name="csrf" value={Astro.locals.csrf} />
    <input type="hidden" name="name" value="pipelines" />
    <textarea name="value" class="json" aria-label="Pipelines as JSON" spellcheck="false">{JSON.stringify(pipelines, null, 2)}</textarea>
    <p><button class="btn btn-small">Save pipelines</button></p>
  </form>
</OfficeLayout>
```

- [ ] **Step 6: Gate and manual check**

Run: `npm run gate` — passes. Save the seed unchanged: "Saved". Break the JSON: the error names the problem and the store is untouched.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/office/actions/settings.mjs netlify/functions/lib/office/actions/settings.test.mjs netlify/functions/lib/office/actions.mjs src/pages/office/settings.astro
git commit -m "Add the pipelines settings page"
```

---

### Task 14: Data page and export

**Files:**
- Create: `netlify/functions/lib/office/csv.mjs`
- Create: `netlify/functions/lib/office/csv.test.mjs`
- Create: `netlify/functions/lib/office/actions/export.mjs`
- Create: `netlify/functions/lib/office/actions/export.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Create: `src/pages/office/data.astro`

**Interfaces:**
- Consumes: store (`counts`, `listAll`), http.
- Produces:
  - `toCsv(rows: object[]): string` — header from the union of keys in first-seen order; nested values as JSON; RFC 4180 quoting; cells beginning with `=`, `+`, `-`, `@` prefixed with `'` so a spreadsheet never runs them.
  - Action `export` on GET: `?type=clients|tasks|meetings|payments|agreements|emails&format=json|csv`; returns the file as an attachment named `{type}-{YYYY-MM-DD}.{ext}`.

- [ ] **Step 1: Failing csv tests**

`netlify/functions/lib/office/csv.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from './csv.mjs';

test('header is the union of keys in first-seen order', () => {
  const out = toCsv([{ a: 1, b: 'x' }, { b: 'y', c: true }]);
  assert.equal(out, 'a,b,c\r\n1,x,\r\n,y,true\r\n');
});

test('quotes commas, quotes and newlines; nests as JSON; disarms formulas', () => {
  const out = toCsv([{ t: 'a, "b"\nc', o: { k: 1 }, l: [1, 2], f: '=SUM(A1)', n: null }]);
  assert.equal(out, 't,o,l,f,n\r\n"a, ""b""\nc","{""k"":1}","[1,2]",\'=SUM(A1),\r\n');
});

test('no rows gives an empty string', () => {
  assert.equal(toCsv([]), '');
});
```

- [ ] **Step 2: Failing export tests**

`netlify/functions/lib/office/actions/export.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportData } from './export.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { newId } from '../ids.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', business: 'Lova', email: 'l@example.com' });
  await s.tasks.put('lova', newId(), { slug: 'lova', title: 'x', due: '2026-09-10' });
  return s;
};
const get = (q) => new Request(`https://site.test/office/api/export?${q}`);
const ctx = { admin: { email: 'me' }, csrf: '' };

test('json export returns the documents as an attachment', async () => {
  const res = await exportData(get('type=clients&format=json'), ctx, await make(), new Date('2026-09-04T16:00:00Z'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="clients-2026-09-04.json"');
  assert.equal((await res.json())[0].slug, 'lova');
});

test('csv export flattens documents', async () => {
  const res = await exportData(get('type=tasks&format=csv'), ctx, await make());
  assert.match(res.headers.get('Content-Type'), /text\/csv/);
  assert.match(await res.text(), /^slug,title,due\r\nlova,x,2026-09-10\r\n$/);
});

test('unknown type or format is 400; POST is 405', async () => {
  const s = await make();
  assert.equal((await exportData(get('type=secrets&format=json'), ctx, s)).status, 400);
  assert.equal((await exportData(get('type=clients&format=xml'), ctx, s)).status, 400);
  assert.equal((await exportData(new Request('https://site.test/office/api/export', { method: 'POST' }), ctx, s)).status, 405);
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/csv.test.mjs netlify/functions/lib/office/actions/export.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 4: Implement csv**

`netlify/functions/lib/office/csv.mjs`:

```js
// CSV for a bookkeeper's spreadsheet. Nested values go out as JSON text
// rather than being dropped; a leading formula character gets an apostrophe
// because Excel and Sheets would otherwise execute it.
const cell = (v) => {
  let s;
  if (v == null) s = '';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  if (rows.length === 0) return '';
  const keys = [];
  const seen = new Set();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  const lines = [keys.map(cell).join(',')];
  for (const r of rows) lines.push(keys.map((k) => cell(r[k])).join(','));
  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 5: Implement export**

`netlify/functions/lib/office/actions/export.mjs`:

```js
import { problem } from '../http.mjs';
import { store as defaultStore, TYPES } from '../store.mjs';
import { toCsv } from '../csv.mjs';
import { todayIn } from '../dates.mjs';

const FORMATS = {
  json: { type: 'application/json', body: (rows) => JSON.stringify(rows, null, 2) },
  csv: { type: 'text/csv; charset=utf-8', body: toCsv },
};

// A GET behind the guard; nothing is written, so no CSRF token is needed.
export async function exportData(request, _ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'GET') return problem(405, 'GET only');
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? '';
  const format = FORMATS[url.searchParams.get('format') ?? ''];
  if (!format || !(type === 'clients' || TYPES.includes(type))) return problem(400, 'unknown type or format');
  const rows = type === 'clients' ? await s.clients.list() : await s[type].listAll();
  const name = `${type}-${todayIn(undefined, now)}.${url.searchParams.get('format')}`;
  return new Response(format.body(rows), {
    status: 200,
    headers: {
      'Content-Type': format.type,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
```

Add to `actions.mjs` (the map key is `export`, a reserved word, so the import is renamed):

```js
import { exportData } from './actions/export.mjs';
export const actions = { __proto__: null, login, logout, client, stage, task, settings, export: exportData };
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 7: Data page**

`src/pages/office/data.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../layouts/OfficeLayout.astro';
import { store } from '../../../netlify/functions/lib/office/store.mjs';

const counts = await store().counts();
const types = Object.entries(counts);
const local = Boolean(process.env.OFFICE_STORE_DIR);
---
<OfficeLayout title="Data">
  <h1>Data</h1>
  <p class="muted">
    {local ? `Reading the local file store at ${process.env.OFFICE_STORE_DIR}.` : 'Reading the Netlify Blobs store named office. The Netlify dashboard shows the same keys as raw JSON.'}
  </p>
  <div class="table-scroll"><table>
    <thead><tr><th>Type</th><th class="num">Documents</th><th>Download</th></tr></thead>
    <tbody>
      {types.map(([type, n]) => (
        <tr>
          <td>{type}</td>
          <td class="num">{n}</td>
          <td>
            <a href={`/office/api/export?type=${type}&format=json`}>JSON</a>
            {' · '}
            <a href={`/office/api/export?type=${type}&format=csv`}>CSV</a>
          </td>
        </tr>
      ))}
    </tbody>
  </table></div>
</OfficeLayout>
```

- [ ] **Step 8: Gate and manual check**

Run: `npm run gate` — passes. `/office/data/` shows counts; both downloads open in a spreadsheet with the client rows.

- [ ] **Step 9: Commit**

```bash
git add netlify/functions/lib/office/csv.mjs netlify/functions/lib/office/csv.test.mjs netlify/functions/lib/office/actions/export.mjs netlify/functions/lib/office/actions/export.test.mjs netlify/functions/lib/office/actions.mjs src/pages/office/data.astro
git commit -m "Add the data page and exports"
```

---

### Task 15: Documentation and deploy checklist

**Files:**
- Modify: `README.md`
- Modify: `netlify.toml` (Lighthouse audit for the login page)

- [ ] **Step 1: Lighthouse audit for the login page**

In `netlify.toml`, add after the `questionnaire/build/index.html` audit block:

```toml
  [[plugins.inputs.audits]]
    path = "office/login/index.html"
    output_path = "reports/lighthouse-office-login.html"
    [plugins.inputs.audits.thresholds]
      performance = 0.95
      accessibility = 1.0
      best-practices = 0.9
      seo = 0
```

`seo = 0` because the page is deliberately `noindex`, which Lighthouse's SEO audit fails.

- [ ] **Step 2: README section**

Add to `README.md` after "Running the client questionnaires":

````markdown
## The office (/office)

A private back office for running clients: pipeline stages, tasks, a
calendar, each client's questionnaire answers, and data export. Design:
`docs/superpowers/specs/2026-09-04-client-office-design.md`. Later phases
add email, meetings, payments and e-signed agreements.

### Who can log in

Netlify Identity users with the `admin` role. Netlify → Identity → invite
the address, then open the user and add `admin` under Roles. Nothing else
grants access; a logged-in Identity user without the role is refused.

### Environment variables

| Variable | What it does |
|---|---|
| `KEEPSITE_SESSION_SECRET` | Signs the CSRF cookie. Any long random string. Without it every office form post is refused. |
| `KEEPSITE_TOKEN_SECRET` | Already set for the questionnaires; the office uses it to show each client's questionnaire links. |

### Local development

The office renders on the server, and its store and login are Netlify
services. Two environment variables stand in for them locally:

```bash
KEEPSITE_SESSION_SECRET=dev KEEPSITE_TOKEN_SECRET=... npm run dev:office
```

`dev:office` sets `OFFICE_STORE_DIR=.office-data` (a gitignored directory
of JSON files in place of Netlify Blobs) and `IDENTITY_URL` pointing at the
production Identity service, so you log in with your real account. Delete
`.office-data/` to start over.

### Where the data is

Netlify → Blobs → `office`. Keys are `clients/{slug}.json`,
`tasks/{slug}/{id}.json`, and so on; `/office/data/` lists every type with
counts and downloads any of them as JSON or CSV. Questionnaire answers stay
in the `questionnaires` store and are read from there.

### Inquiries

Every verified `/start/` submission also creates a client at the Inquiry
stage, through `netlify/functions/submission-created.mjs`. The email
notification is unchanged. A second inquiry from an email already on file is
added to that client's notes instead.
````

- [ ] **Step 3: Full gate and test run**

Run: `npm test && npm run gate`
Expected: every suite passes; the gate passes.

- [ ] **Step 4: Commit**

```bash
git add README.md netlify.toml
git commit -m "Document the office and audit its login page"
```

- [ ] **Step 5: Deploy checklist (by hand, after merge)**

1. Netlify → Site configuration → Environment variables: add `KEEPSITE_SESSION_SECRET`.
2. Netlify → Identity: confirm your user has the `admin` role.
3. Deploy. Open `/office/` logged out: expect the login page. Log in: expect the dashboard.
4. `curl -sI https://www.keepsitemedia.com/office/ | grep -i 'x-robots-tag'`: expect `noindex, nofollow`.
5. `curl -s -o /dev/null -w '%{http_code}' https://www.keepsitemedia.com/api/questionnaire`: expect `405`. This proves the questionnaire redirect still reaches its function with the adapter installed.
6. Submit the `/start/` form once with a test address: expect a client at Inquiry in `/office/clients/` and the usual notification email.
