#!/usr/bin/env node
// Prints a client's three questionnaire links. Run when the agreement is
// signed, alongside creating their Drive folder.
//
//   KEEPSITE_TOKEN_SECRET=... node scripts/mint-token.mjs lova-content-creation
import { mint } from '../netlify/functions/lib/token.mjs';

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
