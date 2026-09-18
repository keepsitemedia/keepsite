import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResearchReport, reportName, reportLines } from './research-report.mjs';
import { emptyStudy, emptyRound, applyCapture, openRound, domainOf, pairs } from './research.mjs';

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
  for (const needle of ['Search research', 'Acme Florist', 'What we did', 'The pages we recommend', 'wedding florist provo', 'Decisions from our call', 'What we saw', 'Appendix', 'a1.com']) {
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

test('the report explains why directories are set aside', () => {
  const round = { ...emptyRound('r1'), keywords: [], serps: {} };
  const L = reportLines({ client, round, renderedAt: new Date('2026-09-18T00:00:00Z') });
  const words = L.map((x) => x.text ?? '').join('\n');
  assert.match(words, /Directory sites/);
  assert.match(words, /We compare the individual businesses instead/);
  assert.ok(!/Seven or more shared results out of eight/.test(words));
});

test('a read on an unmeasurable pair still reaches the decisions table', async () => {
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.rounds[0] = {
    ...s.rounds[0],
    keywords: [
      { id: 'k1', text: 'niche florist provo', cluster: '', arm: '', source: 'manual' },
      { id: 'k2', text: 'provo niche florist', cluster: '', arm: '', source: 'manual' },
    ],
  };
  // Two non-directory results each: fewer than MIN_BUSINESSES, so the pair
  // is 'unmeasurable' no matter how they overlap — the numbers never speak.
  s = applyCapture(s, 'k1', { q: 'niche florist provo', results: [r('https://a1.com/p'), r('https://a2.com/p')], related: [] });
  s = applyCapture(s, 'k2', { q: 'provo niche florist', results: [r('https://a1.com/p'), r('https://a3.com/p')], related: [] });
  s.rounds[0] = { ...s.rounds[0], reads: { 'k1|k2': { human: 'Probably different', sameCluster: 'No', notes: 'Different services, owner said.' } } };
  const round = openRound(s);
  const [pair] = pairs(round);
  assert.equal(pair.signal, 'unmeasurable', 'fixture must exercise the unmeasurable branch');

  const lines = reportLines({ client, round, renderedAt: new Date('2026-09-13T12:00:00Z') });
  const text = lines.map((l) => l.text ?? l.rows?.flat().join(' ')).join('\n');
  assert.ok(text.includes('niche florist provo / provo niche florist'), 'the owner-read unmeasurable pair appears in the decisions table');
  assert.ok(text.includes('too few businesses'), 'the row states the effect, not a share');
  assert.ok(!/\d+ of \d+ businesses/.test(text), 'no business share is quoted for an unmeasurable pair');
});

test('the notes bracket the findings and empty ones print nothing', () => {
  const round = { ...emptyRound('r1'), keywords: [], serps: {}, notes: { intro: 'Why we looked.', closing: 'What to do.' } };
  const L = reportLines({ client, round, renderedAt: new Date('2026-09-17T00:00:00Z') });
  const texts = L.map((x) => x.text ?? '');
  const intro = texts.indexOf('Why we looked.');
  const closing = texts.indexOf('What to do.');
  const findings = texts.findIndex((t) => t === 'What we did');
  assert.ok(intro > -1 && findings > -1 && intro < findings, 'intro prints before the findings');
  assert.equal(closing, texts.length - 1, 'closing prints last');

  const bare = reportLines({ client, round: { ...round, notes: { intro: '', closing: '' } }, renderedAt: new Date('2026-09-17T00:00:00Z') });
  assert.ok(!bare.some((x) => (x.text ?? '') === ''), 'an empty note prints no empty line');
  assert.ok(!bare.some((x) => (x.text ?? '').includes('Notes')), 'an empty note prints no heading');
});
