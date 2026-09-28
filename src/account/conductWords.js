// src/account/conductWords.js
//
// THE COMMUNITY STANDARDS' CATEGORIES (2026-09-24, decision 27): one key each, the words a person reads. The same
// seven as the backend (auth/emailTemplatesConduct.js CATEGORIES); the report form, the Needs attention desk and the
// operator's Community standards window all read them from here.
export const CONDUCT_CATEGORIES = Object.freeze([
  ['illegal', 'Illegal content'],
  ['piracy', "Piracy or other copying of someone else's work"],
  ['hate', 'Hate speech attacking people for who they are'],
  ['violence', 'Threats, harassment, or promoting violence or terrorism'],
  ['minors', 'Sexual content involving a minor'],
  ['abuse', 'Malware, phishing, fraud or spam'],
  ['private', "Someone's private information published without their consent"]
]);

/** The words for a key, or '' for one that is not a category. */
export function conductWords(key) {
  const hit = CONDUCT_CATEGORIES.find(([k]) => k === String(key || ''));
  return hit ? hit[1] : '';
}

/** A select's options, `chosen` selected, each value and word escaped by the caller's escape function. */
export function categoryOptionsHtml(esc, chosen = '', { placeholder = '' } = {}) {
  const head = placeholder ? `<option value="" ${chosen ? '' : 'selected'} disabled>${esc(placeholder)}</option>` : '';
  return head + CONDUCT_CATEGORIES.map(([k, w]) => `<option value="${esc(k)}" ${k === chosen ? 'selected' : ''}>${esc(w)}</option>`).join('');
}
