import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAGE_TYPES, normalizeUrl, domainOf, businessOf, classify, comparePair, describePair, pairKey, pageList, pagesOf, studyView, confidenceWords, titleOf, emptyStudy, emptyRound, migrateStudy, openRound, roundOf, touch,
  pickResults, PICK_SOURCE, bookmarklet, searchUrl, researchSearchUrl, isSearchUrl, uule, localResults, suggestedSearches, normalizeQuery, validateCapture, findCaptureTargets, applyCapture, draftFromQuestionnaire, splitList, isProfile,
  rankWeight, matrix, similarity, similarities, CUT, cluster, confidence, reasonOf, band, OWN_PAGE_VOLUME,
  KINDS, FLOOR, homeAreas, kindOf, keptApartPairs, decodeCsv, parseVolumeCsv, applyVolume, applyNoVolume, standingOf,
} from './research.mjs';

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
  // Every read recomputes the off-area flag, so a legacy capture gains one.
  assert.deepEqual(round.serps, { k1: { ...legacy.serps.k1, local: false } });
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

// The structure of Google's scheme, not a remembered example: a fixed prefix,
// the canonical name's byte length as one character, then that name.
test('uule spells the location the way Google does', () => {
  const u = uule('Utah, United States');
  assert.ok(u.startsWith('w+CAIQICI'), u);
  assert.equal(u[9], 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[18], 'the length character stands for 18 bytes');
  assert.equal(Buffer.from(u.slice(10), 'base64').toString('utf8'), 'Utah,United States');
  assert.equal(uule('  Utah,   United States  '), u, 'the canonical form is trimmed and its commas closed up');
  assert.equal(uule(''), '');
  assert.equal(uule(null), '');
});

test('searchUrl carries the study location and researchSearchUrl passes it on', () => {
  assert.ok(searchUrl('x', 'Utah, United States').includes('&uule=w%2BCAIQICI'));
  assert.equal(searchUrl('x', ''), 'https://www.google.com/search?q=x');
  assert.ok(researchSearchUrl('x', 'Utah, United States').startsWith('ks-research:https://www.google.com/search?q=x&uule='));
});

// The rule the PowerShell handler mirrors: anything it would refuse to open,
// this refuses too, so the two stay arguable against one another.
test('isSearchUrl accepts a Google search and nothing else', () => {
  assert.equal(isSearchUrl(searchUrl('x')), true);
  assert.equal(isSearchUrl(searchUrl('x', 'Utah, United States')), true);
  assert.equal(isSearchUrl('https://www.google.com/search?q='), true);
  assert.equal(isSearchUrl('https://www.google.com/search?q=x&uule=abc-_%2B/='), true);
  assert.equal(isSearchUrl('https://www.google.com/search?q=x&uule=a b'), false);
  assert.equal(isSearchUrl('https://www.google.com/search?q=x&uule=a"b'), false);
  assert.equal(isSearchUrl('https://www.google.com/search?q=x\n'), false, 'a trailing newline is whitespace, not the end of the string');
  // `&` and `=` are part of a query value, so both sides read a further
  // parameter as more query rather than refusing it. What the rule is for is
  // the browser's command line, and nothing there can be reached without a
  // space or a character outside the set.
  assert.equal(isSearchUrl('https://www.google.com/search?q=x&hl=en'), true);
  assert.equal(isSearchUrl('https://www.google.com/search?q=x&path=C:\\Windows'), false);
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
  assert.equal(validateCapture(JSON.stringify({ ...good, uule: 'w+CAIQICIS' })).value.uule, 'w+CAIQICIS');
  assert.equal(validateCapture(JSON.stringify(good)).value.uule, '', 'a capture without one carries no location');
  assert.match(validateCapture(JSON.stringify({ ...good, uule: 'x'.repeat(201) })).errors[0], /too long/);
});

test('the bookmarklet sends back the location Google searched from', () => {
  const code = decodeURIComponent(bookmarklet('https://x.test').slice('javascript:'.length));
  assert.ok(code.includes("get('uule')"));
  assert.ok(code.includes('picked.uule=uule'));
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

test('localResults asks whether anyone from around here ranks', () => {
  const serp = (urls, location = '') => ({ location, results: urls.map((url) => ({ url, title: url })) });
  assert.equal(localResults(serp(['https://a.com/provo-makeup/']), ['Provo']), true);
  assert.equal(localResults(serp(['https://a.com/'], 'Utah, United States'), []), false);
  assert.equal(localResults(serp(['https://a.com/'], 'Utah, United States'), ['Provo']), false);
  assert.equal(localResults({ ...serp(['https://a.com/x'], 'Utah, United States'), results: [{ url: 'https://a.com/x', title: 'Makeup in Utah' }] }, []), true, 'a title names the place as well as a URL');
  assert.equal(localResults(serp(['https://a.com/'], 'Provo, Utah'), []), false, 'the location names the place it searched from first');
  assert.equal(localResults(serp(['https://a.com/provo/'], 'Provo, Utah'), []), true);
  assert.equal(localResults(serp(['https://a.com/']), []), null, 'nothing to recognise an area by');
  assert.equal(localResults(serp(['https://moabites.com/']), ['Moab']), false, 'whole words only');
});

test('applyCapture records where it searched from and whether the results are local', () => {
  const study = emptyStudy('s');
  study.rounds[0] = { ...study.rounds[0], areas: ['Provo'], location: 'Utah, United States', keywords: [{ id: 'k1', text: 'q' }, { id: 'k2', text: 'r' }] };
  let out = applyCapture(study, 'k1', { q: 'q', results: [{ url: 'https://a.com/provo/', title: 'A' }], related: [], uule: 'w+CAIQICISUtah' });
  let serp = openRound(out).serps.k1;
  assert.equal(serp.location, 'Utah, United States');
  assert.equal(serp.uule, 'w+CAIQICISUtah');
  assert.equal(serp.local, true);
  out = applyCapture(out, 'k2', { q: 'r', results: [{ url: 'https://denver.example/', title: 'Denver' }], related: [] });
  serp = openRound(out).serps.k2;
  assert.equal(serp.uule, '', 'a capture that carried no location parameter says so');
  assert.equal(serp.local, false);
  // The flag follows the areas list, so adding an area answers the question
  // for captures already taken.
  out.rounds[0] = { ...openRound(out), areas: ['Denver'] };
  assert.equal(openRound(migrateStudy(out)).serps.k2.local, true);
});

test('applyCapture files into the open round only', () => {
  const closed = { ...emptyRound('r1'), closedAt: '2026-01-01T00:00:00.000Z', keywords: [{ id: 'k1', text: 'one', cluster: 'C' }], serps: {} };
  const open = { ...emptyRound('r2'), keywords: [{ id: 'k1', text: 'one', cluster: 'C' }] };
  const s = { slug: 'x', createdAt: 'a', updatedAt: 'a', rounds: [closed, open] };
  const next = applyCapture(s, 'k1', { q: 'one', results: [{ rank: 1, url: 'https://a.com/x', title: 'A' }], related: [] }, new Date('2026-09-17T00:00:00Z'));
  assert.deepEqual(next.rounds[0].serps, {});
  assert.equal(next.rounds[1].serps.k1.results[0].url, 'https://a.com/x');
});

test('suggestedSearches counts what Google offered beside the searches we ran', () => {
  const round = { ...emptyRound('r1'), keywords: [{ id: 'k1', text: 'bridal makeup' }, { id: 'k2', text: 'wedding makeup' }, { id: 'k3', text: 'never captured' }],
    serps: {
      k1: { related: ['Bridal Hair', 'airbrush makeup', 'wedding makeup', 'bridal hair'] },
      k2: { related: ['bridal hair', 'airbrush makeup'] },
    } };
  assert.deepEqual(suggestedSearches(round), [
    { text: 'airbrush makeup', count: 2 },
    { text: 'Bridal Hair', count: 2 },
  ], 'a phrase already on the list is left out, and a tie is alphabetical');
  round.serps.k2.related.push('lash extensions');
  assert.deepEqual(suggestedSearches(round).map((x) => x.text), ['airbrush makeup', 'Bridal Hair', 'lash extensions'], 'the commonest first');
  assert.deepEqual(suggestedSearches({ ...emptyRound('r1'), keywords: [], serps: {} }), []);
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

// A page row saved before this spec carries `type`, not `kind`; pageList
// reads `kind`, so a legacy Homepage row would otherwise fail its "already
// have a Homepage" check and get a second one built alongside it.
test('migrateStudy maps a legacy page row\'s type to kind and drops type', () => {
  const study = emptyStudy('s');
  const round = openRound(study);
  round.pages = [
    { id: 'p1', title: 'Old article', type: 'Blog/FAQ', keywords: ['k1'], note: '', auto: false },
    { id: 'p2', title: 'Old directory', type: 'Directory', keywords: ['k2'], note: '', auto: true },
  ];
  const [p1, p2] = openRound(migrateStudy(study)).pages;
  assert.equal(p1.kind, 'Article');
  assert.equal(p1.type, undefined);
  assert.equal(p2.kind, 'Other');
  assert.equal(p2.type, undefined);
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
  assert.match(list[0].reason, /^Three of the same businesses come up for both of these/);
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

// A close call is two searches the evidence could not tell apart, so it folds
// into the page it is close to. The matrix and the square are the whole study,
// so the edited page an auto row is measured against is a page it can fold into.
const closeCall = (a = {}, b = {}) => roundWith({
  kx: { text: 'edited', urls: ['https://a.com/', 'https://b1.com/', 'https://b2.com/', 'https://b3.com/'], ...a },
  ky: { text: 'clustered', urls: ['https://a.com/', 'https://c1.com/', 'https://c2.com/', 'https://c3.com/'], ...b },
});

test('a close call of the same kind folds into the page it is close to', () => {
  const round = closeCall();
  const list = pageList(round);
  assert.equal(list.length, 1, 'two close calls come out as one page');
  const [row] = list;
  assert.deepEqual(row.keywords.slice().sort(), ['kx', 'ky']);
  assert.deepEqual(row.folded.map((f) => [f.title, f.into, f.keywords]), [['edited', 'clustered', ['kx']]]);
  assert.equal(row.keptApart, undefined);
});

// The page answers more searches than its reason was written for, and the
// singleton sentence would still be sitting above a list of ten.
test('a page that takes in a fold says why the searches it now answers belong together', () => {
  const [row] = pageList(closeCall());
  assert.deepEqual(row.keywords.slice().sort(), ['kx', 'ky']);
  assert.match(row.reason, /both of these/);
  assert.ok(!/needs a page of its own|not enough to share a page/.test(row.reason), row.reason);
});

test('a close call of a different kind is kept apart and says which page from', () => {
  const round = closeCall({}, { text: 'soft glam vs full glam' });
  const list = pageList(round);
  assert.equal(list.length, 2, 'an article and a service page are different kinds of page');
  assert.deepEqual(list.map((p) => p.kind), ['Homepage', 'Article']);
  assert.equal(list[0].keptApart, 'soft glam vs full glam');
  assert.equal(list[0].keptApartWhy, 'kind');
  assert.equal(list[1].keptApart, 'edited');
  assert.ok(list.every((p) => p.folded === undefined));
});

// Two rows that name each other are one decision. Said from the smaller side,
// so the page the site is built around is never the one kept separate.
test('keptApartPairs says a mutual split once, from the smaller page', () => {
  const head = { id: 'p1', title: 'Head', keywords: ['a', 'b', 'c'], keptApart: 'Small', keptApartWhy: 'kind' };
  const small = { id: 'p2', title: 'Small', keywords: ['d'], keptApart: 'Head', keptApartWhy: 'kind' };
  const lone = { id: 'p3', title: 'Lone', keywords: ['e'], keptApart: 'Head', keptApartWhy: 'volume' };
  const plain = { id: 'p4', title: 'Plain', keywords: ['f'] };
  assert.deepEqual(keptApartPairs([head, small, plain]).map((p) => p.id), ['p2']);
  assert.deepEqual(keptApartPairs([head, small, lone, plain]).map((p) => p.id), ['p2', 'p3'], 'a one-sided split is still said');
  // A tie in size is said by the later row, so the row a page was measured
  // against is the one named.
  const a = { id: 'pa', title: 'A', keywords: ['x'], keptApart: 'B' };
  const b = { id: 'pb', title: 'B', keywords: ['y'], keptApart: 'A' };
  assert.deepEqual(keptApartPairs([a, b]).map((p) => p.id), ['pb']);
  assert.deepEqual(keptApartPairs([plain]), []);
});

test('a close call that draws enough searches of its own keeps its page', () => {
  const round = closeCall();
  for (const k of round.keywords) k.volume = { min: OWN_PAGE_VOLUME, max: OWN_PAGE_VOLUME, source: 'planner', at: 'x' };
  const list = pageList(round);
  assert.equal(list.length, 2);
  assert.equal(list[0].keptApart, 'clustered');
  assert.equal(list[0].keptApartWhy, 'volume');
  round.keywords.forEach((k) => { k.volume = { min: 0, max: OWN_PAGE_VOLUME - 1, source: 'planner', at: 'x' }; });
  assert.equal(pageList(round).length, 1, 'one search short of the threshold folds in');
});

test('an edited page takes in the close call that names it, and gives it back', () => {
  const round = closeCall();
  round.pages = [{ id: 'p9', title: 'Edited', kind: 'Service page', keywords: ['kx'], note: '', auto: false }];
  const list = pageList(round);
  assert.deepEqual(list.map((p) => p.id), ['p9'], 'the auto row folded into the edited one');
  assert.deepEqual(list[0].keywords, ['kx', 'ky']);
  assert.deepEqual(list[0].folded, [{ title: 'clustered', into: 'Edited', keywords: ['ky'] }]);
  assert.deepEqual(round.pages[0].keywords, ['kx'], 'the row the owner saved is untouched');
  // touch() stores the list it is given, so the next read starts from the grown
  // row: it must hand the lent keyword back before regrouping, or the edited
  // page would swallow it for good.
  const again = pageList({ ...round, pages: list });
  assert.deepEqual(again[0].keywords, ['kx', 'ky']);
  assert.deepEqual(again[0].folded, [{ title: 'clustered', into: 'Edited', keywords: ['ky'] }]);
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

// A study can cluster into nothing but Articles, with no Service page to
// promote; the site still needs exactly one Homepage.
test('pageList still names a Homepage when every clustered row is an Article', () => {
  const round = roundWith({
    k1: { text: 'soft glam vs full glam', urls: ['https://a.com/'] },
    k2: { text: 'how much does bridal makeup cost', urls: ['https://b.com/'] },
  });
  const list = pageList(round);
  assert.ok(list.every((p) => p.kind === 'Article' || p.kind === 'Homepage'));
  assert.equal(list.filter((p) => p.kind === 'Homepage').length, 1);
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
  // An uncaptured pair is nothing to compare, not a verdict of "different",
  // and one captured side is no more comparable than none.
  const uncaptured = comparePair(round, 'k4', 'k5');
  assert.equal(uncaptured.total, 0);
  assert.equal(describePair(uncaptured), 'Nothing captured yet.');
  const oneSided = comparePair(round, 'k1', 'k5');
  assert.equal(oneSided.total, 0);
  assert.equal(describePair(oneSided), 'Nothing captured yet.');
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
  // assert.ok on every lookup before comparing pages, so a keyword text that
  // does not exist in the fixture cannot pass by both sides finding nothing.
  const at = (text) => { assert.ok(pageOf(text), text); return pageOf(text); };
  // Pinned to CUT = 0.12 and OWN_PAGE_VOLUME on this fixture: the cut says what
  // clusters, the fold rule says which close call keeps a page of its own.
  // Update together with either.
  assert.equal(list.length, 11);
  const head = ['utah bridal makeup artist', 'utah wedding makeup artist', 'wedding hair and makeup utah', 'utah bridal hair and makeup artist'].map(at);
  assert.equal(new Set(head).size, 1, 'the head terms share one page');
  assert.equal(at('bridal party makeup'), at('bridal party hair and makeup package'), 'the bridal party pair shares one page');
  assert.equal(at('la caille utah bridal makeup artist'), at('sundance mountain resort bridal makeup artist'), 'La Caille and Sundance share one page');
  assert.equal(at('makeup artist in utah'), at('utah wedding makeup artist'), 'the close call folded into the head page');
  assert.notEqual(at('hair and makeup: on location or in a salon'), at('on location hair and makeup'), 'an article is not folded into a service page');
  assert.equal(at('soft glam vs full glam').kind, 'Article');
  assert.equal(at('hair and makeup: on location or in a salon').kind, 'Article');
  assert.equal(at('bridal party hair and makeup cost').kind, 'Article');
  for (const p of list) {
    assert.ok(KINDS.includes(p.kind), p.kind);
    assert.ok(p.reason.length > 10);
    assert.ok(['clear', 'close'].includes(p.confidence.level));
  }
  assert.equal(list.filter((p) => p.kind === 'Homepage').length, 1);
});

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
  assert.match(text, /^Three of the same businesses come up for both of these, led by rare\.com and also\.com,/);
  assert.equal(reasonOf(['k4'], m, 0), 'Nothing else on your list brings up the same businesses, so this search needs a page of its own.');
  assert.equal(reasonOf(['k4'], m, 0.1), 'This search shares a few results with others on your list, but not enough to share a page.');
  assert.match(reasonOf(['k1', 'k2', 'k3'], m, 0), /^One business, common\.com, comes up for all of these,/);
  assert.match(reasonOf(['k1', 'k3'], m, 0), /^One business, common\.com, comes up for both of these,/, 'two searches are both, not all');
});

// A directory column weighs nothing, so similarity cannot see it: a keyword
// joined to the study by Yelp alone scores a nearest of zero, and the
// absolute sentence would be false.
test('reasonOf tells a singleton joined only by listing sites from one joined by nothing', () => {
  const round = roundWith({
    k1: { urls: ['https://alone.com/', 'https://www.yelp.com/search'] },
    k2: { urls: ['https://other.com/', 'https://www.yelp.com/search'] },
    k3: { urls: ['https://solo.com/'] },
  });
  const m = matrix(round);
  assert.equal(reasonOf(['k1'], m, 0), 'The only results this shares with the rest of your list are listing sites, which show up for almost everything, so it needs a page of its own.');
  assert.equal(reasonOf(['k3'], m, 0), 'Nothing else on your list brings up the same businesses, so this search needs a page of its own.');
  assert.equal(reasonOf(['k1'], m, 0.1), 'This search shares a few results with others on your list, but not enough to share a page.');
});

// Three keywords joined pairwise and never all at once: the group stands on
// what most of its members share, and the reason has to say so.
test('reasonOf says when no single business ranks for every member', () => {
  const round = roundWith({
    k1: { urls: ['https://a.com/', 'https://b.com/'] },
    k2: { urls: ['https://b.com/', 'https://c.com/'] },
    k3: { urls: ['https://c.com/', 'https://a.com/'] },
  });
  const m = matrix(round);
  assert.equal(reasonOf(['k1', 'k2', 'k3'], m, 0), 'No single business comes up for every one of these, but most of them bring up the same names, so one page answers them all.');
});

test('band cuts similarity into none, faint, some, most', () => {
  assert.equal(band(0, 0.25), 0);
  assert.equal(band(0.1, 0.25), 1);
  assert.equal(band(0.2, 0.25), 2);
  assert.equal(band(0.25, 0.25), 3);
  assert.equal(band(1, 0.25), 3);
});

test('homeAreas is any area named in more than half the captured keywords', () => {
  const round = roundWith({
    k1: { text: 'utah bridal makeup', urls: ['https://a.com/'] },
    k2: { text: 'Utah wedding makeup artist', urls: ['https://a.com/'] },
    k3: { text: 'park city utah hair and makeup', urls: ['https://a.com/'] },
    k4: { text: 'moab wedding makeup', urls: ['https://a.com/'] },
  }, ['Utah', 'Park City', 'Moab']);
  assert.deepEqual(homeAreas(round), ['Utah']);
  // An uncaptured keyword says nothing about the study, so it cannot dilute
  // the home area below half.
  round.keywords.push({ id: 'k5', text: 'bridal hair', cluster: 'C' }, { id: 'k6', text: 'wedding hair', cluster: 'C' });
  assert.deepEqual(homeAreas(round), ['Utah']);
  // Before the first capture the whole list stands in.
  assert.deepEqual(homeAreas({ ...emptyRound('r1'), areas: ['Utah'], serps: {}, keywords: [{ id: 'k1', text: 'utah bridal makeup' }, { id: 'k2', text: 'bridal hair' }, { id: 'k3', text: 'utah wedding makeup' }] }), ['Utah']);
});

test('kindOf: a non-home area is a location page, a question is an article, else a service page', () => {
  const round = roundWith({
    k1: { text: 'park city utah hair and makeup', urls: ['https://a.com/'] },
    k2: { text: 'utah bridal makeup', urls: ['https://a.com/'] },
    k3: { text: 'soft glam vs full glam', urls: ['https://a.com/'] },
    k4: { text: 'bridal party hair and makeup cost', urls: ['https://a.com/'] },
    k5: { text: 'mature skin bridal makeup', urls: ['https://a.com/blog/one', 'https://b.com/blog/two', 'https://c.com/'] },
    k6: { text: 'bridal party makeup', urls: ['https://a.com/services/', 'https://www.yelp.com/search'] },
    k7: { text: 'park city bridal makeup', urls: ['https://a.com/'] },
  }, ['Utah', 'Park City']);
  const home = ['Utah'];
  assert.equal(kindOf(['k1'], round, home), 'Location page');
  assert.equal(kindOf(['k2'], round, home), 'Service page');
  assert.equal(kindOf(['k3'], round, home), 'Article');
  assert.equal(kindOf(['k4'], round, home), 'Article');
  assert.equal(kindOf(['k5'], round, home), 'Article', 'half the business results are blog posts');
  assert.equal(kindOf(['k6'], round, home), 'Service page', 'a directory does not count toward the blog share');
});

// A group is what most of its searches are. One keyword naming a town used to
// turn a whole head group into a location page.
test('kindOf takes the majority of its members, ties to a service page', () => {
  const round = roundWith({
    k1: { text: 'park city utah hair and makeup', urls: ['https://a.com/'] },
    k2: { text: 'utah bridal makeup', urls: ['https://a.com/'] },
    k3: { text: 'soft glam vs full glam', urls: ['https://a.com/'] },
    k6: { text: 'bridal party makeup', urls: ['https://a.com/services/', 'https://www.yelp.com/search'] },
    k7: { text: 'park city bridal makeup', urls: ['https://a.com/'] },
  }, ['Utah', 'Park City']);
  const home = ['Utah'];
  assert.equal(kindOf(['k1', 'k2', 'k6'], round, home), 'Service page', 'one member with an area does not make the group a location page');
  assert.equal(kindOf(['k3', 'k2', 'k6'], round, home), 'Service page', 'nor one question member an article');
  assert.equal(kindOf(['k1', 'k7'], round, home), 'Location page', 'two towns and nothing else is a location page');
  assert.equal(kindOf(['k1', 'k2'], round, home), 'Service page', 'a tie goes to the service page');
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

test('applyNoVolume counts every unmeasured keyword as zero and leaves the rest alone', () => {
  const round = { ...emptyRound('r1'), keywords: [
    { id: 'k1', text: 'a' }, { id: 'k2', text: 'b', volume: { min: 5, max: 5, source: 'csv', at: 'old' } }, { id: 'k3', text: 'c' },
  ] };
  const at = new Date('2026-09-18T12:00:00Z');
  const next = applyNoVolume(round, at);
  assert.deepEqual(next.keywords[0].volume, { min: 0, max: 0, source: 'none', at: at.toISOString() });
  assert.deepEqual(next.keywords[1].volume, { min: 5, max: 5, source: 'csv', at: 'old' }, 'a keyword Planner did report keeps its number');
  assert.deepEqual(next.keywords[2].volume, { min: 0, max: 0, source: 'none', at: at.toISOString() });
  assert.deepEqual(next.volumeImport, { at: at.toISOString(), matched: 2, unmatchedRows: [], unmatchedKeywords: [] });
});

test('applyNoVolume is a no-op once every keyword already has volume', () => {
  const round = { ...emptyRound('r1'), keywords: [
    { id: 'k1', text: 'a', volume: { min: 5, max: 5, source: 'csv', at: 'old' } },
  ] };
  assert.equal(applyNoVolume(round, new Date()), round);
});

test('a page made only of Planner-silent keywords stands as low', () => {
  const round = { ...emptyRound('r1'), keywords: [{ id: 'k1', text: 'a' }, { id: 'k2', text: 'b' }] };
  const next = applyNoVolume(round, new Date());
  assert.equal(standingOf(['k1', 'k2'], next), 'low');
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

// Nobody searches a town's name often, and the page is how the site says the
// business works there.
test('a location page stands whatever its search numbers say', () => {
  const round = roundWith({
    k1: { text: 'moab wedding makeup', urls: ['https://a.com/'] },
    k2: { text: 'mature skin bridal makeup', urls: ['https://b.com/'] },
  }, ['Moab']);
  for (const k of round.keywords) k.volume = { min: 0, max: 1, source: 'planner', at: 'x' };
  const list = pageList(round);
  const moab = list.find((p) => p.keywords.includes('k1'));
  const other = list.find((p) => p.keywords.includes('k2'));
  assert.equal(moab.kind, 'Location page');
  assert.equal(moab.standing, 'page');
  assert.equal(moab.standingWhy, 'place');
  assert.equal(other.standing, 'low', 'a service page with the same volumes is set aside');
  assert.equal(other.standingWhy, undefined);
  // A location page Planner can see says nothing about the place rule.
  round.keywords[0].volume = { min: 0, max: 900, source: 'planner', at: 'x' };
  assert.equal(pageList(round).find((p) => p.keywords.includes('k1')).standingWhy, undefined);
});

// Volume sets aside what the engine grouped; the owner pinning a page is a
// decision to build it, so an edited row stands whatever Planner says.
test('a page the owner pins stands even when its volume is under the floor', () => {
  const round = roundWith({ k1: { text: 'rare search', urls: ['https://a.com/'] }, k2: { text: 'busy search', urls: ['https://b.com/'] } });
  round.keywords[0].volume = { min: 0, max: 1, source: 'csv', at: 'x' };
  round.keywords[1].volume = { min: 0, max: 900, source: 'csv', at: 'x' };
  assert.equal(pageList(round).find((p) => p.keywords.includes('k1')).standing, 'low');
  round.pages = [{ id: 'p9', title: 'Rare search', kind: 'Service page', keywords: ['k1'], note: 'owner wants it', auto: false }];
  assert.equal(pageList(round).find((p) => p.keywords.includes('k1')).standing, 'page');
});
