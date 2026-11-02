// src/account/approvalGroups.js
//
// APPROVALS, the pure part (2026-11-02; the definition _local/APPROVALS-MAIL-DEFINITION-2026-11-02.md). The server
// answers the waiting rows grouped per moderating module (GET v1/environment/approvals); this module shapes them for
// the Approvals section and the Home line and says each item in words, from its own fields. No DOM, no fetch.

/** The groups out of the server's answer: [{ installId, name, table, pending, more, items }], never anything else. */
export function groupsOf(answer) {
  const list = answer && Array.isArray(answer.groups) ? answer.groups : [];
  return list.filter(g => g && typeof g === 'object').map(g => ({
    installId: String(g.installId || ''), name: String(g.name || 'A module'), table: String(g.table || ''),
    pending: Number(g.pending) || (Array.isArray(g.items) ? g.items.length : 0), more: !!g.more,
    items: (Array.isArray(g.items) ? g.items : []).filter(i => i && i.key).map(i => ({
      key: String(i.key), at: i.at || '', headline: String(i.headline || ''), host: String(i.host || ''), lane: String(i.lane || ''), via: String(i.via || ''),
      fields: i.fields && typeof i.fields === 'object' && !Array.isArray(i.fields) ? i.fields : {},
      labels: i.labels && typeof i.labels === 'object' ? i.labels : {}
    }))
  }));
}

/** How many wait in all, and how many groups have any. */
export function totals(groups) {
  const list = Array.isArray(groups) ? groups : [];
  return { waiting: list.reduce((n, g) => n + (Number(g.pending) || 0), 0), groups: list.filter(g => (Number(g.pending) || 0) > 0).length, more: list.some(g => g.more) };
}

/** The Home line: "2 waiting in Reviews" / "3 waiting in Reviews and Listings" / '' when nothing waits. */
export function countsLine(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter(g => (Number(g.pending) || 0) > 0);
  const t = totals(list);
  if (!t.waiting) return '';
  const names = list.map(g => g.name);
  const where = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${t.waiting}${t.more ? '+' : ''} waiting in ${where}`;
}

/** A field's label: the install's own when it has one, else the key in words. */
export function labelOf(key, labels) {
  const own = labels && labels[key];
  if (own) return String(own);
  return String(key || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

/** A field's value as a line of text; nothing for an empty or nested value. */
export function textOf(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/**
 * The lines shown for one item under its headline: its fields in the install's order (labels first), the headline's
 * own field left out, empty and nested ones left out, at most `max`; the rest are counted.
 */
export function itemLines(item, { max = 4 } = {}) {
  const fields = item && item.fields ? item.fields : {};
  const labels = item && item.labels ? item.labels : {};
  const ordered = [...Object.keys(labels).filter(k => k in fields), ...Object.keys(fields).filter(k => !(k in labels))];
  const out = [];
  let hidden = 0;
  for (const k of ordered) {
    if (/^hp$|_ok$/i.test(k)) continue;
    const text = textOf(fields[k]);
    if (!text) continue;
    if (item.headline && text === item.headline) continue;
    if (out.length >= max) { hidden++; continue; }
    out.push({ key: k, label: labelOf(k, labels), text });
  }
  return { lines: out, hidden };
}

/** What a group's head says: "2 waiting · reviews" / "nothing waiting · reviews". */
export function groupSummary(g) {
  const n = Number(g && g.pending) || 0;
  return `${n ? `${n}${g.more ? '+' : ''} waiting` : 'nothing waiting'}${g && g.table ? ` · ${g.table}` : ''}`;
}
