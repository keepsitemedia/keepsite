// Regenerates public/og-default.png. Run: npm run og
// Composites the Canva export onto the 1200 by 630 card so the wordmark is
// pixel-exact and the build machine needs no fonts. The crop box is the
// artwork's bounding box (x 116-1374, y 248-658) with a 20px margin.
import sharp from 'sharp';

const logo = await sharp('docs/brand/keepsitelogo.png')
  .extract({ left: 96, top: 228, width: 1298, height: 450 })
  .resize({ width: 1000 })
  .png()
  .toBuffer();
const { height } = await sharp(logo).metadata();

await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#FFFFFF' } })
  .composite([{ input: logo, left: 100, top: Math.round((630 - height) / 2) }])
  .png()
  .toFile('public/og-default.png');
console.log('Wrote public/og-default.png');
