import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {accountSelection} from '../src/runtime/accountContext.js';
const source=readFileSync(new URL('../src/runtime/bootstrap.js',import.meta.url),'utf8');
const start=source.indexOf('async function goToSoftware('),end=source.indexOf('\n    }',start)+6;
function fixture(){
 const values=new Map([['pragoptics_team_id','environment-a'],['pragoptics_env_lane','sandbox']]),targets=[],messages=[];let token='synthetic',response;
 const context={STUDIO_URL:'https://studio.example.test',PRAG_API_BASE:'https://dev.example.test/v1',LANE:'dev',URLSearchParams,AbortSignal,
  sessionStorage:{getItem:k=>values.get(k)},accountSelection,accessToken:()=>token,isSessionActive:()=>true,
  showStatusModal:m=>messages.push(m),location:{assign:u=>targets.push(u)},fetch:async()=>response||{ok:true,status:200,json:async()=>({code:'x'.repeat(43)})}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 return {context,targets,messages,values,setToken:t=>token=t,setResponse:r=>response=r};
}
test('Open Studio transfers the actual environment, work area, platform lane and selected project together',async()=>{
 const f=fixture();await f.context.goToSoftware('https://studio.example.test','project=project-a');assert.equal(f.targets.length,1);
 const p=new URLSearchParams(new URL(f.targets[0]).hash.slice(1));assert.equal(p.get('team'),'environment-a');assert.equal(p.get('workLane'),'sandbox');assert.equal(p.get('lane'),'dev');assert.equal(p.get('project'),'project-a');
});
test('a refused signed-in Studio transfer stays on the account and exposes the exact HTTP failure',async()=>{
 const f=fixture();f.setResponse({ok:false,status:403,json:async()=>({})});await f.context.goToSoftware();assert.equal(f.targets.length,0);assert.match(f.messages.at(-1).message,/HTTP 403/);
});
test('an account or work-area change while minting refuses the stale Studio destination',async()=>{
 for(const change of ['token','area']){
  const f=fixture();let resolve;
  f.context.fetch=async()=>{const response=await new Promise(r=>resolve=r);return response;};
  const pending=f.context.goToSoftware();if(change==='token')f.setToken('new-session');else f.values.set('pragoptics_env_lane','live');
  resolve({ok:true,status:200,json:async()=>({code:'x'.repeat(43)})});await pending;assert.equal(f.targets.length,0);assert.match(f.messages.at(-1).message,/changed/);
 }
});
