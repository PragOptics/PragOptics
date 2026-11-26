import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/runtime/studioHandoff.js',import.meta.url),'utf8');
const {studioHandoffLane,sessionRoutingLane,parseStudioHandoff,redeemStudioSession,SESSION_LANE_KEY}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('lane and destination are parsed together in either parameter order, including the selected environment',()=>{
 const code='a'.repeat(43),to='account?section=environment&team=team-a';
 for(const hash of [`#handoff=${code}&lane=dev&to=${encodeURIComponent(to)}`,`#handoff=${code}&to=${encodeURIComponent(to)}&lane=dev`])assert.deepEqual(parseStudioHandoff(hash),{code,to,lane:'dev'});
 assert.equal(parseStudioHandoff('#handoff=bad&lane=dev'),null);assert.equal(parseStudioHandoff(`#handoff=${code}&to=${encodeURIComponent('https://elsewhere.test')}`).to,'account');
});
test('incoming lane survives reload only in the receiving tab',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  assert.equal(studioHandoffLane('#handoff='+'a'.repeat(43)+'&lane=dev&to=account',storage),'dev');assert.equal(studioHandoffLane('#account',storage),'dev');assert.equal(data.get(SESSION_LANE_KEY),'dev');assert.equal(studioHandoffLane('#handoff=bad&lane=live',storage),'dev');assert.equal(studioHandoffLane('#handoff='+'a'.repeat(43)+'&lane=other',null),null);
});
test('redeem and account verification both use the selected API before accepting a session',async()=>{
  const calls=[],fetcher=async(url,opts)=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>url.endsWith('/ping')?{user:{userId:'synthetic-user'}}:{tokens:{access_token:'synthetic-token'}}};};
  const out=await redeemStudioSession({apiBase:'https://dev.example.test/api/v1',code:'synthetic-code',fetcher});assert.equal(out.ping.user.userId,'synthetic-user');assert.equal(calls.length,2);assert.equal(calls[1].url,'https://dev.example.test/api/v1/ping');assert.equal(calls[1].opts.headers.Authorization,'Bearer synthetic-token');
});
test('rejected redemption never attempts account verification',async()=>{
  let count=0;await assert.rejects(redeemStudioSession({apiBase:'https://example.test',code:'synthetic',fetcher:async()=>{count++;return {ok:false,status:401,json:async()=>({})};}}),{code:'HANDOFF_REDEEM_401'});assert.equal(count,1);
});
test('failed account verification cannot return a usable session',async()=>{
  let count=0;await assert.rejects(redeemStudioSession({apiBase:'https://example.test',code:'synthetic',fetcher:async()=>++count===1?{ok:true,status:200,json:async()=>({tokens:{access_token:'synthetic'}})}:{ok:false,status:403}}),{code:'HANDOFF_PING_403'});
});

test('fresh tabs ignore another tabs legacy dev choice while existing accounts migrate from their verified lane',()=>{
  const storage=(data={})=>({getItem:k=>data[k]??null,setItem:(k,v)=>{data[k]=v;},removeItem:k=>{delete data[k];}});
  const legacy=storage({pragoptics_lane_override:'dev'}),fresh=storage();
  assert.equal(sessionRoutingLane({session:fresh,legacy}),null);
  const live=storage({pragoptics_tokens:JSON.stringify({access_token:'synthetic'}),pragoptics_ping:JSON.stringify({deployment:{lane:'green'}})});
  assert.equal(sessionRoutingLane({session:live,legacy}),'live');assert.equal(live.getItem(SESSION_LANE_KEY),'live');
  const dev=storage({pragoptics_tokens:JSON.stringify({access_token:'synthetic'}),pragoptics_ping:JSON.stringify({deployment:{lane:'dev'}})});
  assert.equal(sessionRoutingLane({session:dev,legacy}),'dev');
  legacy.removeItem('pragoptics_lane_override');assert.equal(sessionRoutingLane({session:live,legacy}),'live');assert.equal(sessionRoutingLane({session:dev,legacy}),'dev');
});
