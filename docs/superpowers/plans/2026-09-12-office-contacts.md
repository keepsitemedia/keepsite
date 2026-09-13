# Office Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A contacts list for people the businesses have relationships with who are not clients: partners, referral sources, vendors. Each has a business, an owner, contact details, a type and a dated note log, and can be turned into a client.

**Architecture:** One new store type (`contacts/{id}.json`), one pure module for validation and note logging, one action with four ops, three server-rendered pages, and a hidden field on the new-client form that links the created client back to the contact. Contacts are brand-free and touch no email, tasks or calendar code.

**Tech Stack:** Node 20, Astro 5 server-rendered pages, Netlify Blobs through `store.mjs`, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-office-two-brands-design.md`, sections "Contacts", "Testing", phase 2.

## Global Constraints

- Node 20; office modules are `.mjs` under `netlify/functions/lib/office/`, tests beside them as `*.test.mjs`, run with `node --test`.
- Every office page exports `prerender = false`; the middleware guards `/office/`.
- `store.mjs` is the only module that knows key shapes. Actions are `(request, ctx, s = defaultStore(), now = new Date()) => Response` and are registered in `actions.mjs`.
- Ids come from `newId(now)` and match `ID` in `ids.mjs`; they sort by creation time.
- Design system: `.interface-design/system.md`. One green, clay only for late or destructive, no shadows, no italics, empty states are a plain sentence in graphite.
- No form may use one `name` on two non-button controls or on a button and a non-button control; `scripts/check-office.mjs` fails the gate otherwise.
- Comments explain why, never what. Same term for the same thing throughout a file.
- The gate is `npm run gate` and must pass at the end of every task.
- Commit subjects imperative, under 50 characters, body only when the diff does not explain the reason, ending with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VYmuCNkVUYjjjbpbAe9d6J
  ```

## File map

| File | Responsibility |
|---|---|
| `netlify/functions/lib/office/store.mjs` | Gains the `contacts` type and counts it. |
| `netlify/functions/lib/office/contacts.mjs` (new) | `CONTACT_TYPES`, `validateContact`, `newContact`, `applyContactEdit`, `addNote`, `contactFields`, `lastNoteAt`. |
| `netlify/functions/lib/office/actions/contact.mjs` (new) | Ops `create`, `edit`, `note`, `delete`. |
| `netlify/functions/lib/office/actions.mjs` | Registers `contact`. |
| `netlify/functions/lib/office/actions/client.mjs` | `create` with a `contact` id writes `clientSlug` on that contact. |
| `netlify/functions/lib/office/actions/export.mjs` | `contacts` becomes exportable. |
| `src/components/office/ContactFields.astro` (new) | The shared field set for the new and edit forms. |
| `src/pages/office/contacts/index.astro` (new) | List, sorted by last note oldest-first, with a type filter. |
| `src/pages/office/contacts/new.astro` (new) | New-contact form. |
| `src/pages/office/contacts/[id].astro` (new) | Details, edit fold, note log, Start a client, delete. |
| `src/pages/office/clients/new.astro` | Prefills from the query string and carries the hidden `contact` id. |
| `src/layouts/OfficeLayout.astro` | Nav gains Contacts. |
| `README.md` | "Contacts" section under the office. |

---

### Task 1: The contacts store type

**Files:**
- Modify: `netlify/functions/lib/office/store.mjs:110-150`
- Test: `netlify/functions/lib/office/store.test.mjs`

**Interfaces:**
- Produces: `s.contacts.get(id)`, `s.contacts.put(id, doc)`, `s.contacts.remove(id)`, `s.contacts.list()` (creation order, since ids sort by time and the backend lists keys in byte order), `s.contacts.count()`. `s.counts()` gains `contacts`. Keys are `contacts/{id}.json`; a bad id throws before any backend call.

- [ ] **Step 1: Write the failing test**

Append to `store.test.mjs`:

```js
test('contacts are keyed by id, list in creation order and are counted', async () => {
  const s = make();
  const a = newId(new Date('2026-09-12T10:00:00Z'));
  const b = newId(new Date('2026-09-12T10:00:01Z'));
  await s.contacts.put(b, { id: b, business: 'Second' });
  await s.contacts.put(a, { id: a, business: 'First' });
  assert.deepEqual((await s.contacts.list()).map((c) => c.business), ['First', 'Second']);
  assert.deepEqual(await s.contacts.get(a), { id: a, business: 'First' });
  assert.equal(await s.contacts.get(newId()), null);
  assert.equal((await s.counts()).contacts, 2);
  await s.contacts.remove(a);
  assert.equal(await s.contacts.count(), 1);
  await assert.rejects(() => s.contacts.get('../x'), /bad id/);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/store.test.mjs`
Expected: FAIL, `s.contacts` undefined.

- [ ] **Step 3: Implement**

In `createStore`, after the `settings` entry add:

```js
    contacts: {
      async get(id) { return readJSON(office, `contacts/${assertId(id)}.json`); },
      async put(id, doc) { return writeJSON(office, `contacts/${assertId(id)}.json`, doc); },
      async remove(id) { return office.remove(`contacts/${assertId(id)}.json`); },
      async list() { return readAll(office, 'contacts/'); },
      async count() { return (await office.list('contacts/')).length; },
    },
```

In `counts()`, after the documents line: `out.contacts = await s.contacts.count();`.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/store.mjs netlify/functions/lib/office/store.test.mjs
git commit -m "Add the contacts store type"
```

---

### Task 2: Contacts module

**Files:**
- Create: `netlify/functions/lib/office/contacts.mjs`
- Test: `netlify/functions/lib/office/contacts.test.mjs`

**Interfaces:**
- Consumes: `EMAIL` from `./clients.mjs`; `newId` from `./ids.mjs`.
- Produces:
  - `CONTACT_TYPES = ['partner', 'referral', 'vendor', 'other']`
  - `TYPE_LABELS = { partner: 'Partner', referral: 'Referral source', vendor: 'Vendor', other: 'Other' }`, the words the pages show.
  - `contactFields(data: FormData): fields` picks and trims `business`, `owner`, `email`, `phone`, `website`, `type`.
  - `validateContact(fields): string[]`, empty when valid. `business` required; `email`, when present, must match `EMAIL`; `type` must be one of `CONTACT_TYPES`.
  - `newContact(fields, now): doc` with `id`, the six fields, `notes: []`, `clientSlug: null`, `createdAt`, `updatedAt`.
  - `applyContactEdit(doc, fields, now): doc`, replaces the six fields, bumps `updatedAt`, keeps notes and `clientSlug`.
  - `addNote(doc, text, now): doc`, prepends `{ at: now.toISOString(), text }` (newest first), bumps `updatedAt`; empty text throws.
  - `lastNoteAt(doc): string | null`, the newest note's `at`.

- [ ] **Step 1: Write the failing test**

`netlify/functions/lib/office/contacts.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_TYPES, TYPE_LABELS, validateContact, newContact, applyContactEdit, addNote, contactFields, lastNoteAt } from './contacts.mjs';
import { ID } from './ids.mjs';

const NOW = new Date('2026-09-12T16:00:00Z');
const LATER = new Date('2026-09-13T16:00:00Z');
const good = { business: 'Peak Print Co', owner: 'Dana', email: 'dana@example.com', phone: '', website: 'https://peakprint.example', type: 'vendor' };

test('validateContact requires a business, a plausible email when given, and a known type', () => {
  assert.deepEqual(CONTACT_TYPES, ['partner', 'referral', 'vendor', 'other']);
  assert.deepEqual(Object.keys(TYPE_LABELS), CONTACT_TYPES);
  assert.deepEqual(validateContact(good), []);
  assert.match(validateContact({ ...good, business: '' }).join(), /business/);
  assert.match(validateContact({ ...good, email: 'nope' }).join(), /email/);
  assert.deepEqual(validateContact({ ...good, email: '' }), []);
  assert.match(validateContact({ ...good, type: 'friend' }).join(), /type/);
});

test('newContact fills every field and starts with no notes', () => {
  const c = newContact(good, NOW);
  assert.match(c.id, ID);
  assert.equal(c.business, 'Peak Print Co');
  assert.equal(c.phone, '');
  assert.deepEqual(c.notes, []);
  assert.equal(c.clientSlug, null);
  assert.equal(c.createdAt, NOW.toISOString());
  assert.equal(c.updatedAt, NOW.toISOString());
  assert.equal(lastNoteAt(c), null);
});

test('applyContactEdit replaces the fields and keeps the log and link', () => {
  const c = { ...newContact(good, NOW), clientSlug: 'peak', notes: [{ at: NOW.toISOString(), text: 'met' }] };
  const e = applyContactEdit(c, { ...good, owner: 'Dana K', type: 'partner' }, LATER);
  assert.equal(e.owner, 'Dana K');
  assert.equal(e.type, 'partner');
  assert.equal(e.clientSlug, 'peak');
  assert.equal(e.notes.length, 1);
  assert.equal(e.updatedAt, LATER.toISOString());
});

test('addNote prepends, and refuses an empty note', () => {
  let c = newContact(good, NOW);
  c = addNote(c, 'Coffee, agreed to swap referrals', NOW);
  c = addNote(c, 'Sent them two leads', LATER);
  assert.deepEqual(c.notes.map((n) => n.text), ['Sent them two leads', 'Coffee, agreed to swap referrals']);
  assert.equal(lastNoteAt(c), LATER.toISOString());
  assert.equal(c.updatedAt, LATER.toISOString());
  assert.throws(() => addNote(c, '   ', LATER), /note/);
});

test('contactFields trims and picks only the six fields', () => {
  const d = new FormData();
  d.append('business', '  Peak ');
  d.append('type', 'vendor');
  d.append('csrf', 'x');
  assert.deepEqual(contactFields(d), { business: 'Peak', owner: '', email: '', phone: '', website: '', type: 'vendor' });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/contacts.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/contacts.mjs`:

```js
// People the businesses have relationships with who are not clients. A
// contact carries no pipeline, no money and no email; its point is the
// note log, so the owner can see when they last talked to someone.
import { EMAIL } from './clients.mjs';
import { newId } from './ids.mjs';

export const CONTACT_TYPES = ['partner', 'referral', 'vendor', 'other'];
export const TYPE_LABELS = { __proto__: null, partner: 'Partner', referral: 'Referral source', vendor: 'Vendor', other: 'Other' };
const EDITABLE = ['business', 'owner', 'email', 'phone', 'website', 'type'];

const pick = (fields) => Object.fromEntries(EDITABLE.map((k) => [k, String(fields[k] ?? '').trim()]));

export const contactFields = (data) =>
  Object.fromEntries(EDITABLE.map((k) => [k, String(data.get(k) ?? '').trim()]));

export function validateContact(fields) {
  const errors = [];
  if (!fields.business) errors.push('business is required');
  if (fields.email && !EMAIL.test(fields.email)) errors.push('email does not look like an address');
  if (!CONTACT_TYPES.includes(fields.type)) errors.push(`type must be one of ${CONTACT_TYPES.join(', ')}`);
  return errors;
}

export function newContact(fields, now = new Date()) {
  const at = now.toISOString();
  return { id: newId(now), ...pick(fields), notes: [], clientSlug: null, createdAt: at, updatedAt: at };
}

export function applyContactEdit(contact, fields, now = new Date()) {
  return { ...contact, ...pick(fields), updatedAt: now.toISOString() };
}

export function addNote(contact, text, now = new Date()) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('note is empty');
  const at = now.toISOString();
  return { ...contact, notes: [{ at, text: trimmed }, ...(contact.notes ?? [])], updatedAt: at };
}

export const lastNoteAt = (contact) => contact.notes?.[0]?.at ?? null;
```

- [ ] **Step 4: Run the test**

Run: `node --test netlify/functions/lib/office/contacts.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/contacts.mjs netlify/functions/lib/office/contacts.test.mjs
git commit -m "Add the contacts module"
```

---

### Task 3: Contact action

**Files:**
- Create: `netlify/functions/lib/office/actions/contact.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Test: `netlify/functions/lib/office/actions/contact.test.mjs`

**Interfaces:**
- Consumes: `contacts.mjs` (Task 2), `store.contacts` (Task 1), `readForm`, `field`, `checkCsrf`, `redirect`, `problem`, `CSRF_REFUSED` from `../http.mjs`, `ID` from `../ids.mjs`.
- Produces: `POST /office/api/contact` with `op`:
  - `create`: fields from `contactFields`; validation errors redirect to `/office/contacts/new/?error=...`; success redirects to `/office/contacts/{id}/`.
  - `edit`: `id` + fields; errors redirect to `/office/contacts/{id}/?error=...`; success redirects to the contact page.
  - `note`: `id` + `text`; empty text redirects with an error; success redirects to the contact page.
  - `delete`: `id`; redirects to `/office/contacts/`.
  - A bad id is 400, an unknown id 404, an unknown op 400.

- [ ] **Step 1: Write the failing test**

`netlify/functions/lib/office/actions/contact.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contact as action } from './contact.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/contact', { method: 'POST', body: d });
};
const good = { business: 'Peak Print Co', owner: 'Dana', email: 'dana@example.com', type: 'vendor' };
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });
const idFrom = (res) => res.headers.get('Location').match(/\/office\/contacts\/([^/]+)\//)[1];

test('create writes the contact and lands on its page', async () => {
  const s = make();
  const res = await action(post({ csrf, op: 'create', ...good }), ctx(), s);
  assert.equal(res.status, 303);
  const id = idFrom(res);
  const c = await s.contacts.get(id);
  assert.equal(c.business, 'Peak Print Co');
  assert.equal(c.type, 'vendor');
  assert.deepEqual(c.notes, []);
});

test('create sends errors back to the form', async () => {
  const s = make();
  const res = await action(post({ csrf, op: 'create', ...good, business: '' }), ctx(), s);
  assert.equal(res.status, 303);
  assert.match(res.headers.get('Location'), /^\/office\/contacts\/new\/\?error=.*business/);
  assert.equal(await s.contacts.count(), 0);
});

test('edit, note and delete', async () => {
  const s = make();
  const id = idFrom(await action(post({ csrf, op: 'create', ...good }), ctx(), s));
  await action(post({ csrf, op: 'edit', id, ...good, owner: 'Dana K' }), ctx(), s);
  assert.equal((await s.contacts.get(id)).owner, 'Dana K');
  const bad = await action(post({ csrf, op: 'edit', id, ...good, type: 'friend' }), ctx(), s);
  assert.match(bad.headers.get('Location'), new RegExp(`^/office/contacts/${id}/\\?error=.*type`));
  const at = new Date('2026-09-13T10:00:00Z');
  await action(post({ csrf, op: 'note', id, text: 'Sent two leads' }), ctx(), s, at);
  const c = await s.contacts.get(id);
  assert.deepEqual(c.notes, [{ at: at.toISOString(), text: 'Sent two leads' }]);
  const empty = await action(post({ csrf, op: 'note', id, text: '  ' }), ctx(), s);
  assert.match(empty.headers.get('Location'), /error=/);
  assert.equal((await s.contacts.get(id)).notes.length, 1);
  const gone = await action(post({ csrf, op: 'delete', id }), ctx(), s);
  assert.equal(gone.headers.get('Location'), '/office/contacts/');
  assert.equal(await s.contacts.get(id), null);
});

test('bad and unknown ids, unknown op, missing csrf', async () => {
  const s = make();
  assert.equal((await action(post({ csrf, op: 'edit', id: '../x', ...good }), ctx(), s)).status, 400);
  assert.equal((await action(post({ csrf, op: 'note', id: '20260912T000000aaaaaa', text: 'x' }), ctx(), s)).status, 404);
  assert.equal((await action(post({ csrf, op: 'nope' }), ctx(), s)).status, 400);
  assert.equal((await action(post({ op: 'create', ...good }), ctx(), s)).status, 403);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/actions/contact.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`netlify/functions/lib/office/actions/contact.mjs`:

```js
import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore } from '../store.mjs';
import { ID } from '../ids.mjs';
import { validateContact, newContact, applyContactEdit, addNote, contactFields } from '../contacts.mjs';

// Errors go back to the form in the query string rather than as a 400 page,
// so the admin keeps what they typed and sees what to fix.
const back = (to, errors) => redirect(`${to}?error=${encodeURIComponent(errors.join('; '))}`);
const page = (id) => `/office/contacts/${id}/`;

export async function contact(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const op = field(data, 'op');

  if (op === 'create') {
    const fields = contactFields(data);
    const errors = validateContact(fields);
    if (errors.length) return back('/office/contacts/new/', errors);
    const created = newContact(fields, now);
    await s.contacts.put(created.id, created);
    return redirect(page(created.id));
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.contacts.get(id);
  if (!existing) return problem(404, 'no such contact');

  if (op === 'edit') {
    const fields = contactFields(data);
    const errors = validateContact(fields);
    if (errors.length) return back(page(id), errors);
    await s.contacts.put(id, applyContactEdit(existing, fields, now));
    return redirect(page(id));
  }
  if (op === 'note') {
    const text = field(data, 'text');
    if (!text) return back(page(id), ['write the note first']);
    await s.contacts.put(id, addNote(existing, text, now));
    return redirect(page(id));
  }
  if (op === 'delete') {
    await s.contacts.remove(id);
    return redirect('/office/contacts/');
  }
  return problem(400, 'unknown op');
}
```

In `actions.mjs`, import `contact` from `./actions/contact.mjs` and add `contact` to the exported map.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/actions/contact.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/contact.mjs netlify/functions/lib/office/actions/contact.test.mjs netlify/functions/lib/office/actions.mjs
git commit -m "Add the contact action"
```

---

### Task 4: Starting a client from a contact

**Files:**
- Modify: `netlify/functions/lib/office/actions/client.mjs:20-42`
- Test: `netlify/functions/lib/office/actions/client.test.mjs`

**Interfaces:**
- Consumes: `store.contacts`, `ID`.
- Produces: `op=create` reads an optional `contact` field. When it is a valid id of an existing contact, the created client's slug is written to that contact's `clientSlug` after the client is stored. A bad or unknown id is ignored, not an error, so a stale link never blocks creating the client. The redirect is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `client.test.mjs` (add `import { newContact } from '../contacts.mjs';` at the top):

```js
test('create from a contact links the contact to the new client', async () => {
  const s = make();
  const c = newContact({ business: 'Lova', owner: 'Sierra', email: 's@example.com', type: 'partner' });
  await s.contacts.put(c.id, c);
  const res = await action(post({ op: 'create', csrf, ...good, contact: c.id }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  assert.equal((await s.contacts.get(c.id)).clientSlug, 'lova');
});

test('a stale contact id does not stop the client being created', async () => {
  const s = make();
  const res = await action(post({ op: 'create', csrf, ...good, contact: '20260912T000000aaaaaa' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test netlify/functions/lib/office/actions/client.test.mjs`
Expected: the first new test FAILS (`clientSlug` is null); the second passes already.

- [ ] **Step 3: Implement**

In `client.mjs`, import `ID` from `../ids.mjs`. In the `create` branch, after the `for (const t of tasks)` loop and before the final redirect:

```js
    // The contact is a courtesy link, not a parent: a stale or deleted one
    // must not stop a client from being created.
    const contactId = field(data, 'contact');
    if (ID.test(contactId)) {
      const linked = await s.contacts.get(contactId);
      if (linked) await s.contacts.put(contactId, { ...linked, clientSlug: slug, updatedAt: now.toISOString() });
    }
```

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/actions/client.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/client.mjs netlify/functions/lib/office/actions/client.test.mjs
git commit -m "Link a contact to the client started from it"
```

---

### Task 5: Contacts export

**Files:**
- Modify: `netlify/functions/lib/office/actions/export.mjs:13-22`
- Test: `netlify/functions/lib/office/actions/export.test.mjs`

**Interfaces:**
- Produces: `EXPORTABLE` includes `contacts`; `GET /office/api/export?type=contacts&format=csv|json` returns the contact list. The Data page needs no change: it iterates `counts()` (which gained `contacts` in Task 1) and checks `EXPORTABLE`.

- [ ] **Step 1: Write the failing test**

`export.test.mjs` already has `make()` (a memory store with one client and one task), `get(q)` (a GET request to the export endpoint with that query) and `ctx`. Append:

```js
test('contacts export as csv with the note log as JSON text', async () => {
  const s = await make();
  await s.contacts.put('20260912T000000aaaaaa', { id: '20260912T000000aaaaaa', business: 'Peak', notes: [{ at: '2026-09-12T00:00:00.000Z', text: 'met' }] });
  const res = await exportData(get('type=contacts&format=csv'), ctx, s);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /^id,business,notes/);
  assert.match(body, /Peak/);
  assert.match(body, /"\[{""at""/);
  assert.ok(EXPORTABLE.includes('contacts'));
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test netlify/functions/lib/office/actions/export.test.mjs`
Expected: FAIL with 400 `unknown type or format`.

- [ ] **Step 3: Implement**

In `export.mjs`:

```js
export const EXPORTABLE = ['clients', 'contacts', ...TYPES];
```

and

```js
  const rows = type === 'clients' ? await s.clients.list()
    : type === 'contacts' ? await s.contacts.list()
    : await s[type].listAll();
```

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/actions/export.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/export.mjs netlify/functions/lib/office/actions/export.test.mjs
git commit -m "Export contacts"
```

---

### Task 6: Contact fields component and the two forms

**Files:**
- Create: `src/components/office/ContactFields.astro`
- Create: `src/pages/office/contacts/new.astro`
- Modify: `src/layouts/OfficeLayout.astro:10-16`

**Interfaces:**
- Consumes: `CONTACT_TYPES`.
- Produces: `ContactFields` renders the six inputs, prefilled from an optional `contact` prop. `/office/contacts/new/` posts `op=create` to `/office/api/contact` and shows `?error=`.

- [ ] **Step 1: Write the component**

`src/components/office/ContactFields.astro`:

```astro
---
import { CONTACT_TYPES, TYPE_LABELS } from '../../../netlify/functions/lib/office/contacts.mjs';
interface Props { contact?: Record<string, string> }
const c = Astro.props.contact ?? {};
const label = TYPE_LABELS as Record<string, string>;
---
<div class="row">
  <label class="field"><span>Business</span><input name="business" required value={c.business ?? ''} /></label>
  <label class="field"><span>Owner</span><input name="owner" value={c.owner ?? ''} /></label>
  <label class="field"><span>Type</span>
    <select name="type">
      {CONTACT_TYPES.map((t) => <option value={t} selected={(c.type ?? 'partner') === t}>{label[t]}</option>)}
    </select>
  </label>
  <label class="field"><span>Email</span><input type="email" name="email" value={c.email ?? ''} /></label>
  <label class="field"><span>Phone</span><input name="phone" value={c.phone ?? ''} /></label>
  <label class="field"><span>Website</span><input name="website" value={c.website ?? ''} placeholder="https://" /></label>
</div>
```

- [ ] **Step 2: Write the new-contact page**

`src/pages/office/contacts/new.astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../../layouts/OfficeLayout.astro';
import ContactFields from '../../../components/office/ContactFields.astro';
const error = Astro.url.searchParams.get('error');
---
<OfficeLayout title="New contact">
  <div class="page-head">
    <h1>New contact</h1>
    <span class="sub">Someone you work with who is not a client.</span>
  </div>
  {error && <p class="error">{error}</p>}
  <form method="POST" action="/office/api/contact" class="sheet narrow">
    <input type="hidden" name="csrf" value={Astro.locals.csrf} />
    <input type="hidden" name="op" value="create" />
    <ContactFields />
    <button type="submit" class="btn">Create contact</button>
  </form>
</OfficeLayout>
```

- [ ] **Step 3: Add the nav item**

In `OfficeLayout.astro`, insert `{ label: 'Contacts', href: '/office/contacts/' }` after the Clients entry. If the own-tasks plan has already added Tasks, the order is Today, Clients, Contacts, Tasks, Calendar, Settings, Data.

- [ ] **Step 4: Check**

Run: `npm run check && npm run check:office`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/office/ContactFields.astro src/pages/office/contacts/new.astro src/layouts/OfficeLayout.astro
git commit -m "Add the new-contact form"
```

---

### Task 7: Contacts list

**Files:**
- Create: `src/pages/office/contacts/index.astro`

**Interfaces:**
- Consumes: `store().contacts.list()`, `lastNoteAt`, `CONTACT_TYPES`, `formatYmd`, `todayIn`, `relative`.
- Produces: `/office/contacts/`. Columns Business, Owner, Type, Last note, Client. Sorted by last note oldest-first, contacts with no notes first of all (they are the most neglected), ties by business name. `?type=` filters to one type; the filter is a row of links, the current one marked `aria-current`.

- [ ] **Step 1: Write the page**

```astro
---
export const prerender = false;
import OfficeLayout from '../../../layouts/OfficeLayout.astro';
import { store } from '../../../../netlify/functions/lib/office/store.mjs';
import { CONTACT_TYPES, TYPE_LABELS, lastNoteAt } from '../../../../netlify/functions/lib/office/contacts.mjs';
import { todayIn, formatYmd } from '../../../../netlify/functions/lib/office/dates.mjs';
import { daysBetween } from '../../../../netlify/functions/lib/office/attention.mjs';

// store.mjs has no type declarations; this narrows list() to what the
// table reads.
type Contact = { id: string; business: string; owner: string; type: string; notes: { at: string; text: string }[]; clientSlug: string | null };

const label = TYPE_LABELS as Record<string, string>;
const wanted = Astro.url.searchParams.get('type') ?? '';
const filter = CONTACT_TYPES.includes(wanted) ? wanted : '';
const today = todayIn();
const all = (await store().contacts.list()) as Contact[];
const contacts = all
  .filter((c) => !filter || c.type === filter)
  .sort((a, b) => (lastNoteAt(a) ?? '').localeCompare(lastNoteAt(b) ?? '') || a.business.localeCompare(b.business));
// The note's calendar day in the owner's zone, not UTC's, so an evening
// note reads as that evening.
const dayOf = (iso: string) => todayIn(undefined, new Date(iso));
const ago = (iso: string) => {
  const d = daysBetween(dayOf(iso), today);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
---
<OfficeLayout title="Contacts">
  <div class="page-head">
    <h1>Contacts</h1>
    <span class="sub">{contacts.length}{filter ? ` ${label[filter].toLowerCase()}` : ''}, longest since a note first</span>
    <div class="actions"><a class="btn" href="/office/contacts/new/">New contact</a></div>
  </div>
  <nav class="tabs" aria-label="Type">
    <a href="/office/contacts/" aria-current={filter ? undefined : 'page'}>All</a>
    {CONTACT_TYPES.map((t) => <a href={`/office/contacts/?type=${t}`} aria-current={filter === t ? 'page' : undefined}>{label[t]}</a>)}
  </nav>
  {contacts.length === 0 ? (
    <p class="empty">No contacts{filter ? ' of this type' : ' yet'}.</p>
  ) : (
    <div class="table-scroll">
      <table>
        <thead><tr><th>Business</th><th>Owner</th><th>Type</th><th>Last note</th><th>Client</th></tr></thead>
        <tbody>
          {contacts.map((c) => {
            const at = lastNoteAt(c);
            return (
              <tr>
                <td><a href={`/office/contacts/${c.id}/`}>{c.business}</a></td>
                <td>{c.owner}</td>
                <td>{label[c.type] ?? c.type}</td>
                <td>{at ? <>{formatYmd(dayOf(at))} <span class="meta">{ago(at)}</span></> : <span class="quiet">Never</span>}</td>
                <td>{c.clientSlug ? <a href={`/office/clients/${c.clientSlug}/`}>Client page</a> : <span class="quiet">Not a client</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</OfficeLayout>
```

`daysBetween` is exported by `attention.mjs`.

- [ ] **Step 2: Check the tabs pattern**

`.office .tabs` exists in `office.css` and is used on the client page for its tab links. Confirm it styles `a[aria-current="page"]` green; if the client page uses a different attribute for the current tab, match it.

- [ ] **Step 3: Check**

Run: `npm run check && npm run check:office`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/pages/office/contacts/index.astro
git commit -m "Add the contacts list"
```

---

### Task 8: Contact page

**Files:**
- Create: `src/pages/office/contacts/[id].astro`
- Modify: `src/pages/office/clients/new.astro`

**Interfaces:**
- Consumes: `store().contacts.get(id)`, `ContactFields`, `ID`, `formatYmd`, `formatTime`, `todayIn`.
- Produces: `/office/contacts/{id}/` with the details, a note form at the top of the log, the log newest first, an edit fold, a "Start a client" link to `/office/clients/new/?contact={id}&name=...&business=...&email=...&phone=...&website=...`, and a delete form in the fold. A bad id is 400, an unknown one 404. `/office/clients/new/` reads those query fields into `ClientFields` and carries `contact` as a hidden input.

- [ ] **Step 1: Write the contact page**

```astro
---
export const prerender = false;
import OfficeLayout from '../../../layouts/OfficeLayout.astro';
import ContactFields from '../../../components/office/ContactFields.astro';
import { store } from '../../../../netlify/functions/lib/office/store.mjs';
import { ID } from '../../../../netlify/functions/lib/office/ids.mjs';
import { todayIn, formatYmd } from '../../../../netlify/functions/lib/office/dates.mjs';
import { TYPE_LABELS } from '../../../../netlify/functions/lib/office/contacts.mjs';

type Contact = { id: string; business: string; owner: string; email: string; phone: string; website: string; type: string; notes: { at: string; text: string }[]; clientSlug: string | null };

const id = Astro.params.id ?? '';
if (!ID.test(id)) return new Response('bad id', { status: 400 });
const contact = (await store().contacts.get(id)) as Contact | null;
if (!contact) return new Response('no such contact', { status: 404 });
const csrf = Astro.locals.csrf;
const error = Astro.url.searchParams.get('error');
const label = TYPE_LABELS as Record<string, string>;
const day = (iso: string) => formatYmd(todayIn(undefined, new Date(iso)));
const startParams = new URLSearchParams({
  contact: contact.id, name: contact.owner, business: contact.business, email: contact.email, phone: contact.phone, website: contact.website,
});
---
<OfficeLayout title={contact.business}>
  <div class="page-head">
    <h1 class="file-name">{contact.business}</h1>
    <span class="sub">{label[contact.type] ?? contact.type}{contact.owner && ` · ${contact.owner}`}</span>
    <div class="actions">
      {contact.clientSlug
        ? <a class="btn-quiet" href={`/office/clients/${contact.clientSlug}/`}>Client page</a>
        : <a class="btn-quiet" href={`/office/clients/new/?${startParams}`}>Start a client</a>}
    </div>
  </div>
  {error && <p class="error">{error}</p>}

  <p class="copy-line">
    {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
    {contact.phone && <span>{contact.phone}</span>}
    {contact.website && <a href={contact.website}>{contact.website}</a>}
    {!contact.email && !contact.phone && !contact.website && <span class="quiet">No contact details.</span>}
  </p>

  <h2>Notes <span class="count">{contact.notes.length}</span></h2>
  <form method="POST" action="/office/api/contact" class="toolbar">
    <input type="hidden" name="csrf" value={csrf} />
    <input type="hidden" name="op" value="note" />
    <input type="hidden" name="id" value={contact.id} />
    <input class="grow" name="text" placeholder="What happened" required aria-label="Note" />
    <button class="btn">Add note</button>
  </form>
  {contact.notes.length === 0 && <p class="empty">Nothing recorded yet.</p>}
  {contact.notes.length > 0 && (
    <ul class="ledger">
      {contact.notes.map((n) => (
        <li class="no-tick">
          <span class="when">{day(n.at)}</span>
          <span class="what">{n.text}</span>
        </li>
      ))}
    </ul>
  )}

  <details class="fold">
    <summary>Details<span class="sub">edit or delete</span></summary>
    <div class="fold-body">
      <form method="POST" action="/office/api/contact" class="sheet narrow">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="op" value="edit" />
        <input type="hidden" name="id" value={contact.id} />
        <ContactFields contact={contact} />
        <button type="submit" class="btn">Save</button>
      </form>
      <form method="POST" action="/office/api/contact" class="inline">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="op" value="delete" />
        <input type="hidden" name="id" value={contact.id} />
        <button class="link-quiet danger">Delete contact</button>
      </form>
    </div>
  </details>
</OfficeLayout>
```

`.copy-line`, `.no-tick`, `.fold-body`, `.toolbar` and `.grow` are used by the client page and Today; check `office.css` for `.grow` (the calendar's add form uses it) and `.fold-body` (the client tasks tab uses it).

- [ ] **Step 2: Prefill the new-client form**

In `src/pages/office/clients/new.astro`, after `const error = ...`:

```ts
const q = Astro.url.searchParams;
const contactId = q.get('contact') ?? '';
const prefill = Object.fromEntries(['name', 'business', 'email', 'phone', 'website'].map((k) => [k, q.get(k) ?? '']));
```

and in the form, after the `op` hidden input:

```astro
    {contactId && <input type="hidden" name="contact" value={contactId} />}
```

and pass the values: `<ClientFields client={prefill} />`.

- [ ] **Step 3: Check and walk it**

Run: `npm run check && npm run check:office`
Expected: clean.

With the local harness, create a contact, add two notes, confirm newest first and the list's "Last note" column, click Start a client, confirm the fields are filled, create the client, and confirm the contact page now shows "Client page".

- [ ] **Step 4: Gate**

Run: `npm run gate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/office/contacts/[id].astro" src/pages/office/clients/new.astro
git commit -m "Add the contact page and start-a-client link"
```

---

### Task 9: README

**Files:**
- Modify: `README.md` (after the "### Inquiries" section of "## The office")

- [ ] **Step 1: Write the section**

```markdown
### Contacts

`/office/contacts/` is for people you work with who are not clients:
partners, referral sources, vendors, anyone with a relationship worth
remembering. A contact has a business, an owner, contact details, a
type and a log of dated notes. The list sorts by the last note, oldest
first, so the relationships going quiet are at the top; the type links
filter it.

"Start a client" on a contact opens the new-client form filled in from
the contact, and once the client exists the contact links to its page.
Contacts send no email, create no tasks and appear nowhere else; they
export from the Data page like everything else, under `contacts`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document contacts"
```
