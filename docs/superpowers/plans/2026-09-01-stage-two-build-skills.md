# Stage Two Build Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two Claude Code skills — `keepsite-sitemap` and `keepsite-build` — that turn a client's two questionnaire exports plus their four-direction demo into a written page set and then an Astro repository satisfying the Stage Two clause of the Keepsite agreements.

**Architecture:** A new git repository `keepsite-skills/` holds the source of truth: a dependency-free Node library (`lib/`) with `node --test` coverage, two skill directories (`skills/`), and an installer that copies them into `~/.claude/skills/`. `~/.claude` is not a git repository, so nothing is edited there directly; `npm run install-skills` is re-run after every task that changes a skill.

**Tech Stack:** Node 20 (`node:test`, `node:assert/strict`, no runtime dependencies), Astro 5, `@fontsource` variable fonts, Netlify.

**Spec:** `keepsite/docs/superpowers/specs/2026-09-01-stage-two-build-skill-design.md`

## Global Constraints

- Node 20. `lib/` uses node builtins only — no npm dependencies, ever. Tests run with `node --test`.
- ESM throughout. `"type": "module"` in every `package.json`.
- Source of truth is `keepsite-skills/`. Never hand-edit `~/.claude/skills/keepsite-sitemap/` or `~/.claude/skills/keepsite-build/`; run `npm run install-skills`.
- Client intake lives at `{slug}/intake/`, which is listed in the client repo's `.gitignore` and never under `public/`.
- No Decap CMS in generated client repos. No `public/admin`.
- No remote image sources anywhere in a generated client repo — no `<img src="http…">`, no CSS `background-image: url(http…)`.
- Real English at Stage Two: nav labels, `<title>`, `<h1>` page titles, section labels, button and link text, form field labels and input types, footer contact labels, `alt` text.
- Lorem at Stage Two: headlines, subheads, body copy, testimonial quotes and attributions, FAQ questions and answers, card blurbs, meta descriptions.
- Every generated page carries `<meta name="robots" content="noindex,nofollow">` until launch.
- The locked page set is committed to the client repo as `src/data/pages.json`. `intake/` is gitignored and absent on Netlify, so `verify.mjs` reads `pages.json`, never `sitemap.md`.

### Spec refinements adopted here

Three gaps found while planning. They refine the spec rather than contradict it; the spec should be amended after this plan is approved.

1. **`src/data/pages.json`.** The spec has `verify.mjs` checking `dist/` against the approved page set, but `sitemap.md` lives in gitignored `intake/` and is not present in a Netlify build. `keepsite-build` therefore writes the locked page set to `src/data/pages.json`, which is committed, and `verify.mjs` reads that.
2. **Client row selection.** The spec says "latest row per form." A Google Sheets export contains every client's responses, not one client's, so latest-row alone picks the wrong client. `readIntake` takes a `match` string (email or business name), filters to matching rows, then takes the latest by `Timestamp`. One row in the file needs no match; an ambiguous match throws with the candidate list so the skill can ask.
3. **`X-Robots-Tag` header.** The spec's `noindex` is a meta tag. The generated `netlify.toml` also sets `X-Robots-Tag = "noindex, nofollow"` on `/*`, because a header covers non-HTML responses that a meta tag cannot. Both are removed at launch.

---

### Task 1: Repository scaffold and skill installer

**Files:**
- Create: `/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/package.json`
- Create: `/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/.gitignore`
- Create: `/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/README.md`
- Create: `/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/install.mjs`
- Test: `/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/install.test.mjs`

All later paths in this plan are relative to `keepsite-skills/`.

**Interfaces:**
- Consumes: nothing.
- Produces: `installSkills({ from, to }) -> string[]` returning the absolute paths of installed skill directories. `npm test` runs `node --test`. `npm run install-skills` installs into `~/.claude/skills`.

- [ ] **Step 1: Create the directory and initialise git**

```bash
mkdir -p /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills
cd /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills
git init -b main
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "keepsite-skills",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Source of truth for the keepsite-sitemap and keepsite-build Claude Code skills.",
  "scripts": {
    "test": "node --test",
    "install-skills": "node install.mjs"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
.DS_Store

# Never commit: client questionnaire exports, brand uploads, credentials.
fixtures/private/
*.docx
.env
```

- [ ] **Step 4: Write the failing test `install.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from './install.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ks-install-'));

test('copies each skill directory into the target', () => {
  const from = tmp();
  const to = tmp();
  fs.mkdirSync(path.join(from, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(from, 'alpha', 'SKILL.md'), '# alpha\n');

  const installed = installSkills({ from, to });

  assert.equal(installed.length, 1);
  assert.equal(fs.readFileSync(path.join(to, 'alpha', 'SKILL.md'), 'utf8'), '# alpha\n');
});

test('replaces a previous install rather than merging into it', () => {
  const from = tmp();
  const to = tmp();
  fs.mkdirSync(path.join(from, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(from, 'alpha', 'SKILL.md'), '# new\n');
  fs.mkdirSync(path.join(to, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(to, 'alpha', 'stale.md'), 'gone\n');

  installSkills({ from, to });

  assert.equal(fs.existsSync(path.join(to, 'alpha', 'stale.md')), false);
  assert.equal(fs.readFileSync(path.join(to, 'alpha', 'SKILL.md'), 'utf8'), '# new\n');
});

test('copies the shared lib into every skill directory', () => {
  const from = tmp();
  const to = tmp();
  const lib = path.join(tmp(), 'lib');
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, 'csv.mjs'), 'export const x = 1;\n');
  fs.mkdirSync(path.join(from, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(from, 'alpha', 'SKILL.md'), '# alpha\n');

  installSkills({ from, to, lib });

  assert.equal(fs.existsSync(path.join(to, 'alpha', 'lib', 'csv.mjs')), true);
});

test('skips test files when copying the lib', () => {
  const from = tmp();
  const to = tmp();
  const lib = path.join(tmp(), 'lib');
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, 'csv.mjs'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(lib, 'csv.test.mjs'), 'nope\n');
  fs.mkdirSync(path.join(from, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(from, 'alpha', 'SKILL.md'), '# alpha\n');

  installSkills({ from, to, lib });

  assert.equal(fs.existsSync(path.join(to, 'alpha', 'lib', 'csv.test.mjs')), false);
});
```

- [ ] **Step 5: Run the test and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../install.mjs`

- [ ] **Step 6: Write `install.mjs`**

```js
// Copies the skill directories into ~/.claude/skills. ~/.claude is not a git
// repository, so this repo is the source of truth and the installed copies are
// disposable. Copy rather than symlink: skill discovery globbing symlinked
// directories is not something this depends on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function installSkills({
  from = path.join(here, 'skills'),
  to = path.join(os.homedir(), '.claude', 'skills'),
  lib = path.join(here, 'lib'),
} = {}) {
  fs.mkdirSync(to, { recursive: true });
  const names = fs
    .readdirSync(from, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const installed = [];
  for (const name of names) {
    const dest = path.join(to, name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(path.join(from, name), dest, { recursive: true });
    if (fs.existsSync(lib)) {
      fs.cpSync(lib, path.join(dest, 'lib'), {
        recursive: true,
        filter: (src) => !src.endsWith('.test.mjs'),
      });
    }
    installed.push(dest);
  }
  return installed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of installSkills()) console.log(`installed ${p}`);
}
```

- [ ] **Step 7: Run the test and verify it passes**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 8: Write `README.md`**

```markdown
# keepsite-skills

Source of truth for two Claude Code skills that implement Stage Two of the
Keepsite agreements.

- `skills/keepsite-sitemap` — reads a client's two questionnaire exports and
  their four-direction demo, writes `intake/brief.md` and `intake/sitemap.md`,
  and stops for human review.
- `skills/keepsite-build` — reads those two files and produces the client's
  Astro repository.

`lib/` is a dependency-free Node library shared by both skills. `install.mjs`
copies each skill directory into `~/.claude/skills/`, with a copy of `lib/`
inside it.

    npm test              # node --test
    npm run install-skills

Never edit `~/.claude/skills/keepsite-*` directly. Edit here and re-install.

Design spec: `../keepsite/docs/superpowers/specs/2026-09-01-stage-two-build-skill-design.md`
```

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore README.md install.mjs install.test.mjs
git commit -m "Add skills repo scaffold and installer"
```

---

### Task 2: CSV reader

**Files:**
- Create: `lib/csv.mjs`
- Test: `lib/csv.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCsv(text) -> string[][]` (raw rows) and `parseCsvRecords(text) -> Record<string,string>[]` (header-keyed objects, blank rows dropped).

- [ ] **Step 1: Write the failing test `lib/csv.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvRecords } from './csv.mjs';

test('splits plain rows and columns', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('keeps commas inside quoted fields', () => {
  assert.deepEqual(parseCsv('a,b\n"one, two",3\n'), [['a', 'b'], ['one, two', '3']]);
});

test('keeps newlines inside quoted fields', () => {
  assert.deepEqual(parseCsv('a\n"line one\nline two"\n'), [['a'], ['line one\nline two']]);
});

test('unescapes doubled quotes', () => {
  assert.deepEqual(parseCsv('a\n"she said ""hi"""\n'), [['a'], ['she said "hi"']]);
});

test('tolerates CRLF line endings', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('strips a UTF-8 byte order mark', () => {
  assert.deepEqual(parseCsv('﻿a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('handles a final row with no trailing newline', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('keys records by header text', () => {
  const rows = parseCsvRecords('Timestamp,What does your business do?\n2026-08-01,Flowers\n');
  assert.deepEqual(rows, [{ Timestamp: '2026-08-01', 'What does your business do?': 'Flowers' }]);
});

test('drops rows that are entirely blank', () => {
  const rows = parseCsvRecords('a,b\n1,2\n,\n');
  assert.equal(rows.length, 1);
});

test('fills short rows with empty strings', () => {
  const rows = parseCsvRecords('a,b,c\n1,2\n');
  assert.deepEqual(rows, [{ a: '1', b: '2', c: '' }]);
});

test('returns nothing for an empty file', () => {
  assert.deepEqual(parseCsvRecords(''), []);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test lib/csv.test.mjs`
Expected: FAIL — `Cannot find module .../lib/csv.mjs`

- [ ] **Step 3: Write `lib/csv.mjs`**

```js
// Minimal RFC 4180 reader, sized for Google Sheets exports: any field holding
// a comma, newline, or quote comes back quoted, with quotes doubled. Written
// by hand rather than pulled from npm so the skills stay dependency-free and
// runnable from a bare ~/.claude/skills copy.

export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (s[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseCsvRecords(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const [headers, ...body] = rows;
  return body
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test lib/csv.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/csv.mjs lib/csv.test.mjs
git commit -m "Add dependency-free CSV reader"
```

---

### Task 3: Intake reader

**Files:**
- Create: `lib/intake.mjs`
- Test: `lib/intake.test.mjs`

**Interfaces:**
- Consumes: `parseCsvRecords` from `lib/csv.mjs`.
- Produces:
  - `normalise(s) -> string` — lowercased, curly quotes folded, punctuation collapsed to single spaces.
  - `field(record, ...needles) -> string` — value of the first header whose normalised text contains every normalised needle; `''` when absent.
  - `checkboxes(value, options?) -> string[]` — multi-select answer split into option strings, form order preserved, unrecognised remainder appended.
  - `selectResponse(records, match?) -> Record<string,string>` — throws `Error` when zero or more than one candidate remains after matching.
  - `readIntake(dir, { match }?) -> { demo, build, counts }` — reads `demo-feedback.csv` and `build.csv` from `dir`.

- [ ] **Step 1: Write the failing test `lib/intake.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalise, field, checkboxes, selectResponse, readIntake } from './intake.mjs';

test('normalise folds case, curly quotes, and punctuation', () => {
  assert.equal(normalise('What’s your business?  '), "what's your business");
  assert.equal(normalise('Which pages or areas do you know you want?'), 'which pages or areas do you know you want');
});

test('field matches a header on distinctive words', () => {
  const rec = { 'In a sentence or two, what does your business do?': 'We arrange flowers.' };
  assert.equal(field(rec, 'what does your business do'), 'We arrange flowers.');
});

test('field requires every needle to be present', () => {
  const rec = { 'Which demo feels closest to your business overall?': 'Demo 2' };
  assert.equal(field(rec, 'which demo', 'closest'), 'Demo 2');
  assert.equal(field(rec, 'which demo', 'furthest'), '');
});

test('field returns empty string for a missing header', () => {
  assert.equal(field({}, 'anything'), '');
});

test('field trims surrounding whitespace', () => {
  assert.equal(field({ Timestamp: '  2026-08-01  ' }, 'timestamp'), '2026-08-01');
});

test('checkboxes splits on commas when no option list is given', () => {
  assert.deepEqual(checkboxes('Home, About, Contact'), ['Home', 'About', 'Contact']);
});

test('checkboxes matches known options containing commas or slashes', () => {
  const options = ['Home', 'Portfolio/Gallery', 'Gallery', 'Locations/Areas Served'];
  assert.deepEqual(
    checkboxes('Home, Portfolio/Gallery, Locations/Areas Served', options),
    ['Home', 'Portfolio/Gallery', 'Locations/Areas Served'],
  );
});

test('checkboxes returns options in form order, not answer order', () => {
  const options = ['Home', 'About', 'Contact'];
  assert.deepEqual(checkboxes('Contact, Home', options), ['Home', 'Contact']);
});

test('checkboxes keeps an unrecognised Other answer', () => {
  const options = ['Home', 'About'];
  assert.deepEqual(checkboxes('Home, Trade pricing sheet', options), ['Home', 'Trade pricing sheet']);
});

test('selectResponse returns the only row without a match string', () => {
  const rows = [{ Timestamp: '2026-08-01', 'Email Address': 'a@example.com' }];
  assert.equal(selectResponse(rows).Timestamp, '2026-08-01');
});

test('selectResponse filters several clients down to the match', () => {
  const rows = [
    { Timestamp: '2026-08-01', 'Email Address': 'a@example.com' },
    { Timestamp: '2026-08-02', 'Email Address': 'b@example.com' },
  ];
  assert.equal(selectResponse(rows, 'b@example.com')['Email Address'], 'b@example.com');
});

test('selectResponse takes the latest Timestamp among matching rows', () => {
  const rows = [
    { Timestamp: '2026-08-02 09:00:00', 'Email Address': 'a@example.com', Answer: 'first' },
    { Timestamp: '2026-08-09 11:30:00', 'Email Address': 'a@example.com', Answer: 'second' },
  ];
  assert.equal(selectResponse(rows, 'a@example.com').Answer, 'second');
});

test('selectResponse matches on any field, not just email', () => {
  const rows = [
    { Timestamp: '2026-08-01', 'Business name': 'Sapphire Stem' },
    { Timestamp: '2026-08-02', 'Business name': 'Makeup by Brynlie' },
  ];
  assert.equal(selectResponse(rows, 'Makeup by Brynlie')['Business name'], 'Makeup by Brynlie');
});

test('selectResponse throws with candidates when the match is ambiguous', () => {
  const rows = [
    { Timestamp: '2026-08-01', 'Email Address': 'a@example.com' },
    { Timestamp: '2026-08-02', 'Email Address': 'b@example.com' },
  ];
  assert.throws(() => selectResponse(rows), /a@example\.com/);
  assert.throws(() => selectResponse(rows), /b@example\.com/);
});

test('selectResponse throws when nothing matches', () => {
  const rows = [{ Timestamp: '2026-08-01', 'Email Address': 'a@example.com' }];
  assert.throws(() => selectResponse(rows, 'nobody@example.com'), /no response matches/i);
});

test('readIntake loads both files and reports response counts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-intake-'));
  fs.writeFileSync(
    path.join(dir, 'demo-feedback.csv'),
    'Timestamp,Email Address,Which demo feels closest to your business overall?\n2026-08-01,a@example.com,Demo 2\n',
  );
  fs.writeFileSync(
    path.join(dir, 'build.csv'),
    'Timestamp,Email Address,In a sentence or two what does your business do?\n2026-08-02,a@example.com,We arrange flowers.\n',
  );

  const intake = readIntake(dir, { match: 'a@example.com' });

  assert.equal(field(intake.demo, 'which demo', 'closest'), 'Demo 2');
  assert.equal(field(intake.build, 'what does your business do'), 'We arrange flowers.');
  assert.deepEqual(intake.counts, { demo: 1, build: 1 });
});

test('readIntake names the missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-intake-'));
  assert.throws(() => readIntake(dir), /demo-feedback\.csv/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test lib/intake.test.mjs`
Expected: FAIL — `Cannot find module .../lib/intake.mjs`

- [ ] **Step 3: Write `lib/intake.mjs`**

```js
// Reads the two Google Forms exports for one client.
//
// A Sheets export holds every client's responses, so picking a row is a
// two-step job: filter to this client, then take their latest submission. The
// Demo Feedback form explicitly invites a second pass ("you're always welcome
// to answer again"), so duplicates are expected, not a data error.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsvRecords } from './csv.mjs';

// Headers are full question text. Normalising lets a lookup survive a curly
// apostrophe, a trailing space, or a wording tweak that leaves the
// distinctive words intact.
export const normalise = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

export function field(record, ...needles) {
  const wanted = needles.map(normalise).filter(Boolean);
  const key = Object.keys(record ?? {}).find((k) => {
    const n = normalise(k);
    return wanted.every((w) => n.includes(w));
  });
  return key ? String(record[key]).trim() : '';
}

export function checkboxes(value, options = null) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  if (!options) return raw.split(',').map((s) => s.trim()).filter(Boolean);

  // Longest first, so "Portfolio/Gallery" is consumed before "Gallery" can
  // match the tail of it.
  let rest = raw;
  const hit = new Set();
  for (const o of [...options].sort((a, b) => b.length - a.length)) {
    if (rest.includes(o)) {
      hit.add(o);
      rest = rest.replace(o, '');
    }
  }
  const other = rest.split(',').map((s) => s.trim()).filter(Boolean);
  return [...options.filter((o) => hit.has(o)), ...other];
}

const stamp = (r) => {
  const t = Date.parse(field(r, 'timestamp'));
  return Number.isNaN(t) ? -1 : t;
};

const describe = (r) =>
  field(r, 'email') || field(r, 'business name') || field(r, 'timestamp') || '(unlabelled row)';

export function selectResponse(records, match = null) {
  if (!records.length) throw new Error('no responses in file');

  const wanted = match ? normalise(match) : null;
  const candidates = wanted
    ? records.filter((r) => Object.values(r).some((v) => normalise(v).includes(wanted)))
    : records;

  if (!candidates.length) throw new Error(`no response matches ${match}`);

  const people = new Set(candidates.map(describe));
  if (people.size > 1) {
    throw new Error(
      `more than one client in this file; pass a match string. Candidates: ${[...people].join(', ')}`,
    );
  }
  return candidates.reduce((best, r) => (stamp(r) >= stamp(best) ? r : best));
}

export function readIntake(dir, { match = null } = {}) {
  const load = (name) => {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
    return parseCsvRecords(fs.readFileSync(p, 'utf8'));
  };
  const demoRows = load('demo-feedback.csv');
  const buildRows = load('build.csv');
  return {
    demo: selectResponse(demoRows, match),
    build: selectResponse(buildRows, match),
    counts: { demo: demoRows.length, build: buildRows.length },
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test lib/intake.test.mjs`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/intake.mjs lib/intake.test.mjs
git commit -m "Add intake reader with per-client row selection"
```

---

### Task 4: Demo direction extractor

**Files:**
- Create: `lib/demo.mjs`
- Create: `fixtures/demo-sample.html`
- Test: `lib/demo.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `readDirections(html) -> Direction[]` where `Direction` is `{ number, id, prefix, css, markup }` — `number` 1-based, `id` the section's `id` attribute, `prefix` its first class, `css` the direction's scoped `<style>` contents, `markup` the direction `<section>` element including its tag. Also `directionByAnswer(directions, answer) -> Direction | null`, which maps "Demo 2" to `directions[1]` and returns `null` for "A mix of several".

Structure being parsed, confirmed against `keepsite/public/demo/makeup-by-brynlie/index.html`: an intro section, then four repetitions of `<section class="direction-divider">` … `<style>…</style>` … `<section id="…" class="…">…</section>`.

- [ ] **Step 1: Write `fixtures/demo-sample.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><title>Demo</title>
<style>
  body { margin: 0; }
</style>
</head>
<body>
<section id="intro" class="intro"><h1>four ways</h1></section>

<section class="direction-divider">
  <div class="dd-progress">Direction 01 — of 04</div>
</section>
<style>
  .lb { background: #f6f1ea; }
  .lb h2 { font-family: 'Gloock', serif; }
</style>
<section id="lookbook" class="lb">
  <h2>Lookbook</h2>
</section>

<section class="direction-divider">
  <div class="dd-progress">Direction 02 — of 04</div>
</section>
<style>
  .dc { background: #101010; }
</style>
<section id="deco" class="dc">
  <h2>Deco</h2>
</section>
</body>
</html>
```

- [ ] **Step 2: Write the failing test `lib/demo.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDirections, directionByAnswer } from './demo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = fs.readFileSync(path.join(here, '..', 'fixtures', 'demo-sample.html'), 'utf8');

test('finds one direction per divider', () => {
  assert.equal(readDirections(sample).length, 2);
});

test('numbers directions from one, in document order', () => {
  const [first, second] = readDirections(sample);
  assert.equal(first.number, 1);
  assert.equal(second.number, 2);
});

test('reads the section id and class prefix', () => {
  const [first] = readDirections(sample);
  assert.equal(first.id, 'lookbook');
  assert.equal(first.prefix, 'lb');
});

test('captures the scoped style block, not the head style', () => {
  const [first] = readDirections(sample);
  assert.match(first.css, /\.lb \{ background: #f6f1ea; \}/);
  assert.doesNotMatch(first.css, /body \{ margin: 0; \}/);
});

test('captures the direction section including its own tag', () => {
  const [second] = readDirections(sample);
  assert.match(second.markup, /^<section id="deco" class="dc">/);
  assert.match(second.markup, /<\/section>$/);
  assert.match(second.markup, /<h2>Deco<\/h2>/);
});

test('does not leak the next divider into a direction', () => {
  const [first] = readDirections(sample);
  assert.doesNotMatch(first.markup, /direction-divider/);
  assert.doesNotMatch(first.markup, /Deco/);
});

test('directionByAnswer maps a demo number to its direction', () => {
  const dirs = readDirections(sample);
  assert.equal(directionByAnswer(dirs, 'Demo 2').id, 'deco');
});

test('directionByAnswer tolerates surrounding words', () => {
  const dirs = readDirections(sample);
  assert.equal(directionByAnswer(dirs, ' demo 1 ').id, 'lookbook');
});

test('directionByAnswer returns null for a mix answer', () => {
  const dirs = readDirections(sample);
  assert.equal(directionByAnswer(dirs, 'A mix of several'), null);
});

test('directionByAnswer returns null for a number with no direction', () => {
  const dirs = readDirections(sample);
  assert.equal(directionByAnswer(dirs, 'Demo 4'), null);
});

test('reads all four directions from a real demo', () => {
  const real = path.join(
    here, '..', '..', 'keepsite', 'public', 'demo', 'makeup-by-brynlie', 'index.html',
  );
  const dirs = readDirections(fs.readFileSync(real, 'utf8'));
  assert.equal(dirs.length, 4);
  assert.deepEqual(dirs.map((d) => d.id), ['lookbook', 'deco', 'dream', 'film']);
  for (const d of dirs) {
    assert.ok(d.css.length > 200, `${d.id} css looks empty`);
    assert.ok(d.markup.length > 200, `${d.id} markup looks empty`);
  }
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `node --test lib/demo.test.mjs`
Expected: FAIL — `Cannot find module .../lib/demo.mjs`

- [ ] **Step 4: Write `lib/demo.mjs`**

```js
// Splits a four-direction demo into its four directions.
//
// The demos are written by the client-design-proposals skill and always have
// the same shape: an intro, then four repetitions of a divider banner, a
// scoped <style> block, and one <section> whose class prefix scopes that CSS.
// Regex rather than a DOM parser because the skills stay dependency-free and
// the shape is generated, not hand-written.

const DIVIDER = /<section class="direction-divider">/g;

// Matches the direction's own <section …> … </section>. Nested sections are
// common inside a direction, so the closing tag is found by counting depth
// rather than by a lazy match.
function sectionFrom(html, start) {
  const open = /<section\b[^>]*>/g;
  const close = /<\/section>/g;
  open.lastIndex = start;
  const first = open.exec(html);
  if (!first) return null;

  let depth = 1;
  let i = first.index + first[0].length;
  while (depth > 0) {
    open.lastIndex = i;
    close.lastIndex = i;
    const o = open.exec(html);
    const c = close.exec(html);
    if (!c) return null;
    if (o && o.index < c.index) { depth++; i = o.index + o[0].length; continue; }
    depth--;
    i = c.index + c[0].length;
  }
  return { tag: first[0], markup: html.slice(first.index, i) };
}

export function readDirections(html) {
  const starts = [...html.matchAll(DIVIDER)].map((m) => m.index);
  const directions = [];

  for (let n = 0; n < starts.length; n++) {
    const from = starts[n];
    const to = n + 1 < starts.length ? starts[n + 1] : html.length;
    const chunk = html.slice(from, to);

    const style = chunk.match(/<style>([\s\S]*?)<\/style>/);
    const afterStyle = style ? chunk.indexOf(style[0]) + style[0].length : 0;
    const section = sectionFrom(chunk, afterStyle);
    if (!section) continue;

    const id = (section.tag.match(/\bid="([^"]+)"/) ?? [, ''])[1];
    const prefix = (section.tag.match(/\bclass="([^"\s]+)/) ?? [, ''])[1];

    directions.push({
      number: n + 1,
      id,
      prefix,
      css: style ? style[1].trim() : '',
      markup: section.markup,
    });
  }
  return directions;
}

export function directionByAnswer(directions, answer) {
  const n = String(answer ?? '').match(/demo\s*0?(\d)/i);
  if (!n) return null;
  return directions.find((d) => d.number === Number(n[1])) ?? null;
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `node --test lib/demo.test.mjs`
Expected: PASS, 11 tests. The last test reads the real Brynlie demo; if the four ids differ from `lookbook, deco, dream, film`, update the assertion to match the file rather than changing the parser.

- [ ] **Step 6: Commit**

```bash
git add lib/demo.mjs lib/demo.test.mjs fixtures/demo-sample.html
git commit -m "Add demo direction extractor"
```

---

### Task 5: Lorem generator

**Files:**
- Create: `lib/lorem.mjs`
- Test: `lib/lorem.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `SLOTS` — an object mapping slot name to `[minWords, maxWords]`; `lorem(slot, seed?) -> string`, deterministic for a given slot and seed.

Slot word counts come from the spec: hero headline 4–7, subhead 12–18, body 40–60, card blurb 15–25, testimonial quote 20–35.

- [ ] **Step 1: Write the failing test `lib/lorem.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lorem, SLOTS } from './lorem.mjs';

const words = (s) => s.trim().split(/\s+/).length;

test('every slot generates within its declared range', () => {
  for (const [slot, [lo, hi]] of Object.entries(SLOTS)) {
    for (let i = 0; i < 40; i++) {
      const n = words(lorem(slot, `${slot}-${i}`));
      assert.ok(n >= lo && n <= hi, `${slot} produced ${n} words, wanted ${lo}-${hi}`);
    }
  }
});

test('hero headlines are short and body copy is long', () => {
  assert.ok(words(lorem('hero-headline', 'a')) < words(lorem('body', 'a')));
});

test('the same slot and seed always give the same text', () => {
  assert.equal(lorem('body', 'about-intro'), lorem('body', 'about-intro'));
});

test('different seeds give different text', () => {
  assert.notEqual(lorem('body', 'about-intro'), lorem('body', 'services-intro'));
});

test('slot lengths vary across seeds', () => {
  const lengths = new Set(
    Array.from({ length: 25 }, (_, i) => words(lorem('body', `seed-${i}`))),
  );
  assert.ok(lengths.size > 1, 'every seed produced the same length');
});

test('text starts with a capital', () => {
  assert.match(lorem('body', 'x'), /^[A-Z]/);
});

test('sentence slots end in a full stop and headline slots do not', () => {
  assert.match(lorem('body', 'x'), /\.$/);
  assert.doesNotMatch(lorem('hero-headline', 'x'), /\.$/);
});

test('an unknown slot throws rather than guessing a length', () => {
  assert.throws(() => lorem('nope', 'x'), /unknown lorem slot: nope/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test lib/lorem.test.mjs`
Expected: FAIL — `Cannot find module .../lib/lorem.mjs`

- [ ] **Step 3: Write `lib/lorem.mjs`**

```js
// Slot-sized lorem.
//
// A single filler blob makes every section read the same height, which defeats
// the one judgement Stage Two exists to support: whether the page is shaped
// right. Each slot has its own word range, and generation is seeded so a
// rebuild after a change round does not reshuffle every paragraph in the diff.

const WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud ' +
  'exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute ' +
  'irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur ' +
  'excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt ' +
  'mollit anim id est laborum'
).split(' ');

export const SLOTS = {
  'hero-headline': [4, 7],
  headline: [4, 8],
  subhead: [12, 18],
  body: [40, 60],
  'card-blurb': [15, 25],
  quote: [20, 35],
  attribution: [2, 3],
  'meta-description': [18, 26],
  'faq-question': [6, 12],
  'faq-answer': [30, 50],
};

// Slots that are labels rather than sentences take no full stop.
const FRAGMENTS = new Set(['hero-headline', 'headline', 'attribution']);

function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lorem(slot, seed = slot) {
  const range = SLOTS[slot];
  if (!range) throw new Error(`unknown lorem slot: ${slot}`);

  const next = rng(seed);
  const [lo, hi] = range;
  const count = lo + Math.floor(next() * (hi - lo + 1));

  const out = [];
  for (let i = 0; i < count; i++) out.push(WORDS[Math.floor(next() * WORDS.length)]);

  const text = out.join(' ');
  const capitalised = text[0].toUpperCase() + text.slice(1);
  return FRAGMENTS.has(slot) ? capitalised : `${capitalised}.`;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test lib/lorem.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/lorem.mjs lib/lorem.test.mjs
git commit -m "Add slot-sized deterministic lorem generator"
```

---

### Task 6: Form option lists and the intake CLI

**Files:**
- Create: `lib/forms.mjs`
- Create: `lib/read-intake-cli.mjs`
- Test: `lib/forms.test.mjs`
- Test: `lib/read-intake-cli.test.mjs`

The CLI lives in `lib/` so that `lib/read-intake-cli.mjs` is the correct path both from the repo root and from an installed skill directory — `install.mjs` copies `lib/` inside each skill.

**Interfaces:**
- Consumes: `readIntake`, `field`, `checkboxes` from `lib/intake.mjs`; `readDirections`, `directionByAnswer` from `lib/demo.mjs`.
- Produces:
  - `lib/forms.mjs` exports `PAGE_OPTIONS`, `HOMEPAGE_SECTION_OPTIONS`, `FEATURE_OPTIONS`, `CONFIDENCE_OPTIONS`, `ACTION_OPTIONS`, `FEEL_WORDS` — the verbatim option lists from the two forms.
  - `lib/read-intake-cli.mjs` — run as `node lib/read-intake-cli.mjs <intakeDir> <demoHtmlPath> [--match=<string>]`, prints one JSON object to stdout with keys `counts`, `direction`, `directions`, `demoFeedback`, `build`. Exits 1 with the error message on stderr when intake cannot be resolved.

- [ ] **Step 1: Write the failing test `lib/forms.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkboxes } from './intake.mjs';
import {
  PAGE_OPTIONS, HOMEPAGE_SECTION_OPTIONS, FEATURE_OPTIONS,
  CONFIDENCE_OPTIONS, ACTION_OPTIONS, FEEL_WORDS,
} from './forms.mjs';

test('option lists are non-empty and free of duplicates', () => {
  for (const [name, list] of Object.entries({
    PAGE_OPTIONS, HOMEPAGE_SECTION_OPTIONS, FEATURE_OPTIONS,
    CONFIDENCE_OPTIONS, ACTION_OPTIONS, FEEL_WORDS,
  })) {
    assert.ok(list.length > 0, `${name} is empty`);
    assert.equal(new Set(list).size, list.length, `${name} has duplicates`);
  }
});

test('page options carry the entries the sitemap depends on', () => {
  for (const p of ['Home', 'About', 'Services', 'Individual service pages', 'Contact', 'Locations/Areas Served']) {
    assert.ok(PAGE_OPTIONS.includes(p), `PAGE_OPTIONS missing ${p}`);
  }
});

test('feature options carry the entries the feature map depends on', () => {
  for (const f of ['Contact form', 'Online booking', 'Online shop', 'Membership or login', 'Client portal', 'FAQ accordion', 'Blog']) {
    assert.ok(FEATURE_OPTIONS.includes(f), `FEATURE_OPTIONS missing ${f}`);
  }
});

test('overlapping page options split correctly', () => {
  const answer = 'Home, Services, Individual service pages, Portfolio/Gallery';
  assert.deepEqual(
    checkboxes(answer, PAGE_OPTIONS),
    ['Home', 'Services', 'Individual service pages', 'Portfolio/Gallery'],
  );
});

test('feel words are shared by the wanted and not-wanted questions', () => {
  assert.ok(FEEL_WORDS.includes('Warm'));
  assert.ok(FEEL_WORDS.includes('Approachable'));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test lib/forms.test.mjs`
Expected: FAIL — `Cannot find module .../lib/forms.mjs`

- [ ] **Step 3: Write `lib/forms.mjs`**

```js
// Verbatim option lists from the two Google Forms. They exist so that a
// multi-select answer can be split by matching known options rather than by
// splitting on commas, which breaks on "Portfolio/Gallery" style entries and
// on any option containing a comma.
//
// Order matters: checkboxes() returns options in form order, so a brief reads
// the way the client saw the question. If a form question is edited, edit here
// to match.

export const ACTION_OPTIONS = [
  'Fill out an inquiry form', 'Book an appointment', 'Request a quote', 'Call',
  'Email', 'Purchase Something', 'Visit your location', 'Join your email list',
  'Follow you on social media', 'Other',
];

export const PAGE_OPTIONS = [
  'Home', 'About', 'Services', 'Individual service pages', 'Portfolio/Gallery',
  'Projects/Case Studies', 'Testimonials/Reviews', 'Pricing',
  'Frequently Asked Questions', 'Process/How it works', 'Blog/Resources',
  'Contact', 'Booking', 'Shop', 'Events', 'Team', 'Locations/Areas Served',
  'Press/Features', 'Other',
];

export const HOMEPAGE_SECTION_OPTIONS = [
  'Intro/quick overview', 'Main services', 'About/meet the owner',
  'Featured work or portfolio', 'Testimonials', 'How it works/process',
  'Pricing starting point', 'Frequently Asked Questions', 'Locations/area served',
  'Featured Products', 'Upcoming events', 'Blog/resources',
  'Instagram/social content', 'Newsletter signup', 'Strong contact/booking section',
  'Other',
];

export const FEATURE_OPTIONS = [
  'Contact form', 'Detailed inquiry form', 'Appointment scheduling',
  'Online booking', 'Calendar', 'Online payments', 'Online shop', 'Quote request',
  'Client portal', 'Email newsletter signup', 'Downloadable guide or freebie',
  'Photo gallery', 'Video', 'Before-and-after gallery', 'Testimonials/review feed',
  'Instagram feed', 'Google reviews', 'Map/directions', 'Searchable resources',
  'Blog', 'Event registration', 'FAQ accordion', 'Team profiles',
  'Membership or login', 'Other',
];

export const CONFIDENCE_OPTIONS = [
  'Testimonials', 'Google reviews', 'Years of experience', 'Certifications',
  'Awards', 'Portfolio', 'Before-and-after results', 'Client list', 'Press',
  'Community involvement', 'Specialized expertise', 'Personal story', 'Other',
];

export const FEEL_WORDS = [
  'Warm', 'Calm', 'Refined', 'Welcoming', 'Bold', 'Playful', 'Professional',
  'Relaxed', 'Editorial', 'Natural', 'Modern', 'Timeless', 'Minimal', 'Colorful',
  'Elevated', 'Friendly', 'Grounded', 'Adventurous', 'Luxurious', 'Approachable',
];
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test lib/forms.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test `lib/read-intake-cli.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, 'read-intake-cli.mjs');
const demo = path.join(here, '..', 'fixtures', 'demo-sample.html');

function intakeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-cli-'));
  fs.writeFileSync(
    path.join(dir, 'demo-feedback.csv'),
    'Timestamp,Email Address,Which demo feels closest to your business overall?,' +
      'Which words best describe how you want your website to feel?,' +
      'Which words do NOT describe how you want your website to feel?\n' +
      '2026-08-01,a@example.com,Demo 2,"Warm, Refined","Bold, Playful"\n',
  );
  fs.writeFileSync(
    path.join(dir, 'build.csv'),
    'Timestamp,Email Address,In a sentence or two what does your business do?,' +
      'Which pages or areas do you know you want?,' +
      'Which features would be helpful for your business?\n' +
      '2026-08-02,a@example.com,We arrange flowers.,"Home, About, Contact","Contact form, Online booking"\n',
  );
  return dir;
}

const run = (dir, ...args) =>
  JSON.parse(execFileSync('node', [cli, dir, demo, ...args], { encoding: 'utf8' }));

test('emits the resolved direction for the picked demo', () => {
  const out = run(intakeDir());
  assert.equal(out.direction.number, 2);
  assert.equal(out.direction.id, 'deco');
  assert.equal(out.direction.prefix, 'dc');
});

test('lists every direction so a mix answer can be resolved by hand', () => {
  const out = run(intakeDir());
  assert.deepEqual(out.directions.map((d) => d.id), ['lookbook', 'deco']);
});

test('omits direction css and markup to keep the payload readable', () => {
  const out = run(intakeDir());
  assert.equal(out.direction.css, undefined);
  assert.equal(out.direction.markup, undefined);
});

test('splits multi-select answers using the form option lists', () => {
  const out = run(intakeDir());
  assert.deepEqual(out.build.pages, ['Home', 'About', 'Contact']);
  assert.deepEqual(out.build.features, ['Contact form', 'Online booking']);
  assert.deepEqual(out.demoFeedback.feelWanted, ['Warm', 'Refined']);
  assert.deepEqual(out.demoFeedback.feelRefused, ['Bold', 'Playful']);
});

test('carries free-text answers through unchanged', () => {
  const out = run(intakeDir());
  assert.equal(out.build.whatWeDo, 'We arrange flowers.');
});

test('reports how many responses each file held', () => {
  const out = run(intakeDir());
  assert.deepEqual(out.counts, { demo: 1, build: 1 });
});

test('lists which questions came back blank', () => {
  const out = run(intakeDir());
  assert.ok(out.build.blank.includes('primaryAction'));
});

test('exits non-zero and names the problem when intake is missing', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-cli-empty-'));
  assert.throws(
    () => execFileSync('node', [cli, empty, demo], { encoding: 'utf8', stdio: 'pipe' }),
    (e) => /demo-feedback\.csv/.test(String(e.stderr)),
  );
});
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `node --test lib/read-intake-cli.test.mjs`
Expected: FAIL — `Cannot find module .../lib/read-intake-cli.mjs`

- [ ] **Step 7: Write `lib/read-intake-cli.mjs`**

```js
#!/usr/bin/env node
// Turns a client's intake directory into one JSON object.
//
// The sitemap skill reads this instead of raw CSV: header matching, duplicate
// submissions, and multi-select splitting are all mechanical, and getting them
// wrong silently is worse than getting them wrong loudly.
//
//   node lib/read-intake-cli.mjs <intakeDir> <demoHtmlPath> [--match=<string>]
import fs from 'node:fs';
import { readIntake, field, checkboxes } from './intake.mjs';
import { readDirections, directionByAnswer } from './demo.mjs';
import {
  PAGE_OPTIONS, HOMEPAGE_SECTION_OPTIONS, FEATURE_OPTIONS,
  CONFIDENCE_OPTIONS, FEEL_WORDS,
} from './forms.mjs';

const slim = (d) => (d ? { number: d.number, id: d.id, prefix: d.prefix } : null);

function blankKeys(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v === '' || (Array.isArray(v) && v.length === 0))
    .map(([k]) => k);
}

export function readAll(intakeDir, demoPath, match = null) {
  const { demo, build, counts } = readIntake(intakeDir, { match });
  const directions = readDirections(fs.readFileSync(demoPath, 'utf8'));
  const pick = field(demo, 'which demo', 'closest');

  const demoFeedback = {
    pick,
    likes: [1, 2, 3, 4].map((n) => field(demo, `demo ${n}`, 'what do you like')),
    keeps: field(demo, 'sections you definitely want to keep'),
    feelWanted: checkboxes(field(demo, 'which words best describe', 'feel'), FEEL_WORDS),
    feelRefused: checkboxes(field(demo, 'which words do not describe', 'feel'), FEEL_WORDS),
    visitorFeeling: field(demo, 'how to you want them to feel') || field(demo, 'how do you want them to feel'),
    logo: field(demo, 'do you currently have a logo'),
    logoFontsColors: field(demo, 'logo font and colors'),
    brandGuide: field(demo, 'formal brand guide'),
    otherFontsColors: field(demo, 'what other fonts and colors'),
    photos: field(demo, 'what photos would you like used'),
  };

  const b = {
    whatWeDo: field(build, 'what does your business do'),
    services: field(build, 'main services products or offers'),
    grow: field(build, 'which of those would you most like to grow'),
    deprioritise: field(build, "don't particularly want to promote") || field(build, 'do not particularly want to promote'),
    serviceArea: field(build, 'where do you work or serve customers'),
    targetAreas: field(build, 'towns regions or areas'),
    idealCustomers: field(build, 'customers you love working with'),
    whatMatters: field(build, 'matter most to them when choosing'),
    repeatQuestions: field(build, 'ask you over and over'),
    wishUnderstood: field(build, 'wish potential customers understood'),
    whyChosen: field(build, 'why do you think your best customers choose you'),
    primaryAction: field(build, 'the 1 thing you want someone to do') || field(build, 'number 1 thing you want someone to do'),
    secondaryAction: field(build, 'second action'),
    firstImpressions: field(build, 'most important things you want them to understand'),
    pages: checkboxes(field(build, 'which pages or areas do you know you want'), PAGE_OPTIONS),
    ownPageCandidates: field(build, 'deserve their own page'),
    homepageSections: checkboxes(field(build, 'which sections would you like your homepage'), HOMEPAGE_SECTION_OPTIONS),
    features: checkboxes(field(build, 'which features would be helpful'), FEATURE_OPTIONS),
    existingTools: field(build, 'tools we should connect'),
    inspiration: field(build, 'websites with a feature page section or interaction you love'),
    learnMore: field(build, 'where can we learn the most about your business'),
    signatureContent: field(build, 'instagram posts reels captions'),
    strongResponse: field(build, 'strong response from your audience'),
    explainedRepeatedly: field(build, 'explaining to customers again and again'),
    couldTalkAllDay: field(build, 'talk about all day'),
    searchTerms: field(build, 'type into google'),
    customerWords: field(build, 'words do your customers use'),
    jargon: field(build, 'words you use in your industry'),
    competitors: field(build, 'similar businesses or competitors'),
    findabilityWishes: field(build, 'easier to find online for'),
    underrepresented: field(build, 'does not show well enough') || field(build, "doesn't show well enough"),
    confidence: checkboxes(field(build, 'helps someone feel confident choosing you'), CONFIDENCE_OPTIONS),
    reviewLocations: field(build, 'existing reviews or testimonials'),
    credentials: field(build, 'awards certifications press mentions'),
    importantSeasons: field(build, 'times of year that are especially important'),
    seasonalServices: field(build, 'promote at particular times of year'),
    upcomingDates: field(build, 'launches events busy seasons'),
    onethingWell: field(build, 'does one thing really well'),
    anythingElse: field(build, 'anything else you want us to know'),
  };

  return {
    counts,
    directions: directions.map(slim),
    direction: slim(directionByAnswer(directions, pick)),
    demoFeedback: { ...demoFeedback, blank: blankKeys(demoFeedback) },
    build: { ...b, blank: blankKeys(b) },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [intakeDir, demoPath, ...rest] = process.argv.slice(2);
  const match = (rest.find((a) => a.startsWith('--match=')) ?? '').slice('--match='.length) || null;
  if (!intakeDir || !demoPath) {
    console.error('usage: read-intake-cli.mjs <intakeDir> <demoHtmlPath> [--match=<string>]');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(readAll(intakeDir, demoPath, match), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `node --test lib/read-intake-cli.test.mjs`
Expected: PASS, 8 tests. `field()` matching is fuzzy by design; if a lookup returns `''` against the real exports, widen or narrow the needles rather than renaming the output key, because `brief.md` and the skills refer to these keys.

- [ ] **Step 9: Run the whole suite and commit**

```bash
npm test
git add lib/forms.mjs lib/forms.test.mjs lib/read-intake-cli.mjs lib/read-intake-cli.test.mjs
git commit -m "Add form option lists and intake CLI"
```

---

### Task 7: The `keepsite-sitemap` skill

**Files:**
- Create: `skills/keepsite-sitemap/SKILL.md`
- Create: `skills/keepsite-sitemap/references/page-set-rules.md`
- Create: `skills/keepsite-sitemap/references/feature-map.md`
- Create: `skills/keepsite-sitemap/templates/brief.md`
- Create: `skills/keepsite-sitemap/templates/sitemap.md`
- Test: `skills/skills.test.mjs`

**Interfaces:**
- Consumes: `lib/read-intake-cli.mjs`, invoked by the skill at run time.
- Produces: `intake/brief.md` and `intake/sitemap.md` in a client directory, in the shape `keepsite-build` (Task 11) reads.

- [ ] **Step 1: Write the failing test `skills/skills.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skills = fs.readdirSync(here, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const readSkill = (name) => fs.readFileSync(path.join(here, name, 'SKILL.md'), 'utf8');

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md must open with a YAML frontmatter block');
  return Object.fromEntries(
    m[1].split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
}

test('the expected skills exist', () => {
  assert.ok(skills.includes('keepsite-sitemap'));
});

test('every skill has name and description frontmatter', () => {
  for (const name of skills) {
    const fm = frontmatter(readSkill(name));
    assert.equal(fm.name, name, `${name}: frontmatter name must equal the directory name`);
    assert.ok(fm.description && fm.description.length > 40, `${name}: description too thin`);
  }
});

test('every file a skill references exists', () => {
  for (const name of skills) {
    const body = readSkill(name);
    const refs = [...body.matchAll(/`((?:references|templates)\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, `${name}: references no supporting files`);
    for (const ref of new Set(refs)) {
      assert.ok(
        fs.existsSync(path.join(here, name, ref)),
        `${name}: SKILL.md references missing file ${ref}`,
      );
    }
  }
});

test('every lib path a skill invokes resolves after install', () => {
  for (const name of skills) {
    const body = readSkill(name);
    for (const ref of new Set([...body.matchAll(/`?(lib\/[A-Za-z0-9._-]+\.mjs)/g)].map((m) => m[1]))) {
      assert.ok(
        fs.existsSync(path.join(here, '..', ref)),
        `${name}: SKILL.md invokes missing ${ref}`,
      );
    }
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test skills/skills.test.mjs`
Expected: FAIL — the `skills/` directory does not exist yet.

- [ ] **Step 3: Write `skills/keepsite-sitemap/SKILL.md`**

````markdown
---
name: keepsite-sitemap
description: Use when deriving a Keepsite client's Stage Two page set from their two questionnaire exports and their four-direction demo. Triggers include "sitemap for [client]", "page set for [client]", "stage two sitemap", or a request to work out what pages a Keepsite client's site needs. Writes intake/brief.md and intake/sitemap.md and stops for human review; it never builds a site.
---

# Keepsite Sitemap

## What this produces

Two files in `{client}/intake/`, and nothing else:

- `brief.md` — every decision the build depends on, in one place.
- `sitemap.md` — the page set, each page's purpose, and its section order.

Then you stop. The human reviews and edits those files. Building is a separate
skill, `keepsite-build`, run afterwards.

This is Stage Two of the Keepsite agreements. Approving Stage Two locks the
page set for the build fee, so a page that should not be there is a billing
problem, not a cosmetic one. Mark everything you inferred.

## Before you start

Paths, relative to `/mnt/c/Users/Snic9/keepsitemedia/`:

- intake — `{slug}/intake/`
- demo — `keepsite/public/demo/{slug}/index.html`

The slug is the demo directory name. If the client names a brand with no demo
directory, stop and ask; you cannot derive a direction without the demo they saw.

Create `{slug}/intake/` if it is absent. Create nothing else — no `git init`,
no Astro scaffold. That is `keepsite-build`'s job.

Confirm `demo-feedback.csv` and `build.csv` are in the intake directory. If
either is missing, tell the human which one and stop.

## Step 1 — read intake

Run, from the skill's own directory:

```bash
node lib/read-intake-cli.mjs {slug}/intake keepsite/public/demo/{slug}/index.html --match="<client email or business name>"
```

Read the JSON. Do not read the CSVs by hand — header matching, duplicate
submissions, and multi-select splitting are handled there and getting them
wrong silently is worse than getting them wrong loudly.

If it exits with "more than one client in this file", re-run with `--match`
set to one of the candidates it listed.

Report to the human: the response counts, and the `blank` list from each form.
A lot of the build questionnaire is optional and clients skip; that is normal,
but the human should know what you are working without.

## Step 2 — resolve the direction

`direction` in the JSON is the demo section the client picked. If it is `null`,
the answer was "A mix of several".

For a mix: read the four `likes` free-texts and `keeps`, propose a base
direction with one sentence of reasoning, and **ask the human to confirm before
writing anything**. Do not pick silently.

Then resolve `keeps` into concrete section references. The answer names sections
by content and demo — "the very first section from Demo 2, services section
Demo 4, and Colors from Demo 3". Each keep becomes a line in the brief giving
the section, the source demo number, and that demo's class prefix, taken from
the `directions` array.

## Step 3 — determine the tier

Presence, Search, or Search Plus. Ask the human if it is not already known. The
tier decides two things: whether a keyword pass runs, and whether Stage Three
copy is written by Keepsite (Search, Search Plus) or supplied by the client
(Presence).

## Step 4 — derive the page set

Follow `references/page-set-rules.md`. It is the whole of the derivation logic;
do not improvise a page set.

## Step 5 — keyword pass (Search and Search Plus only)

Skip entirely on Presence.

If `{slug}/intake/keywords.md` exists, read it. It takes precedence over
anything you derive.

Otherwise: take seed terms from `searchTerms`, `customerWords`, `jargon`, and
`findabilityWishes`. Then web-search the businesses named in `competitors` and
look at what service and location pages they publish and which of the client's
`findabilityWishes` nobody covers. On Search Plus, weight the gaps.

Every page this produces is marked `inferred` in the sitemap with the term that
produced it.

## Step 6 — order sections per page

Homepage order comes from `homepageSections`, sequenced so the primary action
is reachable without scrolling and repeated at the foot of the page. Other page
types use the default orders in `references/page-set-rules.md`.

## Step 7 — map features to implementation

Follow `references/feature-map.md`. Every entry in `features` resolves to
exactly one of `in-house`, `stub`, or `escalate`.

If anything escalates, write it into the brief's Escalations section and say so
plainly in your summary. An escalation is a decision for the human, not
something to design around.

## Step 8 — write the files and stop

Fill `templates/brief.md` and `templates/sitemap.md` and write them to
`{slug}/intake/`. Do not invent sections; if a template field has no answer,
write `Not answered`.

Then report, in this order:

1. Page count, and how many pages are marked `inferred`.
2. Each inferred page and the one line of reasoning behind it.
3. Anything that escalated.
4. Which questions the client left blank.

Stop there. Do not scaffold, do not write code, do not run `keepsite-build`.

## Common mistakes

| Mistake | Fix |
|---|---|
| Reading the CSVs directly | Run `lib/read-intake-cli.mjs`; header matching is fuzzy and hand-reading gets it wrong |
| Picking a base direction for a "mix" answer without asking | Propose, then wait |
| Adding a page the client did not ask for and not marking it | Every inferred page is marked, with its reason |
| Running the keyword pass on Presence | Presence has no keyword research; the page set comes from the questionnaire alone |
| Designing around an escalation | Write it into the brief and stop |
| Continuing into the build | Different skill, after human review |
````

- [ ] **Step 4: Write `skills/keepsite-sitemap/references/page-set-rules.md`**

````markdown
# Page set rules

The page set is the union of five sources. Work through them in order, then
de-duplicate.

## 1. Pages the client checked

Every entry in `build.pages`, mapped to a path:

| Answer | Page | Path |
|---|---|---|
| Home | Home | `/` |
| About | About | `/about/` |
| Services | Services | `/services/` |
| Individual service pages | one per service | `/services/{service-slug}/` |
| Portfolio/Gallery | Gallery | `/gallery/` |
| Projects/Case Studies | Projects | `/projects/` |
| Testimonials/Reviews | Reviews | `/reviews/` |
| Pricing | Pricing | `/pricing/` |
| Frequently Asked Questions | FAQ | `/faq/` |
| Process/How it works | How it works | `/how-it-works/` |
| Blog/Resources | Journal | `/journal/` |
| Contact | Contact | `/contact/` |
| Booking | Book | `/book/` |
| Shop | — | escalate, see the feature map |
| Events | Events | `/events/` |
| Team | Team | `/team/` |
| Locations/Areas Served | Areas served | `/areas-served/` |
| Press/Features | Press | `/press/` |

These are never marked `inferred`. The client asked for them.

Home and Contact are always present even when unchecked. A site with no way to
reach the business fails the primary action, and no client means to omit it.
Mark both `inferred` when they were not checked.

## 2. Pages implied by features

Consult `feature-map.md`. A feature only creates a page when it cannot live as
a homepage section:

- `Online booking` or `Appointment scheduling` creates `/book/` unless
  `Strong contact/booking section` is already in `homepageSections` and no
  other page needs a booking surface.
- `Event registration` creates `/events/` if not already present.
- `Blog` or `Searchable resources` creates `/journal/`.
- `Team profiles` creates `/team/` when more than one person is named in
  `idealCustomers`, `whyChosen`, or `credentials`; otherwise it is an About
  section.

Mark every page from this source `inferred`.

## 3. Services that deserve their own page

Read `ownPageCandidates` and `services`. A service earns its own page when it
meets at least two of:

- named in `grow`
- named in `ownPageCandidates`
- carries vocabulary of its own in `searchTerms` or `customerWords`
- is something a customer would search for by name rather than by the business

A service named in `deprioritise` never gets its own page, whatever else it
meets. That answer exists precisely to stop this.

Under five services, prefer sections on one `/services/` page. Five or more,
prefer individual pages. Mark all of these `inferred` unless
`Individual service pages` was checked.

## 4. Locations

Read `serviceArea` and `targetAreas`. Location pages come only from
`targetAreas` — where they want *more* business — never from the full service
area, which produces thin duplicate pages.

Presence gets one `/areas-served/` page listing the areas, never one page per
area. Search and Search Plus get a page per named target area, at
`/areas-served/{area-slug}/`, only when the keyword pass shows the area
searched alongside a service term.

Mark all `inferred`.

## 5. Keyword-derived pages (Search and Search Plus only)

From the keyword pass. Each page is marked `inferred` and carries the term that
produced it. Do not create a page for a term already covered by a page from
sources 1–4.

## Default section orders

**Home** — from `homepageSections`, in this sequence, skipping what was not
checked: Intro/quick overview, Main services, Featured work or portfolio,
About/meet the owner, How it works/process, Testimonials, Pricing starting
point, Locations/area served, Featured Products, Upcoming events,
Frequently Asked Questions, Blog/resources, Instagram/social content,
Newsletter signup, Strong contact/booking section. The primary action appears
inside the first section and again in the last.

**About** — intro, story, owner portrait, values, credentials, closing action.

**Services index** — intro, service cards, process, testimonial, closing action.

**Service page** — hero, what it is, what is included, process, gallery, FAQ,
closing action.

**Gallery** — intro, filter row if more than twelve items, grid, closing action.

**Reviews** — intro, review list, closing action.

**Pricing** — intro, tiers, what is included, FAQ, closing action.

**FAQ** — intro, accordion, closing action.

**How it works** — intro, numbered steps, what we need from you, closing action.

**Journal index** — intro, post list, closing action.

**Contact** — intro, form, hours and location, map, closing action.

**Book** — intro, booking surface, what to expect, closing action.

**Areas served** — intro, area list or map, service reminder, closing action.

**Team** — intro, member cards, closing action.

**Events** — intro, upcoming list, past events, closing action.

**Press** — intro, mention list, closing action.

Every page ends with a closing action. That is what the site is for.
````

- [ ] **Step 5: Write `skills/keepsite-sitemap/references/feature-map.md`**

````markdown
# Feature map

Every entry in `build.features` resolves to exactly one of three outcomes.

## in-house

Built with Astro and Netlify, working and clickable at Stage Two.

| Feature | How it is built |
|---|---|
| Contact form | Netlify Forms, posts to a thanks page |
| Detailed inquiry form | Netlify Forms, longer field set |
| Quote request | Netlify Forms, quote-specific fields |
| Email newsletter signup | Netlify Forms; hand-off to the client's list tool at Stage Three |
| Photo gallery | Astro image grid with a lightbox, image areas at Stage Two |
| Before-and-after gallery | Paired image areas with a slider |
| Team profiles | Cards from `src/data/team.json` |
| FAQ accordion | Native `<details>`/`<summary>` |
| Downloadable guide or freebie | Static asset behind a Netlify Forms gate |
| Blog | Astro content collection at `/journal/` |
| Map/directions | Static link to the map provider, no embed |

## stub

Rendered as an `EmbedArea` at the embed's real footprint, labelled with the
tool name from `existingTools`, replaced at Stage Three when the client's
account exists.

| Feature | Why |
|---|---|
| Appointment scheduling | Third-party widget, needs the client's account |
| Online booking | As above |
| Calendar | As above |
| Online payments | Needs the client's processor |
| Testimonials/review feed | Needs the client's feed credentials |
| Google reviews | Needs the client's Place ID and an API key |
| Instagram feed | Needs the client's token |
| Video | Needs the client's hosted video |
| Event registration | Third-party widget |

A stub is not a missing feature. It is a real footprint at real dimensions, so
the layout the client approves is the layout they get.

## escalate

Stop. Write it into the brief's Escalations section and tell the human. Do not
scaffold around it.

| Feature | Why it escalates |
|---|---|
| Online shop | Real inventory, tax, and fulfilment; not an Astro static build |
| Membership or login | Needs auth and per-user state |
| Client portal | As above |
| Searchable resources | Fine as a small static list; escalates past roughly fifty items |

`Other` answers are read individually. If it can be built with Astro and
Netlify Forms it is in-house; if it needs someone else's account it is a stub;
if it needs a database or a login it escalates.
````

- [ ] **Step 6: Write `skills/keepsite-sitemap/templates/brief.md`**

````markdown
# {Business name} — Stage Two brief

Slug: `{slug}`
Tier: {Presence | Search | Search Plus}
Agreement dated: {date}
Written: {date}

## Business

- What they do: {whatWeDo}
- Services: {services}
- Wants to grow: {grow}
- Not promoting: {deprioritise}

## Geography

- Service area: {serviceArea}
- Wants more business in: {targetAreas}

## Audience

- Ideal customers: {idealCustomers}
- What matters to them: {whatMatters}
- Asked over and over: {repeatQuestions}
- Wishes they understood: {wishUnderstood}
- Why they are chosen: {whyChosen}

## Actions

- Primary: {primaryAction}
- Secondary: {secondaryAction}

## Direction

- Base: Demo {n}, section `#{id}`, class prefix `.{prefix}`
- Confirmed by the human: {yes | not needed, they picked one demo}

Section keeps:

| Section | From | Prefix |
|---|---|---|
| {section} | Demo {n} | `.{prefix}` |

## Feel

- Wanted: {feelWanted}
- Refused: {feelRefused}
- Visitors should feel: {visitorFeeling}

## Brand

- Logo: {on hand | fonts and hex only | none}
- Logo fonts and colours: {logoFontsColors}
- Brand guide: {on hand | none | freelancer offered}
- Other fonts and colours: {otherFontsColors}
- Photos: {count and location, or "none yet"}

## Features

| Feature | Resolution | Notes |
|---|---|---|
| {feature} | {in-house / stub / escalate} | {tool name for stubs} |

## Trust signals

- Confidence builders: {confidence}
- Reviews live at: {reviewLocations}
- Credentials: {credentials}

## Timing

- Important seasons: {importantSeasons}
- Seasonal services: {seasonalServices}
- Upcoming dates: {upcomingDates}

## Escalations

{One line each, or "None."}

## Open questions

{One line each, or "None."}

## Left blank on the questionnaires

{Field names the client skipped, or "None."}
````

- [ ] **Step 7: Write `skills/keepsite-sitemap/templates/sitemap.md`**

````markdown
# {Business name} — Stage Two page set

Tier: {Presence | Search | Search Plus}
Pages: {n} ({m} inferred)

Approving this locks the page set for the build fee. Pages added after it
closes are billed under Exhibit C.

---

## {Page title} — `{path}`

{One line: what this page is for.}

Inferred: {no | yes — reason}

Sections, top to bottom:

1. {section}
2. {section}
3. {section}

---

## Considered and rejected

| Page | Why not |
|---|---|
| {page} | {reason} |
````

- [ ] **Step 8: Run the test and verify it passes**

Run: `node --test skills/skills.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 9: Install and commit**

```bash
npm test
npm run install-skills
ls ~/.claude/skills/keepsite-sitemap/lib/read-intake-cli.mjs
git add skills/
git commit -m "Add keepsite-sitemap skill"
```

---

### Task 8: Client repo scaffold

**Files:**
- Create: `templates/astro/package.json.tmpl`
- Create: `templates/astro/astro.config.mjs.tmpl`
- Create: `templates/astro/netlify.toml.tmpl`
- Create: `templates/astro/gitignore.tmpl`
- Create: `templates/astro/src/layouts/BaseLayout.astro.tmpl`
- Create: `templates/astro/src/styles/global.css.tmpl`
- Create: `templates/astro/src/data/site.json.tmpl`
- Create: `templates/astro/public/favicon.svg`
- Create: `templates/astro/public/robots.txt`
- Create: `lib/scaffold.mjs`
- Test: `lib/scaffold.test.mjs`

`gitignore.tmpl` is named without a leading dot so it is not ignored inside this repo; `scaffoldRepo` renames it on the way out.

**Interfaces:**
- Consumes: nothing.
- Produces: `scaffoldRepo({ dest, vars, pages, templates? }) -> string[]`, the repo-relative paths written. `vars` fills `{{TOKEN}}` placeholders; an unreplaced token throws. `pages` is `[{ title, path, purpose }]` and is written to `src/data/pages.json` and expanded into the Lighthouse audit blocks.

- [ ] **Step 1: Write the failing test `lib/scaffold.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scaffoldRepo } from './scaffold.mjs';

const dest = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ks-scaffold-'));

const VARS = {
  BRAND: 'Makeup by Brynlie',
  SLUG: 'makeup-by-brynlie',
  DESCRIPTION: 'Bridal and event makeup.',
  DOMAIN: 'https://makeupbybrynlie.com',
  FONT_IMPORTS: "import '@fontsource-variable/gloock';",
  // Carries its own trailing comma: the template places it ahead of the fixed
  // dependencies so that an empty value is also valid JSON.
  FONT_PACKAGES: '"@fontsource-variable/gloock": "5.3.0",',
  TOKENS: '  --bg: #f6f1ea;\n  --ink: #241c17;\n  --rule: rgba(36,28,23,0.14);\n  --surface: rgba(36,28,23,0.03);',
};

const PAGES = [
  { title: 'Home', path: '/', purpose: 'Introduce the business.' },
  { title: 'About', path: '/about/', purpose: 'Who is behind it.' },
];

function build() {
  const dir = dest();
  const written = scaffoldRepo({ dest: dir, vars: VARS, pages: PAGES });
  const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
  return { dir, written, read };
}

test('writes every expected file', () => {
  const { written } = build();
  for (const p of [
    'package.json', 'astro.config.mjs', 'netlify.toml', '.gitignore',
    'src/layouts/BaseLayout.astro', 'src/styles/global.css',
    'src/data/site.json', 'src/data/pages.json',
    'public/favicon.svg', 'public/robots.txt',
  ]) {
    assert.ok(written.includes(p), `did not write ${p}`);
  }
});

test('renames gitignore.tmpl to .gitignore', () => {
  const { written } = build();
  assert.ok(!written.some((p) => p.includes('gitignore.tmpl')));
});

test('gitignores intake so questionnaire exports never reach GitHub', () => {
  const { read } = build();
  assert.match(read('.gitignore'), /^intake\/$/m);
});

test('substitutes template variables', () => {
  const { read } = build();
  assert.match(read('src/data/site.json'), /Makeup by Brynlie/);
  assert.match(read('package.json'), /"name": "makeup-by-brynlie"/);
});

test('leaves no unreplaced token behind', () => {
  const { dir, written } = build();
  for (const p of written) {
    const body = fs.readFileSync(path.join(dir, p), 'utf8');
    assert.doesNotMatch(body, /\{\{[A-Z_]+\}\}/, `${p} has an unreplaced token`);
  }
});

test('a font package list yields valid package.json', () => {
  const { read } = build();
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@fontsource-variable/gloock'], '5.3.0');
  assert.ok(pkg.dependencies.astro);
});

test('an empty font package list still yields valid package.json', () => {
  const dir = dest();
  scaffoldRepo({ dest: dir, vars: { ...VARS, FONT_PACKAGES: '', FONT_IMPORTS: '' }, pages: PAGES });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'makeup-by-brynlie');
  assert.ok(pkg.dependencies.astro);
});

test('robots.txt disallows everything until launch', () => {
  const { read } = build();
  assert.match(read('public/robots.txt'), /^Disallow: \/$/m);
});

test('throws when a template variable is missing', () => {
  const { BRAND, ...missing } = VARS;
  assert.throws(() => scaffoldRepo({ dest: dest(), vars: missing, pages: PAGES }), /BRAND/);
});

test('writes the locked page set to src/data/pages.json', () => {
  const { read } = build();
  assert.deepEqual(JSON.parse(read('src/data/pages.json')), PAGES);
});

test('generates one Lighthouse audit block per page', () => {
  const { read } = build();
  const toml = read('netlify.toml');
  assert.match(toml, /path = "index\.html"/);
  assert.match(toml, /path = "about\/index\.html"/);
  assert.equal((toml.match(/\[\[plugins\.inputs\.audits\]\]/g) ?? []).length, 2);
});

test('sets a noindex header for the whole site', () => {
  const { read } = build();
  assert.match(read('netlify.toml'), /X-Robots-Tag = "noindex, nofollow"/);
});

test('the content security policy forbids remote images and scripts', () => {
  const { read } = build();
  const csp = read('netlify.toml').match(/Content-Security-Policy = "([^"]+)"/)[1];
  assert.match(csp, /img-src 'self' data:;/);
  assert.match(csp, /font-src 'self';/);
  assert.doesNotMatch(csp, /unpkg/);
});

test('scaffolds no Decap admin surface', () => {
  const { written } = build();
  assert.ok(!written.some((p) => p.startsWith('public/admin')));
  const { read } = build();
  assert.doesNotMatch(read('netlify.toml'), /\/admin/);
});

test('the layout emits the Stage Two robots meta tag', () => {
  const { read } = build();
  assert.match(read('src/layouts/BaseLayout.astro'), /name="robots" content="noindex,nofollow"/);
});

test('global.css carries the extracted direction tokens', () => {
  const { read } = build();
  assert.match(read('src/styles/global.css'), /--rule: rgba\(36,28,23,0\.14\);/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test lib/scaffold.test.mjs`
Expected: FAIL — `Cannot find module .../lib/scaffold.mjs`

- [ ] **Step 3: Write `templates/astro/package.json.tmpl`**

```
{
  "name": "{{SLUG}}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "verify": "node scripts/verify.mjs",
    "gate": "npm run check && npm run build && npm run verify"
  },
  "dependencies": {
    {{FONT_PACKAGES}}"@astrojs/sitemap": "^3.7.3",
    "astro": "^5.0.0"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.9",
    "@netlify/plugin-lighthouse": "^6.0.4",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 4: Write `templates/astro/astro.config.mjs.tmpl`**

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: '{{DOMAIN}}',
  integrations: [sitemap()],
  build: { format: 'directory' },
});
```

- [ ] **Step 5: Write `templates/astro/gitignore.tmpl`**

```
node_modules/
dist/
.astro/
.DS_Store
.env

# Never commit: client questionnaire exports, brand uploads, contracts.
intake/
*.docx
```

- [ ] **Step 6: Write `templates/astro/netlify.toml.tmpl`**

```toml
[build]
  # Clear Astro's content-layer store before building: the glob loader skips
  # its delete sweep when a collection goes to zero files, leaving stale pages
  # on Netlify's cached node_modules.
  command = "rm -rf node_modules/.astro && npm run check && npm run build && npm run verify"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[plugins]]
  package = "@netlify/plugin-lighthouse"

  # The string "true", not a boolean: the plugin compares
  # `inputs?.fail_deploy_on_score_thresholds === 'true'` to decide whether it
  # runs at onPostBuild (a real gate) or onSuccess (an alarm after the deploy
  # is already live).
  [plugins.inputs]
    fail_deploy_on_score_thresholds = "true"

{{LIGHTHOUSE_AUDITS}}

# Stage Two and Stage Three are noindex. The meta tag covers HTML; this header
# covers everything else Netlify serves. Both come off at launch.
[[headers]]
  for = "/*"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
    Content-Security-Policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), interest-cohort=()"
    X-Frame-Options = "DENY"

# Astro content-hashes everything in /_astro, so it is safe to pin.
[[headers]]
  for = "/_astro/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
```

- [ ] **Step 7: Write `templates/astro/src/data/site.json.tmpl`**

```json
{
  "brand": "{{BRAND}}",
  "slug": "{{SLUG}}",
  "description": "{{DESCRIPTION}}",
  "domain": "{{DOMAIN}}",
  "stage": "two"
}
```

- [ ] **Step 7a: Write `templates/astro/public/favicon.svg`**

`BaseLayout` links this, so it has to exist or every page 404s on it and
Lighthouse's best-practices score drops below the 1.0 threshold Netlify
enforces. A neutral mark, replaced with the client's at Stage Three.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="2" />
</svg>
```

- [ ] **Step 7b: Write `templates/astro/public/robots.txt`**

The third layer of the same rule as the meta tag and the `X-Robots-Tag` header.
All three come off at launch.

```
# Stage Two and Stage Three. Removed at launch, together with the robots meta
# tag in BaseLayout.astro and the X-Robots-Tag header in netlify.toml.
User-agent: *
Disallow: /
```

- [ ] **Step 8: Write `templates/astro/src/styles/global.css.tmpl`**

```css
/* Design tokens lifted from the demo direction the client approved. Every
   colour, size, and spacing step in a component references one of these; no
   literal values live in component CSS. Stage Three changes content, never
   these. */
:root {
{{TOKENS}}

  /* Placeholder surfaces. Drawn from the site's own palette so an image area
     reads as part of the design rather than a hole punched in it. */
  --placeholder-border: var(--rule);
  --placeholder-fill: var(--surface);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--ink);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

img { max-width: 100%; display: block; }

a { color: inherit; }

.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
```

- [ ] **Step 9: Write `templates/astro/src/layouts/BaseLayout.astro.tmpl`**

```astro
---
{{FONT_IMPORTS}}
import '../styles/global.css';
import site from '../data/site.json';

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <!-- Stage Two and Stage Three are noindex. Removed at launch, together
         with the X-Robots-Tag header in netlify.toml. -->
    <meta name="robots" content="noindex,nofollow" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href={new URL(Astro.url.pathname, site.domain).href} />
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 10: Write `lib/scaffold.mjs`**

```js
// Writes a client's Astro repository from templates/astro.
//
// Substitution is deliberately strict: an unreplaced {{TOKEN}} throws rather
// than shipping into a client repo, because a literal "{{BRAND}}" in a page
// title is the kind of thing that survives all the way to a preview link.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATES = path.join(here, '..', 'templates', 'astro');

const walk = (dir, base = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });

// "/" -> index.html, "/about/" -> about/index.html
export const distPath = (route) => {
  const clean = String(route).replace(/^\/|\/$/g, '');
  return clean ? `${clean}/index.html` : 'index.html';
};

function lighthouseAudits(pages) {
  return pages
    .map((p) => {
      const file = distPath(p.path);
      const name = file === 'index.html' ? 'home' : file.replace(/\/index\.html$/, '').replace(/\//g, '-');
      return [
        '  [[plugins.inputs.audits]]',
        `    path = "${file}"`,
        `    output_path = "reports/lighthouse-${name}.html"`,
        '    [plugins.inputs.audits.thresholds]',
        '      performance = 1.0',
        '      accessibility = 1.0',
        '      best-practices = 1.0',
        '      seo = 1.0',
      ].join('\n');
    })
    .join('\n\n');
}

function substitute(body, vars, file) {
  return body.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`${file}: no value for template variable ${key}`);
    return vars[key];
  });
}

export function scaffoldRepo({ dest, vars, pages, templates = DEFAULT_TEMPLATES }) {
  const all = { ...vars, LIGHTHOUSE_AUDITS: lighthouseAudits(pages) };
  const written = [];

  for (const rel of walk(templates)) {
    const out = rel
      .replace(/\.tmpl$/, '')
      .replace(/(^|\/)gitignore$/, '$1.gitignore');
    const body = substitute(fs.readFileSync(path.join(templates, rel), 'utf8'), all, rel);
    const target = path.join(dest, out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    written.push(out);
  }

  const pagesJson = path.join(dest, 'src', 'data', 'pages.json');
  fs.mkdirSync(path.dirname(pagesJson), { recursive: true });
  fs.writeFileSync(pagesJson, `${JSON.stringify(pages, null, 2)}\n`);
  written.push('src/data/pages.json');

  return written;
}
```

- [ ] **Step 11: Run the test and verify it passes**

Run: `node --test lib/scaffold.test.mjs`
Expected: PASS, 16 tests.

- [ ] **Step 12: Commit**

```bash
git add templates/astro lib/scaffold.mjs lib/scaffold.test.mjs
git commit -m "Add client repo scaffold"
```

---

### Task 9: Placeholder components

**Files:**
- Create: `templates/astro/src/components/ImageArea.astro`
- Create: `templates/astro/src/components/EmbedArea.astro`
- Test: `lib/placeholders.test.mjs`

These are plain `.astro` files, not `.tmpl` — they contain no template variables, so `scaffoldRepo` copies them through unchanged.

**Interfaces:**
- Consumes: `--placeholder-border`, `--placeholder-fill`, `--rule`, `--ink` from `global.css`.
- Produces: `<ImageArea ratio="3/2" role="Hero photo" />` and `<EmbedArea service="Acuity" height="720" label="Booking" />`.

- [ ] **Step 1: Write the failing test `lib/placeholders.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const comp = (name) =>
  fs.readFileSync(path.join(here, '..', 'templates', 'astro', 'src', 'components', name), 'utf8');

test('ImageArea never emits an img element', () => {
  assert.doesNotMatch(comp('ImageArea.astro'), /<img\b/);
});

test('neither placeholder references a remote URL', () => {
  for (const name of ['ImageArea.astro', 'EmbedArea.astro']) {
    assert.doesNotMatch(comp(name), /https?:\/\//, `${name} references a remote URL`);
  }
});

test('ImageArea holds the final photograph aspect ratio', () => {
  assert.match(comp('ImageArea.astro'), /aspect-ratio/);
});

test('ImageArea draws from the site palette, not a fixed grey', () => {
  const body = comp('ImageArea.astro');
  assert.match(body, /var\(--placeholder-border\)/);
  assert.match(body, /var\(--placeholder-fill\)/);
  assert.doesNotMatch(body, /#(ccc|ddd|eee|999|888)\b/i);
});

test('ImageArea uses no hatching, icons, or dimension text', () => {
  const body = comp('ImageArea.astro');
  assert.doesNotMatch(body, /repeating-linear-gradient/);
  assert.doesNotMatch(body, /<svg/);
  assert.doesNotMatch(body, /\d+\s*(x|×)\s*\d+/);
});

test('ImageArea requires a role and renders it as the label', () => {
  const body = comp('ImageArea.astro');
  assert.match(body, /role: string/);
  assert.match(body, /\{role\}/);
});

test('EmbedArea names the tool it stands in for', () => {
  const body = comp('EmbedArea.astro');
  assert.match(body, /service: string/);
  assert.match(body, /\{service\}/);
});

test('EmbedArea is visually distinct from ImageArea', () => {
  assert.match(comp('EmbedArea.astro'), /border-style: dashed/);
  assert.doesNotMatch(comp('ImageArea.astro'), /border-style: dashed/);
});

test('both placeholders are announced to assistive technology', () => {
  for (const name of ['ImageArea.astro', 'EmbedArea.astro']) {
    assert.match(comp(name), /aria-label/, `${name} has no accessible name`);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test lib/placeholders.test.mjs`
Expected: FAIL — `ENOENT ... ImageArea.astro`

- [ ] **Step 3: Write `templates/astro/src/components/ImageArea.astro`**

```astro
---
// The only way a photograph is represented before Stage Three.
//
// Clause (b) of Stage Two: "Image areas drawn as outlined regions, not as
// placeholder photographs." A stand-in photo pulls the client's attention onto
// a decision that is not being made yet, so there is no image element here and
// no remote source anywhere in the build.
//
// The box holds the aspect ratio the real photograph will occupy, so nothing
// reflows when Stage Three drops the image in. Border and fill come from the
// site's own tokens: the region reads as part of the design instead of a grey
// hole punched through it.
interface Props {
  ratio: string;
  role: string;
}

const { ratio, role } = Astro.props;
---
<div class="image-area" style={`aspect-ratio: ${ratio};`} aria-label={`Image area: ${role}`}>
  <span class="image-area-role">{role}</span>
</div>

<style>
  .image-area {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    border: 1px solid var(--placeholder-border);
    background: var(--placeholder-fill);
  }

  .image-area-role {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.55;
    padding: 0 1rem;
    text-align: center;
  }
</style>
```

- [ ] **Step 4: Write `templates/astro/src/components/EmbedArea.astro`**

```astro
---
// Stands in for a third-party embed until the client's account exists.
//
// Rendered at the embed's real footprint so the layout the client approves at
// Stage Two is the layout they get at Stage Three. Dashed rather than solid,
// so nobody mistakes it for an image area and expects a photograph.
interface Props {
  service: string;
  height: number;
  label: string;
}

const { service, height, label } = Astro.props;
---
<div
  class="embed-area"
  style={`min-height: ${height}px;`}
  aria-label={`${label} area, provided by ${service} at Stage Three`}
>
  <span class="embed-area-label">{label}</span>
  <span class="embed-area-service">{service}</span>
</div>

<style>
  .embed-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
    border: 1px dashed var(--placeholder-border);
    background: var(--placeholder-fill);
  }

  .embed-area-label {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .embed-area-service {
    font-size: 0.7rem;
    opacity: 0.45;
  }
</style>
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `node --test lib/placeholders.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add templates/astro/src/components lib/placeholders.test.mjs
git commit -m "Add ImageArea and EmbedArea placeholders"
```

---

### Task 10: Stage Two verifier

**Files:**
- Create: `templates/astro/scripts/verify.mjs`
- Create: `fixtures/dist-pass/` (see Step 1)
- Test: `lib/verify.test.mjs`

**Interfaces:**
- Consumes: `dist/` and `src/data/pages.json`, both relative to the process working directory.
- Produces: a CLI. Exit 0 and a per-check report on success; exit 1 and a list of failures otherwise. Every failure line names the file it came from.

- [ ] **Step 1: Write the failing test `lib/verify.test.mjs`**

The test builds each fixture repository in a temp directory, so the fixtures stay readable as code rather than as a tree of near-identical files.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const verifier = path.join(here, '..', 'templates', 'astro', 'scripts', 'verify.mjs');

const PAGES = [
  { title: 'Home', path: '/', purpose: 'Introduce the business.' },
  { title: 'About', path: '/about/', purpose: 'Who is behind it.' },
];

const page = (body) => `<!DOCTYPE html><html lang="en"><head>
<title>Makeup by Brynlie</title>
<meta name="robots" content="noindex,nofollow" />
</head><body>
<nav><a href="/">Home</a> <a href="/about/">About</a></nav>
${body}
</body></html>`;

function repo({ pages = PAGES, files = {}, omit = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-verify-'));
  fs.mkdirSync(path.join(dir, 'src', 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'data', 'pages.json'), JSON.stringify(pages));

  const base = {
    'index.html': page('<h1>Home</h1><p>Lorem ipsum dolor sit amet.</p>'),
    'about/index.html': page('<h1>About</h1><p>Lorem ipsum dolor sit amet.</p>'),
  };
  for (const [rel, body] of Object.entries({ ...base, ...files })) {
    if (omit.includes(rel)) continue;
    const p = path.join(dir, 'dist', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return dir;
}

function run(dir) {
  try {
    return { code: 0, out: execFileSync('node', [verifier], { cwd: dir, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('a clean Stage Two build passes', () => {
  assert.equal(run(repo()).code, 0);
});

test('a remote img source fails', () => {
  const r = run(repo({ files: { 'index.html': page('<img src="https://images.unsplash.com/x.jpg" alt="x" />') } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /remote image/i);
  assert.match(r.out, /index\.html/);
});

test('a remote CSS background image fails', () => {
  const r = run(repo({ files: { 'index.html': page('<div style="background-image: url(https://cdn.example.com/a.jpg)"></div>') } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /remote image/i);
});

test('a data URI image is allowed', () => {
  const r = run(repo({ files: { 'index.html': page('<img src="data:image/svg+xml;base64,AAAA" alt="logo" />') } }));
  assert.equal(r.code, 0);
});

test('lorem in a nav label fails', () => {
  const bad = page('<h1>Home</h1>').replace('>About<', '>Lorem ipsum<');
  const r = run(repo({ files: { 'index.html': bad } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /lorem/i);
  assert.match(r.out, /nav/i);
});

test('lorem in the title fails', () => {
  const bad = page('<h1>Home</h1>').replace('<title>Makeup by Brynlie</title>', '<title>Lorem ipsum</title>');
  const r = run(repo({ files: { 'index.html': bad } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /title/i);
});

test('lorem in a button fails', () => {
  const r = run(repo({ files: { 'index.html': page('<button>Lorem ipsum</button>') } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /button/i);
});

test('lorem in a form label fails', () => {
  const r = run(repo({ files: { 'index.html': page('<label>Lorem ipsum<input name="a" /></label>') } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /label/i);
});

test('lorem in body copy passes', () => {
  assert.equal(run(repo()).code, 0);
});

test('a page in pages.json missing from dist fails', () => {
  const r = run(repo({ omit: ['about/index.html'] }));
  assert.equal(r.code, 1);
  assert.match(r.out, /about\/index\.html/);
});

test('a page in dist absent from pages.json fails', () => {
  const r = run(repo({ files: { 'pricing/index.html': page('<h1>Pricing</h1>') } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /pricing/);
});

test('404 and thanks pages are exempt from the page set check', () => {
  const r = run(repo({ files: { '404.html': page('<h1>Not found</h1>') } }));
  assert.equal(r.code, 0);
});

test('a broken internal link fails', () => {
  const r = run(repo({ files: { 'index.html': page('<a href="/pricing/">Pricing</a>') } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /\/pricing\//);
});

test('external and mailto links are not followed', () => {
  const r = run(repo({ files: { 'index.html': page('<a href="https://instagram.com/x">Instagram</a> <a href="mailto:a@b.com">Email</a> <a href="#top">Top</a>') } }));
  assert.equal(r.code, 0);
});

test('a missing robots meta tag fails', () => {
  const bad = page('<h1>Home</h1>').replace(/<meta name="robots"[^>]*>/, '');
  const r = run(repo({ files: { 'index.html': bad } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /noindex/i);
});

test('a missing dist directory explains itself', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-verify-'));
  fs.mkdirSync(path.join(dir, 'src', 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'data', 'pages.json'), '[]');
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /dist\/ is missing/);
});

test('all failures are reported at once, not just the first', () => {
  const r = run(repo({
    files: { 'index.html': page('<img src="https://x.com/a.jpg" alt="x" /><a href="/nope/">Nope</a>') },
  }));
  assert.match(r.out, /remote image/i);
  assert.match(r.out, /\/nope\//);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test lib/verify.test.mjs`
Expected: FAIL — `ENOENT ... scripts/verify.mjs`

- [ ] **Step 3: Write `templates/astro/scripts/verify.mjs`**

```js
// Stage Two acceptance checks against dist/. Run: npm run gate
//
// Two of these are contractual rather than cosmetic. The page-set check runs in
// both directions because approving Stage Two locks the page count for the
// build fee, so drift either way is a billing problem. The noindex check runs
// because an indexed lorem site is a live search liability for a client who is
// buying search work.
//
// Reads src/data/pages.json, not intake/sitemap.md: intake/ is gitignored and
// absent from a Netlify build.
import fs from 'node:fs';
import path from 'node:path';

const failures = [];
const results = [];
const check = (label, fn) => {
  try {
    fn();
    results.push(`  ok    ${label}`);
  } catch (e) {
    results.push(`  FAIL  ${label}`);
    failures.push(`${label}: ${e.message}`);
  }
};

if (!fs.existsSync('dist')) {
  console.error('dist/ is missing. Run `npm run gate`, which builds first.');
  process.exit(1);
}

const pages = JSON.parse(fs.readFileSync(path.join('src', 'data', 'pages.json'), 'utf8'));

// Duplicated from lib/scaffold.mjs on purpose: this file ships into the client
// repo and runs on Netlify, where lib/ does not exist. Keep the two in step.
const distPath = (route) => {
  const clean = String(route).replace(/^\/|\/$/g, '');
  return clean ? `${clean}/index.html` : 'index.html';
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const html = walk('dist')
  .filter((p) => p.endsWith('.html'))
  .map((p) => ({ file: path.relative('dist', p).split(path.sep).join('/'), body: fs.readFileSync(p, 'utf8') }));

// Pages that exist for the machine or for an error state, not for the client's
// approved page set.
const EXEMPT = new Set(['404.html', 'thanks/index.html']);

const LOREM = /\b(lorem|ipsum|dolor sit amet|consectetur|adipiscing|eiusmod)\b/i;
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const tagText = (body, tag) =>
  [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map((m) => strip(m[1]));

check('no remote image sources', () => {
  for (const { file, body } of html) {
    const img = body.match(/<img\b[^>]*\bsrc="https?:\/\/[^"]*"/i);
    if (img) throw new Error(`remote image in ${file}: ${img[0]}`);
    const bg = body.match(/background-image\s*:\s*url\(\s*['"]?https?:\/\/[^)]*\)/i);
    if (bg) throw new Error(`remote image in ${file}: ${bg[0]}`);
  }
});

check('structural text is real English, not lorem', () => {
  for (const { file, body } of html) {
    for (const nav of tagText(body, 'nav')) {
      if (LOREM.test(nav)) throw new Error(`lorem in nav on ${file}`);
    }
    for (const t of tagText(body, 'title')) {
      if (LOREM.test(t)) throw new Error(`lorem in title on ${file}`);
    }
    for (const b of tagText(body, 'button')) {
      if (LOREM.test(b)) throw new Error(`lorem in button on ${file}`);
    }
    for (const l of tagText(body, 'label')) {
      if (LOREM.test(l)) throw new Error(`lorem in label on ${file}`);
    }
  }
});

check('every approved page was emitted', () => {
  for (const p of pages) {
    const want = distPath(p.path);
    if (!fs.existsSync(path.join('dist', want))) throw new Error(`missing ${want} (${p.title})`);
  }
});

check('no page was emitted that is not in the approved set', () => {
  const approved = new Set(pages.map((p) => distPath(p.path)));
  for (const { file } of html) {
    if (approved.has(file) || EXEMPT.has(file)) continue;
    throw new Error(`${file} is not in the approved page set`);
  }
});

check('every internal link resolves', () => {
  const exists = (href) => {
    const clean = href.split(/[?#]/)[0];
    if (!clean || clean === '/') return fs.existsSync(path.join('dist', 'index.html'));
    const rel = clean.replace(/^\//, '');
    return (
      fs.existsSync(path.join('dist', rel)) ||
      fs.existsSync(path.join('dist', rel.replace(/\/$/, ''), 'index.html'))
    );
  };
  for (const { file, body } of html) {
    for (const m of body.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
      const href = m[1];
      if (!href.startsWith('/')) continue;
      if (!exists(href)) throw new Error(`broken link ${href} on ${file}`);
    }
  }
});

check('every page is noindex until launch', () => {
  for (const { file, body } of html) {
    if (!/<meta[^>]+name="robots"[^>]+content="noindex,\s*nofollow"/i.test(body)) {
      throw new Error(`no noindex,nofollow meta tag on ${file}`);
    }
  }
});

console.log(results.join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test lib/verify.test.mjs`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add templates/astro/scripts/verify.mjs lib/verify.test.mjs
git commit -m "Add Stage Two verifier"
```

---

### Task 11: The `keepsite-build` skill

**Files:**
- Create: `skills/keepsite-build/SKILL.md`
- Create: `skills/keepsite-build/references/port.md`
- Create: `skills/keepsite-build/references/productionize.md`
- Create: `skills/keepsite-build/references/placeholders.md`
- Modify: `skills/skills.test.mjs` — the "expected skills exist" test

**Interfaces:**
- Consumes: `intake/brief.md` and `intake/sitemap.md` from Task 7; `scaffoldRepo` from `lib/scaffold.mjs`; `readDirections` from `lib/demo.mjs`; `lorem` and `SLOTS` from `lib/lorem.mjs`; the components and verifier from Tasks 9 and 10.
- Produces: a client Astro repository that passes `npm run gate`.

- [ ] **Step 1: Extend the failing test in `skills/skills.test.mjs`**

Replace the first test with:

```js
test('the expected skills exist', () => {
  assert.ok(skills.includes('keepsite-sitemap'));
  assert.ok(skills.includes('keepsite-build'));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test skills/skills.test.mjs`
Expected: FAIL — `keepsite-build` is not in `skills`.

- [ ] **Step 3: Write `skills/keepsite-build/SKILL.md`**

````markdown
---
name: keepsite-build
description: Use when building a Keepsite client's Stage Two site from an approved brief and sitemap. Triggers include "build [client]", "stage two build for [client]", or a request to produce the client's Astro repo after the page set is settled. Ports the approved demo direction, then rewrites it to production quality with lorem copy and outlined image regions. Requires intake/brief.md and intake/sitemap.md; run keepsite-sitemap first.
---

# Keepsite Build

## What this produces

`{slug}/` — the client's Astro repository, deployable to Netlify, passing
`npm run gate`.

This is the real site, not a mockup. Stage Three places the client's copy and
photographs into these layouts; nothing here gets rebuilt.

## Before you start

Read `{slug}/intake/brief.md` and `{slug}/intake/sitemap.md`. They are the
source of truth. **Do not read the CSVs.** If a fact you need is not in the
brief, that is a gap in the brief — say so and stop, rather than going back to
the questionnaire and creating a second, undocumented set of decisions.

If either file is missing, run `keepsite-sitemap` first.

If the brief lists an escalation, stop and raise it. An online shop or a login
is not something to build around.

## Step 1 — port the direction

Follow `references/port.md`. This lifts the approved direction out of the demo
verbatim into `{slug}/intake/port/`. It is a reference, never shipped.

## Step 2 — scaffold the repository

Extract the design tokens from the ported CSS first: every colour, type size,
spacing step, radius, and rule weight the direction uses, as CSS custom
properties. `--bg`, `--ink`, `--rule`, and `--surface` are required; the
placeholder components reference them.

Then:

```js
import { scaffoldRepo } from './lib/scaffold.mjs';

scaffoldRepo({
  dest: '{slug}',
  vars: { BRAND, SLUG, DESCRIPTION, DOMAIN, FONT_IMPORTS, FONT_PACKAGES, TOKENS },
  pages,   // [{ title, path, purpose }] straight from sitemap.md, in order
});
```

`FONT_PACKAGES` must end with a trailing comma when it is not empty; the
template places it ahead of the fixed dependencies so both cases stay valid
JSON.

`pages` is the locked page set. It is written to `src/data/pages.json`, which
the verifier checks `dist/` against in both directions. Getting it wrong is a
billing problem, not a cosmetic one.

Fonts move from the demo's Google Fonts CDN links to `@fontsource` packages, so
the content security policy in the generated `netlify.toml` can keep
`font-src 'self'`. Find the package name on npm; pin the version.

Then `cd {slug} && npm install && git init`. `.gitignore` already lists
`intake/`; confirm that before the first commit.

## Step 3 — productionize

Follow `references/productionize.md`. The port becomes Astro components on
tokens; the pages assemble from `sitemap.md`'s section order.

## Step 4 — placeholders

Follow `references/placeholders.md`. Every photograph is an `ImageArea`; every
third-party embed is an `EmbedArea`; copy is slot-sized lorem, and structural
text stays real English.

## Step 5 — gate

```bash
cd {slug} && npm run gate
```

`astro check`, then a build, then `scripts/verify.mjs`. Fix what fails. Do not
weaken a check to make it pass — each one exists for a clause in the agreement
or for a Lighthouse threshold Netlify enforces on deploy.

## Step 6 — hand off

Report the preview URL and a note for the client covering, in plain language:

- Image areas are outlined regions, not stand-in photographs, on purpose.
- The text is placeholder text, on purpose.
- Embeds named in the note are stubbed until their accounts exist.
- Their approval covers the page set, layout, structure, and functionality.
- They get one round of changes at this stage, and approving it locks the page
  count for the build fee.

That last pair is what makes the written approval an informed one. It is in the
agreement they signed; the note repeats it in language they will actually read.

## Re-running after a change round

The client gets one round of Stage Two changes. When it arrives:

1. Edit `intake/sitemap.md` to match what they asked for.
2. Re-run from Step 3. `intake/port/` is already on disk; do not redo Step 1.
3. Update `src/data/pages.json` to the new page set before gating.

Lorem is seeded per slot, so unchanged sections produce identical text and the
diff shows only what actually moved.

## Common mistakes

| Mistake | Fix |
|---|---|
| Reading the CSVs | The brief is the source of truth; a gap in it is a gap to report |
| Shipping the port | `intake/port/` is a reference and `intake/` is gitignored |
| Literal colours in component CSS | Everything is a token in `global.css` |
| A stock photo "just to show the idea" | Clause (b) forbids it; use an `ImageArea` |
| Lorem in a button or nav label | Structural text is real English; the verifier catches it |
| A page in `dist/` that is not in `sitemap.md` | The page set is locked; add it to the sitemap or remove the page |
| Weakening a verify check to get a green build | Fix the build |
| Scaffolding `public/admin` | Keepsite manages content; no Decap unless the brief says otherwise |
````

- [ ] **Step 4: Write `skills/keepsite-build/references/port.md`**

````markdown
# Porting the direction

The point of this pass is fidelity. The client approved a specific look; the
production rewrite happens afterwards, against a copy of the thing they saw,
not against your memory of it.

## Extract

```js
import fs from 'node:fs';
import { readDirections } from './lib/demo.mjs';

const html = fs.readFileSync('keepsite/public/demo/{slug}/index.html', 'utf8');
const directions = readDirections(html);
```

Each direction is `{ number, id, prefix, css, markup }`. Take the base
direction named in the brief, and take each section keep from the direction its
brief row names.

## Write

```
{slug}/intake/port/
  base.css        the base direction's css, verbatim
  base.html       the base direction's markup, verbatim
  keep-{n}.css    one per section keep, from that demo's css
  keep-{n}.html   the kept section's markup, verbatim
  README.md       which file came from which demo, and why
```

Change nothing. Not the class names, not the whitespace, not a colour you think
is slightly off. This directory is the record of what was approved, and it is
what you diff against when the built page does not feel like the demo.

`intake/` is gitignored, so none of this reaches the client repo.

## Reconciling keeps

A section keep from another direction usually clashes with the base — different
type scale, different palette, different rhythm. Resolve it in the base's
favour: keep the section's **structure and idea**, restate its colour and type
in the base's tokens. The client asked for that section, not for a colour
collision in the middle of their homepage.

Where a keep is explicitly about colour ("Colors from Demo 3"), the opposite
applies: those colours become the base tokens, and everything else follows.

Record each reconciliation in one line in `port/README.md`.
````

- [ ] **Step 5: Write `skills/keepsite-build/references/productionize.md`**

````markdown
# Productionizing the port

The demo was written to be read once, scrolling, in a browser tab. The client
repo is a codebase Keepsite maintains for as long as the client subscribes.
This pass turns one into the other without changing how it looks.

## Tokens first

Every colour, type size, spacing step, radius, border weight, and shadow in
`port/base.css` becomes a custom property in `src/styles/global.css`. No
literal values survive in component CSS.

Required, because the placeholder components reference them:

- `--bg` — page background
- `--ink` — body text
- `--rule` — hairline borders
- `--surface` — a barely-there fill over `--bg`

Name the rest for role, not for appearance: `--accent`, not `--gold`.

## Sections become components

Each block in `port/base.html` becomes one file in `src/components/`, taking
props rather than hard-coding content. A section that appears on three pages is
one component used three times, not three copies.

Scoped `<style>` in the component. No global class-prefix namespacing — the
demo needed `.lb` and `.dc` because four directions shared one document; a
client repo has one direction.

## Pages assemble from the sitemap

One file in `src/pages/` per entry in `sitemap.md`, at the path the sitemap
gives. The sections, in the order the sitemap lists them.

Every page uses `BaseLayout` and passes a real `title` and `description`.

## Content lives in data

Per-page content goes in `src/data/{page}.json` — headings, blurbs, card lists,
FAQ entries. Components read from it. This is what makes Stage Three a content
change rather than a code change.

At Stage Two the values are lorem, generated by slot. The shape of the JSON is
what matters; the strings get replaced.

## Fonts

`@fontsource` packages, imported in `BaseLayout.astro`. Never a Google Fonts
link tag: the generated content security policy sets `font-src 'self'`, and a
CDN font will silently fail to load on the deploy while looking fine locally.

Prefer the variable build (`@fontsource-variable/...`) where one exists.

## Forms

Netlify Forms, following `keepsite/src/pages/start/index.astro`: a
`data-netlify="true"` attribute, a hidden `form-name` input, a honeypot field,
and an `action` pointing at a thanks page. The thanks page is exempt from the
page-set check, so it does not go in `sitemap.md`.

Field labels are real English. The verifier fails on lorem in a `<label>`.

## Accessibility and performance

Netlify runs Lighthouse as a deploy gate at a 1.0 threshold on all four
categories, matching `keepsite`. That is not aspirational; a single regression
cancels the deploy. In practice: one `<h1>` per page, headings in order, real
`alt` text on every `ImageArea`, visible focus states, and no layout shift —
which is what the fixed aspect ratios on `ImageArea` are for.
````

- [ ] **Step 6: Write `skills/keepsite-build/references/placeholders.md`**

````markdown
# Placeholders

Stage Two shows structure. Stand-in photos and stand-in sentences pull attention
onto decisions that are not being made yet, which is why the agreement rules
them out rather than leaving it to taste.

## Photographs

Always `ImageArea`. Never an `<img>`, never a remote URL, never a stock photo.

```astro
<ImageArea ratio="3/2" role="Hero photo" />
<ImageArea ratio="1/1" role="Owner portrait" />
<ImageArea ratio="4/5" role="Gallery 3 of 6" />
```

- `ratio` is the aspect ratio the real photograph will occupy. Getting it right
  means nothing reflows at Stage Three.
- `role` is what makes the region reviewable. Name the picture, not the box:
  "Owner portrait", not "Image".

## Third-party embeds

Always `EmbedArea`, at the embed's real footprint, named for the tool in the
brief's feature table.

```astro
<EmbedArea service="Acuity" height="720" label="Booking" />
```

If the brief records a stub with no tool named, use the generic capability
("Scheduling") and add it to the open questions.

## Copy

`lorem(slot, seed)` from `lib/lorem.mjs`. The slot sets the length; the seed
keeps it stable across rebuilds so a change round diffs cleanly. Seed with
something durable, like `about-intro-body`, not with an array index.

Slots: `hero-headline`, `headline`, `subhead`, `body`, `card-blurb`, `quote`,
`attribution`, `meta-description`, `faq-question`, `faq-answer`.

## What stays real English

| Real | Lorem |
|---|---|
| Navigation labels | Headlines and subheads |
| `<title>` and page `<h1>` | Body copy |
| Section labels | Testimonial quotes and attributions |
| Button and link text | FAQ questions and answers |
| Form field labels | Card blurbs |
| Footer contact labels | Meta descriptions |
| `alt` text | |

The left column is the structure being approved. A client cannot tell a "Book
now" button from a "Call us" button if both say lorem, and the functionality is
exactly what their approval covers.

The verifier fails the build on lorem in a nav, a title, a button, or a label.

## Never

- Grey fill, diagonal hatching, placeholder icons, or "800 × 600" text.
- `placehold.co`, `picsum.photos`, Unsplash, or any other remote source. The
  content security policy blocks them and the verifier fails on them, but the
  reason is the agreement, not the tooling.
- A single lorem blob reused everywhere. Different slots, different lengths —
  that is what lets the client see the shape of the page.
````

- [ ] **Step 7: Run the test and verify it passes**

Run: `node --test skills/skills.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 8: Install and commit**

```bash
npm test
npm run install-skills
ls ~/.claude/skills/keepsite-build/references/
git add skills/
git commit -m "Add keepsite-build skill"
```

---

### Task 12: End-to-end proof

**Files:**
- Create: `fixtures/e2e/demo-feedback.csv`
- Create: `fixtures/e2e/build.csv`
- Test: `lib/e2e.test.mjs`

This is the task that proves the templates produce a repository Astro can
actually build. It runs `npm install`, so it is gated behind an environment
variable and run deliberately rather than on every `npm test`.

**Interfaces:**
- Consumes: everything from Tasks 2–10.
- Produces: no new module. It is the acceptance test for the whole library.

- [ ] **Step 1: Write `fixtures/e2e/demo-feedback.csv`**

```
Timestamp,Email Address,Which demo feels closest to your business overall?,Which words best describe how you want your website to feel?,Which words do NOT describe how you want your website to feel?
2026-08-20 09:14:00,client@example.com,Demo 1,"Warm, Timeless","Bold, Playful"
```

- [ ] **Step 2: Write `fixtures/e2e/build.csv`**

```
Timestamp,Email Address,In a sentence or two what does your business do?,Which pages or areas do you know you want?,Which sections would you like your homepage to include?,Which features would be helpful for your business?,What is the #1 thing you want someone to do after visiting your website?
2026-08-21 11:02:00,client@example.com,We arrange flowers for weddings.,"Home, About, Contact","Intro/quick overview, Main services, Strong contact/booking section","Contact form, Photo gallery, Online booking",Fill out an inquiry form
```

- [ ] **Step 3: Write the failing test `lib/e2e.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldRepo } from './scaffold.mjs';
import { lorem } from './lorem.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const heavy = process.env.KS_E2E !== '1';

const PAGES = [
  { title: 'Home', path: '/', purpose: 'Introduce the business.' },
  { title: 'About', path: '/about/', purpose: 'Who is behind it.' },
];

const VARS = {
  BRAND: 'Example Florals',
  SLUG: 'example-florals',
  DESCRIPTION: 'Wedding and event florals.',
  DOMAIN: 'https://example-florals.test',
  FONT_IMPORTS: '',
  FONT_PACKAGES: '"@fontsource-variable/instrument-sans": "5.3.0",',
  TOKENS: [
    '  --bg: #faf7f2;',
    '  --ink: #221c16;',
    '  --rule: rgba(34,28,22,0.14);',
    '  --surface: rgba(34,28,22,0.03);',
  ].join('\n'),
};

const pageSource = (title, description) => `---
import BaseLayout from '../layouts/BaseLayout.astro';
import ImageArea from '../components/ImageArea.astro';
import EmbedArea from '../components/EmbedArea.astro';
---
<BaseLayout title="${title}" description="${description}">
  <nav><a href="/">Home</a> <a href="/about/">About</a></nav>
  <h1>${title}</h1>
  <p>${lorem('body', `${title}-intro`)}</p>
  <ImageArea ratio="3/2" role="Hero photo" />
  <EmbedArea service="Acuity" height="720" label="Booking" />
  <button type="button">Send an enquiry</button>
</BaseLayout>
`;

test('the intake CLI reads the end-to-end fixture', () => {
  const out = JSON.parse(
    execFileSync(
      'node',
      [
        path.join(here, 'read-intake-cli.mjs'),
        path.join(root, 'fixtures', 'e2e'),
        path.join(root, 'fixtures', 'demo-sample.html'),
        '--match=client@example.com',
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(out.direction.number, 1);
  assert.deepEqual(out.build.pages, ['Home', 'About', 'Contact']);
  assert.deepEqual(out.build.features, ['Contact form', 'Online booking', 'Photo gallery']);
  assert.equal(out.build.primaryAction, 'Fill out an inquiry form');
});

test(
  'a scaffolded repo builds and passes the Stage Two gate',
  { skip: heavy ? 'set KS_E2E=1 to run (installs npm packages)' : false },
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-e2e-'));
    scaffoldRepo({ dest: dir, vars: VARS, pages: PAGES });

    fs.mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'pages', 'index.astro'), pageSource('Home', 'Wedding and event florals.'));
    fs.writeFileSync(path.join(dir, 'src', 'pages', 'about.astro'), pageSource('About', 'Who is behind it.'));

    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
    const out = execFileSync('node', ['scripts/verify.mjs'], { cwd: dir, encoding: 'utf8' });

    assert.match(out, /All \d+ checks passed/);
  },
);
```

- [ ] **Step 4: Run the light half and verify it fails**

Run: `node --test lib/e2e.test.mjs`
Expected: FAIL on the CLI test — the fixture directory does not exist until Steps 1 and 2 are done; if they are, this passes and only the heavy test is skipped.

- [ ] **Step 5: Run the heavy half**

Run: `KS_E2E=1 node --test lib/e2e.test.mjs`
Expected: PASS. This installs Astro, builds the fixture site, and runs the verifier against the real `dist/`. If `astro check` or the build fails, the fault is in `templates/astro`, not in the test — fix the template.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. The heavy test reports as skipped.

- [ ] **Step 7: Commit**

```bash
git add fixtures/e2e lib/e2e.test.mjs
git commit -m "Add end-to-end scaffold and gate proof"
```

- [ ] **Step 8: Dry-run against a real client**

Not a code change — the acceptance check on the whole plan.

```bash
npm run install-skills
```

Then, in a fresh Claude Code session, with `makeup-by-brynlie`'s two CSV exports
placed in `makeup-by-brynlie/intake/`:

> sitemap for makeup-by-brynlie

Confirm the skill: reads both CSVs without hand-parsing; resolves the direction
against `keepsite/public/demo/makeup-by-brynlie/index.html`; writes
`intake/brief.md` and `intake/sitemap.md`; marks inferred pages; and stops
without scaffolding anything.

Review and correct those two files, then:

> build makeup-by-brynlie

Confirm the build passes `npm run gate` and that `git status` in
`makeup-by-brynlie/` shows no `intake/` files staged.

---

## Notes for the executor

- After any task that changes `skills/` or `lib/`, run `npm run install-skills`.
  The installed copies are what a session actually loads.
- `field()` in `lib/intake.mjs` matches questionnaire headers on distinctive
  substrings. If a real export returns `''` for a field, widen or narrow the
  needles — never rename the output key, because `brief.md`, the two SKILL.md
  files, and the reference documents all use those names.
- The three spec refinements at the top of this plan should be folded back into
  `keepsite/docs/superpowers/specs/2026-09-01-stage-two-build-skill-design.md`
  once the plan is approved.

---

## Amendments from execution

Recorded after the plan was executed. The spec has been amended to match;
these notes exist so the plan's task text is not read as current where
execution proved it wrong. The tasks themselves are left as they were
dispatched.

1. **Task 4's test destructured the wrong element.** `const [second] =
   readDirections(sample)` binds element 0 to a variable named `second`, so a
   test named for direction 2 asserted against direction 1 and could not pass
   against a correct parser. Corrected to `const [, second]`.

2. **Task 7's step order was unfollowable on two of three tiers.** Page-set
   derivation was Step 4 and the keyword pass Step 5, but two of the five
   page-set sources consume the keyword pass's output. The keyword pass is now
   Step 4 and derivation Step 5, in the skill and in the spec.

3. **Task 7's field-path prefixing was inconsistent.** `build.pages` and
   `build.features` were prefixed while fifteen other build-nested fields were
   bare. Now uniformly bare.

4. **Task 8's `FONT_PACKAGES` fixtures lacked their trailing comma**, which
   would have produced invalid JSON in the generated `package.json`. Fixed
   before dispatch, with a test that JSON-parses both the empty and non-empty
   cases.

5. **Task 10's remote-image check scanned only HTML.** Astro extracts a
   component's scoped `<style>` into a bundled stylesheet above its
   `inlineStylesheets` threshold, so a `background-image: url(https://…)`
   written inside a component shipped past the check that exists to enforce
   clause (b) of the agreements. It now scans `dist/**/*.css` as well.

6. **Task 10's exemption test covered only `404.html`** despite a title
   claiming it covered the thanks page too. Split into two tests, each
   exercising what its title names.

7. **Task 9's `EmbedArea` border contradicted its own test.** The CSS block
   used the `1px dashed` shorthand while the test asserted the literal string
   `border-style: dashed`. The component now uses the shorthand and the test
   asserts the property (`/border:[^;]*dashed/` present on `EmbedArea`, absent
   on `ImageArea`) rather than a spelling of it.

8. **Task 10's Files list named `fixtures/dist-pass/`, which is not needed.**
   Step 1 of the same task deliberately builds every fixture in a temp
   directory and says why. The Files line was stale.

9. **Task 11's `EmbedArea` example failed type checking.** `height="720"`
   against a `number`-typed prop produces `TS2322`, so a build agent copying
   the canonical example would break the skill's own `astro check` gate.
   Corrected to `height={720}`.

10. **Task 11's Forms guidance would have failed the page-set gate.** It cited
    `keepsite/src/pages/start/index.astro`, which posts to `/start/thanks/`,
    while `verify.mjs` exempts exactly one literal path, `thanks/index.html`.
    The thanks page is now specified explicitly at the site root, one per site.

11. **The plan's Global Constraints overstated the Decap rule.** "No Decap CMS
    in generated client repos" is absolute here, but the spec carves an
    exception: `public/admin` is omitted *unless the brief records that this
    client will edit their own content*. The spec governs.

12. **Task 12 never ran `astro check`.** Its code ran `npm run build` and the
    verifier separately, while its own prose claimed to cover `astro check` —
    the first command of both `npm run gate` and the generated `netlify.toml`
    build command. The heavy test now runs `npm run gate`, and cleans its temp
    scaffold on success while leaving it in place on failure.
