// Regenerates public/apple-touch-icon.png from the mark. Run: npm run icons
// iOS masks the corners itself and paints no background of its own, so the
// square is opaque white and the mark sits inside the corner radius.
import sharp from 'sharp';

const SIDE = 180;
const INSET = 26; // clears iOS's corner mask at every radius it uses

const mark = await sharp('public/brand/mark.svg', { density: 1200 })
  .resize({ width: SIDE - INSET * 2 })
  .png()
  .toBuffer();
const { height } = await sharp(mark).metadata();

await sharp({ create: { width: SIDE, height: SIDE, channels: 3, background: '#FFFFFF' } })
  .composite([{ input: mark, left: INSET, top: Math.round((SIDE - height) / 2) }])
  .png()
  .toFile('public/apple-touch-icon.png');
console.log('Wrote public/apple-touch-icon.png');
