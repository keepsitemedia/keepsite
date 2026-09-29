// Turns a /start/ submission into a client at the first stage. The Start page
// is the intro questionnaire, so the same submission files the client's intro
// answers. Deliberately lenient: the form already validated, and a lead that
// fails to land is worse than a lead with a blank field.
import { store as defaultStore } from './store.mjs';
import { loadPipelines, advance } from './pipeline.mjs';
import { newClient, slugify, uniqueSlug, TIERS, EMAIL } from './clients.mjs';
import { todayIn } from './dates.mjs';
import { validate } from '../validate.mjs';
import intro from '../../../../src/data/questionnaires/intro.json' with { type: 'json' };
import lockii from '../../../../src/data/lockii.json' with { type: 'json' };
import { offerSummary } from '../../../../src/scripts/lockii-offer.mjs';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
// A web address as people type it into a paragraph: with or without a scheme,
// a dotted host with a lettered top-level domain, and whatever path follows,
// less the sentence punctuation that tends to trail it.
const URL_IN = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i;
const websiteIn = (text) => {
  const found = String(text ?? '').match(URL_IN)?.[0].replace(/[.,;:!?)]+$/, '');
  if (!found) return '';
  return /^https?:\/\//i.test(found) ? found : `https://${found}`;
};

// Partner landing pages link to /start/?offer=<id>; the page carries the id
// in a hidden field so the note lands on the client without a textarea to
// prefill.
const OFFERS = { __proto__: null, lockii: () => `${lockii.offer.notesPrefill}: ${offerSummary(lockii.offer)}.` };

// Fields the Start page posts that are not intro questions: Netlify's own
// form id, and the two the page adds around the questionnaire.
const EXTRA = new Set(['form-name', 'package', 'offer']);

// Netlify hands a multi-pick over under its []-suffixed name, as an array
// for several ticks and a string for one; the validator wants the flat
// (name, value) pairs a FormData would have produced, under the plain key.
const entriesOf = (data) =>
  Object.entries(data ?? {})
    .filter(([name]) => !EXTRA.has(name))
    .flatMap(([name, v]) =>
      (Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string').map((x) => [name.replace(/\[\]$/, ''), x]),
    );

export function introEnvelope(data, now) {
  // Netlify already accepted the submission and a lead is worth more than a
  // refusal nobody would see, so errors do not stop the record. The blanks
  // are reported to the office instead (see note below).
  const { answers, errors } = validate(intro, entriesOf(data));
  const missing = errors.filter((e) => e.endsWith(': required')).map((e) => e.slice(0, -': required'.length));
  return { envelope: { formVersion: intro.formVersion, slug: '', form: 'intro', submittedAt: now.toISOString(), answers, files: [] }, missing };
}

const note = (data, when, missing, again = false) =>
  [
    `[${when} inquiry]${again ? ' answered the intro again' : ''}`,
    OFFERS[str(data.offer)]?.() ?? '',
    missing.length ? `Intro left blank: ${missing.join(', ')}` : '',
  ].filter(Boolean).join('\n');

export async function recordInquiry(data, s = defaultStore(), now = new Date()) {
  const today = todayIn(undefined, now);
  const { envelope, missing } = introEnvelope(data, now);
  const { answers } = envelope;
  // The public form is lenient about shape, but the address ends up in
  // ORGANIZER/ATTENDEE lines and mail headers, so it gets the same check
  // clients.mjs uses everywhere else; a bad one is dropped, not stored raw.
  const rawEmail = str(answers.email);
  const email = EMAIL.test(rawEmail) ? rawEmail : '';
  const lookupKey = email.toLowerCase();
  // listAll, not list: an archived client who writes again must be matched,
  // or they are created a second time under a new slug and their history is
  // stranded on the old one.
  const clients = await s.clients.listAll();
  const existing = lookupKey && clients.find((c) => c.email && c.email.toLowerCase() === lookupKey);
  if (existing) {
    const notes = [existing.notes, note(data, today, missing, true)].filter(Boolean).join('\n\n');
    // Someone who writes to you again is not archived any more, and this
    // inquiry would otherwise land on a page the dashboard no longer shows.
    await s.clients.put(existing.slug, { ...existing, notes, archivedAt: null, archivedReason: '', updatedAt: now.toISOString() });
    // The newer answers are the current truth, so they replace the first;
    // the dated note above says a replacement happened.
    await s.questionnaires.put(existing.slug, 'intro', { ...envelope, slug: existing.slug });
    return { slug: existing.slug, created: false };
  }

  const [pipeline] = await loadPipelines(s);
  const first = pipeline.stages[0];
  const slug = uniqueSlug(slugify(answers.business), new Set(clients.map((c) => c.slug)));
  const tier = TIERS.includes(str(data.package)) ? str(data.package) : '';
  const base = newClient(
    { slug, name: answers.name, business: answers.business || slug, email, website: websiteIn(answers.existingBrand), tier, notes: note(data, today, missing) },
    { pipeline: pipeline.id, stage: first.id, today, now },
  );
  const { client, tasks } = advance({ client: { ...base, stages: [] }, pipeline, stageId: first.id, today, now });
  for (const t of tasks) await s.tasks.put(slug, t.id, t);
  await s.clients.put(slug, client);
  await s.questionnaires.put(slug, 'intro', { ...envelope, slug });
  return { slug, created: true };
}
