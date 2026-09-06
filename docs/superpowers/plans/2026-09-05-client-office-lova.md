# Client Office Phase 6: Second Brand (Lova) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the same repo deploy a second, office-only Netlify site for Lova Content Creation with its own brand, prices, pipeline, emails, questionnaires and agreements, without forking the code.

**Architecture:** Brand-specific content becomes an overlay directory under `brands/` that a prebuild script copies onto the canonical `src/data` paths; Keepsite stays canonical. The office code stops naming Keepsite: brand, legal name, signer and site URL come from `site.json`, agreement templates carry their tier, and questionnaire forms come from a registry module. An `officeOnly` flag in `site.json` shadows the marketing pages with redirects, empties the sitemap and scopes the verify script. The Lova overlay ships with starter content her to edit, and a deploy checklist.

**Tech Stack:** Node 20, Astro 5, Netlify (second site, same account), `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-client-office-design.md` — section "Second deployment: Lova Content Creation", plus "Documents", "Agreements and e-sign", "Secrets".

## Global Constraints

- Node 20; `.mjs` under `netlify/functions/`, tests beside modules as `*.test.mjs`.
- Every office page and route exports `prerender = false`; the middleware guards `/office/`.
- `store.mjs` is the only module that knows key shapes; actions are `(request, ctx) => Response`.
- Secrets keep their `KEEPSITE_*` names on both sites; nothing in code depends on the brand name.
- Keepsite is the canonical content; `brands/keepsite/` does not exist. `node scripts/brand.mjs <brand>` copies `brands/<brand>/` onto canonical paths; `node scripts/brand.mjs reset` runs `git checkout --` on exactly those paths.
- The gate must pass for both brands: `npm run gate` (Keepsite) and `node scripts/brand.mjs lova && npm run gate && node scripts/brand.mjs reset`.
- The three questionnaire forms Keepsite ships (`intro`, `brand`, `build`) keep their ids, URLs and tokens; nothing about live Keepsite links changes.
- Comments explain why, never what. Commit subjects imperative, under 50 characters, ending with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XJwFEcdChiaw23fdcQYygF
  ```

---

### Task 1: Brand identity from `site.json`

**Files:**
- Modify: `src/data/site.json`
- Modify: `netlify/functions/lib/office/context.mjs`, `context.test.mjs`
- Modify: `netlify/functions/lib/office/agreements.mjs` (`keepsiteSigner`, error strings), `agreements.test.mjs`
- Modify: `netlify/functions/lib/office/ics.mjs`, `netlify/functions/lib/office/actions/meeting.mjs`
- Modify: `scripts/mint-token.mjs`
- Modify: `src/layouts/OfficeLayout.astro`, `src/pages/pay/thanks.astro`, `src/pages/pay/cancelled.astro`, `src/pages/sign/index.astro`, `src/pages/office/agreements/[slug]/[id]/sign.astro`, `src/pages/questionnaire/*.astro` (titles)
- Modify: `src/data/office/templates.json` (two literal "Keepsite" → `{{site.brand}}`)
- Modify: `netlify.toml` (`included_files` already ships `site.json`; no change unless a new file is read)

**Interfaces:**
- Produces: `site.json` gains `"url": "https://www.keepsitemedia.com"`, `"signer": "Sam Nichols"` (the person who signs agreements; confirm the name with the user's existing agreements JSON `signatures` block and use that value), `"officeOnly": false`. `siteUrl()` returns `process.env.URL || site.url`. `keepsiteSigner(template)` returns `{ name: template.signatures?.keepsite?.name ?? site.signer, email: site.email }` — read the current implementation first and keep its precedence. `ics.mjs` `PRODID` becomes `-//${site.brand}//Office//EN`; meeting `uid` domain becomes `new URL(siteUrl()).hostname`. Every user-visible "Keepsite" in the office, pay and sign pages becomes `site.brand` (imported from `src/data/site.json`), and the agreement error strings become `` `ask ${site.brand} for a new one` `` / `` `${site.brand} withdrew this version` ``. The internal signer party id `keepsite` stays (it is a key, not copy); `agreement-state.mjs` is untouched.

- [ ] **Step 1: Failing tests**

Append to `context.test.mjs`:

```js
test('siteUrl falls back to site.json, not a hard-coded host', async () => {
  const saved = process.env.URL;
  delete process.env.URL;
  const { siteUrl } = await import('./context.mjs');
  const site = (await import('../../../../src/data/site.json', { with: { type: 'json' } })).default;
  assert.equal(siteUrl(), site.url);
  if (saved) process.env.URL = saved;
});
```

Append to `agreements.test.mjs`:

```js
test('the office signer comes from site.json when the template names nobody', async () => {
  const s = await make();
  const client = await s.clients.get('lova');
  const a = await createAgreement({ client, templateId: 'presence', fields: defaultFields(client, findAgreementTemplate('presence')), admin: { email: 'me@x' } }, s, NOW);
  assert.equal(typeof a.signers.keepsite.name, 'string');
  assert.ok(a.signers.keepsite.name.length > 0);
  assert.equal(a.signers.keepsite.email, site.email);
});
```

(import `site` from `../../../src/data/site.json` with `{ type: 'json' }` at the top of the test file.)

Add to `scripts/check-office.mjs` a static rule: no `.astro` file under `src/pages/office`, `src/pages/sign`, `src/pages/pay`, `src/layouts/OfficeLayout.astro` or `src/components/office` contains the literal `Keepsite` outside a comment, and `src/data/office/templates.json` contains no literal `Keepsite`. Error text: `` `${file}: brand name is hard-coded; use site.brand` ``.

- [ ] **Step 2: Run to see them fail**

Run: `node --test netlify/functions/lib/office/context.test.mjs netlify/functions/lib/office/agreements.test.mjs && node scripts/check-office.mjs`
Expected: the context test fails (URL literal), check-office lists every hard-coded file.

- [ ] **Step 3: Implement**

`site.json`: add the three fields after `phone`. `context.mjs:18`: `export const siteUrl = () => process.env.URL || site.url;` (import `site` the way `agreements.mjs` does). `ics.mjs`: import `site`, `PRODID:-//${site.brand}//Office//EN`. `actions/meeting.mjs`: `uid: \`${meeting.id}@${new URL(siteUrl()).hostname}\`` importing `siteUrl` from `../context.mjs`. `scripts/mint-token.mjs`: `import site from '../src/data/site.json' with { type: 'json' }; const SITE = site.url;`. In each listed `.astro` file import `site` and replace the literal: `<title>{title} | {site.brand} office</title>`, `<a class="brand" href="/office/">{site.brand} office</a>`, pay-page titles `` `Payment received | ${site.brand}` ``, sign page copy `Sign as {site.brand}`, `{site.brand} withdrew this version`, questionnaire page titles `` `${definition.title} | ${site.brand}` ``. In `templates.json` replace the two literals with `{{site.brand}}` (the placeholder already exists). In `agreements.mjs` the error strings use `site.brand`.

- [ ] **Step 4: Gate**

Run: `npm run gate`
Expected: PASS; `check:office` clean.

- [ ] **Step 5: Commit**

```bash
git add -A src netlify scripts/mint-token.mjs scripts/check-office.mjs
git commit -m "Take brand identity from site.json"
```

---

### Task 2: Agreement templates carry their tier

**Files:**
- Modify: `scripts/agreement-from-docx.py` (third argument: tier name; writes `"tier"` and `"legalName"` from `site.json`? no — from the docx party block, unchanged)
- Modify: `src/data/office/agreements/{presence,search,search-plus}.json` (regenerate, or add `"tier"` by script; the files are generated so regenerate: `python3 scripts/agreement-from-docx.py <docx> presence Presence > src/data/office/agreements/presence.json` and the same for the other two; the docx files are gitignored, so if they are absent, add the field with a one-off Node script and note it)
- Modify: `netlify/functions/lib/office/agreement-templates.mjs` (`validateAgreementTemplate` requires `tier` to be a non-empty string), `agreement-templates.test.mjs`
- Modify: `netlify/functions/lib/office/agreements.mjs` (drop `TIER_FOR_TEMPLATE`; `defaultFields` compares `client.tier === template.tier`), `agreements.test.mjs`
- Modify: `src/pages/office/clients/[slug].astro` (`defaultTemplateId` = the template whose `tier` equals `client.tier`, else the first template)

**Interfaces:**
- Produces: every agreement template JSON has `tier` (a tier name from `packages.json`); `check-office` fails when a template's `tier` is not one of `TIERS`; `defaultFields(client, template)` uses `template.tier`.

- [ ] **Step 1: Failing tests**

Append to `agreement-templates.test.mjs`:

```js
test('every agreement template names a tier that exists', () => {
  const { TIERS } = require_or_import('./clients.mjs'); // use a normal import at the top of the file
  for (const t of loadAgreementTemplates()) assert.ok(TIERS.includes(t.tier), `${t.id} tier ${t.tier}`);
});
test('validateAgreementTemplate rejects a missing tier', () => {
  const t = { ...loadAgreementTemplates()[0], tier: undefined };
  assert.ok(validateAgreementTemplate(t).some((e) => /tier/.test(e)));
});
```

(Write the import as `import { TIERS } from './clients.mjs';` — the pseudo-call above only marks where it goes.)

Append to `agreements.test.mjs`:

```js
test('defaultFields prices from the tier only when the template tier matches', () => {
  const template = findAgreementTemplate('search');
  const match = defaultFields({ tier: template.tier, business: 'Lova', name: 'S', email: 's@x' }, template);
  const miss = defaultFields({ tier: 'Nope', business: 'Lova', name: 'S', email: 's@x' }, template);
  assert.equal(match.buildFee, tierPrices(template.tier).build);
  assert.notEqual(miss.buildFee, undefined);
});
```

- [ ] **Step 2: Run to see them fail** — `node --test netlify/functions/lib/office/agreement-templates.test.mjs netlify/functions/lib/office/agreements.test.mjs`.

- [ ] **Step 3: Implement** as described in Interfaces; in the generator, `main(path, template_id, tier)` writes `'tier': tier` into `out`; in `[slug].astro`:

```ts
const defaultTemplateId = (agreementTemplates.find((t) => t.tier === client.tier) ?? agreementTemplates[0]).id;
```

and the `agreementTemplates` type gains `tier: string`.

- [ ] **Step 4: Gate** — `npm run gate`.

- [ ] **Step 5: Commit** — `git commit -m "Put the tier on each agreement template"`.

---

### Task 3: A questionnaire registry instead of three names

**Files:**
- Create: `src/data/questionnaires/index.mjs`
- Modify: `netlify/functions/questionnaire.mjs` (DEFINITIONS from the registry)
- Create: `src/pages/questionnaire/[form].astro` (prerendered via `getStaticPaths` from the registry); Delete: `intro.astro`, `brand.astro`, `build.astro`
- Modify: `scripts/mint-token.mjs`, `scripts/check-questionnaires.mjs` (FORMS and the expected-count table become registry-driven; the count table moves into the registry entries as `questions`), `netlify/functions/lib/intake.mjs` (`FORMS` from the registry), `netlify/functions/lib/office/pipeline.mjs` (validate `questionnaires` against the registry), `scripts/check-office.mjs`, `src/pages/office/clients/[slug].astro` (DEFINITIONS from the registry), `netlify/functions/lib/office/hooks.mjs` if it names forms
- Modify: `netlify.toml` `included_files` to add `src/data/questionnaires/index.mjs`
- Test: `netlify/functions/lib/questionnaire.test.mjs` (existing), `netlify/functions/lib/intake.test.mjs`, `netlify/functions/lib/office/pipeline.test.mjs`

**Interfaces:**
- Produces: `src/data/questionnaires/index.mjs`:
  ```js
  // The one list of questionnaire forms. Adding a form is one entry here plus
  // its JSON; the submission function, the pages, the token script, the pull
  // script and the pipeline validator all read this.
  import intro from './intro.json' with { type: 'json' };
  import brand from './brand.json' with { type: 'json' };
  import build from './build.json' with { type: 'json' };
  export const FORMS = [
    { id: 'intro', definition: intro, questions: 8 },
    { id: 'brand', definition: brand, questions: 14 },
    { id: 'build', definition: build, questions: 39 },
  ];
  export const DEFINITIONS = Object.freeze(Object.fromEntries(FORMS.map((f) => [f.id, f.definition])));
  export const FORM_IDS = FORMS.map((f) => f.id);
  ```
  `FORM_IDS` replaces every hard-coded `['intro', 'brand', 'build']`; the submission function builds its `__proto__: null` map from `DEFINITIONS`; `[form].astro` returns `getStaticPaths` from `FORMS` and renders exactly what the three pages render today (read one of them and keep the inline-script comment). Form ids must match `/^[a-z]+$/` (the store's `FORM` regex) — `check-questionnaires` asserts it.

- [ ] **Step 1: Failing tests** — in `questionnaire.test.mjs` add a test that a form id absent from `FORM_IDS` is refused with 403 (import `FORM_IDS` and pick `'nope'`); in `intake.test.mjs` assert `FORMS` (intake's) deep-equals the registry's `FORM_IDS`; in `pipeline.test.mjs` assert a pipeline naming a form outside the registry fails validation with `has no definition`.

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement** the registry and rewire every consumer; delete the three static pages once `[form].astro` produces the same output (`npm run build` then `diff -r` the three `dist/questionnaire/*/index.html` against a build from the previous commit — they must be byte-identical apart from nothing; if the hashed script or CSS names differ, compare the text content).

- [ ] **Step 4: Gate** — `npm run gate` (verify's Questionnaires section must still pass unchanged).

- [ ] **Step 5: Commit** — `git commit -m "Register questionnaire forms in one module"`.

---

### Task 4: The brand overlay script

**Files:**
- Create: `scripts/brand.mjs`
- Create: `scripts/brand.test.mjs`
- Create: `brands/README.md`
- Modify: `.gitignore` (nothing; overlays are tracked)

**Interfaces:**
- Produces: `node scripts/brand.mjs <brand>` copies every file under `brands/<brand>/` onto the same relative path under the repo root (so `brands/lova/src/data/site.json` → `src/data/site.json`, `brands/lova/public/_redirects` → `public/_redirects`), refusing paths that escape the root or that are not under `src/data/`, `src/styles/brand.css`, `public/_redirects`, `public/robots.txt`, `public/favicon.svg`, `public/og-default.png`, `src/data/office/agreements/`, `src/data/questionnaires/`. It prints each copied path. `node scripts/brand.mjs reset` runs `git checkout -- <every path an overlay could touch>` and `git clean -f` on overlay-only files it created (tracked via a `.brand-applied` manifest written to `.superpowers/`? no — to `node_modules/.cache/brand-applied.json`, gitignored by virtue of `node_modules`). Exported for tests: `applyBrand({ brand, root, copy })` and `ALLOWED` prefixes, so the test runs against a temp dir with an injected `copy`.

- [ ] **Step 1: Failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyBrand, ALLOWED } from './brand.mjs';

test('applyBrand copies allowed overlay files and refuses the rest', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'brand-'));
  await fs.mkdir(path.join(root, 'brands/lova/src/data/office'), { recursive: true });
  await fs.mkdir(path.join(root, 'brands/lova/netlify'), { recursive: true });
  await fs.writeFile(path.join(root, 'brands/lova/src/data/site.json'), '{"brand":"Lova"}');
  await fs.writeFile(path.join(root, 'brands/lova/src/data/office/pipelines.json'), '[]');
  await fs.writeFile(path.join(root, 'brands/lova/netlify/evil.mjs'), 'x');
  const copied = [];
  await assert.rejects(() => applyBrand({ brand: 'lova', root, copy: async (from, to) => { copied.push(to); } }), /not an overlay path: netlify\/evil.mjs/);
  await fs.rm(path.join(root, 'brands/lova/netlify'), { recursive: true });
  const result = await applyBrand({ brand: 'lova', root, copy: async (from, to) => { copied.push(to); } });
  assert.deepEqual(result.sort(), ['src/data/office/pipelines.json', 'src/data/site.json']);
  assert.ok(ALLOWED.some((p) => 'src/data/site.json'.startsWith(p)));
});

test('applyBrand refuses an unknown brand and a traversal name', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'brand-'));
  await assert.rejects(() => applyBrand({ brand: 'nope', root, copy: async () => {} }), /no such brand/);
  await assert.rejects(() => applyBrand({ brand: '../x', root, copy: async () => {} }), /bad brand/);
});
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement**

```js
// Applies a brand overlay: every file under brands/<brand>/ replaces the file
// at the same path in the repo. Keepsite is the canonical content and has no
// overlay; a second site runs this before its build. Only content paths are
// allowed so an overlay can never change code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const ALLOWED = ['src/data/', 'src/styles/brand.css', 'public/_redirects', 'public/robots.txt', 'public/favicon.svg', 'public/og-default.png'];
const BRAND = /^[a-z][a-z0-9-]{0,30}$/;

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

export async function applyBrand({ brand, root, copy }) {
  if (!BRAND.test(String(brand))) throw new Error(`bad brand: ${brand}`);
  const dir = path.join(root, 'brands', brand);
  try { await fs.access(dir); } catch { throw new Error(`no such brand: ${brand}`); }
  const files = await walk(dir);
  for (const f of files) if (!ALLOWED.some((a) => f.startsWith(a))) throw new Error(`not an overlay path: ${f}`);
  for (const f of files) await copy(path.join(dir, f), path.join(root, f));
  return files;
}

const realCopy = async (from, to) => { await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(from, to); };
const MANIFEST = 'node_modules/.cache/brand-applied.json';

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const arg = process.argv[2];
  const root = process.cwd();
  if (!arg) { console.error('usage: node scripts/brand.mjs <brand> | reset'); process.exit(1); }
  if (arg === 'reset') {
    let applied = [];
    try { applied = JSON.parse(await fs.readFile(MANIFEST, 'utf8')); } catch {}
    const tracked = applied.filter((f) => { try { execFileSync('git', ['ls-files', '--error-unmatch', f], { stdio: 'ignore' }); return true; } catch { return false; } });
    if (tracked.length) execFileSync('git', ['checkout', '--', ...tracked], { stdio: 'inherit' });
    for (const f of applied.filter((f) => !tracked.includes(f))) await fs.rm(path.join(root, f), { force: true });
    await fs.rm(MANIFEST, { force: true });
    console.log(`restored ${applied.length} file(s)`);
  } else {
    const files = await applyBrand({ brand: arg, root, copy: realCopy });
    await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
    await fs.writeFile(MANIFEST, JSON.stringify(files));
    for (const f of files) console.log(`applied ${f}`);
  }
}
```

`brands/README.md` explains the overlay contract, the allowed paths, and the two commands, and says Keepsite has no overlay.

- [ ] **Step 4: Tests** — `node --test scripts/brand.test.mjs && npm test`.

- [ ] **Step 5: Commit** — `git commit -m "Add the brand overlay script"`.

---

### Task 5: Office-only mode

**Files:**
- Modify: `astro.config.mjs` (`site` from `site.json`; sitemap filter excludes everything when `officeOnly`)
- Modify: `scripts/verify.mjs` (skip Routes, Copy residue, Price drift, Structure, JavaScript budget, Structured data, Fonts sections when `site.officeOnly`; keep Questionnaires; add an office-only section asserting `public/_redirects` contains the shadow rule and `robots.txt` disallows `/`)
- Modify: `public/robots.txt` unchanged (the overlay supplies Lova's)
- Test: `scripts/verify.mjs` is exercised by the gate; add `scripts/office-only.test.mjs` asserting the redirect rules text the overlay must contain, via an exported `SHADOW_RULES` constant in a new `scripts/lib/office-only.mjs`

**Interfaces:**
- Produces: `scripts/lib/office-only.mjs` exports `SHADOW_RULES` — the exact `_redirects` text an office-only overlay must contain:
  ```
  /office/*  /office/:splat  200
  /sign/*  /sign/:splat  200
  /pay/*  /pay/:splat  200
  /questionnaire/*  /questionnaire/:splat  200
  /.netlify/*  /.netlify/:splat  200
  /_astro/*  /_astro/:splat  200
  /fonts/*  /fonts/:splat  200
  /favicon.svg  /favicon.svg  200
  /*  /office/login/  302!
  ```
  `verify.mjs` reads `site.json`; when `officeOnly` it asserts `dist/_redirects` (Astro emits it from `public/_redirects` plus the adapter's own rules) contains every `SHADOW_RULES` line and that `dist/sitemap-0.xml` has no `<url>`. `astro.config.mjs`: `import site from './src/data/site.json' with { type: 'json' }; site: site.url`, and the sitemap `filter: (page) => !site.officeOnly && <existing filter>`.

- [ ] **Step 1: Failing test** — `scripts/office-only.test.mjs` asserts every line of `SHADOW_RULES` ends in `200` or `302!`, that the catch-all is last, and that the allowed prefixes cover `/office/`, `/sign/`, `/pay/`, `/questionnaire/`.

- [ ] **Step 2–3: Implement** as above. In `verify.mjs`, wrap the public sections in `if (!site.officeOnly) { … }` and add:

```js
if (site.officeOnly) {
  section('Office only');
  const redirects = read('_redirects');
  for (const line of SHADOW_RULES.trim().split('\n')) check(`redirect: ${line}`, () => { if (!redirects.includes(line)) throw new Error(`missing ${line}`); });
  check('sitemap is empty', () => { if (read('sitemap-0.xml').includes('<url>')) throw new Error('sitemap lists pages'); });
  check('robots disallows everything', () => { if (!fs.readFileSync('dist/robots.txt', 'utf8').includes('Disallow: /\n')) throw new Error('robots'); });
}
```

(Match `verify.mjs`'s existing helper names — read the file; it uses `section`, `read` and a check helper.)

- [ ] **Step 4: Gate** — `npm run gate` (Keepsite path unchanged).

- [ ] **Step 5: Commit** — `git commit -m "Add office-only mode for a second site"`.

---

### Task 6: The Lova overlay

**Files:**
- Create: `brands/lova/src/data/site.json`, `brands/lova/src/data/packages.json`, `brands/lova/src/data/office/pipelines.json`, `brands/lova/src/data/office/templates.json`, `brands/lova/src/data/questionnaires/index.mjs` + `intake.json`, `brands/lova/src/data/office/agreements/services.json`, `brands/lova/src/styles/brand.css`, `brands/lova/public/_redirects`, `brands/lova/public/robots.txt`, `brands/lova/README.md`
- Modify: `src/styles/global.css` to `@import './brand.css'` for the colour tokens, and create `src/styles/brand.css` holding Keepsite's current token values (so Keepsite is unchanged and Lova overlays the file)

**Interfaces:**
- Produces a complete, gate-passing overlay with starter content marked for Lova to edit:
  - `site.json`: `brand: "Lova Content Creation"`, `legalName: "Lova Content Creation LLC"`, `url: "https://www.lovacontent.com"` (placeholder domain: the user confirms the real one), `email`, `phone`, `signer`, `officeOnly: true`, `nav: []`, `tagline`.
  - `packages.json`: one or two tiers in the same shape Keepsite's has (`id`, `name`, `buildPrice`, `monthlyPrice`, notes) with starter prices `$0` is not allowed by `tierPrices` — use placeholder amounts `500` and `0` monthly and mark them in `brands/lova/README.md` as values she sets.
  - `pipelines.json`: one pipeline `content` with stages `inquiry → agreement → intake → shoot → edit → deliver → closed`, tasks and the `intake` questionnaire, `payments.plan: 'deposit-balance-monthly'` if the plan module supports a zero monthly fee, else the deposit-balance variant (read `payments.mjs`; if only one plan exists and it requires a monthly subscription, add `payments.plan: 'deposit-balance'` handling as a minimal branch that skips the subscription task — a small code change in `payments.mjs`/`pipeline.mjs` with a test).
  - `templates.json`: Keepsite's templates rewritten in Lova's voice with `{{site.brand}}`, one per stage-entry email the pipeline names, plus `agreement`, `agreement-completed`, `agreement-declined`, `meeting-*`, `questionnaire-reminder`, `payment-*` (keep the ids the code expects; `check-office` lists them).
  - `questionnaires/index.mjs` + `intake.json`: one form `intake` with about ten questions (business, goals, platforms, shoot dates, references, brand assets upload).
  - `agreements/services.json`: generated from her docx when she supplies it; until then a copy of `presence.json` with `id: "services"`, `name: "Content Services Agreement"`, `tier` = her tier name, and the party block's Keepsite lines replaced — clearly labelled in `brands/lova/README.md` as a stand-in the generator replaces.
  - `brand.css`: the three tokens with Lova colours (placeholders she changes).
  - `_redirects`: exactly `SHADOW_RULES`. `robots.txt`: `User-agent: *\nDisallow: /\n`.
  - `brands/lova/README.md`: what each file is, which values are placeholders, and how to regenerate the agreement.

- [ ] **Step 1: Apply and gate** — `node scripts/brand.mjs lova && npm run gate && node scripts/brand.mjs reset`; expected PASS with the office-only verify section, and `git status --porcelain` clean after reset.

- [ ] **Step 2: Keepsite gate** — `npm run gate` still PASS.

- [ ] **Step 3: Commit** — `git commit -m "Add the Lova brand overlay"`.

---

### Task 7: README, spec and the Lova deploy checklist

**Files:**
- Modify: `README.md` (new section "Running a second brand": overlay contract, the two commands, the Lova site's build command `node scripts/brand.mjs lova && rm -rf node_modules/.astro && npm run check && npm run build`, and a deploy checklist)
- Modify: `docs/superpowers/specs/2026-09-04-client-office-design.md` only if implementation diverged from the "Second deployment" section

Deploy checklist (README):
1. Netlify: new site from the same repo and branch; build command above; publish `dist`; enable Identity, invite Lova's login, give it the `admin` role.
2. Environment variables on the Lova site: `KEEPSITE_SESSION_SECRET`, `KEEPSITE_TOKEN_SECRET` (new random values), `RESEND_API_KEY`, `KEEPSITE_NOTIFY_FROM` (an address on Lova's verified Resend domain), `KEEPSITE_NOTIFY_TO`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from Lova's own Stripe account, webhook endpoint registered for the same seven events.
3. Domain: point Lova's domain at the site; `site.json` `url` must match.
4. Smoke test: log in, create a client, advance a stage, send an email, create and sign an agreement, sign it from a private window, pay a test deposit, upload a document, run `pull-intake.mjs` with Lova's site ID.
5. Confirm `/` redirects to `/office/login/`, `robots.txt` disallows everything, the sitemap is empty.

- [ ] **Step 1: Write**, **Step 2: `npm test`**, **Step 3: Commit** — `git commit -m "Document running a second brand"`.

---

## Self-review

- **Spec coverage.** Separate site, own accounts: Task 7 checklist. Brand from data: Tasks 1, 4, 6. Office-only mode: Task 5. Tier on templates: Task 2. Questionnaire registry: Task 3. Lova overlay and checklist: Tasks 6, 7. Lighthouse on both sites: noted in spec; the Lova smoke test in Task 7 confirms the login page passes, and the fallback is a Lova-specific branch of `netlify.toml` if it does not.
- **Placeholders.** Task 6's content is deliberately starter content that Lova replaces; each placeholder value is named in `brands/lova/README.md`, not left as "TODO" in code. Task 2's `require_or_import` marker is explained inline. Task 6's payments-plan branch is conditional on what `payments.mjs` supports; the implementer reads it first and the controller rules if a new plan is needed.
- **Type consistency.** `site.url`, `site.signer`, `site.officeOnly` (Task 1) are read by Tasks 5 and 6; `FORMS`/`FORM_IDS`/`DEFINITIONS` (Task 3) are what Task 6's registry must export; `SHADOW_RULES` (Task 5) is what Task 6's `_redirects` contains; `ALLOWED` (Task 4) covers every path Task 6 writes; `template.tier` (Task 2) is what Task 6's agreement JSON carries.
- **Open questions for the user before execution:** Lova's real domain, legal name, signer name, tiers and prices, whether she bills a monthly fee (decides the payments plan), and her contract docx.
