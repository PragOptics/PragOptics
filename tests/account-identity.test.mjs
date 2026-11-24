import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/account/account.js',import.meta.url),'utf8');
const start=source.indexOf('export function onAccountEnter()');
const end=source.indexOf('\n}',start)+2;
const enter=source.slice(start,end).replace('export ','');
function fixture(){
  let user={id:'reviewer',email:'reviewer@example.test',admin:false,roster:false};
  const paints=[];let mounts=0,time=1000;
  const context={
    $body:{innerHTML:''},mounted:false,mountedAsAdmin:false,mountedAsRoster:false,mountedUserId:'',
    activeSection:'environment',cache:{users:null},knownPrimary:'',savedName:null,notifyPrefs:null,subData:null,sessionKillFired:false,
    teamRole:{},roleReadError:'',lastEnter:{id:'',at:0},ENTER_WINDOW_MS:1500,
    syncUserTheme(){},hasLiveSession:()=>true,isAdmin:()=>user.admin,isRoster:()=>user.roster,pingUserId:()=>user.id,
    customerSections:()=>[{id:'environment'}],internalSections:()=>[],allSections:()=>[{id:'environment'}],cachedPing:()=>({user}),
    shellHtml(){mounts++;return `${user.email}|${user.admin}|${user.roster}`;},ensureTeamRole(){},
    showSection:section=>paints.push(section),Date:{now:()=>time}
  };
  vm.createContext(context);vm.runInContext(enter,context);
  return {context,paints,get mounts(){return mounts;},setUser(next){user={...user,...next};},advance(ms){time+=ms;}};
}
test('switching accounts with identical privileges rebuilds identity and clears private account caches',()=>{
  const f=fixture();f.context.onAccountEnter();assert.match(f.context.$body.innerHTML,/reviewer@example.test/);
  Object.assign(f.context,{knownPrimary:'reviewer@example.test',savedName:{firstName:'Previous'},notifyPrefs:{private:true},subData:{private:true},sessionKillFired:true});
  f.context.cache.users=['previous'];
  f.setUser({id:'support',email:'support@example.test'});f.context.onAccountEnter();
  assert.equal(f.mounts,2);assert.equal(f.paints.length,2,'a new identity is not suppressed by the same-section entry window');
  assert.match(f.context.$body.innerHTML,/support@example.test/);assert.doesNotMatch(f.context.$body.innerHTML,/reviewer/);
  assert.equal(f.context.cache.users,null);assert.equal(f.context.knownPrimary,'');assert.equal(f.context.savedName,null);
  assert.equal(f.context.notifyPrefs,null);assert.equal(f.context.subData,null);assert.equal(f.context.sessionKillFired,false);
  assert.equal(f.context.mountedUserId,'support');
});
test('same-account renewal keeps its mounted view and current form state',()=>{
  const f=fixture();f.context.onAccountEnter();f.context.savedName={firstName:'Current'};f.context.knownPrimary='current@example.test';
  f.context.onAccountEnter();assert.equal(f.mounts,1);assert.equal(f.paints.length,1);
  assert.equal(f.context.savedName.firstName,'Current');assert.equal(f.context.knownPrimary,'current@example.test');
});
test('an expired unmounted account cannot retain the previous operator cache after a new sign-in',()=>{
  const f=fixture();f.setUser({admin:true});f.context.onAccountEnter();
  f.context.mounted=false;f.context.$body.innerHTML='';f.context.cache.users=['previous operator data'];
  f.setUser({id:'another-operator',email:'another@example.test'});f.context.onAccountEnter();
  assert.equal(f.mounts,2);assert.equal(f.context.cache.users,null);assert.match(f.context.$body.innerHTML,/another@example.test/);
});
test('same-account privilege changes still rebuild the sidebar',()=>{
  const f=fixture();f.context.onAccountEnter();f.setUser({admin:true,roster:true});f.context.onAccountEnter();
  assert.equal(f.mounts,2);assert.equal(f.context.mountedAsAdmin,true);assert.equal(f.context.mountedAsRoster,true);
});
