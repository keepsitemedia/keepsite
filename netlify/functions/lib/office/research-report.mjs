// The client-facing report. reportLines() decides what is said, as a list
// of headings, paragraphs and tables, and renderResearchReport() draws it;
// the split lets a test read the words without decoding a PDF stream.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Writer, SIZES } from './pdf.mjs';
import { pairs, pageList } from './research.mjs';
import { todayIn, formatYmd } from './dates.mjs';

// The round's start date, not today's: a report re-rendered next week is still
// that round's report, and two rounds must not overwrite one another. The
// round's date is read as the calendar day already recorded in its ISO
// timestamp, not reinterpreted through Denver's offset — a round begun late
// at night must not name its report for the day the server considers "today".
export const reportName = (now, round) => `search-research-${round?.startedAt ? todayIn('UTC', new Date(round.startedAt)) : todayIn(undefined, now)}.pdf`;

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
  const day = formatYmd(todayIn(undefined, renderedAt));

  h1('Search research');
  p(`${client.business} · ${client.tier ?? ''} · ${day}`.replace(' ·  ·', ' ·'));
  p('Before we lay out a site we find out what people type into Google when they need what you do, and which of those searches Google answers with the same pages. Searches that share results belong on one page. Searches that do not need pages of their own. This report shows what we found and the page list that comes out of it.');
  if (round.notes?.intro) p(round.notes.intro);

  h2('What we did');
  p(`We searched ${plural(captured.length, 'term')} drawn from your questionnaire, each under the same conditions, and kept the top eight organic results for every one, ignoring ads and map listings. Then we compared every pair of searches: ${plural(ps.length, 'comparison')} in all. Seven or more shared results out of eight means Google treats the two searches as the same question. Three to six is a gray zone we decide together. Two or fewer means different questions, so different pages.`);

  h2('The pages we recommend');
  if (!pageRows.length) p('No searches have been captured yet.');
  for (const row of pageRows) {
    const ids = row.keywords;
    const inside = ps.filter((x) => ids.includes(x.a.id) && ids.includes(x.b.id));
    const strong = inside.filter((x) => x.signal === 'strong').length;
    const results = ids.flatMap((id) => round.serps[id]?.results ?? []);
    const doms = topDomains(results, 3).map(([d]) => d);
    p(`${row.title}${row.type ? ` — ${row.type}` : ''}`);
    small(`Targets: ${ids.map(text).join('; ')}`);
    const why = ids.length === 1
      ? 'This search shares few results with any other, so it earns a page of its own.'
      : `${plural(strong, 'pair', 'pairs')} of these searches share seven or more of their top eight results, so one page can answer all of them.`;
    small(`${why}${doms.length ? ` The businesses that rank most across them: ${doms.join(', ')}.` : ''}${row.note ? ` ${row.note}` : ''}`);
  }

  const decided = ps.filter((x) => x.signal === 'gray' && x.read && x.read.sameCluster !== 'Undecided');
  h2('Decisions from our call');
  if (!decided.length) p('Every pair fell clearly on one side, so nothing needed a judgment call.');
  else table([['Searches', 'Shared results', 'Read', 'Note'], ...decided.map((x) => [`${x.a.text} / ${x.b.text}`, `${x.exactUrl} of 8`, `${x.read.human}${x.read.sameCluster === 'Yes' ? ', same page' : ', separate pages'}`, x.read.notes ?? ''])]);

  h2('What we saw');
  for (const row of pageRows) {
    const results = row.keywords.flatMap((id) => round.serps[id]?.results ?? []);
    const doms = topDomains(results);
    if (!doms.length) continue;
    p(row.title);
    table([['Business', 'Appearances'], ...doms.map(([d, n]) => [d, String(n)])]);
  }

  h2('Appendix: every search');
  for (const k of captured) {
    const serp = round.serps[k.id];
    p(`${k.text} · captured ${formatYmd(todayIn(undefined, new Date(serp.capturedAt)))}`);
    table([['#', 'Title', 'Business', 'Page type'], ...serp.results.map((x) => [String(x.rank), x.title, x.domain, x.pageType])]);
  }
  if (round.notes?.closing) p(round.notes.closing);
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
  }
  return doc.save();
}
