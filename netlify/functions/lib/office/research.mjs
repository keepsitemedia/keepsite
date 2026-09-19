// The SERP overlap process from docs/Keepsite_SERP_Overlap_Tracker_FINAL.xlsx
// as functions over one study document per client. Every threshold and
// every sentence a client might read lives here and nowhere else.

export const PAGE_TYPES = ['Homepage', 'Service page', 'Location page', 'Directory', 'Blog/FAQ', 'Portfolio/Gallery', 'About page', 'Other'];

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

// ---- Grouping ----------------------------------------------------------------

// PROVISIONAL. The engine's one parameter. Chosen 2026-09-18 by sweeping the
// Makeup by Brinley fixture by hand, not by `scripts/validate-clusters.mjs`
// against an independent clustering: pages at cut 0.10 / 0.12 / 0.15 / 0.18 /
// 0.20 / 0.25 come out 10 / 12 / 13 / 15 / 16 / 18, and 0.12 is the point
// where the study reproduces the owner's own grouping — the full
// "utah bridal/wedding makeup" head as one page, the Bridal Party pair as
// one page, La Caille and Sundance together. Run the validation script
// against an independent clustering of the next study before trusting this
// elsewhere, and move the fixture test's assertions with it if it moves.
// The validation's findings live in docs/research-validation.md.
export const CUT = 0.12;

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
// `ids` narrows what is grouped without narrowing the square it is grouped
// over: an owner's edited page takes its keywords out of the grouping, but
// rarity and the nearest outsider still have to see the whole study.
export function cluster(m, sims, cut = CUT, ids = m.keywords.map((k) => k.id)) {
  const index = new Map(m.keywords.map((k, i) => [k.id, i]));
  let groups = ids.map((id) => [id]);
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
    if (nearest > 0) return 'This search shares a few results with others on your list, but not enough to share a page.';
    // Similarity ignores zero-weight columns, so a keyword whose only overlap
    // with the study is a listing site scores zero and would otherwise be
    // called wholly alone when it is not.
    const [id] = ids;
    const listings = Object.keys(m.cells[id] ?? {}).some((b) => (m.weight[b] ?? 0) === 0
      && m.keywords.some((k) => k.id !== id && m.cells[k.id]?.[b]));
    return listings ? 'The only results this shares with the rest of your list are listing sites, which show up for almost everything, so it needs a page of its own.'
      : 'Nothing else on your list brings up the same businesses, so this search needs a page of its own.';
  }
  const shared = m.businesses
    .filter((b) => (m.weight[b] ?? 0) > 0 && ids.every((id) => m.cells[id]?.[b]))
    .map((b) => ({ b, load: m.weight[b] * Math.min(...ids.map((id) => m.cells[id][b].w)) }))
    .sort((x, y) => y.load - x.load || x.b.localeCompare(y.b));
  const these = ids.length === 2 ? 'both of these' : 'all of these';
  if (!shared.length) return 'No single business comes up for every one of these, but most of them bring up the same names, so one page answers them all.';
  if (shared.length === 1) return `One business, ${shared[0].b}, comes up for all of these, and the rest of the results overlap enough to share a page.`;
  const led = shared.slice(0, 2).map((x) => x.b).join(' and ');
  return `${cap(word(shared.length))} of the same businesses come up for ${these}, led by ${led}, so one page answers them all.`;
}

export const normalizeQuery = (q) => String(q ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

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
// Counted over the captured keywords, since those are the ones the study has
// anything to say about; before the first capture the whole list stands in, so
// the tab still has a home area to reason with.
export function homeAreas(round) {
  const all = round.keywords ?? [];
  const seen = all.filter((k) => round.serps?.[k.id]);
  const ks = seen.length ? seen : all;
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

// Planner leaves a keyword out of its export when it has no data for it,
// which is the same fact as "under the floor". The owner records that with
// one click instead of a hand-made file of zeros. Only keywords with no
// volume at all are touched; a keyword Planner did report keeps its number.
export function applyNoVolume(round, now = new Date()) {
  const at = now.toISOString();
  const missing = round.keywords.filter((k) => !k.volume);
  if (!missing.length) return round;
  const ids = new Set(missing.map((k) => k.id));
  const keywords = round.keywords.map((k) => (ids.has(k.id) ? { ...k, volume: { min: 0, max: 0, source: 'none', at } } : k));
  return { ...round, keywords, volumeImport: { at, matched: missing.length, unmatchedRows: [], unmatchedKeywords: [] } };
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

// Edited rows are kept as they are and their keywords leave the clustering
// pass; the rest are clustered. The matrix and the square are still the whole
// study, so an edited page's keywords stay visible as outsiders and rarity
// reads the same here as it does on the tab's matrix. Exactly one page is the
// Homepage: the owner's if they named one, else the service group with the
// most volume, else the largest.
export function pageList(round) {
  const kept = (round.pages ?? []).filter((p) => p.auto === false).map((p) => ({ ...p, standing: 'page' }));
  const claimed = new Set(kept.flatMap((p) => p.keywords));
  const free = captured(round).filter((k) => !claimed.has(k.id)).map((k) => k.id);
  const m = matrix(round);
  const sims = similarities(m);
  const { groups } = cluster(m, sims, CUT, free);
  const home = homeAreas(round);
  const keptBlocks = kept.map((p) => p.keywords.filter((id) => m.cells[id]));
  const allPages = [...keptBlocks, ...groups];
  const keptIdOf = new Map(keptBlocks.map((block, i) => [block, kept[i].id]));
  const rows = groups.map((ids) => {
    const c = confidence(ids, allPages, sims);
    return {
      id: rowId(ids), title: titleOf(ids, round, sims), kind: kindOf(ids, round, home), keywords: ids,
      confidence: { level: c.level, tightness: c.tightness, nearest: c.nearest, near: c.near ? keptIdOf.get(c.near) ?? rowId(c.near) : null },
      reason: reasonOf(ids, m, c.nearest), standing: standingOf(ids, round), note: '', auto: true,
    };
  });
  if (!kept.some((p) => p.kind === 'Homepage')) {
    const byId = new Map(round.keywords.map((k) => [k.id, k]));
    const volume = (p) => p.keywords.reduce((n, id) => n + (byId.get(id)?.volume?.max ?? 0), 0);
    const byRank = (a, b) => volume(b) - volume(a) || b.keywords.length - a.keywords.length;
    // A study can cluster into nothing but Location pages and Articles, with
    // no Service page to promote; the site still needs exactly one Homepage,
    // so the largest row of any kind stands in rather than leaving the list
    // with none.
    const homepage = rows.filter((p) => p.kind === 'Service page').sort(byRank)[0] ?? rows.slice().sort(byRank)[0];
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

export const pairKey = (a, b) => [a, b].sort().join('|');

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
  return {
    similarity: s, band: band(s), shared, sharedDirectories, exactUrl, sameDomain,
    sameDomainDifferentPage: Math.max(0, sameDomain - exactUrl), sharedUrls, sharedDomains,
    // The shorter of the two lists, so an uncaptured side reads as zero and
    // describePair can say nothing was captured rather than "different".
    total: Math.min(a.length, b.length),
  };
}

export function describePair(c) {
  // An uncaptured side is nothing to compare, not a verdict of "different":
  // similarity 0 means the same thing whether the searches truly share
  // nothing or one of them was never captured, and only total tells the two
  // apart. A missing total (an older caller's object) is read as captured.
  if (c.total === 0) return 'Nothing captured yet.';
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

// A round is one complete run of a study. Keywords and areas live here, not
// on the study: a frozen round has to keep the keywords it was actually run
// with, or editing the list next year would rewrite what last year's report
// claims to have studied.
export function emptyRound(id = 'r1', now = new Date()) {
  return {
    id, startedAt: now.toISOString(), closedAt: null,
    areas: [], location: '', keywords: [], serps: {}, reads: {}, pages: [],
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

// The kind an edited row's old `type` field maps to, so a row saved before
// this spec still reads as a Homepage rather than falling through pageList's
// "no kept Homepage" check and getting a second one built for it.
const KIND_FROM_TYPE = { 'Homepage': 'Homepage', 'Service page': 'Service page', 'Location page': 'Location page', 'Blog/FAQ': 'Article' };
const kindFromType = (type) => KIND_FROM_TYPE[type] ?? 'Other';

function refresh(round) {
  const serps = {};
  for (const [id, serp] of Object.entries(round.serps ?? {})) {
    const results = (serp.results ?? []).map((r) => ({
      ...r, domain: businessOf(r.url),
      pageType: r.typeSource === 'manual' ? r.pageType : classify(r, round.areas ?? []),
    }));
    // The off-area flag is recomputed, never stored-and-trusted, so that
    // adding a service area answers the question for every capture already
    // taken rather than only the next one.
    const next = { ...serp, results };
    serps[id] = { ...next, local: localResults(next, round.areas ?? []) };
  }
  // Only a row that actually carries the old `type` field is touched; a
  // bare or already-migrated row passes through untouched.
  const pages = (round.pages ?? []).map((p) => {
    if (!('type' in p)) return p;
    const { type, ...rest } = p;
    return { ...rest, kind: rest.kind ?? kindFromType(type) };
  });
  return { ...round, location: round.location ?? '', serps, pages };
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
// instead of looking like a thin results page. The `uule` on the results page
// is recorded too: it is the only proof of where Google actually searched
// from, and a capture taken by hand from the wrong profile will not carry it.
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
var uule=new URLSearchParams(location.search).get('uule');if(uule)picked.uule=uule;
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

// The length character's alphabet: Google's own, standard base64 order.
const UULE_LENGTHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Where Google should think it is searching from. The scheme is Google's own,
// undocumented but long stable: a fixed prefix, one character standing for the
// canonical name's byte length, then that name in base64. Canonical means the
// place name with commas and no space after them. The capture page's off-area
// warning is the backstop if it ever stops working.
export function uule(location) {
  const canonical = String(location ?? '').trim().replace(/,\s+/g, ',');
  if (!canonical) return '';
  const bytes = new TextEncoder().encode(canonical);
  // The length character runs out at 64 bytes, and a parameter without one is
  // not a location at all; an unsayable place reads as no place, which the tab
  // and the capture page already warn about.
  if (bytes.length >= UULE_LENGTHS.length) return '';
  return `w+CAIQICI${UULE_LENGTHS[bytes.length]}${btoa(String.fromCharCode(...bytes))}`;
}

export const searchUrl = (q, location = '') => {
  const u = uule(location);
  return `${SEARCH_PREFIX}${encodeURIComponent(String(q ?? '').trim())}${u ? `&uule=${encodeURIComponent(u)}` : ''}`;
};
export const researchSearchUrl = (q, location = '') => `${RESEARCH_SCHEME}${searchUrl(q, location)}`;
// The same rule the PowerShell handler enforces, character for character: the
// prefix, a query in the URL's own character set, then at most the location
// parameter, anchored to the end so nothing can be appended after it. The
// whitespace test is spelled out on its own because JavaScript's `$` also
// matches before a trailing newline, and a browser's argument list is
// space-delimited: unquoted flags there are how a prefix match becomes an
// injection. If either side changes, so must the other.
const SEARCH_URL = /^https:\/\/www\.google\.com\/search\?q=[A-Za-z0-9%._~!$&'()*+,;=:@\/-]*(&uule=[A-Za-z0-9%+\/=_-]+)?$/;
export const isSearchUrl = (url) => {
  const s = String(url ?? '');
  return !/\s/.test(s) && SEARCH_URL.test(s);
};

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
  const uule = v.uule == null ? '' : String(v.uule);
  if (uule.length > 200) errors.push('the location parameter is too long');
  return {
    value: errors.length ? null : { q, results: results.map((r, i) => ({ rank: i + 1, url: String(r.url), title: String(r.title).trim().slice(0, 200) })), related, uule },
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

// Whether this capture found anyone from around here. A study captured from
// the wrong place looks exactly like a search people make from everywhere, and
// the two have opposite answers, so the flag asks the question rather than
// settling it. Unknown when there is nothing to recognise an area by.
export function localResults(serp, areas = []) {
  // "Utah, United States" names the state first; a one-part location is the
  // whole of it.
  const state = String(serp?.location ?? '').split(',')[0].trim();
  const tokens = [...(areas ?? []).filter(Boolean), ...(state ? [state] : [])];
  if (!tokens.length) return null;
  return (serp?.results ?? []).some((r) => tokens.some((t) => wordIn(t, `${r.url ?? ''} ${r.title ?? ''}`)));
}

export function applyCapture(study, keywordId, capture, now = new Date()) {
  const round = openRound(study);
  const results = capture.results.map((r, i) => ({
    rank: i + 1, url: r.url, title: r.title, domain: businessOf(r.url),
    pageType: classify(r, round.areas), typeSource: 'auto',
  }));
  // The study's location as it stood at capture time: changing it later does
  // not move the searches already run.
  const serp = { capturedAt: now.toISOString(), query: capture.q, results, related: capture.related ?? [], location: round.location ?? '', uule: capture.uule ?? '' };
  const serps = { ...round.serps, [keywordId]: { ...serp, local: localResults(serp, round.areas) } };
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
