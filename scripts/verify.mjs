// Structural acceptance checks against dist/. Run: npm run gate
//
// `npm run gate` type-checks, builds a fresh dist/, then runs `npm run verify`,
// so one command re-runs every structural assertion the brand transition made.
// `npm run verify` alone checks whatever dist/ is already on disk.
import fs from 'node:fs';
import path from 'node:path';

const results = [];
const fail = [];
let group = '';
const section = (name) => {
  group = name;
};
const check = (label, fn) => {
  try {
    fn();
    results.push({ group, label, ok: true, error: '' });
  } catch (e) {
    results.push({ group, label, ok: false, error: e.message });
    fail.push(`${label}: ${e.message}`);
  }
};
const read = (p) => fs.readFileSync(path.join('dist', p), 'utf8');
const data = (name) => JSON.parse(fs.readFileSync(path.join('src', 'data', name), 'utf8'));

if (!fs.existsSync('dist')) {
  console.error('dist/ is missing. Run `npm run gate`, which builds first.');
  process.exit(1);
}

const PAGES = [
  'index.html',
  'packages/index.html',
  'how-it-works/index.html',
  'faq/index.html',
  'start/index.html',
  'start/thanks/index.html',
  '404.html',
];

// Dollar figures, e.g. "$90", "$1,100". Used to compare prices across files.
const MONEY = /\$[0-9][0-9,]*/g;
const money = (s) => [...String(s).matchAll(MONEY)].map((m) => m[0]);
const numeric = (s) => Number(String(s).replace(/[^0-9]/g, ''));

section('Routes');
check('every expected route is emitted', () => {
  for (const p of [...PAGES, 'robots.txt', 'sitemap-index.xml', 'og-default.png', 'favicon.svg']) {
    if (!fs.existsSync(path.join('dist', p))) throw new Error('missing ' + p);
  }
});
check('renamed routes are gone', () => {
  for (const p of ['pricing', 'contact', 'portfolio']) {
    if (fs.existsSync(path.join('dist', p))) throw new Error('still emitted: ' + p);
  }
});
check('noindex pages are out of the sitemap', () => {
  const s = read('sitemap-0.xml');
  if (s.includes('/start/thanks') || s.includes('/404')) throw new Error('noindex page in sitemap');
});

section('Copy residue');
check('no old-model residue', () => {
  const needles = ['no lock-in', '$0 a month', 'nothing to pay', '$500', '$750', 'snic9004'];
  for (const p of PAGES) {
    const h = read(p).toLowerCase();
    for (const n of needles) {
      if (h.includes(n.toLowerCase())) throw new Error(`"${n}" found in ${p}`);
    }
  }
});
// Unanchored "Sam" matches inside "same" and "sameAs"; the boundary is the check.
// Retire this assertion in the same commit that sets process.json's `signature`
// — founder presence is a deliberate data edit, not residue.
check('no persona-name residue', () => {
  for (const p of PAGES) {
    if (/\bSam\b/.test(read(p))) throw new Error('persona name in ' + p);
  }
});
// Scoped to answer copy: the questions are written in the visitor's voice and
// are first-person singular on purpose.
check('FAQ answers stay in the plural voice', () => {
  for (const g of data('faq.json').groups) {
    for (const item of g.items) {
      const hit = item.a.match(/\b(I|I'm|I've|I'd|I'll|me|my|mine|myself)\b/);
      if (hit) throw new Error(`"${hit[0]}" in answer ${item.topic}`);
    }
  }
});
check('nothing links a retired route', () => {
  for (const p of PAGES) {
    const hit = read(p).match(/(?:href|action)="\/(?:contact|pricing|portfolio)\b/);
    if (hit) throw new Error(`${hit[0]} in ${p}`);
  }
});
check('prices are the new ones', () => {
  const h = read('packages/index.html');
  for (const p of ['$1,100', '$55', '$1,750', '$150', '$2,000', '$275']) {
    if (!h.includes(p)) throw new Error('missing price ' + p);
  }
});
check('no "Most popular" marker', () => {
  const h = read('packages/index.html').toLowerCase();
  if (h.includes('most popular') || h.includes('most chosen')) throw new Error('fabricated popularity claim');
});
check('contact details are correct everywhere', () => {
  const h = read('index.html');
  if (!h.includes('keepsitemedia@gmail.com')) throw new Error('email missing from the footer');
  if (!h.includes('+13853078190')) throw new Error('tel link missing');
  if (!h.includes('Serving Utah')) throw new Error('service area missing');
});

// Prices live in packages.json but are quoted in home.json and faq.json prose.
// These two checks make that duplication structural instead of documented.
section('Price drift');
check('the home description quotes the lowest build price', () => {
  const tiers = data('packages.json').tiers;
  const lowest = tiers.slice().sort((a, b) => numeric(a.buildPrice) - numeric(b.buildPrice))[0].buildPrice;
  const desc = data('home.json').meta.description;
  if (!desc.includes(lowest)) throw new Error(`description omits ${lowest}: "${desc}"`);
});
check('every price in the FAQ answers comes from packages.json', () => {
  const pkg = data('packages.json');
  const quotable = new Set([
    ...pkg.addOns.items.flatMap((i) => money(i.price)),
    ...pkg.tiers.flatMap((t) => [t.buildPrice, t.monthlyPrice]),
  ]);
  for (const g of data('faq.json').groups) {
    for (const item of g.items) {
      for (const fig of money(item.a)) {
        if (!quotable.has(fig)) throw new Error(`${fig} in answer ${item.topic} is in no packages.json price`);
      }
    }
  }
});

section('Structure');
check('one h1 per page, no skipped levels, main and canonical present', () => {
  for (const p of PAGES) {
    const h = read(p);
    // Tolerate Astro's data-astro-cid attributes on every element match.
    const levels = [...h.matchAll(/<h([1-6])(?=[\s/>])/g)].map((m) => Number(m[1]));
    const h1 = levels.filter((n) => n === 1).length;
    if (h1 !== 1) throw new Error(`${p} has ${h1} h1 elements`);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) throw new Error(`${p} skips h${levels[i - 1]} to h${levels[i]}`);
    }
    if (!/<main[^>]*id="main"/.test(h)) throw new Error(p + ' has no main landmark');
    if (!/<link[^>]*rel="canonical"/.test(h)) throw new Error(p + ' has no canonical');
    if (!/<a[^>]*class="[^"]*\bskip-link\b/.test(h)) throw new Error(p + ' has no skip link');
    if (!h.includes('og:image')) throw new Error(p + ' has no og:image');
  }
});
check('noindex only on 404 and thanks', () => {
  for (const p of PAGES) {
    const has = read(p).includes('noindex,follow');
    const should = p === '404.html' || p === 'start/thanks/index.html';
    if (has !== should) throw new Error(`${p} noindex=${has}, expected ${should}`);
  }
});
check('no broken internal links', () => {
  const bad = [];
  for (const p of PAGES) {
    // action= too: the Start form posts to /start/thanks/, the site's only
    // internal reference that is not an href.
    for (const m of read(p).matchAll(/(?:href|action)="(\/[^"#?]*)/g)) {
      const href = m[1];
      if (href.startsWith('/_astro/')) continue;
      const tries = [
        path.join('dist', href),
        path.join('dist', href, 'index.html'),
        path.join('dist', href.replace(/\/$/, '') + '.html'),
      ];
      if (!tries.some((t) => fs.existsSync(t))) bad.push(`${p} -> ${href}`);
    }
  }
  if (bad.length) throw new Error(bad.join(', '));
});

section('JavaScript budget');
check('only JSON-LD, plus one tier-prefill script on /start/', () => {
  const expect = {
    'index.html': 1,
    'packages/index.html': 2,
    'how-it-works/index.html': 1,
    'faq/index.html': 2,
    'start/index.html': 2,
    'start/thanks/index.html': 1,
    '404.html': 1,
  };
  for (const [p, n] of Object.entries(expect)) {
    // Count tag occurrences, not lines: the build emits one long line.
    const c = (read(p).match(/<script(?=[\s>])/g) || []).length;
    if (c !== n) throw new Error(`${p} has ${c} scripts, expected ${n}`);
  }
});

section('Structured data');
const ld = (p) =>
  [...read(p).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

check('business node is complete and address-free', () => {
  const biz = ld('index.html')[0]['@graph'].find((n) => n['@type'] === 'ProfessionalService');
  if (biz['@id'] !== 'https://www.keepsitemedia.com/#business') throw new Error('@id');
  if (biz.email !== 'keepsitemedia@gmail.com') throw new Error('email');
  if (biz.telephone !== '+13853078190') throw new Error('telephone');
  if (biz.areaServed.name !== 'Utah') throw new Error('areaServed');
  if ('address' in biz) throw new Error('address must be omitted');
});
check('Service prices match the rendered prices', () => {
  const services = ld('packages/index.html')[1]['@graph'];
  const expect = { presence: ['1100.00', '55.00'], search: ['1750.00', '150.00'], 'search-plus': ['2000.00', '275.00'] };
  if (services.length !== 3) throw new Error('services: ' + services.length);
  for (const s of services) {
    const id = s['@id'].split('#')[1];
    if (!expect[id]) throw new Error('unknown service id ' + id);
    const [b, m] = expect[id];
    if (s.offers[0].price !== b) throw new Error(id + ' build ' + s.offers[0].price);
    if (s.offers[1].priceSpecification.price !== m) throw new Error(id + ' monthly ' + s.offers[1].priceSpecification.price);
    if (s.provider['@id'] !== 'https://www.keepsitemedia.com/#business') throw new Error(id + ' provider');
  }
});
check('FAQPage lives only on /faq/', () => {
  const f = ld('faq/index.html')[1];
  if (f['@type'] !== 'FAQPage') throw new Error('faq page type');
  const asked = data('faq.json').groups.reduce((n, g) => n + g.items.length, 0);
  if (f.mainEntity.length !== asked)
    throw new Error(`questions: ${f.mainEntity.length}, faq.json has ${asked}`);
  if (read('packages/index.html').includes('FAQPage')) throw new Error('duplicate FAQPage on /packages/');
});

section('Fonts');
// The preload sits in the HTML and the @font-face in an externalized
// stylesheet, so the hash has to agree across both files.
check('the preload and the stylesheet request the same file', () => {
  const SANS = /\/_astro\/instrument-sans-latin-wght-normal\.[A-Za-z0-9_-]+\.woff2/g;
  for (const p of PAGES) {
    const html = read(p);
    const sheets = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(\/_astro\/[^"]+\.css)"/g)].map((m) =>
      read(m[1].replace(/^\//, ''))
    );
    if (!sheets.length) throw new Error(p + ' links no stylesheet');
    const inHtml = new Set(html.match(SANS) || []);
    const inCss = new Set(sheets.flatMap((c) => c.match(SANS) || []));
    if (inHtml.size !== 1) throw new Error(`${p} preloads ${inHtml.size} sans assets`);
    if (inCss.size !== 1) throw new Error(`${p} stylesheets declare ${inCss.size} sans assets`);
    const [preloaded] = [...inHtml];
    const [declared] = [...inCss];
    if (preloaded !== declared) throw new Error(`${p} preloads ${preloaded} but loads ${declared}`);
    for (const s of [html, ...sheets]) {
      if (s.includes('fonts.googleapis.com')) throw new Error(p + ' uses a third-party font origin');
    }
  }
});

const width = Math.max(...results.map((r) => r.label.length));
let printed = '';
for (const r of results) {
  if (r.group !== printed) {
    console.log('\n' + r.group);
    printed = r.group;
  }
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(width)}${r.ok ? '' : '  ' + r.error}`);
}

const passed = results.length - fail.length;
console.log(`\n${results.length} assertions, ${passed} passed, ${fail.length} failed`);
if (fail.length) process.exit(1);
