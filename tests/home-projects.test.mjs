import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/account/home.js',import.meta.url),'utf8');
function fn(name){const a=source.indexOf(`function ${name}(`);return source.slice(a,source.indexOf('\n}',a)+2);}
function fixture({projects=[],complete=true,sites=[]}={}){
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context={hm:{projects,projectsComplete:complete,sites,domains:[],errs:{},openWs:new Set(['__parts__'])},D:{escapeHtml:e},ico:()=>'',leadBtn:()=>'',errLine:()=>'',when:String,count:(n,a,b)=>`${n} ${n===1?a:b}`,kindWord:String,card:o=>o};
 vm.createContext(context);vm.runInContext(fn('projectsCard')+'\n'+fn('cleanupSection'),context);return context;
}
test('same-name projects remain separately visible and are never called older copies',()=>{
 const f=fixture({projects:[{id:'first-123456',name:'Store',kind:'website'},{id:'second-12345',name:'Store',kind:'website'},{id:'ops-12345678',name:'Operations',kind:'webapp'}]});
 const card=f.projectsCard();assert.match(card.body,/first-12/);assert.match(card.body,/second-1/);assert.doesNotMatch(card.body,/older cop/i);
 assert.match(card.body,/Other projects/);assert.match(card.body,/ops-12345678/);assert.match(card.summary,/1 other project/);
 assert.equal((card.body.match(/website project/g)||[]).length,2);
});
test('a failed or partial project list never offers public-site removal',()=>{
 for(const projects of [null,[]]){const f=fixture({projects,complete:false,sites:[{slug:'real-business',project:'not-in-index'}]});const html=f.cleanupSection();assert.match(html,/could not be fully verified/);assert.doesNotMatch(html,/data-home-action|leftover/);}
});
test('an unread project list never tells the owner that they have no projects',()=>{
 const f=fixture({projects:null,complete:false});f.hm.errs.projects='Read failed';assert.doesNotMatch(f.projectsCard().body,/No projects yet/);
});
test('an independently published site is a neutral review item with its address and explicit removal guard',()=>{
 const f=fixture({sites:[{slug:'independent',address:'https://business.example.test'}]});const html=f.cleanupSection();
 assert.match(html,/published independently/);assert.match(html,/can be valid/);assert.match(html,/Open site/);assert.doesNotMatch(html,/leftover|remove-site/);
 f.hm.removeArm='independent';assert.match(f.cleanupSection(),/Remove for good/);
});
test('Home discards reads after an account or environment work area changes',async()=>{
 for(const change of ['session','area']){
  let version=1,selection={team:'environment-a',workLane:'sandbox'},paints=0;const pending=[];
  const context={loadGeneration:0,hm:{errs:{},projects:['original']},sessionVersion:()=>version,accountSelection:()=>selection,sessionStorage:{},
   D:{apiFetch:()=>new Promise(resolve=>pending.push(resolve))},tq:p=>p,paint:()=>paints++};
  vm.createContext(context);vm.runInContext('async '+fn('load'),context);
  const read=context.load();if(change==='session')version++;else selection={team:'environment-a',workLane:'live'};
  pending.forEach(resolve=>resolve({projects:[{id:'late'}]}));await read;
  assert.equal(paints,0);assert.deepEqual(context.hm.projects,['original']);
 }
});
test('Home reads work-area resources from the selected environment while domains remain environment-wide',()=>{
 const context={PRAG_API_BASE:'https://api.example.test/v1',teamId:()=> 'environment-a',accountSelection:()=>({workLane:'sandbox'}),sessionStorage:{},URLSearchParams};
 vm.createContext(context);vm.runInContext(fn('tq'),context);
 for(const path of ['/environment/projects','/environment/files?limit=200','/environment/connections','/environment/publish']){
  const url=new URL(context.tq(path));assert.equal(url.searchParams.get('tenant'),'environment-a');assert.equal(url.searchParams.get('lane'),'sandbox');
 }
 assert.equal(new URL(context.tq('/environment/domains')).searchParams.has('lane'),false);
});
