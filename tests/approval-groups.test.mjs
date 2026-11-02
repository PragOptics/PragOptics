// tests/approval-groups.test.mjs: the Approvals section's pure part (src/account/approvalGroups.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupsOf, totals, countsLine, labelOf, textOf, itemLines, groupSummary } from '../src/account/approvalGroups.js';

const answer = { ok: true, groups: [
  { installId: 'rv', name: 'Reviews', table: 'reviews', pending: 2, more: false, items: [
    { key: 'sub-b', at: '2026-11-02T21:00:00Z', headline: 'Ben', host: 'bridgesindust.com', lane: 'live', via: 'form', fields: { name: 'Ben', email: 'b@x.co', rating: '5', text: 'Great work, on time.', hp: '' }, labels: { name: 'Your name', rating: 'Stars', text: 'Review' } },
    { key: 'sub-a', at: '2026-11-02T20:00:00Z', headline: 'Ana', fields: { name: 'Ana', text: 'Fine' }, labels: {} }
  ] },
  { installId: 'ls', name: 'Listings', table: 'listings', pending: 0, items: [] },
  null
] };

test('groupsOf shapes the answer and nothing else', () => {
  const g = groupsOf(answer);
  assert.deepEqual(g.map(x => [x.installId, x.name, x.table, x.pending, x.items.length]), [['rv', 'Reviews', 'reviews', 2, 2], ['ls', 'Listings', 'listings', 0, 0]]);
  assert.equal(g[0].items[0].headline, 'Ben'); assert.equal(g[0].items[0].host, 'bridgesindust.com');
  assert.deepEqual(groupsOf(null), []); assert.deepEqual(groupsOf({ groups: 'x' }), []);
  assert.equal(groupsOf({ groups: [{ installId: 'x', items: [{ key: 'k' }] }] })[0].pending, 1, 'a count the server left out comes from the items');
});

test('totals and the Home line count only groups with something waiting', () => {
  const g = groupsOf(answer);
  assert.deepEqual(totals(g), { waiting: 2, groups: 1, more: false });
  assert.equal(countsLine(g), '2 waiting in Reviews');
  assert.equal(countsLine([{ name: 'Reviews', pending: 1 }, { name: 'Listings', pending: 2 }]), '3 waiting in Reviews and Listings');
  assert.equal(countsLine([{ name: 'A', pending: 1 }, { name: 'B', pending: 1 }, { name: 'C', pending: 1, more: true }]), '3+ waiting in A, B and C');
  assert.equal(countsLine([{ name: 'Listings', pending: 0 }]), '');
  assert.equal(countsLine([]), '');
  assert.equal(groupSummary(g[0]), '2 waiting · reviews'); assert.equal(groupSummary(g[1]), 'nothing waiting · listings');
});

test('an item says its fields in the install\'s order with its labels, the headline\'s field and the junk left out, the rest counted', () => {
  const g = groupsOf(answer);
  const { lines, hidden } = itemLines(g[0].items[0]);
  assert.deepEqual(lines.map(l => [l.label, l.text]), [['Stars', '5'], ['Review', 'Great work, on time.'], ['Email', 'b@x.co']]);
  assert.equal(hidden, 0);
  const small = itemLines(g[0].items[0], { max: 1 });
  assert.equal(small.lines.length, 1); assert.equal(small.hidden, 2);
  assert.deepEqual(itemLines(g[0].items[1]).lines.map(l => [l.label, l.text]), [['Text', 'Fine']]);
  assert.equal(labelOf('full_name', {}), 'Full name'); assert.equal(labelOf('phoneNumber', {}), 'Phone Number'); assert.equal(labelOf('x', { x: 'Given' }), 'Given');
  assert.equal(textOf(true), 'yes'); assert.equal(textOf({ a: 1 }), ''); assert.equal(textOf(' a  b '), 'a b');
});
