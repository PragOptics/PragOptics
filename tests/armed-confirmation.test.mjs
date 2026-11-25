import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const handlers={};
function element(){const attrs=new Map(),classes=new Set();return {dataset:{},innerHTML:'',textContent:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k)??null,removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),querySelector:()=>null,after(node){this.nextElementSibling=node;node.remove=()=>{this.nextElementSibling=null;};},contains:node=>false,remove(){}};}
globalThis.document={createElement:()=>element(),addEventListener:(name,callback)=>handlers[name]=callback};
const source=(await readFile(new URL('../src/account/cards.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
const prelude='const esc=v=>String(v); const closePrivateModal=()=>{}; const registerPrivateModal=()=>()=>{};';
const {armed,disarm}=await import('data:text/javascript;base64,'+Buffer.from(prelude+source).toString('base64'));
function button(){const b=element();b.innerHTML='Withdraw request';b.parentElement=element();return b;}
test('first press requires confirmation; Keep it open is labelled and cancels without confirming',()=>{
 const b=button();assert.equal(armed(b,'End this support request?',{keep:'Keep it open'}),false);const cancel=b.nextElementSibling;assert.equal(cancel.textContent,'Keep it open');assert.equal(cancel.innerHTML,'');assert.equal(cancel.classList.contains('btn-ico'),false);
 handlers.click({target:{closest:()=>cancel},preventDefault(){},stopPropagation(){}});assert.equal(b.dataset.armed,undefined);assert.equal(b.innerHTML,'Withdraw request');assert.equal(armed(b,'End this support request?'),false);disarm();
});
test('only a second press confirms and timeout restores the original action',async()=>{
 const b=button();assert.equal(armed(b,'End this support request?'),false);assert.equal(armed(b,'End this support request?'),true);assert.equal(b.dataset.armed,undefined);
 assert.equal(armed(b,'End this support request?',{ms:10}),false);await new Promise(resolve=>setTimeout(resolve,25));assert.equal(b.dataset.armed,undefined);assert.equal(b.innerHTML,'Withdraw request');assert.equal(armed(b,'End this support request?'),false);disarm();
});
