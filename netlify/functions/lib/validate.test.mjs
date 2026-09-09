import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './validate.mjs';

const def = {
  formVersion: '2026-09-03',
  form: 'build',
  sections: [
    {
      legend: 'Test',
      questions: [
        { key: 'whatWeDo', label: 'What?', type: 'paragraph', required: true },
        { key: 'pages', label: 'Pages?', type: 'checkboxes', options: ['Home', 'About'] },
        { key: 'primaryAction', label: 'Action?', type: 'choice', options: ['Call', 'Email'] },
        { key: 'feelWanted', label: 'Feel?', type: 'openChecklist', options: ['Warm', 'Bold'] },
      ],
    },
  ],
};

test('a good submission produces the answers object', () => {
  const { answers, errors } = validate(def, [
    ['whatWeDo', 'We do things.'],
    ['pages', 'Home'],
    ['pages', 'About'],
    ['primaryAction', 'Call'],
  ]);
  assert.deepEqual(errors, []);
  assert.equal(answers.whatWeDo, 'We do things.');
  assert.deepEqual(answers.pages, ['Home', 'About']);
  assert.equal(answers.primaryAction, 'Call');
});

test('unknown keys are rejected', () => {
  const { errors } = validate(def, [['whatWeDo', 'x'], ['sneaky', 'y']]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sneaky/);
});

test('a choice outside its options is rejected', () => {
  const { errors } = validate(def, [['whatWeDo', 'x'], ['primaryAction', 'Fax']]);
  assert.match(errors[0], /primaryAction/);
});

test('a checkbox outside its options is rejected', () => {
  const { errors } = validate(def, [['whatWeDo', 'x'], ['pages', 'Nope']]);
  assert.match(errors[0], /pages/);
});

test('an openChecklist accepts an unlisted value', () => {
  const { answers, errors } = validate(def, [
    ['whatWeDo', 'x'],
    ['feelWanted', 'Warm'],
    ['feelWanted__own', 'Empowering'],
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(answers.feelWanted, ['Warm', 'Empowering']);
});

test('a missing required answer is rejected', () => {
  const { errors } = validate(def, [['pages', 'Home']]);
  assert.match(errors[0], /whatWeDo/);
});

test('optional questions absent from the submission come back empty', () => {
  const { answers } = validate(def, [['whatWeDo', 'x']]);
  assert.equal(answers.primaryAction, '');
  assert.deepEqual(answers.pages, []);
});

test('the honeypot and transport fields are ignored, not rejected', () => {
  const { errors } = validate(def, [
    ['whatWeDo', 'x'],
    ['bot-field', ''],
    ['form', 'build'],
    ['formVersion', '2026-09-03'],
    ['c', 'lova'],
    ['t', 'abc'],
  ]);
  assert.deepEqual(errors, []);
});

// The brand form's demoPick is the one answer that leaves the answers object
// as an identifier rather than prose: the sitemap skill looks it up against
// the demo's section ids. Anything that is not a plausible id is refused.
const demoDef = {
  formVersion: '2026-09-03',
  form: 'brand',
  sections: [{ legend: 'Demo', questions: [{ key: 'pick', label: 'Which?', type: 'demoPick' }] }],
};

test('a demoPick id passes through unchanged', () => {
  const { answers, errors } = validate(demoDef, [['pick', 'field-and-bloom']]);
  assert.deepEqual(errors, []);
  assert.equal(answers.pick, 'field-and-bloom');
});

test('a demoPick of "mix" becomes null', () => {
  const { answers, errors } = validate(demoDef, [['pick', 'mix']]);
  assert.deepEqual(errors, []);
  assert.equal(answers.pick, null);
});

test('an absent demoPick becomes null', () => {
  const { answers, errors } = validate(demoDef, []);
  assert.deepEqual(errors, []);
  assert.equal(answers.pick, null);
});

test('a demoPick that is not an id is rejected', () => {
  for (const bad of ['<script>alert(1)</script>', 'Demo 1', 'UPPER', 'a'.repeat(41), '../x']) {
    const { errors } = validate(demoDef, [['pick', bad]]);
    assert.equal(errors.length, 1, bad);
    assert.match(errors[0], /^pick:/);
  }
});
