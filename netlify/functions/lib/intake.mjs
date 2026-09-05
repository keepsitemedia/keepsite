// Pulls a client's questionnaire answers and attachments out of the
// `questionnaires` store into the workspace layout the build skills read
// ({slug}/intake/). The email attachment stays as a backup; this is the
// path that does not depend on anyone saving it by hand.
import path from 'node:path';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
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
    const name = key.slice(slug.length + 1);
    await write(into(name), bytes);
    written.push(into(name));
  }
  return { written, missing };
}
