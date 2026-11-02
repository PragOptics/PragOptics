// src/account/rowMail.js
//
// A SUBMISSION ROW'S MAIL OUTCOME, IN WORDS (2026-11-02, Cameron: "the rows need status for sent or not, and to user and
// team most likely"). Pure: a Data row's record in, the words out. Two generations of record are read:
//   - record.mail, written by the public door after its sends (backend auth/publicDoors.js submit; the plan
//     _local/LICENSING-TAB-2026-11-02.md H): { from, team: part, visitor: part } where a part is { to: [..], at } when it
//     went, { held: why } when the platform held it, { none: why } when there was nothing to send;
//   - before that, record.mailHeld alone (why nothing was mailed), or nothing at all on a row that was mailed, or made
//     before any mailer existed. The words promise exactly as much as the row says.

/** Why the platform held a mail, in words (the door's own held names). */
export const HELD_WORDS = Object.freeze({
  'no-mailer': 'no mailer in the environment yet',
  'environment-day': "the environment's mails for the day were used up",
  'platform-day': "the platform's mails for the day were used up",
  'not-allowed': 'Microsoft has not let PragOptics send from the mailer yet',
  'mailbox-gone': 'the mailer is no longer in your Microsoft tenant',
  'not-connected': "your Microsoft tenant's approval of PragOptics is gone",
  'send-failed': 'Microsoft did not take the message'
});
/** A note the door leaves beside the outcome, in words. */
export const NOTE_WORDS = Object.freeze({
  'mailer-fallback': "sent from the environment's default mailer: the one the form named is gone"
});
/** Why there was nothing to send, in words. */
export const NONE_WORDS = Object.freeze({
  'no-recipient': 'nobody to tell: the form names no recipient',
  'no-email': 'the message carried no email address',
  off: 'confirmations are off for this form'
});
export function heldWords(code) { const c = String(code || ''); return HELD_WORDS[c] || (c ? `held (${c})` : ''); }
export function noneWords(code) { const c = String(code || ''); return NONE_WORDS[c] || (c ? `not sent (${c})` : ''); }

function partOf(p) {
  if (!p || typeof p !== 'object') return { state: 'unknown', to: [], at: '', why: '' };
  const to = Array.isArray(p.to) ? p.to.map(String).filter(Boolean) : p.to ? [String(p.to)] : [];
  if (p.at) return { state: 'sent', to, at: String(p.at), why: '' };
  if (p.held) return { state: 'held', to, at: '', why: String(p.held) };
  if (p.none) return { state: 'none', to, at: '', why: String(p.none) };
  return { state: 'unknown', to, at: '', why: '' };
}

/** The row's mail outcome: { known, from, team, visitor }; known is false when the row says nothing about mail. */
export function mailOf(record) {
  const r = record && typeof record === 'object' ? record : {};
  const m = r.mail;
  if (m && typeof m === 'object') return { known: true, from: String(m.from || ''), note: String(m.note || ''), team: partOf(m.team), visitor: partOf(m.visitor) };
  if (r.mailHeld) { const held = { state: 'held', to: [], at: '', why: String(r.mailHeld) }; return { known: true, from: '', note: '', team: held, visitor: { ...held } }; }
  return { known: false, from: '', note: '', team: partOf(null), visitor: partOf(null) };
}

/** A few words for a table cell: "team sent · submitter sent", "held: no mailer in the environment yet", '' when unknown. */
export function mailShort(record) {
  const m = mailOf(record);
  if (!m.known) return '';
  if (m.team.state === 'held' && m.visitor.state !== 'sent') return `held: ${heldWords(m.team.why)}`;
  const parts = [];
  if (m.team.state === 'sent') parts.push('team sent'); else if (m.team.state === 'held') parts.push('team held');
  if (m.visitor.state === 'sent') parts.push('submitter sent'); else if (m.visitor.state === 'held') parts.push('submitter held');
  return parts.join(' · ') || 'nothing mailed';
}

/** The lines for a row's detail: [{ label, text, at }], at as the record gave it (ISO) for the caller to format. */
export function mailLines(record) {
  const m = mailOf(record);
  if (!m.known) return [];
  const line = (label, p) => {
    if (p.state === 'sent') return { label, text: p.to.length ? `Sent to ${p.to.join(', ')}` : 'Sent', at: p.at };
    if (p.state === 'held') return { label, text: `Held: ${heldWords(p.why)}`, at: '' };
    if (p.state === 'none') return { label, text: `Not sent: ${noneWords(p.why)}`, at: '' };
    return null;
  };
  const note = m.note ? { label: 'Note', text: NOTE_WORDS[m.note] || m.note, at: '' } : null;
  return [m.from ? { label: 'From', text: m.from, at: '' } : null, line('Team', m.team), line('Submitter', m.visitor), note].filter(Boolean);
}
