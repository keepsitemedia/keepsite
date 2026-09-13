import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWindow, feedItems } from './feed.mjs';

const today = '2026-09-13';
const office = 'https://www.keepsitemedia.com/office/';
const clients = [{ slug: 'acme', business: 'Acme' }];
const t = (over) => ({ id: '20260901T000000aaaaaa', slug: 'acme', title: 'T', due: today, time: null, done: false, source: 'manual', stage: null, questionnaire: null, payment: null, agreement: null, project: null, repeat: null, ...over });
const m = (over) => ({ id: '20260901T000000bbbbbb', slug: 'acme', title: 'M', ymd: today, time: '10:00', minutes: 30, link: '', ...over });

test('parseWindow defaults and validates', () => {
  assert.deepEqual(parseWindow({}, today), { from: '2026-08-14', to: '2026-12-12', brand: null });
  assert.deepEqual(parseWindow({ from: '2026-09-01', to: '2026-09-30', brand: 'lova' }, today), { from: '2026-09-01', to: '2026-09-30', brand: 'lova' });
  assert.match(parseWindow({ from: 'x' }, today).error, /from/);
  assert.match(parseWindow({ to: '2026-13-01' }, today).error, /to/);
  assert.match(parseWindow({ from: '2026-09-02', to: '2026-09-01' }, today).error, /before/);
  assert.match(parseWindow({ brand: 'acme' }, today).error, /brand/);
});

test('feedItems shapes tasks and meetings, filters the window, and sorts', () => {
  const window = { from: '2026-09-10', to: '2026-09-20', brand: null };
  const tasks = [
    t({ id: '20260901T000000aaaaa1', title: 'Late', due: '2026-09-12', time: '14:00', done: true }),
    t({ id: '20260901T000000aaaaa2', title: 'Sign', due: '2026-09-12', agreement: 'completed', source: 'pipeline', stage: 'agreement' }),
    t({ id: '20260901T000000aaaaa3', slug: 'office', title: 'Post', due: '2026-09-12', project: 'Marketing', repeat: 'weekly' }),
    t({ id: '20260901T000000aaaaa4', title: 'Out', due: '2026-09-25' }),
    t({ id: '20260901T000000aaaaa5', slug: 'ghost', title: 'Orphan', due: '2026-09-12' }),
  ];
  const meetings = [m({ ymd: '2026-09-12' }), m({ id: '20260901T000000bbbbb2', ymd: '2026-10-01' })];
  const items = feedItems({ tasks, meetings, clients, window, office });
  assert.deepEqual(items.map((i) => i.title), ['Post', 'Sign', 'M', 'Late']);
  const sign = items[1];
  assert.deepEqual(sign, {
    kind: 'task', id: '20260901T000000aaaaa2', brand: 'keepsite', slug: 'acme', business: 'Acme', title: 'Sign',
    due: '2026-09-12', time: null, done: false, waitsOnClient: true, source: 'pipeline', stage: 'agreement',
    project: null, repeat: null, url: `${office}clients/acme/?tab=tasks`,
  });
  const post = items[0];
  assert.equal(post.brand, null);
  assert.equal(post.business, null);
  assert.equal(post.url, `${office}tasks/`);
  assert.equal(post.project, 'Marketing');
  const meeting = items[2];
  assert.deepEqual(meeting, {
    kind: 'meeting', id: '20260901T000000bbbbbb', brand: 'keepsite', slug: 'acme', business: 'Acme', title: 'M',
    ymd: '2026-09-12', time: '10:00', minutes: 30, link: '', url: `${office}clients/acme/?tab=meetings`,
  });
});

test('a brand filter keeps own tasks and drops the other brand', () => {
  const window = { from: '2026-09-10', to: '2026-09-20', brand: 'lova' };
  const tasks = [t({ id: '20260901T000000aaaaa1' }), t({ id: '20260901T000000aaaaa3', slug: 'office', title: 'Own' })];
  assert.deepEqual(feedItems({ tasks, meetings: [], clients, window, office }).map((i) => i.title), ['Own']);
  const all = { ...window, brand: 'keepsite' };
  assert.equal(feedItems({ tasks, meetings: [], clients, window: all, office }).length, 2);
});
