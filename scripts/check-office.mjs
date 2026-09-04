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
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('office seed ok');
