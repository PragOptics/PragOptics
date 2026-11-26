import test from 'node:test';import assert from 'node:assert/strict';
import {aiMoney,adminAiDeskHtml} from '../src/account/adminAiDesk.js';
const helpers={statCard:(value,label,hint)=>`<article>${value}|${label}|${hint}</article>`,tierPill:tier=>tier,platformLane:'dev'};
const data={ok:true,platform:'dev',scope:'customer-ai-passthrough',month:'2026-11',provider:{configured:true,name:'fixture',defaultLane:'fast'},cap:{capCents:0,totalCalls:27,totalCents:1.1161},usage:{platformCalls:27,ownCalls:24,ownComplete:true},money:{revenueCents:2.1658,costCents:1.1161,marginCents:1.0497,markupPercent:100,grossMarginPercent:48.47,outstandingCents:997.8342,outstandingOwners:2,outstandingComplete:true},pricing:{markupPercent:100,example:{inputTokens:2000,outputTokens:500},lanes:[{lane:'fast',model:'fixture',inputUsdPerMillion:0.05,outputUsdPerMillion:0.4,estimatedCostCents:0.03,estimatedChargeCents:0.06}]},rows:[]};
test('the operator desk names the platform lane, separates charges and estimates, and distinguishes markup from the result',()=>{
  const html=adminAiDeskHtml(data,helpers);assert.match(html,/Dev platform/);assert.match(html,/27\|Platform-funded answers/);assert.match(html,/24\|Connected-account answers/);
  assert.match(html,/48\.47% of usage charges/);assert.match(html,/markup on provider cost: 100%/);assert.match(html,/Example provider cost/);assert.match(html,/Example customer charge/);
  assert.doesNotMatch(html,/paid to the provider|every AI call.*503|100% on cost/);
});
test('small amounts keep their micro-dollar precision and unavailable reads never become zero',()=>{
  assert.equal(aiMoney(1.1161),'$0.011161');assert.equal(aiMoney(0.0323),'$0.000323');assert.equal(aiMoney(997.8342),'$9.978342');assert.equal(aiMoney(0),'$0.00');assert.equal(aiMoney(null),'Unavailable');
  const html=adminAiDeskHtml({...data,money:{...data.money,outstandingCents:null,outstandingComplete:false},cap:{...data.cap,totalsAvailable:false}},helpers);
  assert.match(html,/Credit totals are incomplete/);assert.match(html,/rollup is missing/);assert.match(html,/Unavailable\|Customer credit held/);
});
test('older backend responses remain readable and a partial account list is not described as complete',()=>{
  const html=adminAiDeskHtml({month:'2026-11',provider:{configured:true,lanes:[{lane:'fast',model:'<script>bad</script>',exchangeCents:0.03}]},money:{marginPercent:100},rows:[],truncated:true},helpers);
  assert.match(html,/backend reporting update/);assert.match(html,/account list is incomplete/);assert.doesNotMatch(html,/<script>/);
});
