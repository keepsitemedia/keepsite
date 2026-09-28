# Site Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every marketing page one full-width slate band and larger headlines, open the four package tiers into visible rows, and add five pages: one per package and an About page.

**Architecture:** Astro static pages read JSON in `src/data/`; the refresh adds two data-driven routes (`packages/[tier].astro`, `about.astro`), three small components (`Checklist`, `TierLists`, `FaqList`), one pure helper module (`src/scripts/tiers.mjs`) with unit tests, and two global CSS classes (`.section-slate`, `.statement`). `scripts/verify.mjs` grows a slate audit and learns the five new routes, so `npm run gate` stays the acceptance test.

**Tech Stack:** Astro 5 (static output, Netlify adapter), plain CSS with tokens in `src/styles/global.css`, DecapCMS config in `public/admin/config.yml`, `node --test` for unit tests, `scripts/verify.mjs` for structural checks against `dist/`, puppeteer (present transitively) for screenshots.

**Spec:** `docs/superpowers/specs/2026-09-27-site-refresh-design.md`

## Global Constraints

- Palette is unchanged. No new hex values anywhere. Slate is `--color-slate` `#628997`; inside a `.section-slate` band every text color is `--color-ink` `#111111`, and the only anchors allowed are `.btn` and `.slate-link`. No `.muted`, `.serif` or `.link-arrow` inside a band. At most one band per page.
- Rust stays the only colored text. Nothing sets `font-style: italic` except `.serif`.
- No new typefaces. Caveat is already installed and is imported only where the handwritten list renders.
- Every `&rarr;` appended to link or button text is removed. No `→` characters in page copy.
- Script budget per page is fixed in `scripts/verify.mjs`. New pages carry only JSON-LD plus analytics. `/packages/` drops from 3 to 2 script tags.
- One `h1` per page, no skipped heading levels, main landmark, canonical, skip link, og:image on every page (verify enforces).
- No hourly rate, no `$90`, no `$75`, and no `Sam` on any page (verify enforces). About speaks as "we" and names nobody.
- Nothing links to `/lockii/`. Every internal `href` resolves to a file in `dist/`.
- Commit messages: imperative subject under 50 characters, body only when the reason is not obvious, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Build and verify run from the repo root on WSL against `/mnt/c`; a build takes about 80 seconds. `npm run gate` runs tests, `astro check`, form and office checks, build and verify in one command.
- Do not touch `/office/`, `/sign/`, the questionnaires or the pay pages. `src/styles/office.css` already overrides `h1` and `h2` sizes under `.office`, so the global type change does not reach it.

## Review Focus

1. A `notIf` entry naming a tier id that does not exist would ship a dead link on a package page. Pinned in Task 2: `notIfLinks` throws on an unknown id, so the build fails instead.
2. A `faqTopics` entry naming a topic that is not in `faq.json` would silently drop a question. Pinned in Task 2: `faqItems` throws with the topic name.
3. A sorter answer such as "Keep going" or "Growth or Range" must render plain text for non-tier words and a link only for exact tier names. Pinned in Task 2: `linkPackages` tests cover a single name, two names joined by "or", and a non-name.
4. Five nav items plus the button must fit the header between 800px and 1000px without wrapping the logo row. Pinned in Task 6: a screenshot step at 820px and 1000px with the expected outcome stated.
5. `/packages/#growth` must still land on the Growth row after the `<details>` and its opening script are gone. Pinned in Task 5: a verify check that each tier id is an `id` attribute on `/packages/`.

---

### Task 1: Slate and statement tokens, plus the slate audit

**Files:**
- Modify: `src/styles/global.css` (h1/h2 block near line 87; the `.section-*` layout block near line 137; the focus block near line 405)
- Create: `scripts/lib/slate-audit.mjs`
- Create: `scripts/lib/slate-audit.test.mjs`
- Modify: `scripts/verify.mjs` (a new check in the `Structure` section, after the noindex check)
- Modify: `src/pages/index.astro` (remove the `.hero h1` size override, line 122)

**Interfaces:**
- Produces: CSS classes `.section-slate` (a section background), `.statement` (the band's heading), `.slate-link` (the one link style allowed in a band). `slateViolations(html: string): string[]` from `scripts/lib/slate-audit.mjs`.

- [ ] **Step 1: Write the failing audit tests**

Create `scripts/lib/slate-audit.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slateViolations } from './slate-audit.mjs';

const band = (inner) => `<main><section class="section section-slate"><div class="container">${inner}</div></section></main>`;

test('a page with no slate band has no violations', () => {
  assert.deepEqual(slateViolations('<main><section class="section"><p class="muted">x</p></section></main>'), []);
});

test('ink-only content passes', () => {
  assert.deepEqual(slateViolations(band('<h2 class="statement">Hi.</h2><p class="lead">Body.</p><a class="btn" href="/start/">Go</a><a class="slate-link" href="/packages/growth/">Growth</a>')), []);
});

test('muted, serif and link-arrow inside a band are violations', () => {
  const out = slateViolations(band('<p class="muted">a</p><p class="serif">b</p><a class="link-arrow" href="/">c</a>'));
  assert.equal(out.length, 4); // three classes plus the unstyled-link rule for .link-arrow
  assert.match(out[0], /muted/);
});

test('a link without btn or slate-link is a violation', () => {
  assert.match(slateViolations(band('<a href="/faq/">FAQ</a>'))[0], /unstyled link/);
});

test('two bands on one page is a violation', () => {
  const html = band('<p>a</p>') + band('<p>b</p>');
  assert.match(slateViolations(html)[0], /2 slate bands/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/slate-audit.test.mjs`
Expected: FAIL with `Cannot find module './slate-audit.mjs'`.

- [ ] **Step 3: Write the audit**

Create `scripts/lib/slate-audit.mjs`:

```js
// A slate band holds ink text only (spec §4): white, muted and rust all fail
// contrast on slate. This reads the built HTML for one page and names every
// class or anchor inside a band that would break that rule, and complains if
// a page has more than one band.
export function slateViolations(html) {
  const out = [];
  const bands = [...html.matchAll(/<section[^>]*class="[^"]*\bsection-slate\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g)];
  if (bands.length > 1) out.push(`${bands.length} slate bands, expected at most 1`);
  for (const [, inner] of bands) {
    for (const m of inner.matchAll(/class="([^"]*)"/g)) {
      for (const cls of ['muted', 'serif', 'link-arrow']) {
        if (new RegExp(`\\b${cls}\\b`).test(m[1])) out.push(`.${cls} inside a slate band`);
      }
    }
    for (const m of inner.matchAll(/<a\b([^>]*)>/g)) {
      if (!/class="[^"]*\b(btn|slate-link)\b/.test(m[1])) out.push(`unstyled link inside a slate band: <a${m[1]}>`);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/slate-audit.test.mjs`
Expected: 5 passing.

- [ ] **Step 5: Add the tokens to `global.css`**

Replace the heading block:

```css
h1, h2, h3 {
  margin: 0 0 var(--space-2);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
h1 { font-size: var(--step-4); }
h2 { font-size: var(--step-3); }
h3 { font-size: var(--step-2); }
```

with:

```css
h1, h2, h3 {
  margin: 0 0 var(--space-2);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
/* Headlines carry the personality: one step up from the rebrand, with a
   measure short enough that lines break in two or three words. */
h1 { font-size: var(--step-5); max-width: 14ch; }
h2 { font-size: var(--step-4); max-width: 18ch; }
h3 { font-size: var(--step-2); }
```

After the `.section-deep p { color: var(--color-bg); }` line add:

```css
/* The slate band: once per page, for the plain-truth moment. Ink text only.
   White on slate is 3.8:1, muted 2.2:1 and rust 1.3:1, so every color token
   that could be inherited inside is forced back to ink here. */
.section-slate { background: var(--color-slate); color: var(--color-ink); }
.section-slate h1,
.section-slate h2,
.section-slate h3,
.section-slate p,
.section-slate li,
.section-slate .lead { color: var(--color-ink); }
.section-slate .slate-link {
  color: var(--color-ink);
  font-weight: 700;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.25em;
}
.section-slate .slate-link:hover { text-decoration-thickness: 3px; color: var(--color-ink); }

/* The band's statement is the largest type on its page. */
.statement {
  font-size: var(--step-5);
  max-width: 16ch;
  line-height: 1.02;
  letter-spacing: -0.025em;
  font-weight: 700;
}
```

The new `max-width` on `h1` and `h2` would anchor a centered heading to the left of its box. Change `.center :is(h1, h2)::before { margin-inline: auto; }` to:

```css
.center :is(h1, h2) { margin-inline: auto; }
.center :is(h1, h2)::before { margin-inline: auto; }
```

The office sets its own heading sizes but not measures, so add one guard to `src/styles/office.css` directly after the `.office h1 { font-size: var(--step-3); … }` line (line 45):

```css
/* The marketing site caps headline measures; the office's headings are names and dates and wrap on their own. */
.office h1, .office h2 { max-width: none; }
```

In the focus block, after the `.section-deep :focus-visible` line add:

```css
.section-slate :focus-visible { box-shadow: 0 0 0 2px var(--color-slate), 0 0 0 4px var(--color-ink); }
```

- [ ] **Step 6: Remove the home hero's h1 override**

In `src/pages/index.astro`, change `.hero h1 { font-size: var(--step-5); max-width: 16ch; }` to `.hero h1 { max-width: 16ch; }` (the size now comes from the token; the hero keeps its wider measure so the tagline breaks as it does today).

- [ ] **Step 7: Add the verify check**

In `scripts/verify.mjs`, add after the `import path from 'node:path';` line:

```js
import { slateViolations } from './lib/slate-audit.mjs';
```

and after the `noindex on 404, thanks, and every questionnaire route` check:

```js
// Spec 2026-09-27 §4: one slate band per page at most, ink text only inside it.
check('slate bands hold ink only', () => {
  for (const p of PAGES) {
    const bad = slateViolations(read(p));
    if (bad.length) throw new Error(`${p}: ${bad.join('; ')}`);
  }
});
```

- [ ] **Step 8: Run the gate**

Run: `npm run gate`
Expected: all green. The new check passes trivially (no bands yet). Type is larger on every page; nothing else changed.

- [ ] **Step 9: Commit**

```bash
git add src/styles/global.css src/styles/office.css src/pages/index.astro scripts/lib/slate-audit.mjs scripts/lib/slate-audit.test.mjs scripts/verify.mjs
git commit -m "Add slate band tokens and raise headline scale

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Tier helpers

**Files:**
- Create: `src/scripts/tiers.mjs`
- Create: `src/scripts/tiers.test.mjs`

**Interfaces:**
- Produces, all exported from `src/scripts/tiers.mjs`:
  - `tierHref(id: string): string` → `/packages/${id}/`
  - `priceAmount(display: string): string` → `'2400.00'`; throws on anything that is not one dollar figure
  - `serviceNode(tier, { packagesUrl, pageUrl, businessId }): object` → one schema.org `Service` with two offers
  - `linkPackages(text: string, tiers): { text: string; href?: string }[]`
  - `stageLines(process, tierName: string): { title: string; body: string }[]`
  - `faqItems(faq, topics: string[]): { topic; q; a }[]`
  - `notIfLinks(tier, tiers): { text: string; name: string; href: string }[]`

- [ ] **Step 1: Write the failing tests**

Create `src/scripts/tiers.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierHref, priceAmount, serviceNode, linkPackages, stageLines, faqItems, notIfLinks,
} from './tiers.mjs';

const tiers = [
  { id: 'presence', name: 'Presence', sub: 'For businesses that already find clients.', buildPrice: '$2,400', monthlyPrice: '$85', page: { notIf: [{ tier: 'growth', text: 'You want Google.' }] } },
  { id: 'growth', name: 'Growth', sub: 'For search.', buildPrice: '$3,600', monthlyPrice: '$225', page: { notIf: [{ tier: 'presence', text: 'a' }, { tier: 'agile', text: 'b' }] } },
  { id: 'agile', name: 'Agile', sub: 'For new things.', buildPrice: '$4,200', monthlyPrice: '$595', page: { notIf: [{ tier: 'nope', text: 'c' }] } },
];

test('tierHref builds the package page path', () => {
  assert.equal(tierHref('growth'), '/packages/growth/');
});

test('priceAmount reads a display price and refuses anything else', () => {
  assert.equal(priceAmount('$2,400'), '2400.00');
  assert.equal(priceAmount('$85'), '85.00');
  assert.throws(() => priceAmount('quoted'), /price/);
  assert.throws(() => priceAmount('$0'), /price/);
});

test('serviceNode carries the tier prices and the page url', () => {
  const node = serviceNode(tiers[0], {
    packagesUrl: 'https://www.keepsitemedia.com/packages/',
    pageUrl: 'https://www.keepsitemedia.com/packages/presence/',
    businessId: 'https://www.keepsitemedia.com/#business',
  });
  assert.equal(node['@type'], 'Service');
  assert.equal(node['@id'], 'https://www.keepsitemedia.com/packages/#presence');
  assert.equal(node.url, 'https://www.keepsitemedia.com/packages/presence/');
  assert.equal(node.provider['@id'], 'https://www.keepsitemedia.com/#business');
  assert.equal(node.offers[0].price, '2400.00');
  assert.equal(node.offers[1].priceSpecification.price, '85.00');
  assert.equal(node.offers[1].priceSpecification.billingDuration, 'P1M');
});

test('linkPackages links exact tier names and leaves other words plain', () => {
  assert.deepEqual(linkPackages('Growth or Range', [...tiers, { id: 'range', name: 'Range' }]), [
    { text: 'Growth', href: '/packages/growth/' },
    { text: ' or ' },
    { text: 'Range', href: '/packages/range/' },
  ]);
  assert.deepEqual(linkPackages('Keep going', tiers), [{ text: 'Keep going' }]);
  assert.deepEqual(linkPackages('Presence', tiers), [{ text: 'Presence', href: '/packages/presence/' }]);
});

test('stageLines pulls one line per stage for the tier and fails on a gap', () => {
  const process = { stages: { items: [
    { title: 'Style', tiers: [{ name: 'Presence', body: 'Pick one.' }, { name: 'Growth', body: 'We research.' }] },
    { title: 'Function', tiers: [{ name: 'Presence', body: 'Your pages.' }] },
  ] } };
  assert.deepEqual(stageLines(process, 'Presence'), [
    { title: 'Style', body: 'Pick one.' },
    { title: 'Function', body: 'Your pages.' },
  ]);
  assert.throws(() => stageLines(process, 'Growth'), /Function has no line for Growth/);
});

test('faqItems resolves topics in order and fails on an unknown one', () => {
  const faq = { groups: [
    { items: [{ topic: 'a', q: 'A?', a: 'a.' }] },
    { items: [{ topic: 'b', q: 'B?', a: 'b.' }] },
  ] };
  assert.deepEqual(faqItems(faq, ['b', 'a']).map((i) => i.topic), ['b', 'a']);
  assert.throws(() => faqItems(faq, ['zzz']), /unknown FAQ topic: zzz/);
});

test('notIfLinks resolves neighbours and fails on an unknown tier id', () => {
  assert.deepEqual(notIfLinks(tiers[1], tiers), [
    { text: 'a', name: 'Presence', href: '/packages/presence/' },
    { text: 'b', name: 'Agile', href: '/packages/agile/' },
  ]);
  assert.throws(() => notIfLinks(tiers[2], tiers), /agile: notIf points at unknown tier nope/);
  assert.deepEqual(notIfLinks({ id: 'x', name: 'X' }, tiers), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/scripts/tiers.test.mjs`
Expected: FAIL with `Cannot find module './tiers.mjs'`.

- [ ] **Step 3: Write the helpers**

Create `src/scripts/tiers.mjs`:

```js
// Everything the package pages derive from data rather than type by hand:
// the page path for a tier, the schema.org Service node built from the
// display prices (so structured data can never drift from the visible
// price), and the lookups that turn ids and topics in packages.json into
// links, stage lines and FAQ items. Each lookup throws on a name it cannot
// find, so a typo fails the build instead of shipping a gap.

export const tierHref = (id) => `/packages/${id}/`;

export function priceAmount(display) {
  const digits = String(display).replace(/[^0-9.]/g, '');
  const n = Number(digits);
  if (!digits || !Number.isFinite(n) || n <= 0) {
    throw new Error(`packages.json price is not a single parseable amount: ${JSON.stringify(display)}`);
  }
  return n.toFixed(2);
}

export function serviceNode(tier, { packagesUrl, pageUrl, businessId }) {
  return {
    '@type': 'Service',
    '@id': `${packagesUrl}#${tier.id}`,
    name: `${tier.name} website package`,
    description: tier.sub,
    serviceType: 'Website design and maintenance',
    url: pageUrl,
    provider: { '@id': businessId },
    offers: [
      {
        '@type': 'Offer',
        name: `${tier.name} build`,
        category: 'One-time build',
        price: priceAmount(tier.buildPrice),
        priceCurrency: 'USD',
        url: pageUrl,
      },
      {
        '@type': 'Offer',
        name: `${tier.name} subscription`,
        category: 'Subscription',
        priceCurrency: 'USD',
        url: pageUrl,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: priceAmount(tier.monthlyPrice),
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          billingIncrement: 1,
        },
      },
    ],
  };
}

// "Growth or Range" -> link, " or ", link. "Keep going" -> plain.
export function linkPackages(text, tiers) {
  const hrefs = new Map(tiers.map((t) => [t.name, tierHref(t.id)]));
  return String(text)
    .split(/(\s+or\s+)/)
    .filter(Boolean)
    .map((part) => (hrefs.has(part) ? { text: part, href: hrefs.get(part) } : { text: part }));
}

export function stageLines(process, tierName) {
  return process.stages.items.map((stage) => {
    const hit = stage.tiers.find((t) => t.name === tierName);
    if (!hit) throw new Error(`process.json: ${stage.title} has no line for ${tierName}`);
    return { title: stage.title, body: hit.body };
  });
}

export function faqItems(faq, topics) {
  const all = faq.groups.flatMap((g) => g.items);
  return topics.map((topic) => {
    const item = all.find((i) => i.topic === topic);
    if (!item) throw new Error(`unknown FAQ topic: ${topic}`);
    return item;
  });
}

export function notIfLinks(tier, tiers) {
  return (tier.page?.notIf ?? []).map((n) => {
    const target = tiers.find((t) => t.id === n.tier);
    if (!target) throw new Error(`${tier.id}: notIf points at unknown tier ${n.tier}`);
    return { text: n.text, name: target.name, href: tierHref(target.id) };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/scripts/tiers.test.mjs`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/tiers.mjs src/scripts/tiers.test.mjs
git commit -m "Add tier helpers for the package pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Checklist component

**Files:**
- Create: `src/components/Checklist.astro`
- Modify: `src/pages/index.astro` (frontmatter import, the `<figure class="list">` block at lines 30-46, and the `.list`, `.box`, `.done`, `.check` styles at lines 130-171)

**Interfaces:**
- Produces: `<Checklist caption? items tone? doneLabel? />` where `items: { text: string; done: boolean }[]`, `tone: 'rust' | 'ink'` (default `'rust'`), `doneLabel` is the visually hidden suffix on a done item (default `'(done)'`). The root element carries class `checklist`, so a page can position it with `:global(.checklist)`.

- [ ] **Step 1: Create the component**

Create `src/components/Checklist.astro`:

```astro
---
// The handwritten list: printed boxes, a hand-drawn tick and a scratched-out
// line for whatever is done. The home hero draws the owner's week with it;
// how-it-works crosses off the homework they will not have to do. Caveat is
// imported here, so only pages that render the list fetch it.
import '@fontsource/caveat/latin-500.css';

interface Props {
  caption?: string;
  items: { text: string; done: boolean }[];
  tone?: 'rust' | 'ink';
  doneLabel?: string;
}
const { caption, items, tone = 'rust', doneLabel = '(done)' } = Astro.props;
---
<figure class:list={['checklist', `tone-${tone}`]}>
  {caption && <figcaption class="label">{caption}</figcaption>}
  <ul>
    {items.map((item) => (
      <li class:list={{ done: item.done }}>
        <span class="box" aria-hidden="true">
          {item.done && (
            <svg class="check" viewBox="0 0 32 26" width="32" height="26"><path d="M4 12c2 2 4 6 5.5 9.5C13 13 20 5 30 1.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          )}
        </span>
        <span class="text">{item.text}</span>
        {item.done && <span class="visually-hidden"> {doneLabel}</span>}
      </li>
    ))}
  </ul>
</figure>

<style>
  .checklist { margin: 0; }
  .checklist figcaption { margin-bottom: var(--space-2); color: var(--color-muted); }
  .checklist ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
  /* Printed boxes, handwritten lines. Caveat sits small for its size, so it
     runs a step above the lead. */
  .checklist li {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-family: 'Caveat', var(--font-sans);
    font-weight: 500;
    font-size: clamp(1.6rem, 2.6vw, 1.9rem);
    line-height: 1.25;
  }
  /* The box borrows the buttons' 2px ink edge and the site radius, scaled. */
  .box {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-ink);
    border-radius: 4px;
  }
  .done .box { overflow: visible; }
  /* The tick is a pen stroke, not a glyph: it starts inside the box and runs
     out past its top right corner the way a hand does. */
  .check { flex: none; margin: -8px -12px 0 -4px; }
  /* Scratched out by hand, not ruled through: two passes of a loose stroke,
     stretched to whatever width the word lands on. */
  .done .text {
    background-position: center 56%;
    background-size: 104% 0.6em;
    background-repeat: no-repeat;
  }

  /* Rust: the hero, on white. The tick and the strokes are the brand color
     and the struck word drops to muted. */
  .tone-rust .done .box { border-color: var(--color-brand); color: var(--color-brand); }
  .tone-rust .done .text {
    color: var(--color-muted);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 16' preserveAspectRatio='none'%3E%3Cpath d='M3 9C18 4 34 12 50 7S80 10 97 5M96 8C80 12 62 5 45 10S16 7 4 12' fill='none' stroke='%23B8512C' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
  }

  /* Ink: inside a slate band, where rust and muted both fail contrast. The
     word stays ink at full strength; the stroke does the work. */
  .tone-ink .done .box { color: var(--color-ink); }
  .tone-ink .done .text {
    color: var(--color-ink);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 16' preserveAspectRatio='none'%3E%3Cpath d='M3 9C18 4 34 12 50 7S80 10 97 5M96 8C80 12 62 5 45 10S16 7 4 12' fill='none' stroke='%23111111' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
  }
  .tone-ink figcaption { color: var(--color-ink); }
</style>
```

- [ ] **Step 2: Use it on the home page**

In `src/pages/index.astro` frontmatter, delete the two comment lines and the `import '@fontsource/caveat/latin-500.css';` line, and add `import Checklist from '../components/Checklist.astro';` after the `WorkCard` import.

Replace the whole `<figure class="list">…</figure>` block (and the comment above it) with:

```astro
        <!-- The sub line, drawn: an owner's week with everything still on
             it except the website. -->
        <Checklist caption={home.hero.list.heading} items={home.hero.list.items} />
```

In the `<style>` block, delete everything from `.list { margin: 0; }` through the closing brace of `.done .text { … }` (the `.list`, `.list figcaption`, `.list ul`, `.list li`, `.box`, `.done .box`, `.check` and `.done .text` rules). Change the 900px media query's `.list { padding-bottom: 0.2rem; }` to `.hero-top :global(.checklist) { padding-bottom: 0.2rem; }`.

- [ ] **Step 3: Build and compare**

Run: `npm run build && npm run verify`
Expected: green. Then serve `dist/` (`cd dist && python3 -m http.server 4174 &`) and screenshot `/` at 1280 wide using the script in Task 10 step 2. The hero list must look exactly as before: rust tick, "Website" scratched out in rust, muted text.

- [ ] **Step 4: Commit**

```bash
git add src/components/Checklist.astro src/pages/index.astro
git commit -m "Extract the handwritten list into Checklist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Package pages

**Files:**
- Create: `src/components/TierLists.astro`
- Create: `src/components/FaqList.astro`
- Create: `src/pages/packages/[tier].astro`
- Modify: `src/data/packages.json` (add a `page` object to each of the four tiers)
- Modify: `public/admin/config.yml` (tier fields, after `ctaLabel` at line 160)
- Modify: `scripts/verify.mjs` (`PAGES`, script budget, structured data)

**Interfaces:**
- Consumes: `tierHref`, `serviceNode`, `stageLines`, `faqItems`, `notIfLinks` from Task 2.
- Produces: `<TierLists weDo weDont level />` with `level: 3 | 4` for the two headings. `<FaqList items />` with `items: { topic; q; a }[]`, rendered as `details.faq-item` with the plus marker. Four routes `/packages/presence/`, `/packages/growth/`, `/packages/agile/`, `/packages/range/`. `tier.page` shape in `packages.json`: `{ title, description, notIf: [{ tier, text }], faqTopics: string[] }`.

- [ ] **Step 1: Add the page objects to `packages.json`**

Add `"page": {…}` after `"ctaLabel"` inside each tier. Presence:

```json
      "page": {
        "title": "Presence | Keepsite Media",
        "description": "A custom site we build and keep running, for businesses that already find clients in person or on social. $2,400 to build, $85 a month.",
        "notIf": [
          { "tier": "growth", "text": "You want customers you've never met to find you on Google. Presence does no search work at all, so that's" }
        ],
        "faqTopics": ["switch-tools", "edit-myself", "who-writes-copy", "what-monthly-covers", "start-small-move-up"]
      }
```

Growth:

```json
      "page": {
        "title": "Growth | Keepsite Media",
        "description": "A site built from research into the searches you want to win, then kept showing up. $3,600 to build, $225 a month.",
        "notIf": [
          { "tier": "presence", "text": "People already find you and you just need somewhere for them to land. You don't need search work, and we'd rather not sell it to you. That's" },
          { "tier": "agile", "text": "You can't say in a few words what someone would type to find you, or the business is still changing shape. There's no playbook to build from yet. That's" }
        ],
        "faqTopics": ["which-package", "ai-writing", "who-writes-copy", "what-monthly-covers", "just-hosting"]
      }
```

Agile:

```json
      "page": {
        "title": "Agile | Keepsite Media",
        "description": "For new or evolving offerings where the search strategy has to be invented. We research, meet every month, and change the site as you change. $4,200 to build, $595 a month.",
        "notIf": [
          { "tier": "growth", "text": "You can name the searches you want to win and what you sell isn't going to change much. Then the strategy can be set once and built in, and the better buy is" },
          { "tier": "range", "text": "You're really several businesses under one roof, each with its own customers. That's a size question more than a strategy question. That's" }
        ],
        "faqTopics": ["why-agile-costs-more", "do-we-meet", "ai-writing", "what-monthly-covers", "locked-in"]
      }
```

Range:

```json
      "page": {
        "title": "Range | Keepsite Media",
        "description": "One site for a business that's really several. Search research for every arm, and pages to match. Quoted, starting at $4,200 to build and $490 a month.",
        "notIf": [
          { "tier": "growth", "text": "You sell one or two things to one kind of customer. One search strategy covers it, and the right size is" }
        ],
        "faqTopics": ["why-range-no-price", "which-package", "how-long", "what-monthly-covers", "new-page"]
      }
```

Each `text` ends without a period because the page appends the linked tier name and the period: "…so that's Growth."

- [ ] **Step 2: Add the CMS fields**

In `public/admin/config.yml`, after the tier `ctaLabel` line (line 160) and at the same indentation, add:

```yaml
              - name: "page"
                label: "Package page"
                widget: "object"
                hint: "The page at /packages/<id>/."
                fields:
                  - { name: "title", label: "Page title", widget: "string", required: true }
                  - { name: "description", label: "Meta description", widget: "text", required: true, hint: "Aim for 150 to 160 characters. Prices in it must match the ones above." }
                  - name: "notIf"
                    label: "Not this one if"
                    widget: "list"
                    hint: "One per neighbouring package. The text ends mid-sentence; the page adds the linked package name and a period."
                    fields:
                      - { name: "tier", label: "Points to (package ID)", widget: "string", required: true, pattern: ['^[a-z0-9-]+$', "A package ID such as growth"] }
                      - { name: "text", label: "Text", widget: "text", required: true }
                  - { name: "faqTopics", label: "Questions to show", widget: "list", required: true, field: { name: "topic", label: "FAQ topic ID", widget: "string" }, hint: "Topic IDs from the FAQ page. An unknown one fails the build." }
```

- [ ] **Step 3: Create `TierLists.astro`**

```astro
---
// What we do beside what we don't, for one tier. The overview rows and the
// package pages share it; `level` keeps the heading order legal on each.
interface Props {
  weDo: string[];
  weDont: string[];
  level: 3 | 4;
}
const { weDo, weDont, level } = Astro.props;
const H = `h${level}` as 'h3' | 'h4';
---
<div class="tier-lists">
  <div>
    <H class="tier-h">What we do</H>
    <ul class="tier-includes">
      {weDo.map((line) => <li>{line}</li>)}
    </ul>
  </div>
  <div>
    <H class="tier-h">What we don't</H>
    <ul class="tier-excludes muted">
      {weDont.map((line) => <li>{line}</li>)}
    </ul>
  </div>
</div>

<style>
  .tier-lists { display: grid; gap: var(--space-3); }
  @media (min-width: 640px) {
    .tier-lists { grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  }
  .tier-h { font-size: var(--step-0); margin: 0 0 var(--space-1); max-width: none; }
  .tier-includes,
  .tier-excludes { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-1); }
  .tier-includes li { padding-left: 1.5rem; position: relative; }
  .tier-includes li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.62em;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-brand);
  }
  .tier-excludes li::before { content: "\2014  "; }
</style>
```

- [ ] **Step 4: Create `FaqList.astro`**

```astro
---
// A short list of questions with the plus marker, for pages that show a
// handful of FAQ items. /faq/ keeps its own list and the FAQPage JSON-LD.
interface Props {
  items: { topic: string; q: string; a: string }[];
}
const { items } = Astro.props;
---
<div class="faq-list">
  {items.map((item) => (
    <details class="faq-item">
      <summary>
        <span>{item.q}</span>
        <span class="marker" aria-hidden="true"></span>
      </summary>
      <p class="answer muted">{item.a}</p>
    </details>
  ))}
</div>

<style>
  .faq-list { display: grid; gap: var(--space-2); max-width: var(--maxw-prose); }
  .faq-item { border-bottom: 1px solid var(--color-border); }
  .faq-item summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) 0;
    min-height: 44px;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
    transition: color 120ms ease;
  }
  .faq-item summary::-webkit-details-marker { display: none; }
  .faq-item summary:hover,
  .faq-item[open] summary { color: var(--color-brand); }
  .marker { position: relative; flex: 0 0 auto; width: 14px; height: 14px; }
  .marker::before,
  .marker::after { content: ""; position: absolute; background: currentColor; transition: opacity 120ms ease; }
  .marker::before { top: 6px; left: 0; width: 14px; height: 2px; }
  .marker::after { top: 0; left: 6px; width: 2px; height: 14px; }
  .faq-item[open] .marker::after { opacity: 0; }
  .answer { margin: 0; padding-bottom: var(--space-3); }
</style>
```

- [ ] **Step 5: Create the route**

Create `src/pages/packages/[tier].astro`:

```astro
---
import type { GetStaticPaths } from 'astro';
import BaseLayout from '../../layouts/BaseLayout.astro';
import ClosingCta from '../../components/ClosingCta.astro';
import TierLists from '../../components/TierLists.astro';
import FaqList from '../../components/FaqList.astro';
import packages from '../../data/packages.json';
import process from '../../data/process.json';
import faq from '../../data/faq.json';
import { serviceNode, stageLines, faqItems, notIfLinks } from '../../scripts/tiers.mjs';

export const getStaticPaths: GetStaticPaths = () =>
  packages.tiers.map((tier) => ({ params: { tier: tier.id }, props: { tier } }));

type Tier = (typeof packages.tiers)[number];
const { tier } = Astro.props as { tier: Tier };

const siteUrl = Astro.site as URL;
const packagesUrl = new URL('/packages/', siteUrl).href;
const pageUrl = new URL(Astro.url.pathname, siteUrl).href;

const notIf = notIfLinks(tier, packages.tiers);
const stages = stageLines(process, tier.name);
const questions = faqItems(faq, tier.page.faqTopics);

const jsonLd = {
  '@context': 'https://schema.org',
  ...serviceNode(tier, { packagesUrl, pageUrl, businessId: `${siteUrl}#business` }),
};
---
<BaseLayout title={tier.page.title} description={tier.page.description} jsonLd={jsonLd}>

  <section class="section-tight">
    <div class="container">
      <h1>{tier.name}</h1>
      <p class="serif tier-line">{tier.line}</p>
      <p class="lead">{tier.sub}</p>
    </div>
  </section>

  <section class="section-tight">
    <div class="container">
      <h2>Who it's for</h2>
      <p class="who">{tier.who}</p>
      <p class="feeling muted">&ldquo;{tier.feeling}&rdquo;</p>
      <div class="lists">
        <TierLists weDo={tier.weDo} weDont={tier.weDont} level={3} />
      </div>
    </div>
  </section>

  <!-- The plain-truth moment: which neighbour to buy instead, and why. -->
  <section class="section section-slate">
    <div class="container">
      <h2 class="statement">Not this one if</h2>
      <div class="not-if">
        {notIf.map((n) => (
          <p>{n.text} <a class="slate-link" href={n.href}>{n.name}</a>.</p>
        ))}
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <h2>What the build looks like on {tier.name}</h2>
      <div class="rule-row stages">
        {stages.map((s) => (
          <div>
            <h3>{s.title}</h3>
            <p class="muted">{s.body}</p>
          </div>
        ))}
      </div>
      <p class="stages-more"><a class="link-arrow" href="/how-it-works/">How the three stages work</a></p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <h2>What it costs</h2>
      <div class="cost">
        <p class="cost-build price">
          {tier.quoted && <span class="cost-floor">Starting at </span>}{tier.buildPrice}
          <span class="cost-note muted">{tier.buildPriceNote}</span>
        </p>
        <p class="cost-monthly price muted">+ {tier.quoted ? 'Starting at ' : ''}{tier.monthlyPrice}/month</p>
        {tier.quoted && <p class="muted">Quoted after one conversation.</p>}
      </div>
      <p class="cost-terms">Half at kickoff and half at launch, or the build spread over twelve monthly payments. The monthly starts the day the site goes live.</p>
      <p><a class="btn" href={`/start/?tier=${tier.id}`}>{tier.ctaLabel}</a></p>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <h2>Questions about {tier.name}</h2>
      <FaqList items={questions} />
      <p class="more"><a class="link-arrow" href="/faq/">More questions</a></p>
    </div>
  </section>

  <ClosingCta
    heading={packages.closing.heading}
    sub={packages.closing.sub}
    ctaLabel={packages.closing.ctaLabel}
    ctaHref={packages.closing.ctaHref}
  />

</BaseLayout>

<style>
  .tier-line { font-size: var(--step-2); margin-bottom: var(--space-2); }
  .who { max-width: var(--maxw-lead); font-size: var(--step-1); }
  .feeling { margin-bottom: var(--space-4); }
  .lists { padding-top: var(--space-3); border-top: 1px solid var(--color-border); }

  .not-if { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
  .not-if p { font-size: var(--step-2); max-width: var(--maxw-lead); margin: 0; }

  .stages { margin-top: var(--space-4); }
  @media (min-width: 900px) { .stages { grid-template-columns: repeat(3, 1fr); } }
  .stages h3 { font-size: var(--step-1); margin-bottom: var(--space-1); }
  .stages-more { margin-top: var(--space-3); }

  .cost { margin: var(--space-3) 0; }
  .cost-build { font-size: var(--step-4); font-weight: 600; line-height: 1.05; letter-spacing: -0.02em; margin: 0; }
  .cost-note { display: block; font-size: var(--step--1); font-weight: 400; letter-spacing: 0; }
  .cost-monthly { font-size: var(--step-1); margin: var(--space-0) 0 0; }
  .cost-floor { font-size: var(--step--1); }
  .cost-terms { max-width: var(--maxw-lead); }
  .more { margin-top: var(--space-3); }
</style>
```

- [ ] **Step 6: Teach verify the new routes**

In `scripts/verify.mjs`:

In `PAGES`, after `'packages/index.html',` add:

```js
  'packages/presence/index.html',
  'packages/growth/index.html',
  'packages/agile/index.html',
  'packages/range/index.html',
```

In the script budget `expect` object, after the `'packages/index.html': 3,` entry (its value changes in Task 5) add:

```js
    // The layout's JSON-LD plus the tier's own Service node.
    'packages/presence/index.html': 2,
    'packages/growth/index.html': 2,
    'packages/agile/index.html': 2,
    'packages/range/index.html': 2,
```

After the `Service prices match the rendered prices` check add:

```js
// Each package page carries the same Service entity as the overview, with
// its url pointed at the page itself.
check('each package page carries its Service with the page url', () => {
  const expect = { presence: ['2400.00', '85.00'], growth: ['3600.00', '225.00'], agile: ['4200.00', '595.00'], range: ['4200.00', '490.00'] };
  for (const [id, [b, m]] of Object.entries(expect)) {
    const s = ld(`packages/${id}/index.html`)[1];
    if (s['@type'] !== 'Service') throw new Error(`${id}: type ${s['@type']}`);
    if (s['@id'] !== `https://www.keepsitemedia.com/packages/#${id}`) throw new Error(`${id}: @id ${s['@id']}`);
    if (s.url !== `https://www.keepsitemedia.com/packages/${id}/`) throw new Error(`${id}: url ${s.url}`);
    if (s.offers[0].price !== b) throw new Error(`${id} build ${s.offers[0].price}`);
    if (s.offers[1].priceSpecification.price !== m) throw new Error(`${id} monthly ${s.offers[1].priceSpecification.price}`);
  }
});
```

- [ ] **Step 7: Run the gate**

Run: `npm run gate`
Expected: green, including the four new routes in the emitted set, no broken links, two scripts on each tier page, and the slate audit passing on the "Not this one if" band. If `astro check` objects to `H` as a dynamic tag, change the `const H` line to `const H = ('h' + level) as any;` and re-run.

- [ ] **Step 8: Screenshot one tier page**

Serve `dist/` and screenshot `/packages/growth/` at 1280 and 400 (Task 10 step 2 script, with `pages` set to `['/packages/growth/']`). Check: slate band with "Not this one if" as the largest type, two ink links ending the two paragraphs, three stage columns on the alt band, the price block, five questions. Nothing rust inside the band.

- [ ] **Step 9: Commit**

```bash
git add src/components/TierLists.astro src/components/FaqList.astro "src/pages/packages/[tier].astro" src/data/packages.json public/admin/config.yml scripts/verify.mjs
git commit -m "Add a page for each package

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Packages overview as open rows

**Files:**
- Move: `src/pages/packages.astro` → `src/pages/packages/index.astro`
- Modify: that file (frontmatter, the tier section, the payment/sorter/monthly/comparison/add-ons/scope sections' backgrounds, the script, the styles)
- Modify: `scripts/verify.mjs` (script budget, tier anchors)

**Interfaces:**
- Consumes: `TierLists`, `FaqList` from Task 4; `serviceNode`, `priceAmount`, `linkPackages`, `faqItems`, `tierHref` from Task 2.

- [ ] **Step 1: Move the file**

```bash
git mv src/pages/packages.astro src/pages/packages/index.astro
```

Every relative import in the file gains one `../`: `'../layouts/BaseLayout.astro'` becomes `'../../layouts/BaseLayout.astro'`, and the same for `ClosingCta`, `packages.json` and `faq.json`.

- [ ] **Step 2: Replace the frontmatter's helpers**

Delete the `allFaqItems`/`scopeItems` block, the `amount` function and the `packagesJsonLd` object. Add the imports:

```ts
import TierLists from '../../components/TierLists.astro';
import FaqList from '../../components/FaqList.astro';
import { serviceNode, linkPackages, faqItems, tierHref } from '../../scripts/tiers.mjs';
```

and replace what was deleted with:

```ts
const scopeItems = faqItems(faq, packages.scopeFaq.topics);

const siteUrl = Astro.site as URL;
const businessId = `${siteUrl}#business`;
const packagesUrl = new URL('/packages/', siteUrl).href;

// The four Services live here with the overview as their url; each package
// page repeats its own node with the page url (same @id, same entity).
const packagesJsonLd = {
  '@context': 'https://schema.org',
  '@graph': packages.tiers.map((tier) => serviceNode(tier, { packagesUrl, pageUrl: packagesUrl, businessId })),
};
```

Keep `rows`, `groups` and `normalize` as they are.

- [ ] **Step 3: Replace the tier section**

Replace the whole `<section class="section-tight">` that holds `.tier-stack` with:

```astro
  <section class="section-tight">
    <div class="container">
      <h2 class="visually-hidden">The four packages</h2>
      <!-- Four open rows. Nothing about a package waits behind a marker:
           the promise, the lists and the price are all on the page. -->
      <div class="tier-rows">
        {packages.tiers.map((tier) => (
          <article class="tier" id={tier.id}>
            <div class="tier-lead">
              <h3 class="tier-name">{tier.name}</h3>
              <p class="serif tier-line">{tier.line}</p>
              <p class="tier-sub">{tier.sub}</p>
              <div class="tier-cost">
                <p class="tier-price price">
                  {tier.quoted && <span class="tier-floor">Starting at </span>}{tier.buildPrice}
                  <span class="tier-price-note muted">{tier.buildPriceNote}</span>
                </p>
                <p class="tier-monthly price muted">
                  + {tier.quoted ? 'Starting at ' : ''}{tier.monthlyPrice}/month
                </p>
                {tier.quoted && <p class="tier-quoted muted">Quoted after one conversation.</p>}
              </div>
              <p class="tier-actions">
                <a class="btn" href={`/start/?tier=${tier.id}`}>{tier.ctaLabel}</a>
                <a class="link-arrow" href={tierHref(tier.id)}>More about {tier.name}</a>
              </p>
            </div>
            <TierLists weDo={tier.weDo} weDont={tier.weDont} level={4} />
          </article>
        ))}
      </div>
    </div>
  </section>
```

- [ ] **Step 4: Set the section backgrounds and the slate sorter**

- Payment section: change `<section class="section section-alt">` to `<section class="section">`.
- Sorter section: change its opening tag to `<section class="section section-slate">`, change `<h2>{packages.sorter.heading}</h2>` to `<h2 class="statement">{packages.sorter.heading}</h2>`, and replace the answers line

  ```astro
  {q.answers.map((a) => <li><span>{a.a}</span> <strong>{a.package}</strong></li>)}
  ```

  with

  ```astro
  {q.answers.map((a) => (
    <li>
      <span>{a.a}</span>{' '}
      <strong>{linkPackages(a.package, packages.tiers).map((seg) =>
        seg.href ? <a class="slate-link" href={seg.href}>{seg.text}</a> : seg.text
      )}</strong>
    </li>
  ))}
  ```

- Monthly section: change its opening tag to `<section class="section section-alt">` (it already is; leave it).
- Comparison section: leave `<section class="section">`.
- Add-ons: leave `.section-alt`. Scope FAQ: leave white.
- Scope FAQ: replace the `<div class="scope-faq">…</div>` block with `<FaqList items={scopeItems} />`, and remove ` &rarr;` from the "More questions" link.
- Delete the whole `<script is:inline>…</script>` block (the hash-open script). Rows are always open; `id` on each `article` still anchors `/packages/#growth`.

- [ ] **Step 5: Replace the styles**

Delete these rules from the `<style>` block: `.tier-stack`, `.tier` (both), `#presence`…`#range`, `.tier-summary` (all), `.tier-head`, `.tier-name`, `.tier-summary:hover .tier-name`, `.tier-line`, `.tier-sub`, `.tier[open] .tier-summary`, `.tier-h`, `.tier-feeling`, `.tier-excludes li` (both), `.tier-bestfor`, `.tier-includes` (all four rules), `.tier-cta`, `.scope-faq`, `.faq-item` (all), `.marker` (all), `.answer`, and the `.sorter-a strong { color: var(--color-brand); }` line. Keep `.tier-cost`, `.tier-price`, `.tier-price-note`, `.tier-monthly`, `.tier-floor, .tier-quoted`, and everything for the monthly, pay, sorter, add-ons and comparison.

Add:

```css
  .tier-rows { display: grid; gap: var(--space-4); }
  /* One row per tier, the stripe color on its left edge. Range takes the
     logo's copper so the four stay distinct. */
  .tier {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3) 0 var(--space-3) var(--space-3);
    border-left: 6px solid var(--color-ink);
    scroll-margin-top: 6rem;
  }
  #presence { border-left-color: var(--color-slate); }
  #growth { border-left-color: var(--color-mustard); }
  #agile { border-left-color: var(--color-brand); }
  #range { border-left-color: var(--color-copper); }
  @media (min-width: 900px) {
    .tier { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); column-gap: var(--space-5); align-items: start; }
  }
  .tier-name { font-size: var(--step-3); margin-bottom: var(--space-0); }
  .tier-line { color: var(--color-brand); font-size: var(--step-1); margin-bottom: var(--space-2); }
  .tier-sub { max-width: var(--maxw-lead); }
  .tier-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin: var(--space-3) 0 0; }
  .sorter-a strong { color: var(--color-ink); }
```

- [ ] **Step 6: Update verify**

In `scripts/verify.mjs` change `'packages/index.html': 3,` to `'packages/index.html': 2,` and replace its comment with `// The layout's JSON-LD plus the four Service nodes. Rows are open; no script.`

After the `each package page carries its Service` check add:

```js
// Links from the home page and elsewhere use /packages/#<id>; the rows are
// articles now, so the anchors have to be on them.
check('every tier id anchors a row on the overview', () => {
  const h = read('packages/index.html');
  for (const t of data('packages.json').tiers) {
    if (!new RegExp(`<article[^>]*id="${t.id}"`).test(h)) throw new Error(`no row with id="${t.id}"`);
  }
});
```

- [ ] **Step 7: Run the gate**

Run: `npm run gate`
Expected: green. Two scripts on `/packages/`, four rows anchored, the slate audit passing on the sorter (only `.slate-link` anchors inside it), no `&rarr;` residue.

- [ ] **Step 8: Screenshot**

Serve `dist/` and screenshot `/packages/` at 1280 and 400. Check: four open rows with a colored left edge, price and button on the left, the two lists on the right at 1280 and stacked at 400; the sorter on slate with bold ink links; white on both sides of the slate band.

- [ ] **Step 9: Commit**

```bash
git add -A src/pages/packages scripts/verify.mjs
git commit -m "Open the package tiers into rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: About page and navigation

**Files:**
- Create: `src/data/about.json`
- Create: `src/pages/about.astro`
- Modify: `src/data/site.json` (nav)
- Modify: `src/pages/404.astro` (link list)
- Modify: `public/admin/config.yml` (new file entry after the FAQ page entry, inside the `settings` collection)
- Modify: `scripts/verify.mjs` (`PAGES`, script budget)
- Modify: `README.md` (lines 16 and 18)

**Interfaces:**
- Produces: `/about/`. `about.json` shape: `{ meta, heading, lead, statement: { heading, body[] }, how: { heading, pillars[] }, photo: { src, alt }, no: { heading, items[] }, closing }`.

- [ ] **Step 1: Create `about.json`**

```json
{
  "meta": {
    "title": "Who we are | Keepsite Media",
    "description": "Keepsite is two people who run businesses too. We build your website and keep it running, so it stays off your list."
  },
  "heading": "Who we are",
  "lead": "Keepsite builds and runs websites for business owners who have other things to do. We're small on purpose, and we run businesses of our own, so we know what the evenings look like.",
  "statement": {
    "heading": "We run businesses too.",
    "body": [
      "We know what it's like to answer client emails at 10pm, to lose a week to something that should have taken a morning, and to feel like the only one holding it all together. Your website was about to be one more of those things.",
      "That's the whole reason Keepsite exists. We take the website off your plate, make the decisions you don't have room for, and tell you what's happening in plain words."
    ]
  },
  "how": {
    "heading": "How we work",
    "pillars": [
      { "title": "Make it useful.", "body": "Every site has a job. We find out what yours is, build for that, and leave out the rest." },
      { "title": "Keep it simple.", "body": "Three decisions, one round of changes at each, and no homework in between." },
      { "title": "Show your work.", "body": "Clear prices, clear scope, and a summary every quarter you can read in two minutes." },
      { "title": "Build for real life.", "body": "We run businesses too. We know what it's like to be the only one holding it all together. The site fits around your week, not the other way round." }
    ]
  },
  "photo": { "src": "", "alt": "" },
  "no": {
    "heading": "What we say no to",
    "items": [
      "Selling you the bigger package. If the smaller one is enough, we'll say so, and we'll say why.",
      "Selling pages one at a time. If what you need is more strategy, we move you to the package that covers it.",
      "Giving you a login. You send us the change, we make it. Nothing to learn, nothing to break."
    ]
  },
  "closing": { "heading": "Keep your business moving.", "sub": "We'll take care of the website.", "ctaLabel": "Start your site", "ctaHref": "/start/" }
}
```

- [ ] **Step 2: Create `about.astro`**

```astro
---
// Who we are, in the voice guide's terms: we run businesses too, and that is
// why we understand the client. The wedding work that taught us that is never
// the subject. The page speaks as "we" and names nobody.
import BaseLayout from '../layouts/BaseLayout.astro';
import ClosingCta from '../components/ClosingCta.astro';
import about from '../data/about.json';
---
<BaseLayout title={about.meta.title} description={about.meta.description}>

  <section class="section-tight">
    <div class="container">
      <h1>{about.heading}</h1>
      <p class="lead">{about.lead}</p>
    </div>
  </section>

  <section class="section section-slate">
    <div class="container">
      <h2 class="statement">{about.statement.heading}</h2>
      <div class="statement-body">
        {about.statement.body.map((p) => <p>{p}</p>)}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <h2>{about.how.heading}</h2>
      <div class="rule-row pillars">
        {about.how.pillars.map((pillar) => (
          <div>
            <h3>{pillar.title}</h3>
            <p class="muted">{pillar.body}</p>
          </div>
        ))}
      </div>
      <!-- Renders nothing until a photograph exists. No stock, no placeholder. -->
      {about.photo.src && (
        <img class="photo" src={about.photo.src} alt={about.photo.alt} width="1600" height="1000" loading="lazy" decoding="async" />
      )}
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <h2>{about.no.heading}</h2>
      <ul class="no-list">
        {about.no.items.map((item) => <li>{item}</li>)}
      </ul>
    </div>
  </section>

  <ClosingCta
    heading={about.closing.heading}
    sub={about.closing.sub}
    ctaLabel={about.closing.ctaLabel}
    ctaHref={about.closing.ctaHref}
  />

</BaseLayout>

<style>
  .statement-body { margin-top: var(--space-3); display: grid; gap: var(--space-2); }
  .statement-body p { font-size: var(--step-2); max-width: var(--maxw-lead); margin: 0; }
  .pillars { margin-top: var(--space-4); }
  .pillars h3 { font-size: var(--step-1); margin-bottom: var(--space-1); }
  .photo { display: block; width: 100%; height: auto; margin-top: var(--space-5); border-radius: var(--radius); }
  .no-list { list-style: none; padding: 0; margin: var(--space-3) 0 0; display: grid; gap: var(--space-2); max-width: var(--maxw-prose); }
  .no-list li { padding: var(--space-2) 0; border-top: 1px solid var(--color-border); font-size: var(--step-1); }
</style>
```

- [ ] **Step 3: Add About to the nav and the 404 list**

In `src/data/site.json`, insert after the "How it works" item:

```json
    {
      "label": "About",
      "href": "/about/",
      "cta": false
    },
```

In `src/pages/404.astro`, insert after the How it works line:

```astro
        <li><a href="/about/">About</a></li>
```

- [ ] **Step 4: Add the CMS entry**

In `public/admin/config.yml`, inside the `settings` collection's `files:` list, after the FAQ page entry (the one with `file: "src/data/faq.json"` and its fields), add at the same indentation as `- name: "faq"`:

```yaml
      - name: "about"
        label: "About Page"
        file: "src/data/about.json"
        fields:
          - name: "meta"
            label: "Search listing"
            widget: "object"
            fields:
              - { name: "title", label: "Page title", widget: "string", required: true }
              - { name: "description", label: "Meta description", widget: "text", required: true }
          - { name: "heading", label: "Heading", widget: "string", required: true }
          - { name: "lead", label: "Lead", widget: "text", required: true }
          - name: "statement"
            label: "We run businesses too"
            widget: "object"
            fields:
              - { name: "heading", label: "Statement", widget: "string", required: true, hint: "The largest line on the page." }
              - { name: "body", label: "Paragraphs", widget: "list", required: true, field: { name: "p", label: "Paragraph", widget: "text" } }
          - name: "how"
            label: "How we work"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - name: "pillars"
                label: "Pillars"
                widget: "list"
                fields:
                  - { name: "title", label: "Title", widget: "string" }
                  - { name: "body", label: "Body", widget: "text" }
          - name: "photo"
            label: "Photo"
            widget: "object"
            fields:
              - { name: "src", label: "Image", widget: "image", required: false, hint: "Leave empty and nothing renders. No stock photos." }
              - { name: "alt", label: "Alt text", widget: "string", required: false }
          - name: "no"
            label: "What we say no to"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "items", label: "Lines", widget: "list", required: true, field: { name: "line", label: "Line", widget: "string" } }
          - name: "closing"
            label: "Closing CTA"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "sub", label: "Subhead", widget: "string", required: true }
              - { name: "ctaLabel", label: "Button label", widget: "string", required: true }
              - { name: "ctaHref", label: "Button link", widget: "string", required: true }
```

- [ ] **Step 5: Update verify and the README**

In `scripts/verify.mjs`, add `'about/index.html',` to `PAGES` after `'faq/index.html',` and `'about/index.html': 1,` to the script budget after `'faq/index.html': 2,`.

In `README.md` line 16, change the file list to: `` `site.json`, `home.json`, `packages.json`, `process.json`, `faq.json`, `about.json`, `privacy.json` ``. Line 18: change "holds the five page files (Site & Navigation, Home Page, Packages Page, How It Works, FAQ)" to "holds the six page files (Site & Navigation, Home Page, Packages Page, How It Works, FAQ, About Page)". Add after that paragraph:

```markdown
Each package also has its own page at `/packages/<id>/`, built from the tier's fields in `packages.json` plus its **Package page** object (title, description, the "Not this one if" lines and which FAQ topics to show). An unknown package ID or FAQ topic there fails the build.
```

- [ ] **Step 6: Run the gate**

Run: `npm run gate`
Expected: green. `/about/` emitted and indexed, one script, About in both navs, no persona name, slate audit passing.

- [ ] **Step 7: Screenshot the header at four widths**

Serve `dist/` and screenshot `/about/` at 1280, 1000, 820 and 400 (Task 10 step 2 script with `widths` set to `[1280, 1000, 820, 400]`). Expected: at 1280 and 1000 the four links and the button sit in one row beside the logo; at 820 the same, with nothing wrapping under the logo; at 400 the Menu toggle shows and the panel lists five items with the button last. If the row wraps at 820, lower the `.nav-wide` gap in `src/components/Header.astro` from `var(--space-3)` to `var(--space-2)` and re-shoot.

- [ ] **Step 8: Commit**

```bash
git add src/data/about.json src/pages/about.astro src/data/site.json src/pages/404.astro public/admin/config.yml scripts/verify.mjs README.md src/components/Header.astro
git commit -m "Add the About page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Home page

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/data/home.json` (remove `why`)
- Modify: `public/admin/config.yml` (remove the `why` object under Home Page, lines 103-113)
- Modify: `src/components/WorkCard.astro` (line 23)
- Modify: `src/pages/start/thanks.astro` (line 18)

**Interfaces:**
- Consumes: `tierHref` from Task 2, `.section-slate` and `.statement` from Task 1.

- [ ] **Step 1: Restructure the sections**

In `src/pages/index.astro`:

Add `import { tierHref } from '../scripts/tiers.mjs';` to the frontmatter.

Cut the `<div class="problem">…</div>` block out of the hero section and replace it, directly after the hero section's closing `</section>`, with:

```astro
  <!-- 2: the problem, said out loud. The page's one slate band. -->
  <section class="section section-slate">
    <div class="container">
      <h2 class="statement">{home.problem.heading}</h2>
      <p class="lead problem-body">{home.problem.body}</p>
    </div>
  </section>
```

Change the hero section's comment to `<!-- 1: hero -->`. Change the solution section's opening tag from `<section class="section section-alt">` to `<section class="section">`. Change the packages section's opening tag from `<section class="section">` to `<section class="section section-alt">`, and its tier links from `` href={`/packages/#${tier.id}`} `` to `href={tierHref(tier.id)}`. Delete the whole `<!-- 5: why keepsite -->` section. Remove ` &rarr;` from both `link-arrow` anchors (packages and work).

- [ ] **Step 2: Fix the styles**

Delete `.problem { margin-top: var(--space-6); }`, `.problem h2 { max-width: 20ch; }`, `.pillars { … }` and `.pillars h3 { … }`. Add:

```css
  .problem-body { margin-top: var(--space-3); font-size: var(--step-2); max-width: var(--maxw-lead); }
```

- [ ] **Step 3: Remove `why` from the data and the CMS**

In `src/data/home.json`, delete the `"why": { … }` object (from `"why": {` through its closing `},`). In `public/admin/config.yml`, delete the `- name: "why"` block under Home Page (through the `- { name: "body", label: "Body", widget: "text" }` line that ends its pillars list).

- [ ] **Step 4: Remove the last two arrows**

In `src/components/WorkCard.astro` change `<span class="work-visit">Visit site &rarr;</span>` to `<span class="work-visit">Visit site</span>`. In `src/pages/start/thanks.astro` change `Back to the homepage &rarr;</a>` to `Back to the homepage</a>`. Then `grep -rn "&rarr;\|→" src/pages src/components --include=*.astro | grep -v office` must print nothing.

- [ ] **Step 5: Run the gate**

Run: `npm run gate`
Expected: green. Home still has one script; the tier links resolve to the four package pages; the slate audit passes (the band holds an `h2.statement` and a `p.lead`, no anchors).

- [ ] **Step 6: Screenshot**

Serve `dist/` and screenshot `/` at 1280 and 400. Check: white hero, slate band right under it with the problem line as the largest type on the page, white solution, alt packages band, closing. No "Why Keepsite". No arrows. At 400 the statement fits without breaking a word.

- [ ] **Step 7: Commit**

```bash
git add src/pages/index.astro src/data/home.json public/admin/config.yml src/components/WorkCard.astro src/pages/start/thanks.astro
git commit -m "Put the problem on a slate band

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: How it works ends on relief

**Files:**
- Modify: `src/pages/how-it-works.astro` (the `.expectations` section at lines 244-264 and the `.expectations`/`.signature` styles near lines 693-699)
- Modify: `src/data/process.json` (`wontHaveTo.items`)

**Interfaces:**
- Consumes: `Checklist` from Task 3 with `tone="ink"`.

- [ ] **Step 1: Rephrase the items as things to cross off**

In `src/data/process.json` replace `wontHaveTo.items` with:

```json
    "items": [
      "Web-building homework",
      "A blank page to stare at",
      "Logging into anything",
      "Switching off the tools you already use",
      "Decisions about hosting, plugins, or platforms"
    ]
```

- [ ] **Step 2: Replace the expectations section**

Add `import Checklist from '../components/Checklist.astro';` to the frontmatter.

Replace the `<section class="section section-alt">` that holds `.expectations` and the signature (everything from that opening tag through its `</section>`) with:

```astro
  <section class="section">
    <div class="container">
      <h2>{process.needFromYou.heading}</h2>
      <ul class="need">
        {process.needFromYou.items.map((item) => <li>{item}</li>)}
      </ul>
      {signature?.name && signature?.role && (
        <p class="signature">&mdash; {signature.name}, {signature.role}</p>
      )}
    </div>
  </section>

  <!-- The page ends on the relief: the homework, crossed off by hand. The
       hero's list, reprised once, in ink because it sits on slate. -->
  <section class="section section-slate">
    <div class="container wont">
      <h2 class="statement">{process.wontHaveTo.heading}</h2>
      <Checklist
        items={process.wontHaveTo.items.map((text) => ({ text, done: true }))}
        tone="ink"
        doneLabel="(crossed off)"
      />
    </div>
  </section>
```

- [ ] **Step 3: Replace the styles**

Delete `.expectations ul { … }` and `.expectations li { … }`. Add:

```css
  .need { padding-left: 1.1rem; margin: 0; max-width: var(--maxw-prose); }
  .need li { margin-bottom: var(--space-2); color: var(--color-muted); }

  .wont { display: grid; gap: var(--space-4); }
  @media (min-width: 900px) {
    .wont { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; column-gap: var(--space-5); }
    .wont .statement { margin-bottom: 0; }
  }
```

- [ ] **Step 4: Run the gate**

Run: `npm run gate`
Expected: green. Two scripts on the page as before; the slate audit passes (the checklist's `figcaption` is absent, and its `visually-hidden` spans carry no forbidden class).

- [ ] **Step 5: Screenshot**

Serve `dist/` and screenshot `/how-it-works/` at 1280 and 400. Check: the need-from-you list on white, then the slate band with the statement on the left and five ticked, scratched-out lines on the right at 1280 (stacked at 400), all strokes ink, then the closing band.

- [ ] **Step 6: Commit**

```bash
git add src/pages/how-it-works.astro src/data/process.json
git commit -m "End how-it-works on the crossed-off list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: FAQ group index

**Files:**
- Modify: `src/pages/faq.astro`

- [ ] **Step 1: Add ids and the index**

In the frontmatter add:

```ts
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
```

Replace the second section (the one holding `.faq-groups`) with:

```astro
  <section class="section-tight">
    <div class="container faq-layout">
      <nav class="faq-index" aria-label="Question groups">
        <ul>
          {faq.groups.map((group) => (
            <li><a href={`#${slug(group.title)}`}>{group.title}</a></li>
          ))}
        </ul>
      </nav>
      <div class="faq-groups">
        {faq.groups.map((group) => (
          <div class="faq-group" id={slug(group.title)}>
            <h2>{group.title}</h2>
            <div class="faq-list">
              {group.items.map((item) => (
                <details class="faq-item" id={item.topic}>
                  <summary>
                    <span>{item.q}</span>
                    <span class="marker" aria-hidden="true"></span>
                  </summary>
                  <p class="answer muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Add the layout styles**

Add to the `<style>` block:

```css
  .faq-layout { display: grid; gap: var(--space-4); }
  .faq-index ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); }
  .faq-index a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 700;
    text-decoration: none;
  }
  .faq-index a:hover { text-decoration: underline; }
  .faq-group { scroll-margin-top: 6rem; }
  @media (min-width: 900px) {
    .faq-layout { grid-template-columns: 14rem minmax(0, 1fr); column-gap: var(--space-5); align-items: start; }
    /* Sticks under the 63px header (60 min-height plus the 3px rule). */
    .faq-index { position: sticky; top: calc(63px + var(--space-3)); }
    .faq-index ul { display: grid; gap: 0; }
    .faq-index li { border-top: 1px solid var(--color-border); }
    .faq-index a { min-height: 48px; width: 100%; }
  }
```

- [ ] **Step 3: Run the gate**

Run: `npm run gate`
Expected: green. Still two scripts on `/faq/`, still one FAQPage node with every question.

- [ ] **Step 4: Screenshot**

Serve `dist/` and screenshot `/faq/` at 1280 and 400. Check: at 1280 the five group names down the left, the groups on the right; at 400 the names run as a wrapped row under the lead. Click-through by eye is not possible in a screenshot, so also check `dist/faq/index.html` contains `id="getting-started"` and `href="#getting-started"`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/faq.astro
git commit -m "Add a group index to the FAQ

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Whole-site check

**Files:**
- No repo changes expected. Fixes found here go into the file that owns them, with their own commit.

- [ ] **Step 1: Run the gate one more time on a clean tree**

Run: `git status --short` (expect only the pre-existing untracked docs), then `npm run gate`.
Expected: green.

Then confirm the five new pages are in the sitemap:

```bash
for u in packages/presence packages/growth packages/agile packages/range about; do grep -c "keepsitemedia.com/$u/" dist/sitemap-0.xml; done
```

Expected: `1` five times.

- [ ] **Step 2: Screenshot every public page**

The build machine lacks `libgbm`, which puppeteer's bundled Chrome needs. Once per machine, from the scratchpad directory:

```bash
mkdir -p libs && cd libs
apt-get download libgbm1 libdrm2 libxkbcommon0 libwayland-server0
for d in *.deb; do dpkg -x "$d" .; done
cd ..
```

Then save this as `shoot.mjs` in the scratchpad, copy it to `scripts/_shoot.tmp.mjs` in the repo so it can resolve puppeteer, and delete the copy afterwards (it is never committed):

```js
import puppeteer from 'puppeteer';
const base = process.argv[2] || 'http://localhost:4174';
const out = process.argv[3];
const pages = ['/', '/packages/', '/packages/presence/', '/packages/growth/', '/packages/agile/', '/packages/range/', '/about/', '/how-it-works/', '/faq/', '/start/', '/lockii/', '/404.html'];
const widths = [1280, 400];
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.EXE, args: ['--no-sandbox'] });
for (const w of widths) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: 'networkidle0' });
    const name = (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\.html$/, '').replace(/\//g, '-')) + '-' + w + '.png';
    await page.screenshot({ path: `${out}/${name}`, fullPage: true });
    console.log(name);
  }
  await page.close();
}
await browser.close();
```

Run, with `$S` the scratchpad directory:

```bash
(cd dist && python3 -m http.server 4174 > /dev/null 2>&1 &)
export LD_LIBRARY_PATH=$S/libs/usr/lib/x86_64-linux-gnu
EXE=$HOME/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
cp $S/shoot.mjs scripts/_shoot.tmp.mjs && EXE=$EXE node scripts/_shoot.tmp.mjs http://localhost:4174 $S/shots; rm scripts/_shoot.tmp.mjs
```

Expected: 24 files. Read each and check, per the spec's verification list: one slate band on home, packages, each package page, how it works and About, none on FAQ, Start or Lockii; ink-only text inside every band; the statement as the largest type on its page; no arrows anywhere; no heading broken mid-word at 400; the Lockii page unchanged apart from larger headings.

- [ ] **Step 3: Check the narrowest width**

Re-run the script with `widths = [320]` for `/`, `/packages/growth/` and `/about/`. Expected: no horizontal scroll (page width equals 320 in the screenshot), statements wrap by word.

- [ ] **Step 4: Lighthouse accessibility on the new pages**

```bash
export CHROME_PATH=$EXE
for p in / /packages/ /packages/growth/ /about/ /how-it-works/ /faq/; do
  npx lighthouse "http://localhost:4174$p" --only-categories=accessibility --chrome-flags="--headless --no-sandbox" --output=json --output-path=$S/lh$(echo $p | tr / -).json --quiet
  node -e "const r=require('$S/lh$(echo $p | tr / -).json');console.log('$p', r.categories.accessibility.score)"
done
```

Expected: `1` for every page. Netlify runs the same audit on deploy and fails the build under 100, so a lower score here has to be fixed before pushing. The likeliest cause is a contrast pair inside a slate band; the slate audit should have caught it, so look for a color set inline in a page's own `<style>`.

- [ ] **Step 5: Stop the server and report**

```bash
pkill -f "http.server 4174"
```

Report which pages were shot, what the Lighthouse scores were, and anything fixed along the way with its commit hash.
