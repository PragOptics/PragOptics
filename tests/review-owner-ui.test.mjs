import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/account/account.js',import.meta.url),'utf8');
function fixture(owner=true) {
  const calls=[], errors=[];
  const scope={isOwner:()=>owner,escapeHtml:x=>String(x),fmtDate:x=>x,tierPill:()=>'',statusPill:()=>'',ico:()=>'',iconBtn:()=>'',tierName:x=>x,USER_ROLES:[],customRoles:()=>[],
    showError:(_id,message)=>errors.push(message),runPatch:(_button,patch)=>calls.push(patch),armConfirm:(_button,message,callback)=>{scope.confirm=callback;scope.confirmMessage=message;}};
  const begin=source.indexOf('function userManageHtml('), end=source.indexOf('\n/**',begin);
  const render=vm.runInNewContext(source.slice(begin,end)+'; userManageHtml',scope);
  const actionStart=source.indexOf("  ['[data-um-shopify-review]'"),actionEnd=source.indexOf("  ['[data-um-save]'",actionStart);
  const action=vm.runInNewContext('['+source.slice(actionStart,actionEnd)+'][0][1]',scope);
  const row={userId:'review-user',email:'review@example.test',tier:'free',status:'ACTIVE',environmentId:'review-env'};
  const values={days:'30',reason:'Isolated Shopify review'};
  const um={row,$:id=>({value:id==='#umShopifyDays'?values.days:values.reason})};
  return {render,action,scope,row,um,values,calls,errors};
}
test('only the platform owner sees review grants for a separate eligible Free customer',()=>{
  const f=fixture();assert.match(f.render(f.row,{self:false}),/data-um-shopify-review="grant"/);
  assert.doesNotMatch(f.render(f.row,{self:true}),/data-um-shopify-review/);
  for(const change of [{tier:'user'},{isAdmin:true},{isDev:true},{isAgent:true},{status:'SUSPENDED'},{environmentId:''}])assert.doesNotMatch(f.render({...f.row,...change},{self:false}),/data-um-shopify-review/);
  const other=fixture(false);assert.doesNotMatch(other.render(other.row,{self:false}),/data-um-shopify-review/);
});
test('the grant needs explicit confirmation and sends only its own request to the selected customer environment',()=>{
  const f=fixture();f.action({dataset:{umShopifyReview:'grant'}},f.um);assert.equal(f.calls.length,0);assert.match(f.scope.confirmMessage,/review@example.test/);f.scope.confirm();
  const result=JSON.parse(JSON.stringify(f.calls[0]));assert.equal(result.shopifyReviewAccess.environmentId,'review-env');assert.equal(result.shopifyReviewAccess.lane,'live');
  assert.ok(Date.parse(result.shopifyReviewAccess.expiresAt)>Date.now());assert.deepEqual(Object.keys(result).sort(),['reason','shopifyReviewAccess']);
});
test('revocation is separate and invalid duration or missing reason sends no request',()=>{
  const f=fixture();for(const days of ['0','91','1.5','']){f.values.days=days;f.action({dataset:{umShopifyReview:'grant'}},f.um);assert.equal(f.scope.confirm,undefined);}
  f.values.reason='';f.action({dataset:{umShopifyReview:'revoke'}},f.um);assert.equal(f.scope.confirm,undefined);
  f.values.reason='Review complete';f.action({dataset:{umShopifyReview:'revoke'}},f.um);f.scope.confirm();assert.equal(f.calls[0].shopifyReviewAccess.enabled,false);
  const other=fixture(false);other.action({dataset:{umShopifyReview:'grant'}},other.um);assert.equal(other.scope.confirm,undefined);
});
