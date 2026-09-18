// Measures the business-overlap ratio across every pair in an exported study,
// so the thresholds in research.mjs are set from data rather than chosen
// because they sound reasonable. Run: node scripts/calibrate-pairs.mjs <export.json>
import { readFileSync } from 'node:fs';
import { openRound, migrateStudy, normalizeUrl } from '../netlify/functions/lib/office/research.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/calibrate-pairs.mjs <export.json>'); process.exit(1); }

const businesses = (results) => results.filter((r) => r.pageType !== 'Directory');
const rows = [];
for (const doc of JSON.parse(readFileSync(file, 'utf8'))) {
  const round = openRound(migrateStudy(doc));
  const ks = round.keywords.filter((k) => round.serps[k.id]);
  for (let i = 0; i < ks.length; i += 1) {
    for (let j = i + 1; j < ks.length; j += 1) {
      const a = businesses(round.serps[ks[i].id].results);
      const b = businesses(round.serps[ks[j].id].results);
      const denominator = Math.min(a.length, b.length);
      const set = new Set(b.map((x) => normalizeUrl(x.url)));
      const shared = a.filter((x) => set.has(normalizeUrl(x.url))).length;
      rows.push({
        slug: doc.slug, pair: `${ks[i].text} · ${ks[j].text}`,
        a: a.length, b: b.length, denominator, shared,
        ratio: denominator ? shared / denominator : null,
      });
    }
  }
}

const measurable = rows.filter((r) => r.denominator >= 3);
const unmeasurable = rows.length - measurable.length;
console.log(`${rows.length} pairs across ${new Set(rows.map((r) => r.slug)).size} studies`);
console.log(`${unmeasurable} would be unmeasurable (fewer than 3 businesses on one side)`);
if (!measurable.length) { console.log('Nothing measurable: this niche may be too directory-heavy for URL comparison.'); process.exit(0); }

const sorted = measurable.slice().sort((x, y) => x.ratio - y.ratio);
console.log('\nratio distribution, lowest first:');
for (const r of sorted) console.log(`  ${r.ratio.toFixed(2)}  ${r.shared}/${r.denominator}  ${r.pair}`);

// The widest gap between consecutive ratios is where the data separates, if it
// separates anywhere. A tiny largest gap means there is no natural cut and the
// provisional thresholds stay arbitrary — which is itself the finding.
let gap = { size: 0, at: null };
for (let i = 1; i < sorted.length; i += 1) {
  const size = sorted[i].ratio - sorted[i - 1].ratio;
  if (size > gap.size) gap = { size, at: (sorted[i].ratio + sorted[i - 1].ratio) / 2 };
}
console.log(`\nwidest gap: ${gap.size.toFixed(3)} around ratio ${gap.at?.toFixed(2) ?? 'n/a'}`);
console.log(`provisional cuts are 0.33 and 0.67 — compare against the gap above`);
