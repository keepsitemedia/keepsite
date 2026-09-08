// Covers every path that returns before touching Netlify Blobs, so this runs
// under plain `node --test` with no server and no store. It lives in lib/
// rather than beside questionnaire.mjs because Netlify treats every top-level
// file in netlify/functions/ as a deployable function, and this one exports no
// handler; lib/ is safe because it has no entry file matching its own name.
//
// The happy path (valid token, successful submission) calls into Blobs and is
// not covered here; it is checked by hand against a deploy preview.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { notify } from '../questionnaire.mjs';
import { mint } from './token.mjs';

const SECRET = 'test-secret';
const SLUG = 'testco';

async function withSecret(secret, fn) {
  const prior = process.env.KEEPSITE_TOKEN_SECRET;
  process.env.KEEPSITE_TOKEN_SECRET = secret;
  try {
    return await fn();
  } finally {
    if (prior === undefined) delete process.env.KEEPSITE_TOKEN_SECRET;
    else process.env.KEEPSITE_TOKEN_SECRET = prior;
  }
}

function request(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return new Request('http://localhost/api/questionnaire', { method: 'POST', body: data });
}

test('a non-POST method is refused', async () => {
  const res = await handler(new Request('http://localhost/api/questionnaire', { method: 'GET' }));
  assert.equal(res.status, 405);
});

test('a request with no token is refused', async () => {
  await withSecret(SECRET, async () => {
    const res = await handler(request({ form: 'intro', c: SLUG }));
    assert.equal(res.status, 403);
  });
});

test('a token minted for a different slug is refused', async () => {
  await withSecret(SECRET, async () => {
    const t = mint(SECRET, 'other-client', 'intro');
    const res = await handler(request({ form: 'intro', c: SLUG, t }));
    assert.equal(res.status, 403);
  });
});

test('a token minted for a different form is refused', async () => {
  await withSecret(SECRET, async () => {
    const t = mint(SECRET, SLUG, 'brand');
    const res = await handler(request({ form: 'intro', c: SLUG, t }));
    assert.equal(res.status, 403);
  });
});

test('a missing KEEPSITE_TOKEN_SECRET refuses rather than accepts', async () => {
  const prior = process.env.KEEPSITE_TOKEN_SECRET;
  delete process.env.KEEPSITE_TOKEN_SECRET;
  try {
    // A token minted under some secret the server no longer has configured
    // must not verify just because a secret is absent.
    const t = mint(SECRET, SLUG, 'intro');
    const res = await handler(request({ form: 'intro', c: SLUG, t }));
    assert.equal(res.status, 403);
  } finally {
    if (prior === undefined) delete process.env.KEEPSITE_TOKEN_SECRET;
    else process.env.KEEPSITE_TOKEN_SECRET = prior;
  }
});

test('a slug that fails the charset check is refused', async () => {
  await withSecret(SECRET, async () => {
    const t = mint(SECRET, 'Test_Co', 'intro');
    const res = await handler(request({ form: 'intro', c: 'Test_Co', t }));
    assert.equal(res.status, 403);
  });
});

test('an unknown form name is refused', async () => {
  await withSecret(SECRET, async () => {
    const t = mint(SECRET, SLUG, 'nope');
    const res = await handler(request({ form: 'nope', c: SLUG, t }));
    assert.equal(res.status, 403);
  });
});

test('the honeypot field short-circuits to the thanks redirect', async () => {
  const res = await handler(request({ 'bot-field': 'x', form: 'intro', c: SLUG }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/questionnaire/thanks/');
});

test('a validation failure returns 400 and names the failing field', async () => {
  await withSecret(SECRET, async () => {
    const t = mint(SECRET, SLUG, 'intro');
    // Required fields (email, business, whatWeDo, attract) are all omitted.
    const res = await handler(request({ form: 'intro', c: SLUG, t, name: 'Test' }));
    assert.equal(res.status, 400);
    const body = await res.text();
    assert.match(body, /email: required/);
  });
});

// The endpoint is anonymous, so a body that is not a form arrives routinely
// from scanners. An uncaught throw out of request.formData() would surface as
// a 500 and read like a broken function.
test('a body that is not a form submission returns 400, not 500', async () => {
  const res = await handler(
    new Request('http://localhost/api/questionnaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"not":"a form"}',
    }),
  );
  assert.equal(res.status, 400);
});

// Resend answers a rejected send (an unverified from-domain is a 422) with a
// 2xx-free response, not a thrown error, so a notify that never reads the
// response leaves no trace in the function log. The blob is still written
// either way; the log line is how anyone finds out the email did not go.
async function withResend(fn) {
  const prior = { key: process.env.RESEND_API_KEY, error: console.error };
  process.env.RESEND_API_KEY = 're_test';
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    return await fn(logged);
  } finally {
    console.error = prior.error;
    if (prior.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prior.key;
  }
}

const envelope = { slug: SLUG, form: 'intro', formVersion: '2026-09-03', answers: {}, files: [] };

test('notify logs the status and body when Resend refuses the send', async () => {
  await withResend(async (logged) => {
    const fetch = async () => new Response('{"message":"domain not verified"}', { status: 422 });
    await notify(envelope, fetch);
    assert.equal(logged.length, 1);
    const line = logged[0].join(' ');
    assert.match(line, /422/);
    assert.match(line, /domain not verified/);
    assert.match(line, new RegExp(`${SLUG}.*intro|intro.*${SLUG}`));
  });
});

test('notify logs nothing when Resend accepts the send', async () => {
  await withResend(async (logged) => {
    const fetch = async () => new Response('{"id":"x"}', { status: 200 });
    await notify(envelope, fetch);
    assert.deepEqual(logged, []);
  });
});

test('notify does nothing without a Resend key', async () => {
  const prior = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    let called = false;
    await notify(envelope, async () => { called = true; });
    assert.equal(called, false);
  } finally {
    if (prior !== undefined) process.env.RESEND_API_KEY = prior;
  }
});
