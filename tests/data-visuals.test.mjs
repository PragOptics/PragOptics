// tests/data-visuals.test.mjs: the Visuals view's counts over a table's rows (src/account/dataVisuals.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { byStatus, byMail, overTime, fieldKeys, byField, defaultField, visualsOf, visualsHtml, UNITS, MAX_FIELD_BUCKETS, LOAD_ALL_CAP } from '../src/account/dataVisuals.js';

// submission rows the way the public door stores them; moments at noon UTC so the local day is the same in any US zone
const sub = (id, at, fields, extra = {}) => ({ key: id, updatedAt: at, size: 300, value: { id, installId: 'i1', module: 'reviews', name: 'Reviews', lane: 'live', via: 'form', at, fields, ...extra } });
const sent = { from: 'forms@x.y', team: { to: ['a@x.y'], at: '2026-11-02T12:00:00Z' }, visitor: { to: ['v@z.w'], at: '2026-11-02T12:00:01Z' } };
const rows = [
  sub('r1', '2026-10-28T12:00:00Z', { name: 'TNT', rating: '5', sector: 'Refining' }, { status: 'approved', mail: sent }),
  sub('r2', '2026-10-29T12:00:00Z', { name: 'Ana', rating: '4', sector: 'Water' }, { status: 'approved', mail: sent }),
  sub('r3', '2026-11-02T12:00:00Z', { name: 'Bo', rating: '5', sector: 'Refining' }, { status: 'approved', mailHeld: 'no-mailer' }),
  sub('r4', '2026-11-02T12:00:00Z', { name: 'Cy', rating: '1', sector: 'Refining' }, { status: 'rejected', mail: { from: 'forms@x.y', team: { held: 'environment-day' }, visitor: { none: 'off' } } }),
  sub('r5', '2026-11-03T12:00:00Z', { name: 'Di', rating: '2', sector: 'Water' }, { status: 'rejected' }),
  sub('r6', '2026-11-03T12:00:00Z', { name: 'Ed', rating: '5' }, { status: 'pending', mail: { from: 'forms@x.y', team: { to: ['a@x.y'], at: '2026-11-03T12:00:00Z' }, visitor: { none: 'no-email' } } })
];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('by status: pending, approved, rejected in that order; a row without a status reads "no status", last', () => {
  assert.deepEqual(byStatus(rows).map(b => [b.key, b.count]), [['pending', 1], ['approved', 3], ['rejected', 2]]);
  const mixed = [...rows, { key: 'p1', value: { title: 'Widget' } }, sub('r7', '2026-11-03T12:00:00Z', { name: 'Fo' }, { status: 'held' })];
  assert.deepEqual(byStatus(mixed).map(b => b.key), ['pending', 'approved', 'rejected', 'held', 'no status']);
  assert.deepEqual(byStatus([]), []);
});

test('by mail: the Mail column\'s own words, the most common first, "not recorded" last; every row counted once', () => {
  const m = byMail(rows);
  assert.equal(m[0].key, 'team sent · submitter sent'); assert.equal(m[0].count, 2);
  assert.equal(m[m.length - 1].key, 'not recorded'); assert.equal(m[m.length - 1].count, 1);
  assert.ok(m.some(b => b.key === 'held: no mailer in the environment yet' && b.count === 1));
  assert.ok(m.some(b => b.key === "held: the environment's mails for the day were used up" && b.count === 1));
  assert.ok(m.some(b => b.key === 'team sent' && b.count === 1));
  assert.equal(m.reduce((n, b) => n + b.count, 0), rows.length);
});

test('over time by day fills the quiet days between the first and the last; by week counts from Monday; by month by month', () => {
  const day = overTime(rows, 'day');
  assert.equal(day.unit, 'day');
  assert.deepEqual(day.buckets.map(b => b.key), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepEqual(day.buckets.map(b => b.count), [1, 1, 0, 0, 0, 2, 2]);
  assert.equal(day.undated, 0);
  assert.ok(day.buckets.every(b => typeof b.label === 'string' && b.label.length > 0 && typeof b.start === 'string'));
  const week = overTime(rows, 'week');
  assert.deepEqual(week.buckets.map(b => [b.key, b.count]), [['2026-10-26', 2], ['2026-11-02', 4]]);
  assert.match(week.buckets[0].label, /^Week of /);
  const month = overTime(rows, 'month');
  assert.deepEqual(month.buckets.map(b => [b.key, b.count]), [['2026-10', 2], ['2026-11', 4]]);
  assert.equal(overTime(rows, 'nonsense').unit, 'day', 'an unknown unit counts by day');
});

test('over time: a row with no moment is counted apart; a long span is not filled with empty periods', () => {
  const undated = [...rows, { key: 'p1', value: { title: 'Widget' } }];
  assert.equal(overTime(undated, 'day').undated, 1);
  const far = [sub('a', '2022-01-10T12:00:00Z', { name: 'A' }), sub('b', '2026-11-03T12:00:00Z', { name: 'B' })];
  assert.equal(overTime(far, 'day').buckets.length, 2, 'two days years apart: only the two');
  assert.equal(overTime(far, 'month').buckets.length, 2, 'fifty-nine months: too long a span to fill');
  const near = [sub('a', '2026-08-10T12:00:00Z', { name: 'A' }), sub('b', '2026-11-03T12:00:00Z', { name: 'B' })];
  assert.deepEqual(overTime(near, 'month').buckets.map(b => [b.key, b.count]), [['2026-08', 1], ['2026-09', 0], ['2026-10', 0], ['2026-11', 1]], 'a short span draws its quiet months');
  assert.deepEqual(overTime([], 'day'), { unit: 'day', buckets: [], undated: 0 });
});

test('the fields a person can count by come from the rows\' own keys; the default pick is one that repeats, not free text', () => {
  const f = fieldKeys(rows);
  assert.deepEqual(f.map(x => x.key), ['name', 'rating', 'sector'], 'the most carried first, then by name');
  assert.deepEqual(f.map(x => x.distinct), [6, 4, 2]);
  assert.equal(f[0].label, 'Name');
  assert.equal(defaultField(f), 'rating', 'name is one per row (free text); rating repeats');
  assert.equal(defaultField([]), '');
  // a plain object table counts by its own keys; nested objects are not countable, a list counts each of its words
  const products = [{ key: 'p1', value: { title: 'Widget', tags: ['red', 'big'], dims: { w: 1 }, stock: 3 } }, { key: 'p2', value: { title: 'Gadget', tags: ['red'], stock: 0 } }];
  const pf = fieldKeys(products);
  assert.deepEqual(pf.map(x => x.key), ['stock', 'tags', 'title']);
  assert.equal(pf.find(x => x.key === 'tags').distinct, 2);
  assert.ok(!pf.some(x => x.key === 'dims'));
  assert.deepEqual(byField(products, 'tags').buckets.map(b => [b.key, b.count]), [['red', 2], ['big', 1]]);
});

test('the By field pick never offers the platform\'s bookkeeping keys (dataColumns HIDDEN): a plain-object table with id, status, at, mail counts by its own fields only', () => {
  // a studio- or key-written table: the stored value is the row itself, so its id and status sit beside its fields
  const plain = [
    { key: 'p1', value: { id: 'p1', status: 'active', at: '2026-11-01T12:00:00Z', mail: { team: {} }, decidedBy: 'x', title: 'Widget', colour: 'red' } },
    { key: 'p2', value: { id: 'p2', status: 'active', at: '2026-11-02T12:00:00Z', title: 'Gadget', colour: 'red' } },
    { key: 'p3', value: { id: 'p3', status: 'retired', at: '2026-11-03T12:00:00Z', title: 'Gizmo', colour: 'blue' } }
  ];
  const f = fieldKeys(plain);
  assert.deepEqual(f.map(x => x.key), ['colour', 'title'], 'id, status, at, mail and decidedBy are the Table\'s hidden keys and never fields to count by');
  assert.equal(defaultField(f), 'colour');
  assert.deepEqual(byField(plain, 'id'), { key: 'id', buckets: [], distinct: 0, without: 3 }, 'asked for a hidden key by hand, it counts nothing');
  assert.deepEqual(byField(plain, 'colour').buckets.map(b => [b.key, b.count]), [['red', 2], ['blue', 1]]);
  const v = visualsOf(plain, { field: 'status' });
  assert.equal(v.field, 'colour', 'a hidden key asked for gives way to the default');
  assert.deepEqual(v.byStatus.map(b => [b.key, b.count]), [['active', 2], ['retired', 1]], 'status still counts in its own block');
  // the submission rows read as before: fields only, nothing of the envelope
  assert.deepEqual(fieldKeys(rows).map(x => x.key), ['name', 'rating', 'sector']);
});

test('by a field: the values as buckets, the most common first, rows that leave it empty counted apart, a long tail folded into "other"', () => {
  const s = byField(rows, 'sector');
  assert.deepEqual(s.buckets.map(b => [b.key, b.count]), [['Refining', 3], ['Water', 2]]);
  assert.equal(s.without, 1); assert.equal(s.distinct, 2);
  const many = Array.from({ length: 30 }, (_, i) => sub(`m${i}`, '2026-11-03T12:00:00Z', { city: `Town ${i % 15}` }));
  const b = byField(many, 'city');
  assert.equal(b.distinct, 15);
  assert.equal(b.buckets.length, MAX_FIELD_BUCKETS + 1);
  const other = b.buckets[b.buckets.length - 1];
  assert.equal(other.key, '__other'); assert.equal(other.label, 'other (3 more values)'); assert.equal(other.count, 6);
  assert.equal(b.buckets.reduce((n, x) => n + x.count, 0), 30);
  assert.deepEqual(byField(rows, 'nothing'), { key: 'nothing', buckets: [], distinct: 0, without: rows.length });
});

test('visualsOf reads the rows once: the total, the four counts, the field that holds or the default', () => {
  const v = visualsOf(rows, { unit: 'week', field: 'sector' });
  assert.equal(v.total, 6); assert.equal(v.field, 'sector'); assert.equal(v.time.unit, 'week');
  assert.equal(v.byField.buckets[0].key, 'Refining');
  assert.equal(visualsOf(rows, { field: 'nothing' }).field, 'rating', 'a field the rows do not carry gives way to the default');
  const none = visualsOf([]);
  assert.deepEqual(none, { total: 0, byStatus: [], byMail: [], time: { unit: 'day', buckets: [], undated: 0 }, fields: [], field: '', byField: null });
  assert.equal(visualsOf(null).total, 0);
  assert.equal(LOAD_ALL_CAP, 500);
});

test('the blocks: a status tag as the label, bars at the width of their share, the period and field picks, the data escaped', () => {
  const h = visualsHtml(visualsOf(rows, { unit: 'day', field: 'sector' }), { esc });
  for (const title of ['By status', 'By mail', 'Over time', 'By field']) assert.ok(h.includes(`<h4 class="ev-vis-h">${title}</h4>`), title);
  assert.ok(h.includes('<span class="acct-tag is-pending">pending</span>'));
  assert.ok(h.includes('<span class="acct-tag is-verified">approved</span>'));
  assert.ok(h.includes('style="width:100%"'), 'the longest bar fills the track');
  assert.ok(h.includes('style="width:66.7%"'), 'rejected is two of three');
  assert.ok(h.includes('class="ev-vis-fill is-zero" style="width:0%"'), 'a quiet day draws an empty bar');
  for (const u of UNITS) assert.ok(h.includes(`data-env-action="data-unit" data-unit="${u}"`), u);
  assert.ok(h.includes('aria-selected="true" data-env-action="data-unit" data-unit="day"'));
  assert.ok(h.includes('<select class="acct-input acct-select ev-vis-pick" data-vis-field'));
  assert.ok(h.includes('<option value="sector" selected>Sector</option>'));
  assert.ok(h.includes('1 row leaves it empty.'));
  const sharp = visualsHtml(visualsOf([sub('x', '2026-11-03T12:00:00Z', { '<b>k</b>': '<i>v</i>' }, { status: '<s>' })], { field: '<b>k</b>' }), { esc });
  assert.ok(!sharp.includes('<b>k</b>') && !sharp.includes('<i>v</i>') && !sharp.includes('>&lt;s&gt;<') === false, 'the data\'s own words are escaped');
  assert.ok(sharp.includes('&lt;i&gt;v&lt;/i&gt;') && sharp.includes('value="&lt;b&gt;k&lt;/b&gt;"') && sharp.includes('&lt;s&gt;'));
  assert.equal(visualsHtml(visualsOf([]), { esc }), '<p class="acct-empty">Nothing to count in these rows yet.</p>');
  // plain rows with no status and no mail: those two blocks stay away
  const plain = visualsHtml(visualsOf([{ key: 'k1', value: 'hello', updatedAt: '2026-11-03T12:00:00Z' }]), { esc });
  assert.ok(!plain.includes('By status') && !plain.includes('By mail') && plain.includes('Over time') && !plain.includes('By field'));
  assert.ok(!/—/.test(h) && !/—/.test(plain), 'no em dashes in the words');
});
