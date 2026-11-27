import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/account/needsAttentionDesk.js', import.meta.url), 'utf8');
const e = x => String(x).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const it = { id: 'incident', kind: 'vault.audit', data: { affectedEnvironments: [{ id: 'env-1', name: '<script>bad()</script>' }] } };
const na = { form: { incident: { target: 'env-1', note: ' Confirmed impact ', email: 'untrusted@example.test' } }, typed: {} };
const scope = { e, na, idOf: it => it.id, formOf: id => na.form[id], fieldAttrs: (_id, field) => `data-field="${field}"` };
function extract(start, end) { return vm.runInNewContext(source.slice(source.indexOf(start), source.indexOf(end)) + '; ' + start.split('(')[0].slice(9), scope); }
test('customer notice form shows only server-verified environment choices, escapes names and asks for confirmed impact', () => {
  const render = extract('function vaultNoticeBoxHtml(', '\nfunction actionsHtml(');
  const html = render(it, '');
  assert.match(html, /value="env-1" selected/); assert.match(html, /Confirmed impact/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Internal tests never notify customers/); assert.doesNotMatch(html, /untrusted@example/);
});
test('the customer-notice action sends only environment id and confirmed impact, never a recipient or broadcast audience', () => {
  const input = extract('function inputFor(', '\nfunction cardHtml(');
  assert.deepEqual(JSON.parse(JSON.stringify(input(it, 'notify-environment'))), { target: 'env-1', note: 'Confirmed impact' });
  assert.equal(input(it, 'review'), null);
});
test('private security routing is visibly fixed and only the platform owner gets its internal test control', () => {
  const account = fs.readFileSync(new URL('../src/account/account.js', import.meta.url), 'utf8');
  const fragment = account.slice(account.indexOf('function ntRowHtml('), account.indexOf('\nfunction ntRolesCardHtml('));
  let owner = true;
  const render = vm.runInNewContext(fragment + '; ntRowHtml', { ntState: { routes: {} }, escapeHtml: e, isOwner: () => owner, ico: () => '' });
  const event = { key: 'security.vault_audit', label: 'Credential-storage incident', detail: 'Private', ownerOnly: true };
  let html = render(event); assert.match(html, /Email · required/); assert.match(html, /data-nt-test/); assert.doesNotMatch(html, /checkbox/);
  owner = false; html = render(event); assert.match(html, /Owner-managed/); assert.doesNotMatch(html, /data-nt-test/);
});
