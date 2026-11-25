import test from 'node:test';
import assert from 'node:assert/strict';
import { isManagedPrintful, printfulConnectionWords } from '../src/account/printfulConnection.js';

test('only a verified active Printful connection is described as connected', () => {
  const row = { provider:'printful', status:'PENDING', detail:{ managed:'printful-connect', storeName:'Synthetic store', awaitingConfirm:true } };
  assert.equal(isManagedPrintful(row), true);
  assert.equal(printfulConnectionWords(row).status, 'finishing authorization');
  assert.equal(printfulConnectionWords(row).connected, false);
  assert.match(printfulConnectionWords(row).needs, /account that started/);
  assert.match(printfulConnectionWords(row).billing, /confirm fulfillment/);
  row.status = 'ACTIVE'; assert.equal(printfulConnectionWords(row).status, 'connected');
  assert.equal(printfulConnectionWords(row).needs, '');
  assert.equal(isManagedPrintful({ ...row, provider:'shopify' }), false);
});

test('denied and ended authorizations retain the provider diagnostic', () => {
  assert.equal(printfulConnectionWords({ status:'PENDING', detail:{declined:true} }).status, 'declined');
  const row = { status:'REJECTED', lastError:'Reconnect this store.', detail:{disconnected:true} };
  assert.equal(printfulConnectionWords(row).status, 'disconnected');
  assert.equal(printfulConnectionWords(row).needs, row.lastError);
});
