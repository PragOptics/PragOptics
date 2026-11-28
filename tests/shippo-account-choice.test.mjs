import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { shippoConnectionWords, shippoCanBuy } from '../src/account/shippoConnection.js';
import { esc } from '../src/ui/words.js';

const source = readFileSync(new URL('../src/account/environment.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const functions = ['isManagedShippo', 'shippoAccountChoice', 'decideShippoAccount', 'shippingAccounts',
  'activeShippo', 'shippingConnection', 'shippingScope', 'shippingHtml', 'getShippingRates',
  'buyShippingLabel', 'loadShippingLabels', 'refundShippingLabel', 'connectionQuotaUsed'];
const handlers = functions.map(name => {
  const start = source.search(new RegExp('^(async )?function ' + name + '\\(', 'm'));
  assert.notEqual(start, -1, name);
  const line = source.slice(start, source.indexOf('\n', start));
  return line.endsWith('}') ? line : source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');

function candidate() {
  return { id: 'new', provider: 'shippo', label: 'Shippo', status: 'PENDING', detail: {
    managed: 'shippo-connect', oauthStage: 'awaiting_confirmation', identityVerified: true,
    lastCheckSucceeded: true, confirmationId: 'decision-1', shippoAccountId: 'merchant-2',
    shippoAccountEmail: 'provider-owner@example.test'
  } };
}
function confirmed(row) {
  return { ...row, status: 'ACTIVE', detail: { ...row.detail, confirmationId: '', oauthStage: 'connected',
    confirmedAccountId: row.detail.shippoAccountId, confirmedAccountEmail: row.detail.shippoAccountEmail } };
}
function fixture(rows, manage = true) {
  const ev = { teamId: 'shop', lane: 'live', connections: rows };
  const requests = [], notes = [], reads = [];
  const ctx = createContext({ ev, shippoCanBuy, shippoConnectionWords, canManageConnections: () => manage,
    sessionVersion: () => 1, ENV_URL: '/environment', D: { escapeHtml: esc, apiFetch: async u => { reads.push(u); return { labels: [] }; } },
    url: (path, q) => path + '?' + new URLSearchParams(q), paintConnections() {}, loadConnections() {}, paintShipping() {},
    rowNote: (...args) => notes.push(args), errText: e => e.message, post: async (p, b) => { requests.push({ p, b }); return ctx.answer; },
    cardHtml: ({body}) => body, shippingLabelsHtml: () => '<section>Existing labels</section>', shipInput: () => '',
    explainLink: () => '', stateLead: action => action, shipFromBilling: () => ({}), setTimeout, clearTimeout, shipArmTimer: null,
    shipNote() {}, shipState: () => ev.ship ||= { scope: ctx.shippingScope(), rates: null, picked: 'rate', labels: [] } });
  runInContext(handlers, ctx);
  const button = { isConnected: true, dataset: { id: 'new', confirmation: 'decision-1', account: 'merchant-2' } };
  return { ctx, ev, button, requests, notes, reads };
}

test('only a manager sees the exact provider choice; checkout stays closed on initial, legacy and changed identities', () => {
  const row = candidate(), f = fixture([row]);
  const choices = f.ctx.shippoAccountChoice(row, true);
  assert.match(choices, /provider-owner@example\.test · merchant-2/);
  assert.match(choices, /Use this Shippo account/);
  assert.match(choices, /Choose a different account/);
  assert.doesNotMatch(f.ctx.shippoAccountChoice(row, false), /<button/);
  assert.equal(shippoCanBuy(row), false);
  const legacy = { ...row, status: 'ACTIVE', detail: { ...row.detail, oauthStage: 'connected', confirmationId: '' } };
  assert.equal(f.ctx.shippoAccountChoice(legacy, true), '');
  for (const change of [{}, { confirmedAccountId: 'merchant-1' }, { confirmedAccountEmail: 'changed@example.test' },
    { historyOnly: true }, { oauthStage: 'awaiting_confirmation' }, { requiresAccountConfirmation: true }]) {
    const trusted = confirmed(row);
    assert.equal(shippoCanBuy({ ...trusted, detail: { ...trusted.detail, ...change } }), !Object.keys(change).length);
  }
});

test('confirm submits the displayed grant once and requires a matching confirmed response', async () => {
  const row = candidate(), f = fixture([row]);
  f.ctx.answer = { ok: true, connection: confirmed(row) };
  await f.ctx.decideShippoAccount(f.button, 'confirm');
  assert.deepEqual({ ...f.requests[0].b }, { id: 'new', decision: 'confirm', confirmationId: 'decision-1', shippoAccountId: 'merchant-2' });
  assert.equal(f.requests[0].p, '/environment/connections/shippo/refresh');
  assert.match(f.notes.at(-1)[1], /confirmed for new labels/);
  f.ctx.answer = { ok: true, connection: { ...row, status: 'ACTIVE' } };
  await f.ctx.decideShippoAccount(f.button, 'confirm');
  assert.equal(f.notes.at(-1)[2], true);
  const denied = fixture([row], false);
  await denied.ctx.decideShippoAccount(denied.button, 'confirm');
  f.button.dataset.confirmation = 'previous-attempt';
  await f.ctx.decideShippoAccount(f.button, 'reject');
  assert.equal(denied.requests.length, 0);
  assert.equal(f.requests.length, 2);
});

test('rejection preserves a legacy grant for history or returns a new candidate to a separate authorization step', async () => {
  for (const old of [false, true]) {
    const row = candidate();
    if (old) row.status = 'ACTIVE';
    const f = fixture([row]);
    f.ctx.answer = { ok: true, connection: { ...row, detail: { ...row.detail, oauthStage: 'account_rejected', historyOnly: old, confirmationId: '' } } };
    await f.ctx.decideShippoAccount(f.button, 'reject');
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].b.decision, 'reject');
    assert.equal(shippoConnectionWords(f.ctx.answer.connection).canAuthorize, !old);
    assert.equal(f.notes.at(-1)[2], undefined);
  }
  const unknown = candidate();
  Object.assign(unknown.detail, { oauthStage: 'verifying', identityVerified: false, shippoAccountId: '', shippoAccountEmail: '' });
  const f = fixture([unknown]);
  assert.doesNotMatch(f.ctx.shippoAccountChoice(unknown, true), /Use this Shippo account/);
  assert.match(f.ctx.shippoAccountChoice(unknown, true), /Choose a different account/);
});

test('legacy and historical accounts retain their own labels and refund target while paid controls stay closed', async () => {
  const current = confirmed(candidate()), archived = { ...current, id: 'original', detail: { ...current.detail, historyOnly: true } };
  const f = fixture([archived, current]);
  assert.equal(f.ctx.activeShippo().id, 'new');
  assert.equal(f.ctx.connectionQuotaUsed(), 1);
  f.ev.connUsed = 4;
  assert.equal(f.ctx.connectionQuotaUsed(), 4);
  assert.match(f.ctx.shippingHtml(), /ship-rates/);
  f.ev.shippingViewId = 'original'; f.ev.ship = null;
  const history = f.ctx.shippingHtml();
  assert.match(history, /Existing labels/);
  assert.doesNotMatch(history, /ship-buy|ship-rates/);
  await f.ctx.loadShippingLabels();
  assert.match(f.reads[0], /connectionId=original/);
  await f.ctx.buyShippingLabel();
  await f.ctx.getShippingRates();
  assert.equal(f.requests.length, 0);
  f.ev.shipArm = 'old-label';
  f.ctx.answer = { status: 'requested' };
  f.ev.ship.labels = [{ transactionId: 'old-label', storedOnly: true, canUseHistoricalActions: false }];
  await f.ctx.refundShippingLabel('old-label');
  assert.equal(f.requests.length, 0);
  f.ev.ship.labels[0].canUseHistoricalActions = true;
  await f.ctx.refundShippingLabel('old-label');
  assert.deepEqual({ ...f.requests[0].b }, { connectionId: 'original', transactionId: 'old-label' });
});

test('ended and missing grants can select their saved PDFs without claiming the purchasing slot', async () => {
  for (const status of ['PENDING', 'REJECTED']) {
    const historical = candidate();
    historical.status = status;
    historical.detail.historyOnly = true;
    const f = fixture([historical]);
    assert.equal(f.ctx.activeShippo(), undefined);
    assert.equal(f.ctx.connectionQuotaUsed(), 0);
    assert.equal(f.ctx.shippingConnection().id, historical.id);
    assert.doesNotMatch(f.ctx.shippingHtml(), /ship-buy|ship-rates/);
    await f.ctx.loadShippingLabels();
    assert.equal(f.reads.length, 1);
  }
  const pending = fixture([candidate()]);
  assert.equal(pending.ctx.shippingHtml(), '');
  await pending.ctx.loadShippingLabels();
  assert.equal(pending.reads.length, 0);
});
