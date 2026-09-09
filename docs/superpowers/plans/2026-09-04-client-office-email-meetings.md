# Client Office Email and Meetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 of the client office: editable email templates with auto-filled and prompted placeholders, a send screen that stage advances open, an email log per client, meetings with confirmation and reminder emails, and a daily digest to the admin, all through Resend and two Netlify scheduled functions.

**Architecture:** Templates are data in `settings/templates.json` (seeded from `src/data/office/templates.json`) rendered by one module that fills `{{placeholders}}` from a context object and prompted fields, then converts Markdown to HTML. One mail module wraps Resend and logs every send to `emails/{slug}/`. Meetings are documents with a Mountain-time date and time; a module converts them to instants for the `.ics` attachment and the reminder cron. Both crons are thin Netlify scheduled functions over pure, tested modules that take a fake `send` in tests.

**Tech Stack:** Astro 5.18 with `@astrojs/netlify`, Netlify Blobs, Netlify scheduled functions (Functions 2.0 `config.schedule`), Resend HTTP API, `marked` for Markdown, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-04-client-office-design.md` (sections Email, Meetings and client reminders, Internal digest, Pipelines and tasks (stage entry email, questionnaire nudges), Secrets, Testing).

## Global Constraints

- Node 20; no TypeScript under `netlify/functions/`, `.mjs` only, so `node --test` runs it directly.
- Every office page exports `prerender = false`. No third-party script or stylesheet anywhere; the strict CSP in `guard.mjs` is unchanged.
- All email goes through `netlify/functions/lib/office/mail.mjs`, which is the only module that calls Resend; every send is logged to `emails/{slug}/` whether it succeeded or not.
- Secrets fail closed: a missing `RESEND_API_KEY` or `KEEPSITE_NOTIFY_FROM` makes a send log as `failed` with a reason; nothing throws out of a cron.
- Day dates are `YYYY-MM-DD` and times `HH:MM`, both Mountain time (`America/Denver`); instants are computed only in `dates.mjs`.
- Stage-entry emails open the send screen; nothing is sent without the admin clicking Send. Meeting confirmations and reminders and the digest are the only automatic sends.
- One writer per key: the admin's actions write meetings and emails; the meetings cron writes only `remindersSent` on a meeting; the digest cron writes only `emails/office/`.
- A duplicated form control name in one form fails `npm run check:office`; every new form keeps one control per name.
- Comments explain why, never what. Commit subjects imperative, under 50 characters, with the session trailers.
- `npm run gate` (test, check, check:forms, check:office, build, verify) must pass at the end of every task that touches `src/`, `package.json` or `netlify.toml`.

## File structure

```
src/data/office/templates.json                    seed templates
netlify/functions/lib/office/
  templates.mjs        validateTemplates, loadTemplates, findTemplate, fill, render, toHtml
  context.mjs          buildContext(): the auto-fill object for a client
  mail.mjs             sendMail(): Resend + emails/{slug} log
  ics.mjs              buildIcs(): one VEVENT calendar file
  reminders.mjs        dueReminders(), runMeetingReminders()
  digest.mjs           buildDigest(), runDigest()
  dates.mjs            + toInstant(), formatWhen()
  actions/send.mjs     the Send button
  actions/meeting.mjs  add, reschedule, delete
netlify/functions/office-meetings-cron.mjs        hourly
netlify/functions/office-digest-cron.mjs          daily
src/pages/office/send/[slug]/[template].astro     send screen
src/components/office/MeetingRow.astro
src/pages/office/clients/[slug].astro             + Emails and Meetings tabs
src/pages/office/calendar.astro                   + meetings
src/pages/office/index.astro                      + Meetings section
src/pages/office/settings.astro                   + templates editor
scripts/check-office.mjs                          + template checks
README.md                                         + email, meetings, crons
```

Modified from phase 1: `actions.mjs` (two entries), `actions/stage.mjs` (redirect to the send screen), `actions/settings.mjs` (templates validator), `package.json` (`marked`).

---

### Task 1: Templates seed, renderer and checks

**Files:**
- Modify: `package.json` (add `marked`)
- Create: `src/data/office/templates.json`
- Create: `netlify/functions/lib/office/templates.mjs`
- Create: `netlify/functions/lib/office/templates.test.mjs`
- Modify: `scripts/check-office.mjs`

**Interfaces:**
- Produces:
  - Template shape: `{ id, name, subject, body, fields?: [{ key, label, default?, required? }] }`. `body` is Markdown. Placeholders are `{{dotted.path}}`.
  - `validateTemplates(value): string[]`
  - `loadTemplates(store): Promise<Template[]>` — stored `settings/templates` or the seed.
  - `findTemplate(templates, id)`
  - `fill(source, context, prompted?, { escape? }): { text, unresolved: string[] }` — unknown or empty placeholders stay as `{{name}}` so they are seen.
  - `render(template, context, prompted?): { subject, text, html, unresolved, missing }` — `missing` lists required prompted keys with no value and no default.
  - `toHtml(markdown): string`
  - `placeholdersIn(source): string[]`
  - `KNOWN_PLACEHOLDERS`: the auto-fill names `context.mjs` (Task 2) provides.

- [ ] **Step 1: Install marked**

```bash
npm install marked@^18
```

- [ ] **Step 2: Seed templates**

`src/data/office/templates.json`. Placeholders named `links.sign` and `links.pay` do not exist until phases 4 and 3; until then the agreement and launch templates take the link as a prompted field the admin pastes.

```json
[
  {
    "id": "agreement",
    "name": "Agreement to sign",
    "subject": "Your Keepsite agreement",
    "body": "Hi {{client.firstName}},\n\nHere is the agreement for {{client.business}}. It lays out the build, the monthly fee, and what happens at each stage.\n\n**Sign here:** {{signLink}}\n\nOnce it is signed I will send the first questionnaire, which takes about ten minutes.\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [
      { "key": "signLink", "label": "Signing link", "required": true },
      { "key": "note", "label": "Personal note", "default": "" }
    ]
  },
  {
    "id": "intro",
    "name": "Intro questionnaire",
    "subject": "Ten minutes about {{client.business}}",
    "body": "Hi {{client.firstName}},\n\nThank you for signing. The next step is eight quick questions about your business, most of which you can answer off the top of your head:\n\n{{links.intro}}\n\nThat is everything I need to put four designs in front of you.\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [{ "key": "note", "label": "Personal note", "default": "" }]
  },
  {
    "id": "post-demo",
    "name": "Demo and follow-up questionnaires",
    "subject": "Four directions for {{client.business}}",
    "body": "Hi {{client.firstName}},\n\nYour four homepage directions are ready:\n\n{{links.demo}}\n\nHave a look, pick the one that feels like your business, then answer the two questionnaires below. They are one pass each, not a back-and-forth.\n\n- Brand and demo feedback: {{links.brand}}\n- Site build: {{links.build}}\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [{ "key": "note", "label": "Personal note", "default": "" }]
  },
  {
    "id": "layouts",
    "name": "Layouts ready",
    "subject": "Every page of {{client.business}}, laid out",
    "body": "Hi {{client.firstName}},\n\nEvery page your site will have is laid out here:\n\n{{previewLink}}\n\nThe text is placeholder and the image areas are outlined boxes on purpose: this round is about whether the site has every page you need and how each one is put together. Send your changes in one go and I will fold them in.\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [
      { "key": "previewLink", "label": "Preview link", "required": true },
      { "key": "note", "label": "Personal note", "default": "" }
    ]
  },
  {
    "id": "copy",
    "name": "Copy and photos in place",
    "subject": "{{client.business}}, with your words and photos",
    "body": "Hi {{client.firstName}},\n\nYour copy and photos are in:\n\n{{previewLink}}\n\nRead it through, send your changes in one go, and we launch.\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [
      { "key": "previewLink", "label": "Preview link", "required": true },
      { "key": "note", "label": "Personal note", "default": "" }
    ]
  },
  {
    "id": "launch",
    "name": "Balance and launch",
    "subject": "Launching {{client.business}}",
    "body": "Hi {{client.firstName}},\n\nWe are ready to launch. The balance is due now:\n\n{{payLink}}\n\nOnce it clears the site goes live at your domain, and the monthly starts on launch day as the agreement describes.\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [
      { "key": "payLink", "label": "Payment link", "required": true },
      { "key": "note", "label": "Personal note", "default": "" }
    ]
  },
  {
    "id": "questionnaire-reminder",
    "name": "Questionnaire reminder",
    "subject": "A nudge on the {{questionnaire.title}}",
    "body": "Hi {{client.firstName}},\n\nA quick nudge: the {{questionnaire.title}} is still open. Your answers save as you go, so it is fine to finish it in more than one sitting.\n\n{{questionnaire.link}}\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [{ "key": "note", "label": "Personal note", "default": "" }]
  },
  {
    "id": "meeting-confirmation",
    "name": "Meeting confirmation",
    "subject": "Confirmed: {{meeting.title}} on {{meeting.when}}",
    "body": "Hi {{client.firstName}},\n\nWe are set for **{{meeting.title}}** on {{meeting.when}} ({{meeting.minutes}} minutes).\n\nJoin here: {{meeting.link}}\n\nA calendar file is attached. Reply to this email if the time stops working.\n\nThanks,\n{{site.brand}}"
  },
  {
    "id": "meeting-reminder",
    "name": "Meeting reminder",
    "subject": "Reminder: {{meeting.title}} in about {{meeting.hours}}",
    "body": "Hi {{client.firstName}},\n\n**{{meeting.title}}** is on {{meeting.when}}, about {{meeting.hours}} from now.\n\nJoin here: {{meeting.link}}\n\nThanks,\n{{site.brand}}"
  }
]
```

- [ ] **Step 3: Failing tests**

`netlify/functions/lib/office/templates.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../../../src/data/office/templates.json' with { type: 'json' };
import { validateTemplates, loadTemplates, findTemplate, fill, render, toHtml, placeholdersIn, KNOWN_PLACEHOLDERS } from './templates.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const ctx = {
  client: { name: 'Sierra Lee', firstName: 'Sierra', business: 'Lova', email: 's@example.com' },
  links: { intro: 'https://x/intro', brand: 'https://x/brand', build: 'https://x/build', demo: 'https://x/demo' },
  site: { brand: 'Keepsite Media', url: 'https://x', email: 'k@x', phone: '(385) 307-8190' },
  admin: { email: 'me@x' },
};

test('the seed validates and every placeholder is known or prompted', () => {
  assert.deepEqual(validateTemplates(seed), []);
  for (const t of seed) {
    const prompted = new Set((t.fields ?? []).map((f) => f.key));
    for (const p of placeholdersIn(`${t.subject}\n${t.body}`)) {
      assert.ok(KNOWN_PLACEHOLDERS.includes(p) || prompted.has(p), `${t.id}: {{${p}}} is neither known nor prompted`);
    }
  }
});

test('validateTemplates names each problem', () => {
  assert.match(validateTemplates('x').join(), /must be a list/);
  assert.match(validateTemplates([{ id: 'A', name: 'x', subject: 's', body: 'b' }]).join(), /id/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: '', body: 'b' }]).join(), /subject/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: 's', body: 'b' }, { id: 'a', name: 'y', subject: 's', body: 'b' }]).join(), /duplicate/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: 's', body: 'b', fields: [{ key: 'Bad Key', label: 'l' }] }]).join(), /key/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: 's', body: 'b', fields: [{ key: 'k' }] }]).join(), /label/);
});

test('loadTemplates prefers the stored copy', async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  assert.equal((await loadTemplates(s))[0].id, 'agreement');
  await s.settings.put('templates', [{ id: 'only', name: 'Only', subject: 's', body: 'b' }]);
  assert.equal((await loadTemplates(s))[0].id, 'only');
  assert.equal(findTemplate(seed, 'nope'), undefined);
});

test('fill substitutes known paths and leaves the rest visible', () => {
  const r = fill('Hi {{client.firstName}} from {{site.brand}}: {{links.intro}} {{ghost}} {{client.phone}}', ctx);
  assert.equal(r.text, 'Hi Sierra from Keepsite Media: https://x/intro {{ghost}} {{client.phone}}');
  assert.deepEqual(r.unresolved, ['ghost', 'client.phone']);
});

test('fill prefers a prompted value and can escape for HTML', () => {
  const r = fill('{{note}} {{client.business}}', { client: { business: 'A & B <Co>' } }, { note: 'Hello' }, { escape: true });
  assert.equal(r.text, 'Hello A &amp; B &lt;Co&gt;');
  const empty = fill('{{note}}', {}, { note: '' });
  assert.deepEqual(empty.unresolved, ['note']);
});

test('render fills subject and body, reports missing required fields, and renders HTML', () => {
  const t = findTemplate(seed, 'agreement');
  const r = render(t, ctx, { signLink: 'https://sign/1' });
  assert.equal(r.subject, 'Your Keepsite agreement');
  assert.match(r.text, /https:\/\/sign\/1/);
  assert.match(r.html, /<strong>Sign here:<\/strong>/);
  assert.deepEqual(r.missing, []);
  // The optional note defaults to '' and so renders as nothing, not as {{note}}.
  assert.ok(!r.text.includes('{{note}}'));
  const bare = render(t, ctx, {});
  assert.deepEqual(bare.missing, ['signLink']);
  assert.ok(bare.text.includes('{{signLink}}'));
  assert.deepEqual(bare.unresolved, ['signLink']);
});

test('toHtml renders paragraphs, bold and links', () => {
  const html = toHtml('Hi\n\n**bold** https://x/y');
  assert.match(html, /<p>Hi<\/p>/);
  assert.match(html, /<strong>bold<\/strong>/);
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `node --test netlify/functions/lib/office/templates.test.mjs`
Expected: FAIL, cannot find module `./templates.mjs`.

- [ ] **Step 5: Implement**

`netlify/functions/lib/office/templates.mjs`:

```js
// Templates are data the admin edits in the office. Two kinds of placeholder:
// auto-filled from the client and the event, and prompted, which the send
// screen asks for. Anything unresolved stays as {{name}} so a half-filled
// email is seen before it is sent, never sent with a blank.
import { marked } from 'marked';
import seed from '../../../../src/data/office/templates.json' with { type: 'json' };

const KEY = /^[a-z][a-zA-Z0-9-]{0,31}$/;
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

export const KNOWN_PLACEHOLDERS = [
  'client.name', 'client.firstName', 'client.business', 'client.email',
  'links.intro', 'links.brand', 'links.build', 'links.demo',
  'site.brand', 'site.url', 'site.email', 'site.phone',
  'admin.email',
  'questionnaire.title', 'questionnaire.link',
  'meeting.title', 'meeting.when', 'meeting.link', 'meeting.minutes', 'meeting.hours',
];

export function validateTemplates(value) {
  const errors = [];
  if (!Array.isArray(value)) return ['templates must be a list'];
  const ids = new Set();
  value.forEach((t, i) => {
    const at = `template ${i + 1}`;
    if (!t || typeof t !== 'object') return errors.push(`${at}: not an object`);
    if (!KEY.test(String(t.id))) errors.push(`${at}: id must be lowercase letters, digits and hyphens`);
    if (ids.has(t.id)) errors.push(`${at}: duplicate template id "${t.id}"`);
    ids.add(t.id);
    if (!t.name) errors.push(`${at}: name is required`);
    if (!t.subject) errors.push(`${at}: subject is required`);
    if (!t.body) errors.push(`${at}: body is required`);
    if (t.fields !== undefined) {
      if (!Array.isArray(t.fields)) return errors.push(`${at}: fields must be a list`);
      t.fields.forEach((f, j) => {
        const fat = `${at}, field ${j + 1}`;
        if (!f || typeof f !== 'object') return errors.push(`${fat}: not an object`);
        if (!KEY.test(String(f.key))) errors.push(`${fat}: key must be a single word`);
        if (!f.label) errors.push(`${fat}: label is required`);
      });
    }
  });
  return errors;
}

export async function loadTemplates(store) {
  return (await store.settings.get('templates')) ?? seed;
}

export const findTemplate = (templates, id) => templates.find((t) => t.id === id);

export const placeholdersIn = (source) =>
  [...new Set([...String(source).matchAll(PLACEHOLDER)].map((m) => m[1]))];

const lookup = (context, path) =>
  path.split('.').reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), context);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fill(source, context, prompted = {}, { escape = false } = {}) {
  const unresolved = [];
  const text = String(source).replace(PLACEHOLDER, (whole, name) => {
    let v = Object.hasOwn(prompted, name) ? prompted[name] : lookup(context, name);
    if (v == null || v === '') {
      if (!unresolved.includes(name)) unresolved.push(name);
      return `{{${name}}}`;
    }
    v = String(v);
    return escape ? escapeHtml(v) : v;
  });
  return { text, unresolved };
}

export function toHtml(markdown) {
  return marked.parse(markdown, { async: false, gfm: true, breaks: true });
}

export function render(template, context, prompted = {}) {
  const fields = template.fields ?? [];
  const values = Object.fromEntries(fields.map((f) => [f.key, prompted[f.key] ?? f.default ?? '']));
  // A field with default '' resolves to nothing rather than staying visible:
  // an optional note the admin left blank is not a mistake to flag.
  const optionalBlank = fields.filter((f) => !f.required && (values[f.key] ?? '') === '').map((f) => f.key);
  const strip = (r) => ({
    text: optionalBlank.reduce((t, k) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), ''), r.text),
    unresolved: r.unresolved.filter((n) => !optionalBlank.includes(n)),
  });
  const subject = strip(fill(template.subject, context, values));
  const text = strip(fill(template.body, context, values));
  const htmlSource = strip(fill(template.body, context, values, { escape: true }));
  const missing = fields.filter((f) => f.required && (values[f.key] ?? '') === '').map((f) => f.key);
  return {
    subject: subject.text.replace(/\s+/g, ' ').trim(),
    text: text.text.replace(/\n{3,}/g, '\n\n').trim(),
    html: toHtml(htmlSource.text.replace(/\n{3,}/g, '\n\n').trim()),
    unresolved: [...new Set([...subject.unresolved, ...text.unresolved])],
    missing,
  };
}
```

- [ ] **Step 6: Run tests**

Run: `node --test netlify/functions/lib/office/templates.test.mjs`
Expected: 7 passing.

- [ ] **Step 7: Extend check-office**

In `scripts/check-office.mjs`, after the pipeline checks and before the form-name checks, add:

```js
// Templates are the other half of the pipeline seed: a stage that names an
// email nobody wrote opens a 404 at the moment the admin advances a client.
import { validateTemplates, placeholdersIn, KNOWN_PLACEHOLDERS } from '../netlify/functions/lib/office/templates.mjs';
const templates = JSON.parse(fs.readFileSync('src/data/office/templates.json', 'utf8'));
errors.push(...validateTemplates(templates));
const templateIds = new Set(templates.map((t) => t.id));
for (const p of seed) {
  for (const s of p.stages) {
    if (s.email && !templateIds.has(s.email)) errors.push(`${p.id}/${s.id}: email "${s.email}" has no template`);
  }
}
for (const t of templates) {
  const prompted = new Set((t.fields ?? []).map((f) => f.key));
  for (const name of placeholdersIn(`${t.subject}\n${t.body}`)) {
    if (!KNOWN_PLACEHOLDERS.includes(name) && !prompted.has(name)) {
      errors.push(`template ${t.id}: {{${name}}} is neither an auto-fill placeholder nor a prompted field`);
    }
  }
}
```

Move the `import` line to the top of the file with the other imports (ESM imports must be top-level).

- [ ] **Step 8: Run the check and the suite**

Run: `npm run check:office && npm test`
Expected: `office seed ok`; all suites pass.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/data/office/templates.json netlify/functions/lib/office/templates.mjs netlify/functions/lib/office/templates.test.mjs scripts/check-office.mjs
git commit -m "Add email templates and their renderer"
```

---

### Task 2: Context, instants and the mail module

**Files:**
- Create: `netlify/functions/lib/office/context.mjs`
- Create: `netlify/functions/lib/office/context.test.mjs`
- Modify: `netlify/functions/lib/office/dates.mjs`
- Modify: `netlify/functions/lib/office/dates.test.mjs`
- Create: `netlify/functions/lib/office/mail.mjs`
- Create: `netlify/functions/lib/office/mail.test.mjs`

**Interfaces:**
- Consumes: `mint` from `netlify/functions/lib/token.mjs`; `src/data/site.json` (`brand`, `email`, `phone`); `toHtml` from Task 1; `newId`; store `emails.put`.
- Produces:
  - `siteUrl(): string` — `process.env.URL` or `https://www.keepsitemedia.com`.
  - `buildContext({ client, admin, secret, form?, meeting? }): Context` where `Context = { client: { name, firstName, business, email }, links: { intro, brand, build, demo }, site: { brand, url, email, phone }, admin: { email }, questionnaire?: { title, link }, meeting?: { title, when, link, minutes, hours? } }`. Questionnaire links are `''` when `secret` is empty.
  - `toInstant(ymd, hhmm, tz?): Date`; `formatWhen(ymd, hhmm): string` (e.g. `Tue, Sep 8 at 2:30 pm Mountain`); `formatHours(ms): string` (`about 24 hours`, `about 1 hour`, `45 minutes`).
  - `sendMail({ slug, to, subject, text, html?, attachments?, template?, kind? }, s?, fetchFn?, now?): Promise<{ ok, id, error }>` — logs to `emails/{slug}/{id}.json` as `{ id, slug, kind, template, to: string[], subject, text, sentAt, resendId, status: 'sent'|'failed', error }`.

- [ ] **Step 1: Failing tests for dates additions**

Append to `netlify/functions/lib/office/dates.test.mjs`:

```js
import { toInstant, formatWhen, formatHours } from './dates.mjs';

test('toInstant converts a Mountain wall time to the right instant across DST', () => {
  assert.equal(toInstant('2026-09-08', '14:30').toISOString(), '2026-09-08T20:30:00.000Z');
  assert.equal(toInstant('2026-12-08', '14:30').toISOString(), '2026-12-08T21:30:00.000Z');
});

test('formatWhen and formatHours read like an email', () => {
  assert.equal(formatWhen('2026-09-08', '14:30'), 'Tue, Sep 8 at 2:30 pm Mountain');
  assert.equal(formatHours(24 * 3600e3), 'about 24 hours');
  assert.equal(formatHours(1 * 3600e3), 'about 1 hour');
  assert.equal(formatHours(45 * 60e3), '45 minutes');
});
```

(Put the new `import` beside the existing one at the top of the file.)

- [ ] **Step 2: Implement dates additions**

Append to `netlify/functions/lib/office/dates.mjs`:

```js
// The offset of `tz` at `date`, by formatting the instant in that zone and
// reading the wall clock back. Intl has no direct offset API.
function offsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - date.getTime();
}

// A Mountain wall time to an instant. Guess as if UTC, then correct by the
// zone's offset at that guess; DST boundaries are the only hour this is
// approximate, and no meeting is booked at 2 a.m.
export function toInstant(ymd, hhmm, tz = TZ) {
  const [y, m, d] = parts(ymd);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - offsetMs(new Date(guess), tz));
}

export const formatWhen = (ymd, hhmm) => `${formatYmd(ymd)} at ${formatTime(hhmm)} Mountain`;

export function formatHours(ms) {
  const minutes = Math.round(ms / 60e3);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}
```

Run: `node --test netlify/functions/lib/office/dates.test.mjs` — 6 passing.

- [ ] **Step 3: Failing context tests**

`netlify/functions/lib/office/context.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, siteUrl } from './context.mjs';
import { mint } from '../token.mjs';

const client = { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' };

test('siteUrl prefers the Netlify URL variable', () => {
  const prior = process.env.URL;
  process.env.URL = 'https://preview.test';
  try { assert.equal(siteUrl(), 'https://preview.test'); } finally {
    if (prior === undefined) delete process.env.URL; else process.env.URL = prior;
  }
  delete process.env.URL;
  assert.equal(siteUrl(), 'https://www.keepsitemedia.com');
});

test('buildContext fills client, links, site and admin', () => {
  delete process.env.URL;
  const c = buildContext({ client, admin: { email: 'me@x' }, secret: 'sec' });
  assert.equal(c.client.firstName, 'Sierra');
  assert.equal(c.client.business, 'Lova');
  assert.equal(c.links.intro, `https://www.keepsitemedia.com/questionnaire/intro/?c=lova&t=${mint('sec', 'lova', 'intro')}`);
  assert.equal(c.links.demo, 'https://www.keepsitemedia.com/demo/lova/');
  assert.equal(c.site.brand, 'Keepsite Media');
  assert.equal(c.admin.email, 'me@x');
  assert.equal(c.questionnaire, undefined);
});

test('no secret means no questionnaire links, and a form adds the questionnaire block', () => {
  const c = buildContext({ client, admin: { email: 'me@x' }, secret: '', form: 'brand' });
  assert.equal(c.links.intro, '');
  assert.equal(c.questionnaire.link, '');
  assert.match(c.questionnaire.title, /brand/i);
});

test('a meeting adds when, link, minutes and hours', () => {
  const meeting = { title: 'Kickoff', ymd: '2026-09-08', time: '14:30', minutes: 30, link: 'https://meet/x' };
  const c = buildContext({ client, admin: { email: 'me@x' }, secret: '', meeting, now: new Date('2026-09-08T18:30:00Z') });
  assert.equal(c.meeting.when, 'Tue, Sep 8 at 2:30 pm Mountain');
  assert.equal(c.meeting.minutes, 30);
  assert.equal(c.meeting.hours, 'about 2 hours');
});
```

- [ ] **Step 4: Implement context**

`netlify/functions/lib/office/context.mjs`:

```js
// Everything a template may auto-fill about one client, built in one place so
// the send screen, the meeting emails and the digest all say the same thing.
import site from '../../../../src/data/site.json' with { type: 'json' };
import intro from '../../../../src/data/questionnaires/intro.json' with { type: 'json' };
import brand from '../../../../src/data/questionnaires/brand.json' with { type: 'json' };
import build from '../../../../src/data/questionnaires/build.json' with { type: 'json' };
import { mint } from '../token.mjs';
import { toInstant, formatWhen, formatHours } from './dates.mjs';

const TITLES = { __proto__: null, intro: intro.title, brand: brand.title, build: build.title };

export const siteUrl = () => process.env.URL || 'https://www.keepsitemedia.com';

const questionnaireLink = (secret, slug, form) =>
  secret ? `${siteUrl()}/questionnaire/${form}/?c=${slug}&t=${mint(secret, slug, form)}` : '';

export function buildContext({ client, admin, secret, form, meeting, now = new Date() }) {
  const url = siteUrl();
  const ctx = {
    client: {
      name: client.name,
      firstName: String(client.name ?? '').trim().split(/\s+/)[0] || client.business,
      business: client.business,
      email: client.email,
    },
    links: {
      intro: questionnaireLink(secret, client.slug, 'intro'),
      brand: questionnaireLink(secret, client.slug, 'brand'),
      build: questionnaireLink(secret, client.slug, 'build'),
      demo: `${url}/demo/${client.slug}/`,
    },
    site: { brand: site.brand, url, email: site.email, phone: site.phone },
    admin: { email: admin?.email ?? site.email },
  };
  if (form) ctx.questionnaire = { title: TITLES[form] ?? `${form} questionnaire`, link: questionnaireLink(secret, client.slug, form) };
  if (meeting) {
    ctx.meeting = {
      title: meeting.title,
      when: formatWhen(meeting.ymd, meeting.time),
      link: meeting.link || '(no link yet)',
      minutes: meeting.minutes,
      hours: formatHours(toInstant(meeting.ymd, meeting.time) - now),
    };
  }
  return ctx;
}
```

Run: `node --test netlify/functions/lib/office/context.test.mjs` — 4 passing.

- [ ] **Step 5: Failing mail tests**

`netlify/functions/lib/office/mail.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail } from './mail.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const NOW = new Date('2026-09-04T16:00:00Z');
const env = (vars, fn) => {
  const prior = { ...process.env };
  Object.assign(process.env, vars);
  for (const k of Object.keys(vars)) if (vars[k] === undefined) delete process.env[k];
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k];
    }
  });
};

test('a successful send is logged with the Resend id', async () => {
  await env({ RESEND_API_KEY: 'k', KEEPSITE_NOTIFY_FROM: 'office@x' }, async () => {
    const s = make();
    const calls = [];
    const fetchFn = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 're_1' }), { status: 200 }); };
    const r = await sendMail({ slug: 'lova', to: 's@example.com', subject: 'Hi', text: 'Body **b**', template: 'intro', kind: 'stage' }, s, fetchFn, NOW);
    assert.equal(r.ok, true);
    const [log] = await s.emails.list('lova');
    assert.equal(log.status, 'sent');
    assert.equal(log.resendId, 're_1');
    assert.deepEqual(log.to, ['s@example.com']);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.from, 'office@x');
    assert.match(body.html, /<strong>b<\/strong>/);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
  });
});

test('a Resend error and a network failure are logged as failed, not thrown', async () => {
  await env({ RESEND_API_KEY: 'k', KEEPSITE_NOTIFY_FROM: 'office@x' }, async () => {
    const s = make();
    const bad = async () => new Response(JSON.stringify({ message: 'nope' }), { status: 422 });
    const r = await sendMail({ slug: 'lova', to: 'a@b', subject: 's', text: 't' }, s, bad, NOW);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'nope');
    const boom = async () => { throw new Error('offline'); };
    const r2 = await sendMail({ slug: 'lova', to: 'a@b', subject: 's', text: 't' }, s, boom, new Date('2026-09-04T16:00:01Z'));
    assert.equal(r2.error, 'offline');
    assert.equal((await s.emails.list('lova')).filter((e) => e.status === 'failed').length, 2);
  });
});

test('missing secrets fail closed without calling Resend', async () => {
  await env({ RESEND_API_KEY: undefined, KEEPSITE_NOTIFY_FROM: undefined }, async () => {
    const s = make();
    let called = false;
    const r = await sendMail({ slug: 'lova', to: 'a@b', subject: 's', text: 't' }, s, async () => { called = true; }, NOW);
    assert.equal(called, false);
    assert.equal(r.ok, false);
    assert.match(r.error, /RESEND_API_KEY/);
    assert.equal((await s.emails.list('lova'))[0].status, 'failed');
  });
});

test('attachments and an explicit html body pass through', async () => {
  await env({ RESEND_API_KEY: 'k', KEEPSITE_NOTIFY_FROM: 'office@x' }, async () => {
    let sent;
    const fetchFn = async (url, init) => { sent = JSON.parse(init.body); return new Response('{"id":"x"}'); };
    await sendMail({ slug: 'lova', to: ['a@b', 'c@d'], subject: 's', text: 't', html: '<p>given</p>', attachments: [{ filename: 'm.ics', content: 'QUJD' }] }, make(), fetchFn, NOW);
    assert.equal(sent.html, '<p>given</p>');
    assert.deepEqual(sent.to, ['a@b', 'c@d']);
    assert.equal(sent.attachments[0].filename, 'm.ics');
  });
});
```

- [ ] **Step 6: Implement mail**

`netlify/functions/lib/office/mail.mjs`:

```js
// The one door to Resend. Every send, sent or failed, leaves a document in
// emails/{slug}/, because "did that go out?" is the question the Emails tab
// exists to answer, and a failure nobody can see is the worst outcome.
import { store as defaultStore } from './store.mjs';
import { newId } from './ids.mjs';
import { toHtml } from './templates.mjs';

const RESEND = 'https://api.resend.com/emails';

export async function sendMail(
  { slug, to, subject, text, html, attachments = [], template = null, kind = 'manual' },
  s = defaultStore(),
  fetchFn = fetch,
  now = new Date(),
) {
  const id = newId(now);
  const entry = {
    id, slug, kind, template,
    to: [].concat(to).filter(Boolean),
    subject, text,
    sentAt: now.toISOString(),
    resendId: null, status: 'failed', error: null,
  };
  const key = process.env.RESEND_API_KEY;
  const from = process.env.KEEPSITE_NOTIFY_FROM;
  if (!key || !from) {
    entry.error = 'RESEND_API_KEY or KEEPSITE_NOTIFY_FROM is not set';
  } else {
    try {
      const res = await fetchFn(RESEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: entry.to, subject, text, html: html ?? toHtml(text), attachments }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        entry.status = 'sent';
        entry.resendId = body.id ?? null;
      } else {
        entry.error = body.message ?? `Resend responded ${res.status}`;
      }
    } catch (e) {
      entry.error = e.message;
    }
  }
  await s.emails.put(slug, id, entry);
  return { ok: entry.status === 'sent', id, error: entry.error };
}
```

- [ ] **Step 7: Run tests and commit**

Run: `node --test netlify/functions/lib/office/` — all passing.

```bash
git add netlify/functions/lib/office/context.mjs netlify/functions/lib/office/context.test.mjs netlify/functions/lib/office/dates.mjs netlify/functions/lib/office/dates.test.mjs netlify/functions/lib/office/mail.mjs netlify/functions/lib/office/mail.test.mjs
git commit -m "Add the mail module, template context and instants"
```

---

### Task 3: The send action and the send screen

**Files:**
- Create: `netlify/functions/lib/office/actions/send.mjs`
- Create: `netlify/functions/lib/office/actions/send.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Create: `src/pages/office/send/[slug]/[template].astro`
- Modify: `src/styles/office.css`

**Interfaces:**
- Consumes: `loadTemplates`, `findTemplate`, `render`, `toHtml`, `placeholdersIn` (Task 1); `buildContext` (Task 2); `sendMail` (Task 2); http helpers; store.
- Produces:
  - Action `send`: fields `csrf`, `slug`, `template`, `subject`, `body`, optional `form`. Refuses if the template is unknown, if subject or body is empty, or if any `{{placeholder}}` remains in either (redirects back to the send screen with `?error=`). Sends to the client's email with `kind: 'template'`, then redirects to `/office/clients/{slug}/?tab=emails&sent=1`, or `&error=` on a failed send.
  - The send screen at `/office/send/{slug}/{template}/?form={form}` renders prompted inputs, an editable subject and body prefilled by `render`, and an HTML preview; a small inline script substitutes `{{key}}` in the subject and body as prompted inputs change.

- [ ] **Step 1: Failing action tests**

`netlify/functions/lib/office/actions/send.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { send } from './send.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/send', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; });
const ctx = () => ({ admin: { email: 'me@x' }, csrf });
const ok = async () => new Response('{"id":"re_1"}');

test('a filled email is sent to the client and logged', async () => {
  const s = await make();
  let sent;
  const fetchFn = async (u, i) => { sent = JSON.parse(i.body); return ok(); };
  const res = await send(post({ csrf, slug: 'lova', template: 'intro', subject: 'Ten minutes', body: 'Hi Sierra\n\nhttps://x' }), ctx(), s, fetchFn);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=emails&sent=1');
  assert.deepEqual(sent.to, ['s@example.com']);
  assert.equal(sent.subject, 'Ten minutes');
  const [log] = await s.emails.list('lova');
  assert.equal(log.template, 'intro');
  assert.equal(log.kind, 'template');
});

test('a leftover placeholder goes back to the send screen and sends nothing', async () => {
  const s = await make();
  let called = false;
  const res = await send(post({ csrf, slug: 'lova', template: 'agreement', subject: 'x', body: 'Sign: {{signLink}}' }), ctx(), s, async () => { called = true; });
  assert.equal(res.status, 303);
  assert.match(decodeURIComponent(res.headers.get('Location')), /^\/office\/send\/lova\/agreement\/\?error=.*signLink/);
  assert.equal(called, false);
  assert.equal((await s.emails.list('lova')).length, 0);
});

test('an empty subject, an unknown template, a bad csrf and a missing client are refused', async () => {
  const s = await make();
  const none = async () => { throw new Error('must not send'); };
  let res = await send(post({ csrf, slug: 'lova', template: 'intro', subject: '', body: 'b' }), ctx(), s, none);
  assert.match(decodeURIComponent(res.headers.get('Location')), /error=.*subject/);
  assert.equal((await send(post({ csrf, slug: 'lova', template: 'nope', subject: 's', body: 'b' }), ctx(), s, none)).status, 400);
  assert.equal((await send(post({ csrf: 'x', slug: 'lova', template: 'intro', subject: 's', body: 'b' }), ctx(), s, none)).status, 403);
  assert.equal((await send(post({ csrf, slug: 'ghost', template: 'intro', subject: 's', body: 'b' }), ctx(), s, none)).status, 404);
});

test('a failed send lands on the emails tab with the reason', async () => {
  const s = await make();
  const bad = async () => new Response('{"message":"domain not verified"}', { status: 403 });
  const res = await send(post({ csrf, slug: 'lova', template: 'intro', subject: 's', body: 'b' }), ctx(), s, bad);
  assert.match(decodeURIComponent(res.headers.get('Location')), /tab=emails&error=domain not verified/);
  assert.equal((await s.emails.list('lova'))[0].status, 'failed');
});
```

- [ ] **Step 2: Implement the action**

`netlify/functions/lib/office/actions/send.mjs`:

```js
import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { loadTemplates, findTemplate, placeholdersIn, toHtml } from '../templates.mjs';
import { sendMail } from '../mail.mjs';

const FORM = /^[a-z]+$/;

// The screen already filled the placeholders; the action's job is to refuse
// an email that still has one, then send exactly the text the admin saw.
export async function send(request, ctx, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const templateId = field(data, 'template');
  const template = findTemplate(await loadTemplates(s), templateId);
  if (!template) return problem(400, 'unknown template');

  const form = field(data, 'form');
  const back = (message) =>
    redirect(`/office/send/${slug}/${templateId}/?${form && FORM.test(form) ? `form=${form}&` : ''}error=${encodeURIComponent(message)}`);

  const subject = field(data, 'subject');
  const body = String(data.get('body') ?? '').trim();
  if (!subject) return back('subject is empty');
  if (!body) return back('body is empty');
  const leftover = placeholdersIn(`${subject}\n${body}`);
  if (leftover.length) return back(`fill in: ${leftover.join(', ')}`);

  const result = await sendMail(
    { slug, to: client.email, subject, text: body, html: toHtml(body), template: templateId, kind: 'template' },
    s, fetchFn, now,
  );
  return redirect(
    result.ok
      ? `/office/clients/${slug}/?tab=emails&sent=1`
      : `/office/clients/${slug}/?tab=emails&error=${encodeURIComponent(result.error ?? 'send failed')}`,
  );
}
```

Add to `actions.mjs`:

```js
import { send } from './actions/send.mjs';
export const actions = { __proto__: null, login, logout, client, stage, task, settings, export: exportData, send };
```

Run: `node --test netlify/functions/lib/office/actions/send.test.mjs` — 4 passing.

- [ ] **Step 3: Styles**

Append to `src/styles/office.css`:

```css
.office .send { display: grid; gap: var(--space-3); grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
@media (max-width: 60rem) { .office .send { grid-template-columns: 1fr; } }
.office .send textarea { width: 100%; min-height: 22rem; font-family: inherit; }
.office .preview { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); }
.office .preview p { margin: 0 0 var(--space-2); }
```

- [ ] **Step 4: Send screen**

`src/pages/office/send/[slug]/[template].astro`:

```astro
---
export const prerender = false;
import OfficeLayout from '../../../../layouts/OfficeLayout.astro';
import { store, SLUG } from '../../../../../netlify/functions/lib/office/store.mjs';
import { loadTemplates, findTemplate, render } from '../../../../../netlify/functions/lib/office/templates.mjs';
import { buildContext } from '../../../../../netlify/functions/lib/office/context.mjs';

type Field = { key: string; label: string; default?: string; required?: boolean };
type Template = { id: string; name: string; subject: string; body: string; fields?: Field[] };
type ClientDoc = { slug: string; name: string; business: string; email: string };
type Rendered = { subject: string; text: string; html: string; unresolved: string[]; missing: string[] };

const slug = Astro.params.slug ?? '';
const templateId = Astro.params.template ?? '';
if (!SLUG.test(slug)) return new Response('not found', { status: 404 });
const s = store();
const client = (await s.clients.get(slug)) as ClientDoc | null;
if (!client) return new Response('not found', { status: 404 });
const template = findTemplate(await loadTemplates(s), templateId) as Template | undefined;
if (!template) return new Response('not found', { status: 404 });

const form = Astro.url.searchParams.get('form') ?? '';
const error = Astro.url.searchParams.get('error');
const secret = process.env.KEEPSITE_TOKEN_SECRET ?? '';
const context = buildContext({ client, admin: Astro.locals.admin, secret, form: /^[a-z]+$/.test(form) ? form : undefined });
// Rendered with defaults only; prompted values are typed on the page and
// substituted by the inline script, then the action re-checks for leftovers.
const rendered = render(template, context, {}) as Rendered;
const fields = template.fields ?? [];
const csrf = Astro.locals.csrf;
---
<OfficeLayout title={`Send: ${template.name}`}>
  <div class="toolbar">
    <h1>{template.name}</h1>
    <span class="muted">to {client.name} &lt;{client.email}&gt;</span>
    <a href={`/office/clients/${slug}/?tab=emails`}>Back to {client.business}</a>
  </div>
  {error && <p class="error">{error}</p>}
  {!secret && <p class="error">KEEPSITE_TOKEN_SECRET is not set, so questionnaire links are blank.</p>}
  {rendered.unresolved.filter((u) => !fields.some((f) => f.key === u)).length > 0 && (
    <p class="error">Could not fill: {rendered.unresolved.filter((u) => !fields.some((f) => f.key === u)).join(', ')}. Edit them by hand below.</p>
  )}
  <form method="POST" action="/office/api/send" id="send" class="send">
    <div>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="template" value={template.id} />
      {form && <input type="hidden" name="form" value={form} />}
      {fields.length > 0 && (
        <fieldset>
          <legend>Fill in</legend>
          {fields.map((f) => (
            <label class="field">
              <span>{f.label}{f.required && <span class="field-hint"> Required</span>}</span>
              <input name={`f_${f.key}`} data-prompt={f.key} value={f.default ?? ''} required={f.required} />
            </label>
          ))}
        </fieldset>
      )}
      <label class="field"><span>Subject</span><input name="subject" value={rendered.subject} data-original={rendered.subject} required /></label>
      <label class="field"><span>Body (Markdown)</span><textarea name="body" data-original={rendered.text}>{rendered.text}</textarea></label>
      <button class="btn">Send</button>
    </div>
    <div>
      <h2>Preview</h2>
      <div class="preview" set:html={rendered.html} />
      <p class="muted">The preview shows the template as loaded; the text on the left is what will be sent.</p>
    </div>
  </form>
  <script is:inline>
    // Prompted values replace {{key}} in the subject and body as they are
    // typed, from a pristine copy, so retyping never compounds.
    (function () {
      var form = document.getElementById('send');
      var prompts = form.querySelectorAll('[data-prompt]');
      var targets = [form.querySelector('[name="subject"]'), form.querySelector('[name="body"]')];
      function apply() {
        targets.forEach(function (el) {
          var out = el.getAttribute('data-original');
          prompts.forEach(function (p) {
            var re = new RegExp('\\{\\{\\s*' + p.getAttribute('data-prompt') + '\\s*\\}\\}', 'g');
            if (p.value) out = out.replace(re, p.value);
          });
          el.value = out;
        });
      }
      prompts.forEach(function (p) { p.addEventListener('input', apply); });
      apply();
    })();
  </script>
</OfficeLayout>
```

The script rewrites the subject and body only from their pristine copies, so an admin who edits the body by hand should do so after the prompted fields are filled; the page says which is which.

- [ ] **Step 5: Gate and commit**

Run: `npm run gate` — passes (`check:office` sees one control per name: `csrf`, `slug`, `template`, `form`, `f_*`, `subject`, `body`).

```bash
git add netlify/functions/lib/office/actions/send.mjs netlify/functions/lib/office/actions/send.test.mjs netlify/functions/lib/office/actions.mjs "src/pages/office/send" src/styles/office.css
git commit -m "Add the send screen and send action"
```

---

### Task 4: Emails tab, templates settings and stage-entry redirect

**Files:**
- Modify: `src/pages/office/clients/[slug].astro`
- Modify: `src/pages/office/settings.astro`
- Modify: `netlify/functions/lib/office/actions/settings.mjs`
- Modify: `netlify/functions/lib/office/actions/settings.test.mjs`
- Modify: `netlify/functions/lib/office/actions/stage.mjs`
- Modify: `netlify/functions/lib/office/actions/stage.test.mjs`

**Interfaces:**
- Consumes: `loadTemplates`, `validateTemplates`; the stage's `email` field in `pipelines.json`.
- Produces:
  - Emails tab at `?tab=emails`: a "Send" toolbar with one link per template whose id does not start with `meeting-`, then the log newest first (`sentAt`, subject, template, status, reason when failed, expandable text). `?sent=1` shows a Sent badge; `?error=` the error banner (already rendered).
  - Settings page gains a second form for `templates`; the settings action accepts `name=templates`.
  - Stage action: when the advance records a new history entry and the stage declares `email`, redirect to `/office/send/{slug}/{email}/` instead of the client page.

- [ ] **Step 1: Failing settings test**

Append to `netlify/functions/lib/office/actions/settings.test.mjs`:

```js
test('templates are validated and stored under their own name', async () => {
  const s = make();
  const good = JSON.stringify([{ id: 'hello', name: 'Hello', subject: 'Hi {{client.firstName}}', body: 'Body' }]);
  const res = await settings(post({ csrf, name: 'templates', value: good }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/settings/?saved=1');
  assert.equal((await s.settings.get('templates'))[0].id, 'hello');
  const bad = await settings(post({ csrf, name: 'templates', value: '[{"id":"x","name":"X","subject":"","body":"b"}]' }), ctx(), s);
  assert.match(decodeURIComponent(bad.headers.get('Location')), /subject/);
});
```

- [ ] **Step 2: Wire the validator**

In `netlify/functions/lib/office/actions/settings.mjs`:

```js
import { validateTemplates } from '../templates.mjs';
const VALIDATORS = { __proto__: null, pipelines: validatePipelines, templates: validateTemplates };
```

Run: `node --test netlify/functions/lib/office/actions/settings.test.mjs` — 4 passing.

- [ ] **Step 3: Failing stage test**

In `netlify/functions/lib/office/actions/stage.test.mjs`, change the first test's Location assertion and add a test:

```js
test('advancing writes the stage and its tasks and opens the stage email', async () => {
  const s = await seeded();
  const res = await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s, new Date('2026-09-04T16:00:00Z'));
  assert.equal(res.headers.get('Location'), '/office/send/lova/agreement/');
  assert.equal((await s.clients.get('lova')).stage, 'agreement');
  const titles = (await s.tasks.list('lova')).map((t) => t.title).sort();
  assert.deepEqual(titles, ['Deposit received', 'Reply with recommendation', 'Send agreement']);
});

test('a stage without an email, or re-setting the same stage, lands on the client page', async () => {
  const s = await seeded();
  const demo = await stage(post({ csrf, slug: 'lova', stage: 'demo' }), ctx(), s);
  assert.equal(demo.headers.get('Location'), '/office/clients/lova/');
  await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s);
  const again = await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s);
  assert.equal(again.headers.get('Location'), '/office/clients/lova/');
});
```

- [ ] **Step 4: Redirect on stage entry**

In `netlify/functions/lib/office/actions/stage.mjs`, replace the final `return redirect(...)`:

```js
  // A stage with an entry email opens the send screen rather than sending:
  // the admin reads it with the client in mind and clicks Send themselves.
  const entered = updated.stages.length > client.stages.length;
  const target = findStage(pipeline, stageId);
  if (entered && target.email) return redirect(`/office/send/${slug}/${target.email}/`);
  return redirect(`/office/clients/${slug}/`);
```

Run: `node --test netlify/functions/lib/office/actions/stage.test.mjs` — 3 passing.

- [ ] **Step 5: Emails tab**

In `src/pages/office/clients/[slug].astro`:

Add imports:

```astro
import { loadTemplates } from '../../../../netlify/functions/lib/office/templates.mjs';
```

Add types:

```ts
type EmailDoc = { id: string; kind: string; template: string | null; to: string[]; subject: string; text: string; sentAt: string; status: string; error: string | null };
type TemplateRow = { id: string; name: string };
```

After `const files = ...`:

```astro
const sent = Astro.url.searchParams.get('sent');
const emails = tab === 'emails' ? ((await s.emails.list(slug)) as EmailDoc[]).reverse() : [];
const sendable = tab === 'emails' ? ((await loadTemplates(s)) as TemplateRow[]).filter((t) => !t.id.startsWith('meeting-')) : [];
```

Add `['emails', 'Emails']` to `tabs` after the questionnaires entry.

Add the tab body before the closing `</OfficeLayout>`:

```astro
  {tab === 'emails' && (
    <>
      {sent && <p><span class="badge">Sent</span></p>}
      <h2>Send</h2>
      <p class="toolbar">
        {sendable.map((t) => <a class="btn-outline btn-small" href={`/office/send/${slug}/${t.id}/`}>{t.name}</a>)}
      </p>
      <h2>Log</h2>
      {emails.length === 0 && <p class="empty">Nothing sent yet.</p>}
      {emails.length > 0 && (
        <div class="table-scroll"><table>
          <thead><tr><th>When</th><th>Subject</th><th>Kind</th><th>Status</th></tr></thead>
          <tbody>
            {emails.map((e) => (
              <tr>
                <td>{e.sentAt.slice(0, 16).replace('T', ' ')}</td>
                <td><details><summary>{e.subject}</summary><pre style="white-space: pre-wrap">{e.text}</pre></details></td>
                <td>{e.template ?? e.kind}</td>
                <td class={e.status === 'failed' ? 'overdue' : ''}>{e.status}{e.error && ` · ${e.error}`}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  )}
```

- [ ] **Step 6: Templates editor**

In `src/pages/office/settings.astro`, import `loadTemplates` and load `const templates = await loadTemplates(s); const templatesStored = (await s.settings.get('templates')) !== null;`, then add after the pipelines form:

```astro
  <h2>Email templates</h2>
  <p class="muted">
    {templatesStored ? 'Edited in the office; the copy in git is the seed.' : 'Showing the seed from src/data/office/templates.json.'}
    Placeholders like <code>{'{{client.firstName}}'}</code> fill from the client; a template's <code>fields</code> are asked for on the send screen. Bodies are Markdown.
  </p>
  <form method="POST" action="/office/api/settings">
    <input type="hidden" name="csrf" value={Astro.locals.csrf} />
    <input type="hidden" name="name" value="templates" />
    <textarea name="value" class="json" aria-label="Templates as JSON" spellcheck="false">{JSON.stringify(templates, null, 2)}</textarea>
    <p><button class="btn btn-small">Save templates</button></p>
  </form>
```

- [ ] **Step 7: Gate and commit**

Run: `npm run gate` — passes.

```bash
git add "src/pages/office/clients/[slug].astro" src/pages/office/settings.astro netlify/functions/lib/office/actions/settings.mjs netlify/functions/lib/office/actions/settings.test.mjs netlify/functions/lib/office/actions/stage.mjs netlify/functions/lib/office/actions/stage.test.mjs
git commit -m "Add the emails tab, template editor and stage email"
```

---

### Task 5: Calendar files and the meeting action

**Files:**
- Create: `netlify/functions/lib/office/ics.mjs`
- Create: `netlify/functions/lib/office/ics.test.mjs`
- Create: `netlify/functions/lib/office/actions/meeting.mjs`
- Create: `netlify/functions/lib/office/actions/meeting.test.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`

**Interfaces:**
- Consumes: `toInstant`, `isYmd`, `isHhmm`, `newId`, `ID`, `buildContext`, `render`, `findTemplate`, `loadTemplates`, `sendMail`, store `meetings.*`.
- Produces:
  - Meeting document: `{ id, slug, title, ymd, time, minutes, link, notes, remindersSent: { day: null|ISO, hour: null|ISO }, createdAt, updatedAt }`.
  - `buildIcs({ uid, start: Date, minutes, summary, description, url, organizer: { name, email }, attendee: { name, email }, stamp: Date }): string` — CRLF line endings, UTC `DTSTART`/`DTEND`, escaped text.
  - `confirmMeeting({ client, meeting, admin, s, fetchFn, now }): Promise<void>` — sends the `meeting-confirmation` template to the client and to `KEEPSITE_NOTIFY_TO` with the `.ics` attached; best-effort.
  - Action `meeting`: `op=add` (`slug`, `title`, `date`, `time`, `minutes`, `link`, `notes`, `back`), `op=reschedule` (`slug`, `id`, `date`, `time`), `op=delete` (`slug`, `id`). Add and reschedule send a confirmation; reschedule resets `remindersSent`. Redirects to `back` when it is a safe office path, else `/office/clients/{slug}/?tab=meetings`.

- [ ] **Step 1: Failing ics tests**

`netlify/functions/lib/office/ics.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from './ics.mjs';

const base = {
  uid: 'm1@keepsitemedia.com',
  start: new Date('2026-09-08T20:30:00Z'),
  minutes: 30,
  summary: 'Kickoff, then more',
  description: 'Line one\nLine two; with semicolon',
  url: 'https://meet/x',
  organizer: { name: 'Keepsite Media', email: 'office@x' },
  attendee: { name: 'Sierra Lee', email: 's@example.com' },
  stamp: new Date('2026-09-04T16:00:00Z'),
};

test('a calendar file has the required lines in UTC with CRLF endings', () => {
  const ics = buildIcs(base);
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('DTSTART:20260908T203000Z'));
  assert.ok(lines.includes('DTEND:20260908T210000Z'));
  assert.ok(lines.includes('DTSTAMP:20260904T160000Z'));
  assert.ok(lines.includes('UID:m1@keepsitemedia.com'));
  assert.ok(lines.includes('SUMMARY:Kickoff\\, then more'));
  assert.ok(lines.includes('DESCRIPTION:Line one\\nLine two\\; with semicolon'));
  assert.ok(lines.includes('URL:https://meet/x'));
  assert.ok(lines.includes('ORGANIZER;CN=Keepsite Media:mailto:office@x'));
  assert.ok(lines.includes('ATTENDEE;CN=Sierra Lee;RSVP=FALSE:mailto:s@example.com'));
  assert.equal(lines.at(-2), 'END:VCALENDAR');
  assert.equal(lines.at(-1), '');
  assert.ok(!ics.includes('\n\n'));
});

test('an empty url is omitted', () => {
  assert.ok(!buildIcs({ ...base, url: '' }).includes('URL:'));
});
```

- [ ] **Step 2: Implement ics**

`netlify/functions/lib/office/ics.mjs`:

```js
// One VEVENT, hand-built: the format is small, and a dependency for it would
// be the only one in the office that touches nothing else.
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs({ uid, start, minutes, summary, description, url, organizer, attendee, stamp: at = new Date() }) {
  const end = new Date(start.getTime() + minutes * 60e3);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Keepsite Media//Office//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${esc(uid)}`,
    `DTSTAMP:${stamp(at)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(url ? [`URL:${esc(url)}`] : []),
    `ORGANIZER;CN=${esc(organizer.name)}:mailto:${organizer.email}`,
    `ATTENDEE;CN=${esc(attendee.name)};RSVP=FALSE:mailto:${attendee.email}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
```

Run: `node --test netlify/functions/lib/office/ics.test.mjs` — 2 passing.

- [ ] **Step 3: Failing meeting action tests**

`netlify/functions/lib/office/actions/meeting.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meeting } from './meeting.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/meeting', { method: 'POST', body: d });
};
let csrf;
test.before(() => {
  process.env.KEEPSITE_SESSION_SECRET = 's'; process.env.RESEND_API_KEY = 'k';
  process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@x';
  csrf = mintCsrf('s');
});
test.after(() => { for (const k of ['KEEPSITE_SESSION_SECRET', 'RESEND_API_KEY', 'KEEPSITE_NOTIFY_FROM', 'KEEPSITE_NOTIFY_TO']) delete process.env[k]; });
const ctx = () => ({ admin: { email: 'me@x' }, csrf });
const NOW = new Date('2026-09-04T16:00:00Z');
const add = { csrf, op: 'add', slug: 'lova', title: 'Kickoff', date: '2026-09-08', time: '14:30', minutes: '30', link: 'https://meet/x', notes: 'Bring the logo' };

test('add stores the meeting and emails the client and the admin with a calendar file', async () => {
  const s = await make();
  const sent = [];
  const fetchFn = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); };
  const res = await meeting(post(add), ctx(), s, fetchFn, NOW);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=meetings');
  const [m] = await s.meetings.list('lova');
  assert.equal(m.title, 'Kickoff');
  assert.equal(m.ymd, '2026-09-08');
  assert.equal(m.time, '14:30');
  assert.equal(m.minutes, 30);
  assert.deepEqual(m.remindersSent, { day: null, hour: null });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((x) => x.to), [['s@example.com'], ['me@x']]);
  assert.match(sent[0].subject, /Confirmed: Kickoff on Tue, Sep 8 at 2:30 pm Mountain/);
  assert.equal(sent[0].attachments[0].filename, 'kickoff.ics');
  assert.match(Buffer.from(sent[0].attachments[0].content, 'base64').toString(), /DTSTART:20260908T203000Z/);
  assert.equal((await s.emails.list('lova')).length, 2);
});

test('add validates its fields and refuses an unknown client', async () => {
  const s = await make();
  const none = async () => { throw new Error('must not send'); };
  assert.equal((await meeting(post({ ...add, title: '' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, date: '2026-9-8' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, time: '2:30' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, minutes: '0' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, link: 'javascript:alert(1)' }), ctx(), s, none)).status, 400);
  assert.equal((await meeting(post({ ...add, slug: 'ghost' }), ctx(), s, none)).status, 404);
  assert.equal((await meeting(post({ ...add, csrf: 'x' }), ctx(), s, none)).status, 403);
  assert.equal((await s.meetings.list('lova')).length, 0);
});

test('reschedule moves the meeting, resets reminders and re-confirms; delete removes it', async () => {
  const s = await make();
  const sent = [];
  const fetchFn = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); };
  await meeting(post(add), ctx(), s, fetchFn, NOW);
  const [{ id }] = await s.meetings.list('lova');
  await s.meetings.put('lova', id, { ...(await s.meetings.get('lova', id)), remindersSent: { day: '2026-09-07T20:00:00.000Z', hour: null } });
  const res = await meeting(post({ csrf, op: 'reschedule', slug: 'lova', id, date: '2026-09-09', time: '09:00', back: '/office/calendar/?d=2026-09-09' }), ctx(), s, fetchFn, NOW);
  assert.equal(res.headers.get('Location'), '/office/calendar/?d=2026-09-09');
  const m = await s.meetings.get('lova', id);
  assert.equal(m.ymd, '2026-09-09');
  assert.deepEqual(m.remindersSent, { day: null, hour: null });
  assert.equal(sent.length, 4);
  const del = await meeting(post({ csrf, op: 'delete', slug: 'lova', id }), ctx(), s, fetchFn, NOW);
  assert.equal(del.status, 303);
  assert.equal(await s.meetings.get('lova', id), null);
  assert.equal(sent.length, 4);
});

test('a failed confirmation still keeps the meeting', async () => {
  const s = await make();
  const bad = async () => new Response('{"message":"nope"}', { status: 500 });
  const res = await meeting(post(add), ctx(), s, bad, NOW);
  assert.equal(res.status, 303);
  assert.equal((await s.meetings.list('lova')).length, 1);
  assert.ok((await s.emails.list('lova')).every((e) => e.status === 'failed'));
});
```

- [ ] **Step 4: Implement the meeting action**

`netlify/functions/lib/office/actions/meeting.mjs`:

```js
import { readForm, redirect, problem, field, checkCsrf, safeNext, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { newId, ID } from '../ids.mjs';
import { isYmd, isHhmm, toInstant } from '../dates.mjs';
import { buildContext } from '../context.mjs';
import { loadTemplates, findTemplate, render } from '../templates.mjs';
import { buildIcs } from '../ics.mjs';
import { sendMail } from '../mail.mjs';

const LINK = /^https?:\/\/\S+$/;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meeting';

// Both parties get the same confirmation with the same calendar file, so
// neither can hold a different time. Sends are best-effort: the meeting is
// already stored, and the Emails tab shows a failure.
export async function confirmMeeting({ client, meeting, admin, s, fetchFn = fetch, now = new Date() }) {
  const template = findTemplate(await loadTemplates(s), 'meeting-confirmation');
  if (!template) return;
  const context = buildContext({ client, admin, secret: process.env.KEEPSITE_TOKEN_SECRET ?? '', meeting, now });
  const { subject, text, html } = render(template, context, {});
  const ics = buildIcs({
    uid: `${meeting.id}@keepsitemedia.com`,
    start: toInstant(meeting.ymd, meeting.time),
    minutes: meeting.minutes,
    summary: meeting.title,
    description: [meeting.notes, meeting.link].filter(Boolean).join('\n'),
    url: meeting.link,
    organizer: { name: context.site.brand, email: process.env.KEEPSITE_NOTIFY_FROM ?? context.site.email },
    attendee: { name: client.name, email: client.email },
    stamp: now,
  });
  const attachments = [{ filename: `${slugify(meeting.title)}.ics`, content: Buffer.from(ics).toString('base64') }];
  const base = { slug: client.slug, subject, text, html, attachments, template: 'meeting-confirmation', kind: 'meeting-confirmation' };
  await sendMail({ ...base, to: client.email }, s, fetchFn, now);
  if (process.env.KEEPSITE_NOTIFY_TO) await sendMail({ ...base, to: process.env.KEEPSITE_NOTIFY_TO }, s, fetchFn, new Date(now.getTime() + 1000));
}

const when = (data) => {
  const ymd = field(data, 'date');
  const time = field(data, 'time');
  if (!isYmd(ymd)) return { error: 'date must be a date' };
  if (!isHhmm(time)) return { error: 'time must be HH:MM' };
  return { ymd, time };
};

export async function meeting(request, ctx, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const back = field(data, 'back');
  const to = safeNext(back) === back ? back : `/office/clients/${slug}/?tab=meetings`;
  const op = field(data, 'op');
  const at = now.toISOString();

  if (op === 'add') {
    const title = field(data, 'title');
    if (!title) return problem(400, 'title is required');
    const w = when(data);
    if (w.error) return problem(400, w.error);
    const minutes = Number(field(data, 'minutes') || 30);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) return problem(400, 'minutes must be between 5 and 480');
    const link = field(data, 'link');
    if (link && !LINK.test(link)) return problem(400, 'link must start with http:// or https://');
    const id = newId(now);
    const doc = {
      id, slug, title, ymd: w.ymd, time: w.time, minutes, link, notes: field(data, 'notes'),
      remindersSent: { day: null, hour: null }, createdAt: at, updatedAt: at,
    };
    await s.meetings.put(slug, id, doc);
    await confirmMeeting({ client, meeting: doc, admin: ctx.admin, s, fetchFn, now });
    return redirect(to);
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.meetings.get(slug, id);
  if (!existing) return problem(404, 'no such meeting');

  if (op === 'reschedule') {
    const w = when(data);
    if (w.error) return problem(400, w.error);
    // A moved meeting is a new meeting to the reminder cron.
    const doc = { ...existing, ymd: w.ymd, time: w.time, remindersSent: { day: null, hour: null }, updatedAt: at };
    await s.meetings.put(slug, id, doc);
    await confirmMeeting({ client, meeting: doc, admin: ctx.admin, s, fetchFn, now });
    return redirect(to);
  }
  if (op === 'delete') {
    await s.meetings.remove(slug, id);
    return redirect(to);
  }
  return problem(400, 'unknown op');
}
```

Add to `actions.mjs`:

```js
import { meeting } from './actions/meeting.mjs';
export const actions = { __proto__: null, login, logout, client, stage, task, settings, export: exportData, send, meeting };
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test netlify/functions/lib/office/` — all passing.

```bash
git add netlify/functions/lib/office/ics.mjs netlify/functions/lib/office/ics.test.mjs netlify/functions/lib/office/actions/meeting.mjs netlify/functions/lib/office/actions/meeting.test.mjs netlify/functions/lib/office/actions.mjs
git commit -m "Add meetings with calendar-file confirmations"
```

---

### Task 6: Meetings in the client page, calendar and dashboard

**Files:**
- Create: `src/components/office/MeetingRow.astro`
- Modify: `src/pages/office/clients/[slug].astro`
- Modify: `src/pages/office/calendar.astro`
- Modify: `src/pages/office/index.astro`

**Interfaces:**
- Consumes: meeting documents; `itemsForDay(tasks, meetings, ymd)` already merges anything with `ymd` and `time`; `formatTime`, `formatYmd`, `addDays`.
- Produces: `MeetingRow` props `meeting`, `csrf`, `back`, `showClient?`, `business?`; a Meetings tab at `?tab=meetings`; meeting items on the calendar; a Meetings section on the dashboard listing today and tomorrow.

- [ ] **Step 1: MeetingRow**

`src/components/office/MeetingRow.astro`:

```astro
---
import { formatYmd, formatTime } from '../../../netlify/functions/lib/office/dates.mjs';
interface Props { meeting: any; csrf: string; back: string; showClient?: boolean; business?: string }
const { meeting: m, csrf, back, showClient = false, business = '' } = Astro.props;
---
<tr>
  <td>{formatYmd(m.ymd)} · {formatTime(m.time)}</td>
  {showClient && <td><a href={`/office/clients/${m.slug}/?tab=meetings`}>{business || m.slug}</a></td>}
  <td>
    {m.title} <span class="muted">· {m.minutes} min</span>
    {m.link && <> · <a href={m.link}>join</a></>}
    {m.notes && <div class="muted">{m.notes}</div>}
  </td>
  <td>
    <details class="inline">
      <summary class="btn-outline btn-small">Move</summary>
      <form method="POST" action="/office/api/meeting" class="inline">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="slug" value={m.slug} />
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="back" value={back} />
        <input type="date" name="date" value={m.ymd} required aria-label="New date" />
        <input type="time" name="time" value={m.time} required aria-label="New time" />
        <button class="btn-small" name="op" value="reschedule">Save and re-send</button>
        <button class="btn-small" name="op" value="delete" formnovalidate>Cancel meeting</button>
      </form>
    </details>
  </td>
</tr>
```

- [ ] **Step 2: Meetings tab**

In `src/pages/office/clients/[slug].astro`: import `MeetingRow` and `formatTime`; add the type

```ts
type MeetingDoc = { id: string; slug: string; title: string; ymd: string; time: string; minutes: number; link: string; notes: string };
```

load

```astro
const meetings = tab === 'meetings' ? ((await s.meetings.list(slug)) as MeetingDoc[]).sort((a, b) => `${a.ymd}${a.time}`.localeCompare(`${b.ymd}${b.time}`)) : [];
const upcoming = meetings.filter((m) => m.ymd >= today);
const past = meetings.filter((m) => m.ymd < today);
```

add `['meetings', 'Meetings']` to `tabs` before `emails`, and the tab body:

```astro
  {tab === 'meetings' && (
    <>
      <h2>Book a meeting</h2>
      <form method="POST" action="/office/api/meeting" class="row">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="op" value="add" />
        <input type="hidden" name="back" value={here} />
        <label class="field"><span>Title</span><input name="title" required value="Kickoff call" /></label>
        <label class="field"><span>Date</span><input type="date" name="date" required value={today} /></label>
        <label class="field"><span>Time (Mountain)</span><input type="time" name="time" required value="10:00" /></label>
        <label class="field"><span>Minutes</span><input type="number" name="minutes" min="5" max="480" value="30" /></label>
        <label class="field"><span>Video link</span><input name="link" placeholder="https://" /></label>
        <label class="field"><span>Notes for the invite</span><input name="notes" /></label>
        <p><button class="btn btn-small">Book and send confirmation</button></p>
      </form>
      <h2>Upcoming</h2>
      {upcoming.length === 0 && <p class="empty">Nothing booked.</p>}
      {upcoming.length > 0 && (
        <div class="table-scroll"><table>
          <tbody>{upcoming.map((m) => <MeetingRow meeting={m} csrf={csrf} back={here} />)}</tbody>
        </table></div>
      )}
      {past.length > 0 && (
        <details><summary>Past ({past.length})</summary>
          <div class="table-scroll"><table>
            <tbody>{past.map((m) => <MeetingRow meeting={m} csrf={csrf} back={here} />)}</tbody>
          </table></div>
        </details>
      )}
    </>
  )}
```

- [ ] **Step 3: Calendar**

In `src/pages/office/calendar.astro`: import `MeetingRow`; add `type Meeting = { id: string; slug: string; title: string; ymd: string; time: string; minutes: number; link: string; notes: string }`; extend `Item` to `{ kind: 'task' | 'meeting'; time: string | null; slug: string; id: string }`; load `const meetings = (await s.meetings.listAll()) as Meeting[];`; change `itemsForDay(tasks, [], day)` to `itemsForDay(tasks, meetings, day)`; add meeting dates to `marked` (`for (const m of meetings) marked.add(m.ymd);`); and in the items table render meetings through `MeetingRow`:

```astro
{items.map((i) => i.kind === 'meeting'
  ? <MeetingRow meeting={i} csrf={csrf} back={here} showClient business={names.get(i.slug)} />
  : <TaskRow task={i} csrf={csrf} today={today} back={here} showClient business={names.get(i.slug)} />)}
```

- [ ] **Step 4: Dashboard**

In `src/pages/office/index.astro`: import `MeetingRow` and `addDays`; add the `Meeting` type as above; load

```astro
const tomorrow = addDays(today, 1);
const meetings = ((await s.meetings.listAll()) as Meeting[])
  .filter((m) => m.ymd === today || m.ymd === tomorrow)
  .sort((a, b) => `${a.ymd}${a.time}`.localeCompare(`${b.ymd}${b.time}`));
```

and replace the Meetings placeholder:

```astro
  <h2>Meetings <span class="muted">today and tomorrow</span></h2>
  {meetings.length === 0 ? <p class="empty">None.</p> : (
    <div class="table-scroll"><table>
      <tbody>{meetings.map((m) => <MeetingRow meeting={m} csrf={csrf} back="/office/" showClient business={names.get(m.slug)} />)}</tbody>
    </table></div>
  )}
```

Leave the Payments placeholder for phase 3.

- [ ] **Step 5: Gate and commit**

Run: `npm run gate` — passes (`check:office` accepts the meeting form: every name once, `op` on buttons only in `MeetingRow`).

```bash
git add src/components/office/MeetingRow.astro "src/pages/office/clients/[slug].astro" src/pages/office/calendar.astro src/pages/office/index.astro
git commit -m "Show meetings on the client, calendar and dashboard"
```

---

### Task 7: Meeting reminders cron

**Files:**
- Create: `netlify/functions/lib/office/reminders.mjs`
- Create: `netlify/functions/lib/office/reminders.test.mjs`
- Create: `netlify/functions/office-meetings-cron.mjs`

**Interfaces:**
- Consumes: `toInstant`, `buildContext`, `render`, `findTemplate`, `loadTemplates`, `sendMail`, store.
- Produces:
  - `dueReminders(meetings, now): { meeting, kind: 'day'|'hour' }[]` — one entry per meeting: `hour` when it starts within 2 hours and `remindersSent.hour` is unset, else `day` when within 25 hours and `remindersSent.day` is unset. Past meetings never qualify.
  - `runMeetingReminders({ s?, now?, fetchFn? }): Promise<{ sent: number, considered: number }>` — writes the flag first (both flags when sending `hour`), then sends the `meeting-reminder` template to the client and to `KEEPSITE_NOTIFY_TO`.
  - Netlify scheduled function `office-meetings-cron` on `@hourly`.

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/reminders.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, runMeetingReminders } from './reminders.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';

// 2026-09-08 14:30 Mountain is 20:30Z.
const m = (over = {}) => ({ id: newId(), slug: 'lova', title: 'Kickoff', ymd: '2026-09-08', time: '14:30', minutes: 30, link: 'https://meet/x', notes: '', remindersSent: { day: null, hour: null }, ...over });

test('dueReminders picks day within 25 hours and hour within 2, never both, never past', () => {
  const dayBefore = new Date('2026-09-07T20:00:00Z');
  assert.deepEqual(dueReminders([m()], dayBefore).map((d) => d.kind), ['day']);
  assert.deepEqual(dueReminders([m({ remindersSent: { day: '2026-09-07T19:00:00.000Z', hour: null } })], dayBefore), []);
  const ninetyMinutesBefore = new Date('2026-09-08T19:00:00Z');
  assert.deepEqual(dueReminders([m()], ninetyMinutesBefore).map((d) => d.kind), ['hour']);
  assert.deepEqual(dueReminders([m({ remindersSent: { day: 'x', hour: 'y' } })], ninetyMinutesBefore), []);
  assert.deepEqual(dueReminders([m()], new Date('2026-09-06T00:00:00Z')), []);
  assert.deepEqual(dueReminders([m()], new Date('2026-09-08T21:00:00Z')), []);
});

test('runMeetingReminders flags then sends to client and admin, and never sends twice', async () => {
  process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@x';
  try {
    const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
    await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' });
    const doc = m();
    await s.meetings.put('lova', doc.id, doc);
    const sent = [];
    const fetchFn = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); };
    // Exactly 24 hours before 20:30Z on the 8th, so formatHours reads "about 24 hours".
    const now = new Date('2026-09-07T20:30:00Z');
    const r = await runMeetingReminders({ s, now, fetchFn });
    assert.deepEqual(r, { considered: 1, sent: 1 });
    assert.equal(sent.length, 2);
    assert.match(sent[0].subject, /^Reminder: Kickoff in about 24 hours$/);
    assert.equal((await s.meetings.get('lova', doc.id)).remindersSent.day, now.toISOString());
    const again = await runMeetingReminders({ s, now: new Date('2026-09-07T21:00:00Z'), fetchFn });
    assert.equal(again.sent, 0);
    const near = await runMeetingReminders({ s, now: new Date('2026-09-08T19:00:00Z'), fetchFn });
    assert.equal(near.sent, 1);
    assert.equal(sent.length, 4);
    const after = await s.meetings.get('lova', doc.id);
    assert.ok(after.remindersSent.hour);
  } finally {
    delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; delete process.env.KEEPSITE_NOTIFY_TO;
  }
});

test('a meeting whose client is gone is skipped, and a send failure does not throw', async () => {
  process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x';
  try {
    const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
    const orphan = m({ slug: 'ghost' });
    await s.meetings.put('ghost', orphan.id, orphan);
    await s.clients.put('lova', { slug: 'lova', name: 'S', business: 'Lova', email: 's@example.com' });
    const doc = m();
    await s.meetings.put('lova', doc.id, doc);
    const boom = async () => { throw new Error('offline'); };
    const r = await runMeetingReminders({ s, now: new Date('2026-09-07T20:00:00Z'), fetchFn: boom });
    assert.deepEqual(r, { considered: 2, sent: 1 });
    assert.equal((await s.emails.list('lova'))[0].status, 'failed');
  } finally {
    delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM;
  }
});
```

Seed fix in this task: the `meeting-reminder` template says `in about {{meeting.hours}}` while `formatHours` already returns `about 24 hours`. In `src/data/office/templates.json` change that template's subject to `Reminder: {{meeting.title}} in {{meeting.hours}}` and its body sentence to `**{{meeting.title}}** is on {{meeting.when}}, {{meeting.hours}} from now.`

- [ ] **Step 2: Implement**

`netlify/functions/lib/office/reminders.mjs`:

```js
// Hourly cron. Flags are written before the send so a retry can never send
// twice; the trade is that a failed send is not retried, which the Emails
// tab shows as a failed entry.
import { store as defaultStore } from './store.mjs';
import { toInstant } from './dates.mjs';
import { buildContext } from './context.mjs';
import { loadTemplates, findTemplate, render } from './templates.mjs';
import { sendMail } from './mail.mjs';

const HOUR = 3600e3;

export function dueReminders(meetings, now) {
  const out = [];
  for (const m of meetings) {
    const ms = toInstant(m.ymd, m.time) - now;
    if (ms <= 0) continue;
    const sent = m.remindersSent ?? {};
    if (ms <= 2 * HOUR && !sent.hour) out.push({ meeting: m, kind: 'hour' });
    else if (ms <= 25 * HOUR && !sent.day) out.push({ meeting: m, kind: 'day' });
  }
  return out;
}

export async function runMeetingReminders({ s = defaultStore(), now = new Date(), fetchFn = fetch } = {}) {
  const due = dueReminders(await s.meetings.listAll(), now);
  const template = findTemplate(await loadTemplates(s), 'meeting-reminder');
  let sent = 0;
  for (const { meeting, kind } of due) {
    const client = await s.clients.get(meeting.slug);
    if (!client || !template) continue;
    const at = now.toISOString();
    // The hour reminder supersedes a day reminder that never went out.
    const remindersSent = kind === 'hour'
      ? { day: meeting.remindersSent?.day ?? at, hour: at }
      : { ...meeting.remindersSent, day: at };
    await s.meetings.put(meeting.slug, meeting.id, { ...meeting, remindersSent });
    const context = buildContext({ client, admin: null, secret: process.env.KEEPSITE_TOKEN_SECRET ?? '', meeting, now });
    const { subject, text, html } = render(template, context, {});
    const base = { slug: meeting.slug, subject, text, html, template: 'meeting-reminder', kind: `meeting-reminder-${kind}` };
    await sendMail({ ...base, to: client.email }, s, fetchFn, now);
    if (process.env.KEEPSITE_NOTIFY_TO) await sendMail({ ...base, to: process.env.KEEPSITE_NOTIFY_TO }, s, fetchFn, new Date(now.getTime() + 1000));
    sent += 1;
  }
  return { considered: due.length, sent };
}
```

`netlify/functions/office-meetings-cron.mjs`:

```js
// Netlify runs this on the hour. Everything it does is in reminders.mjs,
// which is what the tests cover; this file only exists to be scheduled.
import { runMeetingReminders } from './lib/office/reminders.mjs';

export default async () => {
  try {
    const result = await runMeetingReminders();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('meeting reminders failed', e);
    return new Response('failed', { status: 500 });
  }
};

export const config = { schedule: '@hourly' };
```

Run: `node --test netlify/functions/lib/office/reminders.test.mjs && npm run check:office` — 3 passing, seed ok.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/lib/office/reminders.mjs netlify/functions/lib/office/reminders.test.mjs netlify/functions/office-meetings-cron.mjs src/data/office/templates.json
git commit -m "Send meeting reminders from an hourly cron"
```

---

### Task 8: The daily digest

**Files:**
- Create: `netlify/functions/lib/office/digest.mjs`
- Create: `netlify/functions/lib/office/digest.test.mjs`
- Create: `netlify/functions/office-digest-cron.mjs`

**Interfaces:**
- Consumes: `dueBucket`, `addDays`, `formatYmd`, `formatTime`, `todayIn`, `sendMail`, `siteUrl`, store (`clients.list`, `tasks.listAll`, `meetings.listAll`, `agreements.listAll`, `payments.listAll`, `questionnaires.get`).
- Produces:
  - `buildDigest({ clients, tasks, meetings, submitted, agreements = [], payments = [], today, now }): { empty, subject, text }` where `submitted` is a `Set` of `${slug}/${form}` keys. Sections: Overdue, Due today, Next three days, Meetings today and tomorrow, Questionnaires waiting (a `questionnaire` task open and more than three days past due with no submission, with a nudge link), Failed payments (`payments` with `status === 'failed'`), Agreements unsigned (`agreements` with `status === 'sent'` and `sentAt` more than five days ago). `empty` is true when every section is empty. The text ends with `Generated <local time> Mountain`.
  - `runDigest({ s?, now?, fetchFn? }): Promise<{ sent: boolean }>` — sends to `KEEPSITE_NOTIFY_TO` under slug `office`, kind `digest`, unless empty.
  - Netlify scheduled function `office-digest-cron` on `0 13 * * *` (7 a.m. Mountain during daylight time; adjust by hand in November and March).

- [ ] **Step 1: Failing tests**

`netlify/functions/lib/office/digest.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, runDigest } from './digest.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';

const today = '2026-09-08';
const now = new Date('2026-09-08T13:00:00Z');
const clients = [{ slug: 'lova', business: 'Lova' }, { slug: 'acme', business: 'Acme' }];
const t = (slug, due, over = {}) => ({ id: newId(), slug, title: 'Task', due, time: null, done: false, questionnaire: null, ...over });

test('an empty office produces an empty digest', () => {
  const d = buildDigest({ clients, tasks: [], meetings: [], submitted: new Set(), today, now });
  assert.equal(d.empty, true);
});

test('every section renders with its items and a nudge link', () => {
  const tasks = [
    t('lova', '2026-09-01', { title: 'Late' }),
    t('acme', today, { title: 'Today', time: '09:00' }),
    t('lova', '2026-09-10', { title: 'Soon' }),
    t('lova', '2026-09-20', { title: 'Later' }),
    t('lova', '2026-09-01', { title: 'Brand questionnaire back', questionnaire: 'brand' }),
    t('acme', '2026-09-01', { title: 'Intro questionnaire back', questionnaire: 'intro' }),
    t('lova', '2026-09-02', { title: 'Done', done: true }),
  ];
  const meetings = [
    { slug: 'acme', title: 'Kickoff', ymd: today, time: '14:00', minutes: 30 },
    { slug: 'lova', title: 'Tomorrow', ymd: '2026-09-09', time: '10:00', minutes: 30 },
    { slug: 'lova', title: 'Far', ymd: '2026-09-15', time: '10:00', minutes: 30 },
  ];
  const submitted = new Set(['acme/intro']);
  const payments = [{ slug: 'acme', kind: 'monthly', amount: 15000, status: 'failed', failureReason: 'card declined' }];
  const agreements = [{ slug: 'lova', status: 'sent', sentAt: '2026-09-01T00:00:00.000Z' }, { slug: 'acme', status: 'sent', sentAt: '2026-09-06T00:00:00.000Z' }];
  const d = buildDigest({ clients, tasks, meetings, submitted, agreements, payments, today, now });
  assert.equal(d.empty, false);
  assert.equal(d.subject, 'Office digest for Tue, Sep 8');
  // Late, plus the two overdue questionnaire tasks.
  assert.match(d.text, /Overdue \(3\)[\s\S]*Lova: Late \(Tue, Sep 1\)/);
  assert.match(d.text, /Due today \(1\)[\s\S]*Acme: Today at 9:00 am/);
  assert.match(d.text, /Next three days \(1\)[\s\S]*Lova: Soon \(Thu, Sep 10\)/);
  assert.ok(!d.text.includes('Later'));
  assert.ok(!d.text.includes('Done'));
  assert.match(d.text, /Meetings today and tomorrow \(2\)[\s\S]*Acme: Kickoff, Tue, Sep 8 at 2:00 pm[\s\S]*Lova: Tomorrow, Wed, Sep 9 at 10:00 am/);
  assert.ok(!d.text.includes('Far'));
  assert.match(d.text, /Questionnaires waiting \(1\)[\s\S]*Lova: brand, due Tue, Sep 1[\s\S]*\/office\/send\/lova\/questionnaire-reminder\/\?form=brand/);
  assert.ok(!d.text.includes('/office/send/acme/questionnaire-reminder'));
  assert.match(d.text, /Failed payments \(1\)[\s\S]*Acme: monthly \$150\.00, card declined/);
  assert.match(d.text, /Agreements unsigned \(1\)[\s\S]*Lova: sent Tue, Sep 1/);
  assert.match(d.text, /Generated .*Mountain$/);
});

test('an overdue questionnaire counts in Overdue once and in Questionnaires waiting once', () => {
  const tasks = [t('lova', '2026-09-01', { title: 'Brand questionnaire back', questionnaire: 'brand' })];
  const d = buildDigest({ clients, tasks, meetings: [], submitted: new Set(), today, now });
  assert.match(d.text, /Overdue \(1\)/);
  assert.match(d.text, /Questionnaires waiting \(1\)/);
  const recent = buildDigest({ clients, tasks: [t('lova', '2026-09-06', { questionnaire: 'brand' })], meetings: [], submitted: new Set(), today, now });
  assert.ok(!recent.text.includes('Questionnaires waiting'));
});

test('runDigest sends to the admin under the office slug, and sends nothing when empty', async () => {
  process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@x';
  try {
    const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
    let called = 0;
    const fetchFn = async () => { called += 1; return new Response('{"id":"re"}'); };
    assert.deepEqual(await runDigest({ s, now, fetchFn }), { sent: false });
    assert.equal(called, 0);
    await s.clients.put('lova', { slug: 'lova', business: 'Lova', email: 'l@x' });
    const task = t('lova', '2026-09-01');
    await s.tasks.put('lova', task.id, task);
    assert.deepEqual(await runDigest({ s, now, fetchFn }), { sent: true });
    assert.equal(called, 1);
    const [log] = await s.emails.list('office');
    assert.equal(log.kind, 'digest');
    assert.deepEqual(log.to, ['me@x']);
  } finally {
    delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; delete process.env.KEEPSITE_NOTIFY_TO;
  }
});
```

- [ ] **Step 2: Implement**

`netlify/functions/lib/office/digest.mjs`:

```js
// One morning email instead of a ping per task: at thirty clients the pings
// become noise and the list does not. Empty sections are left out, and an
// empty digest is not sent at all.
import { store as defaultStore } from './store.mjs';
import { addDays, formatYmd, formatTime, todayIn, TZ } from './dates.mjs';
import { dueBucket } from './calendar.mjs';
import { sendMail } from './mail.mjs';
import { siteUrl } from './context.mjs';

const DAY = 86400e3;
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function buildDigest({ clients, tasks, meetings, submitted, agreements = [], payments = [], today, now }) {
  const name = new Map(clients.map((c) => [c.slug, c.business]));
  const who = (slug) => name.get(slug) ?? slug;
  const open = tasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due) || (a.time ?? '').localeCompare(b.time ?? ''));
  const line = (t) => `${who(t.slug)}: ${t.title}${t.time ? ` at ${formatTime(t.time)}` : ''}${t.due === today ? '' : ` (${formatYmd(t.due)})`}`;
  const bucket = (b) => open.filter((t) => dueBucket(t, today) === b).map(line);

  const tomorrow = addDays(today, 1);
  const meetingLines = meetings
    .filter((m) => m.ymd === today || m.ymd === tomorrow)
    .sort((a, b) => `${a.ymd}${a.time}`.localeCompare(`${b.ymd}${b.time}`))
    .map((m) => `${who(m.slug)}: ${m.title}, ${formatYmd(m.ymd)} at ${formatTime(m.time)}`);

  const nudgeAfter = addDays(today, -3);
  const waiting = open
    .filter((t) => t.questionnaire && t.due < nudgeAfter && !submitted.has(`${t.slug}/${t.questionnaire}`))
    .map((t) => `${who(t.slug)}: ${t.questionnaire}, due ${formatYmd(t.due)} — nudge: ${siteUrl()}/office/send/${t.slug}/questionnaire-reminder/?form=${t.questionnaire}`);

  const failed = payments
    .filter((p) => p.status === 'failed')
    .map((p) => `${who(p.slug)}: ${p.kind} ${money(p.amount)}${p.failureReason ? `, ${p.failureReason}` : ''}`);

  const unsigned = agreements
    .filter((a) => a.status === 'sent' && now - new Date(a.sentAt) > 5 * DAY)
    .map((a) => `${who(a.slug)}: sent ${formatYmd(a.sentAt.slice(0, 10))}`);

  const sections = [
    ['Overdue', bucket('overdue')],
    ['Due today', bucket('today')],
    ['Next three days', bucket('soon')],
    ['Meetings today and tomorrow', meetingLines],
    ['Questionnaires waiting', waiting],
    ['Failed payments', failed],
    ['Agreements unsigned', unsigned],
  ].filter(([, items]) => items.length);

  const generated = new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(now);
  const text = [
    ...sections.map(([title, items]) => `${title} (${items.length})\n${items.map((i) => `- ${i}`).join('\n')}`),
    `Generated ${generated} Mountain`,
  ].join('\n\n');
  return { empty: sections.length === 0, subject: `Office digest for ${formatYmd(today)}`, text };
}

export async function runDigest({ s = defaultStore(), now = new Date(), fetchFn = fetch } = {}) {
  const today = todayIn(undefined, now);
  const [clients, tasks, meetings, agreements, payments] = await Promise.all([
    s.clients.list(), s.tasks.listAll(), s.meetings.listAll(), s.agreements.listAll(), s.payments.listAll(),
  ]);
  const submitted = new Set();
  for (const t of tasks) {
    if (t.questionnaire && !t.done && (await s.questionnaires.get(t.slug, t.questionnaire))) submitted.add(`${t.slug}/${t.questionnaire}`);
  }
  const digest = buildDigest({ clients, tasks, meetings, submitted, agreements, payments, today, now });
  if (digest.empty || !process.env.KEEPSITE_NOTIFY_TO) return { sent: false };
  await sendMail({ slug: 'office', to: process.env.KEEPSITE_NOTIFY_TO, subject: digest.subject, text: digest.text, kind: 'digest' }, s, fetchFn, now);
  return { sent: true };
}
```

`netlify/functions/office-digest-cron.mjs`:

```js
// 13:00 UTC is 7 a.m. Mountain during daylight time and 6 a.m. in winter.
// Netlify schedules run in UTC; the digest prints its local generation time
// so the drift is visible, and the hour is adjusted by hand twice a year.
import { runDigest } from './lib/office/digest.mjs';

export default async () => {
  try {
    const result = await runDigest();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('digest failed', e);
    return new Response('failed', { status: 500 });
  }
};

export const config = { schedule: '0 13 * * *' };
```

Run: `node --test netlify/functions/lib/office/digest.test.mjs` — 4 passing.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/lib/office/digest.mjs netlify/functions/lib/office/digest.test.mjs netlify/functions/office-digest-cron.mjs
git commit -m "Send a daily office digest"
```

---

### Task 9: Documentation and the full gate

**Files:**
- Modify: `netlify.toml`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-04-client-office-design.md`

- [ ] **Step 0: Ship site.json with the functions**

`context.mjs` imports `src/data/site.json`, and both crons import `context.mjs`. Extend `[functions] included_files` in `netlify.toml` to:

```toml
  included_files = ["src/data/questionnaires/*.json", "src/data/office/*.json", "src/data/packages.json", "src/data/site.json"]
```

- [ ] **Step 1: README**

In the "The office (/office)" section of `README.md`, extend the environment table with:

| Variable | What it does |
|---|---|
| `RESEND_API_KEY`, `KEEPSITE_NOTIFY_FROM`, `KEEPSITE_NOTIFY_TO` | Already set for the questionnaires. The office sends every client email from `KEEPSITE_NOTIFY_FROM` and the daily digest and meeting copies to `KEEPSITE_NOTIFY_TO`. |
| `URL` | Set by Netlify. Used in links inside emails; locally it is unset and links point at `https://www.keepsitemedia.com`. |

and add these subsections after "Inquiries":

````markdown
### Email

Templates live in Settings → Email templates (seeded from
`src/data/office/templates.json`). `{{client.firstName}}`, `{{links.intro}}`
and the rest fill from the client; a template's `fields` are asked for on the
send screen. Advancing a client to a stage with an `email` opens that
template's send screen; nothing goes out until you click Send. Every send,
sent or failed, appears on the client's Emails tab.

### Meetings

Book from the client's Meetings tab. The client and `KEEPSITE_NOTIFY_TO`
each get a confirmation with a calendar file. Two scheduled functions run:

| Function | Schedule (UTC) | Does |
|---|---|---|
| `office-meetings-cron` | every hour | Reminders about 24 hours and about 1 hour before each meeting, to the client and to you. |
| `office-digest-cron` | `0 13 * * *` | One morning email: overdue and upcoming tasks, meetings today and tomorrow, questionnaires waiting, failed payments, unsigned agreements. Not sent when empty. |

13:00 UTC is 7 a.m. Mountain in summer and 6 a.m. in winter. Change the hour
in `netlify/functions/office-digest-cron.mjs` in March and November if that
matters. Netlify shows both functions under Functions → Scheduled.
````

- [ ] **Step 2: Spec note**

In the spec's Email section, after the template placeholder list, add one sentence: "Until phases 3 and 4 exist, the agreement and launch templates take `signLink` and `payLink` as prompted fields the admin pastes; those phases replace them with `links.sign` and `links.pay`."

- [ ] **Step 3: Full gate**

Run: `npm run gate`
Expected: every step passes, including `check:office`'s template checks.

- [ ] **Step 4: Commit**

```bash
git add netlify.toml README.md docs/superpowers/specs/2026-09-04-client-office-design.md
git commit -m "Document office email, meetings and crons"
```

- [ ] **Step 5: Deploy checklist (by hand, after merge)**

1. Confirm `RESEND_API_KEY`, `KEEPSITE_NOTIFY_FROM` and `KEEPSITE_NOTIFY_TO` are set in Netlify, and that the from address's domain is verified in Resend.
2. Deploy. Netlify → Functions: `office-meetings-cron` and `office-digest-cron` appear as scheduled.
3. Book a test meeting for yourself as a client: both confirmations arrive with a working `.ics`.
4. Advance a test client to Agreement: the send screen opens, the required field blocks Send until filled, the sent email appears on the Emails tab.
5. The next morning's digest arrives at 7 a.m. Mountain, or does not arrive if nothing is due.
