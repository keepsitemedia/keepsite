// One endpoint for all three questionnaires.
//
// Blobs before email, deliberately: Blobs is the durable record and the email
// is the notification. A send that fails after the client has hit submit must
// not lose forty answers.
import { Buffer } from 'node:buffer';
import { getStore } from '@netlify/blobs';
import { verify } from './lib/token.mjs';
import { validate } from './lib/validate.mjs';
import { fileKey, safeName } from './lib/blob-key.mjs';
import { markQuestionnaireDone } from './lib/office/hooks.mjs';

// `with { type: 'json' }` is required, not optional: this module is imported
// under raw Node by lib/questionnaire.test.mjs, where a bare JSON import
// throws. The attribute parses and loads on Node 20 (verified on 20.20.2, the
// version netlify.toml pins), and esbuild resolves and inlines these at bundle
// time so the deployed function carries no filesystem read. netlify.toml's
// [functions] included_files ships the files as a backstop if that changes.
import intro from '../../src/data/questionnaires/intro.json' with { type: 'json' };
import brand from '../../src/data/questionnaires/brand.json' with { type: 'json' };
import build from '../../src/data/questionnaires/build.json' with { type: 'json' };

// `__proto__: null` so a form value like "constructor" or "toString" can't
// resolve to an inherited Object property instead of `undefined`. Harmless
// today — a forged form name still can't produce a token that verifies,
// since the token binds (slug, form) together — but it costs nothing to keep
// the lookup honest.
const DEFINITIONS = { __proto__: null, intro, brand, build };

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILE_KEYS = new Set(['logo', 'brandGuide']);

const redirect = (to) => new Response(null, { status: 302, headers: { Location: to } });
const problem = (status, body) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

// Exported, with fetch injectable, only so lib/questionnaire.test.mjs can
// exercise the refused-send path without a network. Netlify reads `default`
// and `config` from this file and ignores other named exports.
export async function notify(envelope, fetchImpl = fetch) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const body = JSON.stringify(envelope, null, 2);
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.KEEPSITE_NOTIFY_FROM,
      to: process.env.KEEPSITE_NOTIFY_TO,
      subject: `${envelope.slug} — ${envelope.form} questionnaire`,
      text: `${envelope.slug} submitted the ${envelope.form} questionnaire.`,
      attachments: [
        {
          filename: `${envelope.form}.json`,
          content: Buffer.from(body).toString('base64'),
        },
      ],
    }),
  });
  // Resend reports a refused send (unverified from-domain, bad recipient) as
  // a 4xx body, not a thrown error. Without this line the only evidence that
  // no email went out is the blob nobody was told about.
  if (!res.ok) {
    console.error(
      `questionnaire notify: Resend ${res.status} for ${envelope.slug}/${envelope.form}: ${await res.text()}`,
    );
  }
}

export default async (request) => {
  if (request.method !== 'POST') return problem(405, 'POST only');

  // Anonymous callers reach this endpoint, so a body that is not multipart —
  // or is truncated mid-upload — must be a clean 400 rather than an uncaught
  // throw surfacing as a generic 500.
  let data;
  try {
    data = await request.formData();
  } catch {
    return problem(400, 'expected a form submission');
  }

  if (data.get('bot-field')) return redirect('/questionnaire/thanks/');

  const slug = String(data.get('c') ?? '');
  const form = String(data.get('form') ?? '');
  const definition = DEFINITIONS[form];
  if (!definition || !SLUG.test(slug)) return problem(403, 'no');

  // Never fail open: with no secret configured, no token can verify, so
  // every submission is refused rather than silently accepted.
  const secret = process.env.KEEPSITE_TOKEN_SECRET;
  if (!secret || !verify(secret, slug, form, String(data.get('t') ?? ''))) {
    return problem(403, 'no');
  }

  // Lazy, not fetched up front: a submission with no attachments and a
  // validation error should never have to touch Blobs to get rejected.
  const files = [];
  let store;
  for (const key of FILE_KEYS) {
    const file = data.get(key);
    if (!file || typeof file === 'string' || file.size === 0) continue;
    store ??= getStore('questionnaires');
    // The recorded name is the sanitised one, so `name` and `at` never
    // disagree about what is actually in the store.
    const name = safeName(file.name);
    const at = fileKey(slug, key, file.name);
    await store.set(at, await file.arrayBuffer());
    files.push({ key, name, size: file.size, at });
  }

  const entries = [...data.entries()].filter(([, v]) => typeof v === 'string');
  const { answers, errors } = validate(definition, entries);
  if (errors.length) return problem(400, errors.join('\n'));

  const envelope = {
    formVersion: definition.formVersion,
    slug,
    form,
    submittedAt: new Date().toISOString(),
    answers,
    files,
  };

  store ??= getStore('questionnaires');
  await store.setJSON(`${slug}/${form}.json`, envelope);

  // Office bookkeeping is best-effort for the same reason the email is: the
  // answers are already durable, and nothing after this may cost the client
  // their redirect.
  try {
    await markQuestionnaireDone(slug, form);
  } catch (e) {
    console.error(`questionnaire: office hook failed for ${slug}/${form}`, e);
  }

  // Best-effort from here: the durable record is already written, so a
  // network hiccup reaching Resend must not turn a successful submission
  // into a failed request and an unnecessary retry.
  try {
    await notify(envelope);
  } catch (e) {
    // The client still gets their redirect below; the log line names the
    // blob (`${slug}/${form}.json`) so the answers can be found by hand.
    console.error(`questionnaire: notify failed for ${slug}/${form}`, e);
  }

  // The query string is how the thanks page knows which saved draft to clear.
  // Only a redirect issued from here means the answers are durably stored, so
  // this is the one signal the client script is allowed to treat as success —
  // a 403, a 400 or a 500 must leave the draft intact.
  return redirect(`/questionnaire/thanks/?f=${form}&c=${slug}`);
};
