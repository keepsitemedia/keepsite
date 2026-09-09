// Pulls a client's intake (questionnaire answers and attachments) from the
// questionnaires Blobs store into {dir}/{slug}/intake/.
//
//   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs lova-content-creation [dir] [--force]
//
// dir defaults to the directory above this repo, which is where the build
// skills expect {slug}/intake/ to live. A file already there is left alone
// unless --force is passed: the intake is edited by hand after the pull.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { pullIntake, SLUG } from '../netlify/functions/lib/intake.mjs';

const force = process.argv.includes('--force');
const [slug, dirArg] = process.argv.slice(2).filter((arg) => arg !== '--force');
const dir = dirArg ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;

if (!slug || !siteID || !token) {
  console.error('usage: NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs <slug> [dir] [--force]');
  process.exit(1);
}

// Validated up front so a bad slug never reaches the "writing into" line —
// nothing about a path should print until the slug is known safe.
if (!SLUG.test(slug)) {
  console.error(`pull-intake: bad slug: ${slug}`);
  process.exit(1);
}

try {
  const blobs = getStore({ name: 'questionnaires', siteID, token });
  const source = {
    async getText(key) { return (await blobs.get(key)) ?? null; },
    async getBytes(key) { const b = await blobs.get(key, { type: 'arrayBuffer' }); return b ? new Uint8Array(b) : null; },
    async list(prefix) { return (await blobs.list({ prefix })).blobs.map((b) => b.key).sort(); },
  };
  const skipped = new Set();
  const exists = (p) => fs.access(p).then(() => true, () => false);
  const write = async (p, data) => {
    if (!force && (await exists(p))) { skipped.add(p); return; }
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  };

  console.log(`writing into ${path.join(dir, slug, 'intake')}`);
  const { written, missing } = await pullIntake({ slug, dir, source, write });
  for (const p of written) console.log(skipped.has(p) ? `skipped ${p} (exists; pass --force to overwrite)` : `wrote ${p}`);
  for (const form of missing) console.log(`no ${form}.json submitted yet`);
} catch (err) {
  // A bare stack trace is noise for an unattended pull; one line is enough
  // for whoever is running this by hand to act on.
  console.error(`pull-intake: ${err.message}`);
  process.exit(1);
}
