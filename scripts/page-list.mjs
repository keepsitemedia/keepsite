// Print the page list a study produces under the rules as they stand now.
// Run: node scripts/page-list.mjs <research-export.json> [slug]
//
// The export is /office/api/export?type=research&format=json. The study is
// read through migrateStudy, so auto-typed results are reclassified the way
// the office does on every read — this shows what the Pages tab will show
// after a deploy, not what it showed when the report was printed.
import { readFileSync } from 'node:fs';
import { migrateStudy, openRound, pageList, pairs } from '../netlify/functions/lib/office/research.mjs';

const [file, wanted] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/page-list.mjs <export.json> [slug]'); process.exit(1); }
const docs = JSON.parse(readFileSync(file, 'utf8'));
const studies = (Array.isArray(docs) ? docs : [docs]).filter((d) => !wanted || d.slug === wanted);
if (!studies.length) { console.error(`no study${wanted ? ` for ${wanted}` : ''} in ${file}`); process.exit(1); }

for (const doc of studies) {
  const round = openRound(migrateStudy(doc));
  const text = new Map(round.keywords.map((k) => [k.id, k.text]));
  const ps = pairs(round);
  const rows = pageList(round);
  console.log(`\n${doc.slug} · round ${round.id} · ${round.keywords.length} keywords · ${ps.length} pairs`);
  const by = {};
  for (const p of ps) by[p.signal] = (by[p.signal] ?? 0) + 1;
  console.log('signals:', Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', '));
  const ask = ps.filter((p) => p.decisive);
  console.log(`decisive, still to decide: ${ask.length}`);
  for (const p of ask) console.log(`  ? ${text.get(p.a.id)}  /  ${text.get(p.b.id)}  — ${p.signal}${p.ratio != null ? ` (${p.sharedBusinesses}/${p.denominator})` : ''}`);
  console.log(`\n${rows.length} pages`);
  rows.forEach((row, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${row.title}${row.type ? `  [${row.type}]` : ''}`);
    for (const id of row.keywords) console.log(`      - ${text.get(id) ?? id}`);
  });
}
