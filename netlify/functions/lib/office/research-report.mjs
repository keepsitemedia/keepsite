// The client-facing report. reportLines() decides what is said, as a list
// of headings, paragraphs and tables, and renderResearchReport() draws it;
// the split lets a test read the words without decoding a PDF stream.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Writer, SIZES } from './pdf.mjs';
import { pairs, pageList } from './research.mjs';
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

export function reportLines({ client, round, renderedAt }) {
  const L = [];
  const h1 = (text) => L.push({ kind: 'h1', text });
  const h2 = (text) => L.push({ kind: 'h2', text });
  const p = (text) => L.push({ kind: 'p', text });
  const small = (text) => L.push({ kind: 'small', text });
  const table = (rows) => L.push({ kind: 'table', rows });
  const byId = new Map(round.keywords.map((k) => [k.id, k]));
  const text = (id) => byId.get(id)?.text ?? id;
  const ps = pairs(round);
  const pageRows = pageList(round);
  const captured = round.keywords.filter((k) => round.serps[k.id]);
  const decided = ps.filter((x) => (x.signal === 'gray' || x.signal === 'unmeasurable') && x.read && x.read.sameCluster !== 'Undecided');
  const day = formatYmd(todayIn(undefined, renderedAt));
  const started = formatYmd(todayIn(undefined, new Date(round.startedAt)));
  const closed = round.closedAt ? formatYmd(todayIn(undefined, new Date(round.closedAt))) : null;

  // Page one is the whole report for the reader with other things to do:
  // what this is, three numbers, one figure, the page list. Everything that
  // shows the working sits behind a line that says they can stop.
  h1('Search research');
  // The round's own dates, not just the print date: two rounds for the same
  // client can otherwise print an identical header on the same day.
  p(`${client.business} · ${client.tier ?? ''} · Round started ${started}${closed ? `, closed ${closed}` : ''} · Printed ${day}`.replace(' ·  ·', ' ·'));
  p('Before we build anything, we look at what people actually type into Google when they need what you do, and which of those searches Google answers with the same pages. Searches that share results share a page. Searches that do not get their own. This is what we found, and the page list that comes out of it.');
  if (round.notes?.intro) p(round.notes.intro);

  L.push({ kind: 'stats', items: [
    [String(captured.length), captured.length === 1 ? 'search' : 'searches'],
    [String(pageRows.length), pageRows.length === 1 ? 'page' : 'pages'],
    [String(decided.length), decided.length === 1 ? 'decision we made together' : 'decisions we made together'],
  ] });

  h2('Your pages');
  if (!pageRows.length) p('No searches have been captured yet.');
  else {
    p('Each bar is one page. Its length is how many searches that page answers.');
    L.push({ kind: 'bars', rows: pageRows.map((row) => ({ label: row.title, value: row.keywords.length })) });
  }
  for (const row of pageRows) {
    const ids = row.keywords;
    p(row.title);
    small(`Answers: ${ids.map(text).join('; ')}`);
    // 'strong' pairs share most of the smaller side's businesses, directories
    // aside. Said in words, never as a count the client might try to
    // reproduce from the appendix.
    const why = ids.length === 1
      ? 'No other search brings up the same businesses, so this one needs a page of its own.'
      : `These ${plural(ids.length, 'search', 'searches')} bring up mostly the same businesses. One page can answer all of them.`;
    small(`${why}${row.note ? ` ${row.note}` : ''}`);
  }

  h2('Decisions we made together');
  if (!decided.length) p('Every pair fell clearly on one side, so nothing needed a judgment call.');
  else table([['Searches', 'What we saw', 'What we decided', 'Note'], ...decided.map((x) => [`${x.a.text} / ${x.b.text}`, x.signal === 'unmeasurable' ? 'too few businesses to compare' : `${x.sharedBusinesses} of ${x.denominator} businesses in common, ${x.sharedDirectories} directories`, `${x.read.human}${x.read.sameCluster === 'Yes' ? ', same page' : ', separate pages'}`, x.read.notes ?? ''])]);

  h2('How we did it');
  p(`We searched ${plural(captured.length, 'term')} from your questionnaire, the same way each time, and kept the first eight real results for each: no ads, no map pins. Then we compared every pair, ${plural(ps.length, 'comparison')} in all. Directory sites — review sites, forums, social feeds — rank for nearly everything, so they say little about any one search. We compare the individual businesses instead. When mostly the same businesses answer two searches, that is one question and one page. When they differ, it is two. Where the businesses do not settle it, we look at what kind of page ranks, homepages or blog posts, and let that decide.`);
  if (round.notes?.closing) p(round.notes.closing);

  p('You can stop here. Everything after this is our work, shown.');

  h2('Appendix: what we saw');
  for (const row of pageRows) {
    const results = row.keywords.flatMap((id) => round.serps[id]?.results ?? []);
    const doms = topDomains(results);
    if (!doms.length) continue;
    p(`${row.title}${row.type ? ` — mostly ${row.type.toLowerCase()} results` : ''}`);
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
    else if (line.kind === 'bars') w.bars(line.rows);
  }
  return doc.save();
}
