# Client Office Phase 5: Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every client a Documents tab that lists, streams, uploads and removes files; replace the manual "save the attachment" step with `scripts/pull-intake.mjs`; and close the two phase 4 residuals (the signing-token scan and the seal race) with a token index and a conditional-write lock.

**Architecture:** Documents already live as bytes plus a `.meta.json` sidecar under `documents/{slug}/` in the `office` Blobs store, and questionnaire uploads live in the `questionnaires` store under `{slug}/`. A new `documents.mjs` merges both into one listing; a `document` office action handles multipart upload and removal; two Astro routes stream bytes behind the admin guard. `backends.mjs` gains one conditional write (`setTextIfNew`, Blobs `onlyIfNew`), which gives the store a `locks` accessor for the seal and a `tokens` index that `findByToken` reads before falling back to the scan. The pull script is a thin CLI over a tested `intake.mjs`.

**Tech Stack:** Node 20, Astro 5 SSR routes, `@netlify/blobs` 10.x (conditional writes), `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-client-office-design.md` — sections "Documents", "Data model", "Agreements and e-sign" (signing paragraph), "Secrets", "Phases" (5).

## Global Constraints

- Node 20; no TypeScript under `netlify/functions/`, `.mjs` only, so `node --test` runs it directly. Tests live beside their module as `*.test.mjs`.
- Every office page and route exports `prerender = false`; the middleware guards `/office/` and requires the `admin` role; Blobs is never exposed as a public URL.
- `store.mjs` is the only module that knows what a key looks like; pages and actions call its accessors and nothing lower.
- Actions are `(request, ctx) => Response`, POST only, CSRF-checked; `readForm` refuses duplicate field names; `scripts/check-office.mjs` fails any form under `src/pages` with duplicate control names.
- Uploads take one file at a time, up to 6 MB (the Netlify function body limit), stored under `safeName` from `netlify/functions/lib/blob-key.mjs`.
- `agreement-state.mjs` is the only code that changes an agreement's or a signer's status.
- `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` are local-only secrets for the pull script; never read them in a function.
- Comments explain why, never what. Commit subjects imperative, under 50 characters, ending with the session trailers:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XJwFEcdChiaw23fdcQYygF
  ```
- `npm run gate` (`test`, `check`, `check:forms`, `check:office`, `build`, `verify`) must pass at the end of every task that touches `src/`, `package.json` or `scripts/verify.mjs`.

---

### Task 1: Conditional writes, locks, the token index and document removal

**Files:**
- Modify: `netlify/functions/lib/office/backends.mjs`
- Modify: `netlify/functions/lib/office/store.mjs`
- Test: `netlify/functions/lib/office/backends.test.mjs` (create if absent), `netlify/functions/lib/office/store.test.mjs`

**Interfaces:**
- Consumes: the existing backend shape (`getText`, `setText`, `getBytes`, `setBytes`, `list`, `remove`).
- Produces:
  - Backend `setTextIfNew(key, text): Promise<boolean>` — true when the key did not exist and was written; false when it already existed. Memory: `Map.has`; file: `fs.writeFile` with flag `'wx'`, `EEXIST` → false; Blobs: `set(key, text, { onlyIfNew: true })` → `modified`.
  - `s.locks.acquire(name): Promise<boolean>` — `locks/{name}` via `setTextIfNew`; `name` matches `/^[a-z]+-[A-Za-z0-9_-]{1,80}$/`.
  - `s.tokens.get(token): Promise<{slug,id,party}|null>`, `s.tokens.put(token, ref)` — key `tokens/{token}.json`; token matches `/^[A-Za-z0-9_-]{43}$/` (`TOKEN`, exported from `store.mjs` so `sign.mjs` can import it from one place later).
  - `s.documents.remove(slug, name)` — deletes the bytes and the `.meta.json` sidecar.
  - `s.questionnaires.file(slug, name): Promise<Uint8Array|null>` — bytes of `{slug}/{name}` in the `questionnaires` store; `name` validated by `DOC_NAME`.
  - `s.questionnaires.files(slug)` unchanged (returns full keys `slug/name`).

- [ ] **Step 1: Failing tests**

Append to `netlify/functions/lib/office/store.test.mjs`:

```js
test('locks are acquired once', async () => {
  const s = make();
  assert.equal(await s.locks.acquire('seal-abc'), true);
  assert.equal(await s.locks.acquire('seal-abc'), false);
  assert.equal(await s.locks.acquire('seal-def'), true);
  await assert.rejects(() => s.locks.acquire('bad name!'), /bad lock/);
});

test('tokens index round-trips and rejects bad tokens', async () => {
  const s = make();
  const tok = 'A'.repeat(43);
  assert.equal(await s.tokens.get(tok), null);
  await s.tokens.put(tok, { slug: 'lova', id: 'x', party: 'client' });
  assert.deepEqual(await s.tokens.get(tok), { slug: 'lova', id: 'x', party: 'client' });
  await assert.rejects(() => s.tokens.put('short', {}), /bad token/);
  await assert.rejects(() => s.tokens.get('../clients/lova.json'), /bad token/);
});

test('documents remove bytes and sidecar together', async () => {
  const s = make();
  await s.documents.put('lova', 'brief.pdf', new Uint8Array([1, 2, 3]), { type: 'application/pdf' });
  assert.equal((await s.documents.list('lova')).length, 1);
  await s.documents.remove('lova', 'brief.pdf');
  assert.equal(await s.documents.get('lova', 'brief.pdf'), null);
  assert.equal(await s.documents.meta('lova', 'brief.pdf'), null);
  assert.deepEqual(await s.documents.list('lova'), []);
});

test('questionnaire files are readable by name', async () => {
  const q = memoryBackend();
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  await q.setBytes('lova/logo-mark.png', new Uint8Array([137, 80]));
  assert.deepEqual([...(await s.questionnaires.file('lova', 'logo-mark.png'))], [137, 80]);
  assert.equal(await s.questionnaires.file('lova', 'none.png'), null);
  await assert.rejects(() => s.questionnaires.file('lova', '../acme/logo.png'), /bad document name/);
});
```

Create `netlify/functions/lib/office/backends.test.mjs` (or append if it exists):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { memoryBackend, fileBackend } from './backends.mjs';

for (const [label, make] of [
  ['memory', async () => memoryBackend()],
  ['file', async () => fileBackend(await fs.mkdtemp(path.join(os.tmpdir(), 'office-')))],
]) {
  test(`${label} setTextIfNew writes once`, async () => {
    const b = await make();
    assert.equal(await b.setTextIfNew('locks/a', '1'), true);
    assert.equal(await b.setTextIfNew('locks/a', '2'), false);
    assert.equal(await b.getText('locks/a'), '1');
    // Ten racers, one winner.
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => b.setTextIfNew('locks/b', String(i))));
    assert.equal(results.filter(Boolean).length, 1);
  });
}
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test netlify/functions/lib/office/store.test.mjs netlify/functions/lib/office/backends.test.mjs`
Expected: FAIL — `s.locks` undefined, `setTextIfNew is not a function`.

- [ ] **Step 3: Implement**

In `backends.mjs`, add to `memoryBackend`:

```js
    async setTextIfNew(key, text) {
      if (map.has(key)) return false;
      map.set(key, text);
      return true;
    },
```

to `fileBackend`:

```js
    async setTextIfNew(key, text) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      // 'wx' fails with EEXIST when the file is already there, which is the
      // whole point: two racers cannot both create it.
      try { await fs.writeFile(file(key), text, { flag: 'wx' }); return true; } catch (e) {
        if (e.code === 'EEXIST') return false;
        throw e;
      }
    },
```

to `blobsBackend`:

```js
    async setTextIfNew(key, text) {
      const { modified } = await (await open()).set(key, text, { onlyIfNew: true });
      return modified;
    },
```

Update the file's header comment: the shape is now five methods plus one conditional write, and say why (the seal lock and the token index need a write that fails if the key exists, which Blobs offers as `onlyIfNew`).

In `store.mjs`:

```js
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LOCK = /^[a-z]+-[A-Za-z0-9_-]{1,80}$/;
const assertToken = assertName(TOKEN, 'token');
const assertLock = assertName(LOCK, 'lock');
```

Extend `documents(backend)` with:

```js
    async remove(slug, name) {
      await backend.remove(key(slug, name));
      await backend.remove(`${key(slug, name)}.meta.json`);
    },
```

Extend `questionnaires` with:

```js
      async file(slug, name) { return questionnaires.getBytes(`${assertSlug(slug)}/${assertDocName(name)}`); },
```

Add to the store object:

```js
    tokens: {
      async get(token) { return readJSON(office, `tokens/${assertToken(token)}.json`); },
      async put(token, ref) { return writeJSON(office, `tokens/${assertToken(token)}.json`, ref); },
    },
    // A lock is a key that can be created once. There is no release: a seal
    // happens once per agreement, so the lock's name carries the agreement id
    // and is never reused.
    locks: {
      async acquire(name) { return office.setTextIfNew(`locks/${assertLock(name)}`, new Date().toISOString()); },
    },
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/store.test.mjs netlify/functions/lib/office/backends.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/backends.mjs netlify/functions/lib/office/backends.test.mjs netlify/functions/lib/office/store.mjs netlify/functions/lib/office/store.test.mjs
git commit -m "Add conditional writes, locks and a token index"
```

---

### Task 2: The documents module

**Files:**
- Create: `netlify/functions/lib/office/documents.mjs`
- Test: `netlify/functions/lib/office/documents.test.mjs`

**Interfaces:**
- Consumes: `s.documents.list(slug)`, `s.questionnaires.files(slug)` (Task 1 shape).
- Produces:
  - `UPLOAD_MAX = 6 * 1024 * 1024`.
  - `contentType(name): string` — by extension: pdf, png, jpg/jpeg, gif, webp, svg → `image/svg+xml`, txt, csv, json, md → `text/markdown`, doc/docx, xls/xlsx, zip; default `application/octet-stream`.
  - `disposition(type, name): string` — `inline; filename="…"` for `application/pdf` and `image/png|jpeg|gif|webp`; `attachment; filename="…"` otherwise (SVG is attachment: it can carry script). `name` is already `DOC_NAME`-safe, so it is quoted as-is.
  - `formatSize(bytes): string` — `null` → `''`; `< 1024` → `N B`; `< 1 MB` → `N KB` (no decimals); else `N.N MB`.
  - `validateUpload(file): string|null` — `'choose a file'` when not a File or size 0; `'file is larger than 6 MB'` when over `UPLOAD_MAX`; `null` when fine.
  - `listDocuments(slug, s): Promise<Row[]>` where `Row = { name, size: number|null, type, source, uploadedAt: string|null, href, removable: boolean }`. Office documents map `meta` fields; `href = /office/documents/{slug}/{name}`; `removable = source === 'upload'`. Questionnaire files (keys `slug/name`) map to `{ name, size: null, type: contentType(name), source: 'questionnaire', uploadedAt: null, href: /office/documents/{slug}/intake/{name}, removable: false }`. Sorted by `uploadedAt` descending with nulls last, then name.

- [ ] **Step 1: Failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentType, disposition, formatSize, validateUpload, listDocuments, UPLOAD_MAX } from './documents.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

test('content types come from the extension and default to octet-stream', () => {
  assert.equal(contentType('brief.PDF'), 'application/pdf');
  assert.equal(contentType('logo-mark.png'), 'image/png');
  assert.equal(contentType('notes.md'), 'text/markdown');
  assert.equal(contentType('mystery'), 'application/octet-stream');
});

test('only images and PDFs are shown inline', () => {
  assert.equal(disposition('application/pdf', 'a.pdf'), 'inline; filename="a.pdf"');
  assert.equal(disposition('image/png', 'a.png'), 'inline; filename="a.png"');
  assert.equal(disposition('image/svg+xml', 'a.svg'), 'attachment; filename="a.svg"');
  assert.equal(disposition('text/plain', 'a.txt'), 'attachment; filename="a.txt"');
});

test('sizes format for humans', () => {
  assert.equal(formatSize(null), '');
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(20 * 1024), '20 KB');
  assert.equal(formatSize(1.5 * 1024 * 1024), '1.5 MB');
});

test('uploads must be a non-empty file under the limit', () => {
  assert.equal(validateUpload(null), 'choose a file');
  assert.equal(validateUpload(new File([], 'empty.txt')), 'choose a file');
  assert.equal(validateUpload(new File([new Uint8Array(UPLOAD_MAX + 1)], 'big.bin')), 'file is larger than 6 MB');
  assert.equal(validateUpload(new File([new Uint8Array(10)], 'ok.bin')), null);
});

test('listDocuments merges office documents and questionnaire files, newest first', async () => {
  const q = memoryBackend();
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array(4), { type: 'application/pdf', source: 'seal' }, new Date('2026-09-05T10:00:00Z'));
  await s.documents.put('lova', 'brief.pdf', new Uint8Array(8), { type: 'application/pdf', source: 'upload' }, new Date('2026-09-06T10:00:00Z'));
  await q.setBytes('lova/logo-mark.png', new Uint8Array(2));
  await q.setText('lova/intro.json', '{}');
  const rows = await listDocuments('lova', s);
  assert.deepEqual(rows.map((r) => r.name), ['brief.pdf', 'agreement-1.pdf', 'logo-mark.png']);
  assert.deepEqual(rows.map((r) => r.removable), [true, false, false]);
  assert.equal(rows[0].href, '/office/documents/lova/brief.pdf');
  assert.equal(rows[2].href, '/office/documents/lova/intake/logo-mark.png');
  assert.equal(rows[2].source, 'questionnaire');
  assert.equal(rows[2].type, 'image/png');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test netlify/functions/lib/office/documents.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// One listing for everything a client has on file: sealed agreements and
// signature images (office store), admin uploads (office store), and the
// files a client attached to a questionnaire (questionnaires store). The
// two stores stay separate because the questionnaire function writes the
// second one without knowing the office exists.
export const UPLOAD_MAX = 6 * 1024 * 1024;

const TYPES = {
  __proto__: null,
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', txt: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};
export const contentType = (name) => TYPES[String(name).toLowerCase().split('.').pop()] ?? 'application/octet-stream';

// Inline only for types a browser renders without running anything; SVG can
// carry script, so it downloads like everything else.
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export const disposition = (type, name) => `${INLINE.has(type) ? 'inline' : 'attachment'}; filename="${name}"`;

export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateUpload(file) {
  if (!file || typeof file === 'string' || !file.size) return 'choose a file';
  if (file.size > UPLOAD_MAX) return 'file is larger than 6 MB';
  return null;
}

export async function listDocuments(slug, s) {
  const own = (await s.documents.list(slug)).map((m) => ({
    name: m.name, size: m.size ?? null, type: m.type, source: m.source, uploadedAt: m.uploadedAt ?? null,
    href: `/office/documents/${slug}/${m.name}`, removable: m.source === 'upload',
  }));
  const intake = (await s.questionnaires.files(slug)).map((k) => k.slice(slug.length + 1)).map((name) => ({
    name, size: null, type: contentType(name), source: 'questionnaire', uploadedAt: null,
    href: `/office/documents/${slug}/intake/${name}`, removable: false,
  }));
  return [...own, ...intake].sort((a, b) => {
    if (a.uploadedAt && b.uploadedAt) return b.uploadedAt.localeCompare(a.uploadedAt);
    if (a.uploadedAt || b.uploadedAt) return a.uploadedAt ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
```

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/documents.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/documents.mjs netlify/functions/lib/office/documents.test.mjs
git commit -m "Add the documents listing module"
```

---

### Task 3: The document action

**Files:**
- Create: `netlify/functions/lib/office/actions/document.mjs`
- Test: `netlify/functions/lib/office/actions/document.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`

**Interfaces:**
- Consumes: `readForm`, `field`, `redirect`, `problem`, `checkCsrf`, `CSRF_REFUSED` (`http.mjs`); `safeName` (`../../blob-key.mjs`); `validateUpload`, `contentType` (Task 2); `s.documents.put/meta/remove`.
- Produces: action `document` (POST, csrf, multipart): `op=upload` with file input `file` → stores `documents/{slug}/{safeName(file.name)}` with `{ type: file.type || contentType(name), source: 'upload', uploadedBy: ctx.admin?.email ?? null }`, then 303 to `/office/clients/{slug}/?tab=documents`; refuses to overwrite a document whose existing meta `source !== 'upload'` (`error=that name belongs to a sealed or signed document`); `op=remove` with `name` → removes only when meta `source === 'upload'`, else `error=only uploads can be removed`; validation errors 303 with `error=`; unknown op 400.

- [ ] **Step 1: Failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { document } from './document.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com', tier: 'Search' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/document', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me@x' }, csrf });
const NOW = new Date('2026-09-08T16:00:00Z');
const loc = (res) => decodeURIComponent(res.headers.get('Location'));
const pdf = (name) => new File([new Uint8Array([37, 80, 68, 70])], name, { type: 'application/pdf' });

test('upload stores the file under its safe name with upload metadata', async () => {
  const s = await make();
  const res = await document(post({ csrf, op: 'upload', slug: 'lova', file: pdf('../Brand Brief (final).pdf') }), ctx(), s, NOW);
  assert.equal(loc(res), '/office/clients/lova/?tab=documents');
  const meta = await s.documents.meta('lova', 'Brand-Brief-final-.pdf');
  assert.equal(meta.source, 'upload');
  assert.equal(meta.type, 'application/pdf');
  assert.equal(meta.uploadedBy, 'me@x');
  assert.equal(meta.size, 4);
  assert.equal(meta.uploadedAt, NOW.toISOString());
});

test('an empty or missing file is refused with a message, not a 500', async () => {
  const s = await make();
  const res = await document(post({ csrf, op: 'upload', slug: 'lova' }), ctx(), s, NOW);
  assert.equal(loc(res), '/office/clients/lova/?tab=documents&error=choose a file');
  assert.deepEqual(await s.documents.list('lova'), []);
});

test('an upload cannot overwrite a sealed or signed document', async () => {
  const s = await make();
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'seal' });
  const res = await document(post({ csrf, op: 'upload', slug: 'lova', file: pdf('agreement-1.pdf') }), ctx(), s, NOW);
  assert.match(loc(res), /error=that name belongs to a sealed or signed document/);
  assert.deepEqual([...(await s.documents.get('lova', 'agreement-1.pdf'))], [1]);
});

test('remove deletes an upload and refuses anything else', async () => {
  const s = await make();
  await s.documents.put('lova', 'brief.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'upload' });
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'seal' });
  assert.equal(loc(await document(post({ csrf, op: 'remove', slug: 'lova', name: 'brief.pdf' }), ctx(), s, NOW)), '/office/clients/lova/?tab=documents');
  assert.equal(await s.documents.meta('lova', 'brief.pdf'), null);
  assert.match(loc(await document(post({ csrf, op: 'remove', slug: 'lova', name: 'agreement-1.pdf' }), ctx(), s, NOW)), /error=only uploads can be removed/);
  assert.ok(await s.documents.meta('lova', 'agreement-1.pdf'));
  assert.match(loc(await document(post({ csrf, op: 'remove', slug: 'lova', name: 'nope.pdf' }), ctx(), s, NOW)), /error=no such document/);
});

test('method, form, csrf, slug and op are checked in that order', async () => {
  const s = await make();
  assert.equal((await document(new Request('https://site.test/office/api/document'), ctx(), s, NOW)).status, 405);
  assert.equal((await document(post({ op: 'upload', slug: 'lova' }), ctx(), s, NOW)).status, 403);
  assert.equal((await document(post({ csrf, op: 'upload', slug: 'Nope' }), ctx(), s, NOW)).status, 400);
  assert.equal((await document(post({ csrf, op: 'upload', slug: 'acme' }), ctx(), s, NOW)).status, 404);
  assert.equal((await document(post({ csrf, op: 'rename', slug: 'lova' }), ctx(), s, NOW)).status, 400);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test netlify/functions/lib/office/actions/document.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { safeName } from '../../blob-key.mjs';
import { validateUpload, contentType } from '../documents.mjs';

export async function document(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  if (!(await s.clients.get(slug))) return problem(404, 'no such client');
  const op = field(data, 'op');
  if (!['upload', 'remove'].includes(op)) return problem(400, 'unknown op');

  const tab = `/office/clients/${slug}/?tab=documents`;
  const back = (message) => redirect(`${tab}&error=${encodeURIComponent(message)}`);

  if (op === 'upload') {
    const file = data.get('file');
    const invalid = validateUpload(file);
    if (invalid) return back(invalid);
    const name = safeName(file.name);
    // Sealed PDFs and signature images share the namespace; an upload must
    // never be able to replace the evidence they hold.
    const existing = await s.documents.meta(slug, name);
    if (existing && existing.source !== 'upload') return back('that name belongs to a sealed or signed document');
    const bytes = new Uint8Array(await file.arrayBuffer());
    await s.documents.put(slug, name, bytes, { type: file.type || contentType(name), source: 'upload', uploadedBy: ctx.admin?.email ?? null }, now);
    return redirect(tab);
  }

  const name = field(data, 'name');
  let meta;
  try { meta = await s.documents.meta(slug, name); } catch { return back('no such document'); }
  if (!meta) return back('no such document');
  if (meta.source !== 'upload') return back('only uploads can be removed');
  await s.documents.remove(slug, name);
  return redirect(tab);
}
```

Register it in `actions.mjs`: `import { document } from './actions/document.mjs';` and add `document` to the map.

- [ ] **Step 4: Run tests**

Run: `node --test netlify/functions/lib/office/actions/document.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/document.mjs netlify/functions/lib/office/actions/document.test.mjs netlify/functions/lib/office/actions.mjs
git commit -m "Add the document upload and remove action"
```

---

### Task 4: Streaming routes and the Documents tab

**Files:**
- Create: `src/pages/office/documents/[slug]/[name].ts`
- Create: `src/pages/office/documents/[slug]/intake/[name].ts`
- Modify: `src/pages/office/clients/[slug].astro`
- Modify: `src/styles/office.css`
- Modify: `README.md` (Documents paragraph in the office section)

**Interfaces:**
- Consumes: `listDocuments`, `formatSize`, `disposition`, `contentType` (Task 2); `s.documents.get/meta`, `s.questionnaires.file` (Task 1); the `document` action (Task 3).
- Produces: `GET /office/documents/{slug}/{name}` streams an office document with `Content-Type` from its meta, `Content-Disposition` from `disposition`, `Cache-Control: private, no-store`; 404 for a bad slug/name or a missing document. `GET /office/documents/{slug}/intake/{name}` does the same for a questionnaire file with `contentType(name)`. The client page gains a `documents` tab.

- [ ] **Step 1: Routes**

`src/pages/office/documents/[slug]/[name].ts`:

```ts
export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG } from '../../../../../netlify/functions/lib/office/store.mjs';
import { disposition } from '../../../../../netlify/functions/lib/office/documents.mjs';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  const name = params.name ?? '';
  if (!SLUG.test(slug) || !NAME.test(name) || name.endsWith('.meta.json')) return new Response('not found', { status: 404 });
  const s = store();
  const meta = (await s.documents.meta(slug, name)) as { type: string } | null;
  const bytes = meta ? ((await s.documents.get(slug, name)) as Uint8Array | null) : null;
  if (!meta || !bytes) return new Response('not found', { status: 404 });
  return new Response(bytes, {
    headers: { 'Content-Type': meta.type, 'Content-Disposition': disposition(meta.type, name), 'Cache-Control': 'private, no-store' },
  });
};
```

`src/pages/office/documents/[slug]/intake/[name].ts`:

```ts
export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG } from '../../../../../../netlify/functions/lib/office/store.mjs';
import { disposition, contentType } from '../../../../../../netlify/functions/lib/office/documents.mjs';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  const name = params.name ?? '';
  if (!SLUG.test(slug) || !NAME.test(name)) return new Response('not found', { status: 404 });
  const bytes = (await store().questionnaires.file(slug, name)) as Uint8Array | null;
  if (!bytes) return new Response('not found', { status: 404 });
  const type = contentType(name);
  return new Response(bytes, {
    headers: { 'Content-Type': type, 'Content-Disposition': disposition(type, name), 'Cache-Control': 'private, no-store' },
  });
};
```

- [ ] **Step 2: The tab**

In `src/pages/office/clients/[slug].astro`:

- Import `listDocuments`, `formatSize` from `../../../../netlify/functions/lib/office/documents.mjs`.
- Add a type: `type DocumentRow = { name: string; size: number | null; type: string; source: string; uploadedAt: string | null; href: string; removable: boolean };`
- Load: `const documents = tab === 'documents' ? ((await listDocuments(slug, s)) as DocumentRow[]) : [];`
- Add `['documents', 'Documents']` to `tabs` after `emails`.
- Render, after the `emails` block:

```astro
  {tab === 'documents' && (
    <>
      <h2>Documents</h2>
      {documents.length === 0 && <p class="empty">Nothing on file yet.</p>}
      {documents.length > 0 && (
        <div class="table-scroll"><table>
          <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Source</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {documents.map((d) => (
              <tr>
                <td><a href={d.href}>{d.name}</a></td>
                <td class="muted">{d.type}</td>
                <td>{formatSize(d.size)}</td>
                <td><span class="badge">{d.source}</span></td>
                <td>{d.uploadedAt ? formatYmd(todayIn(undefined, new Date(d.uploadedAt))) : ''}</td>
                <td>
                  {d.removable && (
                    <form method="POST" action="/office/api/document" class="inline">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="op" value="remove" />
                      <input type="hidden" name="name" value={d.name} />
                      <button class="btn-outline btn-small" onclick="return confirm('Remove this file?')">Remove</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <h2>Upload a file</h2>
      <p class="muted">One file at a time, up to 6 MB. Sealed agreements and signature images cannot be replaced.</p>
      <form method="POST" action="/office/api/document" enctype="multipart/form-data" class="upload">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="op" value="upload" />
        <label>File <input type="file" name="file" required /></label>
        <button class="btn">Upload</button>
      </form>
    </>
  )}
```

Source labels: `seal` (sealed PDF), `sign` (signature image), `upload`, `questionnaire`. The sources are stored words, so the badge shows them as they are.

In `src/styles/office.css` append:

```css
.office form.upload { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; }
.office form.upload input[type="file"] { display: block; margin-top: 0.25rem; }
```

- [ ] **Step 3: README**

In `README.md`, in the office section after the Agreements subsection, add:

````markdown
### Documents

A client's Documents tab lists everything on file: sealed agreements and
signature images, files the admin uploaded, and the logo or brand guide the
client attached to a questionnaire. Every link streams through the office
behind the admin login; nothing in Blobs has a public URL. Uploads take one
file at a time, up to 6 MB, and only uploads can be removed.
````

- [ ] **Step 4: Gate**

Run: `npm run gate`
Expected: PASS (`check:office` proves the two new forms have unique control names; `verify` still finds no `/office/` route in the sitemap).

- [ ] **Step 5: Commit**

```bash
git add src/pages/office/documents src/pages/office/clients/[slug].astro src/styles/office.css README.md
git commit -m "Add the Documents tab and streaming routes"
```

---

### Task 5: The intake pull script

**Files:**
- Create: `netlify/functions/lib/intake.mjs`
- Test: `netlify/functions/lib/intake.test.mjs`
- Create: `scripts/pull-intake.mjs`
- Modify: `README.md` (replace "Saving a submission for the build skills")

**Interfaces:**
- Produces:
  - `pullIntake({ slug, dir, source, write }): Promise<{ written: string[], missing: string[] }>` in `intake.mjs` — `source` is `{ getText(key), getBytes(key), list(prefix) }` (the backend shape), `write(relativePath, bytesOrText)` is injected so the test never touches disk. Fetches `{slug}/intro.json`, `{slug}/brand.json`, `{slug}/build.json` into `{dir}/{slug}/intake/{form}.json` (missing forms go to `missing`), then every non-JSON key under `{slug}/` into `{dir}/{slug}/intake/{name}`.
  - `scripts/pull-intake.mjs <slug> [dir]` — reads `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`, opens the `questionnaires` store with `getStore({ name: 'questionnaires', siteID, token })`, wraps it in the backend shape, calls `pullIntake` with `write` backed by `fs`, prints each written path and each missing form, exits 1 on usage error. `dir` defaults to the repo's parent directory (the workspace that holds `{slug}/intake/`), printed before writing.

- [ ] **Step 1: Failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullIntake } from './intake.mjs';

const fake = (entries) => ({
  async getText(key) { return typeof entries[key] === 'string' ? entries[key] : null; },
  async getBytes(key) { return entries[key] instanceof Uint8Array ? entries[key] : null; },
  async list(prefix) { return Object.keys(entries).filter((k) => k.startsWith(prefix)).sort(); },
});

test('pullIntake writes the forms it finds and reports the ones it does not', async () => {
  const out = {};
  const source = fake({ 'lova/intro.json': '{"form":"intro"}', 'lova/brand.json': '{"form":"brand"}', 'lova/logo-lova.png': new Uint8Array([1, 2]), 'acme/build.json': '{}' });
  const result = await pullIntake({ slug: 'lova', dir: '/work', source, write: async (p, data) => { out[p] = data; } });
  assert.deepEqual(result.written, ['/work/lova/intake/intro.json', '/work/lova/intake/brand.json', '/work/lova/intake/logo-lova.png']);
  assert.deepEqual(result.missing, ['build']);
  assert.equal(out['/work/lova/intake/intro.json'], '{"form":"intro"}');
  assert.deepEqual([...out['/work/lova/intake/logo-lova.png']], [1, 2]);
  assert.equal(out['/work/acme/intake/build.json'], undefined);
});

test('pullIntake refuses a bad slug before touching the source', async () => {
  await assert.rejects(() => pullIntake({ slug: '../etc', dir: '/work', source: fake({}), write: async () => {} }), /bad slug/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test netlify/functions/lib/intake.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`netlify/functions/lib/intake.mjs`:

```js
// Pulls a client's questionnaire answers and attachments out of the
// `questionnaires` store into the workspace layout the build skills read
// ({slug}/intake/). The email attachment stays as a backup; this is the
// path that does not depend on anyone saving it by hand.
import path from 'node:path';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const FORMS = ['intro', 'brand', 'build'];

export async function pullIntake({ slug, dir, source, write }) {
  if (!SLUG.test(String(slug))) throw new Error(`bad slug: ${slug}`);
  const into = (name) => path.join(dir, slug, 'intake', name);
  const written = [];
  const missing = [];
  for (const form of FORMS) {
    const text = await source.getText(`${slug}/${form}.json`);
    if (text == null) { missing.push(form); continue; }
    await write(into(`${form}.json`), text);
    written.push(into(`${form}.json`));
  }
  for (const key of await source.list(`${slug}/`)) {
    if (key.endsWith('.json')) continue;
    const bytes = await source.getBytes(key);
    if (!bytes) continue;
    const name = key.slice(slug.length + 1);
    await write(into(name), bytes);
    written.push(into(name));
  }
  return { written, missing };
}
```

`scripts/pull-intake.mjs`:

```js
// Pulls a client's intake (questionnaire answers and attachments) from the
// questionnaires Blobs store into {dir}/{slug}/intake/.
//
//   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs lova-content-creation [dir]
//
// dir defaults to the directory above this repo, which is where the build
// skills expect {slug}/intake/ to live.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { pullIntake } from '../netlify/functions/lib/intake.mjs';

const slug = process.argv[2];
const dir = process.argv[3] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;

if (!slug || !siteID || !token) {
  console.error('usage: NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs <slug> [dir]');
  process.exit(1);
}

const blobs = getStore({ name: 'questionnaires', siteID, token });
const source = {
  async getText(key) { return (await blobs.get(key)) ?? null; },
  async getBytes(key) { const b = await blobs.get(key, { type: 'arrayBuffer' }); return b ? new Uint8Array(b) : null; },
  async list(prefix) { return (await blobs.list({ prefix })).blobs.map((b) => b.key).sort(); },
};
const write = async (p, data) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, data); };

console.log(`writing into ${path.join(dir, slug, 'intake')}`);
const { written, missing } = await pullIntake({ slug, dir, source, write });
for (const p of written) console.log(`wrote ${p}`);
for (const form of missing) console.log(`no ${form}.json submitted yet`);
```

- [ ] **Step 4: README**

Replace the "Saving a submission for the build skills" subsection's first paragraph and code block with:

````markdown
### Pulling a submission for the build skills

```bash
NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs {slug}
```

This writes whatever the client has submitted into the workspace beside this
repo:

```
{slug}/intake/intro.json
{slug}/intake/brand.json
{slug}/intake/build.json
```

plus any logo or brand guide they attached. Pass a second argument to write
somewhere else. The site ID is on the Netlify site's settings page and the
token is a personal access token from your Netlify user settings; both stay on
your machine. The email attachment still arrives and is the backup if the
store is ever unreachable.
````

Keep the paragraph that explains which skill reads which file. Remove the sentence "**This step is manual and nothing does it for you.**".

- [ ] **Step 5: Tests and commit**

Run: `node --test netlify/functions/lib/intake.test.mjs && npm test && node --check scripts/pull-intake.mjs`
Expected: PASS.

```bash
git add netlify/functions/lib/intake.mjs netlify/functions/lib/intake.test.mjs scripts/pull-intake.mjs README.md
git commit -m "Add the intake pull script"
```

---

### Task 6: Token index and the seal lock

**Files:**
- Modify: `netlify/functions/lib/office/agreements.mjs`
- Modify: `netlify/functions/lib/office/agreements.test.mjs`
- Modify: `netlify/functions/lib/office/sign.mjs` (import `TOKEN` from `store.mjs` instead of defining it)
- Modify: `docs/superpowers/specs/2026-09-04-client-office-design.md` (signing paragraph; Documents section)

**Interfaces:**
- Consumes: `s.tokens.get/put`, `s.locks.acquire`, `TOKEN` (Task 1).
- Produces:
  - `sendAgreement` writes `s.tokens.put(token, { slug, id, party })` for both signers after storing the sent record.
  - `findByToken(s, token)` — refuses tokens that fail `TOKEN`; reads the index; on a hit loads the agreement and confirms with `signerByToken` (constant-time, and guards a stale index); on a miss or mismatch falls back to the scan, and on a scan hit backfills the index.
  - `signAgreement` acquires `s.locks.acquire(`seal-${id}`)` before sealing; a loser returns `{ ok: true, agreement: fresh }` without sealing or mailing.
  - `reseal` (the action) still calls `sealAgreement` directly: it runs after a failed seal whose lock is already held, and only an admin can reach it.

- [ ] **Step 1: Failing tests**

Append to `agreements.test.mjs` (reuse the file's `make`/`send`/fixtures helpers; read the file first and follow its names):

```js
test('sendAgreement indexes both tokens and findByToken uses the index', async () => {
  const s = await make();
  const a = await sendClientPending(s);   // helper: create + sendAgreement, returns the sent agreement
  assert.deepEqual(await s.tokens.get(a.signers.client.token), { slug: 'lova', id: a.id, party: 'client' });
  assert.deepEqual(await s.tokens.get(a.signers.keepsite.token), { slug: 'lova', id: a.id, party: 'keepsite' });
  let scans = 0;
  const listAll = s.agreements.listAll.bind(s.agreements);
  s.agreements.listAll = async () => { scans += 1; return listAll(); };
  const found = await findByToken(s, a.signers.client.token);
  assert.equal(found.party, 'client');
  assert.equal(scans, 0);
});

test('findByToken falls back to the scan for an unindexed token and backfills', async () => {
  const s = await make();
  const a = await sendClientPending(s);
  await s.office.remove?.(`tokens/${a.signers.client.token}.json`); // if the test store exposes the backend; otherwise build the agreement with newAgreement + put directly so no index exists
  const found = await findByToken(s, a.signers.client.token);
  assert.equal(found?.agreement.id, a.id);
  assert.ok(await s.tokens.get(a.signers.client.token));
});

test('a stale index entry does not resolve a token that no longer matches', async () => {
  const s = await make();
  const a = await sendClientPending(s);
  await s.tokens.put(a.signers.client.token, { slug: 'lova', id: 'nope', party: 'client' });
  assert.equal((await findByToken(s, a.signers.client.token))?.agreement.id, a.id); // falls back to the scan
});

test('two simultaneous signs with the same clock seal once', async () => {
  const s = await make();
  const a = await sendClientPending(s);
  const sent = [];
  const fetchFn = async () => { sent.push(1); return new Response('{}', { status: 200 }); };
  const args = { token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true, ip: '1.1.1.1', userAgent: 'ua' };
  const [r1, r2] = await Promise.all([signAgreement(args, s, fetchFn, NOW), signAgreement(args, s, fetchFn, NOW)]);
  assert.ok(r1.ok && r2.ok);
  const final = await s.agreements.get('lova', a.id);
  assert.equal(final.audit.filter((e) => e.event === 'sealed').length, 1);
  assert.equal(sent.length, 2);
  assert.equal((await s.documents.list('lova')).filter((d) => d.source === 'seal').length, 1);
});
```

For the fallback test, prefer the second approach: build an agreement with `newAgreement(...)`, `markSigned`/`markSent` and `s.agreements.put` directly, so no index entry exists.

- [ ] **Step 2: Run to see them fail**

Run: `node --test netlify/functions/lib/office/agreements.test.mjs`
Expected: FAIL — `s.tokens.get` returns null after send; the simultaneous test seals twice.

- [ ] **Step 3: Implement**

In `agreements.mjs`, import `TOKEN` from `./store.mjs`. In `sendAgreement`, after `await s.agreements.put(slug, id, sent);`:

```js
  // The index lets /sign/ find an agreement without reading every one; the
  // scan in findByToken stays as the fallback for agreements sent before it.
  for (const party of ['keepsite', 'client']) await s.tokens.put(sent.signers[party].token, { slug, id, party });
```

Replace `findByToken`:

```js
export async function findByToken(s, token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  const ref = await s.tokens.get(token);
  if (ref) {
    const a = await s.agreements.get(ref.slug, ref.id);
    // signerByToken re-checks in constant time, so a stale or forged index
    // entry can never resolve a token the agreement does not hold.
    const party = a && signerByToken(a, token);
    if (party) return { agreement: a, party };
  }
  for (const a of await s.agreements.listAll()) {
    const party = signerByToken(a, token);
    if (party) {
      await s.tokens.put(token, { slug: a.slug, id: a.id, party });
      return { agreement: a, party };
    }
  }
  return null;
}
```

In `signAgreement`, replace the block from the "Two submits that overlap" comment through the seal call with:

```js
    const fresh = await s.agreements.get(a.slug, a.id);
    if (fresh?.signers[party].signedAt !== now.toISOString()) return { ok: false, error: 'already signed' };
    if (fresh.status !== 'completed') return { ok: true, agreement: fresh };
    // The store is last-write-wins, so two overlapping submits can both
    // reach this point. The lock is a key that can be created once; the
    // second creator sees the thank-you page and lets the first one seal.
    if (!(await s.locks.acquire(`seal-${a.id}`))) return { ok: true, agreement: fresh };
    try {
      return { ok: true, agreement: await sealAgreement(fresh, s, fetchFn, now) };
    } catch (e) {
      if (e instanceof TemplateGone) return { ok: true, agreement: fresh };
      throw e;
    }
```

Keep `sealAgreement`'s own re-read (it still protects the reseal path). In `sign.mjs`, replace the local `TOKEN` constant with `import { TOKEN } from './store.mjs'` and keep exporting it (`export { TOKEN }`) so the two GET routes that import it from `sign.mjs` keep working.

- [ ] **Step 4: Spec**

In the spec's "Agreements and e-sign" signing paragraph, replace the sentence about scanning every stored agreement with: "The signing link is resolved through a `tokens/{token}` index written when the agreement is sent, confirmed against the agreement in constant time; agreements sent before the index existed fall back to a scan that backfills it. Sealing takes a lock (`locks/seal-{id}`, a key that can be created once), so two overlapping submits seal once." In the "Documents" section, replace "Each is served by `office-document.mjs`, which requires an admin and streams the bytes" with "Each is served by an office route under `/office/documents/{slug}/`, which the middleware guards and which streams the bytes with `Cache-Control: no-store`"; add: "Only uploads can be removed; sealed agreements and signature images are immutable." In the data model table add `tokens/{token}.json` (signing-link index → slug, id, party; written at send) and `locks/{name}` (created once, never reused; the seal). Mark phase 5 in the Phases list as: "Documents tab, streaming routes, uploads, pull-intake script, token index, seal lock, README."

- [ ] **Step 5: Tests and commit**

Run: `node --test netlify/functions/lib/office/agreements.test.mjs netlify/functions/lib/office/sign.test.mjs && npm test`
Expected: PASS. Then `npm run gate` is not needed (no `src/` change) unless `sign.mjs`'s import changes anything the build uses — it does not.

```bash
git add netlify/functions/lib/office/agreements.mjs netlify/functions/lib/office/agreements.test.mjs netlify/functions/lib/office/sign.mjs docs/superpowers/specs/2026-09-04-client-office-design.md
git commit -m "Index signing tokens and lock the seal"
```

---

## Self-review

- **Spec coverage.** Documents tab listing both stores: Task 2 + 4. Streaming behind admin, no public Blobs URL: Task 4 routes under `/office/`. Uploads one at a time up to 6 MB with `safeName`: Task 3. Questionnaires tab already exists (phase 1). `pull-intake.mjs` with `NETLIFY_SITE_ID`/`NETLIFY_AUTH_TOKEN`, retiring the README step: Task 5. Token index and seal lock (phase 4 residuals recorded as phase 5 items): Task 6. README updates: Tasks 4 and 5. Spec amendments: Task 6.
- **Placeholders.** None; every step carries its code. The one conditional in Task 6's fallback test tells the implementer which approach to use.
- **Type consistency.** `Row` fields (`name, size, type, source, uploadedAt, href, removable`) match between Task 2 and Task 4's `DocumentRow`. `TOKEN` is defined once in `store.mjs` (Task 1) and re-exported from `sign.mjs` (Task 6). `s.locks.acquire` and `s.tokens.get/put` names match between Tasks 1 and 6. `disposition(type, name)` argument order matches between Task 2 and Task 4.
