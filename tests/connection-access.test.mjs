import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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

function connectionLoader(response, pick = '') {
  const source=fs.readFileSync(new URL('../src/account/environment.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const start=source.indexOf('async function loadConnections()');
  const code=source.slice(start,source.indexOf('\nfunction paint()',start));
  let checks=0,current='review-env';
  const ev={teamId:current,lane:'live',connPick:pick,connDraft:{}};
  const load=vm.runInNewContext(code+'; loadConnections',{ev,D:{apiFetch:async()=>response},ENV_URL:'/environment',url:x=>x,teamId:()=>current,connectionAccessMode,
    checkShopifySupplierMode:()=>{checks++;},setTimeout:()=>{},paintConnections:()=>{},paintShipping:()=>{},loadShippingLabels:()=>{},paintDomains:()=>{}});
  return {load,ev,checks:()=>checks,switchTeam:()=>{current='other-env';}};
}
test('the native initial connection load starts Shopify setup for an auto-selected review grant',async()=>{
  const f=connectionLoader({connections:[],providers:[],limit:20,access:{kind:'shopify-review',expiresAt:'2026-12-24T12:00:00Z'}});
  await f.load();assert.equal(f.ev.connPick,'m:shopify');assert.equal(f.checks(),1);
});
test('ordinary provider selection is preserved and stale connection reads cannot start setup in another environment',async()=>{
  const paid=connectionLoader({connections:[],providers:[{id:'stripe'}]},'m:stripe');await paid.load();assert.equal(paid.ev.connPick,'m:stripe');assert.equal(paid.checks(),0);
  const stale=connectionLoader({connections:[],access:{kind:'shopify-review',expiresAt:'2026-12-24T12:00:00Z'}});const pending=stale.load();stale.switchTeam();await pending;assert.equal(stale.checks(),0);assert.equal(stale.ev.connPick,'');
});
