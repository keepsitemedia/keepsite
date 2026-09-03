// One endpoint for all three questionnaires.
//
// Blobs before email, deliberately: Blobs is the durable record and the email
// is the notification. A send that fails after the client has hit submit must
// not lose forty answers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { getStore } from '@netlify/blobs';
import { verify } from './lib/token.mjs';
import { validate } from './lib/validate.mjs';

// A plain `import x from './y.json'` needs an import-attribute keyword
// (`with { type: 'json' }`) to satisfy Node's ESM loader, and Node 20 (the
// version netlify.toml pins) does not reliably support that syntax — it
// throws at module load under a plain `node --test` run. Reading the files
// at module scope sidesteps the loader entirely and behaves identically
// whether esbuild bundles this function or `node --test` imports it directly.
const definitionsDir = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../src/data/questionnaires',
);
const loadDefinition = (name) =>
  JSON.parse(fs.readFileSync(path.join(definitionsDir, `${name}.json`), 'utf8'));

// `__proto__: null` so a form value like "constructor" or "toString" can't
// resolve to an inherited Object property instead of `undefined`. Harmless
// today — a forged form name still can't produce a token that verifies,
// since the token binds (slug, form) together — but it costs nothing to keep
// the lookup honest.
const DEFINITIONS = {
  __proto__: null,
  intro: loadDefinition('intro'),
  brand: loadDefinition('brand'),
  build: loadDefinition('build'),
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILE_KEYS = new Set(['logo', 'brandGuide']);

const redirect = (to) => new Response(null, { status: 302, headers: { Location: to } });
const problem = (status, body) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

async function notify(envelope) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const body = JSON.stringify(envelope, null, 2);
  await fetch('https://api.resend.com/emails', {
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
}

export default async (request) => {
  if (request.method !== 'POST') return problem(405, 'POST only');

  const data = await request.formData();
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
    const at = `${slug}/${key}-${file.name}`;
    await store.set(at, await file.arrayBuffer());
    files.push({ key, name: file.name, size: file.size, at });
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

  // Best-effort from here: the durable record is already written, so a
  // network hiccup reaching Resend must not turn a successful submission
  // into a failed request and an unnecessary retry.
  try {
    await notify(envelope);
  } catch {
    // Nothing to do — the client still gets their redirect below.
  }

  return redirect('/questionnaire/thanks/');
};
