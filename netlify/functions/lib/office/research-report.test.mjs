import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResearchReport, reportName } from './research-report.mjs';
import { emptyStudy, applyCapture, domainOf } from './research.mjs';

const r = (url) => ({ url, title: `Title ${domainOf(url)}` });

test('reportName is dated in Denver', () => {
  assert.equal(reportName(new Date('2026-09-14T02:00:00Z')), 'search-research-2026-09-13.pdf');
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
  const bytes = await renderResearchReport({ client: { business: 'Acme Florist', tier: 'Growth' }, study: s, renderedAt: new Date('2026-09-13T12:00:00Z') });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.byteLength > 2000);
  // pdf-lib streams are compressed; the outline of what was written is
  // checked through the writer's own text calls in the next test instead.
});

test('the report text covers every section', async () => {
  const { reportLines } = await import('./research-report.mjs');
  let s = emptyStudy('acme', new Date('2026-09-13T00:00:00Z'));
  s.rounds[0] = { ...s.rounds[0], keywords: [{ id: 'k1', text: 'wedding florist provo', cluster: 'Weddings', arm: '', source: 'manual' }] };
  s = applyCapture(s, 'k1', { q: 'wedding florist provo', results: [r('https://a1.com/p')], related: [] });
  const lines = reportLines({ client: { business: 'Acme Florist', tier: 'Growth' }, study: s, renderedAt: new Date('2026-09-13T12:00:00Z') });
  const text = lines.map((l) => l.text ?? l.rows?.flat().join(' ')).join('\n');
  for (const needle of ['Search research', 'Acme Florist', 'What we did', 'The pages we recommend', 'wedding florist provo', 'Decisions from our call', 'What we saw', 'Appendix', 'a1.com']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
});
