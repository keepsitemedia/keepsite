// The report as a Word file. The PDF is print-ready and fixed; the owner
// edits a sentence before a client sees it, so the same reportLines() is
// rendered a second way rather than the copy being written twice.
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from 'docx';
import { reportLines, reportName } from './research-report.mjs';

export const reportDocxName = (now, round) => reportName(now, round).replace(/\.pdf$/, '.docx');

const PAGE = { width: 12240, height: 15840 };
const MARGIN = 1440;
const CONTENT = PAGE.width - 2 * MARGIN;
const BODY = 'Georgia';
const HEAD = 'Arial';
const GREY = '555555';

// The PDF's own shades, as hex: none, a little, enough to share a page,
// nearly the same, and the diagonal.
const SHADES = [null, 'EBC7B6', '8FB8A0', '3E7C5B'];
const DIAGONAL = 'EDEDED';
const LEGEND = [[SHADES[0], 'none'], [SHADES[1], 'a little'], [SHADES[2], 'enough to share a page'], [SHADES[3], 'nearly the same']];

const NO_EDGE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const HAIRLINE = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
// The rule between two page bands, the one line in the grid that has to be
// read as a boundary rather than as another cell edge.
const BAND_EDGE = { style: BorderStyle.SINGLE, size: 12, color: '111111' };
const edges = (edge) => ({ top: edge, bottom: edge, left: edge, right: edge });
const OPEN = edges(NO_EDGE);
const BOXED = edges(HAIRLINE);

// SOLID paints the cell in the foreground colour, which comes out black.
const fillOf = (fill) => (fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined);

// Word lays a table out from whole twips, and a column set that does not add
// up to the text width is what walks a table off the page: every column is
// floored and the remainder goes to the last.
function split(fractions, total = CONTENT) {
  const w = fractions.map((f) => Math.floor(total * f));
  w[w.length - 1] = total - w.slice(0, -1).reduce((a, b) => a + b, 0);
  return w;
}

// The same column splits Writer.table falls back to, as fractions.
const DEFAULTS = { __proto__: null, 2: [0.4, 0.6], 3: [0.34, 0.36, 0.3], 4: [0.06, 0.46, 0.3, 0.18] };

const cellText = (text, opts = {}) => new Paragraph({ spacing: { after: 0 }, ...opts, children: [new TextRun({ text: String(text ?? ''), ...(opts.run ?? {}) })] });

const cell = (children, { width, borders = BOXED, fill = null, ...rest }) =>
  new TableCell({ width: { size: width, type: WidthType.DXA }, borders, shading: fillOf(fill), children, ...rest });

const tableOf = (columnWidths, rows, borders = BOXED) =>
  new Table({ columnWidths, width: { size: CONTENT, type: WidthType.DXA }, borders, rows });

// A row of big numbers with its caption under each, the whole story for the
// reader who stops after the first page. A borderless table is how Word
// keeps them side by side.
function statsTable(items) {
  const widths = split(items.map(() => 1 / items.length));
  return tableOf(widths, [new TableRow({ children: items.map(([value, label], i) => cell([
    cellText(value, { run: { font: HEAD, size: 48, bold: true } }),
    cellText(label, { style: 'Small' }),
  ], { width: widths[i], borders: OPEN })) })], OPEN);
}

function dataTable(rows, fractions) {
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = split(fractions ?? DEFAULTS[cols] ?? Array.from({ length: cols }, () => 1 / cols));
  return tableOf(widths, rows.map((row, ri) => new TableRow({
    children: row.map((text, ci) => cell([cellText(text, { run: { size: 19, bold: ri === 0 } })], { width: widths[ci], fill: ri === 0 ? 'F2F2F2' : null })),
    tableHeader: ri === 0,
  })));
}

// The study as squares, the figure the PDF draws, rebuilt out of table cells
// so the owner can retype a search without redrawing anything. Word cannot
// rule the diagonal outline of a page block cleanly, so the bands are marked
// by their boundaries alone; the caption already says a band is a page.
function gridTable({ labels, bands, blocks }) {
  const n = labels.length;
  const pageW = 500;
  const labelW = 2400;
  const each = Math.floor((CONTENT - pageW - labelW) / n);
  const squares = Array.from({ length: n }, (_, j) => (j === n - 1 ? CONTENT - pageW - labelW - each * (n - 1) : each));
  const columnWidths = [pageW, labelW, ...squares];

  const bandOf = [];
  const starts = [];
  let at = 0;
  for (const len of blocks) { starts.push(at); for (let k = 0; k < len; k += 1) bandOf.push(starts.length - 1); at += len; }
  const ends = new Set(blocks.map((len, b) => starts[b] + len - 1));
  const lastOfBand = (i) => ends.has(i);

  const header = new TableRow({ children: [
    cell([cellText('')], { width: pageW, borders: OPEN }),
    cell([cellText('')], { width: labelW, borders: OPEN }),
    ...squares.map((w, j) => cell([cellText(j + 1, { style: 'Small', alignment: AlignmentType.CENTER })], { width: w, borders: OPEN })),
  ], tableHeader: true });

  const rows = labels.map((label, i) => {
    const bottom = lastOfBand(i) ? BAND_EDGE : NO_EDGE;
    const band = bandOf[i];
    const children = [];
    if (starts[band] === i) {
      children.push(cell([cellText(band + 1, { run: { font: HEAD, bold: true }, alignment: AlignmentType.CENTER })], {
        width: pageW, borders: { ...OPEN, bottom }, rowSpan: blocks[band], verticalAlign: VerticalAlign.CENTER,
      }));
    }
    children.push(cell([cellText(`${i + 1}  ${label}`, { style: 'Small' })], { width: labelW, borders: { ...OPEN, bottom } }));
    for (let j = 0; j < n; j += 1) {
      if (j > i) { children.push(cell([cellText('')], { width: squares[j], borders: OPEN })); continue; }
      children.push(cell([cellText('')], {
        width: squares[j],
        fill: j === i ? DIAGONAL : SHADES[bands[i][j]],
        // A band's own right edge is drawn only under it, where the PDF's
        // vertical rule starts.
        borders: { ...BOXED, bottom: lastOfBand(i) ? BAND_EDGE : HAIRLINE, right: ends.has(j) && j < i ? BAND_EDGE : HAIRLINE },
      }));
    }
    return new TableRow({ children });
  });
  return tableOf(columnWidths, [header, ...rows], OPEN);
}

function legendTable() {
  const widths = split(LEGEND.map(() => 1 / LEGEND.length));
  return tableOf(widths, [new TableRow({ children: LEGEND.map(([fill, label], i) => cell([
    new Paragraph({ spacing: { after: 0 }, children: [
      new TextRun({ text: ' ', shading: fillOf(fill), border: fill ? undefined : { style: BorderStyle.SINGLE, size: 4, color: '999999' } }),
      new TextRun({ text: `  ${label}`, size: 18, color: GREY }),
    ] }),
  ], { width: widths[i], borders: OPEN })) })], OPEN);
}

// Two tables with nothing between them are one table in Word, and a table is
// where the PDF leaves a line of air.
const SPACER = () => new Paragraph({ spacing: { after: 0 }, children: [] });

export async function renderResearchDocx({ client, round, renderedAt = new Date() }) {
  const children = [];
  for (const line of reportLines({ client, round, renderedAt })) {
    if (line.kind === 'h1') children.push(new Paragraph({ text: line.text, heading: HeadingLevel.TITLE }));
    else if (line.kind === 'h2') children.push(new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_1 }));
    else if (line.kind === 'p') children.push(new Paragraph({ text: line.text }));
    else if (line.kind === 'small') children.push(new Paragraph({ text: line.text, style: 'Small' }));
    else if (line.kind === 'stats') children.push(statsTable(line.items), SPACER());
    else if (line.kind === 'table') children.push(dataTable(line.rows, line.widths), SPACER());
    else if (line.kind === 'grid') {
      children.push(gridTable(line));
      children.push(new Paragraph({ text: 'Businesses the two searches have in common', style: 'Small' }));
      children.push(legendTable(), SPACER());
    }
  }
  const doc = new Document({
    creator: 'Keepsite Media',
    title: 'Search research',
    description: client.business,
    styles: {
      default: {
        document: { run: { font: BODY, size: 22, color: '111111' }, paragraph: { spacing: { after: 120, line: 276 } } },
        title: { run: { font: HEAD, size: 40, bold: true, color: '111111' }, paragraph: { spacing: { after: 240 } } },
        heading1: { run: { font: HEAD, size: 28, bold: true, color: '111111' }, paragraph: { spacing: { before: 240, after: 120 } } },
      },
      paragraphStyles: [{
        id: 'Small', name: 'Small', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: BODY, size: 18, color: GREY }, paragraph: { spacing: { after: 40 } },
      }],
    },
    sections: [{ properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
