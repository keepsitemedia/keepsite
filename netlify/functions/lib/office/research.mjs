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
// Per-click and per-impression ids: the same page carries a different one
// every time it is captured, so leaving them in makes one page look like two
// and the pair reads as "same business, different page". srsltid is the one
// Google now appends to most organic results.
const TRACKING = /^(utm_|(gclid|gbraid|wbraid|dclid|fbclid|msclkid|twclid|igshid|yclid|srsltid|mc_cid|mc_eid|_hsenc|_hsmi)$)/;

const parse = (url) => { try { return new URL(String(url)); } catch { return null; } };

// Google shows one page under several spellings: www or not, a fragment, a
// tracking parameter, a trailing slash. The workbook compared them by eye.
export function normalizeUrl(url) {
  const u = parse(url);
  if (!u) return String(url ?? '').trim();
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  const path = u.pathname.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '');
  return `${host}${path}${query}`;
}

export const domainOf = (url) => (parse(url)?.hostname ?? String(url ?? '')).toLowerCase().replace(/^www\./, '');

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
  // in a long numeric id (-<6-7 digits>) to distinguish it from category
  // slugs like "top-10-photographers".
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
    const profile = handle && (!rule.endsInId || /-\d{5,}$/.test(handle));
    return profile ? `${host}/${handle}` : host;
  }
  const handle = segments[0]?.toLowerCase();
  const profile = handle && !rule.reserved.includes(handle)
    && (!rule.at || handle.startsWith('@'))
    && (rule.at || segments.length === 1);
  return profile ? `${host}/${handle}` : host;
}
export const isProfile = (url) => businessOf(url) !== domainOf(url);

const hasAny = (s, needles) => needles.some((n) => s.includes(n));

export function classify({ url, title }, areas = []) {
  const u = parse(url);
  const domain = domainOf(url);
  const path = (u?.pathname ?? '/').toLowerCase().replace(/\/index\.html?$/, '/');
  const text = `${path} ${String(title ?? '')}`.toLowerCase();
  if (isProfile(url)) return 'Homepage';
  if (DIRECTORIES.some((d) => domain === d || domain.endsWith(`.${d}`))) return 'Directory';
  if (u && (path === '' || path === '/')) return 'Homepage';
  if (areas.some((a) => a && text.includes(String(a).toLowerCase())) || hasAny(path, ['/locations/', '/service-area', '/areas-we-serve'])) return 'Location page';
  if (hasAny(path, ['/blog', '/faq', '/news', '/article', '/post', '/guide', '/resources', '/tips']) || /\/20\d\d\//.test(path)
    || /^(how|what|why|when|which)\b/i.test(String(title ?? '').trim()) || String(title ?? '').includes('?')) return 'Blog/FAQ';
  if (hasAny(path, ['/gallery', '/portfolio', '/projects', '/our-work', '/photos', '/case-stud'])) return 'Portfolio/Gallery';
  if (hasAny(path, ['/about', '/team', '/our-story', '/staff', '/meet-'])) return 'About page';
  return 'Service page';
}

// Reasoned, not measured, and measured once without finding a better place
// for them. Calibrated 2026-09-18 against the Makeup by Brinley study (22
// keywords, 231 pairs, social profiles counted as businesses): the only
// natural break in the ratio distribution is between 0 and 0.2 — "shares
// nothing" against "shares something". From 0.2 to 0.8 it is a smooth ramp
// with no gap, so the cuts below are arbitrary by the spec's own test and
// stay where they were. A pair near a boundary is a judgement call, not a
// verdict. Re-run `node scripts/calibrate-pairs.mjs <export.json>` on the
// next study in a different field before trusting them there.
export const STRONG_RATIO = 2 / 3;
export const GRAY_RATIO = 1 / 3;
export const MIN_BUSINESSES = 3;

const READ_TEXT = {
  strong: ['Strong overlap: very likely the same search intent.', 'Keep these keywords in the same cluster/page.'],
  gray: ['GRAY ZONE: some of the same businesses rank for both. Review page types and client priorities.', 'Discuss on the client call before deciding whether to split.'],
  unmeasurable: ['Too few businesses rank for these searches to compare them.', 'Decide this one on what the client does, not on the numbers.'],
  low: ['Low overlap: likely a meaningfully different intent.', 'Consider separate clusters/pages if page types also differ.'],
};

// The workbook's SUMPRODUCT/COUNTIF: one count per row of A that has a
// match anywhere in B, so eight rows give at most eight.
const countIn = (as, bs, key) => {
  const set = new Set(bs.map(key));
  return as.filter((x) => set.has(key(x))).length;
};
// The distinct keys behind that count, in A's order. The compare page
// highlights every row carrying one, so the rows lit on A's side equal the
// count even when two of A's rows share a key.
const sharedIn = (as, bs, key) => {
  const set = new Set(bs.map(key));
  return [...new Set(as.map(key).filter((k) => set.has(k)))];
};

export function primaryPageOf(results) {
  const counts = new Map();
  for (const x of results) if (x.pageType) counts.set(x.pageType, (counts.get(x.pageType) ?? 0) + 1);
  if (!counts.size) return '';
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, n]) => n === top);
  return leaders.length > 1 ? 'Tie / review' : leaders[0][0];
}

// ---- The matrix ------------------------------------------------------------

// The DCG discount: rank 1 counts 1, rank 8 about a third. Position says
// how sure Google is, and a business at the top of both lists is stronger
// evidence than one at the bottom of both.
export const rankWeight = (rank) => 1 / Math.log2(rank + 1);

const captured = (round) => round.keywords.filter((k) => round.serps[k.id]);

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

// A directory ranks for every query in a field, so counting it as evidence
// that two queries mean the same thing adds the same constant to every pair.
// The businesses are what discriminate.
const isDirectory = (x) => x.pageType === 'Directory';
const businessesOf = (results) => results.filter((x) => !isDirectory(x));

export function comparePair(a, b) {
  const exactUrl = countIn(a, b, (x) => normalizeUrl(x.url));
  const sameDomain = countIn(a, b, (x) => businessOf(x.url));
  const samePageType = countIn(a, b, (x) => x.pageType);
  const sharedUrls = sharedIn(a, b, (x) => normalizeUrl(x.url));
  const sharedDomains = sharedIn(a, b, (x) => businessOf(x.url));
  const aBiz = businessesOf(a);
  const bBiz = businessesOf(b);
  // Whichever side has fewer businesses sets the denominator, so a search
  // whose businesses are a strict subset of the other's always scores a
  // perfect 1.0 — no gray zone, no question asked. That is the same shape
  // MIN_BUSINESSES=3 is meant to guard against: the thinnest measurable SERP
  // is the one likeliest to look like a perfect match. Nobody has measured
  // how often this actually fires; run `node scripts/calibrate-pairs.mjs`
  // against a real study before trusting a 'strong' result on a lopsided pair.
  const denominator = Math.min(aBiz.length, bBiz.length);
  const sharedBusinesses = countIn(aBiz, bBiz, (x) => normalizeUrl(x.url));
  const sharedDirectories = countIn(a.filter(isDirectory), b.filter(isDirectory), (x) => normalizeUrl(x.url));
  const ratio = denominator ? sharedBusinesses / denominator : null;
  const branch = denominator < MIN_BUSINESSES ? 'unmeasurable'
    : ratio >= STRONG_RATIO ? 'strong'
    : ratio >= GRAY_RATIO ? 'gray'
    : 'low';
  // Only where the share of businesses was already inconclusive. A pair that
  // is clearly one thing or the other is never second-guessed by page type.
  // samePageType is deliberately not used: it counts a row of A whose type
  // appears anywhere in B, so across eight results and a handful of types it
  // is 8 almost always. The leading type on each side is what discriminates.
  // Over the businesses, not the raw results: directories lead the count in a
  // directory-heavy field, so comparing the raw leaders would put 'Directory'
  // on both sides of almost every pair and reintroduce the constant the ratio
  // strips out. What discriminates is the shape the individual businesses use.
  const primaryA = primaryPageOf(aBiz);
  const primaryB = primaryPageOf(bBiz);
  const comparable = primaryA && primaryB && primaryA !== 'Tie / review' && primaryB !== 'Tie / review';
  const tie = branch !== 'gray' || !comparable ? null : primaryA === primaryB ? 'strong' : 'low';
  const [read, action] = READ_TEXT[tie ?? branch];
  return {
    exactUrl, sameDomain, sameDomainDifferentPage: Math.max(0, sameDomain - exactUrl), samePageType, sharedUrls, sharedDomains,
    sharedBusinesses, sharedDirectories, businessesA: aBiz.length, businessesB: bBiz.length, denominator, ratio,
    read, action, signal: tie ?? branch, resolvedBy: tie ? 'type' : undefined, primaryPage: primaryPageOf([...a, ...b]),
  };
}

// The compare page's plain-English line over the two columns: the same
// counts as comparePair, read the way the owner would say them on a call.
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => WORDS[n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const PLURAL = {
  'Service page': 'service pages', 'Location page': 'location pages', 'Homepage': 'homepages', 'Directory': 'directories',
  'Blog/FAQ': 'blog or FAQ pages', 'Portfolio/Gallery': 'portfolio or gallery pages', 'About page': 'about pages',
};
export function describePair(c, total) {
  if (!total) return 'Nothing captured yet.';
  const type = c.primaryPage === 'Tie / review' ? ' No page type leads on either side.'
    : c.primaryPage ? ` Most results are ${PLURAL[c.primaryPage] ?? c.primaryPage.toLowerCase()}.` : '';
  // Named apart from the business count, never folded into it: a directory
  // ranking for both searches says nothing about whether the searches mean
  // the same thing.
  const dirs = c.sharedDirectories ? ` They also share ${word(c.sharedDirectories)} ${c.sharedDirectories === 1 ? 'directory, which ranks' : 'directories, which rank'} for almost everything in a field.` : '';
  // unmeasurable means too few businesses to compute a share at all, so no
  // ratio or count of businesses may appear in this branch. State the effect,
  // not a guessed cause: a sparse SERP with no directories at all also lands
  // here, and the dirs clause already supplies the directory detail when one
  // is actually present.
  if (c.signal === 'unmeasurable') {
    return `Too few businesses rank for these searches to compare them.${dirs}${type}`;
  }
  const same = c.sharedBusinesses === 0 ? 'None of the same businesses rank for both.'
    : `${cap(word(c.sharedBusinesses))} of ${word(c.denominator)} businesses ${c.sharedBusinesses === 1 ? 'ranks' : 'rank'} for both, with the same page.`;
  const more = c.sameDomainDifferentPage === 0 ? ''
    : ` ${cap(word(c.sameDomainDifferentPage))} more ${c.sameDomainDifferentPage === 1 ? 'business ranks' : 'businesses rank'} with a different page for each search.`;
  return `${same}${more}${dirs}${type}`;
}

export const pairKey = (a, b) => [a, b].sort().join('|');

// Rows without the decisive label, computed once per round. group() and
// decisiveFor() both need the comparison but never the label — computing it
// here would make decisiveFor recurse through every other askable pair —
// and comparePair does not depend on reads, so every caller can share these
// same rows instead of paying for comparePair again.
function pairRows(round) {
  const ks = captured(round);
  const out = [];
  for (let i = 0; i < ks.length; i += 1) {
    for (let j = i + 1; j < ks.length; j += 1) {
      const key = pairKey(ks[i].id, ks[j].id);
      const read = round.reads[key] ?? null;
      out.push({ a: ks[i], b: ks[j], key, ...comparePair(round.serps[ks[i].id].results, round.serps[ks[j].id].results), read });
    }
  }
  return out;
}

export function pairs(round) {
  const rows = pairRows(round);
  return rows.map((row) => {
    // Only a pair the signal could not settle is a question. A strong or low
    // pair has an answer already, and a pair with a read has been answered —
    // both are null, meaning nothing to ask.
    const askable = !row.read && (row.signal === 'gray' || row.signal === 'unmeasurable');
    return { ...row, decisive: askable ? decisiveFor(rows, round, row.key) : null };
  });
}

// Would the owner's answer change anything? Force the pair each way and
// compare the resulting page lists — not the raw groups: a keyword claimed
// by a hand-edited page never reaches group() at all (see pageListFrom), so
// a pair touching one is never decisive no matter which way it is forced.
// When the two page lists match, the two keywords are already joined (or
// already separated, or one is spoken for) through other pairs and the
// question is rhetorical. comparePair does not depend on reads — only the
// forced pair's read differs between the two probes — so this reuses the
// rows already built for the round instead of recomputing comparePair for
// every pair, twice, for every askable pair. That recomputation is what made
// this O(n^4): 39ms at 10 keywords, 7.4s at 40, ~25s on a directory-heavy
// real study, on every render of the Research tab, the report and every
// archived round.
function decisiveFor(rows, round, key) {
  const withRead = (sameCluster) => rows.map((row) => (row.key === key
    ? { ...row, read: { human: 'Gray zone / discuss', sameCluster, notes: '' } }
    : row));
  const asOne = pageListFrom(withRead('Yes'), round).map((p) => p.keywords.slice().sort().join(',')).sort().join('|');
  const asTwo = pageListFrom(withRead('No'), round).map((p) => p.keywords.slice().sort().join(',')).sort().join('|');
  return asOne !== asTwo;
}

// Union-find over captured keywords. A strong pair joins unless the owner
// said No; a Yes joins whatever the numbers say. Takes already-built rows —
// comparePair does not depend on reads, so a caller with rows in hand (see
// decisiveFor) never has to recompute them.
function groupFrom(ps, round) {
  const ks = captured(round);
  const parent = new Map(ks.map((k) => [k.id, k.id]));
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
  const union = (x, y) => parent.set(find(x), find(y));
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
    const results = ids.flatMap((id) => round.serps[id].results);
    return { id: `p-${ids.slice().sort().join('-')}`, title: round.keywords.find((k) => k.id === title).text, type: primaryPageOf(results), keywords: ids, note: '', auto: true };
  });
  return rows.sort((x, y) => y.keywords.length - x.keywords.length || round.keywords.findIndex((k) => k.id === x.keywords[0]) - round.keywords.findIndex((k) => k.id === y.keywords[0]));
}

export function group(round) {
  return groupFrom(pairRows(round), round);
}

// pageList's body, taking prebuilt pair rows so a caller who already has
// them (decisiveFor) never pays for comparePair again. Rows touching a
// claimed keyword are dropped, not just the keyword itself: left in, such a
// row would still union its other, unclaimed keyword into a group through
// groupFrom, resurrecting a keyword the kept page already accounts for. This
// must keep matching rest's own filtering below, or a claimed keyword would
// be groupable through one path and not the other.
function pageListFrom(rows, round) {
  const kept = (round.pages ?? []).filter((p) => p.auto === false);
  const claimed = new Set(kept.flatMap((p) => p.keywords));
  const rest = { ...round, keywords: round.keywords.filter((k) => !claimed.has(k.id)) };
  const restRows = rows.filter((row) => !claimed.has(row.a.id) && !claimed.has(row.b.id));
  return [...kept, ...groupFrom(restRows, rest)];
}

export function pageList(round) {
  return pageListFrom(pairRows(round), round);
}

// A round is one complete run of a study. Keywords and areas live here, not
// on the study: a frozen round has to keep the keywords it was actually run
// with, or editing the list next year would rewrite what last year's report
// claims to have studied.
export function emptyRound(id = 'r1', now = new Date()) {
  return {
    id, startedAt: now.toISOString(), closedAt: null,
    areas: [], keywords: [], serps: {}, reads: {}, pages: [],
    notes: { intro: '', closing: '' }, reportedAt: null,
  };
}

export function emptyStudy(slug, now = new Date()) {
  const at = now.toISOString();
  return { slug, createdAt: at, updatedAt: at, rounds: [emptyRound('r1', now)] };
}

// The classification rules move (social profiles stopped being directories
// on 2026-09-18) and a capture is a snapshot of the rules as they stood. Every
// read re-runs them on the rows the owner has not edited, so an old study is
// judged the way a new one would be. A manual type is the owner's call and
// stays; the business name follows the URL regardless, since it is not a
// judgement.
function refresh(round) {
  const serps = {};
  for (const [id, serp] of Object.entries(round.serps ?? {})) {
    serps[id] = { ...serp, results: (serp.results ?? []).map((r) => ({
      ...r, domain: businessOf(r.url),
      pageType: r.typeSource === 'manual' ? r.pageType : classify(r, round.areas ?? []),
    })) };
  }
  return { ...round, serps };
}

// Read-time migration, never a batch rewrite: a document written before rounds
// existed is exactly one round's worth of work.
export function migrateStudy(doc, now = new Date()) {
  if (!doc) return doc;
  if (Array.isArray(doc.rounds)) return { ...doc, rounds: doc.rounds.map(refresh) };
  const at = now.toISOString();
  return {
    slug: doc.slug, createdAt: doc.createdAt ?? at, updatedAt: doc.updatedAt ?? at,
    rounds: [refresh({
      ...emptyRound('r1', now),
      startedAt: doc.createdAt ?? at,
      areas: doc.areas ?? [], keywords: doc.keywords ?? [], serps: doc.serps ?? {},
      reads: doc.reads ?? {}, pages: doc.pages ?? [], reportedAt: doc.reportedAt ?? null,
    })],
  };
}

export const openRound = (study) => study.rounds[study.rounds.length - 1];
export const roundOf = (study, id) => study.rounds.find((r) => r.id === id);

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
// Signed out, Google replaces every result link with /goto?url=<opaque blob>,
// which carries no destination and which pickResults drops as a google.com
// host. Counting them is what lets a short capture say why it is short
// instead of looking like a thin results page.
export function bookmarklet(origin) {
  const code = `(function(){
var PICK=${PICK_SOURCE};
var q=new URLSearchParams(location.search).get('q')||'';
var cands=[];var n=0;var hidden=0;
document.querySelectorAll('h3').forEach(function(h){
var a=h.closest('a[href]');if(!a)return;
var box=h.closest('[data-hveid]')||(a.parentElement&&a.parentElement.parentElement)||a;
if(!box.dataset.kbox){n+=1;box.dataset.kbox=String(n);}
if(a.pathname==='/goto')hidden+=1;
cands.push({href:a.href,title:h.textContent,ad:!!h.closest('#tads,#bottomads,[data-text-ad],[aria-label="Ads"],.related-question-pair,[data-attrid],#rhs'),box:box.dataset.kbox});
});
var related=[];document.querySelectorAll('#botstuff a[href*="/search?"]').forEach(function(a){related.push(a.textContent);});
var picked=PICK({q:q,candidates:cands,related:related});
var signedOut='Google gave no web addresses for these results, which is what it does when you are not signed in. Search again in the research account and capture from there.';
if(!picked.results.length){alert(hidden?signedOut:'No results found on this page');return;}
if(hidden&&picked.results.length<8){alert(hidden+' of these results had no web address and were skipped, so this capture would be short. '+signedOut);return;}
picked.at=new Date().toISOString();
window.open(${JSON.stringify(`${origin}/office/research/capture/#`)}+encodeURIComponent(JSON.stringify(picked)));
})();`;
  return `javascript:${encodeURIComponent(code.replace(/\n/g, ' '))}`;
}

// The search a capture starts from, spelled once. scripts/research-search
// whitelists SEARCH_PREFIX verbatim: a page cannot choose which browser
// profile opens a link, so the ks-research: link hands the URL to a handler
// installed on the machine, and the handler opens the research profile —
// signed into the research account, activity paused, never used for browsing.
// Widen the prefix here and you widen what that handler will launch, so keep
// isSearchUrl and the PowerShell regex saying the same thing.
export const SEARCH_PREFIX = 'https://www.google.com/search?q=';
export const RESEARCH_SCHEME = 'ks-research:';
export const searchUrl = (q) => `${SEARCH_PREFIX}${encodeURIComponent(String(q ?? '').trim())}`;
export const researchSearchUrl = (q) => `${RESEARCH_SCHEME}${searchUrl(q)}`;
// Nothing in production calls this — only its own test below holds up the
// mirror described above. The PowerShell side is the one that actually
// gates a browser command line, and it is stricter than this prefix check:
// a whole-string pattern that also refuses whitespace, because a browser's
// argument list is space-delimited and unquoted flags there are how a
// prefix match gets turned into an injection. If either side changes, so
// must the other, and if this ever gets called from real code, it needs
// the same whole-string, no-whitespace tightening first.
export const isSearchUrl = (url) => String(url ?? '').startsWith(SEARCH_PREFIX);

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
  for (const s of studies) {
    const round = openRound(s);
    for (const k of round.keywords) if (normalizeQuery(k.text) === want) out.push({ slug: s.slug, keywordId: k.id, text: k.text });
  }
  return out;
}

export function applyCapture(study, keywordId, capture, now = new Date()) {
  const round = openRound(study);
  const results = capture.results.map((r, i) => ({
    rank: i + 1, url: r.url, title: r.title, domain: businessOf(r.url),
    pageType: classify(r, round.areas), typeSource: 'auto',
  }));
  const serps = { ...round.serps, [keywordId]: { capturedAt: now.toISOString(), query: capture.q, results, related: capture.related ?? [] } };
  const rounds = study.rounds.slice();
  rounds[rounds.length - 1] = { ...round, serps };
  return touch({ ...study, rounds }, now);
}

// Any change to a snapshot or a read reshapes the open round's page rows. A
// closed round's pages are the record of what was recommended then.
export function touch(study, now = new Date()) {
  const rounds = study.rounds.slice();
  const last = rounds.length - 1;
  rounds[last] = { ...rounds[last], pages: pageList(rounds[last]) };
  return { ...study, rounds, updatedAt: now.toISOString() };
}

// ---- Keywords ---------------------------------------------------------------

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newKeywordId(random = Math.random) {
  let id = 'k';
  for (let i = 0; i < 8; i += 1) id += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return id;
}

export const splitList = (text) => String(text ?? '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

// A trailing s is folded so "Weddings" claims "wedding florist".
const words = (s) => new Set(normalizeQuery(s).split(' ').filter((w) => w.length > 2).map((w) => w.replace(/s$/, '')));

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
