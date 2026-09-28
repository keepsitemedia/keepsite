import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierHref, priceAmount, serviceNode, linkPackages, stageLines, faqItems, notIfLinks,
} from './tiers.mjs';

const tiers = [
  { id: 'presence', name: 'Presence', sub: 'For businesses that already find clients.', buildPrice: '$2,400', monthlyPrice: '$85', page: { notIf: [{ tier: 'growth', text: 'You want Google.' }] } },
  { id: 'growth', name: 'Growth', sub: 'For search.', buildPrice: '$3,600', monthlyPrice: '$225', page: { notIf: [{ tier: 'presence', text: 'a' }, { tier: 'agile', text: 'b' }] } },
  { id: 'agile', name: 'Agile', sub: 'For new things.', buildPrice: '$4,200', monthlyPrice: '$595', page: { notIf: [{ tier: 'nope', text: 'c' }] } },
];

test('tierHref builds the package page path', () => {
  assert.equal(tierHref('growth'), '/packages/growth/');
});

test('priceAmount reads a display price and refuses anything else', () => {
  assert.equal(priceAmount('$2,400'), '2400.00');
  assert.equal(priceAmount('$85'), '85.00');
  assert.throws(() => priceAmount('quoted'), /price/);
  assert.throws(() => priceAmount('$0'), /price/);
});

test('serviceNode carries the tier prices and the page url', () => {
  const node = serviceNode(tiers[0], {
    packagesUrl: 'https://www.keepsitemedia.com/packages/',
    pageUrl: 'https://www.keepsitemedia.com/packages/presence/',
    businessId: 'https://www.keepsitemedia.com/#business',
  });
  assert.equal(node['@type'], 'Service');
  assert.equal(node['@id'], 'https://www.keepsitemedia.com/packages/#presence');
  assert.equal(node.url, 'https://www.keepsitemedia.com/packages/presence/');
  assert.equal(node.provider['@id'], 'https://www.keepsitemedia.com/#business');
  assert.equal(node.offers[0].price, '2400.00');
  assert.equal(node.offers[1].priceSpecification.price, '85.00');
  assert.equal(node.offers[1].priceSpecification.billingDuration, 'P1M');
});

test('linkPackages links exact tier names and leaves other words plain', () => {
  assert.deepEqual(linkPackages('Growth or Range', [...tiers, { id: 'range', name: 'Range' }]), [
    { text: 'Growth', href: '/packages/growth/' },
    { text: ' or ' },
    { text: 'Range', href: '/packages/range/' },
  ]);
  assert.deepEqual(linkPackages('Keep going', tiers), [{ text: 'Keep going' }]);
  assert.deepEqual(linkPackages('Presence', tiers), [{ text: 'Presence', href: '/packages/presence/' }]);
});

test('stageLines pulls one line per stage for the tier and fails on a gap', () => {
  const process = { stages: { items: [
    { title: 'Style', tiers: [{ name: 'Presence', body: 'Pick one.' }, { name: 'Growth', body: 'We research.' }] },
    { title: 'Function', tiers: [{ name: 'Presence', body: 'Your pages.' }] },
  ] } };
  assert.deepEqual(stageLines(process, 'Presence'), [
    { title: 'Style', body: 'Pick one.' },
    { title: 'Function', body: 'Your pages.' },
  ]);
  assert.throws(() => stageLines(process, 'Growth'), /Function has no line for Growth/);
});

test('faqItems resolves topics in order and fails on an unknown one', () => {
  const faq = { groups: [
    { items: [{ topic: 'a', q: 'A?', a: 'a.' }] },
    { items: [{ topic: 'b', q: 'B?', a: 'b.' }] },
  ] };
  assert.deepEqual(faqItems(faq, ['b', 'a']).map((i) => i.topic), ['b', 'a']);
  assert.throws(() => faqItems(faq, ['zzz']), /unknown FAQ topic: zzz/);
});

test('notIfLinks resolves neighbours and fails on an unknown tier id', () => {
  assert.deepEqual(notIfLinks(tiers[1], tiers), [
    { text: 'a', name: 'Presence', href: '/packages/presence/' },
    { text: 'b', name: 'Agile', href: '/packages/agile/' },
  ]);
  assert.throws(() => notIfLinks(tiers[2], tiers), /agile: notIf points at unknown tier nope/);
  assert.deepEqual(notIfLinks({ id: 'x', name: 'X' }, tiers), []);
});
