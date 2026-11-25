import test from 'node:test';
import assert from 'node:assert/strict';
import { isManagedPrintful, printfulConnectionWords, printfulStoreSettingsUrl } from '../src/account/printfulConnection.js';

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

test('authorization and store naming are separate and only a provider-matching name finishes setup', () => {
  const row = { provider:'printful', status:'ACTIVE', detail:{managed:'printful-connect', storeId:'19126078', storeName:'PragOptics store', requestedStoreName:'Bridges Industrial'} };
  let words = printfulConnectionWords(row);
  assert.equal(words.connected,true); assert.equal(words.identity,'PragOptics store');
  assert.equal(words.requestedName,'Bridges Industrial'); assert.equal(words.namingRequired,true);
  assert.match(words.needs,/Set the name to “Bridges Industrial” in Printful/);
  assert.equal(words.settingsUrl,'https://www.printful.com/dashboard/settings/19126078/store-defaults');
  row.detail.storeName='Bridges Industrial'; words=printfulConnectionWords(row);
  assert.equal(words.namingRequired,false); assert.equal(words.needs,''); assert.equal(words.identity,'Bridges Industrial');
});

test('store settings links accept only a Printful connection with a valid numeric store ID', () => {
  for(const id of ['../other','1/../../other','123?redirect=evil','https://evil.test', '-1','0','9007199254740992']) {
    assert.equal(printfulStoreSettingsUrl({provider:'printful',detail:{managed:'printful-connect',storeId:id}}),'');
  }
  assert.equal(printfulStoreSettingsUrl({provider:'shopify',detail:{managed:'printful-connect',storeId:'10'}}),'');
});
