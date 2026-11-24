import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionAccessMode, connectionOptions, connectionAccessNote } from '../src/account/connectionAccess.js';
test('review controls expose only the managed Shopify flow, without credential entry', () => {
  const access = connectionAccessMode({ access: { kind: 'shopify-review', expiresAt: '2026-12-23T12:00:00Z', issuedBy: 'private-operator', reason: 'private-note' } });
  assert.deepEqual(connectionOptions([['m:stripe','Stripe'],['m:shopify','Shopify'],['m:google','Google']], [['shopify','Paste token']], access), { managed: [['m:shopify','Shopify']], credentials: [] });
  assert.doesNotMatch(JSON.stringify(access), /private-/);
  assert.match(connectionAccessNote(access), /billing plan remains Free/);
});
test('ordinary accounts retain their controls and absent or malformed responses clear review presentation', () => {
  const managed = [['m:stripe','Stripe']], credentials = [['openai','OpenAI']];
  for (const response of [null, {}, {access:{kind:'unknown',expiresAt:'2026-12-23'}}, {access:{kind:'shopify-review',expiresAt:'invalid'}}]) {
    assert.equal(connectionAccessMode(response), null);
    assert.deepEqual(connectionOptions(managed, credentials, connectionAccessMode(response)), {managed, credentials});
  }
});
