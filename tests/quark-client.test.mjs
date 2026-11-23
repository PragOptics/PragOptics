import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuarkClient } from '../src/assistant/quarkClient.js';

function fixture(send = async()=>({ok:true,html:'Reply'})) {
  let scope={userId:'fixture-user',tenant:'fixture-environment',lane:'live'};
  const calls=[];
  const client=createQuarkClient({context:()=>scope,send:async input=>{calls.push(input);return send(input);}});
  return {client,calls,change:patch=>{scope={...scope,...patch};}};
}
test('the chat sends a message and selected scope, without interpreting the text',async()=>{
  const f=fixture();await f.client.request({text:'A user supplied request'});
  assert.deepEqual(f.calls,[{text:'A user supplied request',tenant:'fixture-environment',lane:'live',audience:'customer'}]);
});
test('a control is forwarded opaquely and a double click cannot start a second request',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
  const first=f.client.request({ticket:'opaque-control'});
  await assert.rejects(f.client.request({ticket:'opaque-control'}),{code:'ACTION_PENDING'});
  release({ok:true,html:'Done'});await first;assert.equal(f.calls.length,1);
});
test('replies from another account, environment or lane never reach the UI',async()=>{
  for(const patch of [{userId:'other'},{tenant:'other'},{lane:'sandbox'}]){
    let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
    const pending=f.client.request({text:'hello'});f.change(patch);release({ok:true,html:'Previous scope data'});
    await assert.rejects(pending,{code:'SCOPE_CHANGED'});
  }
});
test('malformed replies are not reported as confirmed results',async()=>{
  for(const result of [null,{}, {ok:false,html:'no'},{ok:true,html:null}])await assert.rejects(fixture(async()=>result).client.request({text:'hello'}),/no confirmed reply/);
});
test('missing server deployment has a clear message and no local interpreter fallback',async()=>{
  const f=fixture(async()=>{throw {status:404};});await assert.rejects(f.client.request({text:'hello'}),/private service has not been deployed/);assert.equal(f.calls.length,1);
});
test('the display transport accepts no arbitrary operation, address or authority fields',async()=>{
  const f=fixture();for(const input of [{text:'hello',url:'https://other.test'},{text:'hello',isAdmin:true},{text:'hello',ticket:'also'},{}])await assert.rejects(f.client.request(input));
  f.change({userId:''});await assert.rejects(f.client.request({text:'hello'}),/Sign in/);assert.equal(f.calls.length,0);
});

test('cached-client compatibility exports contain no active local interpreter or provider action',async()=>{
  const legacy=await import('../src/assistant/quarkPlatform.js');
  assert.deepEqual(legacy.capabilityFamilies(),[]);assert.deepEqual(legacy.findCapabilities(),[]);
  assert.equal(legacy.capabilityDestination(),null);assert.equal(legacy.quarkRequestAllowed(),false);
  assert.throws(()=>legacy.createPlatformGuide(),/private service/);
});
