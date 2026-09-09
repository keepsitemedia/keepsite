# On-site questionnaires implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three Keepsite client questionnaires off Google Forms onto keepsitemedia.com, so each submission is one client's answers as JSON that `keepsite-sitemap` reads directly.

**Architecture:** Question definitions are JSON data files in the keepsite Astro repo; one Astro component renders any definition; a Netlify Function verifies a signed token, validates the answers against the same definition, writes them to Netlify Blobs, and emails them as a JSON attachment. In keepsite-skills, the intake reader stops parsing CSV and reads that JSON.

**Tech Stack:** Astro 5 (static output), Netlify Functions v2 (native `Request`/`Response`, `await request.formData()`), Netlify Blobs, Resend over `fetch`, `node:test`, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-09-03-on-site-questionnaires-design.md`

## Global Constraints

- Two repositories. `keepsite` is `/mnt/c/Users/Snic9/keepsitemedia/keepsite`; `keepsite-skills` is `/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills`. Every path below is relative to the repository named in the task.
- **keepsite-skills stays dependency-free.** No npm dependencies, ever. Tests are `*.test.mjs` beside their module, run with `node --test`.
- **keepsite gains exactly one dependency:** `@netlify/blobs`. Email goes over `fetch` to Resend's REST API rather than pulling their SDK.
- Form keys are `intro`, `brand`, `build`. Intake filenames follow them: `intro.json`, `brand.json`, `build.json`.
- `formVersion` is the string `"2026-09-03"` everywhere it appears in this plan.
- Answer keys match the names `read-intake-cli.mjs` already produces. Do not rename them.
- Astro pages follow the existing `src/data/*.json` + `src/pages/*.astro` split. Copy lives in data files, never inline in a component.
- `npm run gate` (check, build, verify) must pass in keepsite before any commit that touches `src/` or `netlify.toml`.
- No italics anywhere in rendered copy, and no font families beyond Instrument Sans and Newsreader.

---

## File structure

**keepsite-skills**

| File | Responsibility |
|---|---|
| `lib/forms.mjs` | Option-list snapshot + `FORM_VERSION`. Modify. |
| `lib/forms.test.mjs` | Option coverage against the reference docs. Modify. |
| `lib/intake.mjs` | Reads the three JSON files. Modify (shrinks). |
| `lib/intake.test.mjs` | Modify. |
| `lib/read-intake-cli.mjs` | Assembles the JSON the skill reads. Modify. |
| `lib/csv.mjs`, `lib/csv.test.mjs` | Delete in Task 4. |
| `lib/csv-to-json.mjs` | One-shot migration for in-flight clients. Create, Task 2. |
| `lib/csv-to-json.test.mjs` | Create, Task 2. |
| `fixtures/e2e/{brand,build}.json` | Replace the two CSV fixtures. Task 3. |
| `skills/keepsite-sitemap/SKILL.md` | Step 1 instructions. Modify, Task 4. |

**keepsite**

| File | Responsibility |
|---|---|
| `src/data/questionnaires/{intro,brand,build}.json` | Question definitions. Create, Task 5. |
| `src/components/Questionnaire.astro` | Renders any definition. Create, Task 6. |
| `src/pages/questionnaire/{intro,brand,build}.astro` | One page each. Create, Task 7. |
| `src/pages/questionnaire/thanks.astro` | Create, Task 7. |
| `netlify/functions/lib/token.mjs` | Mint and verify. Create, Task 8. |
| `netlify/functions/lib/token.test.mjs` | Create, Task 8. |
| `netlify/functions/lib/validate.mjs` | Answers against a definition. Create, Task 9. |
| `netlify/functions/lib/validate.test.mjs` | Create, Task 9. |
| `netlify/functions/questionnaire.mjs` | The endpoint. Create, Task 10. |
| `scripts/mint-token.mjs` | Prints a client's three URLs. Create, Task 8. |
| `scripts/verify.mjs` | Structural gate. Modify, Tasks 7 and 11. |
| `netlify.toml`, `astro.config.mjs`, `public/robots.txt` | Routing, headers, audits. Modify, Task 7. |
| `src/data/process.json`, `src/data/faq.json` | Copy. Modify, Task 12. |

Tasks 1–4 are keepsite-skills and can land before any of keepsite exists. Task 3 depends on Task 2 because the migration script is what generates the JSON fixtures.

---

## Task 1: Form version and option coverage

**Repository:** keepsite-skills

**Files:**
- Modify: `lib/forms.mjs`
- Modify: `lib/forms.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `FORM_VERSION` (string `'2026-09-03'`), exported from `lib/forms.mjs` alongside the existing `PAGE_OPTIONS`, `HOMEPAGE_SECTION_OPTIONS`, `FEATURE_OPTIONS`, `CONFIDENCE_OPTIONS`, `ACTION_OPTIONS`, `FEEL_WORDS`.

The option lists currently carry a comment saying they are hand-kept copies of Google's option text. Their role changes: they become a versioned snapshot of the definitions that will live in keepsite. The tests below make the coupling loud — when the version moves, they say what is unmapped.

- [ ] **Step 1: Write the failing tests**

Append to `lib/forms.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORM_VERSION } from './forms.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ref = (name) =>
  fs.readFileSync(
    path.join(here, '..', 'skills', 'keepsite-sitemap', 'references', name),
    'utf8',
  );

test('the form version is a dated string', () => {
  assert.match(FORM_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test('every feature option has a feature-map entry', () => {
  const map = ref('feature-map.md');
  const missing = FEATURE_OPTIONS.filter((o) => o !== 'Other' && !map.includes(o));
  assert.deepEqual(missing, [], `unmapped features: ${missing.join(', ')}`);
});

test('every page option is covered by the page-set rules', () => {
  const rules = ref('page-set-rules.md');
  const missing = PAGE_OPTIONS.filter((o) => o !== 'Other' && !rules.includes(o));
  assert.deepEqual(missing, [], `uncovered pages: ${missing.join(', ')}`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills && node --test lib/forms.test.mjs`
Expected: FAIL — `FORM_VERSION` is not exported.

- [ ] **Step 3: Add the export**

At the top of `lib/forms.mjs`, above `ACTION_OPTIONS`, replacing the "If a form question is edited, edit here to match" sentence in the file header comment:

```js
// The option lists are a snapshot of the definitions in the keepsite repo at
// src/data/questionnaires/. Those render the form and validate submissions;
// these interpret what comes back. A submission carrying a different
// FORM_VERSION means the two have drifted, and read-intake-cli reports it
// rather than guessing.
export const FORM_VERSION = '2026-09-03';
```

- [ ] **Step 4: Run the tests**

Run: `node --test lib/forms.test.mjs`
Expected: PASS. If the feature or page coverage tests fail, that is a real gap in `references/feature-map.md` or `references/page-set-rules.md` — add the missing entries there rather than weakening the test.

- [ ] **Step 5: Commit**

```bash
git add lib/forms.mjs lib/forms.test.mjs skills/keepsite-sitemap/references/
git commit -m "Version the form option snapshot"
```

---

## Task 2: CSV-to-JSON migration

**Repository:** keepsite-skills

**Files:**
- Create: `lib/csv-to-json.mjs`
- Create: `lib/csv-to-json.test.mjs`

**Interfaces:**
- Consumes: `readAll` from `lib/read-intake-cli.mjs` (current CSV-reading signature `readAll(intakeDir, demoPath, match)`).
- Produces: `convert(intakeDir, demoPath, match) -> { brand, build }`, where each value is a submission envelope `{ formVersion, slug, form, submittedAt, answers, files }`. Task 3 reads exactly this shape back.

Brynlie is mid-build with `demo-feedback.csv` and `build.csv` in her intake directory. This converts a client's CSVs once, then the CSV path is deleted in Task 4. Written before the JSON reader so the equality test in Task 3 has something to compare against.

- [ ] **Step 1: Write the failing test**

Create `lib/csv-to-json.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert } from './csv-to-json.mjs';
import { FORM_VERSION } from './forms.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const fixtures = path.join(root, 'fixtures', 'e2e');
const demo = path.join(root, 'fixtures', 'demo-sample.html');

test('convert produces one envelope per post-demo form', () => {
  const out = convert(fixtures, demo, 'client@example.com');
  assert.deepEqual(Object.keys(out).sort(), ['brand', 'build']);
  for (const form of ['brand', 'build']) {
    assert.equal(out[form].formVersion, FORM_VERSION);
    assert.equal(out[form].form, form);
    assert.match(out[form].submittedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Array.isArray(out[form].files));
  }
});

test('multi-select answers survive as arrays', () => {
  const { build } = convert(fixtures, demo, 'client@example.com');
  assert.ok(Array.isArray(build.answers.pages));
  assert.ok(build.answers.pages.includes('Home'));
});

test('the demo pick survives as a direction id', () => {
  const { brand } = convert(fixtures, demo, 'client@example.com');
  assert.equal(typeof brand.answers.pick, 'string');
});

test('slug comes from the intake directory name', () => {
  const { build } = convert(fixtures, demo, 'client@example.com');
  assert.equal(build.slug, 'e2e');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/csv-to-json.test.mjs`
Expected: FAIL — cannot find module `./csv-to-json.mjs`.

- [ ] **Step 3: Write the implementation**

Create `lib/csv-to-json.mjs`:

```js
#!/usr/bin/env node
// One-shot migration for clients whose intake predates the on-site forms.
//
// Runs the CSV reader that is about to be deleted and writes its output as the
// submission envelopes the on-site forms now produce. Once every in-flight
// client is converted, this file and lib/csv.mjs both go.
//
//   node lib/csv-to-json.mjs <intakeDir> <demoHtmlPath> [--match=<string>]
import fs from 'node:fs';
import path from 'node:path';
import { readAll } from './read-intake-cli.mjs';
import { FORM_VERSION } from './forms.mjs';

const envelope = (slug, form, answers) => ({
  formVersion: FORM_VERSION,
  slug,
  form,
  submittedAt: new Date().toISOString(),
  answers,
  files: [],
});

export function convert(intakeDir, demoPath, match = null) {
  const read = readAll(intakeDir, demoPath, match);
  const slug = path.basename(path.resolve(intakeDir)) === 'intake'
    ? path.basename(path.dirname(path.resolve(intakeDir)))
    : path.basename(path.resolve(intakeDir));

  const { blank: _b, unmatchedHeaders: _u, ...brand } = read.demoFeedback;
  const { blank: _b2, unmatchedHeaders: _u2, ...build } = read.build;

  // The pick arrives as prose ("Demo 2"); the on-site form submits a direction
  // id, so resolve it here rather than leaving two shapes in circulation.
  brand.pick = read.direction ? read.direction.id : null;

  // The form asks four separate questions and readAll assembles them; store
  // what the form stores, so the reader has one shape to handle either way.
  const [l1, l2, l3, l4] = brand.likes ?? [];
  Object.assign(brand, { like1: l1 ?? '', like2: l2 ?? '', like3: l3 ?? '', like4: l4 ?? '' });
  delete brand.likes;

  return { brand: envelope(slug, 'brand', brand), build: envelope(slug, 'build', build) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [intakeDir, demoPath, ...rest] = process.argv.slice(2);
  const match = (rest.find((a) => a.startsWith('--match=')) ?? '').slice('--match='.length) || null;
  if (!intakeDir || !demoPath) {
    console.error('usage: csv-to-json.mjs <intakeDir> <demoHtmlPath> [--match=<string>]');
    process.exit(1);
  }
  const out = convert(intakeDir, demoPath, match);
  for (const [form, body] of Object.entries(out)) {
    const p = path.join(intakeDir, `${form}.json`);
    fs.writeFileSync(p, JSON.stringify(body, null, 2) + '\n');
    console.log(`wrote ${p}`);
  }
}
```

- [ ] **Step 4: Run the test**

Run: `node --test lib/csv-to-json.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/csv-to-json.mjs lib/csv-to-json.test.mjs
git commit -m "Add one-shot CSV to JSON intake migration"
```

---

## Task 3: JSON intake reader

**Repository:** keepsite-skills

**Files:**
- Modify: `lib/intake.mjs`
- Modify: `lib/intake.test.mjs`
- Modify: `lib/read-intake-cli.mjs`
- Modify: `lib/read-intake-cli.test.mjs`
- Modify: `lib/e2e.test.mjs:48-70`
- Create: `fixtures/e2e/brand.json`, `fixtures/e2e/build.json`

**Interfaces:**
- Consumes: `convert` from Task 2 (to generate the fixtures); `FORM_VERSION` from Task 1.
- Produces:
  - `readIntake(dir) -> { brand, build, versions: { brand, build } }` in `lib/intake.mjs`, where `brand` and `build` are the `answers` objects and `versions` holds each envelope's `formVersion`.
  - `readAll(intakeDir, demoPath) -> { directions, direction, demoFeedback, build, versionMismatch }`. Note the dropped third parameter and the dropped `counts` key. `versionMismatch` is an array of `{ form, submitted, expected }`, empty when everything agrees.

The old fixture carried an email column, which no real export has. That is why the identity bug in `selectResponse` never surfaced in tests, and it is worth not reproducing: the new fixtures carry a `slug` in the envelope instead.

- [ ] **Step 1: Generate the JSON fixtures**

Run from the keepsite-skills root:

```bash
node lib/csv-to-json.mjs fixtures/e2e fixtures/demo-sample.html --match=client@example.com
```

Expected: writes `fixtures/e2e/brand.json` and `fixtures/e2e/build.json`. Open both and confirm `answers.pages` is an array and `answers.pick` is a direction id string, not `"Demo 2"`.

- [ ] **Step 2: Write the failing tests**

Replace the CSV-reading tests in `lib/intake.test.mjs` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readIntake } from './intake.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, '..', 'fixtures', 'e2e');

test('readIntake returns one client per form', () => {
  const { brand, build, versions } = readIntake(fixtures);
  assert.equal(typeof brand.keeps, 'string');
  assert.equal(typeof build.whatWeDo, 'string');
  assert.equal(versions.brand, versions.build);
});

test('readIntake names the file it cannot find', () => {
  assert.throws(() => readIntake(path.join(here, 'nope')), /brand\.json/);
});

test('readIntake rejects a file that is not a submission envelope', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-'));
  fs.writeFileSync(path.join(dir, 'brand.json'), '{"nope":true}');
  fs.writeFileSync(path.join(dir, 'build.json'), '{"nope":true}');
  assert.throws(() => readIntake(dir), /not a submission/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test lib/intake.test.mjs`
Expected: FAIL — `readIntake` still expects CSV and takes a `match` option.

- [ ] **Step 4: Rewrite `readIntake`**

Replace `readIntake` at the foot of `lib/intake.mjs` with:

```js
// One client per file, by construction: the on-site form knows the slug from
// the client's token, so there is no row to pick out of everyone else's.
export function readIntake(dir) {
  const load = (form) => {
    const p = path.join(dir, `${form}.json`);
    if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
    const body = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!body || typeof body.answers !== 'object' || !body.formVersion) {
      throw new Error(`${p} is not a submission envelope`);
    }
    return body;
  };
  const brand = load('brand');
  const build = load('build');
  return {
    brand: brand.answers,
    build: build.answers,
    versions: { brand: brand.formVersion, build: build.formVersion },
  };
}
```

Leave the rest of `lib/intake.mjs` alone for now; Task 4 deletes what is left over.

- [ ] **Step 5: Run the tests**

Run: `node --test lib/intake.test.mjs`
Expected: PASS.

- [ ] **Step 6: Write the failing CLI test**

In `lib/read-intake-cli.test.mjs`, replace the CSV-based cases with:

```js
test('readAll reads the JSON fixtures without a match string', () => {
  const out = readAll(fixtures, demoSample);
  assert.equal(out.build.whatWeDo.length > 0, true);
  assert.ok(Array.isArray(out.demoFeedback.likes));
  assert.equal(out.demoFeedback.likes.length, 4);
  assert.deepEqual(out.versionMismatch, []);
  assert.equal('counts' in out, false);
});

test('readAll still reports which questions were skipped', () => {
  const out = readAll(fixtures, demoSample);
  assert.ok(Array.isArray(out.build.blank));
});

test('readAll reports a version mismatch instead of guessing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-'));
  for (const form of ['brand', 'build']) {
    const body = JSON.parse(fs.readFileSync(path.join(fixtures, `${form}.json`), 'utf8'));
    body.formVersion = '2020-01-01';
    fs.writeFileSync(path.join(dir, `${form}.json`), JSON.stringify(body));
  }
  const out = readAll(dir, demoSample);
  assert.equal(out.versionMismatch.length, 2);
  assert.equal(out.versionMismatch[0].submitted, '2020-01-01');
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `node --test lib/read-intake-cli.test.mjs`
Expected: FAIL — `readAll` still takes three arguments and returns `counts`.

- [ ] **Step 8: Rewrite `readAll`**

In `lib/read-intake-cli.mjs`, replace the `reader()` helper and the two `readDemo`/`readBuild` blocks with direct property reads. The answer keys are already the names the old lookups produced, so the body becomes:

```js
export function readAll(intakeDir, demoPath) {
  const { brand, build, versions } = readIntake(intakeDir);
  const directions = readDirections(fs.readFileSync(demoPath, 'utf8'));

  const demoFeedback = {
    pick: brand.pick ?? null,
    // The form asks four separate questions; the brief reads them as one list.
    likes: [brand.like1, brand.like2, brand.like3, brand.like4].map((s) => s ?? ''),
    keeps: brand.keeps ?? '',
    feelWanted: brand.feelWanted ?? [],
    feelRefused: brand.feelRefused ?? [],
    visitorFeeling: brand.visitorFeeling ?? '',
    logo: brand.logo ?? '',
    logoFontsColors: brand.logoFontsColors ?? '',
    brandGuide: brand.brandGuide ?? '',
    otherFontsColors: brand.otherFontsColors ?? '',
    photos: brand.photos ?? '',
  };

  const versionMismatch = Object.entries(versions)
    .filter(([, v]) => v !== FORM_VERSION)
    .map(([form, submitted]) => ({ form, submitted, expected: FORM_VERSION }));

  return {
    directions: directions.map(slim),
    direction: slim(directions.find((d) => d.id === demoFeedback.pick)),
    demoFeedback: { ...demoFeedback, blank: blankKeys(demoFeedback) },
    build: { ...build, blank: blankKeys(build) },
    versionMismatch,
  };
}
```

Update the imports: drop `fieldKey`, `checkboxes`, `normalise`, `directionByAnswer`, and the six option lists; add `FORM_VERSION`. Keep `slim`, `blankKeys`, `readDirections`, and `readIntake`. Update the CLI footer to drop `--match` from both the argument parsing and the usage string.

`slim` currently returns `{ number, id, prefix }`; `direction` now resolves by `id` rather than by parsing prose, so `directionByAnswer` has no remaining caller.

- [ ] **Step 9: Run the full suite**

Run: `node --test`
Expected: PASS. `lib/e2e.test.mjs:48` still passes `--match=client@example.com` to the CLI — remove that argument from the `execFileSync` array.

- [ ] **Step 10: Commit**

```bash
git add lib/ fixtures/e2e/
git commit -m "Read intake as one JSON submission per client"
```

---

## Task 4: Delete the CSV path

**Repository:** keepsite-skills

**Files:**
- Delete: `lib/csv.mjs`, `lib/csv.test.mjs`, `fixtures/e2e/demo-feedback.csv`, `fixtures/e2e/build.csv`
- Modify: `lib/intake.mjs`
- Modify: `lib/demo.mjs`
- Modify: `skills/keepsite-sitemap/SKILL.md`

**Interfaces:**
- Consumes: Task 3's `readIntake` and `readAll`.
- Produces: nothing new. This task only removes.

Two readers for one thing is how the second one rots. Everything here is now unreachable.

- [ ] **Step 1: Confirm what is unreachable**

Run: `grep -rn "parseCsv\|fieldKey\|checkboxes\|selectResponse\|normalise\|directionByAnswer" lib/ skills/ --include="*.mjs" --include="*.md"`
Expected: hits only in the files this task deletes or edits, and in `lib/csv-to-json.mjs`, which calls `readAll`, not these.

- [ ] **Step 2: Delete**

```bash
git rm lib/csv.mjs lib/csv.test.mjs fixtures/e2e/demo-feedback.csv fixtures/e2e/build.csv
```

From `lib/intake.mjs` remove: the `parseCsvRecords` import, `normalise`, `fieldKey`, `field`, `looseKey`, `checkboxes`, `stamp`, `identity`, and `selectResponse`. What remains is the file header comment (rewrite it — it currently explains the Sheets export) and `readIntake`.

From `lib/demo.mjs` remove `directionByAnswer` and its regex.

Delete the corresponding cases from `lib/intake.test.mjs` and `lib/demo.test.mjs`.

- [ ] **Step 3: Run the full suite**

Run: `node --test`
Expected: PASS.

- [ ] **Step 4: Update the skill instructions**

In `skills/keepsite-sitemap/SKILL.md`:

- "Confirm `demo-feedback.csv` and `build.csv` are in the intake directory" becomes `brand.json` and `build.json`.
- Step 1's command drops `--match`:
  `node $SKILL_DIR/lib/read-intake-cli.mjs {slug}/intake keepsite/public/demo/{slug}/index.html`
- The paragraph beginning "If it exits with 'more than one client in this file'" is deleted — that error no longer exists.
- "Report to the human: the response counts, the `blank` list from each form, and the `unmatchedHeaders` list" becomes: "Report to the human: the `blank` list from each form, and any `versionMismatch`. A lot of the build questionnaire is optional and clients skip; that is normal. A `versionMismatch` means the client answered an older question set than `forms.mjs` describes — say so and stop rather than mapping answers across versions."
- Step 2's opening becomes: "`direction` in the JSON is the demo the client picked, resolved by id. If it is `null`, the answer was 'A mix of several'."
- In **Common mistakes**, "Reading the CSVs directly" becomes "Reading the JSON files directly", with the fix "Run `$SKILL_DIR/lib/read-intake-cli.mjs`; it resolves the direction and reports version drift."

- [ ] **Step 5: Verify the installer still works**

Run: `node --test install.test.mjs`
Expected: PASS. `install.mjs` copies all of `lib/` and filters `*.test.mjs`; nothing there names `csv.mjs` specifically.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Delete the CSV intake path"
```

---

## Task 5: Question definitions

**Repository:** keepsite

**Files:**
- Create: `src/data/questionnaires/intro.json`
- Create: `src/data/questionnaires/brand.json`
- Create: `src/data/questionnaires/build.json`
- Create: `scripts/check-questionnaires.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the definition shape every later task reads —

```json
{
  "formVersion": "2026-09-03",
  "form": "build",
  "title": "Keepsite build questionnaire",
  "lead": "...",
  "sections": [
    {
      "legend": "How people find you",
      "help": "You do not need to know anything about SEO for this section. We're looking for what you already know about your customers.",
      "questions": [
        {
          "key": "searchTerms",
          "label": "If someone who had never heard of you needed exactly what you offer, what do you think they might type into Google?",
          "help": "Take a guess. There are no wrong answers.",
          "type": "paragraph"
        }
      ]
    }
  ]
}
```

`type` is one of `short`, `paragraph`, `choice`, `checkboxes`, `openChecklist`, `file`, or `demoPick`. `choice`, `checkboxes`, and `openChecklist` carry an `options` array. `required` defaults to `false` and appears only where true.

The full question text for all three forms is in the **Appendix** at the foot of this plan. Transcribe it verbatim, including the em dashes and the examples — the wording is the client-facing copy and was written deliberately. Two deliberate departures from the Google originals, both noted in the appendix: the typo "how to you want THEM to feel" is fixed, and the shared Google Photos album URL is dropped.

- [ ] **Step 1: Write the failing check**

Create `scripts/check-questionnaires.mjs`:

```js
// Structural checks on the questionnaire definitions. Run: npm run check:forms
//
// These files are read by three consumers — the Astro component, the
// submission function, and (as a snapshot) keepsite-skills — so a malformed
// one fails in three places at once. Catch it here.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join('src', 'data', 'questionnaires');
const TYPES = ['short', 'paragraph', 'choice', 'checkboxes', 'openChecklist', 'file', 'demoPick'];
const WITH_OPTIONS = ['choice', 'checkboxes', 'openChecklist'];
const FORMS = ['intro', 'brand', 'build'];
const VERSION = '2026-09-03';

const fail = [];
const check = (label, fn) => {
  try { fn(); } catch (e) { fail.push(`${label}: ${e.message}`); }
};

const seen = new Set();
for (const form of FORMS) {
  const def = JSON.parse(fs.readFileSync(path.join(DIR, `${form}.json`), 'utf8'));

  check(`${form} declares the current version and its own name`, () => {
    if (def.formVersion !== VERSION) throw new Error(def.formVersion);
    if (def.form !== form) throw new Error(def.form);
  });

  for (const section of def.sections) {
    check(`${form} section "${section.legend}" is well formed`, () => {
      if (!section.legend) throw new Error('no legend');
      if (!Array.isArray(section.questions) || !section.questions.length) {
        throw new Error('no questions');
      }
    });
    for (const q of section.questions) {
      check(`${form}.${q.key}`, () => {
        if (!q.key || !/^[a-z][A-Za-z0-9]*$/.test(q.key)) throw new Error('bad key');
        if (!q.label) throw new Error('no label');
        if (!TYPES.includes(q.type)) throw new Error(`bad type ${q.type}`);
        if (WITH_OPTIONS.includes(q.type)) {
          if (!Array.isArray(q.options) || !q.options.length) throw new Error('no options');
          if (new Set(q.options).size !== q.options.length) throw new Error('duplicate options');
        }
        const id = `${form}.${q.key}`;
        if (seen.has(id)) throw new Error('duplicate key within form');
        seen.add(id);
      });
    }
  }
}

check('the three forms carry the expected question counts', () => {
  const count = (f) =>
    JSON.parse(fs.readFileSync(path.join(DIR, `${f}.json`), 'utf8'))
      .sections.reduce((n, s) => n + s.questions.length, 0);
  const expect = { intro: 7, brand: 14, build: 39 };
  for (const [f, n] of Object.entries(expect)) {
    if (count(f) !== n) throw new Error(`${f} has ${count(f)}, expected ${n}`);
  }
});

if (fail.length) {
  for (const f of fail) console.error('FAIL  ' + f);
  console.error(`\n${fail.length} failed`);
  process.exit(1);
}
console.log('questionnaire definitions OK');
```

Add to `package.json` scripts:

```json
"check:forms": "node scripts/check-questionnaires.mjs",
```

and extend the `gate` script to `"gate": "npm run check && npm run check:forms && npm run build && npm run verify"`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /mnt/c/Users/Snic9/keepsitemedia/keepsite && npm run check:forms`
Expected: FAIL — `ENOENT`, `src/data/questionnaires/intro.json` does not exist.

- [ ] **Step 3: Write the three definitions**

Create the three files from the Appendix. Counts: intro 7 questions in 1 section, brand 14 in 4 sections, build 39 in 11 sections.

- [ ] **Step 4: Run the check**

Run: `npm run check:forms`
Expected: `questionnaire definitions OK`.

- [ ] **Step 5: Commit**

```bash
git add src/data/questionnaires/ scripts/check-questionnaires.mjs package.json
git commit -m "Add questionnaire definitions"
```

---

## Task 6: The Questionnaire component

**Repository:** keepsite

**Files:**
- Create: `src/components/Questionnaire.astro`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: a definition object from Task 5.
- Produces: `<Questionnaire definition={def} slug={slug} token={token} directions={directions} />`. `directions` is optional and only the brand form passes it; it is an array of `{ number, id }`.

One component renders any definition. Sections become `<fieldset>`/`<legend>`, help text becomes `aria-describedby`. That structure is what holds `accessibility = 1.0` on a thirty-nine question page, and it is the thing the Sheets export destroyed by gluing section headings onto question text.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify.mjs`, in a new section placed before the final report block:

```js
section('Questionnaires');
check('every question renders a labelled control inside a fieldset', () => {
  for (const form of ['intro', 'brand', 'build']) {
    const html = read(`questionnaire/${form}/index.html`);
    const def = JSON.parse(
      fs.readFileSync(path.join('src', 'data', 'questionnaires', `${form}.json`), 'utf8'),
    );
    const legends = (html.match(/<legend/g) || []).length;
    if (legends !== def.sections.length) {
      throw new Error(`${form} has ${legends} legends, expected ${def.sections.length}`);
    }
    for (const s of def.sections) {
      for (const q of s.questions) {
        if (!html.includes(`name="${q.key}"`)) throw new Error(`${form} omits ${q.key}`);
        if (q.help && !html.includes(`id="${q.key}-help"`)) {
          throw new Error(`${form}.${q.key} has help with no described-by target`);
        }
      }
    }
  }
});
check('no question label is an input placeholder', () => {
  for (const form of ['intro', 'brand', 'build']) {
    if (/placeholder="[^"]{40,}/.test(read(`questionnaire/${form}/index.html`))) {
      throw new Error(`${form} uses a placeholder as a label`);
    }
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run gate`
Expected: FAIL at "every expected route is emitted" or at the new check — the questionnaire routes do not exist yet. Both failures are expected until Task 7.

- [ ] **Step 3: Write the component**

Create `src/components/Questionnaire.astro`:

```astro
---
interface Props {
  definition: {
    formVersion: string;
    form: string;
    sections: Array<{
      legend: string;
      help?: string;
      questions: Array<{
        key: string;
        label: string;
        help?: string;
        type: string;
        options?: string[];
        required?: boolean;
      }>;
    }>;
  };
  slug: string;
  token: string;
  directions?: Array<{ number: number; id: string }>;
}
const { definition, slug, token, directions = [] } = Astro.props;
const described = (q: { key: string; help?: string }) =>
  q.help ? `${q.key}-help` : undefined;
---
<form
  method="POST"
  action="/api/questionnaire"
  enctype="multipart/form-data"
  class="questionnaire"
  data-form={definition.form}
  data-slug={slug}
>
  <input type="hidden" name="form" value={definition.form} />
  <input type="hidden" name="formVersion" value={definition.formVersion} />
  <input type="hidden" name="c" value={slug} />
  <input type="hidden" name="t" value={token} />
  <p class="hidden-field">
    <label>Don't fill this out: <input name="bot-field" /></label>
  </p>

  {definition.sections.map((s) => (
    <fieldset>
      <legend>{s.legend}</legend>
      {s.help && <p class="section-help">{s.help}</p>}

      {s.questions.map((q) => (
        <div class="field">
          {q.type === 'checkboxes' || q.type === 'openChecklist' || q.type === 'choice' || q.type === 'demoPick' ? (
            <fieldset class="group" aria-describedby={described(q)}>
              <legend class="group-legend">
                {q.label}
                {q.required && <span class="field-hint">Required</span>}
              </legend>
              {q.help && <p class="field-hint" id={`${q.key}-help`}>{q.help}</p>}

              {q.type === 'demoPick'
                ? [...directions.map((d) => ({ value: d.id, text: `Demo ${d.number}` })),
                   { value: 'mix', text: 'A mix of several' }].map((o) => (
                    <label class="option">
                      <input type="radio" name={q.key} value={o.value} required={q.required} />
                      <span>{o.text}</span>
                    </label>
                  ))
                : (q.options ?? []).map((o) => (
                    <label class="option">
                      <input
                        type={q.type === 'choice' ? 'radio' : 'checkbox'}
                        name={q.key}
                        value={o}
                      />
                      <span>{o}</span>
                    </label>
                  ))}

              {q.type === 'openChecklist' && (
                <label class="option own">
                  <span>Something else</span>
                  <input type="text" name={`${q.key}__own`} autocomplete="off" />
                </label>
              )}
            </fieldset>
          ) : (
            <label>
              <span class="field-label">
                {q.label}
                {q.required && <span class="field-hint">Required</span>}
              </span>
              {q.help && <span class="field-hint" id={`${q.key}-help`}>{q.help}</span>}
              {q.type === 'paragraph' && (
                <textarea name={q.key} rows="4" required={q.required} aria-describedby={described(q)} />
              )}
              {q.type === 'short' && (
                <input type="text" name={q.key} required={q.required} aria-describedby={described(q)} />
              )}
              {q.type === 'file' && (
                <input type="file" name={q.key} aria-describedby={described(q)} />
              )}
            </label>
          )}
        </div>
      ))}
    </fieldset>
  ))}

  <button type="submit" class="btn">Send</button>
</form>
```

Add to `src/styles/global.css`, following the existing custom-property names:

```css
.questionnaire fieldset { border: 0; padding: 0; margin: 0 0 var(--space-5); }
.questionnaire legend { font-size: var(--step-1); margin-bottom: var(--space-2); }
.questionnaire .group { border: 1px solid var(--rule); padding: var(--space-3); }
.questionnaire .group-legend { font-size: var(--step-0); padding: 0 var(--space-1); }
.questionnaire .section-help { color: var(--muted); margin-bottom: var(--space-3); }
.questionnaire .option { display: flex; gap: var(--space-1); align-items: baseline; }
.questionnaire .option.own { margin-top: var(--space-2); }
.questionnaire .field { margin-bottom: var(--space-4); }
.questionnaire .field-label { display: block; }
```

- [ ] **Step 4: Hold**

The component cannot render until Task 7 creates the pages. Do not run the gate again here.

- [ ] **Step 5: Commit**

```bash
git add src/components/Questionnaire.astro src/styles/global.css scripts/verify.mjs
git commit -m "Add the Questionnaire component"
```

---

## Task 7: Pages, routing, headers, and the gate

**Repository:** keepsite

**Files:**
- Create: `src/pages/questionnaire/intro.astro`, `brand.astro`, `build.astro`, `thanks.astro`
- Modify: `astro.config.mjs`
- Modify: `public/robots.txt`
- Modify: `netlify.toml`
- Modify: `scripts/verify.mjs`

**Interfaces:**
- Consumes: `Questionnaire.astro` from Task 6, the definitions from Task 5.
- Produces: four routes, `/questionnaire/{intro,brand,build}/` and `/questionnaire/thanks/`. Each questionnaire page reads `c` and `t` from the query string client-side and writes them into the form's hidden fields, because the pages are statically rendered and the token is per-client.

- [ ] **Step 1: Extend the failing checks**

In `scripts/verify.mjs`, add the four routes to `PAGES`:

```js
const PAGES = [
  'index.html',
  'packages/index.html',
  'how-it-works/index.html',
  'faq/index.html',
  'start/index.html',
  'start/thanks/index.html',
  'questionnaire/intro/index.html',
  'questionnaire/brand/index.html',
  'questionnaire/build/index.html',
  'questionnaire/thanks/index.html',
  '404.html',
];
```

Update the "noindex only on 404 and thanks" check — the questionnaire routes carry a meta noindex as well as the header:

```js
check('noindex on 404, thanks, and every questionnaire route', () => {
  for (const p of PAGES) {
    const has = read(p).includes('noindex,follow');
    const should = p === '404.html' || p.endsWith('thanks/index.html') || p.startsWith('questionnaire/');
    if (has !== should) throw new Error(`${p} noindex=${has}, expected ${should}`);
  }
});
```

Update the JavaScript budget map, adding one entry per new route. The three questionnaire pages carry two scripts each — the JSON-LD the layout emits, plus one inline script for token capture and save-and-resume (Task 11):

```js
    'questionnaire/intro/index.html': 2,
    'questionnaire/brand/index.html': 2,
    'questionnaire/build/index.html': 2,
    'questionnaire/thanks/index.html': 1,
```

- [ ] **Step 2: Run the gate to verify it fails**

Run: `npm run gate`
Expected: FAIL at "every expected route is emitted", naming `questionnaire/intro/index.html`.

- [ ] **Step 3: Write the pages**

Create `src/pages/questionnaire/build.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import Questionnaire from '../../components/Questionnaire.astro';
import definition from '../../data/questionnaires/build.json';
---
<BaseLayout title={`${definition.title} | Keepsite Media`} description={definition.lead} noindex>
  <section class="section">
    <div class="container narrow">
      <h1>{definition.title}</h1>
      <p class="lead">{definition.lead}</p>
      <p class="muted">Your answers save as you go. You can close this and come back.</p>
      <Questionnaire definition={definition} slug="" token="" />
    </div>
  </section>
</BaseLayout>
```

`intro.astro` is the same with `intro.json` and no save-note. `brand.astro` is the same with `brand.json`, plus the directions read in Task 9.

Create `src/pages/questionnaire/thanks.astro` modelled on `src/pages/start/thanks.astro`.

If `BaseLayout.astro` has no `noindex` prop, add one following how `404.astro` and `start/thanks.astro` currently emit `noindex,follow`.

- [ ] **Step 4: Wire routing and headers**

`astro.config.mjs` — exclude the new routes from the sitemap:

```js
filter: (page) =>
  !page.includes('/start/thanks') &&
  !page.includes('/404') &&
  !page.includes('/questionnaire/'),
```

`public/robots.txt` — add `Disallow: /questionnaire/` after the `/demo/` line.

`netlify.toml` — add the API rewrite above the existing redirects:

```toml
[[redirects]]
  from = "/api/questionnaire"
  to = "/.netlify/functions/questionnaire"
  status = 200
```

Add a headers block for the new routes, modelled on the `/demo/*` one:

```toml
# Client questionnaires. Reachable only with a signed token, and never
# indexed: the pages are static, so the host serves the HTML to anyone with
# the URL and it is the submission that is gated.
[[headers]]
  for = "/questionnaire/*"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
```

Add three Lighthouse audit blocks, one per questionnaire route, copying the thresholds used by the existing five:

```toml
  [[plugins.inputs.audits]]
    path = "questionnaire/build/index.html"
    output_path = "reports/lighthouse-questionnaire-build.html"
    [plugins.inputs.audits.thresholds]
      performance = 0.95
      accessibility = 1.0
      best-practices = 0.9
      seo = 1.0
```

`accessibility = 1.0` on a thirty-nine question form is the point of this block, not an accident. If it fails, fix the markup rather than the threshold.

- [ ] **Step 5: Run the gate**

Run: `npm run gate`
Expected: PASS, including the new Questionnaires section from Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/pages/questionnaire/ src/layouts/ astro.config.mjs public/robots.txt netlify.toml scripts/verify.mjs
git commit -m "Add the questionnaire routes"
```

---

## Task 8: Tokens

**Repository:** keepsite

**Files:**
- Create: `netlify/functions/lib/token.mjs`
- Create: `netlify/functions/lib/token.test.mjs`
- Create: `scripts/mint-token.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mint(secret, slug, form) -> string` — base64url of the first 16 bytes of `HMAC-SHA256(secret, "<slug>:<form>")`.
  - `verify(secret, slug, form, token) -> boolean` — constant-time compare, `false` on any malformed input rather than throwing.

- [ ] **Step 1: Write the failing test**

Create `netlify/functions/lib/token.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mint, verify } from './token.mjs';

const SECRET = 'test-secret';

test('a minted token verifies', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify(SECRET, 'lova-content-creation', 'build', t), true);
});

test('a token is bound to its slug', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify(SECRET, 'makeup-by-brynlie', 'build', t), false);
});

test('a token is bound to its form', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify(SECRET, 'lova-content-creation', 'brand', t), false);
});

test('a tampered token fails', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  const bad = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
  assert.equal(verify(SECRET, 'lova-content-creation', 'build', bad), false);
});

test('a different secret fails', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify('other-secret', 'lova-content-creation', 'build', t), false);
});

test('malformed input returns false rather than throwing', () => {
  for (const bad of [undefined, null, '', 'not-base64!!', 'AAAA']) {
    assert.equal(verify(SECRET, 'lova-content-creation', 'build', bad), false);
  }
});

test('tokens are url-safe', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(encodeURIComponent(t), t);
});
```

Add to `package.json` scripts: `"test": "node --test"`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `./token.mjs`.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/token.mjs`:

```js
// A client's questionnaire link carries a token derived from their slug, not
// registered against a list. Nothing to maintain and no deploy per client; the
// cost is that a token cannot be revoked on its own. Rotating
// KEEPSITE_TOKEN_SECRET invalidates every outstanding link at once, and the
// blast radius of one leaked token is one client's intake file.
import { createHmac, timingSafeEqual } from 'node:crypto';

const LENGTH = 16;

export function mint(secret, slug, form) {
  return createHmac('sha256', secret)
    .update(`${slug}:${form}`)
    .digest()
    .subarray(0, LENGTH)
    .toString('base64url');
}

export function verify(secret, slug, form, token) {
  if (typeof token !== 'string' || !token) return false;
  const given = Buffer.from(token, 'base64url');
  if (given.length !== LENGTH) return false;
  return timingSafeEqual(given, Buffer.from(mint(secret, slug, form), 'base64url'));
}
```

`Buffer.from(s, 'base64url')` never throws on bad input — it returns whatever it could decode — so the length check is what rejects `'not-base64!!'` and `'AAAA'`.

- [ ] **Step 4: Run the test**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the minting script**

Create `scripts/mint-token.mjs`:

```js
#!/usr/bin/env node
// Prints a client's three questionnaire links. Run when the agreement is
// signed, alongside creating their Drive folder.
//
//   KEEPSITE_TOKEN_SECRET=... node scripts/mint-token.mjs lova-content-creation
import { mint } from '../netlify/functions/lib/token.mjs';

const SITE = 'https://www.keepsitemedia.com';
const slug = process.argv[2];
const secret = process.env.KEEPSITE_TOKEN_SECRET;

if (!slug || !secret) {
  console.error('usage: KEEPSITE_TOKEN_SECRET=... node scripts/mint-token.mjs <slug>');
  process.exit(1);
}

for (const form of ['intro', 'brand', 'build']) {
  console.log(`${form.padEnd(6)} ${SITE}/questionnaire/${form}/?c=${slug}&t=${mint(secret, slug, form)}`);
}
```

- [ ] **Step 6: Check it runs**

Run: `KEEPSITE_TOKEN_SECRET=test node scripts/mint-token.mjs lova-content-creation`
Expected: three URLs, one per form, each with a different `t`.

The spec mentions an optional `--drive` flag that would create the client's Drive folder here. It is deliberately not built: at current client volume the folder takes five seconds to make by hand, and building it would pull a Google credential into this repo for no gain. Make the folder manually when you run this script, and paste its link into the email carrying these URLs.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/token.mjs netlify/functions/lib/token.test.mjs scripts/mint-token.mjs package.json
git commit -m "Add questionnaire access tokens"
```

---

## Task 9: Answer validation and the demo pick

**Repository:** keepsite

**Files:**
- Create: `netlify/functions/lib/validate.mjs`
- Create: `netlify/functions/lib/validate.test.mjs`
- Modify: `src/pages/questionnaire/brand.astro`
- Modify: `scripts/verify.mjs`

**Interfaces:**
- Consumes: a definition from Task 5.
- Produces: `validate(definition, entries) -> { answers, errors }`. `entries` is an array of `[name, value]` pairs, as `FormData.entries()` yields them. `answers` is the object that goes into the submission envelope; `errors` is an array of strings, empty when the submission is good.

- [ ] **Step 1: Write the failing test**

Create `netlify/functions/lib/validate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './validate.mjs';

const def = {
  formVersion: '2026-09-03',
  form: 'build',
  sections: [
    {
      legend: 'Test',
      questions: [
        { key: 'whatWeDo', label: 'What?', type: 'paragraph', required: true },
        { key: 'pages', label: 'Pages?', type: 'checkboxes', options: ['Home', 'About'] },
        { key: 'primaryAction', label: 'Action?', type: 'choice', options: ['Call', 'Email'] },
        { key: 'feelWanted', label: 'Feel?', type: 'openChecklist', options: ['Warm', 'Bold'] },
      ],
    },
  ],
};

test('a good submission produces the answers object', () => {
  const { answers, errors } = validate(def, [
    ['whatWeDo', 'We do things.'],
    ['pages', 'Home'],
    ['pages', 'About'],
    ['primaryAction', 'Call'],
  ]);
  assert.deepEqual(errors, []);
  assert.equal(answers.whatWeDo, 'We do things.');
  assert.deepEqual(answers.pages, ['Home', 'About']);
  assert.equal(answers.primaryAction, 'Call');
});

test('unknown keys are rejected', () => {
  const { errors } = validate(def, [['whatWeDo', 'x'], ['sneaky', 'y']]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sneaky/);
});

test('a choice outside its options is rejected', () => {
  const { errors } = validate(def, [['whatWeDo', 'x'], ['primaryAction', 'Fax']]);
  assert.match(errors[0], /primaryAction/);
});

test('a checkbox outside its options is rejected', () => {
  const { errors } = validate(def, [['whatWeDo', 'x'], ['pages', 'Nope']]);
  assert.match(errors[0], /pages/);
});

test('an openChecklist accepts an unlisted value', () => {
  const { answers, errors } = validate(def, [
    ['whatWeDo', 'x'],
    ['feelWanted', 'Warm'],
    ['feelWanted__own', 'Empowering'],
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(answers.feelWanted, ['Warm', 'Empowering']);
});

test('a missing required answer is rejected', () => {
  const { errors } = validate(def, [['pages', 'Home']]);
  assert.match(errors[0], /whatWeDo/);
});

test('optional questions absent from the submission come back empty', () => {
  const { answers } = validate(def, [['whatWeDo', 'x']]);
  assert.equal(answers.primaryAction, '');
  assert.deepEqual(answers.pages, []);
});

test('the honeypot and transport fields are ignored, not rejected', () => {
  const { errors } = validate(def, [
    ['whatWeDo', 'x'],
    ['bot-field', ''],
    ['form', 'build'],
    ['formVersion', '2026-09-03'],
    ['c', 'lova'],
    ['t', 'abc'],
  ]);
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `./validate.mjs`.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/validate.mjs`:

```js
// Validates a submission against the same definition that rendered it. The
// option lists are the source of truth for both, so a value outside them is a
// tampered submission rather than a wording drift.

const TRANSPORT = new Set(['bot-field', 'form', 'formVersion', 'c', 't']);
const MULTI = new Set(['checkboxes', 'openChecklist']);
const OWN = '__own';

const questionsOf = (definition) =>
  definition.sections.flatMap((s) => s.questions);

export function validate(definition, entries) {
  const questions = questionsOf(definition);
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const errors = [];
  const raw = new Map();

  for (const [name, value] of entries) {
    if (TRANSPORT.has(name)) continue;
    const key = name.endsWith(OWN) ? name.slice(0, -OWN.length) : name;
    const q = byKey.get(key);
    if (!q) {
      errors.push(`unknown field: ${name}`);
      continue;
    }
    if (name.endsWith(OWN) && q.type !== 'openChecklist') {
      errors.push(`unknown field: ${name}`);
      continue;
    }
    if (!raw.has(name)) raw.set(name, []);
    raw.get(name).push(typeof value === 'string' ? value.trim() : value);
  }

  const answers = {};
  for (const q of questions) {
    const given = raw.get(q.key) ?? [];

    if (MULTI.has(q.type)) {
      // Both types validate their checkboxes against the option list. The
      // difference is that openChecklist also accepts a typed-in value through
      // the paired __own field, which by definition is not on the list.
      const listed = given.filter(Boolean);
      const own = (raw.get(q.key + OWN) ?? []).filter(Boolean);
      for (const v of listed) {
        if (!q.options.includes(v)) errors.push(`${q.key}: "${v}" is not an option`);
      }
      answers[q.key] = [...listed, ...own];
    } else if (q.type === 'choice') {
      const v = given[0] ?? '';
      if (v && !q.options.includes(v)) errors.push(`${q.key}: "${v}" is not an option`);
      answers[q.key] = v;
    } else if (q.type === 'demoPick') {
      answers[q.key] = given[0] === 'mix' ? null : (given[0] ?? null);
    } else {
      answers[q.key] = given[0] ?? '';
    }

    const empty = Array.isArray(answers[q.key])
      ? answers[q.key].length === 0
      : !answers[q.key];
    if (q.required && empty) errors.push(`${q.key}: required`);
  }

  return { answers, errors };
}
```

- [ ] **Step 4: Run the test**

Run: `npm test`
Expected: PASS, 8 validate tests plus the 7 token tests.

- [ ] **Step 5: Render the demo pick from the client's own demo**

The brand form's `pick` question is `type: "demoPick"`, and its options come from the client's demo file rather than from the definition. `readDirections` in keepsite-skills does this by regex, but the Astro page only needs the count and the ids.

In `src/pages/questionnaire/brand.astro`:

```astro
---
import fs from 'node:fs';
import path from 'node:path';
import BaseLayout from '../../layouts/BaseLayout.astro';
import Questionnaire from '../../components/Questionnaire.astro';
import definition from '../../data/questionnaires/brand.json';

// Every published demo, so one static page can serve any client: the page
// reads ?c= at runtime and shows that client's four directions.
const demos = Object.fromEntries(
  fs.readdirSync('public/demo', { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const html = fs.readFileSync(path.join('public/demo', e.name, 'index.html'), 'utf8');
      const ids = [...html.matchAll(/<section class="direction-divider">[\s\S]*?<section\b[^>]*\bid="([^"]+)"/g)]
        .map((m, i) => ({ number: i + 1, id: m[1] }));
      return [e.name, ids];
    }),
);
---
<BaseLayout title={`${definition.title} | Keepsite Media`} description={definition.lead} noindex>
  <section class="section">
    <div class="container narrow">
      <h1>{definition.title}</h1>
      <p class="lead">{definition.lead}</p>
      <script type="application/json" id="demos" set:html={JSON.stringify(demos)} />
      <Questionnaire definition={definition} slug="" token="" directions={[]} />
    </div>
  </section>
</BaseLayout>
```

The inline script from Task 11 reads `#demos`, picks the entry matching `?c=`, and fills the radio group.

Add to `scripts/verify.mjs`, in the Questionnaires section:

```js
check('the brand form ships a demo index for every published demo', () => {
  const html = read('questionnaire/brand/index.html');
  const m = html.match(/<script type="application\/json" id="demos">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no demo index');
  const demos = JSON.parse(m[1]);
  for (const dir of fs.readdirSync(path.join('public', 'demo'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    if (!demos[dir.name]) throw new Error(`demo index omits ${dir.name}`);
    if (demos[dir.name].length !== 4) throw new Error(`${dir.name} parsed ${demos[dir.name].length} directions`);
  }
});
```

Note this adds a third script tag to `questionnaire/brand/index.html` — update that entry in the JavaScript budget map from `2` to `3`.

- [ ] **Step 6: Run the gate**

Run: `npm run gate && npm test`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/validate.mjs netlify/functions/lib/validate.test.mjs src/pages/questionnaire/brand.astro scripts/verify.mjs
git commit -m "Validate questionnaire answers against their definition"
```

---

## Task 10: The submission function

**Repository:** keepsite

**Files:**
- Create: `netlify/functions/questionnaire.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `verify` (Task 8), `validate` (Task 9), the definitions (Task 5).
- Produces: `POST /api/questionnaire`. 302 to `/questionnaire/thanks/` on success; 403 on a bad token; 400 on validation errors.

Order matters: Blobs first, then email. Blobs is the durable record and email is the notification. If the send fails after the client has submitted, the answers still exist — losing forty answers at the submit button is the one failure that costs real goodwill.

- [ ] **Step 1: Add the dependency**

```bash
npm install @netlify/blobs
```

Set in Netlify's UI, or via `netlify env:set`: `KEEPSITE_TOKEN_SECRET`, `RESEND_API_KEY`, `KEEPSITE_NOTIFY_TO`, `KEEPSITE_NOTIFY_FROM`.

- [ ] **Step 2: Write the function**

Create `netlify/functions/questionnaire.mjs`:

```js
// One endpoint for all three questionnaires.
//
// Blobs before email, deliberately: Blobs is the durable record and the email
// is the notification. A send that fails after the client has hit submit must
// not lose forty answers.
import { getStore } from '@netlify/blobs';
import { verify } from './lib/token.mjs';
import { validate } from './lib/validate.mjs';
import intro from '../../src/data/questionnaires/intro.json' with { type: 'json' };
import brand from '../../src/data/questionnaires/brand.json' with { type: 'json' };
import build from '../../src/data/questionnaires/build.json' with { type: 'json' };

const DEFINITIONS = { intro, brand, build };
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILE_KEYS = new Set(['logo', 'brandGuide']);

const redirect = (to) => new Response(null, { status: 302, headers: { Location: to } });
const problem = (status, body) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

async function notify(envelope) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const body = JSON.stringify(envelope, null, 2);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.KEEPSITE_NOTIFY_FROM,
      to: process.env.KEEPSITE_NOTIFY_TO,
      subject: `${envelope.slug} — ${envelope.form} questionnaire`,
      text: `${envelope.slug} submitted the ${envelope.form} questionnaire.`,
      attachments: [
        {
          filename: `${envelope.form}.json`,
          content: Buffer.from(body).toString('base64'),
        },
      ],
    }),
  });
}

export default async (request) => {
  if (request.method !== 'POST') return problem(405, 'POST only');

  const data = await request.formData();
  if (data.get('bot-field')) return redirect('/questionnaire/thanks/');

  const slug = String(data.get('c') ?? '');
  const form = String(data.get('form') ?? '');
  const definition = DEFINITIONS[form];
  if (!definition || !SLUG.test(slug)) return problem(403, 'no');

  const secret = process.env.KEEPSITE_TOKEN_SECRET;
  if (!secret || !verify(secret, slug, form, String(data.get('t') ?? ''))) {
    return problem(403, 'no');
  }

  const files = [];
  const store = getStore('questionnaires');
  for (const key of FILE_KEYS) {
    const file = data.get(key);
    if (!file || typeof file === 'string' || file.size === 0) continue;
    const at = `${slug}/${key}-${file.name}`;
    await store.set(at, await file.arrayBuffer());
    files.push({ key, name: file.name, size: file.size, at });
  }

  const entries = [...data.entries()].filter(([, v]) => typeof v === 'string');
  const { answers, errors } = validate(definition, entries);
  if (errors.length) return problem(400, errors.join('\n'));

  const envelope = {
    formVersion: definition.formVersion,
    slug,
    form,
    submittedAt: new Date().toISOString(),
    answers,
    files,
  };

  await store.setJSON(`${slug}/${form}.json`, envelope);
  await notify(envelope);

  return redirect('/questionnaire/thanks/');
};
```

The `FILE_KEYS` set is the whole of the upload surface: a logo and a brand guide, both small. Photos are not accepted here — a Netlify Function request body caps at about 6MB, and the questionnaire links the client's Drive folder for those instead.

Files are stored before validation runs so a validation failure does not lose an upload the client already waited on. The tradeoff is orphaned blobs on a rejected submission, which is the cheaper of the two.

- [ ] **Step 3: Test it locally**

Run: `npx netlify dev`

In a second shell:

```bash
TOKEN=$(KEEPSITE_TOKEN_SECRET=test node -e "import('./netlify/functions/lib/token.mjs').then(m=>console.log(m.mint('test','testco','intro')))")
curl -i -X POST http://localhost:8888/api/questionnaire \
  -F "form=intro" -F "c=testco" -F "t=$TOKEN" \
  -F "name=Test" -F "email=t@example.com" -F "business=Test Co" \
  -F "whatWeDo=We test things."
```

Expected: `HTTP/1.1 302` with `Location: /questionnaire/thanks/`.

Then confirm rejection:

```bash
curl -i -X POST http://localhost:8888/api/questionnaire \
  -F "form=intro" -F "c=testco" -F "t=wrong" -F "name=Test"
```

Expected: `HTTP/1.1 403`.

- [ ] **Step 4: Confirm the stored envelope is one the skill can read**

`netlify dev` writes Blobs to `.netlify/blobs-serve/`. Find the intro submission from Step 3, copy it into a scratch intake directory alongside a `build.json`, and run the reader:

```bash
mkdir -p /tmp/testco-intake
find .netlify -name '*.json' -path '*questionnaires*' -exec cp {} /tmp/testco-intake/brand.json \;
cp /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/fixtures/e2e/build.json /tmp/testco-intake/
node /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/lib/read-intake-cli.mjs \
  /tmp/testco-intake \
  /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/fixtures/demo-sample.html
```

Expected: JSON, no error, `versionMismatch: []`. This is the round trip that matters — the function's output is the reader's input, and the two were written in different repositories against a shape described in prose. If the reader rejects it, the envelope is wrong, not the reader.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/questionnaire.mjs package.json package-lock.json
git commit -m "Add the questionnaire submission endpoint"
```

---

## Task 11: Token capture, save and resume, open checklists

**Repository:** keepsite

**Files:**
- Create: `src/scripts/questionnaire.js`
- Modify: `src/pages/questionnaire/intro.astro`, `brand.astro`, `build.astro`
- Modify: `scripts/verify.mjs`

**Interfaces:**
- Consumes: the rendered form from Task 6, the `#demos` JSON from Task 9.
- Produces: no exports. One inline script per questionnaire page.

Three jobs, one script, because they all key off the same `?c=` and all three pages need all three. The build questionnaire is thirty-nine questions and nobody finishes it in one sitting; losing an hour of work to a closed tab is the failure that loses a client's patience.

- [ ] **Step 1: Extend the failing check**

In `scripts/verify.mjs`, in the Questionnaires section:

```js
check('every questionnaire page carries the resume script', () => {
  for (const form of ['intro', 'brand', 'build']) {
    const html = read(`questionnaire/${form}/index.html`);
    if (!html.includes('keepsite:questionnaire:')) {
      throw new Error(`${form} has no localStorage key`);
    }
  }
});
```

- [ ] **Step 2: Run the gate to verify it fails**

Run: `npm run gate`
Expected: FAIL — "intro has no localStorage key".

- [ ] **Step 3: Write the script**

Create `src/scripts/questionnaire.js`, imported by each page with `<script>import '../../scripts/questionnaire.js';</script>`:

```js
// The pages are static and the token is per client, so ?c= and ?t= are read
// here and written into the form's hidden fields. Without them the submission
// is refused, which is the intended behaviour for anyone who found the URL.
(function () {
  var form = document.querySelector('.questionnaire');
  if (!form) return;

  var params = new URLSearchParams(window.location.search);
  var slug = params.get('c') || '';
  var token = params.get('t') || '';
  form.querySelector('input[name="c"]').value = slug;
  form.querySelector('input[name="t"]').value = token;
  form.dataset.slug = slug;

  var demos = document.getElementById('demos');
  if (demos) {
    var group = form.querySelector('input[name="pick"]');
    var list = JSON.parse(demos.textContent)[slug];
    if (group && list) {
      var container = group.closest('fieldset');
      container.querySelectorAll('.option').forEach(function (el) { el.remove(); });
      list.concat([{ number: null, id: 'mix' }]).forEach(function (d) {
        var label = document.createElement('label');
        label.className = 'option';
        label.innerHTML =
          '<input type="radio" name="pick" value="' + d.id + '"><span>' +
          (d.number ? 'Demo ' + d.number : 'A mix of several') + '</span>';
        container.appendChild(label);
      });
    }
  }

  var key = 'keepsite:questionnaire:' + form.dataset.form + ':' + slug;

  try {
    var saved = JSON.parse(window.localStorage.getItem(key) || '{}');
    Object.keys(saved).forEach(function (name) {
      form.querySelectorAll('[name="' + name + '"]').forEach(function (el) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = saved[name].indexOf(el.value) !== -1;
        } else if (el.type !== 'file') {
          el.value = saved[name][0] || '';
        }
      });
    });
  } catch (e) { /* a cleared or unavailable store is not an error */ }

  var pending;
  form.addEventListener('input', function () {
    window.clearTimeout(pending);
    pending = window.setTimeout(function () {
      var out = {};
      new FormData(form).forEach(function (value, name) {
        if (typeof value !== 'string') return;
        (out[name] = out[name] || []).push(value);
      });
      try { window.localStorage.setItem(key, JSON.stringify(out)); } catch (e) { /* full or blocked */ }
    }, 400);
  });

  form.addEventListener('submit', function () {
    try { window.localStorage.removeItem(key); } catch (e) { /* nothing to clear */ }
  });
})();
```

- [ ] **Step 4: Run the gate**

Run: `npm run gate`
Expected: PASS. If the JavaScript budget check fails, the counts in Task 7 Step 1 and Task 9 Step 5 need adjusting to match what Astro actually emitted — read the error and set them to the observed numbers.

- [ ] **Step 5: Check it by hand**

Run: `npm run dev`, open
`http://localhost:4321/questionnaire/build/?c=lova-content-creation&t=anything`,
type into three fields, reload, and confirm they come back. Open the brand form with the same `?c=` and confirm the demo radios name four directions plus "A mix of several".

- [ ] **Step 6: Commit**

```bash
git add src/scripts/questionnaire.js src/pages/questionnaire/ scripts/verify.mjs
git commit -m "Capture the token and resume unfinished questionnaires"
```

---

## Task 12: Process copy

**Repository:** keepsite

**Files:**
- Modify: `src/data/process.json:9-12`
- Modify: `src/data/faq.json:19,29`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Copy only.

`process.json` step 1 currently reads "One questionnaire covers it. We ask for everything we need in one pass, so you're not answering questions in dribs and drabs for three weeks." Three questionnaires run, and two of them arrive after the client has picked a direction — build Q18 says "Think about the homepage direction you already selected."

- [ ] **Step 1: Rewrite step 1**

In `src/data/process.json`, the first entry of `steps`:

```json
{
  "title": "Tell us about your business.",
  "body": "Seven questions, and we already have half the answers from your enquiry. That is everything we need to put four designs in front of you."
}
```

- [ ] **Step 2: Move the one-pass claim to step 3**

The fourth entry of `steps` currently reads "We add your words and photos." Leave it. Instead extend the second entry, "Pick a direction.", so the fuller questionnaire is where the client expects it:

```json
{
  "title": "Pick a direction.",
  "body": "We send you one page with four different home page designs on it. You pick the direction that looks like your business, and then answer the longer questionnaire in one pass — it is the only homework in the whole process. On Search and Search Plus, keyword research runs at the same time and shapes what comes next."
}
```

- [ ] **Step 3: Check the FAQ for the same drift**

`src/data/faq.json:19` says "after we have your questionnaire and your content" and `:29` says "Everything else runs on one questionnaire and email." Change `:29` to "Everything else runs on the questionnaires and email." Leave `:19` — "your questionnaire" reads correctly either way.

- [ ] **Step 4: Run the gate**

Run: `npm run gate`
Expected: PASS. `verify.mjs` checks that FAQ answers stay in the plural voice and that no retired route is linked; neither is touched here.

- [ ] **Step 5: Commit**

```bash
git add src/data/process.json src/data/faq.json
git commit -m "Describe the questionnaires the way they actually run"
```

---

## Task 13: Convert the in-flight client

**Repository:** both

**Files:**
- Create: `makeup-by-brynlie/intake/brand.json`, `makeup-by-brynlie/intake/build.json`
- Delete: `makeup-by-brynlie/intake/demo-feedback.csv`, `makeup-by-brynlie/intake/build.csv`

**Interfaces:**
- Consumes: `lib/csv-to-json.mjs` from Task 2.
- Produces: nothing. Data migration.

Do this last, after the reader is proven, and only once. Brynlie's build is in progress.

- [ ] **Step 1: Convert**

From the workspace root `/mnt/c/Users/Snic9/keepsitemedia/`:

```bash
git -C keepsite-skills stash list  # confirm a clean tree first
node keepsite-skills/lib/csv-to-json.mjs \
  makeup-by-brynlie/intake \
  keepsite/public/demo/makeup-by-brynlie/index.html
```

Expected: writes `brand.json` and `build.json`.

- [ ] **Step 2: Confirm the skill still reads her intake**

```bash
node keepsite-skills/lib/read-intake-cli.mjs \
  makeup-by-brynlie/intake \
  keepsite/public/demo/makeup-by-brynlie/index.html
```

Expected: JSON with a non-null `direction`, `versionMismatch: []`, and a `build.blank` list. Compare `build.pages` and `build.features` against `makeup-by-brynlie/intake/brief.md` — the brief was derived from the CSVs, so the values must agree. A difference here means the migration lost something and Task 2 needs fixing before going further.

- [ ] **Step 3: Remove the CSVs**

```bash
cd makeup-by-brynlie
git rm intake/demo-feedback.csv intake/build.csv
git rm KeepsiteDemoFeedbackandBrandQuestionnaire.csv KeepsiteSearchPackageInitialBuildQuestionnaire.csv
git add intake/brand.json intake/build.json
git commit -m "Convert intake to JSON submissions"
```

- [ ] **Step 4: Retire the migration script**

Back in keepsite-skills, once no client has CSVs left:

```bash
git rm lib/csv-to-json.mjs lib/csv-to-json.test.mjs
git commit -m "Retire the CSV migration"
```

Keep this step unchecked until every in-flight client is converted. If another client is mid-build when this plan runs, convert them first.

---

# Appendix: verbatim question text

Source of truth for Task 5. Question text is transcribed from the live forms; where the Sheets export glued a section heading onto a question, the split is shown. `key` values match what `read-intake-cli.mjs` produces — do not rename them.

## intro.json — 7 questions, 1 section

Title: "Tell us about your business". Lead: "Seven questions, and we already have some of the answers. Correct anything that has changed."

Section legend: "Your business"

| key | label | type | required |
|---|---|---|---|
| `name` | Your name | short | yes |
| `email` | Email | short | yes |
| `business` | Business name | short | yes |
| `whatWeDo` | What does your business do? | paragraph | yes |
| `attract` | Who do you want to attract? | paragraph | yes |
| `feelWanted` | Pick three words for how your website should feel | openChecklist (`FEEL_WORDS`) | no |
| `existingBrand` | Do you already have a website or branding? | paragraph | no |

`existingBrand` help: "A link is enough. If you have a logo or brand guide, there is a place to upload them after you have seen your designs."

`feelWanted` help: "Pick from these or type your own."

## brand.json — 14 questions, 4 sections

Title: "Your designs". Lead: "You have seen four directions. Tell us which one fits and how it should feel."

**Section: Your demo**

| key | label | type |
|---|---|---|
| `pick` | Which demo feels closest to your business overall? | demoPick |
| `like1` | Demo 1 — what do you like? What would you change or leave behind? | paragraph |
| `like2` | Demo 2 — what do you like? What would you change or leave behind? | paragraph |
| `like3` | Demo 3 — what do you like? What would you change or leave behind? | paragraph |
| `like4` | Demo 4 — what do you like? What would you change or leave behind? | paragraph |
| `keeps` | Are there any specific sections you definitely want to keep as is from any of the demos? | paragraph |

`keeps` help: "Please indicate the section and demo. A section can be labeled by the content in it. For example: the very first section from Demo 2, services section Demo 4, and Colors from Demo 3"

The form asks four separate `like` questions and stores them as four keys. `readAll` assembles them into the `likes` array the brief reads (Task 3 Step 8), and `convert` splits the old array back into four keys (Task 2 Step 3), so both paths write the same shape.

**Section: How it should feel**

| key | label | type |
|---|---|---|
| `feelWanted` | Which words best describe how you want your website to feel? | openChecklist (`FEEL_WORDS`) |
| `feelRefused` | Which words do NOT describe how you want your website to feel? | openChecklist (`FEEL_WORDS`) |
| `visitorFeeling` | When someone lands on your website, how do you want them to feel? | paragraph |

`feelWanted` help: "You told us this before your designs — correct it if it has changed."

The Google original reads "how to you want THEM to feel". Fix the typo; drop the shouted THEM.

**Section: Logo and brand**

| key | label | type |
|---|---|---|
| `logo` | Do you currently have a logo? | file |
| `logoFontsColors` | Logo font and colors, if applicable | paragraph |
| `brandGuide` | Do you have a formal brand guide? | file |
| `otherFontsColors` | What other fonts and colors do you use, where and when? | paragraph |

`logo` help: "Upload it here, or give the font name and hex codes in the next box."

`logoFontsColors` help: "Where did you get the font (Canva Pro, for example), when do you use it, what hex code is it, and how else do you use your brand colors — background, buttons, and so on."

`brandGuide` help: "Upload it here, or name the fonts and colors in the next box. If you'd like one, we can recommend a freelance brand designer. That adds one to five weeks, or we can add new branding after launch."

`otherFontsColors` help: "If you liked something used in one of your demos better than what you use now, say so."

**Section: Photos**

| key | label | type |
|---|---|---|
| `photos` | What photos would you like used on your website? | paragraph |

`photos` help: "Your Drive folder is linked in the email with this questionnaire — upload them there and note where you'd like any of them used. If you'd rather see a full demo first, skip this."

The shared Google Photos album URL from the original is deliberately dropped: it was one album for every client.

## build.json — 39 questions, 11 sections

Title: "Keepsite build questionnaire". Lead: "This is the long one, and the only homework in the process. Your answers save as you go, so you can stop and come back."

**Section 1: Your business** — `whatWeDo` (In a sentence or two, what does your business do?, paragraph), `services` (What are the main services, products, or offers you want represented on your website?, paragraph, help "List your top 3–5 if possible."), `grow` (Which of those would you most like to grow?, paragraph), `deprioritise` (Are there any services you offer but don't particularly want to promote or grow?, paragraph), `serviceArea` (Where do you work or serve customers?, paragraph, help "For example: Spanish Fork, Utah County, statewide, nationwide, online, travel-based."), `targetAreas` (Are there specific towns, regions, or areas where you'd especially like more business?, paragraph)

**Section 2: Your customers** — `idealCustomers` (Tell us a little about the customers you love working with. What are they usually looking for when they come to you?, paragraph), `whatMatters` (What tends to matter most to them when choosing a business like yours?, paragraph, help "For example: trust, experience, style, price, convenience, personality, speed, quality, customization, location, expertise."), `repeatQuestions` (What questions do potential customers ask you over and over?, paragraph, help "Think about DMs, emails, calls, consultations, comments, or conversations in person. Even 3–5 questions is incredibly helpful."), `wishUnderstood` (What do you wish potential customers understood before contacting you?, paragraph), `whyChosen` (Why do you think your best customers choose you?, paragraph)

**Section 3: What the site should do** — `primaryAction` (What is the #1 thing you want someone to do after visiting your website?, choice, `ACTION_OPTIONS`), `secondaryAction` (Is there a second action you'd like visitors to take?, choice, `ACTION_OPTIONS`), `firstImpressions` (When someone lands on your website for the first time, what are the most important things you want them to understand about your business?, paragraph, help "Try to choose 3–5."), `pages` (Which pages or areas do you know you want?, checkboxes, `PAGE_OPTIONS`), `ownPageCandidates` (Are there any services, locations, audiences, or specialties you think may deserve their own page?, paragraph, help "A rough guess is fine. We'll also make recommendations based on what people are searching for and how the site should be organized.")

**Section 4: Homepage content** — section help "Think about the homepage direction you already selected. Now tell us what information feels most important to include as someone scrolls." — `homepageSections` (Which sections would you like your homepage to include?, checkboxes, `HOMEPAGE_SECTION_OPTIONS`)

**Section 5: What does your website need to do?** — section help "Think less about how the site looks and more about what would make it useful for you and your customers." — `features` (Which features would be helpful for your business?, checkboxes, `FEATURE_OPTIONS`), `existingTools` (Are you already using any tools we should connect to the website?, paragraph, help "Examples: HoneyBook, Dubsado, Calendly, Acuity, Square, Shopify, Stripe, Mailchimp, Flodesk, ConvertKit, Google Calendar, Eventbrite, another booking, CRM, email, or payment tool. Please include links if helpful.")

**Section 6: Website inspiration** — section help "We already have your overall homepage direction, so this isn't about choosing another design. We're looking for specific ideas you like." — `inspiration` (Are there any websites with a feature, page, section, or interaction you love?, paragraph, help "Paste the link and tell us what you like about it. For example: 'I love how their services are organized.' 'I like how their gallery works.' 'Their booking process feels really easy.'")

**Section 7: Where your material lives** — section help "You do not need to write your website copy yet. For now, we want to know where the best raw material already lives." — `learnMore` (Where can we learn the most about your business?, paragraph, help "Instagram, Facebook, TikTok, Google Business Profile, existing brochures, pricing guides, PDFs, email templates, client guides, proposals, FAQs, a previous website. Please share links where possible."), `signatureContent` (Are there specific Instagram posts, Reels, captions, or other pieces of content that feel especially "you"?, paragraph, help "Paste links here."), `strongResponse` (Are there posts or topics that consistently get a strong response from your audience?, paragraph), `explainedRepeatedly` (Are there things you find yourself explaining to customers again and again?, paragraph), `couldTalkAllDay` (Are there topics you could talk about all day?, paragraph, help "These may become website resources, FAQs, or future blog topics.")

**Section 8: How people find you** — section help "You do not need to know anything about SEO for this section. We're looking for what you already know about your customers." — `searchTerms` (If someone who had never heard of you needed exactly what you offer, what do you think they might type into Google?, paragraph, help "Take a guess. There are no wrong answers."), `customerWords` (What words do your customers use to describe what you do?, paragraph), `jargon` (Are there words you use in your industry that your customers probably wouldn't?, paragraph), `competitors` (Who do you consider similar businesses or competitors?, paragraph, help "They do not have to be direct competitors. Try to list at least 3 with a link to their socials, Google profile, or website."), `findabilityWishes` (Are there particular services, locations, questions, or topics you'd love to be easier to find online for?, paragraph), `underrepresented` (Is there anything about your personality or business that you feel your current online presence does not show well enough?, paragraph)

**Section 9: Why people feel good hiring you** — `confidence` (What helps someone feel confident choosing you?, checkboxes, `CONFIDENCE_OPTIONS`), `reviewLocations` (Where can we find your existing reviews or testimonials?, paragraph), `credentials` (Do you have any awards, certifications, press mentions, partnerships, or credentials we should know about?, paragraph)

**Section 10: Timing and busy seasons** — `importantSeasons` (Are there certain times of year that are especially important for your business?, paragraph), `seasonalServices` (Are there services you want to promote at particular times of year?, paragraph), `upcomingDates` (Do you have any launches, events, busy seasons, booking windows, or important dates coming up?, paragraph)

**Section 11: Last one** — `onethingWell` (If your new website does one thing really well, what do you hope it is?, paragraph), `anythingElse` (Is there anything else you want us to know before we start building?, paragraph, help "You do not need to have everything figured out. Give us what you know now, and we'll keep learning as we build.")

Count: 6 + 5 + 5 + 1 + 2 + 1 + 5 + 6 + 3 + 3 + 2 = 39.

The six option lists (`ACTION_OPTIONS`, `PAGE_OPTIONS`, `HOMEPAGE_SECTION_OPTIONS`, `FEATURE_OPTIONS`, `CONFIDENCE_OPTIONS`, `FEEL_WORDS`) are transcribed verbatim from `keepsite-skills/lib/forms.mjs`, in the order they appear there. Order matters: a brief reads the way the client saw the question.
