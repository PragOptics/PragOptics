import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setAppMode } from '../src/runtime/appRouter.js';

// Exercise the shipped route, delegated form, render and session handlers.
// Requests deliberately ignore abort so a response can arrive after navigation.
const fields = new Map();
const host = {
  innerHTML: '',
  replaceChildren() { this.innerHTML = ''; }
};
let hidden = true;
const view = { classList: {
  contains: () => hidden, add: () => { hidden = true; }, remove: () => { hidden = false; }
} };
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), {
  getElementById(id) {
    if (id === 'checkoutView') return view;
    if (id === 'checkoutBody') return host;
    return fields.get(id) || null;
  }
});
globalThis.sessionStorage = globalThis.localStorage = { getItem: () => null, removeItem() {} };
window.location = { replace() {} };
const checkout = await import('../src/shop/checkout.js');
const { sessionChanged } = await import('../src/account/sessionPrivacy.js');
const { logout } = await import('../src/runtime/session.js');
window.setAppMode = setAppMode;
const bootstrap = readFileSync(new URL('../src/runtime/bootstrap.js', import.meta.url), 'utf8');
const modeHook = bootstrap.match(/window\.onEnterMode\s*=\s*\(mode\) => \{[\s\S]*?\n    \};/)[0];
function installRouteHook(target, module) {
  const noop = () => {};
  runInNewContext(modeHook, {
    window: target, checkout: module, endFinalizeVeil: noop, onAccountEnter: noop, onAdminEnter: noop,
    onWarrantyEnter: noop, onBuildsEnter: noop, onJoinEnter: noop
  });
}
installRouteHook(window, checkout);
checkout.initCheckoutView();
const pending = [];
globalThis.fetch = async (url, options) => {
  assert.ok(url.endsWith('/orders/lookup'));
  return new Promise((resolve, reject) => pending.push({ options, resolve, reject }));
};
function act(type, selector) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'target', { value: { closest: candidate => candidate === selector ? {} : null } });
  document.dispatchEvent(event);
}
function enter() { act('click', '[data-track-order]'); }
function submit(orderId = 'sample-order', email = 'guest@example.test') {
  fields.set('co-track-id', { value: orderId });
  fields.set('co-track-email', { value: email });
  act('submit', '#coTrackForm');
}
function answer(request, orderId) {
  request.resolve({ ok: true, json: async () => ({ order: { orderId, status: 'SHIPPED', lines: [] } }) });
}
function blank() {
  assert.match(host.innerHTML, /Find my order/);
  assert.doesNotMatch(host.innerHTML, /sample-order|guest@example\.test|co-track-result|Looking…/);
}
const flush = () => new Promise(resolve => setImmediate(resolve));
afterEach(() => { setAppMode('landing'); fields.clear(); pending.length = 0; });

test('the route hook accepts a cached checkout module with only the original hooks', () => {
  let entries = 0;
  const target = {};
  installRouteHook(target, { onCheckoutEnter() { entries++; } });
  target.onEnterMode('checkout');
  target.onEnterMode('shop');
  assert.equal(entries, 1);
  assert.equal(typeof checkout.onCheckoutEnter, 'function');
  assert.equal(typeof checkout.initCheckoutView, 'function');
});

test('guest lookup requires both fields and stays usable across an ordinary renewal', async () => {
  enter();
  submit('sample-order', '');
  assert.match(host.innerHTML, /Enter the order number and the email/);
  assert.equal(pending.length, 0);
  submit();
  const [request] = pending;
  assert.deepEqual(JSON.parse(request.options.body), { orderId: 'sample-order', email: 'guest@example.test' });
  sessionChanged({ renewal: true });
  assert.equal(request.options.signal.aborted, false);
  answer(request, 'sample-order');
  await flush();
  assert.match(host.innerHTML, /co-track-result/);
  setAppMode('shop');
  assert.equal(host.innerHTML, '');
  enter();
  blank();
});

test('a prior visit cannot update a newer lookup after same-tab navigation', async () => {
  enter(); submit();
  const [previous] = pending;
  setAppMode('shop');
  assert.equal(previous.options.signal.aborted, true);
  assert.equal(host.innerHTML, '');
  enter(); blank(); submit('new-order', 'next@example.test');
  const current = pending[1];
  answer(previous, 'sample-order');
  await flush();
  assert.match(host.innerHTML, /Looking…/);
  assert.doesNotMatch(host.innerHTML, /sample-order|co-track-result/);
  answer(current, 'new-order');
  await flush();
  assert.match(host.innerHTML, /<code>new-order<\/code>/);
});

for (const [boundary, endVisit] of [
  ['session expiry or replacement', () => sessionChanged()],
  ['logout', () => logout()],
  ['browser pagehide', () => window.dispatchEvent(new Event('pagehide'))]
]) {
  test(`${boundary} clears guest credentials and rejects late errors`, async () => {
    enter(); submit();
    const [request] = pending;
    endVisit();
    blank();
    assert.equal(request.options.signal.aborted, true);
    request.reject(new Error('Previous visit error'));
    await flush();
    blank();
    assert.doesNotMatch(host.innerHTML, /Previous visit error/);
  });
}
