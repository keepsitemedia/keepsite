// The client-facing report. reportLines() decides what is said, as a list
// of headings, paragraphs and tables, and renderResearchReport() draws it;
// the split lets a test read the words without decoding a PDF stream.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Writer, SIZES } from './pdf.mjs';
import { pagesOf, studyView, band } from './research.mjs';
import { todayIn, formatYmd } from './dates.mjs';

// The round's start date, not today's: a report re-rendered next week is still
// that round's report, and two rounds must not overwrite one another.
export const reportName = (now, round) => `search-research-${todayIn(undefined, new Date(round?.startedAt ?? now))}.pdf`;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function topDomains(results, limit = 5) {
  const counts = new Map();
  for (const x of results) counts.set(x.domain, (counts.get(x.domain) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

const GRID_ON_PAGE_ONE = 30;

const vol = (k) => (k?.volume ? (k.volume.min === k.volume.max ? String(k.volume.max) : `${k.volume.min} – ${k.volume.max}`) : null);

export function reportLines({ client, round, renderedAt }) {
  const L = [];
  const h1 = (text) => L.push({ kind: 'h1', text });
  const h2 = (text) => L.push({ kind: 'h2', text });
  const p = (text) => L.push({ kind: 'p', text });
  const small = (text) => L.push({ kind: 'small', text });
  const table = (rows) => L.push({ kind: 'table', rows });
  const byId = new Map(round.keywords.map((k) => [k.id, k]));
  const text = (id) => byId.get(id)?.text ?? id;
  const withVolume = (id) => { const v = vol(byId.get(id)); return v ? `${text(id)} (${v} a month)` : text(id); };
  const pages = pagesOf(round);
  const standing = pages.filter((x) => x.standing !== 'low');
  const low = pages.filter((x) => x.standing === 'low');
  const titles = new Map(pages.map((x) => [x.id, x.title]));
  const view = studyView(round, pages);
  const captured = round.keywords.filter((k) => round.serps[k.id]);
  const volumeLoaded = round.keywords.some((k) => k.volume);
  const edited = pages.filter((x) => x.auto === false);
  const day = formatYmd(todayIn(undefined, renderedAt));
  const started = formatYmd(todayIn(undefined, new Date(round.startedAt)));
  const closed = round.closedAt ? formatYmd(todayIn(undefined, new Date(round.closedAt))) : null;
  const grid = {
    kind: 'grid',
    labels: view.order.map(text),
    bands: view.order.map((a) => view.order.map((b) => (a === b ? 0 : band(view.sims[a][b])))),
    blocks: view.blocks.map((b) => b.length),
  };
  const gridOnPageOne = view.order.length > 0 && view.order.length <= GRID_ON_PAGE_ONE;

  // Page one is the whole report for the reader with other things to do:
  // what this is, the numbers, the grid, the page list. Everything that
  // shows the working sits behind a line that says they can stop.
  h1('Search research');
  p(`${client.business} · ${client.tier ?? ''} · Round started ${started}${closed ? `, closed ${closed}` : ''} · Printed ${day}`.replace(' ·  ·', ' ·'));
  p('Before we build anything, we look at what people actually type into Google when they need what you do, and which of those searches Google answers with the same businesses. Searches answered by the same businesses share a page. Searches that are not get their own. This is what we found, and the page list that comes out of it.');
  if (round.notes?.intro) p(round.notes.intro);

  // The searches set aside, not the pages they would have made: the label
  // says searches, and a page can hold several.
  const lowKeywords = low.flatMap((x) => x.keywords).length;
  L.push({ kind: 'stats', items: [
    [String(captured.length), captured.length === 1 ? 'search' : 'searches'],
    [String(standing.length), standing.length === 1 ? 'page' : 'pages'],
    ...(volumeLoaded ? [[String(lowKeywords), lowKeywords === 1 ? 'search not worth a page' : 'searches not worth a page']] : []),
  ] });

  if (gridOnPageOne) {
    p('Each square is two searches. The darker it is, the more the same businesses answer both. The outlined blocks are the pages.');
    L.push(grid);
  } else if (view.order.length) {
    p('The study grid is in the appendix; with this many searches it needs a page of its own.');
  }

  h2('Your pages');
  if (!standing.length) p('No searches have been captured yet.');
  for (const row of standing) {
    p(`${row.title}${row.kind ? ` · ${row.kind}` : ''}`);
    small(`Answers: ${row.keywords.map(withVolume).join('; ')}`);
    if (row.reason) small(row.reason);
    if (row.confidence?.level === 'close') small(`This one could also sit with ${titles.get(row.confidence.near) ?? 'another page'}; the businesses differ enough to keep it apart.`);
    if (row.note) small(row.note);
  }

  h2('Where we used judgement');
  if (!edited.length) p('The businesses settled every page without a judgement call.');
  else table([['Page', 'Searches', 'Note'], ...edited.map((x) => [x.title, x.keywords.map(text).join('; '), x.note ?? ''])]);

  if (volumeLoaded && low.length) {
    h2('Not built for');
    p(`${low.flatMap((x) => x.keywords).map(withVolume).join('; ')}: searched too rarely to build for. They stay in the study, and a later round can bring them back.`);
  }

  h2('How we did it');
  p(`We searched ${plural(captured.length, 'term')} from your questionnaire, the same way each time, and kept the first eight real results for each: no ads, no map pins. For each search we look at which businesses Google ranks and how high. A business that ranks for nearly every search in your field, a listing site or a big competitor, tells us little about any one search, so it counts for little. The businesses that show up for some searches and not others are what tell us two searches mean the same thing. When two searches are answered by mostly the same businesses, they are one question and one page answers both. When they are not, they need their own pages. Search volume tells us which pages are worth building at all.`);
  if (round.notes?.closing) p(round.notes.closing);

  p('You can stop here. Everything after this is our work, shown.');

  if (!gridOnPageOne && view.order.length) {
    h2('Appendix: the study grid');
    p('Each square is two searches. The darker it is, the more the same businesses answer both. The outlined blocks are the pages.');
    L.push(grid);
  }

  h2('Appendix: what we saw');
  for (const row of pages) {
    const results = row.keywords.flatMap((id) => round.serps[id]?.results ?? []);
    const doms = topDomains(results);
    if (!doms.length) continue;
    p(`${row.title}${row.kind ? ` · ${row.kind.toLowerCase()}` : ''}`);
    table([['Business', 'Appearances'], ...doms.map(([d, n]) => [d, String(n)])]);
  }

  h2('Appendix: every search');
  for (const k of captured) {
    const serp = round.serps[k.id];
    p(`${k.text} · captured ${formatYmd(todayIn(undefined, new Date(serp.capturedAt)))}`);
    table([['#', 'Title', 'Business', 'Page type'], ...serp.results.map((x) => [String(x.rank), x.title, x.domain, x.pageType])]);
  }
  return L;
}

export async function renderResearchReport({ client, round, renderedAt = new Date() }) {
  const doc = await PDFDocument.create();
  doc.setCreationDate(renderedAt);
  doc.setModificationDate(renderedAt);
  const fonts = { body: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, fonts);
  w.newPage();
  for (const line of reportLines({ client, round, renderedAt })) {
    if (line.kind === 'h1') w.text(line.text, { font: fonts.bold, size: SIZES.title });
    else if (line.kind === 'h2') w.text(line.text, { font: fonts.bold, size: SIZES.h1 });
    else if (line.kind === 'p') w.text(line.text);
    else if (line.kind === 'small') w.text(line.text, { size: SIZES.small });
    else if (line.kind === 'table') w.table(line.rows);
    else if (line.kind === 'stats') w.stats(line.items);
    else if (line.kind === 'grid') w.grid(line);
  }
  return doc.save();
}
