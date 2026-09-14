# Search Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the SERP overlap process into the office: capture Google results with a bookmarklet, compute the spreadsheet's overlap rules automatically, keep a recommended page list per client, and print a client-facing PDF.

**Architecture:** A pure analysis module (`research.mjs`) holds every rule and is the only place the workbook's thresholds and wording live. A store type keeps one study document per client. One action handles every form on the Research tab and the capture page. A report module renders the PDF through the writer already used for agreements. The bookmarklet shares its result-picking function with the server module so the browser half and the tested half cannot drift.

**Tech Stack:** Node 20 ESM, `node --test`, Astro 5 server pages behind the office guard, pdf-lib, Netlify Blobs through the existing store, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-serp-research-design.md`

## Global Constraints

- No external network calls from the office. No new environment variables. No new npm dependencies.
- The workbook's thresholds and wording, verbatim: `exactUrl >= 7` strong, `3..6` gray, `sameDomain >= 4` the domain branch; the four read strings and four action strings in section 6 of the spec; "Tie / review" on a page-type tie.
- Page types, exactly: `Homepage`, `Service page`, `Location page`, `Directory`, `Blog/FAQ`, `Portfolio/Gallery`, `About page`, `Other`.
- Human reads, exactly: `Same intent`, `Probably same`, `Gray zone / discuss`, `Probably different`, `Different intent`. Same cluster: `Yes`, `No`, `Undecided`.
- Every action is a POST with the office CSRF token, reads a `slug` that matches `SLUG`, and redirects back to the client's Research tab (`/office/clients/{slug}/?tab=research`) with `error=` on failure, the way `task.mjs` and `document.mjs` do.
- Office pages are forms and full-page posts. The only script is the capture page's hash reader.
- Comments explain why, never what. Commit subjects imperative, under 50 characters. Every commit ends with the two attribution lines given in the session.
- Run `node --test <file>` for the file under work, and `npm test && npm run check && npm run check:office` before each commit.

---

### Task 1: Store type, export, pipeline `tab` key, seeds

**Files:**
- Modify: `netlify/functions/lib/office/store.mjs`
- Modify: `netlify/functions/lib/office/actions/export.mjs`
- Modify: `netlify/functions/lib/office/pipeline.mjs`
- Modify: `netlify/functions/lib/office/attention.mjs`
- Modify: `src/data/office/pipelines.json`
- Modify: `src/data/office/templates.json`
- Test: `netlify/functions/lib/office/store.test.mjs`, `netlify/functions/lib/office/pipeline.test.mjs`, `netlify/functions/lib/office/attention.test.mjs`

**Interfaces:**
- Produces: `s.research.get(slug) -> doc | null`, `s.research.put(slug, doc)`, `s.research.remove(slug)`, `s.research.listAll() -> doc[]`, `s.research.count()`. Task key `tab` on pipeline tasks, copied onto created tasks as `tab: string | null`. `nudge(t)` returns `{ href, label }` for a task with `tab`.

- [ ] **Step 1: Failing tests**

Append to `netlify/functions/lib/office/store.test.mjs`:

```js
test('research keeps one document per client', async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  assert.equal(await s.research.get('acme'), null);
  await s.research.put('acme', { slug: 'acme', keywords: [] });
  assert.deepEqual(await s.research.get('acme'), { slug: 'acme', keywords: [] });
  assert.equal((await s.research.listAll()).length, 1);
  assert.equal(await s.research.count(), 1);
  assert.equal((await s.counts()).research, 1);
  await s.research.remove('acme');
  assert.equal(await s.research.get('acme'), null);
});
```

Check the top of that file imports `createStore` and `memoryBackend`; add them if not.

Append to `netlify/functions/lib/office/pipeline.test.mjs` (check its existing imports for `validatePipelines`):

```js
test('a task may name a client tab, and only a real one', () => {
  const base = (tab) => [{ id: 'p', name: 'P', stages: [{ id: 's', name: 'S', tasks: [{ title: 'T', due: 1, tab }] }] }];
  assert.deepEqual(validatePipelines(base('research')), []);
  assert.match(validatePipelines(base('nope'))[0], /tab must be one of/);
});
```

Append to `netlify/functions/lib/office/attention.test.mjs` (check it imports `nudge`):

```js
test('nudge sends a tab task to that tab', () => {
  assert.deepEqual(nudge({ slug: 'acme', tab: 'research' }), { href: '/office/clients/acme/?tab=research', label: 'Research' });
});
```

- [ ] **Step 2: Run them, expect failures**

Run: `node --test netlify/functions/lib/office/store.test.mjs netlify/functions/lib/office/pipeline.test.mjs netlify/functions/lib/office/attention.test.mjs`
Expected: three failures (`s.research` undefined; `tab must be one of` not found; nudge returns null).

- [ ] **Step 3: Store**

In `store.mjs`, inside `createStore`, after the `contacts:` block and before `locks:`, add:

```js
    // One study per client, so it is keyed like the client document rather
    // than like the id-keyed types.
    research: {
      async get(slug) { return readJSON(office, `research/${assertSlug(slug)}.json`); },
      async put(slug, doc) { return writeJSON(office, `research/${assertSlug(slug)}.json`, doc); },
      async remove(slug) { return office.remove(`research/${assertSlug(slug)}.json`); },
      async listAll() { return readAll(office, 'research/'); },
      async count() { return (await office.list('research/')).length; },
    },
```

In `counts()`, after `out.contacts = ...`, add `out.research = await s.research.count();`.

In `export.mjs` change `EXPORTABLE` to `['clients', 'contacts', 'research', ...TYPES]`. The `s[type].listAll()` branch already covers it.

- [ ] **Step 4: Pipeline `tab`**

In `pipeline.mjs`, near the top after the `TIERS` import, add:

```js
// The client page's tab ids. A task that names one gets a link to it on
// Today and the client's Tasks tab, the way a payment task links to Payments.
export const TABS = ['overview', 'tasks', 'questionnaires', 'meetings', 'payments', 'emails', 'documents', 'agreements', 'research'];
```

In the task validation loop, after the `repeat` check, add:

```js
        if (t.tab !== undefined && !TABS.includes(t.tab)) errors.push(`${tat}: tab must be one of ${TABS.join(', ')}`);
```

Where created tasks are built (the object with `questionnaire: t.questionnaire ?? null, payment: ..., agreement: ..., repeat: ...`), add `tab: t.tab ?? null,`.

In `attention.mjs` `nudge`, add as the first line of the body:

```js
  if (t.tab) return { href: `/office/clients/${t.slug}/?tab=${t.tab}`, label: t.tab[0].toUpperCase() + t.tab.slice(1) };
```

- [ ] **Step 5: Seeds**

In `src/data/office/pipelines.json`, in the `demo` stage's `tasks`, after the `Send demo` task, add:

```json
          {
            "title": "Run search research",
            "due": 5,
            "tiers": ["Growth", "Agile", "Range"],
            "tab": "research"
          },
```

In `src/data/office/templates.json`, after the `layouts` template object, add:

```json
  {
    "id": "research-report",
    "name": "Search research report",
    "subject": "Your search research, and the pages it points to",
    "body": "Hi {{client.firstName}},\n\nAttached is the search research for {{client.business}}. It shows what people type into Google when they need what you do, which of those searches Google answers with the same pages, and the page list we are building from that.\n\nThe short version is on the second page. The rest is the evidence, search by search, in case you want to see how we got there.\n\n{{note}}\n\nThanks,\n{{site.brand}}",
    "fields": [
      {
        "key": "note",
        "label": "Personal note",
        "default": ""
      }
    ]
  },
```

- [ ] **Step 6: Run the tests and the seed check**

Run: `node --test netlify/functions/lib/office/store.test.mjs netlify/functions/lib/office/pipeline.test.mjs netlify/functions/lib/office/attention.test.mjs && npm run check:office`
Expected: all pass; `office seed ok`.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/office/store.mjs netlify/functions/lib/office/store.test.mjs netlify/functions/lib/office/actions/export.mjs netlify/functions/lib/office/pipeline.mjs netlify/functions/lib/office/pipeline.test.mjs netlify/functions/lib/office/attention.mjs netlify/functions/lib/office/attention.test.mjs src/data/office/pipelines.json src/data/office/templates.json
git commit -m "Add the research store type, a task tab link and seeds"
```

---

### Task 2: The analysis rules

**Files:**
- Create: `netlify/functions/lib/office/research.mjs`
- Test: `netlify/functions/lib/office/research.test.mjs`

**Interfaces:**
- Produces: `PAGE_TYPES`, `READS`, `SAME`, `normalizeUrl(url)`, `domainOf(url)`, `classify({ url, title }, areas) -> pageType`, `comparePair(resultsA, resultsB) -> { exactUrl, sameDomain, sameDomainDifferentPage, samePageType, read, action, signal, primaryPage }`, `pairKey(a, b)`, `pairs(study) -> [{ a, b, key, ...comparePair, read: study.reads[key] | null }]`, `group(study) -> pageRow[]`, `pageList(study) -> pageRow[]`, `emptyStudy(slug, now)`.

- [ ] **Step 1: Failing tests**

Create `netlify/functions/lib/office/research.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_TYPES, normalizeUrl, domainOf, classify, comparePair, pairKey, pairs, group, pageList, emptyStudy,
} from './research.mjs';

const r = (url, pageType = 'Service page', title = 'T') => ({ url, title, domain: domainOf(url), pageType, typeSource: 'auto' });

test('normalizeUrl folds the differences Google shows for one page', () => {
  assert.equal(normalizeUrl('https://www.Example.com/Weddings/?utm_source=x&gclid=1#top'), 'example.com/Weddings');
  assert.equal(normalizeUrl('http://example.com/weddings/?a=1'), 'example.com/weddings?a=1');
  assert.equal(normalizeUrl('https://example.com'), 'example.com');
  assert.equal(normalizeUrl('not a url'), 'not a url');
});

test('domainOf drops www and keeps the rest', () => {
  assert.equal(domainOf('https://www.example.com/a'), 'example.com');
  assert.equal(domainOf('https://shop.example.com/a'), 'shop.example.com');
});

test('classify follows the rules in order', () => {
  const areas = ['Provo', 'Utah County'];
  assert.equal(classify({ url: 'https://www.yelp.com/biz/x', title: 'Best' }, areas), 'Directory');
  assert.equal(classify({ url: 'https://maps.google.com/x', title: 'Map' }, areas), 'Directory');
  assert.equal(classify({ url: 'https://example.com/', title: 'Example' }, areas), 'Homepage');
  assert.equal(classify({ url: 'https://example.com/index.html', title: 'Example' }, areas), 'Homepage');
  assert.equal(classify({ url: 'https://example.com/provo-florist/', title: 'Florist' }, areas), 'Location page');
  assert.equal(classify({ url: 'https://example.com/florist/', title: 'Florist in Utah County' }, areas), 'Location page');
  assert.equal(classify({ url: 'https://example.com/areas-we-serve/', title: 'Areas' }, areas), 'Location page');
  assert.equal(classify({ url: 'https://example.com/blog/peonies/', title: 'Peonies' }, areas), 'Blog/FAQ');
  assert.equal(classify({ url: 'https://example.com/2025/03/x/', title: 'x' }, areas), 'Blog/FAQ');
  assert.equal(classify({ url: 'https://example.com/flowers/', title: 'How much do wedding flowers cost?' }, areas), 'Blog/FAQ');
  assert.equal(classify({ url: 'https://example.com/gallery/', title: 'Gallery' }, areas), 'Portfolio/Gallery');
  assert.equal(classify({ url: 'https://example.com/about-us/', title: 'About' }, areas), 'About page');
  assert.equal(classify({ url: 'https://example.com/wedding-flowers/', title: 'Wedding Flowers' }, areas), 'Service page');
  assert.equal(classify({ url: 'garbage', title: '' }, areas), 'Service page');
});

// Two SERPs sharing seven of eight URLs: the workbook's strong branch.
const A = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://a${n}.com/p`));
const B7 = [...A.slice(0, 7), r('https://other.com/p')];

test('comparePair counts like the workbook and reads the strong branch', () => {
  const c = comparePair(A, B7);
  assert.equal(c.exactUrl, 7);
  assert.equal(c.sameDomain, 7);
  assert.equal(c.sameDomainDifferentPage, 0);
  assert.equal(c.samePageType, 8);
  assert.equal(c.signal, 'strong');
  assert.equal(c.read, 'Strong overlap: very likely the same search intent.');
  assert.equal(c.action, 'Keep these keywords in the same cluster/page.');
  assert.equal(c.primaryPage, 'Service page');
});

test('comparePair gray zone, domain branch, and low', () => {
  const B4 = [...A.slice(0, 4), r('https://x1.com'), r('https://x2.com'), r('https://x3.com'), r('https://x4.com')];
  const g = comparePair(A, B4);
  assert.equal(g.signal, 'gray');
  assert.equal(g.read, 'GRAY ZONE: 3–6 shared URLs. Review page types, domains, and client priorities.');
  assert.equal(g.action, 'Discuss on the client call before deciding whether to split.');

  // Same businesses, different pages: five domains match, no URL does.
  const Bd = [1, 2, 3, 4, 5].map((n) => r(`https://a${n}.com/other`)).concat([r('https://y1.com'), r('https://y2.com'), r('https://y3.com')]);
  const d = comparePair(A, Bd);
  assert.equal(d.exactUrl, 0);
  assert.equal(d.sameDomain, 5);
  assert.equal(d.sameDomainDifferentPage, 5);
  assert.equal(d.signal, 'low');
  assert.equal(d.read, 'Low exact overlap, but many of the same businesses rank with different pages.');
  assert.equal(d.action, 'Inspect which pages each business uses before splitting.');

  const Bn = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://z${n}.com/p`));
  const l = comparePair(A, Bn);
  assert.equal(l.read, 'Low overlap: likely a meaningfully different intent.');
  assert.equal(l.action, 'Consider separate clusters/pages if page types also differ.');
});

test('comparePair primary page is the mode across both lists, tie reviewed, empty blank', () => {
  const a = [r('https://a.com/', 'Homepage'), r('https://b.com/x', 'Service page')];
  const b = [r('https://c.com/', 'Homepage'), r('https://d.com/blog', 'Blog/FAQ')];
  assert.equal(comparePair(a, b).primaryPage, 'Homepage');
  assert.equal(comparePair([r('https://a.com/', 'Homepage')], [r('https://b.com/x', 'Service page')]).primaryPage, 'Tie / review');
  assert.equal(comparePair([], []).primaryPage, '');
  assert.equal(comparePair([], []).read, 'Low overlap: likely a meaningfully different intent.');
});

test('pairKey sorts', () => {
  assert.equal(pairKey('k2', 'k1'), 'k1|k2');
});

const study = () => {
  const s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.keywords = [
    { id: 'k1', text: 'wedding florist provo', cluster: 'Weddings', arm: '', source: 'manual' },
    { id: 'k2', text: 'provo wedding flowers', cluster: 'Weddings', arm: '', source: 'manual' },
    { id: 'k3', text: 'funeral flowers provo', cluster: 'Sympathy', arm: '', source: 'manual' },
    { id: 'k4', text: 'not captured yet', cluster: 'Sympathy', arm: '', source: 'manual' },
  ];
  const cap = (results) => ({ capturedAt: '2026-09-13T01:00:00Z', query: 'q', results, related: [] });
  s.serps = { k1: cap(A), k2: cap(B7), k3: cap([1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://f${n}.com/p`))) };
  return s;
};

test('pairs covers captured keywords only and carries the stored read', () => {
  const s = study();
  s.reads['k1|k2'] = { human: 'Same intent', sameCluster: 'Yes', notes: '' };
  const p = pairs(s);
  assert.deepEqual(p.map((x) => x.key), ['k1|k2', 'k1|k3', 'k2|k3']);
  assert.equal(p[0].signal, 'strong');
  assert.equal(p[0].read.human, 'Same intent');
  assert.equal(p[1].read, null);
});

test('group joins strong pairs, honours No and Yes, leaves uncaptured out', () => {
  const s = study();
  let g = group(s);
  assert.deepEqual(g.map((x) => x.keywords), [['k1', 'k2'], ['k3']]);
  assert.equal(g[0].title, 'wedding florist provo');
  assert.equal(g[0].type, 'Service page');
  assert.equal(g[0].auto, true);

  s.reads['k1|k2'] = { human: 'Different intent', sameCluster: 'No', notes: '' };
  g = group(s);
  assert.deepEqual(g.map((x) => x.keywords), [['k1'], ['k2'], ['k3']]);

  s.reads['k1|k2'] = { human: 'Same intent', sameCluster: 'Undecided', notes: '' };
  s.reads['k1|k3'] = { human: 'Probably same', sameCluster: 'Yes', notes: '' };
  g = group(s);
  assert.deepEqual(g.map((x) => x.keywords), [['k1', 'k2', 'k3']]);
});

test('pageList keeps an edited row and regroups the rest', () => {
  const s = study();
  s.pages = [{ id: 'p9', title: 'Sympathy flowers', type: 'Service page', keywords: ['k3'], note: 'client asked', auto: false }];
  const list = pageList(s);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'p9');
  assert.deepEqual(list[1].keywords, ['k1', 'k2']);
  assert.equal(list[1].auto, true);
  // A keyword claimed by an edited row is not regrouped, even if strong.
  s.pages = [{ id: 'p9', title: 'One', type: 'Service page', keywords: ['k1'], note: '', auto: false }];
  assert.deepEqual(pageList(s).map((x) => x.keywords), [['k1'], ['k2'], ['k3']]);
});

test('emptyStudy has the spec shape', () => {
  const s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  assert.deepEqual(Object.keys(s), ['slug', 'createdAt', 'updatedAt', 'areas', 'keywords', 'serps', 'reads', 'pages', 'reportedAt']);
  assert.equal(s.createdAt, '2026-09-13T00:00:00.000Z');
  assert.deepEqual(PAGE_TYPES, ['Homepage', 'Service page', 'Location page', 'Directory', 'Blog/FAQ', 'Portfolio/Gallery', 'About page', 'Other']);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: fails to load, module not found.

- [ ] **Step 3: Implement**

Create `netlify/functions/lib/office/research.mjs`:

```js
// The SERP overlap process from docs/Keepsite_SERP_Overlap_Tracker_FINAL.xlsx
// as functions over one study document per client. Every threshold and
// every sentence a client might read lives here and nowhere else.

export const PAGE_TYPES = ['Homepage', 'Service page', 'Location page', 'Directory', 'Blog/FAQ', 'Portfolio/Gallery', 'About page', 'Other'];
export const READS = ['Same intent', 'Probably same', 'Gray zone / discuss', 'Probably different', 'Different intent'];
export const SAME = ['Yes', 'No', 'Undecided'];

const DIRECTORIES = [
  'yelp.com', 'angi.com', 'angieslist.com', 'thumbtack.com', 'yellowpages.com', 'bbb.org', 'facebook.com', 'instagram.com',
  'nextdoor.com', 'houzz.com', 'weddingwire.com', 'theknot.com', 'tripadvisor.com', 'mapquest.com', 'google.com', 'reddit.com',
  'quora.com', 'wikipedia.org', 'linkedin.com', 'pinterest.com', 'zola.com', 'bark.com', 'homeadvisor.com', 'expertise.com',
  'threebestrated.com',
];
const TRACKING = /^(utm_|gclid$|fbclid$)/;

const parse = (url) => { try { return new URL(String(url)); } catch { return null; } };

// Google shows one page under several spellings: www or not, a fragment, a
// tracking parameter, a trailing slash. The workbook compared them by eye.
export function normalizeUrl(url) {
  const u = parse(url);
  if (!u) return String(url ?? '').trim();
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  const path = u.pathname.replace(/\/+$/, '');
  return `${host}${path}${query}`;
}

export const domainOf = (url) => (parse(url)?.hostname ?? String(url ?? '')).toLowerCase().replace(/^www\./, '');

const hasAny = (s, needles) => needles.some((n) => s.includes(n));

export function classify({ url, title }, areas = []) {
  const u = parse(url);
  const domain = domainOf(url);
  const path = (u?.pathname ?? '/').toLowerCase().replace(/\/index\.html?$/, '/');
  const text = `${path} ${String(title ?? '')}`.toLowerCase();
  if (DIRECTORIES.some((d) => domain === d || domain.endsWith(`.${d}`))) return 'Directory';
  if (u && (path === '' || path === '/')) return 'Homepage';
  if (areas.some((a) => a && text.includes(String(a).toLowerCase())) || hasAny(path, ['/locations/', '/service-area', '/areas-we-serve'])) return 'Location page';
  if (hasAny(path, ['/blog', '/faq', '/news', '/article', '/post', '/guide', '/resources', '/tips']) || /\/20\d\d\//.test(path)
    || /^(how|what|why|when|which)\b/i.test(String(title ?? '').trim()) || String(title ?? '').includes('?')) return 'Blog/FAQ';
  if (hasAny(path, ['/gallery', '/portfolio', '/projects', '/our-work', '/photos', '/case-stud'])) return 'Portfolio/Gallery';
  if (hasAny(path, ['/about', '/team', '/our-story', '/staff', '/meet-'])) return 'About page';
  return 'Service page';
}

const READ_TEXT = {
  strong: ['Strong overlap: very likely the same search intent.', 'Keep these keywords in the same cluster/page.'],
  gray: ['GRAY ZONE: 3–6 shared URLs. Review page types, domains, and client priorities.', 'Discuss on the client call before deciding whether to split.'],
  domain: ['Low exact overlap, but many of the same businesses rank with different pages.', 'Inspect which pages each business uses before splitting.'],
  low: ['Low overlap: likely a meaningfully different intent.', 'Consider separate clusters/pages if page types also differ.'],
};

// The workbook's SUMPRODUCT/COUNTIF: one count per row of A that has a
// match anywhere in B, so eight rows give at most eight.
const countIn = (as, bs, key) => {
  const set = new Set(bs.map(key));
  return as.filter((x) => set.has(key(x))).length;
};

export function primaryPageOf(results) {
  const counts = new Map();
  for (const x of results) if (x.pageType) counts.set(x.pageType, (counts.get(x.pageType) ?? 0) + 1);
  if (!counts.size) return '';
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, n]) => n === top);
  return leaders.length > 1 ? 'Tie / review' : leaders[0][0];
}

export function comparePair(a, b) {
  const exactUrl = countIn(a, b, (x) => normalizeUrl(x.url));
  const sameDomain = countIn(a, b, (x) => domainOf(x.url));
  const samePageType = countIn(a, b, (x) => x.pageType);
  const branch = exactUrl >= 7 ? 'strong' : exactUrl >= 3 ? 'gray' : sameDomain >= 4 ? 'domain' : 'low';
  const [read, action] = READ_TEXT[branch];
  return {
    exactUrl, sameDomain, sameDomainDifferentPage: Math.max(0, sameDomain - exactUrl), samePageType,
    read, action, signal: branch === 'domain' ? 'low' : branch, primaryPage: primaryPageOf([...a, ...b]),
  };
}

export const pairKey = (a, b) => [a, b].sort().join('|');

const captured = (study) => study.keywords.filter((k) => study.serps[k.id]);

export function pairs(study) {
  const ks = captured(study);
  const out = [];
  for (let i = 0; i < ks.length; i += 1) {
    for (let j = i + 1; j < ks.length; j += 1) {
      const key = pairKey(ks[i].id, ks[j].id);
      out.push({ a: ks[i], b: ks[j], key, ...comparePair(study.serps[ks[i].id].results, study.serps[ks[j].id].results), read: study.reads[key] ?? null });
    }
  }
  return out;
}

// Union-find over captured keywords. A strong pair joins unless the owner
// said No; a Yes joins whatever the numbers say.
export function group(study) {
  const ks = captured(study);
  const parent = new Map(ks.map((k) => [k.id, k.id]));
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
  const union = (x, y) => parent.set(find(x), find(y));
  const ps = pairs(study);
  for (const p of ps) {
    const same = p.read?.sameCluster;
    if (same === 'No') continue;
    if (same === 'Yes' || p.signal === 'strong') union(p.a.id, p.b.id);
  }
  const members = new Map();
  for (const k of ks) {
    const root = find(k.id);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(k.id);
  }
  const overlapWithin = (id, ids) => ps.filter((p) => ids.includes(p.a.id) && ids.includes(p.b.id) && (p.a.id === id || p.b.id === id)).reduce((n, p) => n + p.exactUrl, 0);
  const rows = [...members.values()].map((ids) => {
    const title = ids.map((id) => ({ id, n: overlapWithin(id, ids) })).sort((x, y) => y.n - x.n || ids.indexOf(x.id) - ids.indexOf(y.id))[0].id;
    const results = ids.flatMap((id) => study.serps[id].results);
    return { id: `p-${ids.slice().sort().join('-')}`, title: study.keywords.find((k) => k.id === title).text, type: primaryPageOf(results), keywords: ids, note: '', auto: true };
  });
  return rows.sort((x, y) => y.keywords.length - x.keywords.length || study.keywords.findIndex((k) => k.id === x.keywords[0]) - study.keywords.findIndex((k) => k.id === y.keywords[0]));
}

export function pageList(study) {
  const kept = (study.pages ?? []).filter((p) => p.auto === false);
  const claimed = new Set(kept.flatMap((p) => p.keywords));
  const rest = { ...study, keywords: study.keywords.filter((k) => !claimed.has(k.id)) };
  return [...kept, ...group(rest)];
}

export function emptyStudy(slug, now = new Date()) {
  const at = now.toISOString();
  return { slug, createdAt: at, updatedAt: at, areas: [], keywords: [], serps: {}, reads: {}, pages: [], reportedAt: null };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: all pass. If `group`'s title pick differs on the tie, note the test expects the first keyword when overlaps tie.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/research.mjs netlify/functions/lib/office/research.test.mjs
git commit -m "Add the search research rules from the workbook"
```

---

### Task 3: Capture, drafting and the bookmarklet

**Files:**
- Modify: `netlify/functions/lib/office/research.mjs`
- Test: `netlify/functions/lib/office/research.test.mjs`

**Interfaces:**
- Produces: `pickResults({ q, candidates, related }) -> { q, results: [{rank,url,title}], related }`, `PICK_SOURCE` (its source text), `bookmarklet(origin) -> string`, `normalizeQuery(q)`, `validateCapture(payload) -> { value, errors }`, `findCaptureTargets(studies, q) -> [{ slug, keywordId, text }]`, `applyCapture(study, keywordId, capture, now) -> study`, `draftFromQuestionnaire(envelope) -> { keywords, areas }`, `newKeywordId()`, `splitList(text)`.

- [ ] **Step 1: Failing tests**

Append to `research.test.mjs` (extend the import line with `pickResults, PICK_SOURCE, bookmarklet, normalizeQuery, validateCapture, findCaptureTargets, applyCapture, draftFromQuestionnaire, splitList`):

```js
test('pickResults keeps eight organic results in order and drops the noise', () => {
  const c = (href, title, extra = {}) => ({ href, title, ad: false, box: href, ...extra });
  const candidates = [
    c('https://ad.com/x', 'Sponsored', { ad: true }),
    c('https://www.google.com/search?q=x', 'Google thing'),
    c('https://one.com/', 'One'),
    c('https://one.com/sitelink', 'One sitelink', { box: 'https://one.com/' }),
    c('https://two.com/', 'Two'),
    c('https://two.com/', 'Two duplicate'),
    ...[3, 4, 5, 6, 7, 8, 9].map((n) => c(`https://s${n}.com/`, `S${n}`)),
  ];
  const out = pickResults({ q: ' Wedding  florist ', candidates, related: ['a', 'a', 'b', 'wedding florist', ''] });
  assert.equal(out.q, 'Wedding  florist');
  assert.deepEqual(out.results.map((x) => x.url), ['https://one.com/', 'https://two.com/', 'https://s3.com/', 'https://s4.com/', 'https://s5.com/', 'https://s6.com/', 'https://s7.com/', 'https://s8.com/']);
  assert.deepEqual(out.results.map((x) => x.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(out.related, ['a', 'b']);
});

test('bookmarklet embeds the origin and the same picker', () => {
  const b = bookmarklet('https://www.keepsitemedia.com');
  assert.ok(b.startsWith('javascript:'));
  const code = decodeURIComponent(b.slice('javascript:'.length));
  assert.ok(code.includes('https://www.keepsitemedia.com/office/research/capture/#'));
  assert.ok(code.includes(PICK_SOURCE));
  assert.ok(!code.includes('\n'));
});

test('normalizeQuery folds case and whitespace', () => {
  assert.equal(normalizeQuery('  Wedding   Florist PROVO '), 'wedding florist provo');
});

test('validateCapture accepts the bookmarklet shape and rejects the rest', () => {
  const good = { q: 'x', results: [{ rank: 1, url: 'https://a.com/', title: 'A' }], related: ['b'], at: '2026-09-13T00:00:00Z' };
  assert.deepEqual(validateCapture(JSON.stringify(good)).errors, []);
  assert.match(validateCapture('nope').errors[0], /not valid/);
  assert.match(validateCapture(JSON.stringify({ ...good, q: '' })).errors[0], /query/);
  assert.match(validateCapture(JSON.stringify({ ...good, results: [{ url: 'ftp://x', title: 'x' }] })).errors[0], /http/);
  assert.match(validateCapture(JSON.stringify({ ...good, results: Array(9).fill(good.results[0]) })).errors[0], /at most 8/);
  assert.match(validateCapture(JSON.stringify({ ...good, related: Array(11).fill('r') })).errors[0], /at most 10/);
});

test('findCaptureTargets matches the query across studies', () => {
  const s1 = { slug: 'acme', keywords: [{ id: 'k1', text: 'Wedding florist' }] };
  const s2 = { slug: 'beta', keywords: [{ id: 'k9', text: 'wedding  florist ' }, { id: 'k8', text: 'other' }] };
  assert.deepEqual(findCaptureTargets([s1, s2], 'wedding florist'), [{ slug: 'acme', keywordId: 'k1', text: 'Wedding florist' }, { slug: 'beta', keywordId: 'k9', text: 'wedding  florist ' }]);
  assert.deepEqual(findCaptureTargets([s1, s2], 'nothing'), []);
});

test('applyCapture stores a classified snapshot and refreshes the auto pages', () => {
  const s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.areas = ['Provo'];
  s.keywords = [{ id: 'k1', text: 'x', cluster: 'C', arm: '', source: 'manual' }];
  const out = applyCapture(s, 'k1', { q: 'x', results: [{ rank: 1, url: 'https://a.com/provo/', title: 'A' }], related: ['y'] }, new Date('2026-09-14T00:00:00Z'));
  assert.equal(out.serps.k1.capturedAt, '2026-09-14T00:00:00.000Z');
  assert.equal(out.serps.k1.results[0].pageType, 'Location page');
  assert.equal(out.serps.k1.results[0].domain, 'a.com');
  assert.equal(out.serps.k1.results[0].typeSource, 'auto');
  assert.deepEqual(out.serps.k1.related, ['y']);
  assert.equal(out.pages.length, 1);
  assert.equal(out.updatedAt, '2026-09-14T00:00:00.000Z');
});

test('splitList and draftFromQuestionnaire', () => {
  assert.deepEqual(splitList('a, b;c\n d \n\n'), ['a', 'b', 'c', 'd']);
  const envelope = { answers: {
    services: 'Wedding flowers, Funeral flowers',
    searchTerms: 'wedding florist provo\nfuneral flowers near me',
    findabilityWishes: 'sympathy arrangements',
    ownPageCandidates: 'corporate events',
    serviceArea: 'Provo, Orem',
    targetAreas: 'Utah County',
  } };
  const d = draftFromQuestionnaire(envelope);
  assert.deepEqual(d.areas, ['Provo', 'Orem', 'Utah County']);
  assert.deepEqual(d.keywords.map((k) => [k.text, k.cluster, k.source]), [
    ['wedding florist provo', 'Wedding flowers', 'questionnaire'],
    ['funeral flowers near me', 'Funeral flowers', 'questionnaire'],
    ['sympathy arrangements', 'General', 'questionnaire'],
    ['corporate events', 'General', 'questionnaire'],
  ]);
  assert.ok(d.keywords.every((k) => /^k[a-z0-9]{8}$/.test(k.id)));
  assert.deepEqual(draftFromQuestionnaire(null), { keywords: [], areas: [] });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: the new tests fail on missing exports.

- [ ] **Step 3: Implement**

Append to `research.mjs`:

```js
// ---- Capture --------------------------------------------------------------

// Shared with the bookmarklet by source text: bookmarklet() embeds
// PICK_SOURCE, so the picker the browser runs is the picker these tests run.
// It must stay self-contained: no imports, no references outside itself.
export function pickResults(input) {
  var q = String(input.q || '').trim();
  var results = [];
  var seen = {};
  var boxes = {};
  var candidates = input.candidates || [];
  for (var i = 0; i < candidates.length && results.length < 8; i += 1) {
    var c = candidates[i];
    if (!c || c.ad || !c.href || !c.title) continue;
    var host;
    try { host = new URL(c.href).hostname.toLowerCase(); } catch (e) { continue; }
    if (!/^https?:/i.test(c.href) || host === 'google.com' || host.slice(-11) === '.google.com') continue;
    if (c.box && boxes[c.box]) continue;
    if (seen[c.href]) continue;
    seen[c.href] = true;
    if (c.box) boxes[c.box] = true;
    results.push({ rank: results.length + 1, url: c.href, title: String(c.title).trim().slice(0, 200) });
  }
  var related = [];
  var rel = input.related || [];
  for (var j = 0; j < rel.length && related.length < 10; j += 1) {
    var t = String(rel[j] || '').trim();
    if (t && related.indexOf(t) < 0 && t.toLowerCase().replace(/\s+/g, ' ') !== q.toLowerCase().replace(/\s+/g, ' ')) related.push(t);
  }
  return { q: q, results: results, related: related };
}

// One line, so the bookmarklet can embed it verbatim. pickResults must
// therefore never contain a line comment.
export const PICK_SOURCE = pickResults.toString().replace(/\s*\n\s*/g, ' ');

// The DOM walk gathers candidates; pickResults decides. A result container is
// the closest [data-hveid], which is what a sitelink shares with its parent.
export function bookmarklet(origin) {
  const code = `(function(){
var PICK=${PICK_SOURCE};
var q=new URLSearchParams(location.search).get('q')||'';
var cands=[];var n=0;
document.querySelectorAll('h3').forEach(function(h){
var a=h.closest('a[href]');if(!a)return;
var box=h.closest('[data-hveid]')||(a.parentElement&&a.parentElement.parentElement)||a;
if(!box.dataset.kbox){n+=1;box.dataset.kbox=String(n);}
cands.push({href:a.href,title:h.textContent,ad:!!h.closest('#tads,#bottomads,[data-text-ad],[aria-label="Ads"],.related-question-pair,[data-attrid],#rhs'),box:box.dataset.kbox});
});
var related=[];document.querySelectorAll('#botstuff a[href*="/search?"]').forEach(function(a){related.push(a.textContent);});
var picked=PICK({q:q,candidates:cands,related:related});
if(!picked.results.length){alert('No results found on this page');return;}
picked.at=new Date().toISOString();
window.open(${JSON.stringify(`${origin}/office/research/capture/#`)}+encodeURIComponent(JSON.stringify(picked)));
})();`;
  return `javascript:${encodeURIComponent(code.replace(/\n/g, ' '))}`;
}

export const normalizeQuery = (q) => String(q ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function validateCapture(text) {
  const errors = [];
  let v;
  try { v = JSON.parse(String(text ?? '')); } catch { return { value: null, errors: ['the capture is not valid JSON'] }; }
  if (!v || typeof v !== 'object') return { value: null, errors: ['the capture is not an object'] };
  const q = String(v.q ?? '').trim();
  if (!q) errors.push('the query is empty');
  const results = Array.isArray(v.results) ? v.results : [];
  if (results.length > 8) errors.push('at most 8 results');
  results.forEach((r, i) => {
    if (!r || typeof r !== 'object' || !/^https?:\/\//i.test(String(r.url ?? ''))) errors.push(`result ${i + 1} needs an http URL`);
    if (!String(r?.title ?? '').trim()) errors.push(`result ${i + 1} needs a title`);
  });
  const related = Array.isArray(v.related) ? v.related.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  if (related.length > 10) errors.push('at most 10 related searches');
  return {
    value: errors.length ? null : { q, results: results.map((r, i) => ({ rank: i + 1, url: String(r.url), title: String(r.title).trim().slice(0, 200) })), related },
    errors,
  };
}

export function findCaptureTargets(studies, q) {
  const want = normalizeQuery(q);
  const out = [];
  for (const s of studies) for (const k of s.keywords ?? []) if (normalizeQuery(k.text) === want) out.push({ slug: s.slug, keywordId: k.id, text: k.text });
  return out;
}

export function applyCapture(study, keywordId, capture, now = new Date()) {
  const results = capture.results.map((r, i) => ({
    rank: i + 1, url: r.url, title: r.title, domain: domainOf(r.url),
    pageType: classify(r, study.areas), typeSource: 'auto',
  }));
  const serps = { ...study.serps, [keywordId]: { capturedAt: now.toISOString(), query: capture.q, results, related: capture.related ?? [] } };
  return touch({ ...study, serps }, now);
}

// Any change to a snapshot or a read reshapes the auto page rows.
export function touch(study, now = new Date()) {
  const next = { ...study, updatedAt: now.toISOString() };
  next.pages = pageList(next);
  return next;
}

// ---- Keywords ---------------------------------------------------------------

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newKeywordId(random = Math.random) {
  let id = 'k';
  for (let i = 0; i < 8; i += 1) id += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return id;
}

export const splitList = (text) => String(text ?? '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

const words = (s) => new Set(normalizeQuery(s).split(' ').filter((w) => w.length > 2));

export function draftFromQuestionnaire(envelope) {
  const a = envelope?.answers;
  if (!a) return { keywords: [], areas: [] };
  const clusters = splitList(a.services);
  const areas = [...new Set([...splitList(a.serviceArea), ...splitList(a.targetAreas)])];
  const texts = [...new Set([...splitList(a.searchTerms), ...splitList(a.findabilityWishes), ...splitList(a.ownPageCandidates)])];
  // The cluster sharing the most words wins; a tie goes to the first
  // listed, and no shared word at all lands in General.
  const keywords = texts.map((text) => {
    const kw = words(text);
    const scored = clusters.map((c) => ({ c, n: [...words(c)].filter((w) => kw.has(w)).length }));
    const best = scored.reduce((a, b) => (b.n > a.n ? b : a), { c: 'General', n: 0 });
    return { id: newKeywordId(), text, cluster: best.c, arm: '', source: 'questionnaire' };
  });
  return { keywords, areas };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `node --test netlify/functions/lib/office/research.test.mjs`
Expected: all pass. If `PICK_SOURCE` differs from what the bookmarklet embeds because of whitespace, both sides use the same string, so the equality holds; the newline check passes because `bookmarklet` strips them after embedding.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/research.mjs netlify/functions/lib/office/research.test.mjs
git commit -m "Add capture, drafting and the bookmarklet"
```

---

### Task 4: The PDF report

**Files:**
- Modify: `netlify/functions/lib/office/pdf.mjs` (export the writer)
- Create: `netlify/functions/lib/office/research-report.mjs`
- Test: `netlify/functions/lib/office/research-report.test.mjs`

**Interfaces:**
- Consumes: `Writer`, `SIZES`, `PDFDocument`, `StandardFonts` from `pdf.mjs`; `pairs`, `pageList` from `research.mjs`.
- Produces: `renderResearchReport({ client, study, renderedAt }) -> Promise<Uint8Array>`, `reportName(renderedAt) -> 'search-research-YYYY-MM-DD.pdf'`.

- [ ] **Step 1: Export the writer**

In `pdf.mjs` change `class Writer {` to `export class Writer {` and add `export { SIZES };` after the `LEADING` constant line.

- [ ] **Step 2: Failing test**

Create `netlify/functions/lib/office/research-report.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResearchReport, reportName } from './research-report.mjs';
import { emptyStudy, applyCapture, domainOf } from './research.mjs';

const r = (url) => ({ url, title: `Title ${domainOf(url)}` });

test('reportName is dated in Denver', () => {
  assert.equal(reportName(new Date('2026-09-14T02:00:00Z')), 'search-research-2026-09-13.pdf');
});

test('renderResearchReport writes a PDF that names the pages and the searches', async () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.keywords = [
    { id: 'k1', text: 'wedding florist provo', cluster: 'Weddings', arm: '', source: 'manual' },
    { id: 'k2', text: 'provo wedding flowers', cluster: 'Weddings', arm: '', source: 'manual' },
    { id: 'k3', text: 'funeral flowers provo', cluster: 'Sympathy', arm: '', source: 'manual' },
  ];
  const A = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://a${n}.com/p`));
  s = applyCapture(s, 'k1', { q: 'wedding florist provo', results: A, related: [] });
  s = applyCapture(s, 'k2', { q: 'provo wedding flowers', results: [...A.slice(0, 7), r('https://other.com/p')], related: [] });
  s = applyCapture(s, 'k3', { q: 'funeral flowers provo', results: [1, 2, 3, 4].map((n) => r(`https://f${n}.com/p`)), related: [] });
  s.reads['k1|k2'] = { human: 'Same intent', sameCluster: 'Yes', notes: 'Client agreed on the call.' };
  const bytes = await renderResearchReport({ client: { business: 'Acme Florist', tier: 'Growth' }, study: s, renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.byteLength > 2000);
  // pdf-lib streams are compressed; the outline of what was written is
  // checked through the writer's own text calls in the next test instead.
});

test('the report text covers every section', async () => {
  const { reportLines } = await import('./research-report.mjs');
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.keywords = [{ id: 'k1', text: 'wedding florist provo', cluster: 'Weddings', arm: '', source: 'manual' }];
  s = applyCapture(s, 'k1', { q: 'wedding florist provo', results: [r('https://a1.com/p')], related: [] });
  const lines = reportLines({ client: { business: 'Acme Florist', tier: 'Growth' }, study: s, renderedAt: new Date('2026-09-13T12:00:00Z') });
  const text = lines.map((l) => l.text ?? l.rows?.flat().join(' ')).join('\n');
  for (const needle of ['Search research', 'Acme Florist', 'What we did', 'The pages we recommend', 'wedding florist provo', 'Decisions from our call', 'What we saw', 'Appendix', 'a1.com']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
});
```

- [ ] **Step 3: Run, expect failure**

Run: `node --test netlify/functions/lib/office/research-report.test.mjs`
Expected: module not found.

- [ ] **Step 4: Implement**

Create `netlify/functions/lib/office/research-report.mjs`:

```js
// The client-facing report. reportLines() decides what is said, as a list
// of headings, paragraphs and tables, and renderResearchReport() draws it;
// the split lets a test read the words without decoding a PDF stream.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Writer, SIZES } from './pdf.mjs';
import { pairs, pageList } from './research.mjs';
import { todayIn, formatYmd } from './dates.mjs';

export const reportName = (now) => `search-research-${todayIn(undefined, now)}.pdf`;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function topDomains(results, limit = 5) {
  const counts = new Map();
  for (const x of results) counts.set(x.domain, (counts.get(x.domain) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

export function reportLines({ client, study, renderedAt }) {
  const L = [];
  const h1 = (text) => L.push({ kind: 'h1', text });
  const h2 = (text) => L.push({ kind: 'h2', text });
  const p = (text) => L.push({ kind: 'p', text });
  const small = (text) => L.push({ kind: 'small', text });
  const table = (rows) => L.push({ kind: 'table', rows });
  const byId = new Map(study.keywords.map((k) => [k.id, k]));
  const text = (id) => byId.get(id)?.text ?? id;
  const ps = pairs(study);
  const pageRows = pageList(study);
  const captured = study.keywords.filter((k) => study.serps[k.id]);
  const day = formatYmd(todayIn(undefined, renderedAt));

  h1('Search research');
  p(`${client.business} · ${client.tier ?? ''} · ${day}`.replace(' ·  ·', ' ·'));
  p('Before we lay out a site we find out what people type into Google when they need what you do, and which of those searches Google answers with the same pages. Searches that share results belong on one page. Searches that do not need pages of their own. This report shows what we found and the page list that comes out of it.');

  h2('What we did');
  p(`We searched ${plural(captured.length, 'term')} drawn from your questionnaire, each under the same conditions, and kept the top eight organic results for every one, ignoring ads and map listings. Then we compared every pair of searches: ${plural(ps.length, 'comparison')} in all. Seven or more shared results out of eight means Google treats the two searches as the same question. Three to six is a gray zone we decide together. Two or fewer means different questions, so different pages.`);

  h2('The pages we recommend');
  if (!pageRows.length) p('No searches have been captured yet.');
  for (const row of pageRows) {
    const ids = row.keywords;
    const inside = ps.filter((x) => ids.includes(x.a.id) && ids.includes(x.b.id));
    const strong = inside.filter((x) => x.signal === 'strong').length;
    const results = ids.flatMap((id) => study.serps[id]?.results ?? []);
    const doms = topDomains(results, 3).map(([d]) => d);
    p(`${row.title}${row.type ? ` — ${row.type}` : ''}`);
    small(`Targets: ${ids.map(text).join('; ')}`);
    const why = ids.length === 1
      ? 'This search shares few results with any other, so it earns a page of its own.'
      : `${plural(strong, 'pair', 'pairs')} of these searches share seven or more of their top eight results, so one page can answer all of them.`;
    small(`${why}${doms.length ? ` The businesses that rank most across them: ${doms.join(', ')}.` : ''}${row.note ? ` ${row.note}` : ''}`);
  }

  const decided = ps.filter((x) => x.signal === 'gray' && x.read && x.read.sameCluster !== 'Undecided');
  h2('Decisions from our call');
  if (!decided.length) p('Every pair fell clearly on one side, so nothing needed a judgment call.');
  else table([['Searches', 'Shared results', 'Read', 'Note'], ...decided.map((x) => [`${x.a.text} / ${x.b.text}`, `${x.exactUrl} of 8`, `${x.read.human}${x.read.sameCluster === 'Yes' ? ', same page' : ', separate pages'}`, x.read.notes ?? ''])]);

  h2('What we saw');
  for (const row of pageRows) {
    const results = row.keywords.flatMap((id) => study.serps[id]?.results ?? []);
    const doms = topDomains(results);
    if (!doms.length) continue;
    p(row.title);
    table([['Business', 'Appearances'], ...doms.map(([d, n]) => [d, String(n)])]);
  }

  h2('Appendix: every search');
  for (const k of captured) {
    const serp = study.serps[k.id];
    p(`${k.text} · captured ${formatYmd(todayIn(undefined, new Date(serp.capturedAt)))}`);
    table([['#', 'Title', 'Business', 'Page type'], ...serp.results.map((x) => [String(x.rank), x.title, x.domain, x.pageType])]);
  }
  return L;
}

export async function renderResearchReport({ client, study, renderedAt = new Date() }) {
  const doc = await PDFDocument.create();
  doc.setCreationDate(renderedAt);
  doc.setModificationDate(renderedAt);
  const fonts = { body: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, fonts);
  w.newPage();
  for (const line of reportLines({ client, study, renderedAt })) {
    if (line.kind === 'h1') w.text(line.text, { font: fonts.bold, size: SIZES.title });
    else if (line.kind === 'h2') w.text(line.text, { font: fonts.bold, size: SIZES.h1 });
    else if (line.kind === 'p') w.text(line.text);
    else if (line.kind === 'small') w.text(line.text, { size: SIZES.small });
    else if (line.kind === 'table') w.table(line.rows);
  }
  return doc.save();
}
```

- [ ] **Step 5: Run, expect pass**

Run: `node --test netlify/functions/lib/office/research-report.test.mjs netlify/functions/lib/office/pdf.test.mjs netlify/functions/lib/office/agreements.test.mjs`
Expected: all pass; the agreement renderer is unchanged by the export.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/office/pdf.mjs netlify/functions/lib/office/research-report.mjs netlify/functions/lib/office/research-report.test.mjs
git commit -m "Render the search research report"
```

---

### Task 5: The research action

**Files:**
- Create: `netlify/functions/lib/office/actions/research.mjs`
- Modify: `netlify/functions/lib/office/actions.mjs`
- Test: `netlify/functions/lib/office/actions/research.test.mjs`

**Interfaces:**
- Consumes: everything from `research.mjs` and `research-report.mjs`; `s.research`, `s.clients`, `s.questionnaires`, `s.documents`.
- Produces: `research(request, ctx, s, now)` handling `op` in `draft`, `add`, `edit`, `remove`, `areas`, `capture`, `read`, `page`, `reset`, `type`, `report`.

Form fields per op (all carry `csrf` and `slug`; `capture` carries no `slug` until the picker step):

| op | fields |
|---|---|
| `draft` | none |
| `add` | `text`, `cluster`, `arm` |
| `edit` | `id`, `text`, `cluster`, `arm` |
| `remove` | `id` |
| `areas` | `areas` (one per line or comma) |
| `capture` | `payload` (JSON from the hash); optional `slug` and `keyword` when the owner picked |
| `read` | `key`, `human`, `sameCluster`, `notes` |
| `page` | `id`, `title`, `type`, `note`, `keywords` (comma-separated ids) |
| `reset` | `id` |
| `type` | `keyword`, `rank`, `pageType` |
| `report` | none |

- [ ] **Step 1: Failing tests**

Create `netlify/functions/lib/office/actions/research.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { research } from './research.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';
import { emptyStudy } from '../research.mjs';

// createStore reads questionnaires and never writes them, so the test keeps
// the backend and writes the envelope the questionnaire function would.
const make = async () => {
  const q = memoryBackend();
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  s.putEnvelope = (slug, form, envelope) => q.setText(`${slug}/${form}.json`, JSON.stringify(envelope));
  await s.clients.put('acme', { slug: 'acme', business: 'Acme', name: 'Ann', email: 'ann@example.com', tier: 'Growth' });
  await s.clients.put('beta', { slug: 'beta', business: 'Beta', name: 'Bo', email: 'bo@example.com', tier: 'Range' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/research', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });
const now = new Date('2026-09-13T12:00:00Z');
const location = (res) => res.headers.get('Location');
const capture = (q, n = 8) => JSON.stringify({ q, results: Array.from({ length: n }, (_, i) => ({ rank: i + 1, url: `https://s${i}.com/p`, title: `S${i}` })), related: ['more'], at: now.toISOString() });

test('draft seeds keywords and areas from the build questionnaire', async () => {
  const s = await make();
  await s.putEnvelope('acme', 'build', { answers: { services: 'Weddings', searchTerms: 'wedding florist provo', serviceArea: 'Provo' } });
  const res = await research(post({ csrf, slug: 'acme', op: 'draft' }), ctx(), s, now);
  assert.equal(location(res), '/office/clients/acme/?tab=research');
  const study = await s.research.get('acme');
  assert.equal(study.keywords[0].text, 'wedding florist provo');
  assert.equal(study.keywords[0].cluster, 'Weddings');
  assert.deepEqual(study.areas, ['Provo']);
});

test('add, edit and remove keywords', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: ' Wedding florist ', cluster: 'Weddings', arm: '' }), ctx(), s, now);
  let study = await s.research.get('acme');
  assert.equal(study.keywords.length, 1);
  assert.equal(study.keywords[0].text, 'Wedding florist');
  const id = study.keywords[0].id;
  await research(post({ csrf, slug: 'acme', op: 'edit', id, text: 'wedding florist provo', cluster: 'W', arm: 'Flowers' }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.deepEqual([study.keywords[0].text, study.keywords[0].cluster, study.keywords[0].arm], ['wedding florist provo', 'W', 'Flowers']);
  const dup = await research(post({ csrf, slug: 'acme', op: 'add', text: 'Wedding Florist Provo', cluster: 'W', arm: '' }), ctx(), s, now);
  assert.match(location(dup), /error=.*already/);
  await research(post({ csrf, slug: 'acme', op: 'remove', id }), ctx(), s, now);
  assert.equal((await s.research.get('acme')).keywords.length, 0);
});

test('capture with one match saves and redirects to that client', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'wedding florist provo', cluster: 'W', arm: '' }), ctx(), s, now);
  const res = await research(post({ csrf, op: 'capture', payload: capture('Wedding florist provo') }), ctx(), s, now);
  const study = await s.research.get('acme');
  const id = study.keywords[0].id;
  assert.equal(location(res), `/office/clients/acme/?tab=research&captured=${id}`);
  assert.equal(study.serps[id].results.length, 8);
  assert.equal(study.serps[id].results[0].pageType, 'Service page');
  assert.equal(study.pages.length, 1);
});

test('capture with no match or two matches goes to the picker, and a pick saves', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'shared term', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, slug: 'beta', op: 'add', text: 'shared term', cluster: 'W', arm: '' }), ctx(), s, now);
  const two = await research(post({ csrf, op: 'capture', payload: capture('shared term') }), ctx(), s, now);
  assert.equal(two.status, 303);
  assert.match(location(two), /^\/office\/research\/capture\/\?pick=1/);
  const none = await research(post({ csrf, op: 'capture', payload: capture('unknown') }), ctx(), s, now);
  assert.match(location(none), /^\/office\/research\/capture\/\?pick=1/);
  const id = (await s.research.get('beta')).keywords[0].id;
  const picked = await research(post({ csrf, op: 'capture', payload: capture('shared term'), slug: 'beta', keyword: id }), ctx(), s, now);
  assert.equal(location(picked), `/office/clients/beta/?tab=research&captured=${id}`);
  assert.ok((await s.research.get('beta')).serps[id]);
});

test('capture rejects a bad payload', async () => {
  const s = await make();
  const res = await research(post({ csrf, op: 'capture', payload: 'nope' }), ctx(), s, now);
  assert.match(location(res), /^\/office\/research\/capture\/\?error=/);
});

test('read, page, reset and type edits reshape the study', async () => {
  const s = await make();
  for (const t of ['a', 'b']) await research(post({ csrf, slug: 'acme', op: 'add', text: t, cluster: 'W', arm: '' }), ctx(), s, now);
  let study = await s.research.get('acme');
  const [ka, kb] = study.keywords.map((k) => k.id);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('b', 4) }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.equal(study.pages.length, 2);
  const key = [ka, kb].sort().join('|');
  await research(post({ csrf, slug: 'acme', op: 'read', key, human: 'Probably same', sameCluster: 'Yes', notes: 'call' }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.deepEqual(study.reads[key], { human: 'Probably same', sameCluster: 'Yes', notes: 'call' });
  assert.equal(study.pages.length, 1);
  const bad = await research(post({ csrf, slug: 'acme', op: 'read', key, human: 'Nope', sameCluster: 'Yes', notes: '' }), ctx(), s, now);
  assert.match(location(bad), /error=/);

  const pid = study.pages[0].id;
  await research(post({ csrf, slug: 'acme', op: 'page', id: pid, title: 'Flowers', type: 'Service page', note: 'n', keywords: `${ka},${kb}` }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.equal(study.pages[0].auto, false);
  assert.equal(study.pages[0].title, 'Flowers');
  await research(post({ csrf, slug: 'acme', op: 'reset', id: pid }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.ok(study.pages.every((p) => p.auto));

  await research(post({ csrf, slug: 'acme', op: 'type', keyword: ka, rank: '1', pageType: 'Other' }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.equal(study.serps[ka].results[0].pageType, 'Other');
  assert.equal(study.serps[ka].results[0].typeSource, 'manual');
});

test('report writes a document and stamps reportedAt', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'a', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  const res = await research(post({ csrf, slug: 'acme', op: 'report' }), ctx(), s, now);
  assert.equal(location(res), '/office/clients/acme/?tab=documents');
  const meta = await s.documents.meta('acme', 'search-research-2026-09-13.pdf');
  assert.equal(meta.source, 'research');
  assert.equal(meta.type, 'application/pdf');
  assert.equal((await s.research.get('acme')).reportedAt, now.toISOString());
});

test('refuses without csrf, on GET, and on an unknown client', async () => {
  const s = await make();
  assert.equal((await research(new Request('https://site.test/office/api/research'), ctx(), s, now)).status, 405);
  assert.equal((await research(post({ slug: 'acme', op: 'draft' }), ctx(), s, now)).status, 403);
  assert.equal((await research(post({ csrf, slug: 'zzz', op: 'draft' }), ctx(), s, now)).status, 404);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test netlify/functions/lib/office/actions/research.test.mjs`
Expected: module not found.

- [ ] **Step 3: Implement**

Create `netlify/functions/lib/office/actions/research.mjs`:

```js
import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import {
  PAGE_TYPES, READS, SAME, emptyStudy, touch, newKeywordId, normalizeQuery, splitList, draftFromQuestionnaire,
  validateCapture, findCaptureTargets, applyCapture,
} from '../research.mjs';
import { renderResearchReport, reportName } from '../research-report.mjs';

const KEYWORD_ID = /^k[a-z0-9]{8}$/;
const tab = (slug, extra = '') => `/office/clients/${slug}/?tab=research${extra}`;
const back = (slug, message) => redirect(tab(slug, `&error=${encodeURIComponent(message)}`));
const CAPTURE = '/office/research/capture/';

export async function research(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);
  const op = field(data, 'op');

  // Capture arrives from the bookmarklet's tab, which knows no client yet.
  if (op === 'capture') return capture(data, s, now);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const study = (await s.research.get(slug)) ?? emptyStudy(slug, now);
  const save = async (next, extra = '') => { await s.research.put(slug, touch(next, now)); return redirect(tab(slug, extra)); };
  const text = (name) => field(data, name).trim();

  if (op === 'draft') {
    const drafted = draftFromQuestionnaire(await s.questionnaires.get(slug, 'build'));
    if (!drafted.keywords.length && !drafted.areas.length) return back(slug, 'no build questionnaire on file yet, so nothing to draft from');
    const have = new Set(study.keywords.map((k) => normalizeQuery(k.text)));
    const keywords = drafted.keywords.filter((k) => !have.has(normalizeQuery(k.text)));
    return save({ ...study, keywords: [...study.keywords, ...keywords], areas: study.areas.length ? study.areas : drafted.areas });
  }
  if (op === 'add' || op === 'edit') {
    const kw = text('text');
    if (!kw) return back(slug, 'the keyword is empty');
    const id = op === 'add' ? newKeywordId() : field(data, 'id');
    if (study.keywords.some((k) => k.id !== id && normalizeQuery(k.text) === normalizeQuery(kw))) return back(slug, `"${kw}" is already in the list`);
    const row = { id, text: kw, cluster: text('cluster') || 'General', arm: text('arm'), source: op === 'add' ? 'manual' : undefined };
    if (op === 'add') return save({ ...study, keywords: [...study.keywords, row] });
    const i = study.keywords.findIndex((k) => k.id === id);
    if (i < 0) return back(slug, 'no such keyword');
    const keywords = study.keywords.map((k, j) => (j === i ? { ...k, text: row.text, cluster: row.cluster, arm: row.arm } : k));
    return save({ ...study, keywords });
  }
  if (op === 'remove') {
    const id = field(data, 'id');
    const serps = { ...study.serps }; delete serps[id];
    const reads = Object.fromEntries(Object.entries(study.reads).filter(([k]) => !k.split('|').includes(id)));
    const pages = study.pages.map((p) => ({ ...p, keywords: p.keywords.filter((k) => k !== id) })).filter((p) => p.keywords.length);
    return save({ ...study, keywords: study.keywords.filter((k) => k.id !== id), serps, reads, pages });
  }
  if (op === 'areas') return save({ ...study, areas: splitList(data.get('areas')) });
  if (op === 'read') {
    const key = field(data, 'key');
    const [a, b] = key.split('|');
    if (!a || !b || !study.keywords.some((k) => k.id === a) || !study.keywords.some((k) => k.id === b)) return back(slug, 'no such pair');
    const human = field(data, 'human'); const sameCluster = field(data, 'sameCluster');
    if (!READS.includes(human) || !SAME.includes(sameCluster)) return back(slug, 'pick a read from the list');
    return save({ ...study, reads: { ...study.reads, [key]: { human, sameCluster, notes: text('notes') } } });
  }
  if (op === 'page') {
    const id = field(data, 'id');
    const type = field(data, 'type');
    if (!PAGE_TYPES.includes(type) && type !== 'Tie / review') return back(slug, 'pick a page type');
    const keywords = field(data, 'keywords').split(',').map((x) => x.trim()).filter((x) => study.keywords.some((k) => k.id === x));
    if (!keywords.length) return back(slug, 'a page needs at least one keyword');
    const title = text('title');
    if (!title) return back(slug, 'the page needs a title');
    const row = { id, title, type, keywords, note: text('note'), auto: false };
    // Claiming a keyword takes it away from any other edited row.
    const others = study.pages.filter((p) => p.id !== id && p.auto === false).map((p) => ({ ...p, keywords: p.keywords.filter((k) => !keywords.includes(k)) })).filter((p) => p.keywords.length);
    return save({ ...study, pages: [...others, row] });
  }
  if (op === 'reset') {
    const id = field(data, 'id');
    return save({ ...study, pages: study.pages.filter((p) => p.id !== id) });
  }
  if (op === 'type') {
    const keyword = field(data, 'keyword'); const rank = Number(field(data, 'rank')); const pageType = field(data, 'pageType');
    const serp = study.serps[keyword];
    if (!serp || !serp.results.some((r) => r.rank === rank)) return back(slug, 'no such result');
    if (!PAGE_TYPES.includes(pageType)) return back(slug, 'pick a page type');
    const results = serp.results.map((r) => (r.rank === rank ? { ...r, pageType, typeSource: 'manual' } : r));
    return save({ ...study, serps: { ...study.serps, [keyword]: { ...serp, results } } });
  }
  if (op === 'report') {
    const bytes = await renderResearchReport({ client, study, renderedAt: now });
    const name = reportName(now);
    await s.documents.put(slug, name, new Uint8Array(bytes), { type: 'application/pdf', source: 'research', createdBy: ctx.admin?.email ?? null }, now);
    await s.research.put(slug, { ...study, reportedAt: now.toISOString() });
    return redirect(`/office/clients/${slug}/?tab=documents`);
  }
  return problem(400, 'unknown op');
}

async function capture(data, s, now) {
  const payload = String(data.get('payload') ?? '');
  const { value, errors } = validateCapture(payload);
  if (errors.length) return redirect(`${CAPTURE}?error=${encodeURIComponent(errors.join('; '))}`);
  const slug = field(data, 'slug');
  const keyword = field(data, 'keyword');
  let target;
  if (slug || keyword) {
    if (!SLUG.test(slug) || !KEYWORD_ID.test(keyword)) return redirect(`${CAPTURE}?error=${encodeURIComponent('pick a client and a keyword')}`);
    target = { slug, keywordId: keyword };
  } else {
    const matches = findCaptureTargets(await s.research.listAll(), value.q);
    if (matches.length !== 1) return redirect(`${CAPTURE}?pick=1`);
    [target] = matches;
  }
  const study = await s.research.get(target.slug);
  if (!study || !study.keywords.some((k) => k.id === target.keywordId)) return redirect(`${CAPTURE}?error=${encodeURIComponent('that keyword is gone')}`);
  await s.research.put(target.slug, applyCapture(study, target.keywordId, value, now));
  return redirect(tab(target.slug, `&captured=${target.keywordId}`));
}
```

Note the picker round trip: the capture page keeps the payload in the browser's hash, so the redirect to `?pick=1` carries nothing; the page re-reads the hash and shows the picker (Task 6).

In `actions.mjs` add `import { research } from './actions/research.mjs';` and `research` to the exported map.

- [ ] **Step 4: Run, expect pass**

Run: `node --test netlify/functions/lib/office/actions/research.test.mjs`
Expected: all pass. The `add` op stores `source: 'manual'`; `edit` leaves `source` alone because the spread keeps the old value.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/research.mjs netlify/functions/lib/office/actions/research.test.mjs netlify/functions/lib/office/actions.mjs
git commit -m "Add the research action"
```

---

### Task 6: The Research tab, the capture page and the preview route

**Files:**
- Create: `src/components/office/Research.astro`
- Modify: `src/pages/office/clients/[slug].astro`
- Create: `src/pages/office/research/capture.astro`
- Create: `src/pages/office/research/[slug]/report.ts`
- Modify: `src/styles/office.css`

**Interfaces:**
- Consumes: `bookmarklet`, `pairs`, `pageList`, `PAGE_TYPES`, `READS`, `SAME` from `research.mjs`; `renderResearchReport` from `research-report.mjs`.

- [ ] **Step 1: The tab on the client page**

In `src/pages/office/clients/[slug].astro`:

Add imports after the `glance` import:

```ts
import Research from '../../../components/office/Research.astro';
```

After the `agreements` loading lines (before `const tabs`), add:

```ts
// Research shows for the tiers that include it, and for anyone who already
// has a study, so a tier change never hides work.
const study = await s.research.get(slug);
const researchOn = ['Growth', 'Agile', 'Range'].includes(client.tier) || Boolean(study);
```

In `tabs`, after the `documents` entry, add:

```ts
  ...(researchOn ? [{ id: 'research', label: 'Research' }] : []),
```

Where the tab bodies are rendered (after the `{tab === 'documents' && (...)}` block), add:

```astro
  {tab === 'research' && researchOn && (
    <Research client={client} study={study} csrf={csrf} origin={site} captured={Astro.url.searchParams.get('captured') ?? ''} />
  )}
```

- [ ] **Step 2: The component**

Create `src/components/office/Research.astro`:

```astro
---
// The Research tab: capture, keywords, gray zone, pages, results, report.
// Everything is a form; the study is reshaped by the research action.
import { bookmarklet, pairs, pageList, PAGE_TYPES, READS, SAME, emptyStudy } from '../../../netlify/functions/lib/office/research.mjs';
import { formatYmd, todayIn } from '../../../netlify/functions/lib/office/dates.mjs';

interface Props { client: any; study: any; csrf: string; origin: string; captured: string }
const { client, csrf, origin, captured } = Astro.props;
const study = Astro.props.study ?? emptyStudy(client.slug);
const slug: string = client.slug;
const api = '/office/api/research';
const byId = new Map<string, any>(study.keywords.map((k: any) => [k.id, k]));
const text = (id: string) => byId.get(id)?.text ?? id;
const captures = study.keywords.filter((k: any) => study.serps[k.id]);
const next = study.keywords.find((k: any) => !study.serps[k.id]);
const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const ps = pairs(study) as any[];
const gray = ps.filter((p) => p.signal === 'gray');
const strong = ps.filter((p) => p.signal === 'strong').length;
const low = ps.filter((p) => p.signal === 'low').length;
const pages = pageList(study) as any[];
const clusters = [...new Set(study.keywords.map((k: any) => k.cluster))] as string[];
const isRange = client.tier === 'Range';
const day = (iso: string) => formatYmd(todayIn(undefined, new Date(iso)));
const showPairs = Astro.url.searchParams.get('pairs') === '1';
const link = bookmarklet(origin);
---
<h2>Capture</h2>
<p class="quiet">Drag this to your bookmarks bar once: <a class="btn-quiet btn-small" href={link} onclick="return false">Capture results</a>. Then, for each keyword, open the search in an incognito window and click it on the results page.</p>
<p><strong>{captures.length} of {study.keywords.length} captured.</strong>
  {next && <> Next: <strong>{next.text}</strong> · <a href={search(next.text)} target="_blank" rel="noopener">Search</a></>}
  {!next && study.keywords.length > 0 && <> Every keyword is captured.</>}
</p>
{captured && byId.has(captured) && <p class="notice notice-ok">Captured “{text(captured)}”.</p>}

<h2>Keywords</h2>
{study.keywords.length === 0 && (
  <form method="POST" action={api} class="inline">
    <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="draft" />
    <p class="empty">No keywords yet. <button class="btn-quiet btn-small">Draft from the build questionnaire</button> or add one below.</p>
  </form>
)}
{clusters.map((c) => (
  <details class="fold" open>
    <summary>{c}<span class="sub">{study.keywords.filter((k: any) => k.cluster === c).length}</span></summary>
    <div class="fold-body">
      <ul class="ledger">
        {study.keywords.filter((k: any) => k.cluster === c).map((k: any) => (
          <li class="no-tick">
            <span class="when">{study.serps[k.id] ? day(study.serps[k.id].capturedAt) : 'not captured'}</span>
            <span class="what">
              <form method="POST" action={api} class="toolbar">
                <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="edit" /><input type="hidden" name="id" value={k.id} />
                <input class="grow" name="text" value={k.text} aria-label="Keyword" required />
                <input name="cluster" value={k.cluster} aria-label="Cluster" />
                {isRange && <input name="arm" value={k.arm} placeholder="Arm" aria-label="Arm" />}
                <button class="btn-quiet btn-small">Save</button>
              </form>
              {study.serps[k.id]?.related?.filter((r: string) => !study.keywords.some((x: any) => x.text.toLowerCase() === r.toLowerCase())).length > 0 && (
                <span class="meta">Related:
                  {study.serps[k.id].related.filter((r: string) => !study.keywords.some((x: any) => x.text.toLowerCase() === r.toLowerCase())).map((r: string) => (
                    <form method="POST" action={api} class="inline">
                      <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="add" />
                      <input type="hidden" name="text" value={r} /><input type="hidden" name="cluster" value={k.cluster} /><input type="hidden" name="arm" value={k.arm} />
                      <button class="link-quiet">+ {r}</button>
                    </form>
                  ))}
                </span>
              )}
            </span>
            <span class="act">
              <a href={search(k.text)} target="_blank" rel="noopener">{study.serps[k.id] ? 'Recapture' : 'Search'}</a>
              <form method="POST" action={api} class="inline">
                <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="remove" /><input type="hidden" name="id" value={k.id} />
                <button class="link-quiet danger" onclick="return confirm('Remove this keyword and its results?')">Remove</button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </div>
  </details>
))}
<form method="POST" action={api} class="toolbar">
  <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="add" />
  <input class="grow" name="text" placeholder="New keyword" aria-label="New keyword" required />
  <input name="cluster" placeholder="Cluster" aria-label="Cluster" list="clusters" />
  <datalist id="clusters">{clusters.map((c) => <option value={c} />)}</datalist>
  {isRange && <input name="arm" placeholder="Arm" aria-label="Arm" />}
  <button class="btn">Add</button>
</form>
<form method="POST" action={api} class="toolbar">
  <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="areas" />
  <label class="field grow"><span>Service areas, for spotting location pages</span><input name="areas" value={study.areas.join(', ')} /></label>
  <button class="btn-quiet">Save areas</button>
</form>

<h2>Gray zone <span class="count">{gray.length}</span></h2>
<p class="quiet">{strong} pairs agree, {gray.length} to discuss, {low} clearly different. <a href={`/office/clients/${slug}/?tab=research&pairs=1`}>{showPairs ? 'Showing every pair.' : 'Show every pair.'}</a></p>
{(showPairs ? ps : gray).length > 0 && (
  <div class="table-scroll"><table>
    <thead><tr><th>Pair</th><th>Same URL</th><th>Same business</th><th>Same type</th><th>Auto read</th><th>Your read</th></tr></thead>
    <tbody>
      {(showPairs ? ps : gray).map((p) => (
        <tr>
          <td>{p.a.text}<br />{p.b.text}</td>
          <td class="num">{p.exactUrl}</td><td class="num">{p.sameDomainDifferentPage}</td><td class="num">{p.samePageType}</td>
          <td class="quiet">{p.action}</td>
          <td>
            <form method="POST" action={api} class="toolbar">
              <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="read" /><input type="hidden" name="key" value={p.key} />
              <select name="human" aria-label="Human read">{READS.map((r) => <option selected={p.read?.human === r}>{r}</option>)}</select>
              <select name="sameCluster" aria-label="Same cluster">{SAME.map((r) => <option selected={(p.read?.sameCluster ?? 'Undecided') === r}>{r}</option>)}</select>
              <input name="notes" value={p.read?.notes ?? ''} placeholder="Note" aria-label="Note" />
              <button class="btn-quiet btn-small">Save</button>
            </form>
          </td>
        </tr>
      ))}
    </tbody>
  </table></div>
)}

<h2>Pages <span class="count">{pages.length}</span></h2>
{pages.length === 0 && <p class="empty">Capture a few keywords and the page list appears here.</p>}
{pages.map((p) => (
  <form method="POST" action={api} class="sheet">
    <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="page" /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="keywords" value={p.keywords.join(',')} />
    <div class="row">
      <label class="field grow"><span>Page</span><input name="title" value={p.title} required /></label>
      <label class="field"><span>Type</span><select name="type">{[...PAGE_TYPES, 'Tie / review'].map((t) => <option selected={p.type === t}>{t}</option>)}</select></label>
    </div>
    <p class="quiet">{p.keywords.map(text).join(' · ')}{p.auto ? '' : ' · edited'}</p>
    <label class="field"><span>Note for the report</span><input name="note" value={p.note} /></label>
    <div class="form-foot"><button class="btn-quiet btn-small">Save</button></div>
  </form>
))}
{pages.filter((p) => !p.auto).map((p) => (
  <form method="POST" action={api} class="inline">
    <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="reset" /><input type="hidden" name="id" value={p.id} />
    <button class="link-quiet">Reset “{p.title}” to auto</button>
  </form>
))}

<h2>Results</h2>
{captures.map((k: any) => (
  <details class="fold">
    <summary>{k.text}<span class="sub">{day(study.serps[k.id].capturedAt)}</span></summary>
    <div class="fold-body"><div class="table-scroll"><table>
      <thead><tr><th>#</th><th>Result</th><th>Business</th><th>Type</th></tr></thead>
      <tbody>
        {study.serps[k.id].results.map((r: any) => (
          <tr>
            <td class="num">{r.rank}</td>
            <td><a href={r.url} target="_blank" rel="noopener">{r.title}</a></td>
            <td class="quiet">{r.domain}</td>
            <td>
              <form method="POST" action={api} class="inline">
                <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="type" /><input type="hidden" name="keyword" value={k.id} /><input type="hidden" name="rank" value={r.rank} />
                <select name="pageType" aria-label="Page type" onchange="this.form.requestSubmit()">{PAGE_TYPES.map((t) => <option selected={r.pageType === t}>{t}</option>)}</select>
                {r.typeSource === 'manual' && <span class="quiet"> edited</span>}
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div></div>
  </details>
))}

<h2>Report</h2>
<form method="POST" action={api} class="toolbar">
  <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="op" value="report" />
  <button class="btn" disabled={captures.length === 0}>Write the report to Documents</button>
  <a class="btn-quiet" href={`/office/research/${slug}/report/`} target="_blank" rel="noopener">Preview</a>
  {study.reportedAt && <span class="quiet">Last written {day(study.reportedAt)}. Send it from the <a href={`/office/clients/${slug}/?tab=emails`}>Emails tab</a>.</span>}
</form>
```

- [ ] **Step 3: The capture page**

Create `src/pages/office/research/capture.astro`:

```astro
---
// Opened by the bookmarklet with the capture in the URL fragment, which
// never reaches the server; the inline script moves it into the form.
export const prerender = false;
import OfficeLayout from '../../../layouts/OfficeLayout.astro';
import { store } from '../../../../netlify/functions/lib/office/store.mjs';

const error = Astro.url.searchParams.get('error');
const pick = Astro.url.searchParams.get('pick') === '1';
const csrf = Astro.locals.csrf;
const studies = pick ? ((await store().research.listAll()) as any[]) : [];
const clients = pick ? ((await store().clients.list()) as any[]) : [];
const names = new Map(clients.map((c) => [c.slug, c.business]));
---
<OfficeLayout title="Capture results">
  <div class="page-head"><h1>Capture results</h1></div>
  {error && <p class="error">{error}</p>}
  <p id="status" class="quiet">Reading the results…</p>
  <form method="POST" action="/office/api/research" id="capture" hidden>
    <input type="hidden" name="csrf" value={csrf} />
    <input type="hidden" name="op" value="capture" />
    <input type="hidden" name="payload" id="payload" />
    <p><strong id="q"></strong></p>
    <ol id="results"></ol>
    {pick && (
      <label class="field"><span>Save under</span>
        <select name="target" id="target" required>
          <option value="">Choose the client and keyword</option>
          {studies.flatMap((s) => s.keywords.map((k: any) => <option value={`${s.slug}|${k.id}`}>{names.get(s.slug) ?? s.slug} · {k.text}</option>))}
        </select>
      </label>
    )}
    <input type="hidden" name="slug" id="slug" /><input type="hidden" name="keyword" id="keyword" />
    <button class="btn">Save</button>
  </form>
  <script is:inline>
    (function () {
      var raw = location.hash.slice(1);
      var status = document.getElementById('status');
      if (!raw) { status.textContent = 'Nothing to capture. Click the bookmarklet on a Google results page.'; return; }
      var data;
      try { data = JSON.parse(decodeURIComponent(raw)); } catch (e) { status.textContent = 'The capture could not be read.'; return; }
      document.getElementById('payload').value = JSON.stringify(data);
      document.getElementById('q').textContent = data.q;
      var list = document.getElementById('results');
      (data.results || []).forEach(function (r) { var li = document.createElement('li'); li.textContent = r.title + ' — ' + r.url; list.appendChild(li); });
      status.textContent = (data.results || []).length + ' results for this search.';
      var target = document.getElementById('target');
      if (target) target.addEventListener('change', function () {
        var parts = target.value.split('|');
        document.getElementById('slug').value = parts[0] || '';
        document.getElementById('keyword').value = parts[1] || '';
      });
      document.getElementById('capture').hidden = false;
    })();
  </script>
</OfficeLayout>
```

The action's picker redirect (`?pick=1`) keeps the hash because a 303 to a same-document URL with no fragment preserves the fragment in every current browser. Verify in Step 6.

- [ ] **Step 4: The preview route**

Create `src/pages/office/research/[slug]/report.ts`:

```ts
export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG } from '../../../../../netlify/functions/lib/office/store.mjs';
import { renderResearchReport, reportName } from '../../../../../netlify/functions/lib/office/research-report.mjs';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  if (!SLUG.test(slug)) return new Response('not found', { status: 404 });
  const s = store();
  const client = await s.clients.get(slug);
  const study = await s.research.get(slug);
  if (!client || !study) return new Response('not found', { status: 404 });
  const now = new Date();
  const bytes = await renderResearchReport({ client, study, renderedAt: now });
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${reportName(now)}"`, 'Cache-Control': 'private, no-store' },
  });
};
```

- [ ] **Step 5: A little CSS**

Append to `src/styles/office.css`:

```css
/* Research: forms inside ledger rows and table cells stay on one line. */
.office .ledger .what .toolbar { margin: 0; }
.office td .toolbar { margin: 0; flex-wrap: nowrap; }
.office .ledger .meta form.inline { display: inline; }
```

- [ ] **Step 6: Check and build**

Run: `npm run check && npm run build && npm run verify`
Expected: 0 errors; build succeeds; verify passes (the office routes are server-rendered and stay out of `dist/office/`).

Then, if the local office harness from the `office-local-harness` memory note is available, seed a Growth client, open its Research tab, add a keyword, and click the bookmarklet on a real Google results page in an incognito window. Confirm the capture page lists eight results and Save lands on the Research tab with the keyword captured. Also confirm `?pick=1` still shows the results (the fragment survived the redirect). If the harness is not available, say so in the commit body and leave it for the owner's first run.

- [ ] **Step 7: Commit**

```bash
git add src/components/office/Research.astro "src/pages/office/clients/[slug].astro" src/pages/office/research/capture.astro "src/pages/office/research/[slug]/report.ts" src/styles/office.css
git commit -m "Add the Research tab, capture page and report preview"
```

---

### Task 7: Attach the report to an email

**Files:**
- Modify: `netlify/functions/lib/office/actions/send.mjs`
- Modify: `src/pages/office/send/[slug]/[template].astro`
- Test: `netlify/functions/lib/office/actions/send.test.mjs`

- [ ] **Step 1: Failing test**

Read the existing helpers at the top of `send.test.mjs` (a `make` store, a `post` builder, a fake `fetchFn` that records the Resend body). Append, adapting the helper names to what is there:

```js
test('attach=on sends the newest research report as an attachment', async () => {
  const s = await make();
  await s.documents.put('acme', 'search-research-2026-09-01.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'research' }, new Date('2026-09-01T00:00:00Z'));
  await s.documents.put('acme', 'search-research-2026-09-13.pdf', new Uint8Array([2, 3]), { type: 'application/pdf', source: 'research' }, new Date('2026-09-13T00:00:00Z'));
  let sent;
  const fetchFn = async (url, init) => { sent = JSON.parse(init.body); return new Response('{"id":"e1"}'); };
  const res = await send(post({ csrf, slug: 'acme', template: 'research-report', subject: 'S', body: 'B', attach: 'on' }), ctx(), s, fetchFn, new Date());
  assert.equal(res.headers.get('Location'), '/office/clients/acme/?tab=emails&sent=1');
  assert.equal(sent.attachments.length, 1);
  assert.equal(sent.attachments[0].filename, 'search-research-2026-09-13.pdf');
  assert.equal(sent.attachments[0].content, Buffer.from([2, 3]).toString('base64'));
});
```

If the file's `make` does not seed a client `acme` with an email, add one the way the other tests in that file do.

- [ ] **Step 2: Run, expect failure**

Run: `node --test netlify/functions/lib/office/actions/send.test.mjs`
Expected: `sent.attachments` is `[]`.

- [ ] **Step 3: Implement**

In `send.mjs`, before the `sendMail` call, add:

```js
  // The research report rides along when asked for: the newest document the
  // research action wrote, as Resend wants it.
  const attachments = [];
  if (data.get('attach') === 'on') {
    const reports = (await s.documents.list(slug)).filter((m) => m && m.source === 'research').sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
    if (reports[0]) {
      const bytes = await s.documents.get(slug, reports[0].name);
      if (bytes) attachments.push({ filename: reports[0].name, content: Buffer.from(bytes).toString('base64') });
    }
  }
```

and pass `attachments` in the `sendMail` call's first argument.

In `src/pages/office/send/[slug]/[template].astro`, in the frontmatter after `const csrf = ...`, add:

```ts
const report = ((await s.documents.list(slug)) as any[]).filter((m) => m && m.source === 'research').sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0] ?? null;
```

(check the page already has `s` as the store; if it is named differently, use that name). In the form, before the Send button, add:

```astro
      {report && (
        <label class="field check"><input type="checkbox" name="attach" checked={template.id === 'research-report'} /> <span>Attach the latest research report ({report.name})</span></label>
      )}
```

- [ ] **Step 4: Run, expect pass**

Run: `node --test netlify/functions/lib/office/actions/send.test.mjs && npm run check`
Expected: pass; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office/actions/send.mjs netlify/functions/lib/office/actions/send.test.mjs "src/pages/office/send/[slug]/[template].astro"
git commit -m "Attach the research report to an email"
```

---

### Task 8: Docs, the gate, and the spreadsheet

**Files:**
- Modify: `README.md`
- Modify: `docs/Keepsite_SERP_Overlap_Tracker_FINAL.xlsx` (commit it as the reference the rules came from)

- [ ] **Step 1: README**

After the `### Documents` section and before `## Enabling the CMS (/admin)`, add:

```markdown
### Search research

Growth, Agile and Range clients get a Research tab. It replaces the SERP
overlap spreadsheet in `docs/` with the same rules: gather the top eight
organic results for each keyword, count the results two keywords share,
and group keywords that share seven or more onto one page. Three to six
is the gray zone, decided on the client call and recorded on the tab.

Results come from your own browser. The tab shows a bookmarklet to drag to
the bookmarks bar; open each keyword's search in an incognito window, click
it on the results page, and a capture page in the office saves the top eight
under that keyword. No search API and nothing to configure. The keyword
list drafts itself from the build questionnaire and is edited on the tab.
Page types are guessed from each result's address and can be overridden.

The tab's page list is the recommendation for Stage 2. "Write the report to
Documents" renders it as a PDF in the client's Documents, and the send
screen offers to attach the newest one to any email, checked by default on
the seeded "Search research report" template. Advancing a Growth, Agile or
Range client into Demo creates the "Run search research" task, which links
to the tab.
```

- [ ] **Step 2: Add the workbook to git**

Run: `git add docs/Keepsite_SERP_Overlap_Tracker_FINAL.xlsx`

- [ ] **Step 3: Full gate**

Run: `npm run gate`
Expected: every stage passes: tests (the new files add roughly 30), `astro check` 0 errors, forms and office checks, build, verify.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/Keepsite_SERP_Overlap_Tracker_FINAL.xlsx
git commit -m "Document search research and keep the workbook it came from"
```
