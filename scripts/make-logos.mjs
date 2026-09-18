// Regenerates public/brand/*.svg and public/favicon.svg from the Canva
// exports in docs/brand. Run: npm run logos
//
// The exports are 1500-square artboards of outlined type wrapped in cairo's
// clip-path scaffolding. Three things have to happen before they are web
// assets: svgo drops the scaffolding, the viewBox is pulled in to the
// artwork's own bounding box so the file has no dead margin to lay out
// around, and the artboard's raw ink is swapped for the palette tokens.
//
// The swap is the one place this file departs from the source art. The
// tokens are the contrast-tuned siblings of the same hues, and global.css
// spends them on text, buttons and tier bars as well as on the stripe
// ornament that sits directly under the header logo on every page. Matching
// the art to the tokens moves three fills; matching the tokens to the art
// would move every one of those contrast decisions.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { optimize } from 'svgo';

const INK = '#111111';
const PALETTE = {
  '#568a99': '#628997', // slate
  '#e9a716': '#DFAA3F', // mustard
  '#c7481d': '#B8512C', // rust
  '#dd843c': '#966236', // copper, the italic "media"
  '#000000': INK,
};

const sources = [
  { from: '1.svg', to: 'lockup-tagline.svg', what: 'wordmark, rule and tagline' },
  { from: '2.svg', to: 'lockup.svg', what: 'wordmark and rule' },
  { from: '4.svg', to: 'mark.svg', what: 'the K and the stripe block' },
];

// Rendered wide enough that a trim is accurate to a fraction of a unit.
const DENSITY = 288;

// The artwork's own bounding box, in viewBox units, from where an opaque
// render stops being transparent.
async function boundingBox(svg) {
  const [, , , vbWidth] = svg.match(/viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/).slice(1).map(Number);
  const [minX, minY] = svg.match(/viewBox="([\d.-]+) ([\d.-]+)/).slice(1).map(Number);
  const png = await sharp(Buffer.from(svg), { density: DENSITY }).png().toBuffer();
  const { width: rendered } = await sharp(png).metadata();
  const { info } = await sharp(png).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const scale = rendered / vbWidth;
  // A half-unit of air on every side keeps the antialiased edge off the box.
  const x = minX - info.trimOffsetLeft / scale - 0.5;
  const y = minY - info.trimOffsetTop / scale - 0.5;
  return [x, y, info.width / scale + 1, info.height / scale + 1].map((n) => Math.round(n * 100) / 100);
}

async function build({ from, to, what }) {
  const raw = await readFile(`docs/brand/${from}`, 'utf8');
  let svg = optimize(raw, { multipass: true, floatPrecision: 3 }).data;
  const box = await boundingBox(svg);
  svg = svg
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace(/viewBox="[^"]*"/, `viewBox="${box.join(' ')}"`);
  for (const [artboard, token] of Object.entries(PALETTE)) {
    svg = svg.replaceAll(artboard, token);
  }
  // svgo leaves the rule's stroke and the outlined type unfilled, which
  // paints them black; the palette swap only reaches declared colors.
  svg = svg.replace('<svg ', `<svg fill="${INK}" `);
  await writeFile(`public/brand/${to}`, `${svg}\n`);
  const ratio = (box[2] / box[3]).toFixed(3);
  console.log(`public/brand/${to}  ${what}  ${box[2]}x${box[3]} (${ratio}:1)`);
  return box;
}

await mkdir('public/brand', { recursive: true });
const boxes = {};
for (const s of sources) boxes[s.to] = await build(s);

// The favicon is the mark on a square, since the tab and the bookmark bar
// are square and a 954-by-556 box would letterbox down to nothing. The
// artwork keeps its own proportions and sits centred with a unit of air.
const [x, y, w, h] = boxes['mark.svg'];
const side = Math.max(w, h) * 1.06;
const square = [x - (side - w) / 2, y - (side - h) / 2, side, side].map((n) => Math.round(n * 100) / 100);
const mark = await readFile('public/brand/mark.svg', 'utf8');
await writeFile('public/favicon.svg', mark.replace(/viewBox="[^"]*"/, `viewBox="${square.join(' ')}"`));
console.log(`public/favicon.svg  the mark on a square  ${square[2]}x${square[3]}`);
