import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slateViolations } from './slate-audit.mjs';

const band = (inner) => `<main><section class="section section-slate"><div class="container">${inner}</div></section></main>`;

test('a page with no slate band has no violations', () => {
  assert.deepEqual(slateViolations('<main><section class="section"><p class="muted">x</p></section></main>'), []);
});

test('ink-only content passes', () => {
  assert.deepEqual(slateViolations(band('<h2 class="statement">Hi.</h2><p class="lead">Body.</p><a class="btn" href="/start/">Go</a><a class="slate-link" href="/packages/growth/">Growth</a>')), []);
});

test('muted, serif and link-arrow inside a band are violations', () => {
  const out = slateViolations(band('<p class="muted">a</p><p class="serif">b</p><a class="link-arrow" href="/">c</a>'));
  assert.equal(out.length, 4); // three classes plus the unstyled-link rule for .link-arrow
  assert.match(out[0], /muted/);
});

test('a link without btn or slate-link is a violation', () => {
  assert.match(slateViolations(band('<a href="/faq/">FAQ</a>'))[0], /unstyled link/);
});

test('two bands on one page is a violation', () => {
  const html = band('<p>a</p>') + band('<p>b</p>');
  assert.match(slateViolations(html)[0], /2 slate bands/);
});
