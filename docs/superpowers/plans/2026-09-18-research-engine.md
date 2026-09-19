# Research Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pairwise SERP-overlap ladder with a keyword-by-business matrix that clusters keywords into pages, names each page's kind, confidence and reason, gates pages on imported search volume, and shows the whole study as one matrix on the tab and in the report.

**Architecture:** `research.mjs` stays the single home of every rule and every client-facing sentence, as pure functions over a round. The engine is four layers that each take the previous one's output: `matrix()` → `similarities()` → `cluster()` → `pageList()`, with `kindOf()`, `standingOf()`, `confidence()` and `reasonOf()` decorating each page row. The action handler gains a `volume` op and loses `read`; the tab, compare page, rounds page and PDF report render what `pageList()` and `studyView()` return. Validation is three scripts under `scripts/`, run by hand from an export.

**Tech Stack:** Node ESM, `node --test`, Astro 5 server pages, pdf-lib, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-18-research-engine-design.md`

## Global Constraints

- Every threshold and every sentence a client might read lives in `research.mjs` and nowhere else.
- `CUT = 0.25` and `FLOOR = 10` are provisional; each carries a comment naming the date and the validation that set it (or that none has yet).
- Page kinds are exactly `['Homepage', 'Service page', 'Location page', 'Article', 'Other']` (`KINDS`); the result classifications in `PAGE_TYPES` are unchanged and never become a page kind.
- The rarity weight is `ln((N + 1) / df)`; a business with any Directory result weighs 0.
- Rank weight is the DCG discount `1 / log2(rank + 1)`.
- Similarity is the weighted Jaccard in spec §3.3 with half credit for the same business on a different URL.
- Closed rounds render from their stored `pages`; only the open round is recomputed.
- The office server makes no external calls. Volume enters by CSV upload only.
- Office pages are forms and full-page posts. The matrix is an HTML table with no script.
- Commit messages: imperative subject under 50 characters, body only when the reason is not obvious from the diff, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Comments explain why, never what. No em-dashes in user-facing copy.
- Run tests with `node --test netlify/functions/lib/office/<file>.test.mjs`. Run everything with `npm test`. The Astro build (`npm run check && npm run build`) is red from Task 5 until Task 9 because the pages import functions Task 5 removes; `npm test` must be green after every task, and `npm run gate` is green from Task 9 on.

## File map

| File | Responsibility |
|---|---|
| `netlify/functions/lib/office/research.mjs` | rules: businesses, matrix, similarity, clustering, kinds, volume, standing, page list, pair description, study view |
| `netlify/functions/lib/office/research.test.mjs` | rule tests |
| `netlify/functions/lib/office/fixtures/makeup-by-brinley.json` | the 2026-09-18 export, one study document, for shape assertions |
| `netlify/functions/lib/office/actions/research.mjs` | ops over the open round |
| `netlify/functions/lib/office/actions/research.test.mjs` | op tests |
| `netlify/functions/lib/office/pdf.mjs` | `Writer.grid()` |
| `netlify/functions/lib/office/research-report.mjs` | what the report says |
| `netlify/functions/lib/office/research-report.test.mjs` | report tests |
| `src/components/office/StudyMatrix.astro` | the matrix table, shared by the tab and the rounds page |
| `src/components/office/Research.astro` | the tab |
| `src/pages/office/research/[slug]/compare.astro` | one pair, read only |
| `src/pages/office/research/[slug]/rounds/[id].astro` | a frozen round |
| `src/styles/office.css` | matrix shades and block edges |
| `scripts/validate-clusters.mjs`, `scripts/validate-captures.mjs` | validation, run by hand |
| `docs/research-validation.md` | the findings, written by hand |
| `README.md` | the Search research section |

---

### Task 1: Businesses behind platform profiles

**Files:**
- Modify: `netlify/functions/lib/office/research.mjs` (the `SOCIAL` table and `businessOf`, around lines 40–60)
- Test: `netlify/functions/lib/office/research.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `businessOf(url)` resolving Yelp, WeddingWire, The Knot, Houzz and Bark profiles to `host/handle`; `isProfile(url)` true for them. `classify` is untouched: a profile is a Homepage as today, a platform list page is a Directory as today.

- [ ] **Step 1: Write the failing test**

Append to `research.test.mjs`:

```js
// A vendor page on a listing site is that vendor, not the site: two Yelp
// pages are two businesses, and one vendor ranking for two searches is one
// business answering both. A category or search page on the same site is
// the site speaking and stays the bare host.
test('businessOf names a vendor profile on a listing site and leaves its lists as the site', () => {
  assert.equal(businessOf('https://www.yelp.com/biz/utah-bridal-hair-and-makeup-american-fork'), 'yelp.com/utah-bridal-hair-and-makeup-american-fork');
  assert.equal(businessOf('https://www.yelp.com/search?find_desc=makeup'), 'yelp.com');
  assert.equal(businessOf('https://www.weddingwire.com/biz/beauty-on-location-studio-denver/abc123'), 'weddingwire.com/beauty-on-location-studio-denver');
  assert.equal(businessOf('https://www.weddingwire.com/c/ut-utah/salt-lake-city/wedding-hair-makeup/12-vendors.html'), 'weddingwire.com');
  assert.equal(businessOf('https://www.weddingwire.com/wedding-forums/salon-vs-on-site/1'), 'weddingwire.com');
  assert.equal(businessOf('https://www.theknot.com/marketplace/makeup-by-brinley-provo-ut-2049211'), 'theknot.com/makeup-by-brinley-provo-ut-2049211');
  assert.equal(businessOf('https://www.theknot.com/marketplace/beauty-services-salt-lake-city-ut'), 'theknot.com');
  assert.equal(businessOf('https://www.theknot.com/content/average-cost-wedding-hair-makeup'), 'theknot.com');
  assert.equal(businessOf('https://www.houzz.com/pro/brinley-beauty'), 'houzz.com/brinley-beauty');
  assert.equal(businessOf('https://www.houzz.com/professionals/makeup-artists'), 'houzz.com');
  assert.equal(businessOf('https://www.bark.com/en/us/b/brinley-beauty/abc/'), 'bark.com');
  assert.equal(isProfile('https://www.yelp.com/biz/x'), true);
  assert.equal(isProfile('https://www.yelp.com/search'), false);
});

test('classify keeps a vendor profile a Homepage and a listing-site list a Directory', () => {
  assert.equal(classify({ url: 'https://www.yelp.com/biz/x', title: 'X' }), 'Homepage');
  assert.equal(classify({ url: 'https://www.weddingwire.com/c/ut-utah/x', title: 'Best Makeup' }), 'Directory');
  assert.equal(classify({ url: 'https://www.theknot.com/marketplace/x-provo-ut-12345', title: 'X' }), 'Homepage');
  assert.equal(classify({ url: 'https://www.theknot.com/marketplace/beauty-services-provo-ut', title: 'Beauty' }), 'Directory');
});
```

`isProfile` is already exported; add it to the import list at the top of the test file.

Note: the existing `classify follows the rules in order` test asserts `yelp.com/biz/x` is a Directory. Change that line to a Yelp search URL: `classify({ url: 'https://www.yelp.com/search?find_desc=x', title: 'Best' }, areas)` → `'Directory'`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: the two new tests FAIL (`yelp.com` instead of `yelp.com/utah-bridal-...`).

- [ ] **Step 3: Implement**

Replace the `SOCIAL` table and `businessOf` in `research.mjs` with:

```js
// A social profile or a vendor page on a listing site is a business's own
// page on someone else's domain: two different Instagram accounts are two
// different artists, and one account ranking for two searches is one artist
// answering both. Only a profile URL gets the handle; a post, group, forum
// thread, category list or search page is the platform speaking and stays
// the bare host. `reserved` names the platform's own first segments; `under`
// names the segment a profile sits beneath.
const SOCIAL = {
  __proto__: null,
  'instagram.com': { reserved: ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'legal'] },
  'facebook.com': { reserved: ['groups', 'posts', 'share', 'watch', 'events', 'marketplace', 'people', 'pages', 'photo', 'photos', 'story.php', 'permalink.php', 'profile.php', 'login', 'help', 'public', 'hashtag', 'reel', 'videos'] },
  'tiktok.com': { reserved: ['tag', 'discover', 'search', 'explore', 'music', 'foryou', 'live', 'embed', 'legal'], at: true },
  'yelp.com': { under: 'biz' },
  'weddingwire.com': { under: 'biz' },
  // The Knot's category lists live under marketplace too; a vendor page ends
  // in its numeric id and a category slug does not.
  'theknot.com': { under: 'marketplace', endsInId: true },
  'houzz.com': { under: 'pro' },
};
export function businessOf(url) {
  const u = parse(url);
  const host = domainOf(url);
  const rule = u && SOCIAL[host];
  if (!rule) return host;
  const segments = u.pathname.split('/').filter(Boolean);
  if (rule.under) {
    const handle = segments[0] === rule.under && segments[1] ? segments[1].toLowerCase() : null;
    const profile = handle && (!rule.endsInId || /\d+$/.test(handle));
    return profile ? `${host}/${handle}` : host;
  }
  const handle = segments[0]?.toLowerCase();
  const profile = handle && !rule.reserved.includes(handle)
    && (!rule.at || handle.startsWith('@'))
    && (rule.at || segments.length === 1);
  return profile ? `${host}/${handle}` : host;
}
```

Bark is left as a plain directory: its profile URLs carry a locale and a `b` segment that vary by market, and a rule guessed wrong would split one business into several. Remove `bark.com` from the spec's table wording only if you touch the spec; the code needs no entry.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: PASS. If `businessOf names a social profile by its handle...` fails, the Instagram/Facebook/TikTok behaviour regressed; the `reserved` and `at` branches must match the old code exactly.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/research.mjs netlify/functions/lib/office/research.test.mjs
git commit -m "Name the vendor behind a listing-site profile

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The matrix and similarity

**Files:**
- Modify: `netlify/functions/lib/office/research.mjs` (add after `primaryPageOf`)
- Test: `netlify/functions/lib/office/research.test.mjs`

**Interfaces:**
- Consumes: `businessOf`, `normalizeUrl`, `captured(round)` (module-private helper already present).
- Produces:
  - `rankWeight(rank) → number`
  - `matrix(round, keywordIds = null) → { keywords: Keyword[], businesses: string[], cells: { [kid]: { [biz]: { w: number, url: string } } }, weight: { [biz]: number } }`
  - `similarity(m, aId, bId) → number in [0, 1]`
  - `similarities(m) → { [aId]: { [bId]: number } }` with the diagonal 1.

- [ ] **Step 1: Write the failing tests**

Append to `research.test.mjs` (the file already defines `r()` and `dr()` helpers and imports `emptyRound`):

```js
// A round with the given SERPs, keyword ids k1..kn, every result auto-typed
// from its URL. Rank is position in the list.
const roundWith = (serps, areas = []) => {
  const ids = Object.keys(serps);
  const round = { ...emptyRound('r1'), areas, keywords: ids.map((id) => ({ id, text: serps[id].text ?? id, cluster: 'C', arm: '', source: 'manual' })) };
  for (const id of ids) {
    round.serps[id] = { capturedAt: '2026-09-18T00:00:00.000Z', query: id, related: [],
      results: serps[id].urls.map((url, i) => ({ rank: i + 1, url, title: url, domain: businessOf(url), pageType: classify({ url, title: url }, areas), typeSource: 'auto' })) };
  }
  return round;
};

test('rankWeight is the DCG discount', () => {
  assert.equal(rankWeight(1), 1);
  assert.ok(Math.abs(rankWeight(4) - 0.4307) < 0.001);
  assert.ok(Math.abs(rankWeight(8) - 0.3155) < 0.001);
});

test('matrix holds each business at its best rank, weighted by rarity, directories at zero', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/', 'https://b.com/', 'https://www.yelp.com/search?x=1', 'https://a.com/about/'] },
    k2: { urls: ['https://b.com/', 'https://c.com/', 'https://www.yelp.com/search?x=2'] },
    k3: { urls: ['https://c.com/', 'https://d.com/'] },
  });
  const m = matrix(round);
  assert.deepEqual(m.keywords.map((k) => k.id), ['k1', 'k2', 'k3']);
  assert.equal(m.cells.k1['a.com'].w, 1, 'best rank wins, not the later /about/ page');
  assert.equal(m.cells.k1['a.com'].url, 'a.com');
  assert.ok(Math.abs(m.cells.k1['b.com'].w - rankWeight(2)) < 1e-9);
  assert.equal(m.cells.k3['a.com'], undefined);
  // ln((3 + 1) / df): a.com ranks once, b.com twice.
  assert.ok(Math.abs(m.weight['a.com'] - Math.log(4 / 1)) < 1e-9);
  assert.ok(Math.abs(m.weight['b.com'] - Math.log(4 / 2)) < 1e-9);
  assert.equal(m.weight['yelp.com'], 0, 'a directory weighs nothing however rare');
  assert.ok(m.businesses.includes('yelp.com'), 'but it is still a column, for display');
});

test('matrix over a subset of keywords counts rarity within the subset', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/'] }, k2: { urls: ['https://a.com/'] }, k3: { urls: ['https://a.com/'] },
  });
  const m = matrix(round, ['k1', 'k2']);
  assert.deepEqual(m.keywords.map((k) => k.id), ['k1', 'k2']);
  assert.ok(Math.abs(m.weight['a.com'] - Math.log(3 / 2)) < 1e-9);
});

test('similarity is a weighted Jaccard: 1 for the same list, 0 for disjoint, symmetric', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/', 'https://b.com/'] },
    k2: { urls: ['https://a.com/', 'https://b.com/'] },
    k3: { urls: ['https://c.com/', 'https://d.com/'] },
  });
  const m = matrix(round);
  assert.ok(Math.abs(similarity(m, 'k1', 'k2') - 1) < 1e-9);
  assert.equal(similarity(m, 'k1', 'k3'), 0);
  assert.equal(similarity(m, 'k1', 'k3'), similarity(m, 'k3', 'k1'));
});

test('the same business on a different page earns half credit', () => {
  const same = matrix(roundWith({ k1: { urls: ['https://a.com/x'] }, k2: { urls: ['https://a.com/x'] } }));
  const other = matrix(roundWith({ k1: { urls: ['https://a.com/x'] }, k2: { urls: ['https://a.com/y'] } }));
  assert.ok(Math.abs(similarity(same, 'k1', 'k2') - 1) < 1e-9);
  assert.ok(Math.abs(similarity(other, 'k1', 'k2') - 0.5) < 1e-9);
});

test('a directory shared by both lists moves similarity by nothing', () => {
  const bare = matrix(roundWith({ k1: { urls: ['https://a.com/', 'https://b.com/'] }, k2: { urls: ['https://a.com/', 'https://c.com/'] } }));
  const padded = matrix(roundWith({ k1: { urls: ['https://a.com/', 'https://b.com/', 'https://www.yelp.com/search'] }, k2: { urls: ['https://a.com/', 'https://c.com/', 'https://www.yelp.com/search'] } }));
  assert.ok(Math.abs(similarity(bare, 'k1', 'k2') - similarity(padded, 'k1', 'k2')) < 1e-9);
});

test('similarities is the full square with a unit diagonal', () => {
  const m = matrix(roundWith({ k1: { urls: ['https://a.com/'] }, k2: { urls: ['https://b.com/'] } }));
  const s = similarities(m);
  assert.deepEqual(Object.keys(s), ['k1', 'k2']);
  assert.equal(s.k1.k1, 1);
  assert.equal(s.k1.k2, 0);
  assert.equal(s.k2.k1, 0);
});
```

Add `rankWeight, matrix, similarity, similarities` to the test file's import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: FAIL with `rankWeight is not a function` (or import error).

- [ ] **Step 3: Implement**

Add to `research.mjs`, after `primaryPageOf`:

```js
// ---- The matrix ------------------------------------------------------------

// The DCG discount: rank 1 counts 1, rank 8 about a third. Position says
// how sure Google is, and a business at the top of both lists is stronger
// evidence than one at the bottom of both.
export const rankWeight = (rank) => 1 / Math.log2(rank + 1);

// One row per captured keyword, one column per business. A cell is the
// business's best rank for that keyword. A column's weight is its rarity
// across the study, ln((N + 1) / df): a business that ranks for every
// search says nothing about any one of them, and one that ranks for two
// says a great deal. The + 1 is the usual smoothing, so two identical SERPs
// in a two-keyword study still score 1 rather than 0/0. A column with any
// Directory result weighs zero outright, whatever its rarity: a paid list
// of ten vendors says nothing about intent however seldom it ranks.
export function matrix(round, keywordIds = null) {
  const keywords = captured(round).filter((k) => !keywordIds || keywordIds.includes(k.id));
  const cells = {};
  const df = new Map();
  const directory = new Set();
  for (const k of keywords) {
    cells[k.id] = {};
    for (const x of round.serps[k.id].results) {
      const b = businessOf(x.url);
      if (x.pageType === 'Directory') directory.add(b);
      const w = rankWeight(x.rank);
      if (!cells[k.id][b] || w > cells[k.id][b].w) cells[k.id][b] = { w, url: normalizeUrl(x.url) };
    }
    for (const b of Object.keys(cells[k.id])) df.set(b, (df.get(b) ?? 0) + 1);
  }
  const N = keywords.length;
  const weight = {};
  for (const [b, n] of df) weight[b] = directory.has(b) ? 0 : Math.log((N + 1) / n);
  return { keywords, businesses: [...df.keys()], cells, weight };
}

// Weighted Jaccard over the two rows. The same business on a different page
// for each search is weaker evidence than the same page, so it earns half.
export function similarity(m, a, b) {
  const ca = m.cells[a] ?? {};
  const cb = m.cells[b] ?? {};
  let num = 0;
  let den = 0;
  for (const x of new Set([...Object.keys(ca), ...Object.keys(cb)])) {
    const w = m.weight[x] ?? 0;
    const wa = ca[x]?.w ?? 0;
    const wb = cb[x]?.w ?? 0;
    den += w * Math.max(wa, wb);
    if (wa && wb) num += w * Math.min(wa, wb) * (ca[x].url === cb[x].url ? 1 : 0.5);
  }
  return den ? num / den : 0;
}

export function similarities(m) {
  const ids = m.keywords.map((k) => k.id);
  const out = {};
  for (const a of ids) out[a] = {};
  for (let i = 0; i < ids.length; i += 1) {
    out[ids[i]][ids[i]] = 1;
    for (let j = i + 1; j < ids.length; j += 1) {
      const s = similarity(m, ids[i], ids[j]);
      out[ids[i]][ids[j]] = s;
      out[ids[j]][ids[i]] = s;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/research.mjs netlify/functions/lib/office/research.test.mjs
git commit -m "Build the keyword-by-business matrix

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Clustering, confidence and reason

**Files:**
- Modify: `netlify/functions/lib/office/research.mjs`
- Test: `netlify/functions/lib/office/research.test.mjs`

**Interfaces:**
- Consumes: `matrix`, `similarities` from Task 2.
- Produces:
  - `CUT` (number, 0.25)
  - `cluster(m, sims, cut = CUT) → { groups: string[][], order: string[], merges: { members: string[], score: number }[] }`; groups sorted by size desc then first keyword's round order; `order` is `groups.flat()`.
  - `confidence(ids, groups, sims, cut = CUT) → { level: 'clear' | 'close', tightness: number, nearest: number, near: string[] | null }` where `near` is the nearest other group.
  - `reasonOf(ids, m, nearest) → string`
  - `band(value, cut = CUT) → 0 | 1 | 2 | 3` (none, faint, some, most), shared by the tab's shades and the report grid.

- [ ] **Step 1: Write the failing tests**

Append to `research.test.mjs`:

```js
test('cluster merges the closest first and stops at the cut', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/', 'https://b.com/', 'https://c.com/'] },
    k2: { urls: ['https://a.com/', 'https://b.com/', 'https://c.com/'] },
    k3: { urls: ['https://a.com/', 'https://x.com/', 'https://y.com/'] },
    k4: { urls: ['https://p.com/', 'https://q.com/'] },
  });
  const m = matrix(round);
  const sims = similarities(m);
  const { groups, order, merges } = cluster(m, sims, 0.25);
  assert.deepEqual(groups[0].slice().sort(), ['k1', 'k2'], 'the identical pair merges');
  assert.ok(merges[0].score > 0.99, 'and it merges first, at its score');
  assert.ok(groups.some((g) => g.length === 1 && g[0] === 'k4'), 'k4 shares nothing and stands alone');
  assert.equal(order.length, 4);
  assert.equal(new Set(order).size, 4);
  // Nothing merges when the cut is above every similarity.
  assert.equal(cluster(m, sims, 1.01).groups.length, 4);
});

// Union-find joined A to C whenever A-B and B-C were strong. Average linkage
// asks whether C resembles the group {A, B} as a whole.
test('cluster does not chain: A like B, B like C, A unlike C stays two groups', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/', 'https://b.com/', 'https://c.com/', 'https://d.com/'] },
    k2: { urls: ['https://c.com/', 'https://d.com/', 'https://e.com/', 'https://f.com/'] },
    k3: { urls: ['https://e.com/', 'https://f.com/', 'https://g.com/', 'https://h.com/'] },
  });
  const m = matrix(round);
  const sims = similarities(m);
  assert.equal(sims.k1.k3, 0, 'fixture: the ends share nothing');
  const { groups } = cluster(m, sims, Math.min(sims.k1.k2, sims.k2.k3) * 0.9);
  assert.equal(groups.length, 2, 'the middle keyword joins one end, not both');
});

test('cluster keeps merged keywords adjacent in the order', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/'] },
    k2: { urls: ['https://z.com/'] },
    k3: { urls: ['https://a.com/'] },
  });
  const m = matrix(round);
  const { order } = cluster(m, similarities(m), 0.25);
  const i = order.indexOf('k1');
  const j = order.indexOf('k3');
  assert.equal(Math.abs(i - j), 1);
});

test('confidence words the nearest outsider against the cut', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/', 'https://b.com/'] },
    k2: { urls: ['https://a.com/', 'https://b.com/'] },
    k3: { urls: ['https://c.com/'] },
  });
  const m = matrix(round);
  const sims = similarities(m);
  const { groups } = cluster(m, sims, 0.25);
  const pair = groups.find((g) => g.length === 2);
  const single = groups.find((g) => g.length === 1);
  assert.equal(confidence(pair, groups, sims, 0.25).level, 'clear');
  assert.equal(confidence(pair, groups, sims, 0.25).nearest, 0);
  assert.equal(confidence(pair, groups, sims, 0.25).near, null);
  assert.equal(confidence(single, groups, sims, 0.25).level, 'clear');
  // A nearest outsider inside [cut/2, cut) is a close call, and it is named.
  const fake = { k1: { k1: 1, k2: 1, k3: 0.2 }, k2: { k1: 1, k2: 1, k3: 0.1 }, k3: { k1: 0.2, k2: 0.1, k3: 1 } };
  const c = confidence(['k1', 'k2'], [['k1', 'k2'], ['k3']], fake, 0.25);
  assert.equal(c.level, 'close');
  assert.deepEqual(c.near, ['k3']);
  assert.equal(c.nearest, 0.2);
  assert.equal(c.tightness, 1);
});

test('reasonOf names the heaviest shared businesses first and says when nothing is shared', () => {
  const round = roundWith({
    k1: { urls: ['https://common.com/', 'https://rare.com/', 'https://also.com/'] },
    k2: { urls: ['https://rare.com/', 'https://common.com/', 'https://also.com/'] },
    k3: { urls: ['https://common.com/', 'https://other.com/'] },
    k4: { urls: ['https://alone.com/'] },
  });
  const m = matrix(round);
  const text = reasonOf(['k1', 'k2'], m, 0);
  assert.match(text, /^Three businesses rank for both, led by rare\.com and also\.com\./);
  assert.equal(reasonOf(['k4'], m, 0), 'No business that ranks here ranks for anything else in the study.');
  assert.equal(reasonOf(['k4'], m, 0.1), 'The businesses that rank here mostly rank for nothing else in the study.');
  assert.match(reasonOf(['k1', 'k2', 'k3'], m, 0), /^One business ranks for all three, led by common\.com\./);
});

test('band cuts similarity into none, faint, some, most', () => {
  assert.equal(band(0, 0.25), 0);
  assert.equal(band(0.1, 0.25), 1);
  assert.equal(band(0.2, 0.25), 2);
  assert.equal(band(0.25, 0.25), 3);
  assert.equal(band(1, 0.25), 3);
});
```

Add `CUT, cluster, confidence, reasonOf, band` to the import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: FAIL, `cluster is not a function`.

- [ ] **Step 3: Implement**

Add to `research.mjs` after `similarities`:

```js
// ---- Grouping ----------------------------------------------------------------

// PROVISIONAL. The engine's one parameter. Set it from
// `node scripts/validate-clusters.mjs <export.json> <external.csv>`, which
// sweeps it against an independent clustering of the same keywords and
// prints agreement at each step. No validation has run yet; until it does, a
// page whose nearest outsider is near this line is a judgement call.
export const CUT = 0.25;

// Shades for the matrix and the report grid: none, faint, some, most.
export const band = (v, cut = CUT) => (v <= 0 ? 0 : v < cut / 2 ? 1 : v < cut ? 2 : 3);

const meanBetween = (g, h, sims) => {
  let s = 0;
  for (const a of g) for (const b of h) s += sims[a][b];
  return s / (g.length * h.length);
};

// Average-linkage agglomerative clustering. Every keyword starts alone; the
// two groups whose members are most alike on average merge, until the best
// merge left is below the cut. Average, not single, linkage: union-find
// joined A to C whenever A-B and B-C passed, and a chain of near-misses
// became one page. Here a keyword joins a group when it resembles the group.
export function cluster(m, sims, cut = CUT) {
  const index = new Map(m.keywords.map((k, i) => [k.id, i]));
  let groups = m.keywords.map((k) => [k.id]);
  const merges = [];
  while (groups.length > 1) {
    let best = { score: -1, i: -1, j: -1 };
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const score = meanBetween(groups[i], groups[j], sims);
        if (score > best.score) best = { score, i, j };
      }
    }
    if (best.score < cut) break;
    const merged = [...groups[best.i], ...groups[best.j]];
    merges.push({ members: merged, score: best.score });
    groups = groups.filter((_, k) => k !== best.i && k !== best.j);
    groups.push(merged);
  }
  groups.sort((x, y) => y.length - x.length || index.get(x[0]) - index.get(y[0]));
  return { groups, order: groups.flat(), merges };
}

// How sure the grouping is: how alike the members are, and how close the
// nearest outsider came. Said against the cut, since the cut is what the
// outsider failed to reach.
export function confidence(ids, groups, sims, cut = CUT) {
  let nearest = 0;
  let near = null;
  for (const other of groups) {
    if (other === ids || (other.length === ids.length && other.every((id) => ids.includes(id)))) continue;
    for (const a of ids) for (const b of other) if (sims[a][b] > nearest) { nearest = sims[a][b]; near = other; }
  }
  let tightness = 1;
  if (ids.length > 1) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) { s += sims[ids[i]][ids[j]]; n += 1; }
    tightness = s / n;
  }
  return { level: nearest < cut / 2 ? 'clear' : 'close', tightness, nearest, near };
}

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => WORDS[n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The businesses that rank for every member, heaviest first: the evidence
// the group stands on, in the words the owner would use on a call.
export function reasonOf(ids, m, nearest = 0) {
  if (ids.length === 1) {
    return nearest > 0 ? 'The businesses that rank here mostly rank for nothing else in the study.'
      : 'No business that ranks here ranks for anything else in the study.';
  }
  const shared = m.businesses
    .filter((b) => (m.weight[b] ?? 0) > 0 && ids.every((id) => m.cells[id]?.[b]))
    .map((b) => ({ b, load: m.weight[b] * Math.min(...ids.map((id) => m.cells[id][b].w)) }))
    .sort((x, y) => y.load - x.load || x.b.localeCompare(y.b));
  const all = ids.length === 2 ? 'both' : `all ${word(ids.length)}`;
  if (!shared.length) return `No single business ranks for ${all}; they are joined by the businesses most of them share.`;
  const led = shared.slice(0, 2).map((x) => x.b).join(' and ');
  return `${cap(word(shared.length))} ${shared.length === 1 ? 'business ranks' : 'businesses rank'} for ${all}, led by ${led}.`;
}
```

The existing `WORDS`, `word` and `cap` constants further down the file (used by `describePair`) become duplicates; delete the lower copies so the file has one of each. `describePair` is rewritten in Task 5 anyway.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/research.mjs netlify/functions/lib/office/research.test.mjs
git commit -m "Cluster keywords into pages by average linkage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Page kinds, volume and standing

**Files:**
- Modify: `netlify/functions/lib/office/research.mjs`
- Test: `netlify/functions/lib/office/research.test.mjs`

**Interfaces:**
- Consumes: nothing from Tasks 2–3 (kinds read the round; standing reads `keywords[].volume`).
- Produces:
  - `KINDS = ['Homepage', 'Service page', 'Location page', 'Article', 'Other']`
  - `FLOOR = 10`
  - `homeAreas(round) → string[]`
  - `kindOf(ids, round, home) → 'Location page' | 'Article' | 'Service page'` (Homepage is assigned in `pageList`, Task 5)
  - `decodeCsv(bytes: Uint8Array) → string` (UTF-8 or UTF-16 by BOM)
  - `parseVolumeCsv(text) → { rows: { keyword: string, min: number, max: number }[], error: string | null }`
  - `applyVolume(round, rows, now) → round` with `keywords[].volume = { min, max, source: 'planner' | 'csv', at }` and `volumeImport = { at, matched, unmatchedRows: string[], unmatchedKeywords: string[] }`
  - `standingOf(ids, round) → 'page' | 'low'`

- [ ] **Step 1: Write the failing tests**

Append to `research.test.mjs`:

```js
test('homeAreas is any area named in more than half the keywords', () => {
  const round = { ...emptyRound('r1'), areas: ['Utah', 'Park City', 'Moab'], keywords: [
    { id: 'k1', text: 'utah bridal makeup' }, { id: 'k2', text: 'Utah wedding makeup artist' }, { id: 'k3', text: 'park city utah hair and makeup' }, { id: 'k4', text: 'moab wedding makeup' },
  ] };
  assert.deepEqual(homeAreas(round), ['Utah']);
});

test('kindOf: a non-home area is a location page, a question is an article, else a service page', () => {
  const round = roundWith({
    k1: { text: 'park city utah hair and makeup', urls: ['https://a.com/'] },
    k2: { text: 'utah bridal makeup', urls: ['https://a.com/'] },
    k3: { text: 'soft glam vs full glam', urls: ['https://a.com/'] },
    k4: { text: 'bridal party hair and makeup cost', urls: ['https://a.com/'] },
    k5: { text: 'mature skin bridal makeup', urls: ['https://a.com/blog/one', 'https://b.com/blog/two', 'https://c.com/'] },
    k6: { text: 'bridal party makeup', urls: ['https://a.com/services/', 'https://www.yelp.com/search'] },
  }, ['Utah', 'Park City']);
  const home = ['Utah'];
  assert.equal(kindOf(['k1'], round, home), 'Location page');
  assert.equal(kindOf(['k2'], round, home), 'Service page');
  assert.equal(kindOf(['k3'], round, home), 'Article');
  assert.equal(kindOf(['k4'], round, home), 'Article');
  assert.equal(kindOf(['k5'], round, home), 'Article', 'half the business results are blog posts');
  assert.equal(kindOf(['k6'], round, home), 'Service page', 'a directory does not count toward the blog share');
  assert.equal(kindOf(['k1', 'k2'], round, home), 'Location page', 'one member with an area makes the group a location page');
  assert.equal(kindOf(['k2', 'k3'], round, home), 'Article', 'and one question member makes it an article');
});

test('kindOf matches areas on whole words, case-insensitively', () => {
  const round = roundWith({ k1: { text: 'Moab wedding makeup', urls: ['https://a.com/'] }, k2: { text: 'moabite bridal', urls: ['https://a.com/'] } }, ['moab']);
  assert.equal(kindOf(['k1'], round, []), 'Location page');
  assert.equal(kindOf(['k2'], round, []), 'Service page');
});

test('decodeCsv reads UTF-8 and UTF-16 by their marks', () => {
  assert.equal(decodeCsv(new TextEncoder().encode('Keyword,Volume\r\na,1\r\n')), 'Keyword,Volume\r\na,1\r\n');
  const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from('Keyword\tVolume\n', 'utf16le')]);
  assert.equal(decodeCsv(utf16), 'Keyword\tVolume\n');
});

test('parseVolumeCsv reads a Keyword Planner export with a preamble, tabs, ranges and min/max', () => {
  const planner = [
    'Keyword Stats 2026-09-18',
    'Sep 1, 2025 - Aug 31, 2026',
    'Keyword\tCurrency\tAvg. monthly searches\tMin search volume\tMax search volume\tCompetition',
    'utah bridal makeup artist\tUSD\t210\t100\t1000\tLow',
    '"la caille, utah makeup"\tUSD\t\t0\t10\t',
    'soft glam vs full glam\tUSD\t1K – 10K\t\t\tLow',
  ].join('\r\n');
  const { rows, error } = parseVolumeCsv(planner);
  assert.equal(error, null);
  assert.deepEqual(rows, [
    { keyword: 'utah bridal makeup artist', min: 210, max: 210 },
    { keyword: 'la caille, utah makeup', min: 0, max: 10 },
    { keyword: 'soft glam vs full glam', min: 1000, max: 10000 },
  ]);
});

test('parseVolumeCsv reads a plain two-column file and refuses one with no keyword column', () => {
  assert.deepEqual(parseVolumeCsv('keyword,volume\nbridal makeup,"1,200"\nmakeup,\n').rows, [
    { keyword: 'bridal makeup', min: 1200, max: 1200 },
  ]);
  assert.match(parseVolumeCsv('a,b\n1,2\n').error, /Keyword column/);
  assert.match(parseVolumeCsv('').error, /empty/);
});

test('applyVolume matches on normalized text, lists both kinds of miss, and keeps unmentioned volumes', () => {
  const round = { ...emptyRound('r1'), keywords: [
    { id: 'k1', text: ' Utah  Bridal Makeup ' }, { id: 'k2', text: 'moab makeup', volume: { min: 5, max: 5, source: 'csv', at: 'old' } }, { id: 'k3', text: 'never mentioned' },
  ] };
  const at = new Date('2026-09-18T12:00:00Z');
  const next = applyVolume(round, [{ keyword: 'utah bridal makeup', min: 100, max: 1000 }, { keyword: 'not in study', min: 1, max: 1 }], at);
  assert.deepEqual(next.keywords[0].volume, { min: 100, max: 1000, source: 'csv', at: at.toISOString() });
  assert.equal(next.keywords[1].volume.at, 'old', 'a keyword the file does not name keeps what it had');
  assert.equal(next.keywords[2].volume, undefined);
  assert.deepEqual(next.volumeImport, { at: at.toISOString(), matched: 1, unmatchedRows: ['not in study'], unmatchedKeywords: ['k2', 'k3'] });
});

test('standingOf: under the floor is low, unknown is never zero', () => {
  const v = (max) => ({ min: 0, max, source: 'csv', at: 'x' });
  const round = { ...emptyRound('r1'), keywords: [
    { id: 'k1', text: 'a', volume: v(0) }, { id: 'k2', text: 'b', volume: v(5) }, { id: 'k3', text: 'c', volume: v(100) }, { id: 'k4', text: 'd' },
  ] };
  assert.equal(standingOf(['k1'], round), 'low');
  assert.equal(standingOf(['k1', 'k2'], round), 'low', 'summed max 5 is under the floor');
  assert.equal(standingOf(['k1', 'k3'], round), 'page');
  assert.equal(standingOf(['k4'], round), 'page', 'unknown volume does not sink a page');
  assert.equal(standingOf(['k1', 'k4'], round), 'page');
});
```

Add `KINDS, FLOOR, homeAreas, kindOf, decodeCsv, parseVolumeCsv, applyVolume, standingOf` to the import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: FAIL, `homeAreas is not a function`.

- [ ] **Step 3: Implement**

Add to `research.mjs` after `reasonOf`:

```js
// ---- Page kinds --------------------------------------------------------------

// What the tool can recommend building. The result classifications in
// PAGE_TYPES describe what ranks; these describe what to build, and a
// Directory is never something to build.
export const KINDS = ['Homepage', 'Service page', 'Location page', 'Article', 'Other'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordIn = (needle, text) => new RegExp(`(^|[^a-z0-9])${escapeRe(String(needle).toLowerCase())}($|[^a-z0-9])`).test(String(text).toLowerCase());

// The area the whole study is about is not a location page's area: "Utah"
// in most keywords means the client works in Utah, not that every keyword
// wants its own town page.
export function homeAreas(round) {
  const ks = round.keywords ?? [];
  return (round.areas ?? []).filter((a) => a && ks.filter((k) => wordIn(a, k.text)).length > ks.length / 2);
}

// A question or a comparison in the keyword itself, or an answer that
// Google fills with articles: the searcher wants to read, not to hire.
const ARTICLE = /(^|[^a-z0-9])(vs|versus|or|how|what|why|when|should|cost|price|prices|tips|ideas)($|[^a-z0-9])|\?\s*$/i;

export function kindOf(ids, round, home = homeAreas(round)) {
  const byId = new Map(round.keywords.map((k) => [k.id, k]));
  const texts = ids.map((id) => byId.get(id)?.text ?? '');
  const areas = (round.areas ?? []).filter((a) => a && !home.includes(a));
  if (texts.some((t) => areas.some((a) => wordIn(a, t)))) return 'Location page';
  const results = ids.flatMap((id) => round.serps[id]?.results ?? []).filter((x) => x.pageType !== 'Directory');
  const blog = results.filter((x) => x.pageType === 'Blog/FAQ').length;
  if (texts.some((t) => ARTICLE.test(t)) || (results.length && blog * 2 >= results.length)) return 'Article';
  return 'Service page';
}

// ---- Volume ------------------------------------------------------------------

// PROVISIONAL. Searches a month, summed over a page's keywords, under which
// a page is not worth building. Keyword Planner's lowest bucket is 0-10, so
// this is "Planner cannot see it". Revisit after the first import against
// the Makeup by Brinley study.
export const FLOOR = 10;

// Keyword Planner exports UTF-16 with a byte-order mark; everything else is
// UTF-8. Decode by the mark, never by guessing.
export function decodeCsv(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

// One delimited line into cells, honouring quotes. Enough for Planner and
// for a hand-made file; not a general CSV reader.
function splitLine(line, delim) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { out.push(cell); cell = ''; } else cell += c;
  }
  out.push(cell);
  return out.map((s) => s.trim());
}

// "1,200", "1K", "10K – 100K", "1.5M": Planner writes volume every one of
// these ways depending on the account and the column.
const num = (s) => {
  const t = String(s ?? '').trim().replace(/,/g, '');
  const m = /^(\d+(?:\.\d+)?)\s*([KkMm])?$/.exec(t);
  if (!m) return null;
  const mult = m[2] ? (m[2].toLowerCase() === 'k' ? 1000 : 1000000) : 1;
  return Math.round(Number(m[1]) * mult);
};
const range = (s) => {
  const m = /^(.+?)\s*[–-]\s*(.+)$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const lo = num(m[1]);
  const hi = num(m[2]);
  return lo == null || hi == null ? null : { min: lo, max: hi };
};

export function parseVolumeCsv(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], error: 'the file is empty' };
  // Planner puts two title lines above the header; the header is the first
  // line with a Keyword cell.
  const headerAt = lines.findIndex((l) => /(^|[\t,])"?keyword"?([\t,]|$)/i.test(l));
  if (headerAt < 0) return { rows: [], error: 'no Keyword column found' };
  const delim = lines[headerAt].includes('\t') ? '\t' : ',';
  const header = splitLine(lines[headerAt], delim).map((h) => h.toLowerCase());
  const col = (...names) => header.findIndex((h) => names.includes(h));
  const kw = col('keyword');
  const avg = col('avg. monthly searches', 'volume', 'searches', 'search volume');
  const lo = col('min search volume');
  const hi = col('max search volume');
  if (avg < 0 && (lo < 0 || hi < 0)) return { rows: [], error: 'no volume column found: expected Avg. monthly searches, Min/Max search volume, or volume' };
  const rows = [];
  for (const line of lines.slice(headerAt + 1)) {
    const cells = splitLine(line, delim);
    const keyword = cells[kw];
    if (!keyword) continue;
    const single = avg >= 0 ? num(cells[avg]) : null;
    const spread = avg >= 0 ? range(cells[avg]) : null;
    const bounds = lo >= 0 && hi >= 0 && num(cells[lo]) != null && num(cells[hi]) != null ? { min: num(cells[lo]), max: num(cells[hi]) } : null;
    const v = single != null ? { min: single, max: single } : spread ?? bounds;
    if (v) rows.push({ keyword, ...v });
  }
  return { rows, error: null };
}

// Volume lands on the keyword; the import's misses land on the round, so the
// tab can show what did not match until the next import replaces it.
export function applyVolume(round, rows, now = new Date(), source = 'csv') {
  const at = now.toISOString();
  const byText = new Map(rows.map((r) => [normalizeQuery(r.keyword), r]));
  const hit = new Set();
  const keywords = round.keywords.map((k) => {
    const row = byText.get(normalizeQuery(k.text));
    if (!row) return k;
    hit.add(normalizeQuery(k.text));
    return { ...k, volume: { min: row.min, max: row.max, source, at } };
  });
  const matchedIds = new Set(keywords.filter((k, i) => k !== round.keywords[i]).map((k) => k.id));
  return {
    ...round,
    keywords,
    volumeImport: {
      at,
      matched: matchedIds.size,
      unmatchedRows: rows.filter((r) => !hit.has(normalizeQuery(r.keyword))).map((r) => r.keyword),
      unmatchedKeywords: keywords.filter((k) => !matchedIds.has(k.id)).map((k) => k.id),
    },
  };
}

// Volume never moves a keyword between pages; it says whether the page is
// worth building. Unknown is unknown: a page with any unmeasured keyword
// stands, because "Planner was not asked" is not "nobody searches".
export function standingOf(ids, round) {
  const byId = new Map(round.keywords.map((k) => [k.id, k]));
  const vols = ids.map((id) => byId.get(id)?.volume);
  if (vols.some((v) => !v)) return 'page';
  return vols.reduce((n, v) => n + v.max, 0) < FLOOR ? 'low' : 'page';
}
```

`normalizeQuery` is defined further down the file as a `const` arrow; move its definition above this block (or convert to a hoisted `function`) so `applyVolume` can see it. The `applyVolume` test expects `source: 'csv'`; the action passes `'planner'` when the header carried `Avg. monthly searches`.

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/research.mjs netlify/functions/lib/office/research.test.mjs
git commit -m "Decide page kinds and read search volume

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The page list, the pair, and the ladder's removal

This is the cut-over. After it, `npm test` is green and the Astro build is red until Task 9.

**Files:**
- Modify: `netlify/functions/lib/office/research.mjs`
- Modify: `netlify/functions/lib/office/research.test.mjs`
- Create: `netlify/functions/lib/office/fixtures/makeup-by-brinley.json`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces:
  - `pageList(round) → PageRow[]` where `PageRow = { id, title, kind, keywords: string[], confidence: { level, tightness, nearest, near: string | null }, reason, standing, note, auto }` and `near` is the nearest page's `id`. Edited rows (`auto: false`) come first, keep their `kind`, and have `standing: 'page'`.
  - `pagesOf(round) → PageRow[]`: stored `pages` for a closed round, `pageList(round)` for an open one.
  - `studyView(round, pages = pagesOf(round)) → { order: string[], sims, blocks: string[][], texts: Map<string, string> }`: the matrix over every captured keyword, ordered page by page.
  - `confidenceWords(row, titles: Map<id, title>) → string`: "Clear", "Stands alone", "Close call with X", "Close to X".
  - `comparePair(round, aId, bId) → { similarity, band, shared: { business, contribution, sameUrl }[], sharedDirectories: number, exactUrl, sameDomain, sameDomainDifferentPage, sharedUrls: string[], sharedDomains: string[] }`
  - `describePair(c) → string`
  - `titleOf(ids, round, sims) → string`
- Removed: `READS`, `SAME`, `STRONG_RATIO`, `GRAY_RATIO`, `MIN_BUSINESSES`, `primaryPageOf`, `pairs`, `group`. `pairKey` stays.

- [ ] **Step 1: Copy the fixture**

```bash
mkdir -p netlify/functions/lib/office/fixtures
node -e "
const d = JSON.parse(require('fs').readFileSync('/mnt/c/Users/Snic9/Downloads/research-2026-09-18.json', 'utf8'));
require('fs').writeFileSync('netlify/functions/lib/office/fixtures/makeup-by-brinley.json', JSON.stringify(d[0], null, 2) + '\n');
"
node -e "const d=require('./netlify/functions/lib/office/fixtures/makeup-by-brinley.json'); console.log(d.slug, d.rounds[0].keywords.length)"
```
Expected: `makeupbybrinley 22`. If the Downloads file is gone, export it again from `/office/api/export?type=research&format=json` in the running office and save it there first.

- [ ] **Step 2: Delete the ladder's tests and write the new ones**

In `research.test.mjs`, delete these tests entirely (by name): `comparePair counts like the workbook and reads the strong branch`, `comparePair gray zone and low, on the business ratio`, `the ladder branches on the share of businesses in common`, `page type resolves a gray pair, in both directions`, `the tiebreaker reads the leading type, not the overlap count`, `the tiebreaker leads on the businesses, not the shared directories`, `page type cannot move a pair that was not gray`, `a pair with too few businesses is unmeasurable, not low`, `unmeasurable never groups automatically`, `comparePair names the shared URLs and businesses the counts come from`, `describePair says what the counts mean in one line`, `describePair counts businesses, and names the directories apart`, `describePair says plainly when it cannot measure`, `describePair does not blame directories when none are shared`, `comparePair primary page is the mode across both lists, tie reviewed, empty blank`, `comparePair counts businesses and directories apart`, `comparePair reports a null ratio when there is nothing to divide by`, `pairs covers captured keywords only and carries the stored read`, `a strong pair is not a question`, `a gray pair already joined through a third keyword is not decisive`, `many simultaneous gray pairs resolve without recursing`, `pairs() computes comparePair once per pair, not once per probe`, `a pair that would split the page list is decisive`, `a gray pair is not decisive when one keyword is claimed by a hand-edited page`, `a pair that already has a read is not asked about again`, `group joins strong pairs, honours No and Yes, leaves uncaptured out`, `comparePair tells two social profiles apart and counts a shared one as a business`.

Also delete the `A`, `B7` constants and the `round()` fixture helper if nothing else uses them after the deletions (search the file; `applyCapture stores a classified snapshot and refreshes the auto pages` and `pageList keeps an edited row and regroups the rest` use `round()`; keep the helper, and keep `A`/`B7` if it uses them).

Replace `pageList keeps an edited row and regroups the rest` with:

```js
test('pageList clusters the free keywords, keeps edited rows first, and decorates every row', () => {
  const round = roundWith({
    k1: { text: 'utah bridal makeup', urls: ['https://a.com/', 'https://b.com/', 'https://c.com/'] },
    k2: { text: 'utah wedding makeup', urls: ['https://a.com/', 'https://b.com/', 'https://c.com/'] },
    k3: { text: 'moab utah wedding makeup', urls: ['https://x.com/', 'https://y.com/'] },
    k4: { text: 'soft glam vs full glam', urls: ['https://p.com/blog/x'] },
  }, ['Utah', 'Moab']);
  // Utah is in three of four keywords, so it is the home area and does not
  // make the head group a location page; Moab is in one and does.
  let list = pageList(round);
  assert.deepEqual(list.map((p) => p.keywords), [['k1', 'k2'], ['k3'], ['k4']]);
  assert.deepEqual(list.map((p) => p.kind), ['Homepage', 'Location page', 'Article']);
  assert.equal(list[0].auto, true);
  assert.equal(list[0].confidence.level, 'clear');
  assert.match(list[0].reason, /^Three businesses rank for both/);
  assert.equal(list[0].standing, 'page');
  assert.equal(list[0].id, 'p-k1-k2');
  assert.equal(list[0].title, 'utah bridal makeup');

  round.pages = [{ id: 'p9', title: 'Moab', kind: 'Other', keywords: ['k3', 'k1'], note: 'client asked', auto: false }];
  list = pageList(round);
  assert.equal(list[0].id, 'p9');
  assert.deepEqual(list[0].keywords, ['k3', 'k1']);
  assert.equal(list[0].kind, 'Other', 'the owner\'s kind is kept');
  assert.equal(list[0].standing, 'page');
  assert.deepEqual(list.slice(1).map((p) => p.keywords), [['k2'], ['k4']], 'a claimed keyword is not reclustered');
  assert.equal(list[1].kind, 'Homepage', 'the homepage goes to the largest remaining service group');
});

test('pageList assigns exactly one Homepage, by volume when volume is loaded', () => {
  const round = roundWith({
    k1: { text: 'big', urls: ['https://a.com/'] },
    k2: { text: 'small', urls: ['https://b.com/'] },
  });
  round.keywords[0].volume = { min: 10, max: 10, source: 'csv', at: 'x' };
  round.keywords[1].volume = { min: 1000, max: 1000, source: 'csv', at: 'x' };
  const list = pageList(round);
  assert.deepEqual(list.map((p) => [p.keywords[0], p.kind]), [['k1', 'Service page'], ['k2', 'Homepage']]);
  round.pages = [{ id: 'p9', title: 'Home', kind: 'Homepage', keywords: ['k1'], note: '', auto: false }];
  assert.equal(pageList(round).filter((p) => p.kind === 'Homepage').length, 1, 'an edited Homepage is the only one');
});

test('pageList never recommends a Directory or a tie', () => {
  const round = roundWith({
    k1: { urls: ['https://www.yelp.com/search', 'https://www.weddingwire.com/c/ut/x'] },
    k2: { urls: ['https://www.theknot.com/marketplace/beauty-services-ut'] },
  });
  for (const p of pageList(round)) assert.ok(KINDS.includes(p.kind), p.kind);
});

test('titleOf picks by volume, else the keyword most like the rest', () => {
  const round = { ...emptyRound('r1'), keywords: [{ id: 'k1', text: 'edge' }, { id: 'k2', text: 'centre' }, { id: 'k3', text: 'other edge' }] };
  const sims = { k1: { k1: 1, k2: 0.5, k3: 0 }, k2: { k1: 0.5, k2: 1, k3: 0.5 }, k3: { k1: 0, k2: 0.5, k3: 1 } };
  assert.equal(titleOf(['k1', 'k2', 'k3'], round, sims), 'centre');
  assert.equal(titleOf(['k3'], round, sims), 'other edge');
  round.keywords[0].volume = { min: 500, max: 500, source: 'csv', at: 'x' };
  assert.equal(titleOf(['k1', 'k2', 'k3'], round, sims), 'edge');
});

test('pagesOf reads a closed round from its stored pages and an open one fresh', () => {
  const open = roundWith({ k1: { urls: ['https://a.com/'] } });
  assert.equal(pagesOf(open).length, 1);
  const closed = { ...open, closedAt: '2026-09-18T00:00:00.000Z', pages: [{ id: 'frozen', keywords: ['k1'] }] };
  assert.deepEqual(pagesOf(closed), [{ id: 'frozen', keywords: ['k1'] }]);
});

test('studyView orders the matrix page by page and names the blocks', () => {
  const round = roundWith({
    k1: { text: 'one', urls: ['https://a.com/'] },
    k2: { text: 'two', urls: ['https://z.com/'] },
    k3: { text: 'three', urls: ['https://a.com/'] },
  });
  const v = studyView(round);
  assert.deepEqual(v.order, ['k1', 'k3', 'k2']);
  assert.deepEqual(v.blocks, [['k1', 'k3'], ['k2']]);
  assert.equal(v.texts.get('k3'), 'three');
  assert.ok(v.sims.k1.k3 > 0.99);
  // A frozen round's blocks follow its stored pages, whatever the engine would say now.
  const closed = { ...round, closedAt: 'x', pages: [{ id: 'p', keywords: ['k2', 'k1'] }, { id: 'q', keywords: ['k3'] }] };
  assert.deepEqual(studyView(closed).order, ['k2', 'k1', 'k3']);
});

test('confidenceWords', () => {
  const titles = new Map([['p-k3', 'Bridal party']]);
  assert.equal(confidenceWords({ keywords: ['a', 'b'], confidence: { level: 'clear', near: null } }, titles), 'Clear');
  assert.equal(confidenceWords({ keywords: ['a'], confidence: { level: 'clear', near: null } }, titles), 'Stands alone');
  assert.equal(confidenceWords({ keywords: ['a', 'b'], confidence: { level: 'close', near: 'p-k3' } }, titles), 'Close call with Bridal party');
  assert.equal(confidenceWords({ keywords: ['a'], confidence: { level: 'close', near: 'p-k3' } }, titles), 'Close to Bridal party');
  assert.equal(confidenceWords({ keywords: ['a'], confidence: undefined }, titles), '');
});

test('comparePair reports similarity, the businesses that drove it, and the counts the columns light', () => {
  const round = roundWith({
    k1: { urls: ['https://rare.com/', 'https://a.com/x', 'https://www.yelp.com/search', 'https://common.com/'] },
    k2: { urls: ['https://rare.com/', 'https://a.com/y', 'https://www.yelp.com/search', 'https://common.com/'] },
    k3: { urls: ['https://common.com/'] },
  });
  const c = comparePair(round, 'k1', 'k2');
  assert.ok(c.similarity > 0 && c.similarity < 1);
  assert.equal(c.shared[0].business, 'rare.com');
  assert.equal(c.shared[0].sameUrl, true);
  assert.equal(c.shared.find((x) => x.business === 'a.com').sameUrl, false);
  assert.ok(c.shared.every((x) => x.business !== 'yelp.com'), 'a directory is not a driver');
  assert.equal(c.sharedDirectories, 1);
  assert.equal(c.exactUrl, 3);
  assert.equal(c.sameDomain, 4);
  assert.equal(c.sameDomainDifferentPage, 1);
  assert.deepEqual(c.sharedUrls.sort(), ['common.com', 'rare.com', 'yelp.com/search']);
  assert.ok(c.sharedDomains.includes('a.com'));
  assert.equal(typeof c.band, 'number');
});

test('describePair says alike, close or different, and names directories apart', () => {
  const alike = { similarity: 0.8, band: 3, shared: [{ business: 'a.com' }, { business: 'b.com' }], sharedDirectories: 2 };
  assert.equal(describePair(alike), 'Alike enough to share a page: two businesses rank for both, led by a.com and b.com. They also share two directories, which rank for almost everything in a field.');
  const close = { similarity: 0.15, band: 1, shared: [{ business: 'a.com' }], sharedDirectories: 0 };
  assert.equal(describePair(close), 'Not alike enough to share a page, but close: one business ranks for both, a.com.');
  const apart = { similarity: 0, band: 0, shared: [], sharedDirectories: 1 };
  assert.equal(describePair(apart), 'Different searches: no business ranks for both. They share one directory, which ranks for almost everything in a field.');
});

test('the Makeup by Brinley study comes out as a site structure, not a pile of singletons', () => {
  const doc = JSON.parse(readFileSync(new URL('./fixtures/makeup-by-brinley.json', import.meta.url), 'utf8'));
  const round = openRound(migrateStudy(doc));
  const list = pageList(round);
  const texts = new Map(round.keywords.map((k) => [k.text.toLowerCase(), k.id]));
  const pageOf = (text) => list.find((p) => p.keywords.includes(texts.get(text)));
  assert.ok(list.length < 12, `fewer pages than the ladder's twelve, got ${list.length}`);
  const head = ['utah bridal makeup artist', 'utah wedding makeup artist', 'makeup artist in utah'].map(pageOf);
  assert.equal(new Set(head).size, 1, 'the head terms share one page');
  assert.equal(pageOf('bridal party makeup'), pageOf('bridal party hair and makeup package'), 'the bridal party pair shares one page');
  assert.equal(pageOf('soft glam vs full glam').kind, 'Article');
  assert.equal(pageOf('hair and makeup: on location or in a salon').kind, 'Article');
  assert.equal(pageOf('bridal party hair and makeup cost').kind, 'Article');
  for (const p of list) {
    assert.ok(KINDS.includes(p.kind), p.kind);
    assert.ok(p.reason.length > 10);
    assert.ok(['clear', 'close'].includes(p.confidence.level));
  }
  assert.equal(list.filter((p) => p.kind === 'Homepage').length, 1);
});
```

Add `import { readFileSync } from 'node:fs';` at the top, and update the import list: remove `comparePair`-era names that no longer exist (`READS`, `SAME`, `primaryPageOf`, `pairs`, `group`) and add `pageList, pagesOf, studyView, confidenceWords, comparePair, describePair, titleOf`. Also fix `applyCapture stores a classified snapshot and refreshes the auto pages` if it asserts on `type`: change to `kind`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: FAIL on import (`pagesOf` not exported) or on shape.

- [ ] **Step 4: Implement**

In `research.mjs`:

1. Delete `READS`, `SAME`, `STRONG_RATIO`, `GRAY_RATIO`, `MIN_BUSINESSES`, `READ_TEXT`, the threshold comment above them, `countIn`, `sharedIn`, `primaryPageOf`, `isDirectory`, `businessesOf`, the old `comparePair`, `PLURAL`, the old `describePair`, `pairRows`, `pairs`, `decisiveFor`, `groupFrom`, `group`, `pageListFrom` and the old `pageList`.

2. Add, after `standingOf`:

```js
// ---- The page list -----------------------------------------------------------

// The keyword that names a page: the one people search most when volume is
// known, else the one most like the rest of the group.
export function titleOf(ids, round, sims) {
  const byId = new Map(round.keywords.map((k) => [k.id, k]));
  const vol = (id) => byId.get(id)?.volume?.max;
  if (ids.some((id) => vol(id) != null)) {
    return byId.get(ids.slice().sort((a, b) => (vol(b) ?? -1) - (vol(a) ?? -1))[0]).text;
  }
  if (ids.length === 1) return byId.get(ids[0]).text;
  const central = ids.map((id) => ({ id, m: ids.filter((o) => o !== id).reduce((n, o) => n + sims[id][o], 0) })).sort((x, y) => y.m - x.m)[0].id;
  return byId.get(central).text;
}

export function confidenceWords(row, titles) {
  const c = row.confidence;
  if (!c) return '';
  const single = row.keywords.length === 1;
  if (c.level === 'clear') return single ? 'Stands alone' : 'Clear';
  const name = titles.get(c.near) ?? 'another page';
  return single ? `Close to ${name}` : `Close call with ${name}`;
}

const rowId = (ids) => `p-${ids.slice().sort().join('-')}`;

// Edited rows are kept as they are and their keywords leave the matrix; the
// rest are clustered. Exactly one page is the Homepage: the owner's if they
// named one, else the service group with the most volume, else the largest.
export function pageList(round) {
  const kept = (round.pages ?? []).filter((p) => p.auto === false).map((p) => ({ ...p, standing: 'page' }));
  const claimed = new Set(kept.flatMap((p) => p.keywords));
  const free = captured(round).filter((k) => !claimed.has(k.id)).map((k) => k.id);
  const m = matrix(round, free);
  const sims = similarities(m);
  const { groups } = cluster(m, sims);
  const home = homeAreas(round);
  const rows = groups.map((ids) => {
    const c = confidence(ids, groups, sims);
    return {
      id: rowId(ids), title: titleOf(ids, round, sims), kind: kindOf(ids, round, home), keywords: ids,
      confidence: { level: c.level, tightness: c.tightness, nearest: c.nearest, near: c.near ? rowId(c.near) : null },
      reason: reasonOf(ids, m, c.nearest), standing: standingOf(ids, round), note: '', auto: true,
    };
  });
  if (!kept.some((p) => p.kind === 'Homepage')) {
    const byId = new Map(round.keywords.map((k) => [k.id, k]));
    const volume = (p) => p.keywords.reduce((n, id) => n + (byId.get(id)?.volume?.max ?? 0), 0);
    const homepage = rows.filter((p) => p.kind === 'Service page').sort((x, y) => volume(y) - volume(x) || y.keywords.length - x.keywords.length)[0];
    if (homepage) homepage.kind = 'Homepage';
  }
  return [...kept, ...rows];
}

// A closed round is the record of what was recommended then; an open round
// is recomputed every time it is read.
export const pagesOf = (round) => (round.closedAt ? (round.pages ?? []) : pageList(round));

// Everything the matrix table needs: the full square over every captured
// keyword, in page order, with each page's keywords as one block.
export function studyView(round, pages = pagesOf(round)) {
  const m = matrix(round);
  const sims = similarities(m);
  const placed = new Set(pages.flatMap((p) => p.keywords));
  const blocks = [...pages.map((p) => p.keywords.filter((id) => m.cells[id])).filter((b) => b.length),
    ...m.keywords.filter((k) => !placed.has(k.id)).map((k) => [k.id])];
  return { order: blocks.flat(), sims, blocks, texts: new Map(round.keywords.map((k) => [k.id, k.text])) };
}

// ---- One pair ------------------------------------------------------------------

// The compare page's numbers: the similarity and what drove it, plus the
// raw counts the two columns highlight so the reader can check by eye.
export function comparePair(round, aId, bId) {
  const m = matrix(round);
  const a = round.serps[aId]?.results ?? [];
  const b = round.serps[bId]?.results ?? [];
  const urlsB = new Set(b.map((x) => normalizeUrl(x.url)));
  const bizB = new Set(b.map((x) => businessOf(x.url)));
  const sharedUrls = [...new Set(a.map((x) => normalizeUrl(x.url)).filter((u) => urlsB.has(u)))];
  const sharedDomains = [...new Set(a.map((x) => businessOf(x.url)).filter((d) => bizB.has(d)))];
  const exactUrl = a.filter((x) => urlsB.has(normalizeUrl(x.url))).length;
  const sameDomain = a.filter((x) => bizB.has(businessOf(x.url))).length;
  const ca = m.cells[aId] ?? {};
  const cb = m.cells[bId] ?? {};
  const shared = Object.keys(ca).filter((x) => cb[x] && (m.weight[x] ?? 0) > 0)
    .map((x) => ({ business: x, sameUrl: ca[x].url === cb[x].url, contribution: m.weight[x] * Math.min(ca[x].w, cb[x].w) * (ca[x].url === cb[x].url ? 1 : 0.5) }))
    .sort((x, y) => y.contribution - x.contribution || x.business.localeCompare(y.business));
  const sharedDirectories = Object.keys(ca).filter((x) => cb[x] && m.weight[x] === 0).length;
  const s = similarity(m, aId, bId);
  return { similarity: s, band: band(s), shared, sharedDirectories, exactUrl, sameDomain, sameDomainDifferentPage: Math.max(0, sameDomain - exactUrl), sharedUrls, sharedDomains };
}

export function describePair(c) {
  const n = c.shared.length;
  const names = c.shared.slice(0, 2).map((x) => x.business);
  const who = n === 0 ? 'no business ranks for both'
    : n === 1 ? `one business ranks for both, ${names[0]}`
    : `${word(n)} businesses rank for both, led by ${names.join(' and ')}`;
  const lead = c.band === 3 ? `Alike enough to share a page: ${who}.`
    : c.band === 0 ? `Different searches: ${who}.`
    : `Not alike enough to share a page, but close: ${who}.`;
  const dirs = c.sharedDirectories === 0 ? ''
    : ` They ${n ? 'also ' : ''}share ${word(c.sharedDirectories)} ${c.sharedDirectories === 1 ? 'directory, which ranks' : 'directories, which rank'} for almost everything in a field.`;
  return `${lead}${dirs}`;
}
```

3. `touch()` still calls `pageList` and needs no change. `applyCapture` needs no change.

4. Check `describePair`'s "Different searches" branch against the test: with `shared: []` the sentence is `Different searches: no business ranks for both. They share one directory, which ranks for almost everything in a field.` The `also` is dropped when nothing is shared. Match the test strings exactly.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: `research.test.mjs` PASS. `actions/research.test.mjs` and `research-report.test.mjs` FAIL on imports (`READS`, `pairs`), which Tasks 6 and 7 fix. Confirm no other test file imports a removed name: `grep -rl "pairs\|primaryPageOf\|READS\|SAME\b" netlify/functions/lib --include=*.mjs`.

If the fixture test fails on the head-term assertion, print `pageList(round).map(p => [p.title, p.keywords.length, p.confidence.nearest.toFixed(2)])` and look: at `CUT = 0.25` the six head keywords should merge. If they split, the fixture is telling you the cut is high for this study; do not tune it here. Loosen the assertion to "the three head terms share one page" only if the six do not, and note it in the commit body for Task 10's validation to settle.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/office/research.mjs netlify/functions/lib/office/research.test.mjs netlify/functions/lib/office/fixtures/makeup-by-brinley.json
git commit -m "Replace the pair ladder with the clustered page list

The Astro pages still import the removed names; they follow in the
tab and report tasks.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The action handler

**Files:**
- Modify: `netlify/functions/lib/office/actions/research.mjs`
- Test: `netlify/functions/lib/office/actions/research.test.mjs`

**Interfaces:**
- Consumes: `KINDS`, `decodeCsv`, `parseVolumeCsv`, `applyVolume`, `pageList` from `research.mjs`.
- Produces: ops `volume` (multipart, field `file`), `page` (fields `id`, `title`, `kind`, `note`, `keywords` repeated or comma-joined), `read` refused, `round` freezing pages.

- [ ] **Step 1: Write the failing tests**

In `actions/research.test.mjs`, rewrite `read, page, reset and type edits reshape the study` as:

```js
test('page, reset and type edits reshape the study; read is refused', async () => {
  const s = await make();
  for (const t of ['a', 'b', 'c']) await research(post({ csrf, slug: 'acme', op: 'add', text: t, cluster: 'W', arm: '' }), ctx(), s, now);
  let round = openRound(await s.research.get('acme'));
  const [ka, kb, kc] = round.keywords.map((k) => k.id);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('b') }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('c', 4) }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.pages.length, 1, 'three lists of the same businesses cluster into one page');

  const refused = await research(post({ csrf, slug: 'acme', op: 'read', key: [ka, kb].sort().join('|'), human: 'Same intent', sameCluster: 'Yes', notes: '' }), ctx(), s, now);
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /no longer/);

  // Split c off by hand: the page op with a keyword list.
  const split = new FormData();
  for (const [k, v] of Object.entries({ csrf, slug: 'acme', op: 'page', id: 'p9', title: 'C on its own', kind: 'Article', note: 'client asked' })) split.append(k, v);
  split.append('keywords', kc);
  await research(new Request('https://site.test/office/api/research', { method: 'POST', body: split }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.pages.map((p) => [p.auto, p.keywords.length]), [[false, 1], [true, 2]]);
  assert.equal(round.pages[0].kind, 'Article');
  assert.equal(round.pages[0].note, 'client asked');

  // Pull b into the edited page: a comma-joined list works too, and the
  // released keyword is reclustered on its own.
  await research(post({ csrf, slug: 'acme', op: 'page', id: 'p9', title: 'C and B', kind: 'Service page', note: '', keywords: `${kc},${kb}` }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.pages.map((p) => p.keywords.length), [2, 1]);
  assert.equal(round.pages[1].keywords[0], ka);

  const badKind = await research(post({ csrf, slug: 'acme', op: 'page', id: 'p9', title: 'x', kind: 'Directory', note: '', keywords: kc }), ctx(), s, now);
  assert.match(location(badKind), /error=.*kind/);

  await research(post({ csrf, slug: 'acme', op: 'reset', id: 'p9' }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.pages.length, 1);
  assert.equal(round.pages[0].auto, true);

  await research(post({ csrf, slug: 'acme', op: 'type', keyword: ka, rank: '1', pageType: 'Blog/FAQ' }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.serps[ka].results[0].pageType, 'Blog/FAQ');
  assert.equal(round.serps[ka].results[0].typeSource, 'manual');
});

test('volume imports a Planner CSV, stores ranges, and reports both unmatched lists', async () => {
  const s = await make();
  for (const t of ['utah bridal makeup', 'moab makeup']) await research(post({ csrf, slug: 'acme', op: 'add', text: t, cluster: 'W', arm: '' }), ctx(), s, now);
  const csv = 'Keyword Stats\r\nSep\r\nKeyword\tAvg. monthly searches\tMin search volume\tMax search volume\r\nUtah Bridal Makeup\t\t100\t1000\r\nnot here\t50\t\t\r\n';
  const file = new File([new Uint8Array([0xff, 0xfe, ...Buffer.from(csv, 'utf16le')])], 'planner.csv', { type: 'text/csv' });
  const res = await research(post({ csrf, slug: 'acme', op: 'volume', file }), ctx(), s, now);
  assert.equal(location(res), '/office/clients/acme/?tab=research');
  const round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.keywords[0].volume, { min: 100, max: 1000, source: 'planner', at: now.toISOString() });
  assert.equal(round.keywords[1].volume, undefined);
  assert.deepEqual(round.volumeImport.unmatchedRows, ['not here']);
  assert.deepEqual(round.volumeImport.unmatchedKeywords, [round.keywords[1].id]);
  assert.equal(round.volumeImport.matched, 1);

  const empty = await research(post({ csrf, slug: 'acme', op: 'volume', file: new File([], 'x.csv') }), ctx(), s, now);
  assert.match(location(empty), /error=.*choose/);
  const junk = await research(post({ csrf, slug: 'acme', op: 'volume', file: new File(['a,b\n1,2\n'], 'x.csv') }), ctx(), s, now);
  assert.match(location(junk), /error=.*Keyword/);
});

test('remove drops the keyword from the last import\'s unmatched list too', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'a', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, slug: 'acme', op: 'volume', file: new File(['keyword,volume\nzzz,5\n'], 'v.csv') }), ctx(), s, now);
  let round = openRound(await s.research.get('acme'));
  assert.equal(round.volumeImport.unmatchedKeywords.length, 1);
  await research(post({ csrf, slug: 'acme', op: 'remove', id: round.keywords[0].id }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.volumeImport.unmatchedKeywords, []);
});

test('starting a round freezes the final page list on the round it closes', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'a', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  await research(post({ csrf, slug: 'acme', op: 'round' }), ctx(), s, now);
  const study = await s.research.get('acme');
  const closed = study.rounds[0];
  assert.ok(closed.closedAt);
  assert.equal(closed.pages.length, 1);
  assert.ok(closed.pages[0].kind, 'the frozen row carries its kind');
  assert.ok(closed.pages[0].reason, 'and its reason');
});
```

The existing `starting a round closes the old one and inherits keywords with their ids` test stays; check that it does not assert `pages` is empty on the closed round.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test netlify/functions/lib/office/actions/research.test.mjs`
Expected: FAIL on import (`READS` no longer exported).

- [ ] **Step 3: Implement**

In `actions/research.mjs`:

Replace the import from `../research.mjs` with:

```js
import {
  PAGE_TYPES, KINDS, emptyStudy, emptyRound, migrateStudy, openRound, touch, newKeywordId, normalizeQuery, splitList, draftFromQuestionnaire,
  validateCapture, findCaptureTargets, applyCapture, decodeCsv, parseVolumeCsv, applyVolume, pageList,
} from '../research.mjs';
```

Replace the `remove` op body's `reads` line and the return:

```js
  if (op === 'remove') {
    const id = field(data, 'id');
    const serps = { ...round.serps }; delete serps[id];
    const pages = round.pages.map((p) => ({ ...p, keywords: p.keywords.filter((k) => k !== id) })).filter((p) => p.keywords.length);
    const volumeImport = round.volumeImport
      ? { ...round.volumeImport, unmatchedKeywords: round.volumeImport.unmatchedKeywords.filter((k) => k !== id) }
      : undefined;
    return saveRound({ ...round, keywords: round.keywords.filter((k) => k.id !== id), serps, pages, ...(volumeImport ? { volumeImport } : {}) });
  }
```

Replace the `read` op with:

```js
  // Reads went with the pair ladder. A stale form is told so rather than
  // silently accepted into a field nothing reads.
  if (op === 'read') return problem(400, 'reads are no longer recorded; edit the page the pair belongs to instead');
```

Replace the `page` op with:

```js
  if (op === 'page') {
    const id = field(data, 'id');
    const kind = field(data, 'kind');
    if (!KINDS.includes(kind)) return back(slug, 'pick a page kind');
    // Checkboxes post one value per box; a hand-built form may post one
    // comma-joined value. Both are accepted.
    const keywords = data.getAll('keywords').flatMap((v) => String(v).split(',')).map((x) => x.trim()).filter((x) => round.keywords.some((k) => k.id === x));
    if (!keywords.length) return back(slug, 'a page needs at least one keyword');
    const title = text('title');
    if (!title) return back(slug, 'the page needs a title');
    const row = { id, title, kind, keywords: [...new Set(keywords)], note: text('note'), auto: false };
    // Claiming a keyword takes it away from any other edited row.
    const others = round.pages.filter((p) => p.id !== id && p.auto === false).map((p) => ({ ...p, keywords: p.keywords.filter((k) => !keywords.includes(k)) })).filter((p) => p.keywords.length);
    return saveRound({ ...round, pages: [...others, row] });
  }
```

Add the `volume` op after `areas`:

```js
  if (op === 'volume') {
    const file = data.get('file');
    if (!(file instanceof File) || !file.size) return back(slug, 'choose a CSV to import');
    if (file.size > 2_000_000) return back(slug, 'that file is over 2 MB, which is far more than a keyword list');
    const csvText = decodeCsv(new Uint8Array(await file.arrayBuffer()));
    const { rows, error } = parseVolumeCsv(csvText);
    if (error) return back(slug, error);
    const source = /avg\. monthly searches|min search volume/i.test(csvText) ? 'planner' : 'csv';
    return saveRound(applyVolume(round, rows, now, source));
  }
```

Change the `round` op's `closed` line to freeze the page list:

```js
    const closed = { ...round, closedAt: now.toISOString(), pages: pageList(round) };
```

- [ ] **Step 4: Run the tests**

Run: `node --test netlify/functions/lib/office/actions/research.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/research.mjs netlify/functions/lib/office/actions/research.test.mjs
git commit -m "Import volume, edit pages by keyword, refuse reads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The report

**Files:**
- Modify: `netlify/functions/lib/office/pdf.mjs` (add `grid` to `Writer`)
- Modify: `netlify/functions/lib/office/research-report.mjs`
- Test: `netlify/functions/lib/office/research-report.test.mjs`

**Interfaces:**
- Consumes: `pagesOf`, `studyView`, `band`, `confidenceWords`, `KINDS` from `research.mjs`.
- Produces: `reportLines` emitting a `{ kind: 'grid', labels: string[], bands: number[][], blocks: number[] }` line; `Writer.grid({ labels, bands, blocks })`.

- [ ] **Step 1: Write the failing tests**

In `research-report.test.mjs`:

Delete `the report explains why directories are set aside`, `the page-grouping rationale never quotes seven-of-eight results`, `a read on an unmeasurable pair still reaches the decisions table`. Change the import to `import { emptyStudy, emptyRound, applyCapture, openRound, domainOf, KINDS } from './research.mjs';`. In `the report text covers every section`, replace `'Decisions we made together'` with `'Where we used judgement'` and `'what we saw'` stays.

Replace `page one leads with the numbers and a bar per page...` with:

```js
// A study with two alike searches and one unlike, used by the page-one tests.
const study = () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.rounds[0] = { ...s.rounds[0], keywords: [
    { id: 'k1', text: 'wedding florist provo', cluster: '', arm: '', source: 'manual' },
    { id: 'k2', text: 'provo wedding flowers', cluster: '', arm: '', source: 'manual' },
    { id: 'k3', text: 'funeral flowers provo', cluster: '', arm: '', source: 'manual' },
  ] };
  const A = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://a${n}.com/p`));
  s = applyCapture(s, 'k1', { q: 'wedding florist provo', results: A, related: [] });
  s = applyCapture(s, 'k2', { q: 'provo wedding flowers', results: [...A.slice(0, 7), r('https://other.com/p')], related: [] });
  s = applyCapture(s, 'k3', { q: 'funeral flowers provo', results: [1, 2, 3, 4].map((n) => r(`https://f${n}.com/p`)), related: [] });
  return s;
};
const words = (L) => L.map((l) => l.text ?? l.rows?.flat().join(' ') ?? '').join('\n');

test('page one leads with the numbers and the grid, then the pages with their reasons', () => {
  const L = reportLines({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const kinds = L.map((x) => x.kind);
  const stats = L.find((x) => x.kind === 'stats');
  assert.deepEqual(stats.items, [['3', 'searches'], ['2', 'pages']], 'no third stat until volume is loaded');
  const grid = L.find((x) => x.kind === 'grid');
  assert.deepEqual(grid.labels.length, 3);
  assert.deepEqual(grid.blocks, [2, 1]);
  assert.equal(grid.bands.length, 3);
  assert.ok(grid.bands[0][1] >= 2, 'the alike pair is shaded');
  assert.equal(grid.bands[0][2], 0, 'the unlike pair is not');
  const texts = L.map((x) => x.text ?? '');
  const pages = texts.indexOf('Your pages');
  const stop = texts.findIndex((t) => t.startsWith('You can stop here'));
  const appendix = texts.findIndex((t) => t.startsWith('Appendix'));
  assert.ok(kinds.indexOf('stats') < kinds.indexOf('grid') && kinds.indexOf('grid') < pages, 'numbers, grid, pages');
  assert.ok(pages < stop && stop < appendix);
  assert.ok(!kinds.includes('bars'), 'the bar chart is gone');
  assert.match(words(L), /businesses rank for both, led by/);
  assert.match(words(L), /Homepage|Service page/);
  assert.ok(!/Directory/.test(words(L).split('Appendix')[0]), 'no page kind Directory before the appendix');
});

test('the grid moves to the appendix past thirty keywords', () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  const ids = Array.from({ length: 31 }, (_, i) => `k${i}`);
  s.rounds[0] = { ...s.rounds[0], keywords: ids.map((id) => ({ id, text: `search ${id}`, cluster: '', arm: '', source: 'manual' })) };
  for (const id of ids) s = applyCapture(s, id, { q: id, results: [r(`https://${id}.com/`)], related: [] });
  const L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const kinds = L.map((x) => x.kind);
  const texts = L.map((x) => x.text ?? '');
  assert.ok(kinds.indexOf('grid') > texts.findIndex((t) => t.startsWith('Appendix')), 'grid sits in the appendix');
  assert.ok(texts.some((t) => /grid is in the appendix/i.test(t)), 'page one says so');
});

test('the method paragraph explains rarity and volume, and the directories paragraph is gone', () => {
  const L = reportLines({ client, round: { ...emptyRound('r1'), keywords: [], serps: {} }, renderedAt: new Date('2026-09-18T00:00:00Z') });
  const w = words(L);
  assert.match(w, /A business that ranks for nearly every search in your field/);
  assert.match(w, /Search volume tells us which pages are worth building at all/);
  assert.ok(!/Directory sites/.test(w));
  assert.ok(!/Seven or more shared results/.test(w));
  assert.ok(!/We compare the individual businesses instead/.test(w));
});

test('judgement lists the edited pages with their notes, and says so when there are none', () => {
  const s = study();
  let L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.match(words(L), /The businesses settled every page without a judgement call\./);
  s.rounds[0] = { ...s.rounds[0], pages: [{ id: 'p9', title: 'Sympathy', kind: 'Service page', keywords: ['k3'], note: 'Owner wants this separate.', auto: false }] };
  L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const table = L.find((x) => x.kind === 'table' && x.rows[0][0] === 'Page');
  assert.ok(table, 'a table of edited pages');
  assert.deepEqual(table.rows[1], ['Sympathy', 'funeral flowers provo', 'Owner wants this separate.']);
});

test('not built for appears only with volume, and a close call is explained', () => {
  const s = study();
  let L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.ok(!/Not built for/.test(words(L)));
  s.rounds[0].keywords = s.rounds[0].keywords.map((k) => ({ ...k, volume: { min: 0, max: k.id === 'k3' ? 0 : 500, source: 'csv', at: 'x' } }));
  L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const w = words(L);
  assert.match(w, /Not built for/);
  assert.match(w, /funeral flowers provo/);
  const stats = L.find((x) => x.kind === 'stats');
  assert.deepEqual(stats.items[2], ['1', 'search not worth a page']);
  assert.match(w, /0 – 500|0–500|0 to 500/, 'volume ranges print beside the searches');
});

test('a closed round reports its stored pages, not a fresh clustering', () => {
  const s = study();
  const open = openRound(s);
  const closed = { ...open, closedAt: '2026-09-14T00:00:00.000Z', pages: [
    { id: 'frozen', title: 'Everything', kind: 'Homepage', keywords: ['k1', 'k2', 'k3'], confidence: { level: 'clear', near: null }, reason: 'Frozen reason.', standing: 'page', note: '', auto: true },
  ] };
  const L = reportLines({ client, round: closed, renderedAt: new Date('2026-09-20T00:00:00Z') });
  assert.match(words(L), /Frozen reason\./);
  assert.deepEqual(L.find((x) => x.kind === 'stats').items[1], ['1', 'page']);
});

test('the PDF writer draws a grid', async () => {
  const bytes = await renderResearchReport({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.byteLength > 2000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test netlify/functions/lib/office/research-report.test.mjs`
Expected: FAIL on import (`pairs`).

- [ ] **Step 3: Add `grid` to the Writer**

In `pdf.mjs`, add to `class Writer` after `bars`:

```js
  // The study as squares: one row and column per search, shaded by how
  // alike the two are, page blocks outlined. Labels down the side only; the
  // columns are the same list in the same order. Gray, not colour, so the
  // shades survive a black-and-white print.
  grid({ labels, bands, blocks }) {
    const n = labels.length;
    if (!n) return;
    const size = SIZES.small; const labelW = 150;
    const cell = Math.max(4, Math.min(14, Math.floor((CONTENT - labelW) / n)));
    const height = n * cell + 14;
    this.need(height);
    const x0 = MARGIN + labelW; const y0 = this.y;
    const grays = [null, 0.86, 0.66, 0.35];
    labels.forEach((label, i) => {
      const [line] = wrap(this.fonts.body, Math.min(size, cell - 1), label, labelW - 8);
      this.page.drawText(line, { x: MARGIN, y: y0 - (i + 1) * cell + 2, size: Math.min(size, cell - 1), font: this.fonts.body });
      for (let j = 0; j < n; j += 1) {
        const x = x0 + j * cell; const y = y0 - (i + 1) * cell;
        if (i === j) { this.page.drawRectangle({ x, y, width: cell, height: cell, color: rgb(0.95, 0.95, 0.95) }); continue; }
        const g = grays[bands[i][j]];
        if (g != null) this.page.drawRectangle({ x, y, width: cell, height: cell, color: rgb(g, g, g) });
      }
    });
    let at = 0;
    for (const len of blocks) {
      this.page.drawRectangle({ x: x0 + at * cell, y: y0 - (at + len) * cell, width: len * cell, height: len * cell, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.8 });
      at += len;
    }
    this.y -= height;
  }
```

- [ ] **Step 4: Rewrite `reportLines`**

Replace the import and `reportLines` in `research-report.mjs` with:

```js
import { pagesOf, studyView, band, confidenceWords } from './research.mjs';
```

```js
const GRID_ON_PAGE_ONE = 30;

const vol = (k) => (k?.volume ? (k.volume.min === k.volume.max ? String(k.volume.max) : `${k.volume.min} – ${k.volume.max}`) : null);

export function reportLines({ client, round, renderedAt }) {
  const L = [];
  const h1 = (text) => L.push({ kind: 'h1', text });
  const h2 = (text) => L.push({ kind: 'h2', text });
  const p = (text) => L.push({ kind: 'p', text });
  const small = (text) => L.push({ kind: 'small', text });
  const table = (rows) => L.push({ kind: 'table', rows });
  const byId = new Map(round.keywords.map((k) => [k.id, k]));
  const text = (id) => byId.get(id)?.text ?? id;
  const withVolume = (id) => { const v = vol(byId.get(id)); return v ? `${text(id)} (${v} a month)` : text(id); };
  const pages = pagesOf(round);
  const standing = pages.filter((x) => x.standing !== 'low');
  const low = pages.filter((x) => x.standing === 'low');
  const titles = new Map(pages.map((x) => [x.id, x.title]));
  const view = studyView(round, pages);
  const captured = round.keywords.filter((k) => round.serps[k.id]);
  const volumeLoaded = round.keywords.some((k) => k.volume);
  const edited = pages.filter((x) => x.auto === false);
  const day = formatYmd(todayIn(undefined, renderedAt));
  const started = formatYmd(todayIn(undefined, new Date(round.startedAt)));
  const closed = round.closedAt ? formatYmd(todayIn(undefined, new Date(round.closedAt))) : null;
  const grid = {
    kind: 'grid',
    labels: view.order.map(text),
    bands: view.order.map((a) => view.order.map((b) => (a === b ? 0 : band(view.sims[a][b])))),
    blocks: view.blocks.map((b) => b.length),
  };
  const gridOnPageOne = view.order.length > 0 && view.order.length <= GRID_ON_PAGE_ONE;

  // Page one is the whole report for the reader with other things to do:
  // what this is, the numbers, the grid, the page list. Everything that
  // shows the working sits behind a line that says they can stop.
  h1('Search research');
  p(`${client.business} · ${client.tier ?? ''} · Round started ${started}${closed ? `, closed ${closed}` : ''} · Printed ${day}`.replace(' ·  ·', ' ·'));
  p('Before we build anything, we look at what people actually type into Google when they need what you do, and which of those searches Google answers with the same businesses. Searches answered by the same businesses share a page. Searches that are not get their own. This is what we found, and the page list that comes out of it.');
  if (round.notes?.intro) p(round.notes.intro);

  L.push({ kind: 'stats', items: [
    [String(captured.length), captured.length === 1 ? 'search' : 'searches'],
    [String(standing.length), standing.length === 1 ? 'page' : 'pages'],
    ...(volumeLoaded ? [[String(low.length), low.length === 1 ? 'search not worth a page' : 'searches not worth a page']] : []),
  ] });

  if (gridOnPageOne) {
    p('Each square is two searches. The darker it is, the more the same businesses answer both. The outlined blocks are the pages.');
    L.push(grid);
  } else if (view.order.length) {
    p('The study grid is in the appendix; with this many searches it needs a page of its own.');
  }

  h2('Your pages');
  if (!standing.length) p('No searches have been captured yet.');
  for (const row of standing) {
    p(`${row.title}${row.kind ? ` — ${row.kind}` : ''}`);
    small(`Answers: ${row.keywords.map(withVolume).join('; ')}`);
    if (row.reason) small(row.reason);
    if (row.confidence?.level === 'close') small(`This one could also sit with ${titles.get(row.confidence.near) ?? 'another page'}; the businesses differ enough to keep it apart.`);
    if (row.note) small(row.note);
  }

  h2('Where we used judgement');
  if (!edited.length) p('The businesses settled every page without a judgement call.');
  else table([['Page', 'Searches', 'Note'], ...edited.map((x) => [x.title, x.keywords.map(text).join('; '), x.note ?? ''])]);

  if (volumeLoaded && low.length) {
    h2('Not built for');
    p(`${low.flatMap((x) => x.keywords).map(withVolume).join('; ')}: searched too rarely to build for. They stay in the study, and a later round can bring them back.`);
  }

  h2('How we did it');
  p(`We searched ${plural(captured.length, 'term')} from your questionnaire, the same way each time, and kept the first eight real results for each: no ads, no map pins. For each search we look at which businesses Google ranks and how high. A business that ranks for nearly every search in your field, a listing site or a big competitor, tells us little about any one search, so it counts for little. The businesses that show up for some searches and not others are what tell us two searches mean the same thing. When two searches are answered by mostly the same businesses, they are one question and one page answers both. When they are not, they need their own pages. Search volume tells us which pages are worth building at all.`);
  if (round.notes?.closing) p(round.notes.closing);

  p('You can stop here. Everything after this is our work, shown.');

  if (!gridOnPageOne && view.order.length) {
    h2('Appendix: the study grid');
    p('Each square is two searches. The darker it is, the more the same businesses answer both. The outlined blocks are the pages.');
    L.push(grid);
  }

  h2('Appendix: what we saw');
  for (const row of pages) {
    const results = row.keywords.flatMap((id) => round.serps[id]?.results ?? []);
    const doms = topDomains(results);
    if (!doms.length) continue;
    p(`${row.title}${row.kind ? ` — ${row.kind.toLowerCase()}` : ''}`);
    table([['Business', 'Appearances'], ...doms.map(([d, n]) => [d, String(n)])]);
  }

  h2('Appendix: every search');
  for (const k of captured) {
    const serp = round.serps[k.id];
    p(`${k.text} · captured ${formatYmd(todayIn(undefined, new Date(serp.capturedAt)))}`);
    table([['#', 'Title', 'Business', 'Page type'], ...serp.results.map((x) => [String(x.rank), x.title, x.domain, x.pageType])]);
  }
  return L;
}
```

In `renderResearchReport`, add `else if (line.kind === 'grid') w.grid(line);` and remove the `bars` branch. Keep `topDomains`, `plural` and `reportName` as they are. `confidenceWords` is imported for the tab; if the report does not end up using it, drop it from this import to keep the linter quiet.

- [ ] **Step 5: Run the tests**

Run: `node --test netlify/functions/lib/office/research-report.test.mjs && npm test`
Expected: PASS across the board.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/office/pdf.mjs netlify/functions/lib/office/research-report.mjs netlify/functions/lib/office/research-report.test.mjs
git commit -m "Print the study grid and the reasons in the report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The matrix component and its styles

**Files:**
- Create: `src/components/office/StudyMatrix.astro`
- Modify: `src/styles/office.css` (append)

**Interfaces:**
- Consumes: `band`, `CUT` from `research.mjs`; a `studyView()` result.
- Produces: `<StudyMatrix view={...} compare={(key) => url} />` where `view = { order, sims, blocks, texts }` and `compare` builds the compare-page link from a `pairKey`.

Before writing the shades, read the `dataviz` skill's guidance on sequential palettes if it is available in the session; the shades below are one hue from the office palette at four strengths, which is what it prescribes for an ordered scale.

- [ ] **Step 1: Write the component**

```astro
---
// The whole study in one table: keywords down the side and across the top
// in page order, each cell shaded by how alike the two searches are, each
// page outlined as a block on the diagonal. No script: it is a table, it
// scrolls, and every cell is a link to the two searches side by side.
import { band, pairKey } from '../../../netlify/functions/lib/office/research.mjs';

interface Props { view: { order: string[]; sims: Record<string, Record<string, number>>; blocks: string[][]; texts: Map<string, string> }; compare: (key: string) => string }
const { view, compare } = Astro.props;
const { order, sims, blocks, texts } = view;
// Which block each keyword sits in, so a cell knows whether it is inside a
// page and whether a page edge runs along it.
const blockOf = new Map<string, number>();
blocks.forEach((b, i) => b.forEach((id) => blockOf.set(id, i)));
const last = new Set(blocks.map((b) => b[b.length - 1]));
const pct = (v: number) => `${Math.round(v * 100)}%`;
---
{order.length < 2 ? <p class="empty">Capture two keywords and the study grid appears here.</p> : (
  <div class="table-scroll">
    <table class="study">
      <thead>
        <tr><th class="corner"></th>{order.map((id) => <th class="col" scope="col"><span>{texts.get(id)}</span></th>)}</tr>
      </thead>
      <tbody>
        {order.map((a) => (
          <tr>
            <th class="row" scope="row">{texts.get(a)}</th>
            {order.map((b) => {
              const same = blockOf.get(a) === blockOf.get(b);
              const cls = ['cell', a === b ? 'diag' : `s${band(sims[a][b])}`, same ? 'blk' : '', last.has(b) ? 'edge-r' : '', last.has(a) ? 'edge-b' : ''].filter(Boolean).join(' ');
              return a === b ? <td class={cls}></td>
                : <td class={cls}><a href={compare(pairKey(a, b))} title={`${texts.get(a)} · ${texts.get(b)}: ${pct(sims[a][b])} alike`}><span class="sr-only">{pct(sims[a][b])}</span></a></td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

- [ ] **Step 2: Add the styles**

Append to `src/styles/office.css`:

```css
/* The study grid: one hue at four strengths for how alike two searches
   are, page blocks outlined on the diagonal. */
.office table.study { border-collapse: collapse; width: auto; font-size: 0.78em; }
.office table.study th, .office table.study td { padding: 0; border: 1px solid var(--hairline-soft); }
.office table.study th.corner { border: 0; }
.office table.study th.col { vertical-align: bottom; height: 11rem; font-weight: 400; border-top: 0; }
.office table.study th.col > span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; max-height: 10.5rem; overflow: hidden; text-overflow: ellipsis; padding: 0.25rem 0; color: var(--graphite); }
.office table.study th.row { text-align: right; white-space: nowrap; font-weight: 400; padding-right: 0.5rem; border-left: 0; color: var(--graphite); }
.office table.study td.cell { width: 1.25rem; height: 1.25rem; min-width: 1.25rem; }
.office table.study td.cell a { display: block; width: 100%; height: 100%; }
.office table.study td.diag { background: var(--paper-inset); }
.office table.study td.s0 { background: transparent; }
.office table.study td.s1 { background: color-mix(in srgb, var(--green) 18%, var(--paper)); }
.office table.study td.s2 { background: color-mix(in srgb, var(--green) 45%, var(--paper)); }
.office table.study td.s3 { background: var(--green); }
.office table.study td.edge-r { border-right: 2px solid var(--ink); }
.office table.study td.edge-b { border-bottom: 2px solid var(--ink); }
.office table.study tbody tr:first-child td.blk { border-top-color: var(--ink); }
.office table.study td.blk:first-of-type { border-left-color: var(--ink); }
.office .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.office .study-legend { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
.office .study-legend .swatch { display: inline-block; width: 0.9rem; height: 0.9rem; vertical-align: -0.15rem; margin-right: 0.3rem; border: 1px solid var(--hairline-soft); }
```

If `scripts/verify.mjs` fails the build on `color-mix`, replace the three mixed shades with fixed hex values derived from the brand green at 18 %, 45 % and 100 % over the paper colour (compute them once from the tokens in `office.css` and comment the source).

- [ ] **Step 3: Check it compiles**

Run: `npm run check`
Expected: errors only in `Research.astro`, `compare.astro` and `rounds/[id].astro` (removed imports), none in `StudyMatrix.astro`.

- [ ] **Step 4: Commit**

```bash
git add src/components/office/StudyMatrix.astro src/styles/office.css
git commit -m "Draw the study as a clustered matrix

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The tab, the compare page, the rounds page

**Files:**
- Modify: `src/components/office/Research.astro`
- Modify: `src/pages/office/research/[slug]/compare.astro`
- Modify: `src/pages/office/research/[slug]/rounds/[id].astro`

**Interfaces:**
- Consumes: `pageList`, `pagesOf`, `studyView`, `confidenceWords`, `comparePair`, `describePair`, `KINDS`, `PAGE_TYPES`, `FLOOR` from `research.mjs`; `StudyMatrix`.
- Produces: the office builds green again.

- [ ] **Step 1: Rewrite the tab's frontmatter and the sections that change**

In `Research.astro`, change the import to:

```js
import StudyMatrix from './StudyMatrix.astro';
import { bookmarklet, pageList, studyView, confidenceWords, KINDS, PAGE_TYPES, FLOOR, emptyStudy, migrateStudy, openRound, searchUrl, RESEARCH_SCHEME } from '../../../netlify/functions/lib/office/research.mjs';
```

Replace everything from `const ps = pairs(round) as any[];` through `const edited = ...` with:

```js
const pages = pageList(round) as any[];
const standing = pages.filter((p) => p.standing !== 'low');
const low = pages.filter((p) => p.standing === 'low');
const closeCalls = standing.filter((p) => p.confidence?.level === 'close').length;
const edited = pages.filter((p) => !p.auto).length;
const titles = new Map<string, string>(pages.map((p) => [p.id, p.title]));
const view = studyView(round, pages);
const volumeLoaded = round.keywords.some((k: any) => k.volume);
const vol = (k: any) => (k?.volume ? (k.volume.min === k.volume.max ? String(k.volume.max) : `${k.volume.min}–${k.volume.max}`) : null);
```

Delete `const showPairs = ...`. Replace the `facts` array with:

```js
const facts: Fact[] = [
  round.keywords.length === 0 ? { label: 'Captured', state: 'none', text: 'No keywords yet' }
    : next ? { label: 'Captured', state: captures.length ? 'waiting' : 'none', text: `${captures.length} of ${round.keywords.length}`, detail: `Next: ${next.text}`, href: searchUrl(next.text), search: true }
    : { label: 'Captured', state: 'done', text: `All ${round.keywords.length}` },
  standing.length === 0 ? { label: 'Pages', state: 'none', text: 'None yet' }
    : { label: 'Pages', state: closeCalls ? 'waiting' : 'done', text: `${standing.length} ${standing.length === 1 ? 'page' : 'pages'}`, detail: closeCalls ? `${closeCalls} close ${closeCalls === 1 ? 'call' : 'calls'}` : edited ? `${edited} edited by you` : 'Grouped automatically' },
  volumeLoaded ? { label: 'Volume', state: 'done', text: `Loaded ${day(round.volumeImport?.at ?? round.updatedAt ?? round.startedAt)}`, detail: low.length ? `${low.length} not worth a page` : undefined }
    : { label: 'Volume', state: next || !round.keywords.length ? 'none' : 'waiting', text: 'Not loaded', detail: 'Import a Keyword Planner CSV below' },
  round.reportedAt ? { label: 'Report', state: 'done', text: `Written ${day(round.reportedAt)}`, href: `/office/clients/${slug}/?tab=documents` }
    : { label: 'Report', state: 'none', text: 'Not written' },
];
```

After the `{captured && ...}` notice line, add:

```astro
{round.keywords.length > 0 && round.areas.length === 0 && <p class="notice">No service areas set, so location pages cannot be spotted. Add them under Service areas below.</p>}
```

In the Keywords ledger row, after `<span class="title">{k.text}</span>`, add `{vol(k) && <span class="meta"> · {vol(k)} a month</span>}`.

After the Service areas fold, add the Volume fold:

```astro
<details class="fold" open={!volumeLoaded && !next && round.keywords.length > 0}>
  <summary>Search volume<span class="sub">{volumeLoaded ? `Loaded ${day(round.volumeImport?.at ?? round.updatedAt)}` : 'Not loaded'}</span></summary>
  <div class="fold-body">
    <p class="quiet">Paste the keyword list into Google Keyword Planner, download its CSV, and import it here. Volume never moves a keyword between pages; it says whether a page is worth building. A page whose keywords add up to fewer than {FLOOR} searches a month is set aside below the page list.</p>
    <form method="POST" action={api} enctype="multipart/form-data" class="toolbar">
      {hidden({ csrf, slug, op: 'volume', round: round.id }).map((h) => <input type="hidden" name={h.name} value={h.value} />)}
      <input type="file" name="file" accept=".csv,text/csv,text/tab-separated-values" required aria-label="Keyword Planner CSV" />
      <button class="btn-quiet">Import volume</button>
    </form>
    {round.volumeImport && (
      <p class="quiet">Last import matched {round.volumeImport.matched} of {round.keywords.length}.
        {round.volumeImport.unmatchedKeywords.length > 0 && <> Not in the file: {round.volumeImport.unmatchedKeywords.map(text).join('; ')}.</>}
        {round.volumeImport.unmatchedRows.length > 0 && <> In the file but not in the study: {round.volumeImport.unmatchedRows.join('; ')}.</>}
      </p>
    )}
  </div>
</details>
```

Replace the whole Pairs section (from `<h2>Pairs` through the `settled.length > 0` paragraph) with:

```astro
<h2>Study</h2>
<StudyMatrix view={view} compare={compare} />
{view.order.length >= 2 && (
  <p class="quiet study-legend">
    <span><span class="swatch" style="background: transparent"></span>none</span>
    <span><span class="swatch" style="background: color-mix(in srgb, var(--green) 18%, var(--paper))"></span>faint</span>
    <span><span class="swatch" style="background: color-mix(in srgb, var(--green) 45%, var(--paper))"></span>some</span>
    <span><span class="swatch" style="background: var(--green)"></span>most</span>
    <span>Dark blocks on the diagonal are pages. A dark cell outside a block is a keyword that could go either way; open it to see why.</span>
  </p>
)}
```

Replace the Pages section with:

```astro
<h2>Pages <span class="count">{standing.length}</span></h2>
{standing.length === 0 && <p class="empty">Capture a few keywords and the page list appears here.</p>}
{standing.length > 0 && <p class="quiet">Grouped from the businesses that rank for each search. Edit a page to keep your own title, kind and note, or to move keywords between pages; a keyword you release is regrouped on its own.</p>}
{standing.length > 0 && (
  <ul class="ledger">
    {standing.map((p) => (
      <li class="no-tick">
        <span class="when"><Mark state={p.confidence?.level === 'close' ? 'waiting' : p.auto ? 'none' : 'done'}>{p.kind}</Mark></span>
        <span class="what">
          <span class="title">{p.title}</span><span class="meta"> · {p.auto ? confidenceWords(p, titles) : 'Edited'}</span>
          {p.keywords.length > 1 && <span class="meta line">{p.keywords.map((id: string) => `${text(id)}${vol(byId.get(id)) ? ` (${vol(byId.get(id))})` : ''}`).join(' · ')}</span>}
          {p.reason && <span class="meta line">{p.reason}</span>}
          {p.note && <span class="meta line">Note: {p.note}</span>}
        </span>
        <span class="act">
          <details class="pop">
            <summary class="link-quiet">Edit</summary>
            <form method="POST" action={api} class="pop-sheet">
              {hidden({ csrf, slug, id: p.id, round: round.id }).map((h) => <input type="hidden" name={h.name} value={h.value} />)}
              <label class="field"><span>Page</span><input name="title" value={p.title} required /></label>
              <label class="field"><span>Kind</span><select name="kind">{KINDS.map((t) => <option selected={p.kind === t}>{t}</option>)}</select></label>
              <fieldset class="field"><legend>Keywords on this page</legend>
                {round.keywords.filter((k: any) => round.serps[k.id]).map((k: any) => (
                  <label class="field check"><input type="checkbox" name="keywords" value={k.id} checked={p.keywords.includes(k.id)} /> <span>{k.text}</span></label>
                ))}
              </fieldset>
              <label class="field"><span>Note for the report</span><input name="note" value={p.note} /></label>
              <div class="pop-actions">
                <button class="btn-quiet btn-small" name="op" value="page">Save</button>
                {!p.auto && <button class="link-quiet" name="op" value="reset" formnovalidate>Back to automatic</button>}
              </div>
            </form>
          </details>
        </span>
      </li>
    ))}
  </ul>
)}
{low.length > 0 && (
  <>
    <h3>Not worth a page <span class="count">{low.length}</span></h3>
    <p class="quiet">Fewer than {FLOOR} searches a month between them. They stay in the study and out of the site.</p>
    <ul class="ledger">
      {low.map((p) => (
        <li class="no-tick">
          <span class="when"><Mark state="none">{p.keywords.map((id: string) => vol(byId.get(id))).join(', ')} a month</Mark></span>
          <span class="what"><span class="title">{p.keywords.map(text).join(' · ')}</span>{p.confidence?.near && <span class="meta"> · nearest: {titles.get(p.confidence.near)}</span>}</span>
          <span class="act">
            <form method="POST" action={api} class="inline">
              {hidden({ csrf, slug, op: 'page', id: p.id, title: p.title, kind: p.kind, note: '', keywords: p.keywords.join(','), round: round.id }).map((h) => <input type="hidden" name={h.name} value={h.value} />)}
              <button class="link-quiet">Give it a page</button>
            </form>
          </span>
        </li>
      ))}
    </ul>
  </>
)}
```

Leave Capture, Keywords, Results, Notes and Report as they are.

- [ ] **Step 2: Rewrite the compare page's frontmatter and glance**

In `compare.astro`, change the research import to `comparePair, describePair, normalizeUrl, businessOf, pairKey, migrateStudy, openRound, pagesOf`. Replace from `const c = comparePair(...)` through `const signalWord = ...` with:

```js
const c = comparePair(round, a.id, b.id) as any;
const total = Math.max(serpA.results.length, serpB.results.length);
const urls = new Set(c.sharedUrls as string[]);
const domains = new Set(c.sharedDomains as string[]);
const mark = (r: any) => (urls.has(normalizeUrl(r.url)) ? 'hl-url' : domains.has(businessOf(r.url)) ? 'hl-domain' : '');
const numbered = new Map<string, number>([...domains].sort().map((d, i) => [d, i + 1]));
const badge = (r: any) => numbered.get(businessOf(r.url)) ?? null;
const day = (iso: string) => formatYmd(todayIn(undefined, new Date(iso)));
const tab = `/office/clients/${slug}/?tab=research`;
const pages = pagesOf(round) as any[];
const pageOf = (id: string) => pages.find((p) => p.keywords.includes(id));
const pct = Math.round(c.similarity * 100);
const alike = c.band === 3 ? 'Share a page' : c.band === 0 ? 'Separate' : 'Close';
```

Replace the `<dl class="glance">` block and the `describePair` paragraph with:

```astro
  <dl class="glance">
    <div><dt>Alike</dt><dd>{pct}%<span class="detail">{alike}</span></dd></div>
    <div><dt>Businesses that decided it</dt><dd>{c.shared.length}<span class="detail">{c.shared.slice(0, 3).map((x: any) => x.business).join(', ') || 'none'}</span></dd></div>
    <div><dt>Directories in common</dt><dd>{c.sharedDirectories}<span class="detail">count for nothing</span></dd></div>
    <div><dt>Same exact URL</dt><dd>{c.exactUrl} of {total}</dd></div>
    <div><dt>Same business</dt><dd>{c.sameDomain} of {total}<span class="detail">{c.sameDomainDifferentPage} with a different page</span></dd></div>
    <div><dt>Pages</dt><dd>{pageOf(a.id)?.title ?? '—'}<span class="detail">{pageOf(a.id) === pageOf(b.id) ? 'both on this page' : `and ${pageOf(b.id)?.title ?? '—'}`}</span></dd></div>
  </dl>
  <p><strong>{describePair(c)}</strong></p>
  {c.shared.length > 0 && (
    <p class="quiet">Weight each shared business carried, heaviest first: {c.shared.map((x: any) => `${x.business} ${x.contribution.toFixed(2)}${x.sameUrl ? '' : ' (different page)'}`).join(' · ')}.</p>
  )}
```

Delete the `<h2>Your read ...` heading and the whole `<form ... class="sheet decision">` block. Remove `READS`, `SAME`, `csrf`, `key`, `read` and `suggested` from the frontmatter. Keep the two columns, the legend and the connector script.

- [ ] **Step 3: Rewrite the rounds page**

In `rounds/[id].astro`, change the research import to `migrateStudy, roundOf, pagesOf, studyView, confidenceWords` and add `import StudyMatrix from '../../../../../components/office/StudyMatrix.astro';`. Replace `const ps = pairs(round) as any[]; const rows = pageList(round) as any[];` with:

```js
const rows = pagesOf(round) as any[];
const titles = new Map<string, string>(rows.map((p: any) => [p.id, p.title]));
const view = studyView(round, rows);
const compare = (key: string) => `/office/research/${slug}/compare/?pair=${encodeURIComponent(key)}`;
const reads = Object.entries(round.reads ?? {}) as [string, any][];
```

Replace the Pages ledger's `<span class="meta"> · {p.type}</span>` with `<span class="meta"> · {p.kind ?? p.type ?? ''}{p.auto && p.confidence ? ` · ${confidenceWords(p, titles)}` : ''}</span>` and add `{p.reason && <span class="meta line">{p.reason}</span>}` under the keywords line. Replace the whole Pairs section with:

```astro
  <h2>Study</h2>
  <StudyMatrix view={view} compare={compare} />
  {reads.length > 0 && (
    <>
      <h2>Decisions recorded <span class="count">{reads.length}</span></h2>
      <ul class="ledger">
        {reads.map(([key, read]) => (
          <li class="no-tick">
            <span class="when"><Mark state="done">{read.human}</Mark></span>
            <span class="what"><span class="title">{key.split('|').map(text).join(' · ')}</span><span class="meta"> · same cluster: {read.sameCluster}</span>
              {read.notes && <span class="meta line">Note: {read.notes}</span>}
            </span>
          </li>
        ))}
      </ul>
    </>
  )}
```

Note: the compare page reads the open round only. A cell link from a frozen round's matrix opens the pair in the open round, which is the same two keyword ids by design (rounds inherit ids). If either keyword is uncaptured in the open round the compare page 404s; that is acceptable for an archive and needs no special case.

- [ ] **Step 4: Build and run the gate**

Run: `npm run gate`
Expected: PASS. If `check` complains about `color-mix` in inline styles or `verify.mjs` rejects an inline `style` attribute, move the legend swatches to four classes `.swatch.s0`–`.swatch.s3` in `office.css` reusing the cell shades.

- [ ] **Step 5: Look at it**

Run `npm run dev:office`, open a client with a study (or seed one from the fixture by posting its captures through the capture page), and check: the glance shows four facts; the Study table renders with blocks on the diagonal; a cell opens the compare page with no form; a page's Edit pop lists keyword checkboxes and saving moves a keyword; the Volume fold accepts a CSV; the archived round shows the matrix and "Decisions recorded".

- [ ] **Step 6: Commit**

```bash
git add src/components/office/Research.astro "src/pages/office/research/[slug]/compare.astro" "src/pages/office/research/[slug]/rounds/[id].astro" src/styles/office.css
git commit -m "Review pages, not pairs, on the Research tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Validation scripts, docs and README

**Files:**
- Create: `scripts/validate-clusters.mjs`
- Create: `scripts/validate-captures.mjs`
- Create: `docs/research-validation.md`
- Delete: `scripts/calibrate-pairs.mjs`
- Modify: `README.md` (the Search research section)

**Interfaces:**
- Consumes: `migrateStudy`, `openRound`, `matrix`, `similarities`, `cluster`, `businessOf`, `normalizeQuery` from `research.mjs`.
- Produces: two scripts, run by hand. No tests: they are operator tools over live data, and their logic is the engine's, which is tested.

- [ ] **Step 1: Write `scripts/validate-clusters.mjs`**

```js
// Scores the engine's page list against an independent clustering of the
// same keywords, and sweeps the cut to find where they agree most. Run:
//   node scripts/validate-clusters.mjs <export.json> <external.csv>
// external.csv: two columns, keyword and cluster, from Keyword Insights,
// Keyword Cupid, ContentGecko or any SERP-overlap tool. Keywords match on
// normalized text; unmatched ones are listed and left out of the score.
import { readFileSync } from 'node:fs';
import { migrateStudy, openRound, matrix, similarities, cluster, normalizeQuery, CUT } from '../netlify/functions/lib/office/research.mjs';

const [file, external] = process.argv.slice(2);
if (!file || !external) { console.error('usage: node scripts/validate-clusters.mjs <export.json> <external.csv>'); process.exit(1); }

const docs = JSON.parse(readFileSync(file, 'utf8'));
const doc = Array.isArray(docs) ? docs[0] : docs;
const round = openRound(migrateStudy(doc));
const m = matrix(round);
const sims = similarities(m);
const ids = m.keywords.map((k) => k.id);
const textOf = new Map(m.keywords.map((k) => [normalizeQuery(k.text), k.id]));

// keyword,cluster with optional quotes; a header row is skipped if its first
// cell says keyword.
const theirs = new Map();
const unmatched = [];
for (const line of readFileSync(external, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  if (cells.length < 2 || /^keyword$/i.test(cells[0])) continue;
  const id = textOf.get(normalizeQuery(cells[0]));
  if (id) theirs.set(id, cells[1]); else unmatched.push(cells[0]);
}
const scored = ids.filter((id) => theirs.has(id));
console.log(`${scored.length} of ${ids.length} keywords matched the external file${unmatched.length ? `; not in the study: ${unmatched.join('; ')}` : ''}`);
const missing = ids.filter((id) => !theirs.has(id)).map((id) => m.keywords.find((k) => k.id === id).text);
if (missing.length) console.log(`not in the external file: ${missing.join('; ')}`);

const together = (labels) => (a, b) => labels.get(a) === labels.get(b);
const pairsOf = (xs) => { const out = []; for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) out.push([xs[i], xs[j]]); return out; };

// Pair agreement: the share of keyword pairs both tools put together or
// both put apart. Adjusted Rand index: the same idea corrected for what
// chance alone would score, so 0 is random and 1 is identical.
function score(ours) {
  const same = together(ours); const ext = together(theirs);
  const ps = pairsOf(scored);
  let a = 0; let b = 0; let c = 0; let d = 0;
  for (const [x, y] of ps) {
    const s = same(x, y); const e = ext(x, y);
    if (s && e) a += 1; else if (s && !e) b += 1; else if (!s && e) c += 1; else d += 1;
  }
  const agreement = ps.length ? (a + d) / ps.length : 1;
  const n = ps.length;
  const expected = ((a + b) * (a + c)) / n;
  const max = ((a + b) + (a + c)) / 2;
  const ari = max === expected ? 1 : (a - expected) / (max - expected);
  return { agreement, ari };
}

const labelsAt = (cut) => {
  const { groups } = cluster(m, sims, cut);
  const labels = new Map();
  groups.forEach((g, i) => g.forEach((id) => labels.set(id, i)));
  return labels;
};

console.log(`\nat the current cut ${CUT}:`);
const now = score(labelsAt(CUT));
console.log(`  pair agreement ${(now.agreement * 100).toFixed(1)}%  adjusted Rand ${now.ari.toFixed(3)}`);

console.log('\nsweep:');
let best = { cut: CUT, ...now };
for (let cut = 0.05; cut <= 0.6001; cut += 0.05) {
  const s = score(labelsAt(cut));
  const { groups } = cluster(m, sims, cut);
  console.log(`  cut ${cut.toFixed(2)}  pages ${String(groups.length).padStart(2)}  agreement ${(s.agreement * 100).toFixed(1).padStart(5)}%  ARI ${s.ari.toFixed(3)}`);
  if (s.ari > best.ari + 1e-9) best = { cut, ...s };
}
console.log(`\nbest ARI ${best.ari.toFixed(3)} at cut ${best.cut.toFixed(2)}; if several cuts tie, take the middle of the plateau and record that it is flat.`);
```

- [ ] **Step 2: Write `scripts/validate-captures.mjs`**

```js
// Compares the bookmarklet's captures with what a SERP API returns for the
// same searches, so the research profile can be trusted or not. Run:
//   SERPAPI_KEY=... node scripts/validate-captures.mjs <export.json> [--location "Utah, United States"]
// Responses are cached beside the export as <export>.serpapi/<keyword id>.json,
// so a rerun costs no searches. The office never runs this; it is an
// operator's tool over an export, and the key lives only in the shell.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { migrateStudy, openRound, businessOf } from '../netlify/functions/lib/office/research.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const location = args.includes('--location') ? args[args.indexOf('--location') + 1] : 'Utah, United States';
const key = process.env.SERPAPI_KEY;
if (!file || !key) { console.error('usage: SERPAPI_KEY=... node scripts/validate-captures.mjs <export.json> [--location "Utah, United States"]'); process.exit(1); }

const docs = JSON.parse(readFileSync(file, 'utf8'));
const doc = Array.isArray(docs) ? docs[0] : docs;
const round = openRound(migrateStudy(doc));
const cacheDir = `${file}.serpapi`;
mkdirSync(cacheDir, { recursive: true });

async function fetchSerp(k) {
  const cached = `${cacheDir}/${k.id}.json`;
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({ engine: 'google', q: k.text, location, gl: 'us', hl: 'en', num: '10', device: 'desktop', api_key: key }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${k.text}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  writeFileSync(cached, JSON.stringify(body, null, 2));
  return body;
}

const rows = [];
for (const k of round.keywords.filter((x) => round.serps[x.id])) {
  const api = await fetchSerp(k);
  const theirs = (api.organic_results ?? []).slice(0, 8).map((x) => businessOf(x.link));
  const ours = round.serps[k.id].results.map((x) => businessOf(x.url));
  const shared = ours.filter((b) => theirs.includes(b));
  // Rank movement over the shared businesses: mean absolute difference in position.
  const moves = shared.map((b) => Math.abs(ours.indexOf(b) - theirs.indexOf(b)));
  rows.push({
    text: k.text, shared: shared.length, of: Math.min(ours.length, theirs.length),
    move: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null,
    onlyOurs: ours.filter((b) => !theirs.includes(b)), onlyTheirs: theirs.filter((b) => !ours.includes(b)),
  });
}

rows.sort((a, b) => a.shared / a.of - b.shared / b.of);
const ratios = rows.map((r) => r.shared / r.of).sort((a, b) => a - b);
const median = ratios[Math.floor(ratios.length / 2)];
console.log(`${rows.length} searches compared against SerpApi at "${location}"`);
console.log(`median agreement: ${(median * 100).toFixed(0)}% of businesses in common (top eight)\n`);
for (const r of rows) {
  const flag = r.shared / r.of < median - 0.25 ? '  <- well below the study' : '';
  console.log(`${String(r.shared).padStart(2)}/${r.of}  move ${r.move == null ? ' - ' : r.move.toFixed(1)}  ${r.text}${flag}`);
  if (r.onlyOurs.length) console.log(`        only in the capture: ${r.onlyOurs.join(', ')}`);
  if (r.onlyTheirs.length) console.log(`        only in the API:     ${r.onlyTheirs.join(', ')}`);
}
if (median < 0.5) console.log('\nAgreement is low across the board. That points at the research profile (signed-in history, personal results) or at the location the API used, not at any one search. Check the profile settings and the --location before reading anything into single keywords.');
```

- [ ] **Step 3: Write `docs/research-validation.md`**

```markdown
# Research validation

The engine in `netlify/functions/lib/office/research.mjs` is checked against
the Makeup by Brinley study (22 keywords, captured 2026-09-17 to 2026-09-18).
Each section is written by hand from the script it names. A section that
still reads "not run" has not been run.

## Page list against an independent clustering

Script: `node scripts/validate-clusters.mjs <export.json> <external.csv>`
External tool: (Keyword Insights on its $1 trial, or the free fallback used)
Date: not run

Pair agreement at the shipped cut:
Adjusted Rand index at the shipped cut:
Sweep result (best cut, and whether the peak was sharp or a plateau):
Cut chosen, and why:

## Captures against a SERP API

Script: `SERPAPI_KEY=... node scripts/validate-captures.mjs <export.json>`
Location used:
Date: not run

Median agreement:
Keywords well below the median, and what differed:
Verdict on the research profile:

## Volume

Source: Keyword Planner CSV, imported through the Research tab.
Date: not run

Keywords the file did not match:
Pages set aside as not worth building, with their volumes:
Whether the floor of 10 looks right for this study:

## The owner's read

With the new page list beside the one settled by hand on 2026-09-17: would
you build the new one? What would you change first?
```

- [ ] **Step 4: Delete the old calibration script and update the README**

```bash
git rm scripts/calibrate-pairs.mjs
```

Replace the README's `### Search research` section body (from "Growth, Agile and Range clients get a Research tab." to the paragraph ending "which links to the tab.") with:

```markdown
Growth, Agile and Range clients get a Research tab. It answers one question
before Stage 2: which searches share a page and which need their own. Results
come from your own browser through a bookmarklet, one click per keyword on
the results page, filed under the keyword whose text matches the search. No
search API and nothing to configure. The keyword list drafts itself from the
build questionnaire and is edited on the tab.

The engine builds one keyword-by-business matrix from the captures. Every
business is weighted by rank and by how rarely it appears across the study,
so a listing site or a competitor that ranks for everything counts for
almost nothing and a business that ranks for two searches counts for a lot.
Directories count for nothing outright. Keywords are clustered into pages
by how alike their businesses are, and each page gets a kind (homepage,
service page, location page, article), a confidence ("clear" or "close call
with …") and a one-line reason naming the businesses that decided it. The
Study section shows the whole matrix, keywords ordered so pages sit as dark
blocks on the diagonal; any cell opens the two searches side by side.

Search volume comes in by CSV: paste the keywords into Google Keyword
Planner, download, import under Search volume. Volume never moves a keyword
between pages; a page whose keywords add up to fewer than ten searches a
month is set aside as not worth building. Unknown volume is shown as
unknown and never treated as zero.

You review pages, not pairs. Edit a page to move keywords in or out, merge
or split; a released keyword is regrouped on its own. Starting a new round
freezes the page list on the round it closes, so an old report keeps saying
what it said. "Write the report to Documents" renders the study grid, the
pages and their reasons as a PDF; the send screen offers to attach the
newest one. Advancing a Growth, Agile or Range client into Demo creates the
"Run search research" task, which links to the tab.

The engine's one parameter, the clustering cut, and the volume floor are
provisional. `scripts/validate-clusters.mjs` scores the page list against
an independent SERP-overlap tool and sweeps the cut;
`scripts/validate-captures.mjs` compares captures with a SERP API. Their
findings live in `docs/research-validation.md`.
```

- [ ] **Step 5: Run the gate and commit**

Run: `npm run gate`
Expected: PASS.

```bash
git add scripts/validate-clusters.mjs scripts/validate-captures.mjs docs/research-validation.md README.md
git commit -m "Add the validation scripts and their write-up

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Run the validation (owner steps)

These need accounts, a key and a Planner export that only the owner has. The engineer prepares; the owner runs and writes the findings.

- [ ] **Step 1: Export the study**

From the running office: `/office/api/export?type=research&format=json`, saved as `research-<date>.json` outside the repo.

- [ ] **Step 2: External clustering**

Sign up for Keyword Insights ($1, 7 days) or Keyword Cupid / ContentGecko free. Paste the 22 keywords, location United States, and export the clusters as `keyword,cluster`. Run:

```bash
node scripts/validate-clusters.mjs research-<date>.json external.csv
```

Fill the first section of `docs/research-validation.md`. If the best cut differs from 0.25 with a sharp peak, change `CUT` in `research.mjs`, update its comment with the date, tool and ARI, and run `npm test`: the fixture test's shape assertions must still hold; if they do not, the fixture is telling you something about the study and the write-up records it.

- [ ] **Step 3: Captures**

Create a SerpApi account (250 searches a month free). Run:

```bash
SERPAPI_KEY=... node scripts/validate-captures.mjs research-<date>.json --location "Utah, United States"
```

Fill the second section.

- [ ] **Step 4: Volume**

In Keyword Planner, "Get search volume and forecasts", paste the 22 keywords, download the CSV, import it on the Research tab. Fill the third section from the Volume fold's unmatched lists and the "Not worth a page" section.

- [ ] **Step 5: The owner's read**

Open the tab beside `makeup-by-brynlie/intake/search-research-2026-09-17.pdf` and answer the last section.

- [ ] **Step 6: Commit**

```bash
git add docs/research-validation.md netlify/functions/lib/office/research.mjs
git commit -m "Record the first engine validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** §3.1 → Task 1. §3.2–3.3 → Task 2. §3.4–3.5 → Task 3. §3.6–3.7 → Task 5 (page edits by keyword list land in Task 6's action). §4 → Task 4 (`kindOf`) and Task 5 (Homepage in `pageList`). §5 → Task 4 (parse, apply, standing) and Task 6 (op). §6 → Tasks 8–9. §7 → Task 7. §8 → Task 5 (`pagesOf`), Task 6 (`read` refused, `round` freezes). §9 → Tasks 10–11. §10 files → every file is named in a task; `store.mjs` needs no change since the document shape is additive. §11 tests → Tasks 1–7 carry them; the "closed round's report matches its stored pages after CUT is changed" case is covered by the frozen-pages report test in Task 7, which uses stored rows the engine would not produce.

**Known deviation from the spec.** §3.1 lists Bark as a profile platform; Task 1 leaves it a plain directory because its profile URL shape could not be pinned down from the data. Amend the spec's table when Task 1 lands.

**Placeholders.** None. Every step has its code or its command.

**Type consistency.** `matrix()` returns `{ keywords, businesses, cells, weight }` in Task 2 and is read that way in Tasks 3, 5. `cluster()` returns `{ groups, order, merges }` in Task 3 and is read that way in Tasks 5, 10. `confidence()` returns `{ level, tightness, nearest, near }` where `near` is a group array; `pageList` converts it to a row id before storing, and `confidenceWords`, the tab and the report read the id form. `comparePair(round, aId, bId)` in Task 5 is called that way in Task 9. `studyView` returns `{ order, sims, blocks, texts }` in Task 5 and is consumed by `StudyMatrix` (Task 8), the tab and rounds page (Task 9) and the report (Task 7). The `page` op reads `kind`, not `type`, in Task 6, and the tab posts `kind` in Task 9. The `volume` op reads field `file`, and the tab's form names it `file`.
