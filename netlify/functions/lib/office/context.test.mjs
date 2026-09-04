import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, siteUrl } from './context.mjs';
import { mint } from '../token.mjs';

const client = { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' };

test('siteUrl prefers the Netlify URL variable', () => {
  const prior = process.env.URL;
  process.env.URL = 'https://preview.test';
  try { assert.equal(siteUrl(), 'https://preview.test'); } finally {
    if (prior === undefined) delete process.env.URL; else process.env.URL = prior;
  }
  delete process.env.URL;
  assert.equal(siteUrl(), 'https://www.keepsitemedia.com');
});

test('buildContext fills client, links, site and admin', () => {
  delete process.env.URL;
  const c = buildContext({ client, admin: { email: 'me@x' }, secret: 'sec' });
  assert.equal(c.client.firstName, 'Sierra');
  assert.equal(c.client.business, 'Lova');
  assert.equal(c.links.intro, `https://www.keepsitemedia.com/questionnaire/intro/?c=lova&t=${mint('sec', 'lova', 'intro')}`);
  assert.equal(c.links.demo, 'https://www.keepsitemedia.com/demo/lova/');
  assert.equal(c.site.brand, 'Keepsite Media');
  assert.equal(c.admin.email, 'me@x');
  assert.equal(c.questionnaire, undefined);
});

test('no secret means no questionnaire links, and a form adds the questionnaire block', () => {
  const c = buildContext({ client, admin: { email: 'me@x' }, secret: '', form: 'brand' });
  assert.equal(c.links.intro, '');
  assert.equal(c.questionnaire.link, '');
  assert.equal(c.questionnaire.title, 'brand and demo questionnaire');
});

test('a meeting adds when, link, minutes and hours', () => {
  const meeting = { title: 'Kickoff', ymd: '2026-09-08', time: '14:30', minutes: 30, link: 'https://meet/x' };
  const c = buildContext({ client, admin: { email: 'me@x' }, secret: '', meeting, now: new Date('2026-09-08T18:30:00Z') });
  assert.equal(c.meeting.when, 'Tue, Sep 8 at 2:30 pm Mountain');
  assert.equal(c.meeting.minutes, 30);
  assert.equal(c.meeting.hours, 'about 2 hours');
});
