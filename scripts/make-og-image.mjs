// Regenerates public/og-default.png. Run: npm run og
// Uses Arial in the SVG rather than Instrument Sans because the
// rasterizer has no access to the webfont; the OG card is a flat
// image and the difference is not visible at card size.
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#16302A"/>
  <rect x="80" y="150" width="88" height="6" fill="#A24A26"/>
  <text x="80" y="290" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="600" fill="#FBF9F4">Keepsite Media</text>
  <text x="80" y="368" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#E6EFE9">Websites for people with other things to do.</text>
  <text x="80" y="540" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#8FAF9E">keepsitemedia.com</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/og-default.png');
console.log('Wrote public/og-default.png');
