// src/account/variablesWords.js
//
// The pure words and rules of the Environment variables card (2026-11-14, Cameron: paste a key, name it, it is Key
// Vaulted, and anything calls it up by name like an env var; the owner alone sees and uses it until the owner allows;
// an owner-ticked approval on use). No DOM here, so it is tested on its own (tests/variables-words.test.mjs).

/** The platform's name rule, mirrored for the preview under the Name box: upper case, letters, digits, underscores, a letter first. */
export function nameOf(raw) {
  const n = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^_+/, '').slice(0, 64);
  return /^[A-Z][A-Z0-9_]*$/.test(n) ? n : '';
}

/** The name a provider's key is usually given; the person may change it. */
const SUGGESTED = {
  openai: 'OPENAI_API_KEY', google: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', 'openai-compatible': 'MODEL_API_KEY',
  stripe: 'STRIPE_SECRET_KEY', twilio: 'TWILIO_AUTH_TOKEN', shippo: 'SHIPPO_API_TOKEN', github: 'GITHUB_TOKEN',
  godaddy: 'GODADDY_TOKEN', cloudflare: 'CLOUDFLARE_API_TOKEN', turnstile: 'TURNSTILE_SECRET_KEY'
};
export function suggestedName(providerId) { return SUGGESTED[String(providerId || '').toLowerCase()] || ''; }

/** The providers the form offers: every catalog entry a person pastes a key for (never a sign-in one), then "other". */
export function providerChoices(catalog) {
  const out = (Array.isArray(catalog) ? catalog : [])
    .filter(p => p && p.id && !p.managedOnly && (p.fields || []).some(f => f && f.secret) && p.id !== 'microsoft')
    .map(p => ({ id: p.id, label: p.label || p.id, fields: (p.fields || []).filter(f => f && !f.secret), secret: (p.fields || []).find(f => f && f.secret) || null, receivesData: !!p.receivesData }));
  out.push({ id: 'other', label: 'Another service: a key for an address you name', fields: [], secret: null, receivesData: false });
  return out;
}

/** Who may use a variable, in words: the owner always; the roles and people the owner allowed. */
export function allowWords(allow, { people = null } = {}) {
  const roles = Array.isArray(allow?.roles) ? allow.roles : [];
  const users = Array.isArray(allow?.users) ? allow.users : [];
  const parts = [];
  if (roles.length) parts.push(roles.map(r => ROLE_WORDS[r] || r).join(', '));
  if (users.length) parts.push(people && people.length ? users.map(u => people.find(p => p.userId === u)?.email || 'one person').join(', ') : `${users.length} ${users.length === 1 ? 'person' : 'people'}`);
  return parts.length ? `You and ${parts.join(' and ')}` : 'Only you';
}
const ROLE_WORDS = { admin: 'admins', developer: 'developers', member: 'members', agent: 'the live agent' };
export const ALLOW_ROLES = Object.freeze([['admin', 'Admins'], ['developer', 'Developers'], ['member', 'Members']]);

/** The sentence under a row: where it was used and how often. */
export function useWords(v, fmtDate = (d) => String(d || '')) {
  const n = Number(v?.uses || 0);
  if (!n) return 'Never used yet.';
  const places = (Array.isArray(v?.bindings) ? v.bindings : []).filter(b => b && b.status === 'approved').length;
  const where = places ? ` in ${places} ${places === 1 ? 'place' : 'places'}` : '';
  return `Used ${n} ${n === 1 ? 'time' : 'times'}${where}, last ${fmtDate(v.lastUsedAt)}${v.lastUsedBy && v.lastUsedBy !== 'site' ? '' : v.lastUsedBy === 'site' ? ' by your site' : ''}.`;
}

/** A pending binding, in words for the owner: who waits, where. */
export function pendingWords(v) {
  const waiting = (Array.isArray(v?.bindings) ? v.bindings : []).filter(b => b && b.status === 'pending');
  if (!waiting.length) return '';
  return `${waiting.length} ${waiting.length === 1 ? 'use waits' : 'uses wait'} for your approval, under Requests on the Licensing tab.`;
}

/** The migration's sentence: what the platform would name, so the owner sees the names before it runs. */
export function migrationWords(plan) {
  const p = Array.isArray(plan) ? plan : [];
  if (!p.length) return '';
  const list = p.map(x => `${x.name}${x.hint ? ` (…${x.hint})` : ''}`).join(', ');
  return `${p.length} ${p.length === 1 ? 'key you already hold can be named' : 'keys you already hold can be named'}: ${list}.`;
}

/** What the form sends, checked the way the platform will check it; { ok, error, field } or { ok, body }. */
export function formBody({ name, value, provider, host, header, extra, allowRoles, requireApproval }) {
  const n = nameOf(name);
  if (!n) return { ok: false, field: 'name', error: 'A name is letters, digits and underscores, starting with a letter, like GEMINI_API_KEY.' };
  if (!String(value || '').trim()) return { ok: false, field: 'value', error: 'Paste the key.' };
  const p = String(provider || 'other').toLowerCase();
  const body = { name: n, value: String(value).trim(), provider: p, allow: { roles: Array.isArray(allowRoles) ? allowRoles : [], users: [] }, requireApproval: requireApproval === true };
  if (p === 'other') {
    const h = String(host || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return { ok: false, field: 'host', error: 'Where it may be sent is a host name, like api.example.com.' };
    body.host = h;
    body.header = String(header || '').trim() || 'Authorization';
  } else if (extra && typeof extra === 'object') {
    const missing = Object.entries(extra).find(([, v]) => !String(v || '').trim());
    if (missing) return { ok: false, field: missing[0], error: `${missing[0]} is required.` };
    body.fields = Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v).trim()]));
  }
  return { ok: true, body };
}
