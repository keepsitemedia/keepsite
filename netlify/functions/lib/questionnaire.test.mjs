// Covers every path that returns before touching Netlify Blobs, so this runs
// under plain `node --test` with no server and no store. It lives in lib/
// rather than beside questionnaire.mjs because Netlify treats every top-level
// file in netlify/functions/ as a deployable function, and this one exports no
// handler; lib/ is safe because it has no entry file matching its own name.
//
// The happy path (valid token, successful submission) calls into Blobs and is
// not covered here — see task-10-report.md for how it was checked instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../questionnaire.mjs';
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
