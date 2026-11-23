import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierOrderChoices, supplierOrderReview } from '../src/account/supplierOrderReview.js';

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

test('supplier order review accepts the native items response and rejects refused catalogs',()=>{
 const items=[{key:'native-product',value:{supplier:'native-supplier',title:'OmniSource',currency:'USD',variants:[{id:'gid://shopify/ProductVariant/10',sku:'omnisource',price:'25.00'}]}}];
 const choices=supplierOrderChoices({ok:true,table:'supplier_products',items,nextAfter:null},'native-supplier');
 assert.equal(choices.length,1);assert.equal(choices[0].productTitle,'OmniSource');assert.equal(supplierOrderReview(choices,choices[0].variantId,2).summary.totalCents,5000);
 assert.deepEqual(supplierOrderChoices({ok:false,items},'native-supplier'),[]);assert.deepEqual(supplierOrderChoices({items},'other-supplier'),[]);
});
