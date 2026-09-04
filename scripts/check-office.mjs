// The seed is read by the settings page, the pipeline module, and the
// dashboard. A malformed seed fails in three places; catch it here.
import fs from 'node:fs';
import { validatePipelines } from '../netlify/functions/lib/office/pipeline.mjs';

const seed = JSON.parse(fs.readFileSync('src/data/office/pipelines.json', 'utf8'));
const errors = validatePipelines(seed);
const forms = new Set(fs.readdirSync('src/data/questionnaires').map((f) => f.replace(/\.json$/, '')));
for (const p of seed) {
  for (const q of p.questionnaires ?? []) {
    if (!forms.has(q)) errors.push(`${p.id}: questionnaire "${q}" has no definition in src/data/questionnaires`);
  }
  for (const s of p.stages) {
    for (const t of s.tasks) {
      if (t.questionnaire && !(p.questionnaires ?? []).includes(t.questionnaire)) {
        errors.push(`${p.id}/${s.id}: task "${t.title}" names questionnaire "${t.questionnaire}" the pipeline does not declare`);
      }
    }
  }
}
// A hidden input and a button sharing a name is exactly the bug the two
// stage/task forms shipped with: FormData.get() returns whichever control
// comes first in the DOM, silently discarding the button the admin clicked.
// Catch it statically so it cannot come back unnoticed in a new form.
const OFFICE_ASTRO = [
  ...walk('src/pages/office').filter((f) => f.endsWith('.astro')),
  ...fs.readdirSync('src/components/office').filter((f) => f.endsWith('.astro')).map((f) => `src/components/office/${f}`),
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => `${e.parentPath ?? e.path}/${e.name}`);
}

function nameAttr(tag) {
  const m = tag.match(/\sname="([^"]*)"/);
  return m ? m[1] : null;
}

for (const file of OFFICE_ASTRO) {
  const src = fs.readFileSync(file, 'utf8');
  for (const formMatch of src.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)) {
    const body = formMatch[1];
    const buttonNames = new Set();
    const nonButtonNames = [];
    for (const tag of body.matchAll(/<(input|select|textarea|button)\b[^>]*>/gi)) {
      const name = nameAttr(tag[0]);
      if (!name) continue;
      if (tag[1].toLowerCase() === 'button') buttonNames.add(name);
      else nonButtonNames.push(name);
    }
    const seen = new Set();
    for (const name of nonButtonNames) {
      if (seen.has(name)) errors.push(`${file}: "${name}" is used on two non-button controls in one form`);
      seen.add(name);
    }
    for (const name of buttonNames) {
      if (seen.has(name)) errors.push(`${file}: "${name}" is used on both a button and a non-button control in one form`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('office seed ok');
