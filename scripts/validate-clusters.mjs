// Scores the engine's page list against an independent clustering of the
// same keywords, and sweeps the cut to find where they agree most. Run:
//   node scripts/validate-clusters.mjs <export.json> <external.csv>
// external.csv: two columns, keyword and cluster, from Keyword Insights,
// Keyword Cupid, ContentGecko or any SERP-overlap tool. Keywords match on
// normalized text; unmatched ones are listed and left out of the score.
import { readFileSync } from 'node:fs';
import { migrateStudy, openRound, matrix, similarities, cluster, normalizeQuery, CUT } from '../netlify/functions/lib/office/research.mjs';

const [file, external] = process.argv.slice(2);
if (!file || !external) { console.error('usage: node scripts/validate-clusters.mjs <export.json> <external.csv>'); process.exit(1); }

const docs = JSON.parse(readFileSync(file, 'utf8'));
const doc = Array.isArray(docs) ? docs[0] : docs;
const round = openRound(migrateStudy(doc));
const m = matrix(round);
const sims = similarities(m);
const ids = m.keywords.map((k) => k.id);
const textOf = new Map(m.keywords.map((k) => [normalizeQuery(k.text), k.id]));

// keyword,cluster with optional quotes; a header row is skipped if its first
// cell says keyword.
const theirs = new Map();
const unmatched = [];
let skipped = 0;
for (const line of readFileSync(external, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  // The regex matches the empty string after the last comma, so every line
  // ends in a cell that is not there.
  const cells = (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])
    .map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim())
    .filter(Boolean);
  if (/^keyword$/i.test(cells[0] ?? '')) continue;
  if (cells.length < 2) { skipped += 1; continue; }
  const id = textOf.get(normalizeQuery(cells[0]));
  if (id) theirs.set(id, cells[1]); else unmatched.push(cells[0]);
}
const scored = ids.filter((id) => theirs.has(id));
console.log(`${scored.length} of ${ids.length} keywords matched the external file${unmatched.length ? `; not in the study: ${unmatched.join('; ')}` : ''}`);
if (skipped) console.log(`skipped ${skipped} line${skipped === 1 ? '' : 's'} with fewer than two cells`);
const missing = ids.filter((id) => !theirs.has(id)).map((id) => m.keywords.find((k) => k.id === id).text);
if (missing.length) console.log(`not in the external file: ${missing.join('; ')}`);
// Every score below needs pairs; one keyword makes none, and the ARI prints
// NaN rather than saying so.
if (scored.length < 2) { console.log('fewer than two keywords matched; nothing to score'); process.exit(1); }

const together = (labels) => (a, b) => labels.get(a) === labels.get(b);
const pairsOf = (xs) => { const out = []; for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) out.push([xs[i], xs[j]]); return out; };

// Pair agreement: the share of keyword pairs both tools put together or
// both put apart. Adjusted Rand index: the same idea corrected for what
// chance alone would score, so 0 is random and 1 is identical.
function score(ours) {
  const same = together(ours); const ext = together(theirs);
  const ps = pairsOf(scored);
  let a = 0; let b = 0; let c = 0; let d = 0;
  for (const [x, y] of ps) {
    const s = same(x, y); const e = ext(x, y);
    if (s && e) a += 1; else if (s && !e) b += 1; else if (!s && e) c += 1; else d += 1;
  }
  const agreement = ps.length ? (a + d) / ps.length : 1;
  const n = ps.length;
  const expected = ((a + b) * (a + c)) / n;
  const max = ((a + b) + (a + c)) / 2;
  const ari = max === expected ? 1 : (a - expected) / (max - expected);
  return { agreement, ari };
}

const labelsAt = (cut) => {
  const { groups } = cluster(m, sims, cut);
  const labels = new Map();
  groups.forEach((g, i) => g.forEach((id) => labels.set(id, i)));
  return labels;
};

console.log(`\nat the current cut ${CUT}:`);
const now = score(labelsAt(CUT));
console.log(`  pair agreement ${(now.agreement * 100).toFixed(1)}%  adjusted Rand ${now.ari.toFixed(3)}`);

console.log('\nsweep:');
let best = { cut: CUT, ...now };
for (let cut = 0.05; cut <= 0.6001; cut += 0.05) {
  const s = score(labelsAt(cut));
  const { groups } = cluster(m, sims, cut);
  console.log(`  cut ${cut.toFixed(2)}  pages ${String(groups.length).padStart(2)}  agreement ${(s.agreement * 100).toFixed(1).padStart(5)}%  ARI ${s.ari.toFixed(3)}`);
  if (s.ari > best.ari + 1e-9) best = { cut, ...s };
}
console.log(`\nbest ARI ${best.ari.toFixed(3)} at cut ${best.cut.toFixed(2)}; if several cuts tie, take the middle of the plateau and record that it is flat.`);
