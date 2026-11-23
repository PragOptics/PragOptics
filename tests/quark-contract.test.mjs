import test from 'node:test';
import assert from 'node:assert/strict';
import { setupView, isLaunchRequest, createPlatformGuide, quarkRequestAllowed } from '../src/assistant/quarkPlatform.js';
import { supplierOrderChoices, supplierOrderReview } from '../src/account/supplierOrderReview.js';

test('a supplier request does not start a website launch', () => {
  for (const text of ['Connect my supplier’s Shopify store','Show my Shopify products','Check my supplier orders','Where is my order tracking?','I have a store']) assert.equal(isLaunchRequest(text),false,text);
  for (const text of ['I want to launch a website','Build my online store','Publish my site','Go live']) assert.equal(isLaunchRequest(text),true,text);
});

test('setup shows actual states and does not mark earlier steps done from a later next step', () => {
  const view=setupView({next:{id:'site.domain'},groups:[{id:'main',steps:[{id:'profile.name',state:'open'},{id:'site.domain',state:'next'},{id:'billing.plan',state:'off'},{id:'site.publish',state:'done'},{id:'licensing',state:'waiting'}]}]});
  assert.equal(view.done,1); assert.equal(view.total,4); assert.equal(view.next.id,'site.domain');
  assert.equal(view.steps[0].state,'open'); assert.equal(view.waiting.length,1); assert.equal(view.unavailable.length,1);
  assert.equal(setupView(null),null); assert.equal(setupView({groups:[]}).next,null);
});

function fixture(overrides={}) {
  let scope={userId:'fixture-user',tenant:'fixture-environment',lane:'live'};
  const calls=[];
  const connection={id:'supplier-fixture',provider:'shopify',status:'ACTIVE',detail:{managed:'shopify-supplier'}};
  const request=async(url,options={})=>{calls.push({url,options});if(url.includes('/connections?'))return {connections:[connection]};return options.method ? {ok:true,written:1,removed:0,total:1,order:{supplierOrderId:'gid://shopify/Order/1003'}} : {ok:true,rows:[]};};
  const guide=createPlatformGuide({apiBase:'https://api.fixture.test/api/v1',context:()=>scope,request:overrides.request||request});
  return {guide,calls,connection,setScope:x=>{scope={...scope,...x};}};
}

test('all reads carry the selected environment and sandbox without reading credentials', async()=>{
  const f=fixture(); f.setScope({lane:'sandbox'});
  for(const resource of ['connections','catalog','orders'])await f.guide.read(resource);
  for(const call of f.calls){const u=new URL(call.url);assert.equal(u.searchParams.get('tenant'),'fixture-environment');assert.equal(u.searchParams.get('lane'),'sandbox');assert.equal(call.options.method,undefined);assert.doesNotMatch(u.pathname,/secret|vault|checkout|order-create/);}
  await assert.rejects(f.guide.read('setup'),{code:'LIVE_SETUP_ONLY'});
  await assert.rejects(f.guide.read('secrets'),{code:'UNKNOWN_ACTION'});
});

test('a state reply cannot cross into another account, environment or lane',async()=>{
  let release; const f=fixture({request:()=>new Promise(r=>{release=r;})});
  const pending=f.guide.read('catalog'); f.setScope({tenant:'other-environment'}); release({rows:[{value:{title:'private fixture'}}]});
  await assert.rejects(pending,{code:'SCOPE_CHANGED'});
});

test('sync requires a fresh matching approved supplier and uses the same scoped backend endpoint',async()=>{
  const f=fixture(); await f.guide.supplierAction('sync','supplier-fixture');
  assert.equal(f.calls.length,2); const last=f.calls[1];
  assert.equal(new URL(last.url).pathname,'/api/v1/environment/connections/shopify/sync');
  assert.deepEqual(JSON.parse(last.options.body),{id:'supplier-fixture',tenant:'fixture-environment'});
  f.connection.status='PENDING';await assert.rejects(f.guide.supplierAction('sync','supplier-fixture'),{code:'NOT_CONNECTED'});
  await assert.rejects(f.guide.supplierAction('sync','other-supplier'),{code:'CONNECTION_CHANGED'});
});

test('Quark cannot submit supplier orders, make payments, send mail or approve provider access',async()=>{
  const f=fixture();
  for(const action of ['order','checkout','pay','email','approve','remove'])await assert.rejects(f.guide.supplierAction(action,'supplier-fixture'),{code:'HUMAN_REVIEW_REQUIRED'});
  assert.equal(f.calls.length,0);
});

test('tracking checks require an explicit Shopify order reference',async()=>{
  const f=fixture();await assert.rejects(f.guide.supplierAction('tracking','supplier-fixture','#1003'),{code:'ORDER_REQUIRED'});
  await f.guide.supplierAction('tracking','supplier-fixture','gid://shopify/Order/1003');
  const last=f.calls.at(-1);assert.match(last.url,/shopify\/order-status/);assert.equal(JSON.parse(last.options.body).supplierOrderId,'gid://shopify/Order/1003');
});

test('double-clicking sync cannot start two provider mutations',async()=>{
  let release; const calls=[];
  const f=fixture({request:async(url,options={})=>{calls.push({url,options});if(!options.method)return {connections:[{id:'supplier-fixture',provider:'shopify',status:'ACTIVE',detail:{managed:'shopify-supplier'}}]};return new Promise(r=>{release=r;});}});
  const first=f.guide.supplierAction('sync','supplier-fixture');
  await assert.rejects(f.guide.supplierAction('sync','supplier-fixture'),{code:'ACTION_PENDING'});
  await new Promise(r=>setImmediate(r));release({ok:true,written:1,removed:0,total:1});await first;
  assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});

test('the transport allowlist excludes credentials, checkout, orders, approvals and external hosts',()=>{
  const base='https://api.fixture.test/api/v1';
  for(const path of ['assistant/knowledge','environment/setup','environment/connections','environment/data/supplier_products','environment/data/supplier_orders']) assert.equal(quarkRequestAllowed(base,base+'/'+path,'GET'),true,path);
  for(const path of ['refresh','sync','order-status'])assert.equal(quarkRequestAllowed(base,base+'/environment/connections/shopify/'+path,'POST'),true,path);
  for(const path of ['environment/connections/shopify/order','orders/checkout','environment/variables','environment/keys','admin/users','environment/approvals'])for(const method of ['GET','POST','DELETE'])assert.equal(quarkRequestAllowed(base,base+'/'+path,method),false,path+' '+method);
  assert.equal(quarkRequestAllowed(base,'https://other.fixture.test/api/v1/environment/setup'),false);
  assert.equal(quarkRequestAllowed(base,base+'/../secrets'),false);
});

test('supplier projections drop internal proofs and connection secret references',async()=>{
  const f=fixture({request:async url=>url.includes('/connections?') ? {connections:[{id:'supplier-fixture',provider:'shopify',status:'ACTIVE',secretName:'fixture-secret-reference',detail:{managed:'shopify-supplier',shop:'fixture.myshopify.com',refreshToken:'fixture-token'}}]} : {rows:[{key:'row',value:{supplier:'supplier-fixture',name:'#1003',supplierOrderId:'gid://shopify/Order/1003',status:'FULFILLED',orderProof:'fixture-proof',accessToken:'fixture-token',tracking:[{number:'FIXTURE',secret:'fixture-hidden'}]}}]}});
  const connections=JSON.stringify(await f.guide.read('connections')), orders=JSON.stringify(await f.guide.read('orders'));
  assert.doesNotMatch(connections,/fixture-secret-reference|fixture-token|secretName|refreshToken/);
  assert.doesNotMatch(orders,/fixture-proof|fixture-token|fixture-hidden|orderProof|accessToken/);
  assert.match(orders,/FULFILLED/);assert.match(orders,/FIXTURE/);
});

test('malformed reads and supplier responses cannot be reported complete',async()=>{
  const f=fixture({request:async(url,options={})=>options.method ? {} : {connections:[{id:'supplier-fixture',provider:'shopify',status:'ACTIVE',detail:{managed:'shopify-supplier'}}]}});
  await assert.rejects(f.guide.read('catalog'),{code:'UNCONFIRMED_RESULT'});
  for(const action of ['sync','check','tracking'])await assert.rejects(f.guide.supplierAction(action,'supplier-fixture','gid://shopify/Order/1003'),{code:'UNCONFIRMED_RESULT'});
});
test('mutation replies also exclude internal proofs and credentials',async()=>{
  const f=fixture({request:async(url,options={})=>!options.method ? {connections:[{id:'supplier-fixture',provider:'shopify',status:'ACTIVE',detail:{managed:'shopify-supplier'}}]} : {ok:true,order:{supplierOrderId:'gid://shopify/Order/1003',status:'FULFILLED',orderProof:'never-reveal-proof',accessToken:'never-reveal-token'}}});
  const reply=JSON.stringify(await f.guide.supplierAction('tracking','supplier-fixture','gid://shopify/Order/1003'));
  assert.doesNotMatch(reply,/never-reveal|orderProof|accessToken/);assert.match(reply,/FULFILLED/);
});

const supplier='fixture-supplier';
const rows=[{value:{supplier,title:'OmniSource fixture',currency:'USD',variants:[{id:'gid://shopify/ProductVariant/10',sku:'fixture-omnisource',price:'25.00'}]}},{value:{supplier:'another',title:'Wrong supplier',currency:'USD',variants:[{id:'gid://shopify/ProductVariant/11',price:'0.00'}]}}];
test('order choices include only the selected supplier and valid priced variants',()=>{
  const choices=supplierOrderChoices(rows,supplier);assert.equal(choices.length,1);assert.equal(choices[0].sku,'fixture-omnisource');
  assert.equal(supplierOrderChoices([{value:{supplier,variants:[{id:'bad',price:'1.00'}]}}],supplier,'USD').length,0);
});
test('review requires an explicit variant and quantity, and preserves a zero-price fixture',()=>{
  const choices=supplierOrderChoices(rows,supplier);
  assert.throws(()=>supplierOrderReview(choices,'',1),/Choose a product/);
  for(const qty of [0,-1,1.5,10001,'no'])assert.throws(()=>supplierOrderReview(choices,choices[0].variantId,qty),/whole quantity/);
  const reviewed=supplierOrderReview(choices,choices[0].variantId,2);
  assert.equal(reviewed.summary.totalCents,5000);assert.deepEqual(reviewed.lines,[{variantId:'gid://shopify/ProductVariant/10',qty:2}]);assert.equal(reviewed.shipTo,null);
  const free=supplierOrderChoices([{value:{supplier,currency:'USD',variants:[{id:'gid://shopify/ProductVariant/12',price:'0.00'}]}}],supplier);
  assert.equal(supplierOrderReview(free,free[0].variantId,1).summary.totalCents,0);
});
test('shipping must be reviewed explicitly and incomplete addresses fail before submission',()=>{
  const choices=supplierOrderChoices(rows,supplier);
  assert.throws(()=>supplierOrderReview(choices,choices[0].variantId,1,{street1:'fixture'}),/recipient/);
  const draft=supplierOrderReview(choices,choices[0].variantId,1,{name:'Fixture recipient',street1:'123 Fixture Street',city:'Fixture city',zip:'12345',country:'us'});
  assert.equal(draft.shipTo.country,'US');assert.equal(draft.shipTo.name,'Fixture recipient');
});
