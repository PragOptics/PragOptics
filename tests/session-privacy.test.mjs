import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionGate} from '../src/account/sessionGate.js';
import {sessionVersion,sessionChanged,assertSessionVersion,registerPrivateModal,closePrivateModals} from '../src/account/sessionPrivacy.js';
function fixture(refresh=async()=>({refreshed:true})){
 let time=0,state={present:true,expiresAt:5000,version:1},next=0;const timers=new Map(),events=[];
 const gate=createSessionGate({session:()=>({...state,valid:state.present&&time<state.expiresAt}),refresh,pause:()=>events.push('covered'),release:()=>events.push('released'),signIn:()=>events.push('sign-in'),retry:()=>events.push('retry'),now:()=>time,idleMs:1000,setTimer:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id)});
 return{gate,events,state,timers,advance(ms){time+=ms;for(const[id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
test('idle pause covers private work without calling refresh or replaying an action',()=>{let requests=0;const f=fixture(async()=>{requests++;return{refreshed:true};});f.gate.check();f.advance(1001);assert.deepEqual(f.events,['covered']);assert.equal(requests,0);assert.equal(f.gate.activity(),false);});
test('only a server-confirmed valid renewal releases the private view',async()=>{let requests=0;const f=fixture(async()=>{requests++;return{refreshed:true};});f.gate.lock();await f.gate.resume();assert.deepEqual(f.events,['covered','released']);assert.equal(requests,1);});
test('failed refreshes never fall back to a locally valid token',async()=>{for(const result of [undefined,{refreshed:false,reason:'network'},{refreshed:false,reason:'busy-or-unsupported'},{refreshed:false,reason:'http-503'}]){const f=fixture(async()=>result);f.gate.lock();await f.gate.resume();assert.deepEqual(f.events,['covered','retry']);assert.equal(f.gate.activity(),false);}});
test('a thrown network error leaves the work covered and retryable',async()=>{const f=fixture(async()=>{throw new Error('offline');});f.gate.lock();await f.gate.resume();assert.deepEqual(f.events,['covered','retry']);});
test('auth rejection cannot uncover work even while the local token looks valid',async()=>{for(const reason of ['http-401','http-403']){const f=fixture(async()=>({refreshed:false,reason}));f.gate.lock();await f.gate.resume();assert.deepEqual(f.events,['covered','sign-in']);}});
test('expiry protects the view without waiting for a click or idle deadline',()=>{const f=fixture();f.state.expiresAt=200;f.gate.check();f.advance(201);assert.deepEqual(f.events,['covered','sign-in']);});
test('concurrent presence clicks issue one renewal request',async()=>{let resolve,requests=0;const f=fixture(()=>{requests++;return new Promise(r=>resolve=r);});f.gate.lock();const first=f.gate.resume();await f.gate.resume();assert.equal(requests,1);resolve({refreshed:true});await first;assert.deepEqual(f.events,['covered','released']);});
test('an old refresh cannot uncover a newly authenticated session',async()=>{let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.gate.lock();const first=f.gate.resume();f.state.version++;resolve({refreshed:true});await first;assert.deepEqual(f.events,['covered']);});
test('background renewal cannot dismiss an idle lock',async()=>{const f=fixture(async()=>({refreshed:false,reason:'busy-or-unsupported'}));f.gate.lock();f.state.expiresAt=10000;f.gate.changed();await f.gate.resume();assert.deepEqual(f.events,['covered','retry']);});
test('session boundaries discard old responses, while renewal preserves current work',()=>{globalThis.window=new EventTarget();const version=sessionVersion();sessionChanged({renewal:true});assert.doesNotThrow(()=>assertSessionVersion(version));sessionChanged();assert.throws(()=>assertSessionVersion(version),{code:'SESSION_CHANGED',sessionInvalidated:true});});
test('ending a session closes private modal handlers once and removes unmanaged private content',()=>{let disposed=0,cleared=0;globalThis.document={querySelectorAll:()=>[{hidden:false,replaceChildren(){cleared++;}}]};let unregister;unregister=registerPrivateModal('private-confirmation',()=>{disposed++;unregister();});closePrivateModals();closePrivateModals();assert.equal(disposed,1);assert.equal(cleared,2);});

test('a raw response body cannot be consumed after its originating session ends',async()=>{
 const {sessionBoundResponse}=await import('../src/account/sessionPrivacy.js');globalThis.window=new EventTarget();
 const expected=sessionVersion(),response=sessionBoundResponse(new Response('private fixture'),expected);
 const clone=response.clone(),readText=response.text,readBlob=clone.blob;sessionChanged();await assert.rejects(readText(),{code:'SESSION_CHANGED'});await assert.rejects(readBlob(),{code:'SESSION_CHANGED'});
});
test('ordinary renewal keeps an authenticated raw response usable',async()=>{
 const {sessionBoundResponse}=await import('../src/account/sessionPrivacy.js');globalThis.window=new EventTarget();
 const expected=sessionVersion(),response=sessionBoundResponse(new Response('current fixture'),expected);sessionChanged({renewal:true});assert.equal(await response.text(),'current fixture');
});
