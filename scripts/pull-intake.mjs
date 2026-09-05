// Pulls a client's intake (questionnaire answers and attachments) from the
// questionnaires Blobs store into {dir}/{slug}/intake/.
//
//   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs lova-content-creation [dir]
//
// dir defaults to the directory above this repo, which is where the build
// skills expect {slug}/intake/ to live.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { pullIntake } from '../netlify/functions/lib/intake.mjs';

const slug = process.argv[2];
const dir = process.argv[3] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;

if (!slug || !siteID || !token) {
  console.error('usage: NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs <slug> [dir]');
  process.exit(1);
}

const blobs = getStore({ name: 'questionnaires', siteID, token });
const source = {
  async getText(key) { return (await blobs.get(key)) ?? null; },
  async getBytes(key) { const b = await blobs.get(key, { type: 'arrayBuffer' }); return b ? new Uint8Array(b) : null; },
  async list(prefix) { return (await blobs.list({ prefix })).blobs.map((b) => b.key).sort(); },
};
const write = async (p, data) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, data); };

console.log(`writing into ${path.join(dir, slug, 'intake')}`);
const { written, missing } = await pullIntake({ slug, dir, source, write });
for (const p of written) console.log(`wrote ${p}`);
for (const form of missing) console.log(`no ${form}.json submitted yet`);
