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
