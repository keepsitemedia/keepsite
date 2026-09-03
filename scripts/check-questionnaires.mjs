// Structural checks on the questionnaire definitions. Run: npm run check:forms
//
// These files are read by three consumers — the Astro component, the
// submission function, and (as a snapshot) keepsite-skills — so a malformed
// one fails in three places at once. Catch it here.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join('src', 'data', 'questionnaires');
const TYPES = ['short', 'paragraph', 'choice', 'checkboxes', 'openChecklist', 'file', 'demoPick'];
const WITH_OPTIONS = ['choice', 'checkboxes', 'openChecklist'];
const FORMS = ['intro', 'brand', 'build'];
const VERSION = '2026-09-03';

const fail = [];
const check = (label, fn) => {
  try { fn(); } catch (e) { fail.push(`${label}: ${e.message}`); }
};

const seen = new Set();
for (const form of FORMS) {
  const def = JSON.parse(fs.readFileSync(path.join(DIR, `${form}.json`), 'utf8'));

  check(`${form} declares the current version and its own name`, () => {
    if (def.formVersion !== VERSION) throw new Error(def.formVersion);
    if (def.form !== form) throw new Error(def.form);
  });

  for (const section of def.sections) {
    check(`${form} section "${section.legend}" is well formed`, () => {
      if (!section.legend) throw new Error('no legend');
      if (!Array.isArray(section.questions) || !section.questions.length) {
        throw new Error('no questions');
      }
    });
    for (const q of section.questions) {
      check(`${form}.${q.key}`, () => {
        if (!q.key || !/^[a-z][A-Za-z0-9]*$/.test(q.key)) throw new Error('bad key');
        if (!q.label) throw new Error('no label');
        if (!TYPES.includes(q.type)) throw new Error(`bad type ${q.type}`);
        if (WITH_OPTIONS.includes(q.type)) {
          if (!Array.isArray(q.options) || !q.options.length) throw new Error('no options');
          if (new Set(q.options).size !== q.options.length) throw new Error('duplicate options');
        }
        const id = `${form}.${q.key}`;
        if (seen.has(id)) throw new Error('duplicate key within form');
        seen.add(id);
      });
    }
  }
}

check('the three forms carry the expected question counts', () => {
  const count = (f) =>
    JSON.parse(fs.readFileSync(path.join(DIR, `${f}.json`), 'utf8'))
      .sections.reduce((n, s) => n + s.questions.length, 0);
  const expect = { intro: 8, brand: 14, build: 39 };
  for (const [f, n] of Object.entries(expect)) {
    if (count(f) !== n) throw new Error(`${f} has ${count(f)}, expected ${n}`);
  }
});

if (fail.length) {
  for (const f of fail) console.error('FAIL  ' + f);
  console.error(`\n${fail.length} failed`);
  process.exit(1);
}
console.log('questionnaire definitions OK');
