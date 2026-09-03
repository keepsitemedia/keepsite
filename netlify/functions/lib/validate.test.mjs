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
