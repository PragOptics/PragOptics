// src/account/dataPolicy.js
//
// WHO SEES A TABLE AND WHO CHANGES ITS ROWS, IN WORDS (2026-11-03, the build plan D10 and D11; Cameron: who views
// which data by role, and some data locked from the studio's writes with an owner override behind a humanized line).
// Pure: the listing GET v1/environment/data answers each table with { policy: { read, write, formFed, studioWrite },
// owner: { installId, label } | null, canRead, canWrite }; this turns that into the card's words, the owner's choices
// and the sentences a refusal gets. A listing without a policy (a backend that does not answer it yet) gives null here
// and the card reads exactly as before.
//
// Levels are the team's roles (tenantPolicy RANK): read viewer | member | developer | admin | owner, write member |
// developer | admin | owner. formFed is derived by the server from the form that fills the table; the owner sets only
// studioWrite (the override), never formFed.

export const READ_LEVELS = Object.freeze(['viewer', 'member', 'developer', 'admin', 'owner']);
export const WRITE_LEVELS = Object.freeze(['member', 'developer', 'admin', 'owner']);
export const DEFAULT_POLICY = Object.freeze({ read: 'viewer', write: 'member', formFed: false, studioWrite: true });

/** Who a level lets in, as the subject of a sentence. */
const WHO = Object.freeze({
  viewer: 'Everyone on the team', member: 'Members, developers, admins and the owner', developer: 'Developers, admins and the owner',
  admin: 'Admins and the owner', owner: 'Only the owner'
});
/** The same people after "by": "seen by members and above". */
const BY = Object.freeze({ viewer: 'everyone on the team', member: 'members and above', developer: 'developers and above', admin: 'admins and the owner', owner: 'the owner only' });
/** A level's word in the owner's pick. */
const PICK = Object.freeze({ viewer: 'Everyone on the team', member: 'Members and above', developer: 'Developers and above', admin: 'Admins and the owner', owner: 'The owner only' });

function level(v, allowed, fallback) { const s = String(v || '').toLowerCase(); return allowed.includes(s) ? s : fallback; }

/** The table's policy from the listing with the defaults filled; null when the listing carries none (then nothing about access is said). */
export function policyOf(table) {
  const p = table && table.policy;
  if (!p || typeof p !== 'object') return null;
  const formFed = p.formFed === true;
  return {
    read: level(p.read, READ_LEVELS, DEFAULT_POLICY.read),
    write: level(p.write, WRITE_LEVELS, DEFAULT_POLICY.write),
    formFed,
    studioWrite: typeof p.studioWrite === 'boolean' ? p.studioWrite : !formFed
  };
}
/** The form (module install) that fills the table, by its name; '' when the listing names none. */
export function formOf(table) { const o = table && table.owner; return o && typeof o === 'object' && o.label ? String(o.label) : ''; }
/** The listing's own answer for this caller; a listing without one (today's backend) reads as readable. */
export function tableCanRead(table) { return !(table && table.canRead === false); }
/** The listing's canWrite when it carries one, else the caller's fallback (today's role-level canWrite()). */
export function tableCanWrite(table, fallback) { return table && typeof table.canWrite === 'boolean' ? table.canWrite : !!fallback; }

export function readSentence(l) { return `${WHO[level(l, READ_LEVELS, 'viewer')]} can see this table.`; }
export function writeSentence(l) { return `${WHO[level(l, WRITE_LEVELS, 'member')]} can change its rows.`; }
export function seenBy(l) { return `Seen by ${BY[level(l, READ_LEVELS, 'viewer')]}`; }
export function changedBy(l) { return `Rows changed by ${BY[level(l, WRITE_LEVELS, 'member')]}`; }
/** The owner's pick for one level: [{ value, label }]. */
export function levelOptions(kind) { return (kind === 'write' ? WRITE_LEVELS : READ_LEVELS).map(v => ({ value: v, label: PICK[v] })); }
/** "Filled by Reviews on your website". */
export function filledBy(form) { return `Filled by ${form || 'a form'} on your website`; }
/** The override's sentence (D11, Cameron: "you sure you want to do this, it affects something that your website generates"). */
export function formFedSentence(form) {
  return `This table is filled by ${form || 'a form'} on your website. Rows here are what your site shows and what your team is told about. Rewriting them by hand changes that.`;
}
/** What the lock means now: '' when the table is not filled by a form. */
export function lockWords(policy) {
  if (!policy || !policy.formFed) return '';
  return policy.studioWrite ? 'Rows may be rewritten by hand or by the studio.' : 'Rows are decided from Approvals, not rewritten.';
}
/** The line under a table in the list: who sees it, what fills it, whether it is locked. '' without a policy. */
export function tableLine(table) {
  const p = policyOf(table);
  if (!p) return '';
  const parts = [tableCanRead(table) ? seenBy(p.read) : `${seenBy(p.read)}, not by your role`];
  if (p.formFed) {
    parts.push(`filled by ${formOf(table) || 'a form'} on your website`);
    if (!p.studioWrite) parts.push('not rewritten by hand');
  }
  return parts.join(' · ');
}
/** The sentence a refusal by the table's policy gets; '' for any other code. `data` is the server's body (needs, form). */
export function refusalWords(code, data = {}, fallbackForm = '') {
  const d = data && typeof data === 'object' ? data : {};
  const c = String(code || '');
  if (c === 'TABLE_READ_DENIED') return `${d.needs ? `${readSentence(d.needs)} Your role is not among them.` : 'Your role cannot see this table.'} The owner sets who sees it from this table on the Data card.`;
  if (c === 'TABLE_WRITE_DENIED') return `${d.needs ? `${writeSentence(d.needs)} Your role is not among them.` : 'Your role cannot change rows in this table.'} The owner sets who changes rows from this table on the Data card.`;
  if (c === 'TABLE_FORM_FED') {
    const form = String(d.form || fallbackForm || 'a form');
    return `This table is filled by ${form} on your website. Rows here are what your site shows and what your team is told about, so a row is decided from Approvals, not rewritten. The owner can allow rewriting with the switch above the rows.`;
  }
  return '';
}
/** The words when the owner's save is refused: a lane without the route yet (404), not the owner, a paused environment, else the fallback. */
export function policySaveWords(status, code, fallback) {
  if (Number(status) === 404) return 'This lane cannot set who sees a table yet.';
  if (code === 'OWNER_ONLY') return 'Only the owner sets who sees a table.';
  if (code === 'SUSPENDED') return 'This environment is paused. Nothing in it can be changed.';
  return fallback || 'Could not save who sees this table.';
}
