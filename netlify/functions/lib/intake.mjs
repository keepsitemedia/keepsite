// Pulls a client's questionnaire answers and attachments out of the
// `questionnaires` store into the workspace layout the build skills read
// ({slug}/intake/). The email attachment stays as a backup; this is the
// path that does not depend on anyone saving it by hand.
import path from 'node:path';

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const FORMS = ['intro', 'brand', 'build'];

export async function pullIntake({ slug, dir, source, write }) {
  if (!SLUG.test(String(slug))) throw new Error(`bad slug: ${slug}`);
  const into = (name) => path.join(dir, slug, 'intake', name);
  const written = [];
  const missing = [];
  for (const form of FORMS) {
    const text = await source.getText(`${slug}/${form}.json`);
    if (text == null) { missing.push(form); continue; }
    await write(into(`${form}.json`), text);
    written.push(into(`${form}.json`));
  }
  for (const key of await source.list(`${slug}/`)) {
    if (key.endsWith('.json')) continue;
    const bytes = await source.getBytes(key);
    if (!bytes) continue;
    // The store's keys are trusted today, but this script writes to disk
    // unattended, so a key riding a `..` segment must not escape intake/.
    const name = key.slice(slug.length + 1);
    if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) continue;
    const dest = into(name);
    if (path.relative(into(''), dest).startsWith('..')) throw new Error(`bad attachment key: ${key}`);
    await write(dest, bytes);
    written.push(dest);
  }
  return { written, missing };
}
