// Prints a client's questionnaire links: the three shared forms, and their
// site review when one is on file. Run when the agreement is
// signed, alongside creating their Drive folder.
//
//   KEEPSITE_TOKEN_SECRET=... node scripts/mint-token.mjs lova-content-creation
import { mint } from '../netlify/functions/lib/token.mjs';
import { REVIEW, REVIEWS, reviewPath } from '../netlify/functions/lib/reviews.mjs';

const SITE = 'https://www.keepsitemedia.com';
const slug = process.argv[2];
const secret = process.env.KEEPSITE_TOKEN_SECRET;

if (!slug || !secret) {
  console.error('usage: KEEPSITE_TOKEN_SECRET=... node scripts/mint-token.mjs <slug>');
  process.exit(1);
}

for (const form of ['intro', 'brand', 'build']) {
  console.log(`${form.padEnd(6)} ${SITE}/questionnaire/${form}/?c=${slug}&t=${mint(secret, slug, form)}`);
}
if (REVIEWS[slug]) {
  console.log(`${REVIEW.padEnd(6)} ${SITE}${reviewPath(slug)}?c=${slug}&t=${mint(secret, slug, REVIEW)}`);
}
