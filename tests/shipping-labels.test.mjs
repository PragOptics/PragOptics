import test from 'node:test';
import assert from 'node:assert/strict';
import { labelGroups, shippingLabelsHtml } from '../src/account/shippingLabels.js';
const labels = [
  { transactionId: 'active', trackingNumber: 'ACTIVE-NUMBER', status: 'SUCCESS', trackingStatus: 'PRE_TRANSIT', createdAt: '2026-11-26' },
  { transactionId: 'refunded', trackingNumber: 'REFUNDED-NUMBER', status: 'REFUNDED' },
  { transactionId: 'pending', trackingNumber: 'REFUND-PENDING-NUMBER', status: 'REFUNDPENDING' },
  { transactionId: 'delivered', trackingNumber: 'DELIVERED-NUMBER', status: 'SUCCESS', trackingStatus: 'DELIVERED' },
  { transactionId: 'error', trackingNumber: 'FAILED-PURCHASE', status: 'ERROR' }
];
test('active shipments are separate from refunds and completed shipments; failed purchases are not labels', () => {
  const groups = labelGroups(labels);
  assert.deepEqual(groups.active.map(v => v.transactionId), ['active']);
  assert.deepEqual(groups.history.map(v => v.transactionId), ['refunded', 'pending', 'delivered']);
  assert.equal(labelGroups(labels, { active: { status: 'DELIVERED' } }).active.length, 0);
  assert.equal(labelGroups([{ status: 'REFUNDREJECTED' }]).active.length, 1, 'a rejected refund does not mean the label was refunded');
});
test('default list contains active labels, full actions, and explicit List/Cards and history choices', () => {
  const html = shippingLabelsHtml({ labels });
  assert.match(html, /<table/); assert.match(html, /ACTIVE-NUMBER/);
  assert.doesNotMatch(html, /REFUNDED-NUMBER|REFUND-PENDING-NUMBER|DELIVERED-NUMBER|FAILED-PURCHASE/);
  for (const text of ['Filter labels', 'Labels view', 'Check tracking', 'Open the label PDF', 'Refund this label', 'ship-label-view']) assert.ok(html.includes(text), text);
});
test('the alternate card view retains the same actions; All visibly separates active and history', () => {
  for (const view of ['list', 'cards']) {
    const html = shippingLabelsHtml({ labels, view, filter: 'all', nextPage: 2 });
    for (const text of ['Active labels', 'Label history', 'ACTIVE-NUMBER', 'REFUNDED-NUMBER', 'DELIVERED-NUMBER', 'Load earlier labels']) assert.ok(html.includes(text), text);
    assert.equal((html.match(/aria-label="Check tracking"/g) || []).length, 4);
    assert.equal(html.includes('<table'), view === 'list');
    assert.equal(html.includes('<article'), view === 'cards');
  }
});
test('label fields are escaped in both views and armed refunds preserve the second-press confirmation', () => {
  for (const view of ['list', 'cards']) {
    const html = shippingLabelsHtml({ labels: [{ ...labels[0], trackingNumber: '<img src=x onerror=1>' }], armed: 'active', view });
    assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img/);
    assert.match(html, /Refund\? Press again to confirm/); assert.match(html, /Keep it/);
  }
});

test('stored PDFs appear in history, with provider actions only when the saved account permits them', () => {
  for (const view of ['list', 'cards']) {
    const saved = { transactionId: 'archived', storedOnly: true };
    const show = (canUseHistoricalActions, canRefund = true) => shippingLabelsHtml({
      labels: [{ ...saved, canUseHistoricalActions }], filter: 'history', view, canRefund
    });
    for (const html of [show(true), show(false)]) {
      assert.match(html, /Stored PDF/);
      assert.match(html, /ship-label-open/);
      assert.doesNotMatch(html, /Pending|Bought/);
    }
    assert.match(show(true), /ship-track/);
    assert.match(show(true), /ship-refund/);
    assert.doesNotMatch(show(false), /ship-track|ship-refund/);
    assert.doesNotMatch(show(true, false), /ship-refund/);
  }
});
