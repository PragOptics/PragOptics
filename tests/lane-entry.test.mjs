import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sessionRoutingLane,clearLaneRouting,returnExpiredDevToLive,consumeSessionReturnNotice,SESSION_LANE_KEY,LANE_SIGNIN_KEY,LANE_HANDOFF_KEY,LANE_VERIFIER_KEY,DEV_ENTRY_KEY} from '../src/runtime/studioHandoff.js';
import {showDevelopmentIndicators,signInTitle} from '../src/components/platformLaneBadge.js';
const memory=(seed={})=>{const data=new Map(Object.entries(seed));return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};

test('an anonymous stale Dev preference cannot route a fresh visitor away from production',()=>{
 const session=memory({[SESSION_LANE_KEY]:'dev'}),legacy=memory({pragoptics_lane_override:'dev'});
 assert.equal(sessionRoutingLane({session,legacy}),null);assert.equal(session.getItem(SESSION_LANE_KEY),null);
});
test('deliberate operator entry survives the one-shot sign-in flag and an intermediate refresh',()=>{
 const session=memory({[SESSION_LANE_KEY]:'dev',[DEV_ENTRY_KEY]:'1',[LANE_SIGNIN_KEY]:'1'});
 session.removeItem(LANE_SIGNIN_KEY);assert.equal(sessionRoutingLane({session}),'dev');
 clearLaneRouting(session,memory());assert.equal(sessionRoutingLane({session}),null);
});
test('a verified existing Dev session is kept even when its account lacks operator flags on Dev',()=>{
 const session=memory({[SESSION_LANE_KEY]:'dev',pragoptics_tokens:JSON.stringify({access_token:'fixture'}),pragoptics_ping:JSON.stringify({user:{isDev:false,isAdmin:false},deployment:{lane:'dev'}})});
 assert.equal(sessionRoutingLane({session}),'dev');
});
test('logout resets routing and pending transfers while preserving the cart and saved work',async()=>{
 const session=memory({[SESSION_LANE_KEY]:'dev',[DEV_ENTRY_KEY]:'1',[LANE_SIGNIN_KEY]:'1',[LANE_HANDOFF_KEY]:'one-use',[LANE_VERIFIER_KEY]:'proof',pragoptics_tokens:'fixture',pragoptics_ping:'fixture',unrelated:'keep'});
 const legacy=memory({pragoptics_lane_override:'dev',cart:'keep',savedBuild:'keep'}),destinations=[];
 globalThis.sessionStorage=session;globalThis.localStorage=legacy;globalThis.window={location:{replace:target=>destinations.push(target)}};
 const {logout}=await import('../src/runtime/session.js');logout();
 for(const key of [SESSION_LANE_KEY,DEV_ENTRY_KEY,LANE_SIGNIN_KEY,LANE_HANDOFF_KEY,LANE_VERIFIER_KEY,'pragoptics_tokens','pragoptics_ping'])assert.equal(session.getItem(key),null);
 assert.equal(legacy.getItem('pragoptics_lane_override'),null);assert.equal(legacy.getItem('cart'),'keep');assert.equal(legacy.getItem('savedBuild'),'keep');assert.equal(session.getItem('unrelated'),'keep');assert.deepEqual(destinations,['/']);
 assert.equal(sessionRoutingLane({session,legacy}),null);
});
test('an expired production Dev page returns to Live before another sign-in and retains its generic notice once',()=>{
 const session=memory({[SESSION_LANE_KEY]:'dev',[DEV_ENTRY_KEY]:'1'}),legacy=memory(),destinations=[];
 assert.equal(returnExpiredDevToLive({lane:'dev',host:'pragoptics.com',reason:'expired',session,legacy,navigate:u=>destinations.push(u)}),true);
 assert.deepEqual(destinations,['/#account']);assert.equal(sessionRoutingLane({session,legacy}),null);assert.equal(consumeSessionReturnNotice(session),'expired');assert.equal(consumeSessionReturnNotice(session),null);
 assert.equal(returnExpiredDevToLive({lane:'live',host:'pragoptics.com',session,legacy,navigate:u=>destinations.push(u)}),false);assert.equal(destinations.length,1);
});
test('the actual expiry handler clears the old session and reloads the production page into Live',()=>{
 const source=readFileSync(new URL('../src/runtime/bootstrap.js',import.meta.url),'utf8'),start=source.indexOf('    function invalidateSession('),end=source.indexOf('\n    function updateWizardMenuFromPing',start);
 const session=memory({pragoptics_tokens:'old',pragoptics_ping:'old',[SESSION_LANE_KEY]:'dev',[DEV_ENTRY_KEY]:'1'}),legacy=memory({cart:'keep'}),destinations=[];
 const context={sessionStorage:session,localStorage:legacy,LANE:'dev',location:{hostname:'pragoptics.com'},clearLaneRouting,returnExpiredDevToLive,
  closePrivateModals(){},clearAllWizardSurfaces(){},setWizardMenuVisible(){},sessionChanged(){},refreshAdminNav(){},setAppMode(){},uncoverSession(){},setTimeout(){},showStatusModal(){},
  document:{getElementById:()=>null,querySelectorAll:()=>[]},window:{location:{replace:u=>destinations.push(u)}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);assert.equal(context.invalidateSession('expired'),true);
 assert.deepEqual(destinations,['/#account']);assert.equal(session.getItem('pragoptics_tokens'),null);assert.equal(sessionRoutingLane({session,legacy}),null);assert.equal(legacy.getItem('cart'),'keep');
});
test('Live login is unchanged, while Dev is explicit before and after sign-in',()=>{
 const nodes={platformDevBadge:{hidden:true},loginDevNotice:{hidden:true}},doc={getElementById:id=>nodes[id]};
 showDevelopmentIndicators('dev',doc);assert.equal(nodes.platformDevBadge.hidden,false);assert.equal(nodes.loginDevNotice.hidden,false);assert.match(signInTitle('login','dev'),/— Dev$/);
 showDevelopmentIndicators('live',doc);assert.equal(nodes.platformDevBadge.hidden,true);assert.equal(nodes.loginDevNotice.hidden,true);assert.equal(signInTitle('login','live'),'Sign in to PragOptics™');
});

const laneSource=readFileSync(new URL('../src/runtime/lane.js',import.meta.url),'utf8');
const switchStart=laneSource.indexOf('export async function switchLane('),switchEnd=laneSource.indexOf('\n/** One-shot:',switchStart);
function switchFixture({operator=true,lane='live',response={ok:true,status:200,json:async()=>({token:'fixture-handoff'})}}={}){
 let token='fixture-session',version=1;const requests=[],landings=[],messages=[];
 const context={LANE:lane,PRAG_API_BASE:'https://fixture.example/v1',currentToken:()=>token,sessionVersion:()=>version,isPlatformOperator:()=>operator,randomHex:()=> 'fixture-verifier',sha256Hex:async()=> 'fixture-binding',AbortSignal,
 fetch:async(...args)=>{requests.push(args);return typeof response==='function'?response():response;},landOnTarget:(...args)=>landings.push(args),showStatusModal:m=>messages.push(m)};
 vm.createContext(context);vm.runInContext(laneSource.slice(switchStart,switchEnd).replace('export ',''),context);
 return {context,requests,landings,messages,endSession(){token=null;version++;}};
}
test('ordinary Live users cannot enter Dev through the switch handler',async()=>{
 const f=switchFixture({operator:false});await f.context.switchLane('dev');assert.equal(f.requests.length,0);assert.equal(f.landings.length,0);
});
test('a fresh server refusal cannot fall through into a Dev login',async()=>{
 const f=switchFixture({response:{ok:false,status:403,json:async()=>({error:'Developer access is required.'})}});await f.context.switchLane('dev');assert.equal(f.landings.length,0);assert.match(f.messages[0].message,/Developer access/);
});
test('authorized Dev entry still hands off, while a non-operator Dev account can return to Live',async()=>{
 const f=switchFixture();await f.context.switchLane('dev');assert.equal(f.landings[0][0],'dev');assert.equal(f.landings[0][1].handoff,'fixture-handoff');
 const g=switchFixture({operator:false,lane:'dev',response:{ok:false,status:409,json:async()=>({})}});await g.context.switchLane('live');assert.equal(g.landings[0][0],'live');
});
test('a delayed exchange cannot switch the page after logout or a changed session',async()=>{
 let release;const f=switchFixture({response:()=>new Promise(resolve=>release=resolve)}),pending=f.context.switchLane('dev');await new Promise(setImmediate);f.endSession();release({ok:true,status:200,json:async()=>({token:'stale'})});await pending;assert.equal(f.landings.length,0);
});
