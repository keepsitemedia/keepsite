// The client-facing report. reportLines() decides what is said, as a list
// of headings, paragraphs and tables, and renderResearchReport() draws it;
// the split lets a test read the words without decoding a PDF stream.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Writer, SIZES } from './pdf.mjs';
import { pagesOf, studyView, band, FLOOR } from './research.mjs';
import { todayIn, formatYmd } from './dates.mjs';

// The round's start date, not today's: a report re-rendered next week is still
// that round's report, and two rounds must not overwrite one another.
export const reportName = (now, round) => `search-research-${todayIn(undefined, new Date(round?.startedAt ?? now))}.pdf`;

function topDomains(results, limit = 5) {
  const counts = new Map();
  for (const x of results) counts.set(x.domain, (counts.get(x.domain) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

// What the client is told we will make, in the words they would use for it.
const KIND_LABEL = { Homepage: 'your homepage', 'Service page': 'a service page', 'Location page': 'a location page', Article: 'an article', Other: 'a page' };

// Planner reports nothing for a search too rare to count, which the import
// stores as a zero from source 'none'; that is not the same as a measured
// zero, but the client hears the same thing either way.
const volumeWords = (k) => {
  const v = k?.volume;
  if (!v) return null;
  if (v.source === 'none' || v.max === 0) return 'too few for Google to count';
  if (v.max < FLOOR) return `under ${FLOOR} a month`;
  if (v.min === v.max) return `about ${v.max} a month`;
  return `${v.min} to ${v.max} a month`;
};

export function reportLines({ client, round, renderedAt }) {
  const L = [];
  const h1 = (text) => L.push({ kind: 'h1', text });
  const h2 = (text) => L.push({ kind: 'h2', text });
  const p = (text) => L.push({ kind: 'p', text });
  const small = (text) => L.push({ kind: 'small', text });
  const table = (rows) => L.push({ kind: 'table', rows });
  const byId = new Map(round.keywords.map((k) => [k.id, k]));
  const text = (id) => byId.get(id)?.text ?? id;
  const withVolume = (id) => { const v = volumeWords(byId.get(id)); return v ? `${text(id)} (${v})` : text(id); };
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

  // Page one is the whole report for the reader with other things to do:
  // what this is, the numbers, the page list. Everything that shows the
  // working, the grid included, sits behind a line that says they can stop.
  h1('Search research');
  p(`${client.business} · ${client.tier ?? ''} · Research started ${started}${closed ? `, finished ${closed}` : ''} · Printed ${day}`.replace(' ·  ·', ' ·'));
  p('This is the plan for your website\'s pages, worked out from what people actually type into Google when they need what you do. We build every page on this list. You don\'t need to do anything with it. If a page you expected is missing, it is under "Searches we\'re leaving out" and we can add it back.');
  if (round.notes?.intro) p(round.notes.intro);

  // The searches set aside, not the pages they would have made: the label
  // says searches, and a page can hold several.
  const lowKeywords = low.flatMap((x) => x.keywords).length;
  L.push({ kind: 'stats', items: [
    [String(captured.length), captured.length === 1 ? 'search we looked at' : 'searches we looked at'],
    [String(standing.length), standing.length === 1 ? "page we'll build" : "pages we'll build"],
    ...(volumeLoaded ? [[String(lowKeywords), lowKeywords === 1 ? "search we're leaving out" : "searches we're leaving out"]] : []),
  ] });

  h2("The pages we'll build");
  if (!standing.length) p('No searches have been captured yet.');
  for (const row of standing) {
    p(`${row.title} · ${KIND_LABEL[row.kind] ?? 'page'}`);
    small(`Brings in people searching for: ${row.keywords.map(withVolume).join('; ')}`);
    if (row.reason) small(row.reason);
    if (row.confidence?.level === 'close') small(`This one is close to ${titles.get(row.confidence.near) ?? 'another page'}. If you'd rather have one page instead of two, say so and we'll merge them.`);
    if (row.note) small(row.note);
  }

  h2('Where we made a call');
  if (!edited.length) p('The search results settled every page on their own. Nothing here needed a call from us.');
  else table([['Page', 'Searches', 'Why'], ...edited.map((x) => [x.title, x.keywords.map(text).join('; '), x.note ?? ''])]);

  if (volumeLoaded && low.length) {
    h2("Searches we're leaving out");
    p(`${low.flatMap((x) => x.keywords).map(withVolume).join('; ')}: too few people search for these each month to earn a page of their own. They stay on your list, and we check them again the next time we run this.`);
  }

  if (round.notes?.closing) p(round.notes.closing);
  p('You can stop here. Everything after this is our work, shown.');

  if (view.order.length) {
    h2('The study, in one picture');
    p(`Each row and each column is one search, numbered down the side and across the top. The grid is split into ${grid.blocks.length} bands, one per page: the searches inside a band share one page, and the page's number sits in the margin. Green squares are two searches that bring up the same businesses; the darker the green, the more alike they are. Clay marks a little overlap, not enough to share a page.`);
    L.push(grid);
  }

  h2('How we worked this out');
  p(`We searched each of the ${captured.length} terms the same way and kept the first eight real results, skipping ads and map pins. Then we looked at which businesses came up for each search. Listing sites and big names that appear for nearly everything tell us little, so we set them aside and paid attention to the businesses that show up for some searches and not others. When two searches bring up mostly the same businesses, they are one question, and one page answers both. When they don't, they need their own pages. Google's own search numbers tell us which pages are worth building at all.`);

  h2('Appendix: what we saw');
  for (const row of pages) {
    const results = row.keywords.flatMap((id) => round.serps[id]?.results ?? []);
    const doms = topDomains(results);
    if (!doms.length) continue;
    p(`${row.title} · ${KIND_LABEL[row.kind] ?? 'page'}`);
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
