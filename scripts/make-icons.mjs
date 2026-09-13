// Regenerates public/apple-touch-icon.png from the stripe block. Run: npm run icons
// iOS masks the corners itself, so the block bleeds to every edge.
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="60" fill="#628997"/>
  <rect y="60" width="180" height="60" fill="#DFAA3F"/>
  <rect y="120" width="180" height="60" fill="#B8512C"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/apple-touch-icon.png');
console.log('Wrote public/apple-touch-icon.png');
