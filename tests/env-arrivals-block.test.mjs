// Not yet acknowledged, on the environment's Home (2026-11-15): the pure words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countWords, shortKey } from '../src/account/envArrivalsBlock.js';

test('the count in words', () => {
  assert.equal(countWords(0), 'Every submission is acted on.');
  assert.equal(countWords(1), '1 submission nobody has acted on');
  assert.equal(countWords(4), '4 submissions nobody has acted on');
});

test('a long row key is shortened for the eye, a short one kept', () => {
  assert.equal(shortKey('sub-6b2847b282e948c9'), 'sub-6b2847b2…');
  assert.equal(shortKey('rev-1'), 'rev-1');
  assert.equal(shortKey(''), '');
});
