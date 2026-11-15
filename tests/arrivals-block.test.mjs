// Not acknowledged, on the Overview (2026-11-15): the words and the desks, pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kindWords, sectionOf, countWords, arrivalsCount } from '../src/account/arrivalsBlock.js';

test('every kind has its words and its desk', () => {
  assert.equal(kindWords('contact'), 'Visitor message'); assert.equal(sectionOf('contact'), 'support');
  assert.equal(kindWords('support'), 'Support request'); assert.equal(sectionOf('support'), 'support');
  assert.equal(kindWords('anomaly'), 'Site report'); assert.equal(sectionOf('anomaly'), 'reports');
  assert.equal(kindWords('interest'), 'Launch sign-up'); assert.equal(sectionOf('interest'), 'catalog');
  assert.equal(kindWords('other'), 'Request');
});

test('the count in words', () => {
  assert.equal(countWords(0), 'Everything that arrived is acted on.');
  assert.equal(countWords(1), '1 request you have not acted on');
  assert.equal(countWords(3), '3 requests you have not acted on');
});

test('arrivalsCount: the count, null where the lane lacks the route, a throw on anything else', async () => {
  assert.equal(await arrivalsCount(async () => ({ ok: true, items: [{}, {}], count: 2 })), 2);
  assert.equal(await arrivalsCount(async () => { throw Object.assign(new Error('no'), { status: 404 }); }), null);
  await assert.rejects(() => arrivalsCount(async () => { throw Object.assign(new Error('down'), { status: 500 }); }));
});
