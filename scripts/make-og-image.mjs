// Regenerates public/og-default.png. Run: npm run og
// The full lockup on the 1200 by 630 card, left-aligned on white. The
// source is the cropped brand SVG, so the build machine needs no fonts and
// the card cannot drift from the logo in the header.
import sharp from 'sharp';

const logo = await sharp('public/brand/lockup-tagline.svg', { density: 1200 })
  .resize({ width: 1000 })
  .png()
  .toBuffer();
const { height } = await sharp(logo).metadata();

await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#FFFFFF' } })
  .composite([{ input: logo, left: 100, top: Math.round((630 - height) / 2) }])
  .png()
  .toFile('public/og-default.png');
console.log('Wrote public/og-default.png');
