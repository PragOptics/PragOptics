// src/account/mailRouting.js
//
// WHO A FORM TELLS, AND WHO DECIDES (2026-11-03; the plan _local/BUILD-PLAN-2026-11-03.md D1 to D5). The Mail card on the
// Environment tab says, per form and per mailer, who hears about a message and who may approve a row that waits. The
// rules are the platform's own, mirrored here in words so the card says what the server will do; the server stays the
// judge at send time. Pure: forms, mailers and members in; words and request bodies out. No DOM, no fetch.
//
//   D1  the roles a person may name: owner, admin, developer, member, viewer. Never agent (a service seat is not the team).
//   D2  a form that names any of its own people or roles uses its own; else the mailer's; else the owner.
//   D3  a role is expanded at send time against the ACTIVE team; here only to count and to name who that is today.
//   D5  a form may name its approvers (roles and people); the owner always decides; a form that names none falls to the
//       environment's rule: the owner and every role that holds "Approve what shows on your site".

export const ROLE_WORDS = Object.freeze(['owner', 'admin', 'developer', 'member', 'viewer']);
const APPROVE = 'approve_content';

const low = v => String(v == null ? '' : v).trim().toLowerCase();
const uniq = a => [...new Set(a)];

/** Role words out of anything: lower, deduped, only the five a person may name (agent and junk fall away). */
export function roleList(list) {
  const a = Array.isArray(list) ? list : (list == null || list === '' ? [] : String(list).split(/[\s,;]+/));
  return uniq(a.map(low).filter(r => ROLE_WORDS.includes(r)));
}

/** Addresses out of anything: lower, trimmed, deduped, only what holds an @. */
export function emailList(list) {
  const a = Array.isArray(list) ? list : (list == null || list === '' ? [] : String(list).split(/[\s,;]+/));
  return uniq(a.map(low).filter(x => x.includes('@')));
}

/** Approvers as the setting holds them (role words and addresses in one list) split into the two. */
export function parseApprovers(list) {
  return { roles: roleList(list), people: emailList(list) };
}

/** The team a mailer may tell: ACTIVE members with an address, never the agent seat; the owner first, then by address. */
export function teamOf(members) {
  const list = Array.isArray(members) ? members : (members && Array.isArray(members.members) ? members.members : []);
  return list
    .filter(m => m && m.email && low(m.status || 'ACTIVE') === 'active' && low(m.role) !== 'agent')
    .map(m => ({ email: low(m.email), role: low(m.role) || 'member', userId: String(m.userId || '') }))
    .sort((x, y) => (y.role === 'owner') - (x.role === 'owner') || x.email.localeCompare(y.email));
}

/** The addresses a list of roles reaches today: the team's members whose role is named (D3, as the door expands it). */
export function expandRoles(roles, members) {
  const want = new Set(roleList(roles));
  if (!want.size) return [];
  return uniq(teamOf(members).filter(m => want.has(m.role)).map(m => m.email));
}

/** How many of the team hold each role word, for the pickers ("admin · 2"). */
export function roleCounts(members) {
  const out = {};
  for (const r of ROLE_WORDS) out[r] = 0;
  for (const m of teamOf(members)) if (m.role in out) out[m.role] += 1;
  return out;
}

/** A mailer as the mailers route answers it, in one shape, whatever the lane's backend knows: its people, its roles, its switch. */
export function mailerRecord(m) {
  if (!m || typeof m !== 'object') return null;
  return {
    address: low(m.address), displayName: String(m.displayName || m.name || ''),
    notify: emailList(m.notify), notifyRoles: roleList(m.notifyRoles),
    confirmVisitor: m.confirmVisitor !== false,
    hasRoles: Array.isArray(m.notifyRoles)   // false on a lane whose backend does not keep roles yet
  };
}

/**
 * Who hears about a form's messages (D2): the form's own people and roles when it names any, else the mailer's, else
 * the owner. `expanded` is who that reaches today: the people named, then the roles expanded against the team.
 */
export function toldBy(form, mailer, members) {
  let people = emailList(form && form.notifyTo), roles = roleList(form && form.notifyRoles), source = 'form';
  if (!people.length && !roles.length) {
    const m = mailer && typeof mailer === 'object' ? mailer : null;
    people = emailList(m && m.notify); roles = roleList(m && m.notifyRoles);
    source = people.length || roles.length ? 'mailer' : 'owner';
  }
  return { source, people, roles, expanded: uniq([...people, ...expandRoles(roles, members)]) };
}

/** Whether the submitter gets a copy (the form's own switch when set, else the mailer's), and whose switch that is. */
export function confirmsOf(form, mailer) {
  const own = form ? form.confirmVisitor : null;
  if (own === true || own === false) return { value: own, source: 'form' };
  const m = mailer && typeof mailer === 'object' ? mailer : null;
  return { value: m ? m.confirmVisitor !== false : true, source: m ? 'mailer' : 'default' };
}

/** A role as the sentence says it: "the owner", "every admin". */
export function roleWord(role) {
  const r = low(role);
  return r === 'owner' ? 'the owner' : `every ${r}`;
}

/** "a and b", "a, b and c" (domainFamilies.listWords, kept here so this module stays on its own). */
export function listWords(items) {
  const a = (items || []).filter(Boolean);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

/** Who is told, in words: "ops@site and every admin"; nobody named: "the owner". Takes toldBy's shape ({ people, roles }) or a mailer's ({ notify, notifyRoles }). */
export function whoWords(x = {}) {
  const people = x && x.people != null ? x.people : (x && x.notify) || [];
  const roles = x && x.roles != null ? x.roles : (x && x.notifyRoles) || [];
  const parts = [...emailList(people), ...roleList(roles).map(roleWord)];
  return parts.length ? listWords(parts) : 'the owner';
}

/**
 * Who decides a form's waiting rows (D5): the form's own approvers when it names any (the owner always among them),
 * else the environment's rule, the owner and every role whose scopes hold "Approve what shows on your site"
 * (`scopeRoles` is GET v1/tenant/scopes `roles`: { admin: [ids], developer: [ids], member: [ids] }).
 */
export function decidersOf(form, members, scopeRoles, ownerEmail = '') {
  const own = parseApprovers(form && form.approvers);
  const named = own.roles.length > 0 || own.people.length > 0;
  const roles = named ? own.roles : Object.entries(scopeRoles && typeof scopeRoles === 'object' ? scopeRoles : {}).filter(([, ids]) => Array.isArray(ids) && ids.includes(APPROVE)).map(([r]) => low(r)).filter(r => ROLE_WORDS.includes(r));
  const people = named ? own.people : [];
  const owner = low(ownerEmail);
  return { named, roles, people, emails: uniq([owner, ...expandRoles(roles, members), ...people].filter(Boolean)) };
}

/** Who decides, in words: always the owner first: "the owner", "the owner and every admin", "the owner, every admin and ops@site". */
export function decidersWords(d) {
  const roles = roleList(d && d.roles).filter(r => r !== 'owner');
  const people = emailList(d && d.people);
  return listWords(['the owner', ...roles.map(roleWord), ...people]);
}

/**
 * Who decides, from the server's own list (GET v1/environment/approvals, a group's `deciders`: the owner and the people
 * the install's approvers reach today, ACTIVE members only, never the agent): "the owner, ops@site and dev@site". The
 * owner's address is said as "the owner", first; without the owner's address the addresses are said as they are.
 */
export function namedDecidersWords(emails, ownerEmail = '') {
  const owner = low(ownerEmail);
  const list = emailList(emails);
  if (!owner) return list.length ? listWords(list) : 'the owner';
  return listWords(['the owner', ...list.filter(x => x !== owner)]);
}

/**
 * The tags on a form's head: where it sends from, whether it confirms, whether its rows wait, its intent word, off.
 * [{ word, cls }], cls one of the card's tag states ('' | is-verified | is-pending | is-primary | is-bad).
 * `from` is the address as the server resolves it; it reads "(the default)" whenever that is the default and the form's
 * own pick is not it (nothing picked, or a mailer the environment no longer holds). `unknown`: the mailers could not be
 * read (a viewer), so the tag names the mailer without saying which.
 */
export function formTags(form, { from = '', confirms = true, dflt = '', unknown = false } = {}) {
  const out = [];
  const own = low(form && form.mailer);
  if (unknown) out.push({ word: own ? `from ${own}` : 'from its mailer', cls: '' });
  else if (from) out.push({ word: `from ${from}${dflt && from === dflt && own !== from ? ' (the default)' : ''}`, cls: '' });
  else out.push({ word: 'no mailer', cls: 'is-bad' });
  out.push(confirms ? { word: 'confirms', cls: 'is-verified' } : { word: 'no confirmation', cls: '' });
  if (form && form.waits) out.push({ word: 'waits for a decision', cls: 'is-pending' });
  if (form && form.intent) out.push({ word: form.intent, cls: 'is-primary' });
  if (form && form.enabled === false) out.push({ word: 'off', cls: '' });
  return out;
}

/**
 * The install's settings body for one Save (D6: one PUT v1/environment/modules/{installId} { settings }): the mailer
 * ('' is the environment's), the people and roles told, the submitter's switch ('' follows the mailer), the approvers
 * (roles and people in one list, as the setting holds them).
 * `people: null` means the team could not be read, so no people were shown: notify_to is left out of the body and the
 * server keeps what is stored (it merges the settings sent over the ones it holds). The approvers are one list, so
 * `approverPeople` then carries the addresses already stored, sent back unchanged beside the roles picked.
 * `recipient` is the form's older one-address setting, shown ticked among its people (mailerUse.js formsOf): the merge
 * would keep it and the door would go on mailing it, so a person unticked who is that address sends recipient '' too.
 * `recipientHold` (mailerUse.js recipientHold) says when '' cannot empty it: the server reads '' as not sent and takes the
 * manifest's default ('default') or refuses the whole save ('required'). Then no recipient is sent and the card keeps that
 * person ticked and fixed (recipientHoldWords says where it is changed).
 */
export function settingsFor({ mailer = '', people = [], roles = [], confirm = '', approverRoles = [], approverPeople = [], recipient = '', recipientHold = '' } = {}) {
  const c = String(confirm == null ? '' : confirm).toLowerCase();
  const older = low(recipient);
  const told = people === null ? null : emailList(people);
  return {
    mailer: low(mailer),
    ...(told === null ? {} : { notify_to: told }),
    ...(told !== null && !recipientHold && older.includes('@') && !told.includes(older) ? { recipient: '' } : {}),
    notify_roles: roleList(roles),
    confirm_visitor: c === 'true' || c === 'false' ? c : '',
    approvers: uniq([...roleList(approverRoles), ...emailList(approverPeople)])
  };
}

/**
 * Whether a Save changes who decides (then the Mail card reads GET approvals again, the review of 2026-11-03): the
 * approvers sent against the ones the install's own setting held. A manifest's default is no setting, so a form that
 * followed it and now names anyone has changed; sending none again has not.
 */
export function approversChanged(form, settings) {
  const had = new Set(form && form.approversFrom === 'setting' && Array.isArray(form.approvers) ? form.approvers.map(low) : []);
  const now = new Set((settings && Array.isArray(settings.approvers) ? settings.approvers : []).map(low));
  return had.size !== now.size || [...now].some(x => !had.has(x));
}

/**
 * Why the form's own older recipient stays ticked on the card when a Save cannot empty it (mailerUse.js recipientHold),
 * and where it is changed: the studio, the form's block, Settings (PragOpticsUI inspector.js, openModuleSettings). '' when
 * it can be unticked. `label` is the manifest's word for the setting ("Send to").
 */
export function recipientHoldWords(address, hold, label = '') {
  const a = low(address);
  if (!a || (hold !== 'required' && hold !== 'default')) return '';
  const name = String(label || '').trim() || 'recipient';
  const why = hold === 'required' ? 'which the form needs' : 'which goes back to the form\'s own default when emptied';
  return `${a} is this form's own "${name}", ${why}, so it is not changed here. Change it in the studio: select the form on its page, then Settings.`;
}

/** The mailer's body for one Save: PUT v1/environment/mailers/{address} { notify, notifyRoles, confirmVisitor }; `people: null` (the team unread) leaves notify out so the stored people stay. */
export function mailerBodyFor({ people = [], roles = [], confirm = true } = {}) {
  return { ...(people === null ? {} : { notify: emailList(people) }), notifyRoles: roleList(roles), confirmVisitor: !!confirm };
}

/**
 * The keys a lane's backend dropped from a save (an older lane keeps no roles): the ones sent with a value whose answer
 * lacks them. '' when nothing was lost; else the sentence the card says once.
 */
export function lostWords(sent, answered, keys = ['notify_roles', 'approvers']) {
  const s = sent && typeof sent === 'object' ? sent : {};
  const a = answered && typeof answered === 'object' ? answered : {};
  const lost = keys.filter(k => Array.isArray(s[k]) && s[k].length > 0 && !(k in a));
  return lost.length ? 'This lane does not keep roles yet.' : '';
}
