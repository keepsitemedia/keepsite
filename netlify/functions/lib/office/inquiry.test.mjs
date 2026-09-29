import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordInquiry } from './inquiry.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const NOW = new Date('2026-09-04T16:00:00Z');
// The shape Netlify hands submission-created for the Start page: the intro
// questionnaire's answers plus the package pick and the partner offer.
const data = {
  form: 'intro', formVersion: '2026-09-03',
  name: 'Sierra', email: 'Sierra@Example.com', business: 'Lova Content Creation',
  whatWeDo: 'Content for creators.', attract: 'Small brands.',
  'form-name': 'inquiry', 'feelWanted[]': ['Warm', 'Calm'], feelWanted__own: 'Cinematic',
  existingBrand: 'Yes, https://lova.example and a logo', visualLikes: '',
  package: 'Growth', offer: '',
};

test('a new inquiry becomes a client at the first stage with its tasks and intro answers', async () => {
  const s = make();
  const r = await recordInquiry(data, s, NOW);
  assert.deepEqual(r, { slug: 'lova-content-creation', created: true });
  const c = await s.clients.get('lova-content-creation');
  assert.equal(c.stage, 'inquiry');
  assert.equal(c.tier, 'Growth');
  assert.equal(c.email, 'Sierra@Example.com');
  assert.equal(c.website, 'https://lova.example');
  assert.match(c.notes, /^\[2026-09-04 inquiry\]$/m);
  const intro = await s.questionnaires.get('lova-content-creation', 'intro');
  assert.equal(intro.form, 'intro');
  assert.equal(intro.formVersion, '2026-09-03');
  assert.equal(intro.submittedAt, NOW.toISOString());
  assert.equal(intro.answers.whatWeDo, 'Content for creators.');
  assert.deepEqual(intro.answers.feelWanted, ['Warm', 'Calm', 'Cinematic']);
  assert.deepEqual(intro.files, []);
  // Only the demo: nothing waits on a questionnaire, and the tiered research
  // task waits for the agreement, where the tier is settled.
  const tasks = await s.tasks.list('lova-content-creation');
  assert.deepEqual(tasks.map((t) => t.title), ['Build demo']);
});

test('a single checkbox arrives as a string and is stored as a list', async () => {
  const s = make();
  await recordInquiry({ ...data, 'feelWanted[]': 'Bold', feelWanted__own: '' }, s, NOW);
  assert.deepEqual((await s.questionnaires.get('lova-content-creation', 'intro')).answers.feelWanted, ['Bold']);
});

test('a website is found with or without its scheme and without trailing punctuation', async () => {
  const s = make();
  const site = async (existingBrand, business) => {
    await recordInquiry({ ...data, existingBrand, business, email: `${business}@example.com` }, s, NOW);
    return (await s.clients.get(business.toLowerCase())).website;
  };
  assert.equal(await site('Yes, lova.example and an old logo.', 'A'), 'https://lova.example');
  assert.equal(await site('See www.lova.example/about.', 'B'), 'https://www.lova.example/about');
  assert.equal(await site('Only a logo so far. Nothing online yet', 'C'), '');
  assert.equal(await site('Yes, https://lova.example.', 'D'), 'https://lova.example');
});

test('blank required answers are named in the notes so the office knows to chase them', async () => {
  const s = make();
  await recordInquiry({ ...data, whatWeDo: '', attract: '' }, s, NOW);
  const c = await s.clients.get('lova-content-creation');
  assert.match(c.notes, /Intro left blank: whatWeDo, attract/);
  assert.doesNotMatch(c.notes, /unknown field/);
});

test('a partner offer lands in the notes', async () => {
  const s = make();
  await recordInquiry({ ...data, offer: 'lockii' }, s, NOW);
  assert.match((await s.clients.get('lova-content-creation')).notes, /Lockii customer offer: 10% off the build, first month free\./);
});

test('an unknown offer is ignored', async () => {
  const s = make();
  await recordInquiry({ ...data, offer: 'nope' }, s, NOW);
  assert.doesNotMatch((await s.clients.get('lova-content-creation')).notes, /offer/i);
});

test('a repeat inquiry from the same email is noted and its answers replace the first', async () => {
  const s = make();
  await recordInquiry(data, s, NOW);
  const later = new Date('2026-09-07T00:00:00Z');
  const r = await recordInquiry({ ...data, email: 'sierra@example.com', whatWeDo: 'Second thoughts', attract: 'Bigger brands.' }, s, later);
  assert.deepEqual(r, { slug: 'lova-content-creation', created: false });
  assert.equal((await s.clients.list()).length, 1);
  assert.match((await s.clients.get('lova-content-creation')).notes, /\[2026-09-06 inquiry\] answered the intro again/);
  const intro = await s.questionnaires.get('lova-content-creation', 'intro');
  assert.equal(intro.answers.whatWeDo, 'Second thoughts');
  assert.equal(intro.answers.attract, 'Bigger brands.');
  assert.equal(intro.submittedAt, later.toISOString());
});

test('"Not sure yet" and unknown packages leave the tier blank', async () => {
  const s = make();
  await recordInquiry({ ...data, package: 'Not sure yet' }, s, NOW);
  assert.equal((await s.clients.get('lova-content-creation')).tier, '');
});

test('a garbage submission still lands rather than throwing', async () => {
  const s = make();
  const r = await recordInquiry({ email: 'x@example.com' }, s, NOW);
  assert.equal(r.created, true);
  assert.equal(r.slug, 'client');
  assert.equal((await s.questionnaires.get('client', 'intro')).answers.whatWeDo, '');
});

test('an email that fails validation is dropped, not stored raw', async () => {
  const s = make();
  const r = await recordInquiry({ email: 'bad\r\nline', business: 'X' }, s, NOW);
  assert.equal(r.created, true);
  const c = await s.clients.get(r.slug);
  assert.equal(c.email, '');
});

test('an inquiry from an archived client reopens them instead of duplicating', async () => {
  const s = make();
  await s.clients.put('lova', {
    slug: 'lova', business: 'Lova', email: 's@example.com', stage: 'demo', notes: 'first note',
    archivedAt: '2026-09-17T00:00:00.000Z', archivedReason: 'stopped replying',
  });
  const res = await recordInquiry({ email: 'S@Example.com', whatWeDo: 'we are ready now' }, s, NOW);
  assert.equal(res.created, false);
  assert.equal(res.slug, 'lova');
  const c = await s.clients.get('lova');
  assert.equal(c.archivedAt, null);
  assert.equal(c.archivedReason, '');
  assert.match(c.notes, /first note/);
  assert.equal((await s.clients.listAll()).length, 1);
  // An archived client who never answered the intro gets these answers filed.
  assert.equal((await s.questionnaires.get('lova', 'intro')).answers.whatWeDo, 'we are ready now');
});

test('clients with an empty email are skipped by the dedupe lookup', async () => {
  const s = make();
  await recordInquiry({ email: 'bad\r\nline', business: 'First' }, s, NOW);
  await recordInquiry({ email: 'bad\r\nline2', business: 'Second' }, s, NOW);
  // Both prior clients stored email: '' — a real address must not be
  // treated as a duplicate of either.
  const r = await recordInquiry({ ...data, business: 'Third' }, s, NOW);
  assert.equal(r.created, true);
  assert.equal((await s.clients.list()).length, 3);
});
