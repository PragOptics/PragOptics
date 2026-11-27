import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const account=readFileSync(new URL('../src/account/account.js',import.meta.url),'utf8');
const environment=readFileSync(new URL('../src/account/environment.js',import.meta.url),'utf8');
function nativeFunction(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
function fixture(destination){
 const notes=new Map([['pragoptics_open_card',JSON.stringify(destination)]]),reviews=[],opens=[],timers=[];
 const main={innerHTML:''},noop=()=>{},role=()=> 'owner';
 const context={sessionStorage:{getItem:k=>notes.get(k)||null,removeItem:k=>notes.delete(k)},
  agentMode:()=>false,cachedPing:()=>({}),isAdmin:()=>false,INTERNAL_SECTIONS:[],isRoster:()=>false,liveAgentsHidden:()=>false,
  TEAM_ON:true,TEAM_IDS:new Set(),licensingBlocked:()=>false,roleInView:role,ensureTeamRole:noop,
  activeSection:'home',location:{hash:'#account?section=home'},history:{replaceState:noop},
  document:{querySelectorAll:()=>[],getElementById:id=>id==='acctMain'?main:null},
  paintEnvLine:noop,SETUP_SECTIONS:new Set(),teamDeps:()=>({}),stopLiveAgentsTimers:noop,
  hasLiveSession:()=>true,CARD_IDS:{environment:{connections:'evConnections',data:'evData'}},CARD_TRIES:24,ROW_TRIES:56,
  setTimeout:(fn,ms)=>timers.push({fn,ms}),CSS:{escape:s=>s},openCardOf:noop,
  laneChoice:()=> 'live',D:null,ev:{lane:'live',teamId:'fixture-team'},freshReg:()=>({}),newSupplierSearch:()=>({}),
  resetMail:noop,setMailContext:noop,mailContext:()=>({}),resetVariables:noop,setVariablesContext:noop,
  resetImport:noop,setImportContext:noop,resetDocuments:noop,setDocumentsContext:noop,documentProfiles:()=>[],
  url:noop,body:noop,myRole:role,initCards:noop,closeShipmentTracking:noop,setOpen:(key,value)=>opens.push({key,value}),
  explainLink:()=>"",checkShopifySupplierMode:noop,load:async()=>{},canManageConnections:()=>true,
  confirmTestSupplierOrder:button=>reviews.push(button.dataset.id)};
 vm.createContext(context);
 vm.runInContext(nativeFunction(account,'showSection')+'\n'+nativeFunction(account,'paintSection')+'\n'+nativeFunction(account,'consumeOpenCard')+'\nasync '+nativeFunction(environment,'renderEnvironment'),context);
 return {context,notes,reviews,opens,timers};
}

test('Quark supplier review survives actual account routing until the native environment reads it',async()=>{
 const f=fixture({section:'environment',card:'connections',shopify:'review',row:'fixture-supplier'});
 f.context.showSection('environment');await new Promise(setImmediate);
 assert.deepEqual(f.reviews,['fixture-supplier']);assert.equal(f.notes.size,0);
 assert.ok(f.opens.some(v=>v.key==='environment:connections'&&v.value));
 f.context.showSection('environment');await new Promise(setImmediate);assert.equal(f.reviews.length,1,'the one-use navigation must not replay a review');
});

test('ordinary supplier card navigation never starts an order review',async()=>{
 const f=fixture({section:'environment',card:'connections',row:'fixture-supplier'});
 f.context.showSection('environment');await new Promise(setImmediate);assert.equal(f.reviews.length,0);assert.equal(f.notes.size,0);
});

test('Quark supplier discovery preserves its native search intent without starting an order',async()=>{
 const f=fixture({section:'environment',card:'connections',shopify:'discovery',query:'industrial parts'});
 f.context.showSection('environment');await new Promise(setImmediate);assert.equal(f.context.ev.shopifyStep,'discovery');
 assert.equal(f.context.ev.supplierSearch.query,'industrial parts');assert.equal(f.reviews.length,0);
});
