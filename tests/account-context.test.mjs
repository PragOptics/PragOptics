import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSelection,captureAccountSelection} from '../src/runtime/accountContext.js';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('account navigation carries independent environment and work-area choices',()=>{
 const s=storage(),params=new URLSearchParams('section=home&team=environment-a&workLane=sandbox');
 assert.equal(captureAccountSelection(params,s),true);
 assert.deepEqual(accountSelection(s),{team:'environment-a',workLane:'sandbox'});
 assert.equal(params.toString(),'section=home');
 captureAccountSelection(new URLSearchParams('team=own&workLane=live'),s);
 assert.deepEqual(accountSelection(s),{team:'own',workLane:'live'});
});
test('invalid routing hints cannot introduce arbitrary authority or storage values',()=>{
 const s=storage();assert.equal(captureAccountSelection(new URLSearchParams('team=../other&workLane=dev'),s),false);
 assert.deepEqual(accountSelection(s),{team:'own',workLane:'live'});
});
