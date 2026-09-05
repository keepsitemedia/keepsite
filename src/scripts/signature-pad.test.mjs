import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The pad is a browser IIFE with no exports, so it runs here against the
// smallest DOM it touches: no dependency, and the double-submit guard is the
// one behaviour that cannot be checked from the server side.
const SOURCE = fs.readFileSync(new URL('./signature-pad.js', import.meta.url), 'utf8');

const el = (props = {}) => ({
  handlers: {},
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); },
  fire(type, ev = {}) { for (const fn of this.handlers[type] ?? []) fn(ev); },
  getAttribute: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  ...props,
});

function dom() {
  const ctx = { scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} };
  const canvas = el({
    clientWidth: 300, clientHeight: 120,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
    toDataURL: () => 'data:image/png;base64,AAAA',
  });
  const target = { value: '' };
  const submit = { disabled: true };
  const form = el({
    querySelector: (sel) => (sel.startsWith('button') ? submit : target),
    querySelectorAll: () => [],
  });
  const pad = el({
    querySelector: (sel) => (sel === 'canvas' ? canvas : null),
    closest: () => form,
    getAttribute: (name) => (name === 'data-target' ? 'signature' : null),
  });
  const document = { querySelectorAll: () => [pad], getElementById: () => null };
  const run = new Function('document', 'window', SOURCE);
  run(document, { devicePixelRatio: 1 });
  return { canvas, form, target, submit };
}

test('the pad writes the PNG on submit and disables the button so a double-click posts once', () => {
  const { canvas, form, target, submit } = dom();
  assert.equal(submit.disabled, true);
  canvas.fire('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 });
  assert.equal(submit.disabled, false);
  let prevented = false;
  form.fire('submit', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(target.value, 'data:image/png;base64,AAAA');
  assert.equal(submit.disabled, true);
});

test('submitting with an empty pad is refused', () => {
  const { form, target } = dom();
  let prevented = false;
  form.fire('submit', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(target.value, '');
});
