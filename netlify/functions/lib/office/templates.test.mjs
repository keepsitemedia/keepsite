import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../../../src/data/office/templates.json' with { type: 'json' };
import { validateTemplates, loadTemplates, findTemplate, fill, render, toHtml, toSafeHtml, placeholdersIn, KNOWN_PLACEHOLDERS } from './templates.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const ctx = {
  client: { name: 'Sierra Lee', firstName: 'Sierra', business: 'Lova', email: 's@example.com' },
  links: { intro: 'https://x/intro', brand: 'https://x/brand', build: 'https://x/build', demo: 'https://x/demo' },
  site: { brand: 'Keepsite Media', url: 'https://x', email: 'k@x', phone: '(385) 307-8190' },
  admin: { email: 'me@x' },
};

test('the seed validates and every placeholder is known or prompted', () => {
  assert.deepEqual(validateTemplates(seed), []);
  for (const t of seed) {
    const prompted = new Set((t.fields ?? []).map((f) => f.key));
    for (const p of placeholdersIn(`${t.subject}\n${t.body}`)) {
      assert.ok(KNOWN_PLACEHOLDERS.includes(p) || prompted.has(p), `${t.id}: {{${p}}} is neither known nor prompted`);
    }
  }
});

test('validateTemplates names each problem', () => {
  assert.match(validateTemplates('x').join(), /must be a list/);
  assert.match(validateTemplates([{ id: 'A', name: 'x', subject: 's', body: 'b' }]).join(), /id/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: '', body: 'b' }]).join(), /subject/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: 's', body: 'b' }, { id: 'a', name: 'y', subject: 's', body: 'b' }]).join(), /duplicate/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: 's', body: 'b', fields: [{ key: 'Bad Key', label: 'l' }] }]).join(), /key/);
  assert.match(validateTemplates([{ id: 'a', name: 'x', subject: 's', body: 'b', fields: [{ key: 'k' }] }]).join(), /label/);
});

test('loadTemplates prefers the stored copy', async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  assert.equal((await loadTemplates(s))[0].id, 'agreement');
  await s.settings.put('templates', [{ id: 'only', name: 'Only', subject: 's', body: 'b' }]);
  assert.equal((await loadTemplates(s))[0].id, 'only');
  assert.equal(findTemplate(seed, 'nope'), undefined);
});

test('fill substitutes known paths and leaves the rest visible', () => {
  const r = fill('Hi {{client.firstName}} from {{site.brand}}: {{links.intro}} {{ghost}} {{client.phone}}', ctx);
  assert.equal(r.text, 'Hi Sierra from Keepsite Media: https://x/intro {{ghost}} {{client.phone}}');
  assert.deepEqual(r.unresolved, ['ghost', 'client.phone']);
});

test('fill prefers a prompted value and can escape for HTML', () => {
  const r = fill('{{note}} {{client.business}}', { client: { business: 'A & B <Co>' } }, { note: 'Hello' }, { escape: true });
  assert.equal(r.text, 'Hello A &amp; B &lt;Co&gt;');
  const empty = fill('{{note}}', {}, { note: '' });
  assert.deepEqual(empty.unresolved, ['note']);
});

test('render fills subject and body, reports missing required fields, and renders HTML', () => {
  const t = findTemplate(seed, 'agreement');
  const r = render(t, ctx, { signLink: 'https://sign/1' });
  assert.equal(r.subject, 'Your Keepsite agreement');
  assert.match(r.text, /https:\/\/sign\/1/);
  assert.match(r.html, /<strong>Sign here:<\/strong>/);
  assert.deepEqual(r.missing, []);
  // The optional note defaults to '' and so renders as nothing, not as {{note}}.
  assert.ok(!r.text.includes('{{note}}'));
  const bare = render(t, ctx, {});
  assert.deepEqual(bare.missing, ['signLink']);
  assert.ok(bare.text.includes('{{signLink}}'));
  assert.deepEqual(bare.unresolved, ['signLink']);
});

test('toHtml renders paragraphs, bold and links', () => {
  const html = toHtml('Hi\n\n**bold** https://x/y');
  assert.match(html, /<p>Hi<\/p>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test('render with keepPrompted keeps an unfilled optional placeholder visible', () => {
  const t = findTemplate(seed, 'agreement');
  const r = render(t, ctx, {}, { keepPrompted: true });
  assert.ok(r.text.includes('{{note}}'));
});

test('toSafeHtml neutralizes a raw anchor and keeps Markdown and autolinks working', () => {
  assert.ok(toSafeHtml('For <a href="https://evil.test">x</a>').includes('&lt;a href'));
  assert.ok(!toSafeHtml('For <a href="https://evil.test">x</a>').includes('<a'));
  assert.ok(!toSafeHtml('[x](javascript:alert(1))').includes('javascript:'));
  const safe = toSafeHtml('**b** https://ok.test/a_b');
  assert.ok(safe.includes('<strong>b</strong>'));
  assert.ok(safe.includes('href="https://ok.test/a_b"'));
});

test('render escapes Markdown syntax in substituted values so they cannot become links', () => {
  const t = findTemplate(seed, 'agreement');
  const evil = { ...ctx, client: { ...ctx.client, business: '[click me](javascript:alert(1))' } };
  const r = render(t, evil, { signLink: 'https://sign/1' });
  // Only the real signLink autolinks; the injected value stays inert, literal text.
  assert.ok(!r.html.includes('href="javascript:'));
  assert.ok(r.html.includes('[click me](javascript:alert(1))'));
  assert.ok(r.text.includes('[click me](javascript:alert(1))'));
});

test('render keeps a URL value live, underscore and all', () => {
  const t = findTemplate(seed, 'agreement');
  const r = render(t, ctx, { signLink: 'https://app.hellosign.com/sign/abcDEF_123xyz' });
  assert.ok(r.html.includes('href="https://app.hellosign.com/sign/abcDEF_123xyz"'));
});

test('a URL-shaped value that fails the strict autolink pattern is not linked', () => {
  const t = findTemplate(seed, 'agreement');
  const evil = { ...ctx, client: { ...ctx.client, business: 'https://evil.test/x)' } };
  const r = render(t, evil, { signLink: 'https://sign/1' });
  assert.ok(!r.html.includes('href="https://evil.test'));
});
