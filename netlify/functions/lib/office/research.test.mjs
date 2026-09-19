import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_TYPES, normalizeUrl, domainOf, businessOf, classify, comparePair, primaryPageOf, describePair, pairKey, pairs, group, pageList, emptyStudy, emptyRound, migrateStudy, openRound, roundOf, touch,
  pickResults, PICK_SOURCE, bookmarklet, searchUrl, researchSearchUrl, isSearchUrl, normalizeQuery, validateCapture, findCaptureTargets, applyCapture, draftFromQuestionnaire, splitList, isProfile,
} from './research.mjs';

const r = (url, pageType = 'Service page', title = 'T') => ({ url, title, domain: domainOf(url), pageType, typeSource: 'auto' });
const dr = (url, title = 'D') => ({ url, title, domain: domainOf(url), pageType: 'Directory', typeSource: 'auto' });

test('normalizeUrl folds the differences Google shows for one page', () => {
  assert.equal(normalizeUrl('https://www.Example.com/Weddings/?utm_source=x&gclid=1#top'), 'example.com/Weddings');
  assert.equal(normalizeUrl('http://example.com/weddings/?a=1'), 'example.com/weddings?a=1');
  assert.equal(normalizeUrl('https://example.com'), 'example.com');
  assert.equal(normalizeUrl('not a url'), 'not a url');
});

// Google mints a fresh srsltid for every impression, so the same page
// captured under two keywords arrives with two different URLs and the pair
// reads as "same business, different page" when it is one page.
test('normalizeUrl drops per-click tracking ids so one page stays one page', () => {
  const a = 'https://www.mariahannifinmakeup.com/?srsltid=AU7gw4UxJDWAbRl3ioiDb';
  const b = 'https://www.mariahannifinmakeup.com/?srsltid=AU7gw4YbQ2ZfLpVr8sKtN';
  assert.equal(normalizeUrl(a), normalizeUrl(b));
  assert.equal(normalizeUrl(a), 'mariahannifinmakeup.com');
  for (const p of ['gbraid', 'wbraid', 'dclid', 'msclkid', 'twclid', 'igshid', 'yclid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi']) {
    assert.equal(normalizeUrl(`https://x.com/a?${p}=1`), 'x.com/a', `${p} should be dropped`);
  }
});

// classify already folds index.html into the directory; normalizeUrl must
// agree, or the two disagree about what one URL means.
test('normalizeUrl folds index.html the way classify does', () => {
  assert.equal(normalizeUrl('https://x.com/index.html'), normalizeUrl('https://x.com/'));
  assert.equal(normalizeUrl('https://x.com/weddings/index.htm'), normalizeUrl('https://x.com/weddings'));
});

// A query that selects content is not tracking, and dropping it would merge
// two genuinely different pages.
test('normalizeUrl keeps a query that chooses the page', () => {
  assert.equal(normalizeUrl('https://x.com/shop?page=2'), 'x.com/shop?page=2');
  assert.equal(normalizeUrl('https://x.com/p?id=7&utm_source=g'), 'x.com/p?id=7');
});

test('domainOf drops www and keeps the rest', () => {
  assert.equal(domainOf('https://www.example.com/a'), 'example.com');
  assert.equal(domainOf('https://shop.example.com/a'), 'shop.example.com');
});

test('classify follows the rules in order', () => {
  const areas = ['Provo', 'Utah County'];
  assert.equal(classify({ url: 'https://www.yelp.com/search?find_desc=x', title: 'Best' }, areas), 'Directory');
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

test('comparePair gray zone and low, on the business ratio', () => {
  // x1-x4 are Homepage, tying B4 4-4 against the 4 Service pages carried
  // over from A: the tiebreaker only fires when a side actually leads, and
  // this test is about the ratio branch, not page type, so it must stay out
  // of the way.
  const B4 = [...A.slice(0, 4), r('https://x1.com', 'Homepage'), r('https://x2.com', 'Homepage'), r('https://x3.com', 'Homepage'), r('https://x4.com', 'Homepage')];
  const g = comparePair(A, B4);
  assert.equal(g.signal, 'gray');
  assert.equal(g.resolvedBy, undefined);
  assert.equal(g.read, 'GRAY ZONE: some of the same businesses rank for both. Review page types and client priorities.');
  assert.equal(g.action, 'Discuss on the client call before deciding whether to split.');

  // Same businesses, different pages: five domains match (still counted by
  // sameDomain, unchanged), but no URL does, so no business counts as shared
  // and the ratio is 0 — there is no "domain" branch to catch this anymore.
  const Bd = [1, 2, 3, 4, 5].map((n) => r(`https://a${n}.com/other`)).concat([r('https://y1.com'), r('https://y2.com'), r('https://y3.com')]);
  const d = comparePair(A, Bd);
  assert.equal(d.exactUrl, 0);
  assert.equal(d.sameDomain, 5);
  assert.equal(d.sameDomainDifferentPage, 5);
  assert.equal(d.signal, 'low');
  assert.equal(d.read, 'Low overlap: likely a meaningfully different intent.');
  assert.equal(d.action, 'Consider separate clusters/pages if page types also differ.');

  const Bn = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://z${n}.com/p`));
  const l = comparePair(A, Bn);
  assert.equal(l.read, 'Low overlap: likely a meaningfully different intent.');
  assert.equal(l.action, 'Consider separate clusters/pages if page types also differ.');
});

// Ratios, not counts: strip the directories and a SERP may hold only three or
// four businesses, so "seven of eight" stops meaning anything.
test('the ladder branches on the share of businesses in common', () => {
  // A alternates two types in a fixed 3-3 tie, so its leading type is
  // always 'Tie / review' and the page-type tiebreaker never fires here:
  // this test is about the ratio ladder alone.
  const biz = (n, from = 0) => Array.from({ length: n }, (_, i) => r(`https://b${i + from}.com/`, (i + from) % 2 === 0 ? 'Homepage' : 'Service page'));
  const pair = (shared, total) => comparePair(biz(total), [...biz(shared), ...biz(total - shared, 100)]);
  assert.equal(pair(6, 6).signal, 'strong');
  assert.equal(pair(4, 6).signal, 'strong');
  assert.equal(pair(3, 6).signal, 'gray');
  assert.equal(pair(2, 6).signal, 'gray');
  assert.equal(pair(1, 6).signal, 'low');
  assert.equal(pair(0, 6).signal, 'low');
});

// The reasoning an owner does by hand: matching SERP shape means one question.
test('page type resolves a gray pair, in both directions', () => {
  const at = (type, urls) => urls.map((u) => r(u, type));
  const same = comparePair(at('Homepage', ['https://a.com/', 'https://b.com/', 'https://x1.com/']), at('Homepage', ['https://a.com/', 'https://c.com/', 'https://x2.com/']));
  assert.equal(same.signal, 'strong');
  assert.equal(same.resolvedBy, 'type');

  const differ = comparePair(at('Homepage', ['https://a.com/', 'https://b.com/', 'https://x1.com/']), at('Blog/FAQ', ['https://a.com/', 'https://c.com/', 'https://x2.com/']));
  assert.equal(differ.signal, 'low');
  assert.equal(differ.resolvedBy, 'type');
});

// samePageType saturates and must not be what decides this.
test('the tiebreaker reads the leading type, not the overlap count', () => {
  // Only p.com is shared; q/s differ per side, so the business ratio (1 of
  // 3) lands in the gray band, even though every row's type still turns up
  // somewhere on the other side, which is what samePageType saturates on.
  const mixed = (lead, side) => [r('https://p.com/', lead), r(`https://q-${side}.com/`, lead), r(`https://s-${side}.com/`, lead), r('https://z.com/', 'Directory')];
  const c = comparePair(mixed('Homepage', 'a'), mixed('Blog/FAQ', 'b'));
  assert.ok(c.samePageType > 0, 'the saturating count still sees a match');
  assert.equal(c.resolvedBy, 'type');
  assert.equal(c.signal, 'low', 'but the leading types differ, so the pair separates');
});

// A directory-heavy field is the normal case for these searches, and the
// same directories rank on nearly every pair. If the tiebreaker read the raw
// arrays, 'Directory' would lead both sides of almost every gray pair — the
// exact constant the ratio was built to strip out — and this pair would
// wrongly resolve to strong instead of separating on what the businesses do.
test('the tiebreaker leads on the businesses, not the shared directories', () => {
  const directories = ['https://yelp.com/a', 'https://angi.com/a', 'https://thumbtack.com/a', 'https://bbb.org/a', 'https://facebook.com/a'].map((u) => dr(u));
  const a = [...directories, r('https://p.com/', 'Homepage'), r('https://q-a.com/', 'Homepage'), r('https://s-a.com/', 'Homepage')];
  const b = [...directories, r('https://p.com/', 'Blog/FAQ'), r('https://q-b.com/', 'Blog/FAQ'), r('https://s-b.com/', 'Blog/FAQ')];
  // The premise the fix addresses: read raw, both sides lead with Directory.
  assert.equal(primaryPageOf(a), 'Directory');
  assert.equal(primaryPageOf(b), 'Directory');
  const c = comparePair(a, b);
  assert.equal(c.resolvedBy, 'type');
  assert.equal(c.signal, 'low', 'the businesses lead with different types even though the directories agree');
});

test('page type cannot move a pair that was not gray', () => {
  const at = (type, urls) => urls.map((u) => r(u, type));
  const strong = comparePair(at('Homepage', ['https://a.com/', 'https://b.com/', 'https://c.com/']), at('Blog/FAQ', ['https://a.com/', 'https://b.com/', 'https://c.com/']));
  assert.equal(strong.signal, 'strong');
  assert.equal(strong.resolvedBy, undefined);
});

// Two or three businesses is too little to compute a share of. Saying so is
// more honest than dressing up noise as a measurement.
test('a pair with too few businesses is unmeasurable, not low', () => {
  const biz = (n) => Array.from({ length: n }, (_, i) => r(`https://b${i}.com/`));
  const c = comparePair(biz(2), biz(2));
  assert.equal(c.signal, 'unmeasurable');
  // Asserted on meaning (too few businesses), not on a word like "cannot"
  // that could vanish with a copy edit and leave this test blind.
  assert.match(c.read, /too few businesses/i);
});

test('unmeasurable never groups automatically', () => {
  const round = { ...emptyRound('r1'), keywords: [{ id: 'k1', text: 'one', cluster: 'C' }, { id: 'k2', text: 'two', cluster: 'C' }], serps: {} };
  const serp = (n) => ({ capturedAt: '2026-09-17T00:00:00.000Z', results: Array.from({ length: n }, (_, i) => ({ rank: i + 1, ...r(`https://b${i}.com/`) })), related: [] });
  round.serps.k1 = serp(2); round.serps.k2 = serp(2);
  assert.equal(pairs(round)[0].signal, 'unmeasurable');
  assert.equal(group(round).length, 2, 'two ungrouped keywords, not one page');
});

test('comparePair names the shared URLs and businesses the counts come from', () => {
  const B4 = [...A.slice(0, 4), r('https://a5.com/other'), r('https://x2.com'), r('https://x3.com'), r('https://x4.com')];
  const c = comparePair(A, B4);
  assert.deepEqual(c.sharedUrls, ['a1.com/p', 'a2.com/p', 'a3.com/p', 'a4.com/p']);
  assert.deepEqual(c.sharedDomains, ['a1.com', 'a2.com', 'a3.com', 'a4.com', 'a5.com']);
  assert.deepEqual(comparePair([], []).sharedUrls, []);
  // Two rows of A under one business still count twice, as in the workbook,
  // and the business is listed once.
  const twice = comparePair([r('https://a1.com/p'), r('https://a1.com/q')], [r('https://a1.com/z')]);
  assert.equal(twice.sameDomain, 2);
  assert.deepEqual(twice.sharedDomains, ['a1.com']);
});

test('describePair says what the counts mean in one line', () => {
  const B4 = [...A.slice(0, 4), r('https://a5.com/other'), r('https://a6.com/other'), r('https://x3.com'), r('https://x4.com')];
  // Eight businesses each side, four shared exactly, two more sharing a
  // domain but not a page: the business share, not the raw page count.
  assert.equal(describePair(comparePair(A, B4), 8), 'Four of eight businesses rank for both, with the same page. Two more businesses rank with a different page for each search. Most results are service pages.');
  const D = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://d${n}.com/p`, 'Directory'));
  const one = [D[0], r('https://d2.com/other', 'Directory'), ...[3, 4, 5, 6, 7, 8].map((n) => r(`https://x${n}.com`, 'Directory'))];
  // Both sides are all directories, so there are zero businesses to compare
  // and the pair is unmeasurable: the one shared directory is named apart,
  // never phrased as a share of businesses.
  assert.equal(describePair(comparePair(D, one), 8), 'Too few businesses rank for these searches to compare them. They also share one directory, which ranks for almost everything in a field. Most results are directories.');
  const tie = comparePair([r('https://a.com/', 'Homepage')], [r('https://b.com/x', 'Service page')]);
  // One business each side is below MIN_BUSINESSES, so this is unmeasurable
  // too, even though no directories are involved: the opener states the
  // effect (too few businesses), never a guessed directory-heavy cause.
  assert.equal(describePair(tie, 1), 'Too few businesses rank for these searches to compare them. No page type leads on either side.');
  assert.equal(describePair(comparePair([], []), 0), 'Nothing captured yet.');
});

test('describePair counts businesses, and names the directories apart', () => {
  const c = { signal: 'gray', sharedBusinesses: 2, sharedDirectories: 3, denominator: 4, exactUrl: 5, sameDomainDifferentPage: 0, primaryPage: 'Homepage' };
  const s = describePair(c, 8);
  assert.match(s, /Two of four businesses/);
  assert.match(s, /three directories/i);
});

test('describePair says plainly when it cannot measure', () => {
  const c = { signal: 'unmeasurable', sharedBusinesses: 1, sharedDirectories: 5, denominator: 2, exactUrl: 6, sameDomainDifferentPage: 0, primaryPage: 'Directory' };
  const s = describePair(c, 8);
  assert.match(s, /too few businesses rank for these searches to compare them/i);
  // No ratio may be quoted from two data points.
  assert.ok(!/of two businesses/.test(s));
});

test('describePair does not blame directories when none are shared', () => {
  // Sparse SERPs with zero directories still land in unmeasurable once
  // denominator is below MIN_BUSINESSES; the sentence must not assert a
  // directory-heavy cause it cannot see in this fixture.
  const c = { signal: 'unmeasurable', sharedBusinesses: 0, sharedDirectories: 0, denominator: 1, exactUrl: 0, sameDomainDifferentPage: 0, primaryPage: 'Service page' };
  const s = describePair(c, 8);
  assert.match(s, /too few businesses rank for these searches to compare them/i);
  assert.ok(!/directory|directories/i.test(s));
});

test('comparePair primary page is the mode across both lists, tie reviewed, empty blank', () => {
  const a = [r('https://a.com/', 'Homepage'), r('https://b.com/x', 'Service page')];
  const b = [r('https://c.com/', 'Homepage'), r('https://d.com/blog', 'Blog/FAQ')];
  assert.equal(comparePair(a, b).primaryPage, 'Homepage');
  assert.equal(comparePair([r('https://a.com/', 'Homepage')], [r('https://b.com/x', 'Service page')]).primaryPage, 'Tie / review');
  assert.equal(comparePair([], []).primaryPage, '');
  // Zero businesses on each side is zero to divide by, same as too few: unmeasurable, not a verdict of "low".
  assert.equal(comparePair([], []).read, 'Too few businesses rank for these searches to compare them.');
});

test('comparePair counts businesses and directories apart', () => {
  const a = [dr('https://yelp.com/a'), dr('https://weddingwire.com/b'), r('https://one.com/'), r('https://two.com/'), r('https://four.com/')];
  const b = [dr('https://yelp.com/a'), dr('https://theknot.com/c'), r('https://one.com/'), r('https://two.com/'), r('https://five.com/')];
  const c = comparePair(a, b);
  assert.equal(c.sharedBusinesses, 2);
  assert.equal(c.sharedDirectories, 1);
  assert.equal(c.businessesA, 3);
  assert.equal(c.businessesB, 3);
  assert.equal(c.denominator, 3);
  assert.equal(Number(c.ratio.toFixed(4)), Number((2 / 3).toFixed(4)));
  // The old numbers keep their old meanings, directories included.
  assert.equal(c.exactUrl, 3);
});

test('comparePair reports a null ratio when there is nothing to divide by', () => {
  const a = [dr('https://yelp.com/a')];
  const b = [dr('https://yelp.com/a')];
  const c = comparePair(a, b);
  assert.equal(c.denominator, 0);
  assert.equal(c.ratio, null);
});

test('pairKey sorts', () => {
  assert.equal(pairKey('k2', 'k1'), 'k1|k2');
});

test('emptyStudy is one open round and nothing else', () => {
  const s = emptyStudy('x', new Date('2026-09-17T00:00:00Z'));
  assert.deepEqual(Object.keys(s).sort(), ['createdAt', 'rounds', 'slug', 'updatedAt']);
  assert.equal(s.rounds.length, 1);
  const round = s.rounds[0];
  assert.equal(round.id, 'r1');
  assert.equal(round.closedAt, null);
  assert.deepEqual(round.keywords, []);
  assert.deepEqual(round.areas, []);
  assert.deepEqual(round.serps, {});
  assert.deepEqual(round.reads, {});
  assert.deepEqual(round.pages, []);
  assert.deepEqual(round.notes, { intro: '', closing: '' });
  assert.equal(round.reportedAt, null);
});

// Every document written before rounds existed is one round's worth of work.
test('migrateStudy wraps a legacy document into r1', () => {
  const legacy = {
    slug: 'x', createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z',
    areas: ['Provo'], keywords: [{ id: 'k1', text: 'one', cluster: 'C' }],
    serps: { k1: { capturedAt: '2026-09-13T00:00:00.000Z', results: [], related: [] } },
    reads: { 'k1|k2': { human: 'Same intent' } }, pages: [{ id: 'p1' }], reportedAt: '2026-09-14T00:00:00.000Z',
  };
  const s = migrateStudy(legacy, new Date('2026-09-17T00:00:00Z'));
  assert.deepEqual(Object.keys(s).sort(), ['createdAt', 'rounds', 'slug', 'updatedAt']);
  const round = s.rounds[0];
  assert.equal(round.id, 'r1');
  assert.equal(round.startedAt, '2026-09-13T00:00:00.000Z');
  assert.equal(round.closedAt, null);
  assert.deepEqual(round.areas, ['Provo']);
  assert.deepEqual(round.keywords, legacy.keywords);
  assert.deepEqual(round.serps, legacy.serps);
  assert.deepEqual(round.reads, legacy.reads);
  assert.deepEqual(round.pages, legacy.pages);
  assert.equal(round.reportedAt, '2026-09-14T00:00:00.000Z');
  assert.deepEqual(round.notes, { intro: '', closing: '' });
});

test('migrateStudy is a no-op on a document that already has rounds', () => {
  const once = migrateStudy({ slug: 'x', createdAt: 'a', updatedAt: 'b', rounds: [{ id: 'r1', serps: {} }] });
  assert.deepEqual(migrateStudy(once), once);
});

test('openRound is the last round and roundOf finds one by id', () => {
  const s = { slug: 'x', rounds: [{ id: 'r1' }, { id: 'r2' }] };
  assert.equal(openRound(s).id, 'r2');
  assert.equal(roundOf(s, 'r1').id, 'r1');
  assert.equal(roundOf(s, 'nope'), undefined);
});

// Named for what it returns, not what it stands in for: a round fixture,
// never a study — that conflation is exactly what this design prevents.
const round = () => {
  const r0 = {
    ...emptyRound('r1', new Date('2026-09-13T00:00:00Z')),
    keywords: [
      { id: 'k1', text: 'wedding florist provo', cluster: 'Weddings', arm: '', source: 'manual' },
      { id: 'k2', text: 'provo wedding flowers', cluster: 'Weddings', arm: '', source: 'manual' },
      { id: 'k3', text: 'funeral flowers provo', cluster: 'Sympathy', arm: '', source: 'manual' },
      { id: 'k4', text: 'not captured yet', cluster: 'Sympathy', arm: '', source: 'manual' },
    ],
  };
  const cap = (results) => ({ capturedAt: '2026-09-13T01:00:00Z', query: 'q', results, related: [] });
  r0.serps = { k1: cap(A), k2: cap(B7), k3: cap([1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://f${n}.com/p`))) };
  return r0;
};

test('pairs covers captured keywords only and carries the stored read', () => {
  const r = round();
  r.reads['k1|k2'] = { human: 'Same intent', sameCluster: 'Yes', notes: '' };
  const p = pairs(r);
  assert.deepEqual(p.map((x) => x.key), ['k1|k2', 'k1|k3', 'k2|k3']);
  assert.equal(p[0].signal, 'strong');
  assert.equal(p[0].read.human, 'Same intent');
  assert.equal(p[1].read, null);
});

// A strong pair already has an answer — the signal settled it — so there is
// no question to ask and decisive is null, not a verdict either way.
test('a strong pair is not a question', () => {
  const serp = (urls) => ({ capturedAt: '2026-09-17T00:00:00.000Z', results: urls.map((u, i) => ({ rank: i + 1, ...r(u) })), related: [] });
  const all = ['https://a.com/', 'https://b.com/', 'https://c.com/', 'https://d.com/'];
  const round = {
    ...emptyRound('r1'),
    keywords: [{ id: 'k1', text: 'one', cluster: 'C' }, { id: 'k2', text: 'two', cluster: 'C' }, { id: 'k3', text: 'three', cluster: 'C' }],
    serps: { k1: serp(all), k2: serp(all), k3: serp(all) },
  };
  for (const p of pairs(round)) {
    assert.equal(p.signal, 'strong', `${p.a.text} · ${p.b.text}`);
    assert.equal(p.decisive, null, `${p.a.text} · ${p.b.text}`);
  }
});

// The real case this feature exists for: a gray pair whose two keywords are
// already joined through a third, strong on both sides. The owner's answer
// on A-C cannot change the page list, so it reports false, not null — the
// question was asked of the signal, and the signal could answer it.
test('a gray pair already joined through a third keyword is not decisive', () => {
  const round = {
    ...emptyRound('r1'),
    keywords: [{ id: 'k1', text: 'A', cluster: 'C' }, { id: 'k2', text: 'B', cluster: 'C' }, { id: 'k3', text: 'C', cluster: 'C' }],
    serps: {
      // A-B: shares p,q of 3 -> 2/3, strong. B-C: shares q,s of 3 -> 2/3, strong.
      // A-C: shares only q of 3 -> 1/3, gray — but A and C are already one
      // group via B, so the gray answer changes nothing.
      k1: { capturedAt: '2026-09-17T00:00:00.000Z', related: [], results: [
        { rank: 1, ...r('https://p.com/', 'Service page') },
        { rank: 2, ...r('https://q.com/', 'Location page') },
        { rank: 3, ...r('https://r.com/', 'Homepage') },
      ] },
      k2: { capturedAt: '2026-09-17T00:00:00.000Z', related: [], results: [
        { rank: 1, ...r('https://p.com/') },
        { rank: 2, ...r('https://q.com/') },
        { rank: 3, ...r('https://s.com/') },
      ] },
      k3: { capturedAt: '2026-09-17T00:00:00.000Z', related: [], results: [
        { rank: 1, ...r('https://q.com/') },
        { rank: 2, ...r('https://s.com/') },
        { rank: 3, ...r('https://t.com/') },
      ] },
    },
  };
  const [ab, ac, bc] = pairs(round);
  assert.equal(ab.signal, 'strong');
  assert.equal(ab.decisive, null);
  assert.equal(bc.signal, 'strong');
  assert.equal(bc.decisive, null);
  assert.equal(ac.signal, 'gray');
  assert.equal(ac.decisive, false);
});

// decisiveFor calls group(), which must not recompute decisive for every
// other askable pair — that recursion is factorial in the number of
// simultaneously-gray pairs. Six keywords, all fifteen pairs gray and
// unread, is the shape that caught it: each keyword shares exactly one
// business with every other, so every pair sits at the 1/3 gray floor, and
// mixed page types keep the tiebreaker from resolving any of them away.
test('many simultaneous gray pairs resolve without recursing', () => {
  const kw = (n) => ({ id: `k${n}`, text: `kw${n}`, cluster: 'C' });
  const serpFor = (n) => ({
    capturedAt: '2026-09-17T00:00:00.000Z',
    related: [],
    results: [
      { rank: 1, ...r('https://shared.com/', 'Service page') },
      { rank: 2, ...r(`https://u${n}a.com/`, 'Location page') },
      { rank: 3, ...r(`https://u${n}b.com/`, 'Homepage') },
    ],
  });
  const round = {
    ...emptyRound('r1'),
    keywords: [1, 2, 3, 4, 5, 6].map(kw),
    serps: Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`k${n}`, serpFor(n)])),
  };
  const started = Date.now();
  const rows = pairs(round);
  const elapsed = Date.now() - started;
  // The recursion this guards against took 6.4s on four keywords and did not
  // finish on six. A bound this loose cannot flake, and anything approaching
  // it means the nesting is back.
  assert.ok(elapsed < 2000, `pairs() took ${elapsed}ms on six keywords; the decisive probe is recursing again`);
  assert.equal(rows.length, 15);
  // Nothing else joins any two of these keywords, so the owner's answer on
  // any one pair is the only thing that could merge it: every pair decides.
  for (const p of rows) {
    assert.equal(p.signal, 'gray', `${p.a.text} · ${p.b.text}`);
    assert.equal(p.decisive, true, `${p.a.text} · ${p.b.text}`);
  }
});

// decisiveFor used to recompute comparePair for every pair, twice, for every
// askable pair — measured 39ms at 10 keywords but 7.4s at 40, and ~25s on a
// directory-heavy real study, because comparePair does not depend on reads
// and was being redone anyway. Same shape as the six-keyword recursion test
// above, scaled to 40 keywords (780 pairs, all gray, all decisive), which is
// enough to have caught the old cost but not so much it flakes on a slow CI box.
test('pairs() computes comparePair once per pair, not once per probe', () => {
  const kw = (n) => ({ id: `k${n}`, text: `kw${n}`, cluster: 'C' });
  const serpFor = (n) => ({
    capturedAt: '2026-09-17T00:00:00.000Z',
    related: [],
    results: [
      { rank: 1, ...r('https://shared.com/', 'Service page') },
      { rank: 2, ...r(`https://u${n}a.com/`, 'Location page') },
      { rank: 3, ...r(`https://u${n}b.com/`, 'Homepage') },
    ],
  });
  const ids = Array.from({ length: 40 }, (_, i) => i + 1);
  const round = {
    ...emptyRound('r1'),
    keywords: ids.map(kw),
    serps: Object.fromEntries(ids.map((n) => [`k${n}`, serpFor(n)])),
  };
  const started = Date.now();
  const rows = pairs(round);
  const elapsed = Date.now() - started;
  assert.equal(rows.length, 780);
  for (const p of rows) {
    assert.equal(p.signal, 'gray', `${p.a.text} · ${p.b.text}`);
    assert.equal(p.decisive, true, `${p.a.text} · ${p.b.text}`);
  }
  assert.ok(elapsed < 3000, `pairs() took ${elapsed}ms on 40 keywords; comparePair is being recomputed per probe again`);
});

test('a pair that would split the page list is decisive', () => {
  // Mixed page types on both sides so there is no leading type to settle the
  // tie (see comparePair's tiebreaker) and the ratio alone decides: gray.
  const round = {
    ...emptyRound('r1'),
    keywords: [{ id: 'k1', text: 'one', cluster: 'C' }, { id: 'k2', text: 'two', cluster: 'C' }],
    serps: {
      k1: { capturedAt: '2026-09-17T00:00:00.000Z', related: [], results: [
        { rank: 1, ...r('https://a.com/', 'Service page') },
        { rank: 2, ...r('https://b.com/', 'Location page') },
        { rank: 3, ...r('https://x.com/', 'Homepage') },
      ] },
      k2: { capturedAt: '2026-09-17T00:00:00.000Z', related: [], results: [
        { rank: 1, ...r('https://a.com/', 'Service page') },
        { rank: 2, ...r('https://c.com/', 'Location page') },
        { rank: 3, ...r('https://y.com/', 'Homepage') },
      ] },
    },
  };
  const [p] = pairs(round);
  assert.equal(p.signal, 'gray');
  assert.equal(p.decisive, true);
});

// Same pair, same shape, but k1 is now claimed by a hand-edited page. Once
// pageList sets that page aside, k1 never re-enters grouping — the owner's
// answer on k1-k2 cannot change the page list either way, so this must
// report false, not true. Regression test for 22a2dab, which swapped
// decisiveFor's pageList() calls for groupFrom(), skipping the kept/claimed
// filtering entirely.
test('a gray pair is not decisive when one keyword is claimed by a hand-edited page', () => {
  const round = {
    ...emptyRound('r1'),
    keywords: [{ id: 'k1', text: 'one', cluster: 'C' }, { id: 'k2', text: 'two', cluster: 'C' }],
    serps: {
      k1: { capturedAt: '2026-09-17T00:00:00.000Z', related: [], results: [
        { rank: 1, ...r('https://a.com/', 'Service page') },
        { rank: 2, ...r('https://b.com/', 'Location page') },
        { rank: 3, ...r('https://x.com/', 'Homepage') },
      ] },
      k2: { capturedAt: '2026-09-17T00:00:00.000Z', related: [], results: [
        { rank: 1, ...r('https://a.com/', 'Service page') },
        { rank: 2, ...r('https://c.com/', 'Location page') },
        { rank: 3, ...r('https://y.com/', 'Homepage') },
      ] },
    },
    pages: [{ id: 'p9', title: 'Hand-edited', type: 'Service page', keywords: ['k1'], note: 'client asked', auto: false }],
  };
  const [p] = pairs(round);
  assert.equal(p.signal, 'gray');
  assert.equal(p.decisive, false);
});

test('a pair that already has a read is not asked about again', () => {
  const serp = (urls) => ({ capturedAt: '2026-09-17T00:00:00.000Z', results: urls.map((u, i) => ({ rank: i + 1, ...r(u) })), related: [] });
  const round = {
    ...emptyRound('r1'),
    keywords: [{ id: 'k1', text: 'one', cluster: 'C' }, { id: 'k2', text: 'two', cluster: 'C' }],
    serps: {
      k1: serp(['https://a.com/', 'https://b.com/', 'https://x.com/']),
      k2: serp(['https://a.com/', 'https://c.com/', 'https://y.com/']),
    },
    reads: { 'k1|k2': { human: 'Same intent', sameCluster: 'Yes', notes: '' } },
  };
  assert.equal(pairs(round)[0].decisive, null);
});

test('group joins strong pairs, honours No and Yes, leaves uncaptured out', () => {
  const r = round();
  let g = group(r);
  assert.deepEqual(g.map((x) => x.keywords), [['k1', 'k2'], ['k3']]);
  assert.equal(g[0].title, 'wedding florist provo');
  assert.equal(g[0].type, 'Service page');
  assert.equal(g[0].auto, true);

  r.reads['k1|k2'] = { human: 'Different intent', sameCluster: 'No', notes: '' };
  g = group(r);
  assert.deepEqual(g.map((x) => x.keywords), [['k1'], ['k2'], ['k3']]);

  r.reads['k1|k2'] = { human: 'Same intent', sameCluster: 'Undecided', notes: '' };
  r.reads['k1|k3'] = { human: 'Probably same', sameCluster: 'Yes', notes: '' };
  g = group(r);
  assert.deepEqual(g.map((x) => x.keywords), [['k1', 'k2', 'k3']]);
});

test('pageList keeps an edited row and regroups the rest', () => {
  const r = round();
  r.pages = [{ id: 'p9', title: 'Sympathy flowers', type: 'Service page', keywords: ['k3'], note: 'client asked', auto: false }];
  const list = pageList(r);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'p9');
  assert.deepEqual(list[1].keywords, ['k1', 'k2']);
  assert.equal(list[1].auto, true);
  // A keyword claimed by an edited row is not regrouped, even if strong.
  r.pages = [{ id: 'p9', title: 'One', type: 'Service page', keywords: ['k1'], note: '', auto: false }];
  assert.deepEqual(pageList(r).map((x) => x.keywords), [['k1'], ['k2'], ['k3']]);
});

test('touch recomputes the open round and leaves closed rounds alone', () => {
  const closed = { ...emptyRound('r1'), closedAt: '2026-01-01T00:00:00.000Z', pages: [{ id: 'frozen' }] };
  const open = { ...emptyRound('r2'), keywords: [{ id: 'k1', text: 'one', cluster: 'C' }], serps: {} };
  const s = { slug: 'x', createdAt: 'a', updatedAt: 'a', rounds: [closed, open] };
  const next = touch(s, new Date('2026-09-17T00:00:00Z'));
  assert.equal(next.updatedAt, '2026-09-17T00:00:00.000Z');
  assert.deepEqual(next.rounds[0].pages, [{ id: 'frozen' }]);
  assert.deepEqual(next.rounds[1].pages, []);
});

test('emptyStudy has the spec shape', () => {
  const s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  assert.deepEqual(Object.keys(s), ['slug', 'createdAt', 'updatedAt', 'rounds']);
  assert.equal(s.createdAt, '2026-09-13T00:00:00.000Z');
  assert.deepEqual(PAGE_TYPES, ['Homepage', 'Service page', 'Location page', 'Directory', 'Blog/FAQ', 'Portfolio/Gallery', 'About page', 'Other']);
});

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

test('searchUrl spells the one search the handler will open', () => {
  assert.equal(searchUrl('  wedding florist provo '), 'https://www.google.com/search?q=wedding%20florist%20provo');
  assert.equal(searchUrl('roof repair & gutters'), 'https://www.google.com/search?q=roof%20repair%20%26%20gutters');
  assert.equal(researchSearchUrl('wedding florist'), 'ks-research:https://www.google.com/search?q=wedding%20florist');
});

// The rule the PowerShell handler mirrors: anything it would refuse to open,
// this refuses too, so the two stay arguable against one another.
test('isSearchUrl accepts a Google search and nothing else', () => {
  assert.equal(isSearchUrl(searchUrl('x')), true);
  assert.equal(isSearchUrl('https://www.google.com/search?q='), true);
  assert.equal(isSearchUrl('https://www.google.com.evil.test/search?q=x'), false);
  assert.equal(isSearchUrl('http://www.google.com/search?q=x'), false);
  assert.equal(isSearchUrl('https://google.com/search?q=x'), false);
  assert.equal(isSearchUrl('file:///C:/Windows/System32/calc.exe'), false);
  assert.equal(isSearchUrl('--headless'), false);
  assert.equal(isSearchUrl(''), false);
});

test('the bookmarklet names the cause when Google hides the addresses', () => {
  const code = decodeURIComponent(bookmarklet('https://x.test').slice('javascript:'.length));
  assert.ok(code.includes("'/goto'"));
  assert.ok(code.includes('research account'));
  assert.ok(code.includes('skipped'));
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

test('findCaptureTargets matches keywords in the open round, across studies', () => {
  const study = {
    slug: 'x',
    rounds: [
      { ...emptyRound('r1'), closedAt: 'x', keywords: [{ id: 'old', text: 'gone away' }] },
      { ...emptyRound('r2'), keywords: [{ id: 'k1', text: 'Wedding Florist' }] },
    ],
  };
  const other = { slug: 'beta', rounds: [{ ...emptyRound('r1'), keywords: [{ id: 'k9', text: 'wedding  florist ' }, { id: 'k8', text: 'other' }] }] };
  assert.deepEqual(findCaptureTargets([study, other], ' wedding  florist '), [
    { slug: 'x', keywordId: 'k1', text: 'Wedding Florist' },
    { slug: 'beta', keywordId: 'k9', text: 'wedding  florist ' },
  ]);
  assert.deepEqual(findCaptureTargets([study, other], 'gone away'), []);
});

test('applyCapture stores a classified snapshot and refreshes the auto pages', () => {
  const s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.rounds[0] = { ...s.rounds[0], areas: ['Provo'], keywords: [{ id: 'k1', text: 'x', cluster: 'C', arm: '', source: 'manual' }] };
  const out = applyCapture(s, 'k1', { q: 'x', results: [{ rank: 1, url: 'https://a.com/provo/', title: 'A' }], related: ['y'] }, new Date('2026-09-14T00:00:00Z'));
  const round = openRound(out);
  assert.equal(round.serps.k1.capturedAt, '2026-09-14T00:00:00.000Z');
  assert.equal(round.serps.k1.results[0].pageType, 'Location page');
  assert.equal(round.serps.k1.results[0].domain, 'a.com');
  assert.equal(round.serps.k1.results[0].typeSource, 'auto');
  assert.deepEqual(round.serps.k1.related, ['y']);
  assert.equal(round.pages.length, 1);
  assert.equal(out.updatedAt, '2026-09-14T00:00:00.000Z');
});

test('applyCapture files into the open round only', () => {
  const closed = { ...emptyRound('r1'), closedAt: '2026-01-01T00:00:00.000Z', keywords: [{ id: 'k1', text: 'one', cluster: 'C' }], serps: {} };
  const open = { ...emptyRound('r2'), keywords: [{ id: 'k1', text: 'one', cluster: 'C' }] };
  const s = { slug: 'x', createdAt: 'a', updatedAt: 'a', rounds: [closed, open] };
  const next = applyCapture(s, 'k1', { q: 'one', results: [{ rank: 1, url: 'https://a.com/x', title: 'A' }], related: [] }, new Date('2026-09-17T00:00:00Z'));
  assert.deepEqual(next.rounds[0].serps, {});
  assert.equal(next.rounds[1].serps.k1.results[0].url, 'https://a.com/x');
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

// A social profile is that business's page on someone else's domain. Two
// different Instagram accounts are two different artists, not one directory.
test('businessOf names a social profile by its handle and everything else by its domain', () => {
  assert.equal(businessOf('https://www.instagram.com/dianaelizabethbeauty/'), 'instagram.com/dianaelizabethbeauty');
  assert.equal(businessOf('https://www.instagram.com/MarisaRoseMPH/?hl=en'), 'instagram.com/marisarosemph');
  assert.equal(businessOf('https://www.instagram.com/p/C8xyz/'), 'instagram.com');
  assert.equal(businessOf('https://www.instagram.com/reel/C8xyz/'), 'instagram.com');
  assert.equal(businessOf('https://www.facebook.com/SimplyMindyHair/'), 'facebook.com/simplymindyhair');
  assert.equal(businessOf('https://www.facebook.com/groups/utahweddings/posts/123/'), 'facebook.com');
  assert.equal(businessOf('https://www.facebook.com/share/p/abc/'), 'facebook.com');
  assert.equal(businessOf('https://www.tiktok.com/@meshechbridal/video/7'), 'tiktok.com/@meshechbridal');
  assert.equal(businessOf('https://www.mariahannifinmakeup.com/bridal/'), 'mariahannifinmakeup.com');
  assert.equal(businessOf('https://www.reddit.com/r/SaltLakeCity/comments/x/'), 'reddit.com');
});

test('classify treats a social profile as a homepage and a post or group as a directory', () => {
  assert.equal(classify({ url: 'https://www.instagram.com/dianaelizabethbeauty/', title: 'Hairstylist (@dianaelizabethbeauty)' }), 'Homepage');
  assert.equal(classify({ url: 'https://www.facebook.com/SimplyMindyHair/', title: 'Simply Mindy Hair & Makeup Artistry' }), 'Homepage');
  assert.equal(classify({ url: 'https://www.tiktok.com/@meshechbridal', title: 'MESHECH Bridal' }), 'Homepage');
  assert.equal(classify({ url: 'https://www.instagram.com/p/C8xyz/', title: 'A wedding at @lacailleutah' }), 'Directory');
  assert.equal(classify({ url: 'https://www.facebook.com/groups/utahweddings/posts/123/', title: 'Looking for makeup artist suggestions' }), 'Directory');
  assert.equal(classify({ url: 'https://www.reddit.com/r/SaltLakeCity/comments/x/', title: 'Wedding makeup and hair' }), 'Directory');
});

test('comparePair tells two social profiles apart and counts a shared one as a business', () => {
  const ig = (h) => r(`https://www.instagram.com/${h}/`, 'Homepage');
  const a = [ig('diana'), ig('marisa'), r('https://x.com/'), r('https://y.com/'), dr('https://www.weddingwire.com/utah')];
  const b = [ig('diana'), ig('sarah'), r('https://x.com/'), r('https://z.com/'), dr('https://www.weddingwire.com/utah')];
  const c = comparePair(a, b);
  assert.equal(c.businessesA, 4);
  assert.equal(c.sharedBusinesses, 2, 'diana and x.com, not marisa/sarah');
  assert.equal(c.sameDomain, 3, 'two profiles on one host are not one business');
  assert.deepEqual(c.sharedDomains.sort(), ['instagram.com/diana', 'weddingwire.com', 'x.com']);
});

test('migrateStudy reclassifies auto-typed results with the current rules and leaves edits alone', () => {
  const study = emptyStudy('s');
  const round = openRound(study);
  round.keywords = [{ id: 'k1', text: 'utah bridal makeup' }];
  round.serps.k1 = { capturedAt: '2026-09-17T00:00:00Z', query: 'q', results: [
    { rank: 1, url: 'https://www.instagram.com/diana/', title: 'Diana', domain: 'instagram.com', pageType: 'Directory', typeSource: 'auto' },
    { rank: 2, url: 'https://www.instagram.com/p/abc/', title: 'A post', domain: 'instagram.com', pageType: 'Directory', typeSource: 'auto' },
    { rank: 3, url: 'https://www.instagram.com/marisa/', title: 'Marisa', domain: 'instagram.com', pageType: 'Directory', typeSource: 'manual' },
  ] };
  const out = openRound(migrateStudy(study)).serps.k1.results;
  assert.equal(out[0].pageType, 'Homepage');
  assert.equal(out[0].domain, 'instagram.com/diana');
  assert.equal(out[1].pageType, 'Directory');
  assert.equal(out[1].domain, 'instagram.com');
  assert.equal(out[2].pageType, 'Directory', 'a manual edit is the owner\'s call');
  assert.equal(out[2].domain, 'instagram.com/marisa', 'but the business name still follows the URL');
});

test('applyCapture stores the business, not just the host', () => {
  const study = emptyStudy('s');
  openRound(study).keywords = [{ id: 'k1', text: 'q' }];
  const out = applyCapture(study, 'k1', { q: 'q', results: [{ url: 'https://www.instagram.com/diana/', title: 'Diana' }] });
  const [row] = openRound(out).serps.k1.results;
  assert.equal(row.domain, 'instagram.com/diana');
  assert.equal(row.pageType, 'Homepage');
});

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
  assert.equal(businessOf('https://www.theknot.com/marketplace/top-10-photographers'), 'theknot.com');
  assert.equal(isProfile('https://www.yelp.com/biz/x'), true);
  assert.equal(isProfile('https://www.yelp.com/search'), false);
});

test('classify keeps a vendor profile a Homepage and a listing-site list a Directory', () => {
  assert.equal(classify({ url: 'https://www.yelp.com/biz/x', title: 'X' }), 'Homepage');
  assert.equal(classify({ url: 'https://www.weddingwire.com/c/ut-utah/x', title: 'Best Makeup' }), 'Directory');
  assert.equal(classify({ url: 'https://www.theknot.com/marketplace/x-provo-ut-12345', title: 'X' }), 'Homepage');
  assert.equal(classify({ url: 'https://www.theknot.com/marketplace/beauty-services-provo-ut', title: 'Beauty' }), 'Directory');
});
