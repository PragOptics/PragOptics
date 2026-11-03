// src/account/dataVisuals.js
//
// VISUALS OVER A TABLE'S ROWS (2026-11-03, the build plan D9; Cameron's direction: "table + cards + visuals/analytics
// atop any data, first-class"). Pure: the rows the Data card has loaded in, counts out: the total, by status, by what
// became of each row's mail, over time by day, week or month, and by a field the person picks from the rows' own keys.
// Nothing is specific to one table: a review, a break-in or a product counts the same way. environment.js draws the
// blocks (visualsHtml) beside its Table and Cards views and says how many rows the counts cover.
//
// The columns' helpers (dataColumns.js) decide what a row's fields are and when it happened; the Mail column's words
// (rowMail.js) name a row's mail state, so the By mail bars read exactly as the Table's Mail column does.

import { innerOf, whenOf, statusOf, labelOf, cellText } from './dataColumns.js';
import { mailShort } from './rowMail.js';

export const UNITS = Object.freeze(['day', 'week', 'month']);
export const UNIT_WORDS = Object.freeze({ day: 'Day', week: 'Week', month: 'Month' });
export const MAX_FIELD_BUCKETS = 12;   // by a field: the most common values each get a bar, the rest fold into one "other"
export const FILL_GAPS_UPTO = 36;      // over time: empty periods between the first and the last are drawn while the span stays this short
export const LOAD_ALL_CAP = 500;       // Load all reads up to this many rows (the server's page cap)
const STATUS_ORDER = ['pending', 'approved', 'rejected'];
const NO_STATUS = 'no status';
const NO_MAIL = 'not recorded';
const TAG = { approved: 'is-verified', pending: 'is-pending', rejected: 'is-bad' };

function tally(rows, keyOf) {
  const m = new Map();
  for (const r of rows || []) { const k = keyOf(r); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
/** Buckets from a tally: a fixed order first when given, then by count, then by name. */
function sorted(map, order = null) {
  const list = [...map.entries()].map(([key, count]) => ({ key, label: key, count }));
  return list.sort((a, b) => {
    const oa = order ? order.indexOf(a.key) : -1, ob = order ? order.indexOf(b.key) : -1;
    if ((oa < 0) !== (ob < 0)) return oa < 0 ? 1 : -1;
    if (oa >= 0 && ob >= 0 && oa !== ob) return oa - ob;
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}
function lastOf(list, key) { const i = list.findIndex(b => b.key === key); if (i >= 0) list.push(...list.splice(i, 1)); return list; }

/** By status: pending, approved, rejected first, any other word by count, 'no status' last. */
export function byStatus(rows) { return lastOf(sorted(tally(rows, r => statusOf(r) || NO_STATUS), STATUS_ORDER), NO_STATUS); }
/** By what became of the row's mail, in the Mail column's own words; a row that says nothing about mail reads 'not recorded', last. */
export function byMail(rows) { return lastOf(sorted(tally(rows, r => mailShort(r && r.value) || NO_MAIL)), NO_MAIL); }

/* ---- over time ---- */
const pad = (n) => String(n).padStart(2, '0');
/** The period a moment falls in, as the local midnight that starts it: the day, the Monday of its week, the first of its month. */
function startOf(d, unit) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (unit === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  if (unit === 'month') x.setDate(1);
  return x;
}
function periodKey(d, unit) { return unit === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nextPeriod(d, unit) { const x = new Date(d); if (unit === 'day') x.setDate(x.getDate() + 1); else if (unit === 'week') x.setDate(x.getDate() + 7); else x.setMonth(x.getMonth() + 1); return x; }
/** A period's label: "Nov 2, 2026", "Week of Nov 2, 2026", "Nov 2026". */
export function periodLabel(d, unit) {
  try {
    if (unit === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return unit === 'week' ? `Week of ${day}` : day;
  } catch { return periodKey(d, unit); }
}
/**
 * Over time: { unit, buckets: [{ key, label, count, start }] oldest first, undated }. Empty periods between the first and
 * the last are drawn (count 0) while the span stays short (FILL_GAPS_UPTO), so a quiet week reads as quiet; a long span
 * shows only the periods that have rows. Rows with no moment are counted apart (undated).
 */
export function overTime(rows, unit = 'day') {
  const u = UNITS.includes(unit) ? unit : 'day';
  const counts = new Map();
  let undated = 0;
  for (const r of rows || []) {
    const w = whenOf(r);
    const d = w ? new Date(w) : null;
    if (!d || Number.isNaN(d.getTime())) { undated++; continue; }
    const s = startOf(d, u), k = periodKey(s, u);
    const b = counts.get(k) || { key: k, start: s, count: 0 };
    b.count++;
    counts.set(k, b);
  }
  let buckets = [...counts.values()].sort((a, b) => a.start - b.start);
  if (buckets.length > 1) {
    const filled = [];
    const last = buckets[buckets.length - 1].start;
    let cur = buckets[0].start, i = 0, guard = 0;
    while (cur <= last && guard++ < 20000) {
      const k = periodKey(cur, u);
      if (i < buckets.length && buckets[i].key === k) filled.push(buckets[i++]); else filled.push({ key: k, start: new Date(cur), count: 0 });
      cur = nextPeriod(cur, u);
    }
    if (filled.length <= FILL_GAPS_UPTO) buckets = filled;
  }
  return { unit: u, buckets: buckets.map(b => ({ key: b.key, label: periodLabel(b.start, u), count: b.count, start: b.start.toISOString() })), undated };
}

/* ---- by a field ---- */
/** The countable texts of one field's value: a word or number as itself, a list of them one each (a multi-choice answer), an object none. */
function textsOf(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return [...new Set(v.filter(x => x != null && x !== '' && typeof x !== 'object').map(x => String(cellText(x)).trim()).filter(Boolean))];
  if (typeof v === 'object') return [];
  const t = String(cellText(v)).trim();
  return t ? [t] : [];
}
/** The rows' own fields a person can count by: [{ key, label, count, distinct }], the most carried first. */
export function fieldKeys(rows) {
  const seen = new Map();
  for (const r of rows || []) {
    const inner = innerOf(r);
    if (!inner) continue;
    for (const [k, v] of Object.entries(inner)) {
      const ts = textsOf(v);
      if (!ts.length) continue;
      const f = seen.get(k) || { key: k, label: labelOf(k), count: 0, values: new Set() };
      f.count++;
      for (const t of ts) f.values.add(t);
      seen.set(k, f);
    }
  }
  return [...seen.values()].map(f => ({ key: f.key, label: f.label, count: f.count, distinct: f.values.size })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
/** The field to count by when nobody picked one: the first that repeats without being free text (2 to 12 distinct values, fewer than its rows), else the first. */
export function defaultField(fields) {
  const list = fields || [];
  const f = list.find(x => x.distinct >= 2 && x.distinct <= MAX_FIELD_BUCKETS && x.distinct < x.count) || list[0];
  return f ? f.key : '';
}
/** By one field: its values as buckets, the most common first, the rest folded into one "other" row: { key, buckets, distinct, without }. */
export function byField(rows, key) {
  const m = new Map();
  let without = 0;
  for (const r of rows || []) {
    const inner = innerOf(r);
    const ts = inner ? textsOf(inner[key]) : [];
    if (!ts.length) { without++; continue; }
    for (const t of ts) m.set(t, (m.get(t) || 0) + 1);
  }
  const all = sorted(m);
  const top = all.slice(0, MAX_FIELD_BUCKETS);
  if (all.length > MAX_FIELD_BUCKETS) {
    const rest = all.slice(MAX_FIELD_BUCKETS);
    top.push({ key: '__other', label: `other (${rest.length} more values)`, count: rest.reduce((n, b) => n + b.count, 0) });
  }
  return { key, buckets: top, distinct: all.length, without };
}

/** Everything the Visuals view draws, in one read of the rows: { total, byStatus, byMail, time, fields, field, byField }. */
export function visualsOf(rows, { unit = 'day', field = '' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const fields = fieldKeys(list);
  const pick = fields.some(f => f.key === field) ? field : defaultField(fields);
  return { total: list.length, byStatus: byStatus(list), byMail: byMail(list), time: overTime(list, unit), fields, field: pick, byField: pick ? byField(list, pick) : null };
}

/* ---- the blocks ---- */
/** Buckets as thin bars, the longest at the full width, the count beside each; `labelHtml` may draw a bucket's label (escaped by the caller). */
function barsHtml(buckets, esc, labelHtml = null) {
  const max = Math.max(1, ...buckets.map(b => b.count));
  return `<ol class="ev-vis-bars">${buckets.map(b => {
    const pct = Math.round(b.count / max * 1000) / 10;
    return `<li class="ev-vis-row"><span class="ev-vis-l" title="${esc(b.label)}">${labelHtml ? labelHtml(b) : esc(b.label)}</span><span class="ev-vis-bar" aria-hidden="true"><span class="ev-vis-fill ${b.count ? '' : 'is-zero'}" style="width:${pct}%"></span></span><span class="ev-vis-n">${Number(b.count) || 0}</span></li>`;
  }).join('')}</ol>`;
}
function block(title, body, { tools = '', wide = false } = {}) {
  return `<section class="ev-vis-block ${wide ? 'is-wide' : ''}"><div class="ev-vis-head"><h4 class="ev-vis-h">${title}</h4>${tools}</div>${body}</section>`;
}
/**
 * The Visuals view's blocks for visualsOf()'s answer: By status (a status tag as the label, the Table's colours), By mail,
 * Over time (with the Day / Week / Month pick, data-env-action="data-unit"), By field (with the field pick,
 * data-vis-field). A block whose rows say nothing is left out; nothing to count says so. `esc` escapes the data's words.
 */
export function visualsHtml(v, { esc = (s) => String(s) } = {}) {
  const blocks = [];
  if (v.byStatus.some(b => b.key !== NO_STATUS)) {
    blocks.push(block('By status', barsHtml(v.byStatus, esc, b => b.key === NO_STATUS ? `<span class="adm-muted">${esc(b.label)}</span>` : `<span class="acct-tag ${TAG[b.key] || ''}">${esc(b.label)}</span>`)));
  }
  if (v.byMail.some(b => b.key !== NO_MAIL)) blocks.push(block('By mail', barsHtml(v.byMail, esc)));
  if (v.time.buckets.length) {
    const tabs = `<div class="ev-view" role="tablist" aria-label="Count by day, week or month">${UNITS.map(u => `<button class="btn btn-sm ${u === v.time.unit ? 'is-on' : ''}" type="button" role="tab" aria-selected="${u === v.time.unit}" data-env-action="data-unit" data-unit="${u}">${UNIT_WORDS[u]}</button>`).join('')}</div>`;
    const undated = v.time.undated ? `<p class="adm-muted ev-vis-note">${v.time.undated} ${v.time.undated === 1 ? 'row has' : 'rows have'} no date.</p>` : '';
    blocks.push(block('Over time', `${barsHtml(v.time.buckets, esc)}${undated}`, { tools: tabs, wide: true }));
  }
  if (v.fields.length && v.byField) {
    const pick = `<select class="acct-input acct-select ev-vis-pick" data-vis-field aria-label="Field to count by">${v.fields.map(f => `<option value="${esc(f.key)}" ${f.key === v.field ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>`;
    const without = v.byField.without ? `<p class="adm-muted ev-vis-note">${v.byField.without} ${v.byField.without === 1 ? 'row leaves' : 'rows leave'} it empty.</p>` : '';
    blocks.push(block('By field', `${barsHtml(v.byField.buckets, esc)}${without}`, { tools: pick, wide: true }));
  }
  if (!blocks.length) return '<p class="acct-empty">Nothing to count in these rows yet.</p>';
  return `<div class="ev-vis">${blocks.join('')}</div>`;
}
