import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/runtime/bootstrap.js',import.meta.url),'utf8');
const start=source.indexOf('    const __handoff = consumeLaneHandoff();'),end=source.indexOf('    // The lane flag lives',start);
const code=source.slice(start,end);
function fixture(failure){
  const events=[],box={textContent:'',hidden:true};
  const ctx={LANE:'dev',PRAG_API_BASE:'https://dev.example.test',consumeLaneHandoff:()=> 'synthetic-transfer',consumeLaneVerifier:()=> 'synthetic-verifier',consumeLaneSigninFlag:()=>false,
    promptForCode:async()=> 'synthetic-code',redeemLaneSession:async()=>{if(failure)throw failure;return{tokens:{access_token:'synthetic-token'},ping:{user:{userId:'dev-owner'},deployment:{lane:'dev'}}};},
    sessionStorage:{setItem:(key)=>events.push(key)},setToken:()=>events.push('session-change'),lastPing:null,syncUserTheme(){},closeLoginModal:()=>events.push('close-login'),
    refreshAdminNav:()=>events.push('refresh-navigation'),uncoverSession:()=>events.push('uncover'),applyPostLoginResolution:()=>events.push('account-ready'),
    window:{setConsoleAuthenticated(){},syncLandingPlans(){}},document:{getElementById:()=>box},openLoginModal:()=>events.push('sign-in'),showStatusModal(){},setTimeout
  };
  return{ctx,events,box};
}
test('a verified lane handoff follows the normal session lifecycle before opening the target account',async()=>{
  const f=fixture();vm.runInNewContext(code,f.ctx);await new Promise(setImmediate);
  assert.deepEqual(f.events,['pragoptics_ping','session-change','close-login','refresh-navigation','uncover','account-ready']);
  assert.equal(f.ctx.lastPing.user.userId,'dev-owner');
});
test('a rejected code preserves the diagnostic and cannot install an account session',async()=>{
  const f=fixture(Object.assign(new Error('The transfer expired.'),{code:'LANE_REDEEM_401'}));vm.runInNewContext(code,f.ctx);await new Promise(setImmediate);
  assert.deepEqual(f.events,['sign-in']);assert.match(f.box.textContent,/switch to dev.*transfer expired.*LANE_REDEEM_401/);assert.equal(f.box.hidden,false);
});
