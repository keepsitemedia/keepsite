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
