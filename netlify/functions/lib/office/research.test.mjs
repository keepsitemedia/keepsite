import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_TYPES, normalizeUrl, domainOf, classify, comparePair, describePair, pairKey, pairs, group, pageList, emptyStudy,
  pickResults, PICK_SOURCE, bookmarklet, normalizeQuery, validateCapture, findCaptureTargets, applyCapture, draftFromQuestionnaire, splitList,
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
  assert.equal(describePair(comparePair(A, B4), 8), 'Four of eight pages are the same. Two more businesses rank with a different page for each search. Most results are service pages.');
  const D = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://d${n}.com/p`, 'Directory'));
  const one = [D[0], r('https://d2.com/other', 'Directory'), ...[3, 4, 5, 6, 7, 8].map((n) => r(`https://x${n}.com`, 'Directory'))];
  assert.equal(describePair(comparePair(D, one), 8), 'One of eight pages is the same. One more business ranks with a different page for each search. Most results are directories.');
  const tie = comparePair([r('https://a.com/', 'Homepage')], [r('https://b.com/x', 'Service page')]);
  assert.equal(describePair(tie, 1), 'None of the pages are the same. No page type leads on either side.');
  assert.equal(describePair(comparePair([], []), 0), 'Nothing captured yet.');
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
