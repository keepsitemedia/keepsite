import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResearchReport, reportName, reportLines } from './research-report.mjs';
import { emptyStudy, emptyRound, applyCapture, openRound, domainOf } from './research.mjs';

const r = (url) => ({ url, title: `Title ${domainOf(url)}` });
const client = { business: 'Acme Florist', tier: 'Growth' };

test('reportName is dated in Denver', () => {
  assert.equal(reportName(new Date('2026-09-14T02:00:00Z')), 'search-research-2026-09-13.pdf');
});

test('reportName carries the round start so two rounds do not collide', () => {
  const round = { ...emptyRound('r1'), startedAt: '2026-09-13T00:00:00.000Z' };
  // Office-local (Denver), same as everywhere else the round's date is shown:
  // 2026-09-13T00:00Z is 2026-09-12 evening in Denver. Do not "fix" this to
  // the UTC date — that would disagree with the date printed next to the
  // round everywhere else in the product.
  assert.equal(reportName(new Date('2026-09-20T00:00:00Z'), round), 'search-research-2026-09-12.pdf');
});

test('renderResearchReport writes a PDF that names the pages and the searches', async () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.rounds[0] = {
    ...s.rounds[0],
    keywords: [
      { id: 'k1', text: 'wedding florist provo', cluster: 'Weddings', arm: '', source: 'manual' },
      { id: 'k2', text: 'provo wedding flowers', cluster: 'Weddings', arm: '', source: 'manual' },
      { id: 'k3', text: 'funeral flowers provo', cluster: 'Sympathy', arm: '', source: 'manual' },
    ],
  };
  const A = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r(`https://a${n}.com/p`));
  s = applyCapture(s, 'k1', { q: 'wedding florist provo', results: A, related: [] });
  s = applyCapture(s, 'k2', { q: 'provo wedding flowers', results: [...A.slice(0, 7), r('https://other.com/p')], related: [] });
  s = applyCapture(s, 'k3', { q: 'funeral flowers provo', results: [1, 2, 3, 4].map((n) => r(`https://f${n}.com/p`)), related: [] });
  s.rounds[0] = { ...s.rounds[0], reads: { 'k1|k2': { human: 'Same intent', sameCluster: 'Yes', notes: 'Client agreed on the call.' } } };
  const bytes = await renderResearchReport({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.byteLength > 2000);
  // pdf-lib streams are compressed; the outline of what was written is
  // checked through the writer's own text calls in the next test instead.
});

test('the report text covers every section', async () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.rounds[0] = { ...s.rounds[0], keywords: [{ id: 'k1', text: 'wedding florist provo', cluster: 'Weddings', arm: '', source: 'manual' }] };
  s = applyCapture(s, 'k1', { q: 'wedding florist provo', results: [r('https://a1.com/p')], related: [] });
  const lines = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const text = lines.map((l) => l.text ?? l.rows?.flat().join(' ')).join('\n');
  for (const needle of ['Search research', 'Acme Florist', 'How we worked this out', "The pages we'll build", 'wedding florist provo', 'Where we made a call', 'what we saw', 'Appendix', 'a1.com']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
});

// The client asked where the list came from; the answer is the second thing
// the report says.
test('the intro says where the searches came from', () => {
  const L = reportLines({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.match(L[2].text, /The 3 searches came from your questionnaire and the ones we added; every one is listed at the back\./);
});

test('the header names the round so two rounds are not confused', () => {
  const open = { ...emptyRound('r1'), startedAt: '2026-09-13T00:00:00.000Z', closedAt: null };
  const closed = { ...emptyRound('r0'), startedAt: '2026-01-05T00:00:00.000Z', closedAt: '2026-02-10T00:00:00.000Z' };
  const renderedAt = new Date('2026-09-17T00:00:00Z');
  const openHeader = reportLines({ client, round: open, renderedAt })[1].text;
  const closedHeader = reportLines({ client, round: closed, renderedAt })[1].text;
  assert.notEqual(openHeader, closedHeader, 'two rounds rendered on the same day print different headers');
  assert.ok(openHeader.includes('Sep 12'), "names the open round's start");
  assert.ok(!openHeader.includes('finished'), 'an open round does not claim to be finished');
  assert.ok(closedHeader.includes('Jan 4'), "names the closed round's start");
  assert.ok(closedHeader.includes('finished'), 'names the closed round as finished');
  assert.ok(closedHeader.includes('Feb 9'), "names the closed round's close date");
});

test('the notes bracket the findings and empty ones print nothing', () => {
  const round = { ...emptyRound('r1'), keywords: [], serps: {}, notes: { intro: 'Why we looked.', closing: 'What to do.' } };
  const L = reportLines({ client, round, renderedAt: new Date('2026-09-17T00:00:00Z') });
  const texts = L.map((x) => x.text ?? '');
  const intro = texts.indexOf('Why we looked.');
  const closing = texts.indexOf('What to do.');
  const findings = texts.findIndex((t) => t === "The pages we'll build");
  const appendix = texts.findIndex((t) => t.startsWith('Appendix'));
  assert.ok(intro > -1 && findings > -1 && intro < findings, 'intro prints before the findings');
  // The closing note is the owner's last word to the client, so it prints
  // where the client stops reading: after the findings, before the working.
  assert.ok(closing > findings && closing < appendix, 'closing prints after the findings and before the appendix');

  const bare = reportLines({ client, round: { ...round, notes: { intro: '', closing: '' } }, renderedAt: new Date('2026-09-17T00:00:00Z') });
  assert.ok(!bare.some((x) => x.text === ''), 'an empty note prints no empty line');
  assert.ok(!bare.some((x) => (x.text ?? '').includes('Notes')), 'an empty note prints no heading');
});

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

test('page one leads with the numbers and the pages, and the grid waits behind the stop line', () => {
  const L = reportLines({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const kinds = L.map((x) => x.kind);
  const stats = L.find((x) => x.kind === 'stats');
  assert.deepEqual(stats.items, [['3', 'searches we looked at'], ['2', "pages we'll build"]], 'no third stat until volume is loaded');
  const grid = L.find((x) => x.kind === 'grid');
  assert.deepEqual(grid.labels.length, 3);
  assert.deepEqual(grid.blocks, [2, 1]);
  assert.equal(grid.bands.length, 3);
  assert.ok(grid.bands[0][1] >= 2, 'the alike pair is shaded');
  assert.equal(grid.bands[0][2], 0, 'the unlike pair is not');
  const texts = L.map((x) => x.text ?? '');
  const pages = texts.indexOf("The pages we'll build");
  const stop = texts.findIndex((t) => t.startsWith('You can stop here'));
  const method = texts.indexOf('How we worked this out');
  const appendix = texts.findIndex((t) => t.startsWith('Appendix'));
  assert.ok(kinds.indexOf('stats') < pages, 'the numbers come before the page list');
  assert.ok(pages < stop && stop < appendix);
  assert.ok(stop < kinds.indexOf('grid') && kinds.indexOf('grid') < method, 'the grid sits between the stop line and the method');
  assert.ok(!kinds.includes('bars'), 'the bar chart is gone');
  assert.match(words(L), /of the same businesses come up for both of these, led by/);
  assert.match(words(L), /your homepage|a service page/);
  assert.ok(!/Directory/.test(words(L).split('Appendix')[0]), 'no page kind Directory before the appendix');
});

test('the caption counts the page bands in the grid', () => {
  const L = reportLines({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const caption = L.map((x) => x.text ?? '').find((t) => t.includes('bands'));
  assert.match(caption, /split into 2 bands, one per page/);
});

test('a study too wide for page one keeps the grid where every other study has it', () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  const ids = Array.from({ length: 31 }, (_, i) => `k${i}`);
  s.rounds[0] = { ...s.rounds[0], keywords: ids.map((id) => ({ id, text: `search ${id}`, cluster: '', arm: '', source: 'manual' })) };
  for (const id of ids) s = applyCapture(s, id, { q: id, results: [r(`https://${id}.com/`)], related: [] });
  const L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const kinds = L.map((x) => x.kind);
  const texts = L.map((x) => x.text ?? '');
  assert.ok(kinds.indexOf('grid') > texts.findIndex((t) => t.startsWith('You can stop here')), 'the grid still waits behind the stop line');
  assert.ok(!texts.some((t) => /appendix/i.test(t) && /grid/i.test(t)), 'nothing sends the reader to an appendix for it');
});

test('the method paragraph explains rarity and volume, and the directories paragraph is gone', () => {
  const L = reportLines({ client, round: { ...emptyRound('r1'), keywords: [], serps: {} }, renderedAt: new Date('2026-09-18T00:00:00Z') });
  const w = words(L);
  assert.match(w, /Listing sites and big names that appear for nearly everything tell us little/);
  assert.match(w, /Google's own search numbers, which it rounds, tell us which searches people actually make and which nobody does; they are not a ranking of the pages/);
  assert.ok(!/Directory sites/.test(w));
  assert.ok(!/Seven or more shared results/.test(w));
  assert.ok(!/We compare the individual businesses instead/.test(w));
});

test('judgement lists the edited pages with their notes, and says so when there are none', () => {
  const s = study();
  let L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.match(words(L), /The search results settled every page on their own\. Nothing here needed a call from us\./);
  s.rounds[0] = { ...s.rounds[0], pages: [{ id: 'p9', title: 'Sympathy', kind: 'Service page', keywords: ['k3'], note: 'Owner wants this separate.', auto: false }] };
  L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const table = L.find((x) => x.kind === 'table' && x.rows[0][0] === 'Page');
  assert.ok(table, 'a table of edited pages');
  assert.deepEqual(table.rows[1], ['Sympathy', 'funeral flowers provo', 'Owner wants this separate.']);
});

test('the searches left out appear only with volume, and a close call is explained', () => {
  const s = study();
  // The intro names the section in quotes whatever happens, so the heading
  // itself is what says whether the section printed.
  const heading = (L) => L.some((x) => x.kind === 'h2' && x.text === "Searches we're leaving out");
  let L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.ok(!heading(L));
  // The two wedding searches share one page, so the page set aside holds two
  // searches and the stat counts searches, not pages.
  s.rounds[0].keywords = s.rounds[0].keywords.map((k) => ({ ...k, volume: { min: 0, max: k.id === 'k3' ? 500 : 0, source: 'csv', at: 'x' } }));
  L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const w = words(L);
  assert.ok(heading(L));
  const setAside = L.map((x) => x.text ?? '').find((t) => /too few people search for these each month/.test(t));
  assert.match(setAside, /wedding florist provo/);
  assert.match(setAside, /provo wedding flowers/);
  assert.match(setAside, /too few for Google to count/, 'a search Google cannot count says so');
  const stats = L.find((x) => x.kind === 'stats');
  assert.deepEqual(stats.items[2], ['2', "searches we're leaving out"]);
  assert.match(w, /0 to 500 a month/, 'volume ranges print beside the searches');
});

// Planner rounds its numbers into buckets, and a client reading "210 a month"
// as a measurement will ask why the traffic is not 210.
test('a Planner number is said as a rounded one', () => {
  const s = study();
  const round = openRound(s);
  const said = (volume) => {
    const L = reportLines({ client, round: { ...round, keywords: round.keywords.map((k) => (k.id === 'k3' ? { ...k, volume } : k)) }, renderedAt: new Date('2026-09-13T12:00:00Z') });
    return words(L);
  };
  assert.match(said({ min: 210, max: 210, source: 'planner', at: 'x' }), /around 210 a month; Google rounds these/);
  assert.match(said({ min: 100, max: 1000, source: 'planner', at: 'x' }), /100 to 1000 a month/);
  const bucket = said({ min: 10, max: 100, source: 'planner', at: 'x' });
  assert.match(bucket, /10 to 100 a month/, "Planner's bucket is printed as the range it is");
  assert.ok(!/Google rounds these/.test(bucket), 'a range already says it is rounded');
  assert.match(said({ min: 0, max: 0, source: 'none', at: 'x' }), /too few for Google to count/);
  assert.match(said({ min: 5, max: 5, source: 'planner', at: 'x' }), /under 10 a month/);
});

// The client is not asked to make the call: a close call is folded in by
// default, and the report says what was folded and what was kept apart.
test('a fold and a kept-apart page are both explained, and nothing asks the client to merge', () => {
  const s = study();
  const closed = { ...openRound(s), closedAt: '2026-09-14T00:00:00.000Z', pages: [
    { id: 'p-weddings', title: 'Wedding flowers', kind: 'Service page', keywords: ['k1', 'k2'], confidence: { level: 'clear', near: null }, reason: 'Seven businesses rank for both.', standing: 'page', note: '', auto: true,
      folded: [{ title: 'provo wedding flowers', into: 'Wedding flowers', keywords: ['k2'] }] },
    { id: 'p-sympathy', title: 'Funeral flowers', kind: 'Service page', keywords: ['k3'], confidence: { level: 'close', near: 'p-weddings' }, reason: 'The businesses that rank here mostly rank for nothing else in the study.', standing: 'page', note: '', auto: true,
      keptApart: 'Wedding flowers', keptApartWhy: 'volume' },
  ] };
  const L = reportLines({ client, round: closed, renderedAt: new Date('2026-09-20T00:00:00Z') });
  const w = words(L);
  assert.match(w, /Also answers provo wedding flowers, which bring up mostly the same businesses\./);
  const table = L.find((x) => x.kind === 'table' && x.rows[0][0] === 'Page');
  assert.deepEqual(table.rows[1], ['Wedding flowers', 'provo wedding flowers', 'We folded it in: the two bring up many of the same businesses and want the same kind of page.']);
  assert.deepEqual(table.rows[2], ['Funeral flowers', 'Wedding flowers', 'We kept it separate: it draws enough searches of its own']);
  assert.ok(!/close to/.test(w), 'no close-call sentence anywhere');
  assert.ok(!/merge them/.test(w));
});

test('the report names the place it searched from', () => {
  const s = study();
  s.rounds[0] = { ...openRound(s), location: 'Utah, United States' };
  const L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.match(L[1].text, /\u00b7 Searched from Utah, United States \u00b7 Printed/);
  assert.match(words(L), /We searched each of the 3 terms from Utah, United States \(Google's own search numbers are for the same place\)/);
  const bare = reportLines({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.match(bare[1].text, /Searched from the research profile's location/);
  assert.match(words(bare), /terms from where the research profile was/);
});

// A page nobody local ranks for is either a bad capture or a search people
// make from everywhere, and the client is told which question is open.
test('a page with no local results anywhere says so', () => {
  const s = study();
  const round = openRound(s);
  const serps = Object.fromEntries(Object.entries(round.serps).map(([id, serp]) => [id, { ...serp, local: false }]));
  const L = reportLines({ client, round: { ...round, serps }, renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.match(words(L), /Google shows no local businesses for this search; people search it from everywhere\./);
  const some = reportLines({ client, round, renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.ok(!/no local businesses/.test(words(some)));
});

// Two pages kept apart from each other is one decision, not two, and the head
// page is not the one described as kept separate.
test('a mutual split prints one row, from the smaller page', () => {
  const round = { ...openRound(study()), closedAt: '2026-09-14T00:00:00.000Z', pages: [
    { id: 'p1', title: 'Wedding flowers', kind: 'Service page', keywords: ['k1', 'k2'], confidence: { level: 'close', near: 'p2' }, reason: 'Seven businesses rank for both.', standing: 'page', note: '', auto: true, keptApart: 'Funeral flowers', keptApartWhy: 'kind' },
    { id: 'p2', title: 'Funeral flowers', kind: 'Article', keywords: ['k3'], confidence: { level: 'close', near: 'p1' }, reason: 'Nothing else brings up the same businesses.', standing: 'page', note: '', auto: true, keptApart: 'Wedding flowers', keptApartWhy: 'kind' },
  ] };
  const L = reportLines({ client, round, renderedAt: new Date('2026-09-20T00:00:00Z') });
  const table = L.find((x) => x.kind === 'table' && x.rows[0][0] === 'Page');
  assert.equal(table.rows.length, 2, 'the header and one row');
  assert.deepEqual(table.rows[1], ['Funeral flowers', 'Wedding flowers', 'We kept it separate: it wants a different kind of page']);
});

test('a page kept for the place or for the intent says which', () => {
  const page = (standingWhy) => ({ ...openRound(study()), closedAt: '2026-09-14T00:00:00.000Z', pages: [
    { id: 'p1', title: 'Moab', kind: 'Location page', keywords: ['k1'], confidence: { level: 'clear', near: null }, reason: 'Nothing else brings up the same businesses.', standing: 'page', standingWhy, note: '', auto: true },
  ] });
  assert.match(words(reportLines({ client, round: page('place'), renderedAt: new Date('2026-09-20T00:00:00Z') })), /Worth a page for the place, whatever the search numbers say\./);
  assert.match(words(reportLines({ client, round: page('intent'), renderedAt: new Date('2026-09-20T00:00:00Z') })), /Worth a page because people searching this are ready to book, whatever the search numbers say\./);
});

test('a closed round reports its stored pages, not a fresh clustering', () => {
  const s = study();
  const open = openRound(s);
  const closed = { ...open, closedAt: '2026-09-14T00:00:00.000Z', pages: [
    { id: 'frozen', title: 'Everything', kind: 'Homepage', keywords: ['k1', 'k2', 'k3'], confidence: { level: 'clear', near: null }, reason: 'Frozen reason.', standing: 'page', note: '', auto: true },
  ] };
  const L = reportLines({ client, round: closed, renderedAt: new Date('2026-09-20T00:00:00Z') });
  assert.match(words(L), /Frozen reason\./);
  assert.deepEqual(L.find((x) => x.kind === 'stats').items[1], ['1', "page we'll build"]);
});

test('the caption says only the lower half is drawn', () => {
  const L = reportLines({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const caption = L.map((x) => x.text ?? '').find((t) => t.includes('bands'));
  assert.match(caption, /Only the lower half is drawn; the upper half would be its mirror\. The diagonal is each search against itself\.$/);
});

// A business with three pages in one set of results is one business Google
// shows for that search, and a listing site is not evidence at all.
test('the appendix counts businesses across searches and sets the listing sites aside', () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.rounds[0] = { ...s.rounds[0], keywords: [
    { id: 'k1', text: 'wedding florist provo', cluster: '', arm: '', source: 'manual' },
    { id: 'k2', text: 'provo wedding flowers', cluster: '', arm: '', source: 'manual' },
  ] };
  const results = [r('https://a.com/'), r('https://a.com/weddings/'), r('https://b.com/'), r('https://www.yelp.com/search?find_desc=x')];
  s = applyCapture(s, 'k1', { q: 'wedding florist provo', results, related: [] });
  s = applyCapture(s, 'k2', { q: 'provo wedding flowers', results, related: [] });
  const L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const heads = L.map((x) => x.text ?? '');
  assert.ok(heads.some((t) => /\u00b7 across 2 searches$/.test(t)), heads.join(' | '));
  const table = L.find((x) => x.kind === 'table' && String(x.rows[0][1]).startsWith('Seen in how many'));
  assert.deepEqual(table.rows[0], ['Business', 'Seen in how many of the 2 searches']);
  assert.deepEqual(table.rows[1], ['a.com', '2'], 'two pages in one search are one business, seen in both searches');
  assert.ok(!table.rows.some((row) => row[0] === 'yelp.com'), 'a listing site is not a row');
  assert.deepEqual(table.widths, [0.7, 0.3]);
  assert.ok(words(L).includes('On nearly every search, as always: yelp.com.'));
});

test('the PDF writer draws a grid', async () => {
  const bytes = await renderResearchReport({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.byteLength > 2000);
});
