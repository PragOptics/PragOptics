import test from 'node:test';
import assert from 'node:assert/strict';
import {microsoftWriteAccess} from '../src/account/microsoftWriteAccess.js';
test('reading is preserved as the default; an active read grant can opt into publishing',()=>{
 const state=microsoftWriteAccess({status:'ACTIVE',detail:{writeAccessSupported:true}});
 assert.equal(state.canUpgrade,true); assert.equal(state.enabled,false);assert.match(state.words,/Connected for reading/);
});
test('older backend cannot expose a write-upgrade action it does not support',()=>{
 const state=microsoftWriteAccess({status:'ACTIVE',detail:{}});
 assert.equal(state.canUpgrade,false);assert.equal(state.supported,false);assert.match(state.words,/Check this connection/);
});
test('in-progress publishing consent cannot start another upgrade and explains the retained grant',()=>{
 const state=microsoftWriteAccess({status:'ACTIVE',detail:{writeAccessPending:true}});
 assert.equal(state.canUpgrade,false);assert.equal(state.pending,true);assert.match(state.words,/retained/);
});
test('list creation and item writing are separate permissions',()=>{
 assert.equal(microsoftWriteAccess({status:'ACTIVE',detail:{canWriteItems:true}}).enabled,false);
 assert.equal(microsoftWriteAccess({status:'ACTIVE',detail:{canWriteItems:true,canCreateLists:true}}).enabled,true);
 assert.equal(microsoftWriteAccess({status:'PENDING'}).canUpgrade,false);
});
test('organization approval has its own action and cancellation preserves the existing read grant',()=>{
 const state=microsoftWriteAccess({status:'ACTIVE',detail:{writeAccessNeedsApproval:true,writeAccessError:'Administrator consent is required.'}});
 assert.equal(state.needsApproval,true);assert.equal(state.canUpgrade,false);assert.match(state.words,/Administrator consent/);
});
