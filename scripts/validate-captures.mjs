// Compares the bookmarklet's captures with what a SERP API returns for the
// same searches, so the research profile can be trusted or not. Run:
//   SERPAPI_KEY=... node scripts/validate-captures.mjs <export.json> [--location "Utah, United States"]
// Responses are cached beside the export as <export>.serpapi/<keyword id>.json,
// so a rerun costs no searches. The office never runs this; it is an
// operator's tool over an export, and the key lives only in the shell.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { migrateStudy, openRound, businessOf } from '../netlify/functions/lib/office/research.mjs';

const args = process.argv.slice(2);
// The location is a value, not a file: without this, --location "Utah, United
// States" is read as the export to open.
const flag = args.indexOf('--location');
const file = args.find((a, i) => !a.startsWith('--') && (flag < 0 || i !== flag + 1));
const location = flag >= 0 ? args[flag + 1] : 'Utah, United States';
const key = process.env.SERPAPI_KEY;
if (!file || !key) { console.error('usage: SERPAPI_KEY=... node scripts/validate-captures.mjs <export.json> [--location "Utah, United States"]'); process.exit(1); }

const docs = JSON.parse(readFileSync(file, 'utf8'));
const doc = Array.isArray(docs) ? docs[0] : docs;
const round = openRound(migrateStudy(doc));
const cacheDir = `${file}.serpapi`;
mkdirSync(cacheDir, { recursive: true });

async function fetchSerp(k) {
  const cached = `${cacheDir}/${k.id}.json`;
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({ engine: 'google', q: k.text, location, gl: 'us', hl: 'en', num: '10', device: 'desktop', api_key: key }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${k.text}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  writeFileSync(cached, JSON.stringify(body, null, 2));
  return body;
}

const rows = [];
for (const k of round.keywords.filter((x) => round.serps[x.id])) {
  const api = await fetchSerp(k);
  const theirs = (api.organic_results ?? []).slice(0, 8).map((x) => businessOf(x.link));
  const ours = round.serps[k.id].results.map((x) => businessOf(x.url));
  const shared = ours.filter((b) => theirs.includes(b));
  // Rank movement over the shared businesses: mean absolute difference in position.
  const moves = shared.map((b) => Math.abs(ours.indexOf(b) - theirs.indexOf(b)));
  rows.push({
    text: k.text, shared: shared.length, of: Math.min(ours.length, theirs.length),
    move: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null,
    onlyOurs: ours.filter((b) => !theirs.includes(b)), onlyTheirs: theirs.filter((b) => !ours.includes(b)),
  });
}

rows.sort((a, b) => a.shared / a.of - b.shared / b.of);
const ratios = rows.map((r) => r.shared / r.of).sort((a, b) => a - b);
const median = ratios[Math.floor(ratios.length / 2)];
console.log(`${rows.length} searches compared against SerpApi at "${location}"`);
console.log(`median agreement: ${(median * 100).toFixed(0)}% of businesses in common (top eight)\n`);
for (const r of rows) {
  const flag = r.shared / r.of < median - 0.25 ? '  <- well below the study' : '';
  console.log(`${String(r.shared).padStart(2)}/${r.of}  move ${r.move == null ? ' - ' : r.move.toFixed(1)}  ${r.text}${flag}`);
  if (r.onlyOurs.length) console.log(`        only in the capture: ${r.onlyOurs.join(', ')}`);
  if (r.onlyTheirs.length) console.log(`        only in the API:     ${r.onlyTheirs.join(', ')}`);
}
if (median < 0.5) console.log('\nAgreement is low across the board. That points at the research profile (signed-in history, personal results) or at the location the API used, not at any one search. Check the profile settings and the --location before reading anything into single keywords.');
