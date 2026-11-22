import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIVE_HELP, newSupplierSearch, shopifyDiscoveryHtml, shopifyIntent, supplierEmail, supplierMatches, supplierSearchPhrase, supplierName, supplierInquiryResponse, supplierInquiryFailure, supplierOrderResult, readShopifySupplierMode, shopifyStartFields, shopifyOnboardingUrl } from '../src/account/shopifySupplier.js';

test('Quark prefills a specific supplier search and leaves generic requests blank', () => {
  assert.equal(supplierSearchPhrase('I want to dropship Cedar Hive Boxes!'), 'Cedar Hive Boxes');
  assert.equal(supplierSearchPhrase('Find a supplier for cedar boxes?'), 'cedar boxes');
  assert.equal(supplierSearchPhrase('Find a supplier'), '');
});

test('supplier name and recipient validation match server limits', () => {
  assert.equal(supplierName('  Cedar Hive Supply  '), 'Cedar Hive Supply');
  assert.equal(supplierName(''), '');
  assert.equal(supplierName('x'.repeat(160)).length, 160);
  assert.equal(supplierName('x'.repeat(161)), '');
  assert.equal(supplierName('Cedar\nHive Supply'), '');
  assert.equal(supplierEmail('one@example.com; another@example.com'), '');
  assert.equal(supplierEmail('user@localhost'), '');
  assert.equal(supplierEmail('owner\u0000@example.com'), '');
  assert.equal(supplierEmail('buyer+dealer@example.com'), 'buyer+dealer@example.com');
});

test('known mail refusals and receipt status distinguish absence, sending and delivery', () => {
  for (const code of ['NO_MAILER', 'TENANT_NOT_CONNECTED', 'MAILBOX_GONE']) {
    const response = supplierInquiryFailure({ status: 409, data: { code, error: 'Check the environment mailer.' } }, false);
    assert.equal(response.disposition, 'refused');
    assert.match(response.error, /No inquiry was sent.*Check the environment mailer/);
  }
  assert.equal(supplierInquiryFailure({ status: 409 }, false).disposition, 'unknown');
  assert.equal(supplierInquiryFailure({ status: 409, data: { code: 'NO_MAILER' } }, true).disposition, 'unknown');
  assert.match(supplierInquiryFailure({ status: 404 }, true).error, /previous send is unconfirmed/);
  assert.deepEqual(supplierInquiryResponse({ disposition: 'absent' }, '', true).disposition, 'absent');
  assert.match(supplierInquiryResponse({ disposition: 'pending' }, '', true).note, /This check sent no email.*Sending is unconfirmed/);
  assert.match(supplierInquiryResponse({ submitted: true }, 'agent@example.com', true).note, /mailer accepted.*agent@example\.com.*Delivery is unconfirmed/);
});

test('a Shopify order placement can succeed while local storage fails', () => {
  const order = { name: '#1001', status: 'UNFULFILLED' };
  assert.match(supplierOrderResult({ order, recorded: false }), /Shopify placed order #1001.*local record could not be saved.*do not place this order again/);
  assert.match(supplierOrderResult({ order, recorded: true }), /saved to supplier_orders/);
  assert.match(supplierOrderResult({ order }), /Local storage is unconfirmed/);
});

test('the existing catalog profile distinguishes old Shopify lanes from current and unavailable lanes', async () => {
  const base = 'https://lane.example/api/v1';
  const expectedUrl = base + '/shopify/catalog/profile';
  const current = await readShopifySupplierMode(base, async (url, options) => {
    assert.equal(url, expectedUrl);
    assert.equal(options.credentials, 'omit');
    return new Response(JSON.stringify({ ucp: { capabilities: { 'dev.shopify.catalog.global': [{ version: 'fixture' }] } } }));
  });
  assert.equal(current, 'current');
  assert.equal(await readShopifySupplierMode(base, async () => new Response(null, { status: 404 })), 'legacy');
  assert.equal(await readShopifySupplierMode(base, async () => new Response(null, { status: 503 })), 'unavailable');
  assert.equal(await readShopifySupplierMode(base, async () => new Response('{}')), 'unavailable');
});

test('only a legacy lane uses the Shopify store address and direct authorization URL', () => {
  assert.deepEqual(shopifyStartFields('current', 'Cedar Fixture Supply'), { label: 'Cedar Fixture Supply' });
  assert.deepEqual(shopifyStartFields('legacy', ' cedar-fixture.myshopify.com '), { shop: 'cedar-fixture.myshopify.com' });
  assert.equal(shopifyStartFields('legacy', ''), null);
  assert.equal(shopifyStartFields('checking', 'Cedar Fixture Supply'), null);
  const response = { directUrl: 'https://store.example/authorize', url: 'https://lane.example/approval' };
  assert.equal(shopifyOnboardingUrl('current', response), response.url);
  assert.equal(shopifyOnboardingUrl('legacy', response), response.directUrl);
  assert.equal(shopifyOnboardingUrl('legacy', { ...response, directUrl: '' }), response.url);
});

const evidence = {
  name: 'Example Apiary <Supply>', storeUrl: 'https://supplier.example',
  productTitle: 'Wooden Hive', productUrl: 'https://supplier.example/products/hive',
  contactUrl: 'https://supplier.example/contact', contactEmail: 'dealer@supplier.example',
  contactTopic: 'Dealer applications'
};
const e = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function render(state) {
  return shopifyDiscoveryHtml(state, {
    e, copy: (value) => `<button data-value="${e(value)}">Copy question</button>`,
    stateLead: (action, _icon, label) => `<button data-action="${action}">${label}</button>`
  });
}

test('Quark distinguishes Shopify suppliers, an own-store connection and a storefront launch', () => {
  assert.equal(shopifyIntent('Connect my supplier’s Shopify store'), 'discovery');
  assert.equal(shopifyIntent('Find a dropshipping supplier'), 'discovery');
  assert.equal(shopifyIntent('How do I find suppliers in Shopify Collective?'), 'discovery');
  assert.equal(shopifyIntent('Connect my own Shopify store'), 'connection');
  assert.equal(shopifyIntent('I want to launch an online store'), '');
});

test('discovery separates seller evidence and supplier-published contact', () => {
  assert.equal(supplierEmail(' dealer@supplier.example '), 'dealer@supplier.example');
  assert.equal(supplierEmail('dealer@supplier.example, unwanted@example.net'), '');
  assert.deepEqual(supplierMatches([{ ...evidence, productUrl: 'javascript:alert(1)' }]), []);
  const [match] = supplierMatches([{ ...evidence, contactUrl: 'https://user:password@supplier.example/contact' }]);
  assert.equal(match.contactUrl, '');
  assert.equal(match.contactEmail, evidence.contactEmail);
  const state = newSupplierSearch();
  state.matches = supplierMatches([evidence]);
  const html = render(state);
  assert.match(html, /Example Apiary &lt;Supply&gt;/);
  assert.match(html, /Wooden Hive/);
  assert.ok(html.includes(COLLECTIVE_HELP));
  assert.match(html, /I know the business name/);
  assert.doesNotMatch(html, /myshopify\.com|store address/i);
  assert.doesNotMatch(html, /send-inquiry|create-approval/);
});

test('inquiry review displays the explicit recipient and an unknown send only offers a status check', () => {
  const state = newSupplierSearch();
  state.selected = supplierMatches([evidence])[0];
  let html = render(state);
  assert.match(html, /Open supplier contact page/);
  assert.match(html, /Dealer applications/);
  assert.match(html, /Review inquiry email/);
  assert.doesNotMatch(html, /conn-shopify-send-inquiry|conn-shopify-create-approval/);
  state.attempt = { recipient: 'designated@example.com', disposition: 'review' };
  html = render(state);
  assert.match(html, /designated@example\.com/);
  assert.match(html, /conn-shopify-send-inquiry/);
  state.attempt.disposition = 'unknown';
  html = render(state);
  assert.match(html, /conn-shopify-check-inquiry/);
  assert.doesNotMatch(html, /conn-shopify-send-inquiry/);
});

test('separate supplier approval requires the agreement step', () => {
  const state = newSupplierSearch();
  state.selected = supplierMatches([evidence])[0];
  assert.doesNotMatch(render(state), /conn-shopify-create-approval/);
  state.approval = true;
  assert.match(render(state), /conn-shopify-create-approval/);
  assert.match(render(state), /supplier signs in to Shopify, reviews access, and approves in their own store/);
});
