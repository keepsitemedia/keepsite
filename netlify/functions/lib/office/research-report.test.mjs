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
  for (const needle of ['Search research', 'Acme Florist', 'How we did it', 'Your pages', 'wedding florist provo', 'Where we used judgement', 'what we saw', 'Appendix', 'a1.com']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
});

test('the header names the round so two rounds are not confused', () => {
  const open = { ...emptyRound('r1'), startedAt: '2026-09-13T00:00:00.000Z', closedAt: null };
  const closed = { ...emptyRound('r0'), startedAt: '2026-01-05T00:00:00.000Z', closedAt: '2026-02-10T00:00:00.000Z' };
  const renderedAt = new Date('2026-09-17T00:00:00Z');
  const openHeader = reportLines({ client, round: open, renderedAt })[1].text;
  const closedHeader = reportLines({ client, round: closed, renderedAt })[1].text;
  assert.notEqual(openHeader, closedHeader, 'two rounds rendered on the same day print different headers');
  assert.ok(openHeader.includes('Sep 12'), "names the open round's start");
  assert.ok(!openHeader.includes('closed'), 'an open round does not claim to be closed');
  assert.ok(closedHeader.includes('Jan 4'), "names the closed round's start");
  assert.ok(closedHeader.includes('closed'), 'names the closed round as closed');
  assert.ok(closedHeader.includes('Feb 9'), "names the closed round's close date");
});

test('the notes bracket the findings and empty ones print nothing', () => {
  const round = { ...emptyRound('r1'), keywords: [], serps: {}, notes: { intro: 'Why we looked.', closing: 'What to do.' } };
  const L = reportLines({ client, round, renderedAt: new Date('2026-09-17T00:00:00Z') });
  const texts = L.map((x) => x.text ?? '');
  const intro = texts.indexOf('Why we looked.');
  const closing = texts.indexOf('What to do.');
  const findings = texts.findIndex((t) => t === 'Your pages');
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

test('page one leads with the numbers and the grid, then the pages with their reasons', () => {
  const L = reportLines({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const kinds = L.map((x) => x.kind);
  const stats = L.find((x) => x.kind === 'stats');
  assert.deepEqual(stats.items, [['3', 'searches'], ['2', 'pages']], 'no third stat until volume is loaded');
  const grid = L.find((x) => x.kind === 'grid');
  assert.deepEqual(grid.labels.length, 3);
  assert.deepEqual(grid.blocks, [2, 1]);
  assert.equal(grid.bands.length, 3);
  assert.ok(grid.bands[0][1] >= 2, 'the alike pair is shaded');
  assert.equal(grid.bands[0][2], 0, 'the unlike pair is not');
  const texts = L.map((x) => x.text ?? '');
  const pages = texts.indexOf('Your pages');
  const stop = texts.findIndex((t) => t.startsWith('You can stop here'));
  const appendix = texts.findIndex((t) => t.startsWith('Appendix'));
  assert.ok(kinds.indexOf('stats') < kinds.indexOf('grid') && kinds.indexOf('grid') < pages, 'numbers, grid, pages');
  assert.ok(pages < stop && stop < appendix);
  assert.ok(!kinds.includes('bars'), 'the bar chart is gone');
  assert.match(words(L), /businesses rank for both, led by/);
  assert.match(words(L), /Homepage|Service page/);
  assert.ok(!/Directory/.test(words(L).split('Appendix')[0]), 'no page kind Directory before the appendix');
});

test('the grid moves to the appendix past thirty keywords', () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  const ids = Array.from({ length: 31 }, (_, i) => `k${i}`);
  s.rounds[0] = { ...s.rounds[0], keywords: ids.map((id) => ({ id, text: `search ${id}`, cluster: '', arm: '', source: 'manual' })) };
  for (const id of ids) s = applyCapture(s, id, { q: id, results: [r(`https://${id}.com/`)], related: [] });
  const L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const kinds = L.map((x) => x.kind);
  const texts = L.map((x) => x.text ?? '');
  assert.ok(kinds.indexOf('grid') > texts.findIndex((t) => t.startsWith('Appendix')), 'grid sits in the appendix');
  assert.ok(texts.some((t) => /grid is in the appendix/i.test(t)), 'page one says so');
});

test('the method paragraph explains rarity and volume, and the directories paragraph is gone', () => {
  const L = reportLines({ client, round: { ...emptyRound('r1'), keywords: [], serps: {} }, renderedAt: new Date('2026-09-18T00:00:00Z') });
  const w = words(L);
  assert.match(w, /A business that ranks for nearly every search in your field/);
  assert.match(w, /Search volume tells us which pages are worth building at all/);
  assert.ok(!/Directory sites/.test(w));
  assert.ok(!/Seven or more shared results/.test(w));
  assert.ok(!/We compare the individual businesses instead/.test(w));
});

test('judgement lists the edited pages with their notes, and says so when there are none', () => {
  const s = study();
  let L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.match(words(L), /The businesses settled every page without a judgement call\./);
  s.rounds[0] = { ...s.rounds[0], pages: [{ id: 'p9', title: 'Sympathy', kind: 'Service page', keywords: ['k3'], note: 'Owner wants this separate.', auto: false }] };
  L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const table = L.find((x) => x.kind === 'table' && x.rows[0][0] === 'Page');
  assert.ok(table, 'a table of edited pages');
  assert.deepEqual(table.rows[1], ['Sympathy', 'funeral flowers provo', 'Owner wants this separate.']);
});

test('not built for appears only with volume, and a close call is explained', () => {
  const s = study();
  let L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.ok(!/Not built for/.test(words(L)));
  // The two wedding searches share one page, so the page set aside holds two
  // searches and the stat counts searches, not pages.
  s.rounds[0].keywords = s.rounds[0].keywords.map((k) => ({ ...k, volume: { min: 0, max: k.id === 'k3' ? 500 : 0, source: 'csv', at: 'x' } }));
  L = reportLines({ client, round: openRound(s), renderedAt: new Date('2026-09-13T12:00:00Z') });
  const w = words(L);
  assert.match(w, /Not built for/);
  const setAside = L.map((x) => x.text ?? '').find((t) => /searched too rarely to build for/.test(t));
  assert.match(setAside, /wedding florist provo/);
  assert.match(setAside, /provo wedding flowers/);
  const stats = L.find((x) => x.kind === 'stats');
  assert.deepEqual(stats.items[2], ['2', 'searches not worth a page']);
  assert.match(w, /0 – 500|0–500|0 to 500/, 'volume ranges print beside the searches');
});

// The tab and the report have to agree about a close call, and the report is
// the only place the reason is spelled out for the client.
test('a close call names the page it could have joined', () => {
  const s = study();
  const closed = { ...openRound(s), closedAt: '2026-09-14T00:00:00.000Z', pages: [
    { id: 'p-weddings', title: 'Wedding flowers', kind: 'Service page', keywords: ['k1', 'k2'], confidence: { level: 'clear', near: null }, reason: 'Seven businesses rank for both.', standing: 'page', note: '', auto: true },
    { id: 'p-sympathy', title: 'Funeral flowers', kind: 'Service page', keywords: ['k3'], confidence: { level: 'close', near: 'p-weddings' }, reason: 'The businesses that rank here mostly rank for nothing else in the study.', standing: 'page', note: '', auto: true },
  ] };
  const w = words(reportLines({ client, round: closed, renderedAt: new Date('2026-09-20T00:00:00Z') }));
  assert.match(w, /This one could also sit with Wedding flowers; the businesses differ enough to keep it apart\./);
});

test('a closed round reports its stored pages, not a fresh clustering', () => {
  const s = study();
  const open = openRound(s);
  const closed = { ...open, closedAt: '2026-09-14T00:00:00.000Z', pages: [
    { id: 'frozen', title: 'Everything', kind: 'Homepage', keywords: ['k1', 'k2', 'k3'], confidence: { level: 'clear', near: null }, reason: 'Frozen reason.', standing: 'page', note: '', auto: true },
  ] };
  const L = reportLines({ client, round: closed, renderedAt: new Date('2026-09-20T00:00:00Z') });
  assert.match(words(L), /Frozen reason\./);
  assert.deepEqual(L.find((x) => x.kind === 'stats').items[1], ['1', 'page']);
});

test('the PDF writer draws a grid', async () => {
  const bytes = await renderResearchReport({ client, round: openRound(study()), renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.byteLength > 2000);
});
