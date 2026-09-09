import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from './csv.mjs';

test('header is the union of keys in first-seen order', () => {
  const out = toCsv([{ a: 1, b: 'x' }, { b: 'y', c: true }]);
  assert.equal(out, 'a,b,c\r\n1,x,\r\n,y,true\r\n');
});

test('quotes commas, quotes and newlines; nests as JSON; disarms formulas', () => {
  const out = toCsv([{ t: 'a, "b"\nc', o: { k: 1 }, l: [1, 2], f: '=SUM(A1)', n: null }]);
  assert.equal(out, 't,o,l,f,n\r\n"a, ""b""\nc","{""k"":1}","[1,2]",\'=SUM(A1),\r\n');
});

test('no rows gives an empty string', () => {
  assert.equal(toCsv([]), '');
});
