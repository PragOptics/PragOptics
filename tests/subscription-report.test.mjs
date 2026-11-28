import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionReportHtml } from '../src/account/subscriptionReport.js';

test('legacy and partial replies cannot render a complete monthly total', () => {
  assert.match(subscriptionReportHtml(), /only prices with lookup keys/);
  const legacy=subscriptionReportHtml(undefined,{'user<plan>':{count:2,runRateCents:1500}});
  assert.match(legacy,/Units<\/th>/); assert.match(legacy,/user&lt;plan&gt;/);
  assert.match(legacy,/USD\s15\.00/u); assert.match(legacy,/billing cadence are unverified/);
  const partial=subscriptionReportHtml({warnings:['subscriptions-incomplete'], rows:[]});
  assert.match(partial, /Partial Stripe read/);
  assert.doesNotMatch(partial, /No active subscriptions/);
  assert.match(subscriptionReportHtml({warnings:[],rows:[]}), /No active subscriptions/);
});

test('currency-specific units, unsafe labels and variable prices render correctly', () => {
  const row=(currency,monthlyMinor,other={})=>({label:'<legacy>',subscriptions:1,pricedItems:1,unpricedItems:0,currency,monthlyMinor,...other});
  const text=subscriptionReportHtml({warnings:[],rows:[row('USD',750),row('JPY',125),row('KWD',1234),row('UGX',500),
    row('JPY',100,{unpricedItems:2}),row('',0,{unpricedItems:1,pricedItems:0})]}).replaceAll('\u00a0',' ');
  for(const amount of ['USD 7.50','JPY 125','KWD 1.234','UGX 5','+ unestimated items','Not estimated','&lt;legacy&gt;']) assert.ok(text.includes(amount),amount);
  assert.doesNotMatch(text, /<legacy>|JPY 1\.25/);
});
