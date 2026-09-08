// Validates a submission against the same definition that rendered it. The
// option lists are the source of truth for both, so a value outside them is a
// tampered submission rather than a wording drift.

const TRANSPORT = new Set(['bot-field', 'form', 'formVersion', 'c', 't']);
const MULTI = new Set(['checkboxes', 'openChecklist']);
const OWN = '__own';
// A demo's section id, as the build-time scan in
// src/pages/questionnaire/brand.astro finds them. The server cannot see that
// list at runtime, so the shape is the check: the value ends up in brand.json
// and is looked up as an id by the sitemap skill, which fails silently on a
// string that is not one.
const DEMO_ID = /^[a-z0-9-]{1,40}$/;

const questionsOf = (definition) =>
  definition.sections.flatMap((s) => s.questions);

export function validate(definition, entries) {
  const questions = questionsOf(definition);
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const errors = [];
  const raw = new Map();

  for (const [name, value] of entries) {
    if (TRANSPORT.has(name)) continue;
    const key = name.endsWith(OWN) ? name.slice(0, -OWN.length) : name;
    const q = byKey.get(key);
    if (!q) {
      errors.push(`unknown field: ${name}`);
      continue;
    }
    if (name.endsWith(OWN) && q.type !== 'openChecklist') {
      errors.push(`unknown field: ${name}`);
      continue;
    }
    if (!raw.has(name)) raw.set(name, []);
    raw.get(name).push(typeof value === 'string' ? value.trim() : value);
  }

  const answers = {};
  for (const q of questions) {
    const given = raw.get(q.key) ?? [];

    if (MULTI.has(q.type)) {
      // Both types validate their checkboxes against the option list. The
      // difference is that openChecklist also accepts a typed-in value through
      // the paired __own field, which by definition is not on the list.
      const listed = given.filter(Boolean);
      const own = (raw.get(q.key + OWN) ?? []).filter(Boolean);
      for (const v of listed) {
        if (!q.options.includes(v)) errors.push(`${q.key}: "${v}" is not an option`);
      }
      answers[q.key] = [...listed, ...own];
    } else if (q.type === 'choice') {
      const v = given[0] ?? '';
      if (v && !q.options.includes(v)) errors.push(`${q.key}: "${v}" is not an option`);
      answers[q.key] = v;
    } else if (q.type === 'demoPick') {
      const v = given[0] ?? '';
      if (v && v !== 'mix' && !DEMO_ID.test(v)) errors.push(`${q.key}: "${v}" is not a demo`);
      answers[q.key] = v && v !== 'mix' ? v : null;
    } else {
      answers[q.key] = given[0] ?? '';
    }

    const empty = Array.isArray(answers[q.key])
      ? answers[q.key].length === 0
      : !answers[q.key];
    if (q.required && empty) errors.push(`${q.key}: required`);
  }

  return { answers, errors };
}
