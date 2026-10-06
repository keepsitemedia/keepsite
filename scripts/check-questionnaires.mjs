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

// A review is one client's own file under reviews/, dated when it was
// written rather than pinned to the shared forms' version.
const REVIEW_DIR = path.join(DIR, 'reviews');
const reviews = fs.existsSync(REVIEW_DIR)
  ? fs.readdirSync(REVIEW_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  : [];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const seen = new Set();
for (const entry of [...FORMS.map((form) => ({ form })), ...reviews.map((slug) => ({ form: `reviews/${slug}`, review: slug }))]) {
  const { form, review } = entry;
  const def = JSON.parse(fs.readFileSync(path.join(DIR, `${form}.json`), 'utf8'));

  check(`${form} declares the current version and its own name`, () => {
    if (review) {
      if (!SLUG.test(review)) throw new Error(`bad slug ${review}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(def.formVersion)) throw new Error(def.formVersion);
      if (def.form !== 'review') throw new Error(def.form);
      return;
    }
    if (def.formVersion !== VERSION) throw new Error(def.formVersion);
    if (def.form !== form) throw new Error(def.form);
  });

  for (const section of def.sections) {
    check(`${form} section "${section.legend}" is well formed`, () => {
      if (!section.legend) throw new Error('no legend');
      if (!Array.isArray(section.questions) || !section.questions.length) {
        throw new Error('no questions');
      }
      for (const group of section.list ?? []) {
        if (!group.heading || !Array.isArray(group.items) || !group.items.length) throw new Error(`bad list group ${group.heading}`);
        if (group.href && !/^https:\/\//.test(group.href)) throw new Error(`bad link ${group.href}`);
      }
      for (const link of section.links ?? []) {
        if (!link.label || !/^https:\/\//.test(link.href ?? '')) throw new Error(`bad link ${link.href}`);
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
