import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { isManagedPrintful, printfulConnectionWords } from '../src/account/printfulConnection.js';

// Exercise the actual native handlers with a DOM/transport fixture; no account or provider calls.
const source = readFileSync(new URL('../src/account/environment.js', import.meta.url), 'utf8');
function between(first, next) {
  const start = source.indexOf(first), end = source.indexOf(next, start + first.length);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const handlers = between('async function startPrintfulConnect(', 'async function startShippoConnect(') +
  between('function printfulNameStepHtml(', 'function connectionsHtml(');
function fixture(name = 'Bridges Industrial') {
  const h = { token:'synthetic-session', calls:[], redirects:[], errors:[], notes:[], saved:[], inputs:new Map(),
    ev:{teamId:'environment-a',lane:'live',connections:[],connDraft:{},printfulStoreNaming:true,connBusy:false}, manage:true,
    response:async()=>({ok:true,connection:{id:'connection-a'},url:'https://www.printful.com/oauth/authorize?client_id=synthetic-app'}) };
  h.inputs.set('evPrintfulStoreName',{value:name,focus(){h.focused=true;}});
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const context=vm.createContext({ev:h.ev,URL,ENV_URL:'https://fixture.test/api/v1/environment',isManagedPrintful,printfulConnectionWords,
    accessToken:()=>h.token,teamId:()=>h.ev.teamId,canManageConnections:()=>h.manage,
    document:{getElementById:id=>h.inputs.get(id)},D:{showError:(...args)=>h.errors.push(args),escapeHtml},
    paintConnections:()=>{},loadConnections:async()=>{},errText:(error,fallback)=>error.message||fallback,
    rowNote:(...args)=>h.notes.push(args),post:async(url,body)=>{h.calls.push({url,body});return h.response(url,body);},
    sessionStorage:{setItem:(...args)=>h.saved.push(args)},window:{location:{assign:url=>h.redirects.push(url)}}});
  vm.runInContext(handlers,context); h.context=context; return h;
}

test('native onboarding requires a name and sends the chosen name before opening Printful',async()=>{
  const blank=fixture('   '); await blank.context.startPrintfulConnect();
  assert.equal(blank.calls.length,0);assert.equal(blank.redirects.length,0);assert.equal(blank.focused,true);
  const h=fixture('  Bridges Industrial  ');await h.context.startPrintfulConnect();
  assert.equal(h.calls[0].body.storeName,'Bridges Industrial');assert.match(h.calls[0].url,/printful\/start$/);
  assert.equal(h.redirects.length,1);assert.match(h.redirects[0],/^https:\/\/www\.printful\.com\/oauth\/authorize\?/);
  assert.deepEqual(JSON.parse(h.saved[0][1]),{provider:'printful',id:'connection-a'});
});

test('an identity, environment or lane change discards a pending authorization response',async()=>{
  for(const change of [h=>{h.token='different-session';},h=>{h.ev.teamId='environment-b';},h=>{h.ev.lane='sandbox';}]) {
    const h=fixture();let release;h.response=()=>new Promise(resolve=>{release=resolve;});
    const pending=h.context.startPrintfulConnect();change(h);
    release({ok:true,connection:{id:'connection-a'},url:'https://www.printful.com/oauth/authorize?client_id=synthetic-app'});
    await pending;assert.equal(h.redirects.length,0);assert.equal(h.saved.length,0);
  }
});

test('a legacy pending connection asks for a name before resuming authorization',async()=>{
  const h=fixture();h.ev.connections=[{id:'pending-a',provider:'printful',status:'PENDING',detail:{managed:'printful-connect'}}];
  await h.context.startPrintfulConnect('pending-a');
  assert.equal(h.calls.length,0);assert.equal(h.ev.printfulNaming,'pending-a');
});

test('saving an existing store name preserves the connection and checks Printful before reporting the result',async()=>{
  const h=fixture();h.inputs.set('evPrintfulName-existing-a',{value:'Bridges Industrial'});
  h.response=async url=>({ok:true,connection:{id:'existing-a',status:'ACTIVE',detail:{requestedStoreName:'Bridges Industrial',storeName:'PragOptics store',namingRequired:true},message:url.endsWith('/refresh')?'Finish its name in Printful.':''}});
  await h.context.savePrintfulName('existing-a');
  assert.equal(h.calls.length,2);assert.match(h.calls[0].url,/printful\/name$/);assert.match(h.calls[1].url,/printful\/refresh$/);
  assert.equal(h.calls[0].body.id,'existing-a');assert.equal(h.calls[0].body.storeName,'Bridges Industrial');
  assert.match(h.notes[0][1],/Finish its name/);assert.doesNotMatch(h.notes[0][1],/confirmed the store name/);
});

test('the naming step escapes the chosen name and restricts provider-setting controls to managers',()=>{
  const h=fixture(),row={id:'existing-a',provider:'printful',status:'ACTIVE',detail:{managed:'printful-connect',storeId:'10',storeName:'PragOptics store',requestedStoreName:'Bridges <Industrial>'}};
  let html=h.context.printfulNameStepHtml(row);
  assert.match(html,/Bridges &lt;Industrial&gt;/);assert.match(html,/https:\/\/www\.printful\.com\/dashboard\/settings\/10\/store-defaults/);
  assert.match(html,/Check store name/);h.manage=false;html=h.context.printfulNameStepHtml(row);
  assert.doesNotMatch(html,/<a |<button /);assert.match(html,/owner or admin/);
});
