// src/account/approvalGroups.js
//
// APPROVALS, the pure part (2026-11-02; the definition _local/APPROVALS-MAIL-DEFINITION-2026-11-02.md). The server
// answers the waiting rows grouped per moderating module (GET v1/environment/approvals); this module shapes them for
// the Approvals section and the Home line and says each item in words, from its own fields. No DOM, no fetch.

/**
 * The groups out of the server's answer: [{ installId, name, table, pending, more, intent, canDecide, deciders, items }],
 * never anything else. 2026-11-03 (the plan D4, D5): a group carries the module's intent word, whether the person
 * looking may decide ITS rows (its own approvers, else the environment's rule) and who may; a lane whose backend says
 * none of that yet answers the old shape, so canDecide falls back to the answer's one flag and the rest stay empty.
 */
export function groupsOf(answer) {
  const list = answer && Array.isArray(answer.groups) ? answer.groups : [];
  const all = !!(answer && answer.canDecide);
  return list.filter(g => g && typeof g === 'object').map(g => ({
    installId: String(g.installId || ''), name: String(g.name || 'A module'), table: String(g.table || ''),
    pending: Number(g.pending) || (Array.isArray(g.items) ? g.items.length : 0), more: !!g.more,
    intent: String(g.intent || '').trim().toLowerCase(),
    canDecide: typeof g.canDecide === 'boolean' ? g.canDecide : all,
    deciders: [...new Set((Array.isArray(g.deciders) ? g.deciders : []).map(x => String(x || '').trim().toLowerCase()).filter(x => x.includes('@')))],
    items: (Array.isArray(g.items) ? g.items : []).filter(i => i && i.key).map(i => ({
      key: String(i.key), at: i.at || '', headline: String(i.headline || ''), host: String(i.host || ''), lane: String(i.lane || ''), via: String(i.via || ''),
      intent: String(i.intent || g.intent || '').trim().toLowerCase(),
      fields: i.fields && typeof i.fields === 'object' && !Array.isArray(i.fields) ? i.fields : {},
      labels: i.labels && typeof i.labels === 'object' ? i.labels : {}
    }))
  }));
}

/** "a and b", "a, b and c". */
function listWords(items) {
  const a = (items || []).filter(Boolean);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

/** Who may decide a group's rows, in words: "decided by the owner and ops@site"; '' when the server named nobody. */
export function decidersWords(g) {
  const list = g && Array.isArray(g.deciders) ? g.deciders : [];
  return list.length ? `decided by ${listWords(list)}` : '';
}

/**
 * The line under a group's head: "review · decided by the owner and ops@site". The intent word first when the module
 * has one, then who decides when the server named them; '' when neither is known.
 */
export function groupWords(g) {
  return [g && g.intent ? g.intent : '', decidersWords(g)].filter(Boolean).join(' · ');
}

/** What a person who cannot decide a group reads under it: who can, so they know whom to ask. */
export function cannotDecideWords(g) {
  const who = decidersWords(g);
  return who ? `You can see what waits here. It is ${who}.` : 'You can see what waits here. The owner can give your role "Approve what shows on your site" on the Team tab.';
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
