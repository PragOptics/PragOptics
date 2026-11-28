import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { shippoCanBuy } from '../src/account/shippoConnection.js';
const source=(await readFile(new URL('../src/account/environment.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
function makeDoor(name,until){
 const body=source.slice(source.indexOf(`async function ${name}(`),source.indexOf(until,source.indexOf(`async function ${name}(`)));
 let version=1;const resolvers=[],ev={teamId:'original',lane:'live'},navigation=[],requests=[],stored=[];
 const deps={ev,sessionVersion:()=>version,D:{showError(){}},paintConnections(){},post:async(url,body)=>{requests.push({url,body});return new Promise(resolve=>{resolvers.push(resolve);});},ENV_URL:'/api/environment',sessionStorage:{setItem:(...x)=>stored.push(x)},window:{location:{assign:url=>navigation.push(url)}},errText:()=>'',loadConnections:async()=>{}};
 deps.canManageConnections=()=>true;
 deps.shippoSwitchSource=()=>null;
 deps.shippoSwitchScope=()=>JSON.stringify([version,ev.teamId,ev.lane,ev.connectionGeneration||0]);
 const {action,invalidate}=Function(...Object.keys(deps),body+`;return {action:${name},invalidate:()=>{ev.connectionGeneration=(ev.connectionGeneration||0)+1}};`)(...Object.values(deps));
 const intendedEmail='chosen@example.test';
 const begin=(...args)=>{
   if(name!=='startShippoConnect')return action(...args);
   const scope=deps.shippoSwitchScope();ev.shippoIntent={scope,email:intendedEmail,kind:'existing'};
   return action({isConnected:true,closest:()=>({dataset:{shippoSwitch:scope},querySelector:()=>({reportValidity:()=>true})})});
 };
 return {ev,action:begin,invalidate,navigation,requests,stored,resolve:(i=0,url='https://provider.example/authorize')=>resolvers[i]({url,connection:{id:'row-'+i},intentBound:true,intendedEmail}),endSession:()=>{version++;}};
}
test('Shippo cannot redirect or save return state after the user changes environment',async()=>{
 const w=makeDoor('startShippoConnect','async function refreshShippoConnect');
 const pending=w.action();w.ev.teamId='another';w.resolve();await pending;
 assert.deepEqual(w.navigation,[]);assert.deepEqual(w.stored,[]);
});
test('Microsoft write approval is explicit and a late response cannot redirect a new session',async()=>{
 const w=makeDoor('startMicrosoftConnect','/**\n * Check status.');
 const pending=w.action('connect',{writeAccess:true});assert.deepEqual(w.requests[0].body,{mode:'connect',writeAccess:true});
 w.endSession();w.resolve();await pending;assert.deepEqual(w.navigation,[]);assert.deepEqual(w.stored,[]);
});
test('ordinary Microsoft connection keeps read-only consent as the default',async()=>{
 const w=makeDoor('startMicrosoftConnect','/**\n * Check status.');
 const pending=w.action();assert.deepEqual(w.requests[0].body,{mode:'connect'});w.resolve();await pending;
 assert.deepEqual(w.navigation,['https://provider.example/authorize']);
});
test('shipping quotes follow the authorization, not only a reused connection id',()=>{
 const start=source.indexOf('function shippingScope()'),end=source.indexOf('\n',start);
 let connection={id:'same-id',detail:{authorizedAt:'first-grant',checkedAt:'first-read'}};
 const ev={teamId:'same-team',lane:'live'};
 const scope=Function('sessionVersion','ev','shippingConnection','shippoCanBuy',source.slice(start,end)+';return shippingScope;')(()=>1,ev,()=>connection,shippoCanBuy);
 const original=scope();connection.detail.checkedAt='later-read';assert.equal(scope(),original);
 connection.detail.authorizedAt='new-grant';assert.notEqual(scope(),original);
});
for(const [name,until] of [['startShippoConnect','async function refreshShippoConnect'],['startMicrosoftConnect','/**\n * Check status.']]){
 test(`${name}: a newer same-context request wins after A to B to A`,async()=>{
  const w=makeDoor(name,until);const old=w.action();w.ev.lane='sandbox';w.ev.connBusy=false;w.ev.lane='live';
  const fresh=w.action();w.resolve(1,'https://provider.example/new');await fresh;w.resolve(0,'https://provider.example/old');await old;
  assert.deepEqual(w.navigation,['https://provider.example/new']);assert.equal(w.stored.length,1);
 });
 test(`${name}: leaving and returning invalidates a response even without a newer request`,async()=>{
  const w=makeDoor(name,until);const old=w.action();w.invalidate();w.ev.lane='sandbox';w.invalidate();w.ev.lane='live';
  w.resolve();await old;assert.deepEqual(w.navigation,[]);assert.deepEqual(w.stored,[]);
 });
}
