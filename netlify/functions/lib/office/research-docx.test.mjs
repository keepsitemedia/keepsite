import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { renderResearchDocx, reportDocxName } from './research-docx.mjs';
import { reportName, reportLines } from './research-report.mjs';
import { emptyStudy, emptyRound, applyCapture, openRound, domainOf } from './research.mjs';

const r = (url) => ({ url, title: `Title ${domainOf(url)}` });
const client = { business: 'Acme Florist', tier: 'Growth' };
const renderedAt = new Date('2026-09-13T12:00:00Z');

// The same fixture the PDF report's tests use: two alike searches and one
// unlike, so the page list, the fold and the grid all have something to say.
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

// A .docx is a zip. Walking the local file headers reads one entry out of it
// without adding a zip dependency for a handful of assertions.
function entry(bytes, want) {
  const buf = Buffer.from(bytes);
  for (let at = 0; at + 30 <= buf.length; at += 1) {
    if (buf.readUInt32LE(at) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(at + 8);
    const compressed = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26);
    const extraLen = buf.readUInt16LE(at + 28);
    if (!compressed) continue;
    const name = buf.toString('utf8', at + 30, at + 30 + nameLen);
    if (name !== want) continue;
    const start = at + 30 + nameLen + extraLen;
    const body = buf.subarray(start, start + compressed);
    return (method === 8 ? inflateRawSync(body) : body).toString('utf8');
  }
  return null;
}

const tables = (xml) => xml.split('<w:tbl>').slice(1).map((s) => s.split('</w:tbl>')[0]);
const gridCols = (tbl) => [...tbl.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => Number(m[1]));
const rowCount = (tbl) => (tbl.match(/<w:tr[ >]/g) ?? []).length;
const ENTITIES = { __proto__: null, '&#39;': "'", '&apos;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' };
// What a reader sees: the run texts alone, with Word's escapes undone, so an
// assertion about the copy is not an assertion about XML escaping.
const textOf = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>(.*?)<\/w:t>/gs)].map((m) => m[1]).join('\n').replace(/&(?:#39|apos|quot|lt|gt|amp);/g, (e) => ENTITIES[e]);
const sum = (ns) => ns.reduce((a, b) => a + b, 0);

test('reportDocxName is the PDF report name with a Word extension', () => {
  const round = { ...emptyRound('r1'), startedAt: '2026-09-13T00:00:00.000Z' };
  const now = new Date('2026-09-20T00:00:00Z');
  assert.equal(reportDocxName(now, round), 'search-research-2026-09-12.docx');
  assert.equal(reportDocxName(now, round), reportName(now, round).replace(/\.pdf$/, '.docx'));
  assert.ok(reportDocxName(now, round).endsWith('.docx'));
});

test('renderResearchDocx writes a Word file that says what the report says', async () => {
  const round = openRound(study());
  const bytes = await renderResearchDocx({ client, round, renderedAt });
  assert.equal(Buffer.from(bytes.slice(0, 2)).toString(), 'PK');
  assert.ok(bytes.byteLength > 2000);
  const xml = entry(bytes, 'word/document.xml');
  assert.ok(xml, 'the package holds word/document.xml');
  const text = textOf(xml);
  for (const needle of ['Search research', 'Acme Florist', "The pages we'll build", 'Where we made a call', 'How we worked this out', 'You can stop here', 'wedding florist provo', 'a1.com']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
  // Every page the report names has to reach the Word file; the page titles
  // are the part an owner edits and the part a client checks.
  for (const line of reportLines({ client, round, renderedAt })) {
    if (line.kind === 'p' && / · (your homepage|a service page|a location page|an article|a page)$/.test(line.text)) {
      assert.ok(xml.includes(line.text.split(' · ')[0]), `missing page ${line.text}`);
    }
  }
});

test('the Word file is US Letter with one-inch margins', async () => {
  const bytes = await renderResearchDocx({ client, round: openRound(study()), renderedAt });
  const xml = entry(bytes, 'word/document.xml');
  assert.match(xml, /<w:pgSz[^>]*w:w="12240"/);
  assert.match(xml, /<w:pgSz[^>]*w:h="15840"/);
  assert.match(xml, /<w:pgMar[^>]*w:top="1440"/);
  assert.match(xml, /<w:pgMar[^>]*w:left="1440"/);
});

test('every table declares column widths that add up to the text width', async () => {
  const bytes = await renderResearchDocx({ client, round: openRound(study()), renderedAt });
  const xml = entry(bytes, 'word/document.xml');
  const all = tables(xml);
  assert.ok(all.length >= 3, 'the stats, the grid and the appendix are all tables');
  for (const tbl of all) {
    const cols = gridCols(tbl);
    assert.ok(cols.length, 'a table declares its grid');
    assert.equal(sum(cols), 9360, `columns sum to the text width, not ${sum(cols)}`);
  }
  // A cell without its own width is laid out by Word's guess, which is how a
  // table walks off the page.
  const cells = [...xml.matchAll(/<w:tc>(.*?)<\/w:tc>/gs)].map((m) => m[1]);
  assert.ok(cells.length > 10);
  // docx writes the continuation of a vertical merge itself, and that cell
  // carries the width of the one it continues.
  for (const c of cells.filter((c) => !c.includes('<w:vMerge w:val="continue"'))) assert.match(c, /<w:tcW[^>]*w:type="dxa"/);
});

test('the grid draws one row per search, with the page bands merged down the margin', async () => {
  const round = openRound(study());
  const bytes = await renderResearchDocx({ client, round, renderedAt });
  const xml = entry(bytes, 'word/document.xml');
  const grid = reportLines({ client, round, renderedAt }).find((l) => l.kind === 'grid');
  const n = grid.labels.length;
  // The grid is the table whose first column is the narrow page-number margin.
  const tbl = tables(xml).find((t) => gridCols(t)[0] === 500);
  assert.ok(tbl, 'the grid table');
  const rows = rowCount(tbl);
  assert.equal(rows, n + 1, 'a header row and one row per search');
  assert.equal(gridCols(tbl).length, n + 2, 'the page column, the label column and one per search');
  const text = textOf(xml);
  for (let i = 0; i < n; i += 1) assert.ok(text.includes(`${i + 1}  ${grid.labels[i]}`), `row ${i + 1} is labelled`);
  // A page holding two searches spans two rows, which is a vertical merge.
  assert.ok(grid.blocks.some((b) => b > 1), 'the fixture has a page of two searches');
  assert.match(tbl, /<w:vMerge/);
  // The shades are the bands the engine computed; the diagonal is its own.
  assert.ok(tbl.includes('w:fill="EDEDED"'), 'the diagonal is shaded');
  assert.ok(/w:fill="(EBC7B6|8FB8A0|3E7C5B)"/.test(tbl), 'an alike pair is shaded');
  assert.match(text, /Businesses the two searches have in common/);
  for (const key of ['none', 'a little', 'enough to share a page', 'nearly the same']) assert.ok(text.includes(key), `legend says ${key}`);
});

test('the document has no shading, breaks or bullets Word renders wrong', async () => {
  const bytes = await renderResearchDocx({ client, round: openRound(study()), renderedAt });
  const xml = entry(bytes, 'word/document.xml');
  // SOLID shading paints the cell in the foreground colour, which comes out
  // black; CLEAR is the one that shows the fill.
  assert.ok(!/w:val="solid"/.test(xml), 'no SOLID shading');
  assert.ok(!xml.includes('•'), 'no literal bullet character');
  assert.ok(!xml.includes('—') && !xml.includes('&#8212;'), 'no em dash in the copy');
  // A newline inside a run is not a line break in Word; it is whitespace.
  for (const m of xml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs)) assert.ok(!m[1].includes('\n'), 'no newline inside a run');
  assert.ok(xml.includes('Georgia') || entry(bytes, 'word/styles.xml').includes('Georgia'), 'the body face is named');
  assert.ok(entry(bytes, 'word/styles.xml').includes('Arial'), 'the heading face is named');
});

test('a round with no captures still renders', async () => {
  const bytes = await renderResearchDocx({ client, round: { ...emptyRound('r1'), keywords: [], serps: {} }, renderedAt });
  assert.equal(Buffer.from(bytes.slice(0, 2)).toString(), 'PK');
  const xml = entry(bytes, 'word/document.xml');
  assert.ok(textOf(xml).includes('No searches have been captured yet.'));
});
