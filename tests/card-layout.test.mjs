import test from 'node:test';
import assert from 'node:assert/strict';
import { cardView, cardStateKey, setCardView } from '../src/account/cardLayout.js';
import { cardHtml, setOpen } from '../src/account/cards.js';
const local = new Map(), session = new Map();
globalThis.localStorage = { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) };
globalThis.sessionStorage = { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value) };
globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };

test('the default is a compact closed list; explicit deep links still open their card', () => {
  assert.equal(cardView(), 'list');
  assert.match(cardHtml({ key: 'environment:shipping', title: 'Shipping', body: '<button>Get rates</button>' }), /aria-expanded="false"/);
  setOpen('environment:shipping', true);
  assert.match(cardHtml({ key: 'environment:shipping', title: 'Shipping' }), /aria-expanded="true"/);
});
test('list and card layouts remember separate open states without rewriting their forms', () => {
  const listKey = cardStateKey();
  setCardView('cards'); assert.notEqual(cardStateKey(), listKey);
  setOpen('environment:shipping', false);
  assert.match(cardHtml({ key: 'environment:shipping', title: 'Shipping' }), /aria-expanded="false"/);
  setCardView('list'); assert.match(cardHtml({ key: 'environment:shipping', title: 'Shipping' }), /aria-expanded="true"/);
});
test('layout choice remains usable when browser storage is unavailable', () => {
  globalThis.localStorage = { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } };
  setCardView('cards'); assert.equal(cardView(), 'cards');
  setCardView('list'); assert.equal(cardView(), 'list');
});
