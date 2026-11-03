// src/account/mailCard.js
//
// THE MAIL CARD (2026-11-03; the plan _local/BUILD-PLAN-2026-11-03.md D6 and D8; the definition
// _local/APPROVALS-MAIL-DEFINITION-2026-11-02.md "Mail routing: one table answers it"). ONE card "Mail" on the
// Environment tab, between Data and Connected accounts: who sends, from which mailer, who is told, whether the
// submitter gets a copy, who decides a row that waits, and the look every message is framed in. The Licensing tab's
// Mailers card keeps the Microsoft side only (approve, permission, check, new mailer, Send a test) and points here.
//
// Top to bottom:
//   Your mailers   one container per mailer (the defaults): "Tells a, b and every admin · confirms to the sender", a pencil
//                  opens the people, the roles and the switch; Save -> PUT v1/environment/mailers/{address}
//   Your forms     one container per install with the submissions door: its name and tags (from which mailer, confirms,
//                  waits for a decision, its intent word), one sentence, a pencil opens Send from, Tell (people and roles),
//                  Confirm (three ways), Who decides (roles and people); Save -> ONE PUT v1/environment/modules/{installId} { settings }
//   The look       one container per published site: where its look comes from (set by you, follows the website, the
//                  default), "Follow the website" as a switch, the fields when the owner sets a look, Save -> PUT
//                  v1/environment/publish/{slug}/theme, "Back to the website's look" -> DELETE, and the real frame in a
//                  sandboxed preview from GET .../theme/preview (the server draws the frame; nothing is drawn twice).
//
// Reads, once per load (environment.js loadNow, beside the other cards): GET v1/environment/modules, v1/environment/mailers
// (the live lane, a connected tenant; else the card says where mailers are made), v1/tenant/members (when the team is
// readable), v1/tenant/scopes (member and above). The published sites come from the Domains card's read on live. Who
// decides a form's waiting rows comes from the tab's one read of GET v1/environment/approvals (environment.js
// loadDecisions, X.decisions): the group's own deciders when the lane answers them, else this card's reading. A Save that
// changes who decides reads it again (X.reloadDecisions, one read); until that lands the form reads this card's reading of
// what was saved, never the deciders from before the Save.
//
// EVERY READ DEGRADES: a lane whose backend keeps no roles, approvers, intent or theme yet answers without them; the
// pickers paint empty, a save still works, and the card says once when the answer lacked what was sent.
//
// THE NOTES FOLLOW THE TICKS (the live pass of 2026-11-03, defect 2): under a form's Tell boxes, under its Who decides and
// at the foot of a mailer's editor, one line says what a Save would do with the boxes as ticked now ("Tells the owner.",
// "Decided by the owner and every admin.", "Tells ops@site · confirms to the sender."), in the words of the saved line;
// with no mailer the form would send from it says nothing is sent (toldNote), and the Confirm select's first option names
// the switch of the mailer the Send from pick would send from (asMailerWords), the review of 2026-11-03.
// The editor's picks are read once (formPicks, mailerPicks) for both the Save and the notes (editorNow), so they never differ.
//
// The rules in words live in mailRouting.js and mailTheme.js (pure, tested); this file is the DOM and the requests.

import { PRAG_API_BASE } from '../runtime/config.js';
import { accessToken } from '../runtime/session.js';
import { explainLink } from '../components/explainer.js';
import { iconBtn, leadBtn, stateLead, stateIcon, armed } from './cards.js';
import { formsOf, resolvedMailer } from './mailerUse.js';
import { ROLE_WORDS, emailList, teamOf, roleCounts, mailerRecord, toldBy, confirmsOf, whoWords, roleWord, decidersOf, decidersWords, namedDecidersWords, formTags, settingsFor, mailerBodyFor, lostWords, recipientHoldWords, approversChanged, tellsWords, toldNote, asMailerWords, approveRoles, mailerLine, mailerAfter, formAfter, decidersChanged, decideNote } from './mailRouting.js';
import { FONTS, FONT_WORDS, MAX_LOGO, themeOf, sourceOf, validTheme, themeChanges, themeAfterSave, siteGoneWords, themeWords, themeTag } from './mailTheme.js';
import { countWord } from '../ui/words.js';

const ENV_URL = `${PRAG_API_BASE}/environment`;
const TENANT_URL = `${PRAG_API_BASE}/tenant`;
const SCOPE_ROLES = new Set(['owner', 'admin', 'developer', 'member', 'agent']);   // GET v1/tenant/scopes answers member and above (team.js)
const THEME_FIELDS = [
  ['brandName', 'Name', 'text'], ['logoUrl', 'Logo (https address)', 'url'],
  ['primaryColor', 'Colour', 'color'], ['background', 'Background', 'color'], ['textColor', 'Text colour', 'color'],
  ['fontFamily', 'Font', 'font'], ['footerWords', 'Footer words', 'textarea']
];

let D = null;   // the panel's shared helpers (account.js teamDeps)
let X = null;   // the Environment tab's context: url, body, cardHtml, canWrite, myRole, lane, view, sites, siteName
const mc = {};
function fresh() {
  Object.assign(mc, {
    forms: null, formsErr: '', mailers: null, dflt: '', sendProvenAt: null, mailersNote: '', mailersLink: false, mailersUnknown: false,
    team: null, teamErr: '', scopes: null, sites: null, sitesErr: '',
    edit: '', editMailer: '', busy: '', err: {}, note: '', noteBad: false, theme: {},
    // the installs whose approvers a Save changed since the tab last read who decides: their line reads the card's own reading
    stale: new Set()
  });
}
fresh();

/** environment.js hands over its helpers once per render and once per bind; the card never reads the tab's state on its own. */
export function setMailContext(deps, ctx) { D = deps; X = ctx; }
export function resetMail() { fresh(); }
/** The tab's read of who decides landed (environment.js loadDecisions): the card repaints, unless an editor is open (a repaint would drop its unsaved picks; the next paint reads it anyway). */
export function decisionsArrived() {
  mc.stale.clear();
  if (mc.edit || mc.editMailer || Object.values(mc.theme).some(t => t && t.open)) return;
  paintMail();
}

function setNote(text, bad = false) { mc.note = text || ''; mc.noteBad = !!bad; }
function words(ex, fallback) { return ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback)); }
function code(ex) { return String(ex?.data?.code || ''); }
function busyState(key, busyWord) { const mine = mc.busy === key; return { out: mine, busyWord, waiting: mc.busy && !mine ? 'Waiting for the other save' : '' }; }
function mailerOf(address) { return (mc.mailers || []).find(m => m.address === String(address || '').toLowerCase()) || null; }
function ownerEmail() { return String(X?.view?.()?.tenant?.ownerEmail || '').toLowerCase(); }
/** Where mailers are made: the Mailers card on the Licensing tab (licensingExchange.js, New mailer; account.js CARD_IDS licensing.mailers). */
const MAIL_CARD_LINK = '<a class="acct-inline-link" href="#account?section=licensing&card=mailers" data-acct-section="licensing" data-acct-card="mailers">the Licensing tab, Mailers</a>';
/** Whether the team was read, so people could be shown and picked; false means the stored people are kept untouched by a save. */
function teamKnown() { return Array.isArray(mc.team); }

/* ---------- the reads ---------- */

export async function loadMail() {
  if (!X || !D) return;
  const view = X.view() || {};
  const live = X.lane() === 'live';
  const readsTeam = !!view.canReadTeam;
  const readsScopes = SCOPE_ROLES.has(X.myRole());
  const [ms, fs, mem, sc, st] = await Promise.allSettled([
    live ? D.apiFetch(X.url(`${ENV_URL}/mailers`)) : Promise.reject(Object.assign(new Error('sandbox'), { data: { code: 'LIVE_LANE_ONLY' } })),
    D.apiFetch(X.url(`${ENV_URL}/modules`)),
    readsTeam ? D.apiFetch(X.url(`${TENANT_URL}/members`)) : Promise.resolve(null),
    readsScopes ? D.apiFetch(X.url(`${TENANT_URL}/scopes`)) : Promise.resolve(null),
    // on live the Domains card reads the published sites (environment.js loadDomains) and paints this card after; the sandbox reads its own
    live ? Promise.resolve(null) : D.apiFetch(X.url(`${ENV_URL}/publish`))
  ]);
  if (ms.status === 'fulfilled' && ms.value && typeof ms.value === 'object') {
    mc.mailers = (Array.isArray(ms.value.mailers) ? ms.value.mailers : []).map(mailerRecord).filter(Boolean);
    mc.dflt = String(ms.value.default || '').toLowerCase();
    mc.sendProvenAt = ms.value.sendProvenAt || null;
    // no mailer yet answers an empty list (the route never asks whether a tenant is connected): the card says where one is
    // made and that the forms keep every message meanwhile, the same words as a refusal before a tenant
    mc.mailersNote = mc.mailers.length ? '' : 'No mailer yet. Make one on'; mc.mailersLink = !mc.mailers.length; mc.mailersUnknown = false;
  } else {
    mc.mailers = []; mc.dflt = ''; mc.mailersLink = false; mc.mailersUnknown = false;
    const c = code(ms.reason), s = ms.reason?.status;
    if (c === 'LIVE_LANE_ONLY') mc.mailersNote = 'Mailers belong to the live lane. A form on this lane sends from none.';
    else if (c === 'TENANT_NOT_CONNECTED' || s === 404 || s === 409) { mc.mailersNote = 'No mailer yet. Make one on'; mc.mailersLink = true; }
    // the mailers route is member and above: a viewer reads the forms and is told where mailers are set, not refused
    else if (s === 403 && !ms.reason?.sessionInvalidated) { mc.mailersNote = 'Mailers are set by a member of the team. Your forms still send through them.'; mc.mailersUnknown = true; }
    else { mc.mailersNote = words(ms.reason, 'Your mailers could not be read right now.'); mc.mailersUnknown = true; }
  }
  if (fs.status === 'fulfilled') { mc.forms = formsOf(fs.value); mc.formsErr = ''; }
  else { mc.forms = []; mc.formsErr = words(fs.reason, 'Your forms could not be read right now.'); }
  if (mem.status === 'fulfilled') { mc.team = mem.value ? teamOf(mem.value) : null; mc.teamErr = ''; }
  else { mc.team = null; mc.teamErr = words(mem.reason, 'The team could not be read right now.'); }
  mc.scopes = sc.status === 'fulfilled' && sc.value && typeof sc.value.roles === 'object' ? sc.value.roles : null;
  if (!live) {
    if (st.status === 'fulfilled') { mc.sites = (st.value?.sites || []).map(s => ({ slug: String(s.slug || ''), address: String(s.address || ''), project: String(s.project || ''), mailTheme: s.mailTheme || null })); mc.sitesErr = ''; }
    else { mc.sites = []; mc.sitesErr = st.reason?.status === 404 ? '' : words(st.reason, 'The published sites could not be read right now.'); }
  }
  paintMail();
}

/** The published sites this card speaks of: the Domains card's read on live (with their mailTheme), this card's own on the sandbox. */
function sites() { return X.lane() === 'live' ? X.sites() : mc.sites; }

/* ---------- the card ---------- */

export function paintMail() {
  const h = document.getElementById('evMail');
  if (!h || !D || !X) return;
  h.innerHTML = mailHtml();
  // the frame the server drew goes into its sandboxed box as a document, never as markup of this page
  for (const f of h.querySelectorAll('iframe[data-mail-preview]')) { const t = mc.theme[f.dataset.mailPreview]; if (t && t.preview) f.srcdoc = t.preview; }
  // an open editor's notes read the boxes as painted (a stored address the boxes cannot show is what a Save drops)
  for (const r of h.querySelectorAll('[data-mail-editor^="form:"], [data-mail-editor^="mailer:"]')) editorNow(r);
}

export function mailHtml() {
  const e = D.escapeHtml;
  const forms = mc.forms, mailers = mc.mailers;
  const summary = forms == null && mailers == null ? 'loading'
    : [forms ? countWord(forms.length, 'form', 'forms') : '', mailers && mailers.length ? countWord(mailers.length, 'mailer', 'mailers') : (mailers ? 'no mailer' : '')].filter(Boolean).join(' · ');
  const note = mc.note ? `<p class="acct-card-note ev-note ${mc.noteBad ? 'is-bad' : ''}" role="status">${e(mc.note)}</p>` : '';
  const body = forms == null && mailers == null
    ? '<p class="acct-loading">Reading your mail settings…</p>'
    : `${note}${mailersHtml()}${formsHtml()}${themesHtml()}`;
  return X.cardHtml({ key: 'mail', icon: 'mail', title: 'Mail', summary, explain: explainLink('licensing', 'What a mailer is'), body });
}

/* ---------- the mailers: the defaults ---------- */

function mailersHtml() {
  const e = D.escapeHtml;
  const list = mc.mailers || [];
  const head = '<h4 class="acct-card-sub ev-mail-sub">Your mailers</h4>';
  if (!list.length) {
    const line = mc.mailersLink ? `${e(mc.mailersNote)} ${MAIL_CARD_LINK}.` : e(mc.mailersNote || 'No mailer yet.');
    return `${head}<p class="lic-hint">${line}${mc.mailersLink ? ' Your forms still store every message; nothing is sent until a mailer exists.' : ''}</p>`;
  }
  const rows = list.map(m => {
    const line = mailerLine(m);
    const pencil = X.canWrite() && mc.editMailer !== m.address ? iconBtn('mail-mailer-edit', 'edit', `Change who ${m.address} tells`, `data-address="${e(m.address)}"`) : '';
    return `
      <div class="ev-mail-item" data-row="mailer:${e(m.address)}">
        <div class="ev-mail-head"><span class="ev-code ev-mail-name">${e(m.address)}</span>${m.address === mc.dflt ? '<span class="acct-tag is-verified">default</span>' : ''}${m.displayName ? `<span class="lic-state is-quiet">${e(m.displayName)}</span>` : ''}<span class="ev-mail-act">${pencil}</span></div>
        <p class="ev-mail-line">${e(line)}</p>
        ${mc.editMailer === m.address ? mailerEditHtml(m) : ''}
      </div>`;
  }).join('');
  return `${head}<p class="lic-hint">What each mailer tells and confirms by default. A form that names its own people or roles keeps them; the rest follow their mailer.${mc.sendProvenAt ? ` A test went out ${e(D.fmtDate(mc.sendProvenAt))}.` : ''}</p><div class="ev-mail-list">${rows}</div>`;
}

/** The people of the team as checkboxes (owner first), the five roles as checkboxes with how many hold each today. Without the team (unreadable, or a role that cannot list it) no box paints and the words say the people already named stay as they are: a save then leaves them untouched (teamKnown). */
function peopleBoxes(attr, picked, { note = '', fixed = '' } = {}) {
  const e = D.escapeHtml;
  const team = mc.team;
  if (!team) {
    const kept = (picked || []).length ? ` ${countWord((picked || []).length, 'person', 'people')} already named stay as they are: ${e((picked || []).join(', '))}.` : ' Anyone already named stays as they are.';
    return `<p class="lic-hint">${e(mc.teamErr || 'Your role cannot list the team; pick roles instead, or name people on the Team tab.')}${kept}</p>`;
  }
  if (!team.length) return '<p class="lic-hint">No team yet. Invite people on the Team tab; until then the owner hears.</p>';
  const set = new Set((picked || []).map(x => String(x).toLowerCase()));
  // `fixed`: the one address a Save cannot untick (the form's own recipient the manifest needs or defaults, mailerUse.js
  // recipientHold): ticked and disabled, and the note says where it is changed
  const keep = String(fixed || '').toLowerCase();
  const held = p => !!keep && p.email === keep;
  return `<div class="lic-tells-grid">${team.map(p => `<label class="lic-tell"><input type="checkbox" ${attr} value="${e(p.email)}" ${set.has(p.email) || held(p) ? 'checked' : ''} ${held(p) ? 'disabled' : ''}><span>${e(p.email)}</span><span class="lic-state is-quiet">${e(p.role)}</span></label>`).join('')}</div>${note ? `<p class="lic-hint">${e(note)}</p>` : ''}`;
}
function roleBoxes(attr, picked, { note = '', nowHtml = '' } = {}) {
  const e = D.escapeHtml;
  const counts = mc.team ? roleCounts(mc.team) : null;
  const set = new Set((picked || []).map(x => String(x).toLowerCase()));
  return `<div class="lic-tells-grid">${ROLE_WORDS.map(r => `<label class="lic-tell"><input type="checkbox" ${attr} value="${r}" ${set.has(r) ? 'checked' : ''}><span>${e(roleWord(r))}</span>${counts ? `<span class="lic-state is-quiet">${e(countWord(counts[r], 'person', 'people'))} today</span>` : ''}</label>`).join('')}</div>${nowHtml}${note ? `<p class="lic-hint">${e(note)}</p>` : ''}`;
}
function errLine(key) { const t = mc.err[key]; return t ? `<p class="acct-error ev-note" role="alert">${D.escapeHtml(t)}</p>` : ''; }
/** A note that follows the ticks (editorNow keeps it in step before Save): what a Save would do, in the saved line's words. */
function nowLine(kind, text) { return `<p class="lic-hint" data-mail-now="${kind}" aria-live="polite">${D.escapeHtml(text)}</p>`; }
/** The values of the boxes ticked under `root` that match `sel` (a box held ticked and disabled counts, as the Save counts it). */
function ticked(root, sel) { return [...root.querySelectorAll(`${sel}:checked`)].map(x => String(x.value || '')); }

function mailerEditHtml(m) {
  const e = D.escapeHtml;
  const key = `mailer:${m.address}`;
  return `
    <div class="ev-mail-edit" data-mail-editor="${e(key)}" role="group" aria-label="Who ${e(m.address)} tells">
      <p class="lic-hint">Who hears about every message a form sends through this mailer, unless the form names its own.</p>
      <div class="ev-mail-field"><span class="acct-label">People</span>${peopleBoxes('data-mail-person', m.notify)}</div>
      <div class="ev-mail-field"><span class="acct-label">Roles</span>${roleBoxes('data-mail-role', m.notifyRoles, { note: 'A role tells everyone who holds it now, and whoever gets it later.' })}</div>
      <label class="lic-tell lic-tell--switch"><input type="checkbox" data-mail-confirm ${m.confirmVisitor ? 'checked' : ''}><span>Confirm to the sender</span><span class="lic-state is-quiet">a copy of what they sent, when the form took their email</span></label>
      ${nowLine('mailer', mailerLine(m))}
      ${errLine(key)}
      <div class="acct-actions-row">${stateLead('mail-mailer-save', 'check', 'Save', busyState(key, 'Saving…'), `data-address="${e(m.address)}"`, 'btn-primary')}${mc.busy === key ? '' : iconBtn('mail-mailer-cancel', 'x', 'Keep it as it is')}</div>
    </div>`;
}

async function saveMailer(address) {
  const m = mailerOf(address);
  if (!m || mc.busy) return;
  const root = document.querySelector(`[data-mail-editor="mailer:${CSS.escape(m.address)}"]`);
  if (!root) return;
  const known = teamKnown();
  const sent = mailerPicks(root);
  const key = `mailer:${m.address}`;
  mc.busy = key; mc.err[key] = ''; setNote(''); paintMail();
  try {
    const d = await D.apiFetch(X.url(`${ENV_URL}/mailers/${encodeURIComponent(m.address)}`), { method: 'PUT', body: X.body(sent) });
    const got = d && d.mailer ? mailerRecord({ ...m, ...d.mailer }) : null;
    if (got) mc.mailers = mc.mailers.map(x => x.address === m.address ? got : x);
    mc.editMailer = '';
    const lost = lostWords(sent, d && d.mailer, ['notifyRoles']);
    const kept = known ? '' : ' The people it told before were kept; the team could not be read.';
    setNote(`${m.address} tells ${whoWords(got || { ...m, ...sent })} now${sent.confirmVisitor ? ', and confirms to the sender' : ', and does not confirm to the sender'}.${kept}${lost ? ` ${lost}` : ''}`, !!lost);
  } catch (ex) {
    const c = code(ex);
    mc.err[key] = c === 'OWNER_ONLY' ? (ex.data.error || 'Only the owner and active members of your team can be told.')
      : c === 'NO_MAILER' ? 'That mailer is gone. Reload the tab.'
      : c === 'SCOPE_REQUIRED' ? (ex.data.error || 'Your role cannot change a mailer. The owner can give your role "Give out mailboxes and licenses" on the Team tab.')
      : c === 'ROLES_INVALID' || c === 'NOTIFY_INVALID' ? (ex.data.error || 'Pick people and roles from the lists.')
      : words(ex, 'That could not be saved right now.');
  }
  mc.busy = ''; paintMail();
}

/** What a mailer's editor would save now (mailRouting.js mailerBodyFor): no team read, no people boxes, so notify stays out of the body and the server keeps the people stored (never wiped by an empty pick). */
function mailerPicks(root) {
  return mailerBodyFor({ people: teamKnown() ? ticked(root, '[data-mail-person]') : null, roles: ticked(root, '[data-mail-role]'), confirm: !!root.querySelector('[data-mail-confirm]')?.checked });
}

/* ---------- the forms ---------- */

/**
 * Who decides a form's waiting rows, in words, for its line and its editor's note alike: the server's own list for the
 * install (GET v1/environment/approvals, the ACTIVE team only, and whatever this role can read of the scopes) when the lane
 * answers it and nothing since changed who decides (`fresh`, and no Save waiting for the read again, mc.stale); else this
 * card's reading of `form` and the scopes.
 */
function decidersBy(form, fresh = true) {
  const g = fresh && X.decisions && !mc.stale.has(form.installId) ? X.decisions(form.installId) : null;
  return g && Array.isArray(g.deciders) ? namedDecidersWords(g.deciders, ownerEmail()) : decidersWords(decidersOf(form, mc.team, mc.scopes, ownerEmail()), ownerEmail());
}

/**
 * What a form's editor would save now (ONE settings body, mailRouting.js settingsFor), from the boxes as they are ticked: the
 * Save sends it and the notes read it (editorNow). No team read, no people boxes: notify_to stays out of the body (the
 * server merges and keeps what is stored) and the approver addresses already stored go back unchanged beside the roles
 * picked; nothing stored is ever wiped by an empty pick. The older one-address setting: unticked, it is cleared too, or
 * the form would go on mailing it; never when the manifest needs it or defaults it (recipientHold), where '' would be
 * refused or bring the default back.
 */
function formPicks(root, f) {
  const fromSel = root.querySelector('[data-mail-from]');
  const known = teamKnown();
  return settingsFor({
    mailer: fromSel ? fromSel.value : f.mailer,
    people: known ? ticked(root, '[data-mail-person]') : null, roles: ticked(root, '[data-mail-role]'),
    confirm: root.querySelector('[data-mail-confirm-sel]')?.value,
    approverRoles: ticked(root, '[data-mail-approver-role]'), approverPeople: known ? ticked(root, '[data-mail-approver]') : emailList(f.approversFrom === 'setting' ? f.approvers : []),
    recipient: f.recipient, recipientHold: f.recipientHold
  });
}

/**
 * What a form would do once `settings` is saved, in the saved line's words: who it tells (from the mailer it would send
 * from; none, the "no mailer" tag, and nothing is sent), whose switch "As the mailer" follows, and who decides.
 */
function formNow(f, settings) {
  const after = formAfter(f, settings);
  const from = resolvedMailer(after, mc.mailers || [], mc.dflt);
  const m = mailerOf(from);
  return {
    told: toldNote(toldBy(after, m, mc.team), { unknown: mc.mailersUnknown, sends: mc.mailersUnknown || !!from }),
    confirm: asMailerWords(m),
    decide: decideNote(decidersBy(after, !decidersChanged(f, after)), after.approversFrom, { ruleRoles: approveRoles(mc.scopes) })
  };
}

/** An editor's notes brought in step with its boxes (a tick, a pick, the switch): only the notes' words change, so the boxes, the focus and the unsaved picks stay as they are. */
function editorNow(root) {
  const key = String(root?.dataset?.mailEditor || '');
  const say = (kind, text) => { const p = root.querySelector(`[data-mail-now="${kind}"]`); if (p && p.textContent !== text) p.textContent = text; };
  if (key.startsWith('form:')) {
    const f = (mc.forms || []).find(x => x.installId === key.slice(5));
    if (!f) return;
    const n = formNow(f, formPicks(root, f));
    say('told', n.told); say('confirm', n.confirm); say('decide', n.decide);
  } else if (key.startsWith('mailer:')) {
    const m = mailerOf(key.slice(7));
    if (m) say('mailer', mailerLine(mailerAfter(m, mailerPicks(root))));
  }
}

function formsHtml() {
  const e = D.escapeHtml;
  const forms = mc.forms;
  const head = '<h4 class="acct-card-sub ev-mail-sub">Your forms</h4>';
  if (mc.formsErr) return `${head}<p class="lic-hint is-bad">${e(mc.formsErr)}</p>`;
  if (!forms || !forms.length) return `${head}<p class="lic-hint">No form on your site takes submissions yet. A form published from the studio appears here with the mailer it sends from, who it tells and who decides.</p>`;
  const mailers = mc.mailers || [];
  // the mailers unread (a viewer's 403, a failed read): a form with nothing of its own follows a mailer this card cannot see, so the words say that, never "the owner"
  const unknown = mc.mailersUnknown;
  const rows = forms.map(f => {
    const from = resolvedMailer(f, mailers, mc.dflt);
    const m = mailerOf(from);
    const told = toldBy(f, m, mc.team);
    const confirms = confirmsOf(f, m);
    const tags = formTags(f, { from, confirms: confirms.value, dflt: mc.dflt, unknown }).map(t => `<span class="acct-tag ${t.cls}">${e(t.word)}</span>`).join('');
    const tableLink = `<a class="acct-inline-link" href="#account?section=environment&card=data" data-acct-section="environment" data-acct-card="data" data-open-table="${e(f.table)}">${e(f.table)}</a>`;
    const toldWords = tellsWords(told, { unknown });
    const confirmWords = unknown && confirms.source !== 'form' ? 'confirms to the sender as its mailer does' : `${confirms.value ? 'confirms to the sender' : 'does not confirm to the sender'}${confirms.source === 'mailer' ? ' (as the mailer)' : ''}`;
    // who decides: the server's own list for this install when the lane answers it, else this card's reading (decidersBy)
    const decideWords = f.waits ? ` Its rows wait for a decision by ${decidersBy(f)}.` : '';
    const pencil = X.canWrite() && mc.edit !== f.installId ? iconBtn('mail-form-edit', 'edit', `Change what ${f.name} sends and who decides`, `data-install="${e(f.installId)}"`) : '';
    return `
      <div class="ev-mail-item" data-row="${e(f.installId)}">
        <div class="ev-mail-head"><span class="ev-mail-name">${e(f.name)}</span>${tags}<span class="ev-mail-act">${pencil}</span></div>
        <p class="ev-mail-line">Its rows land in ${tableLink}; it ${e(toldWords)} and ${e(confirmWords)}.${e(decideWords)}</p>
        ${mc.edit === f.installId ? formEditHtml(f, m, from) : ''}
      </div>`;
  }).join('');
  return `${head}<p class="lic-hint">Each form that takes submissions: the mailer it sends from, who is told, whether the sender gets a copy, who decides a row that waits. A form with nothing of its own follows its mailer.</p><div class="ev-mail-list">${rows}</div>`;
}

function formEditHtml(f, m, from) {
  const e = D.escapeHtml;
  const key = `form:${f.installId}`;
  const mailers = mc.mailers || [];
  const picked = f.mailer && mailers.some(x => x.address === f.mailer) ? f.mailer : '';
  const fromCtl = mailers.length
    ? `<select class="acct-input" data-mail-from aria-label="Send ${e(f.name)} from"><option value="" ${picked ? '' : 'selected'}>${e(`The environment's mailer${mc.dflt ? ` (${mc.dflt})` : ''}`)}</option>${mailers.map(x => `<option value="${e(x.address)}" ${x.address === picked ? 'selected' : ''}>${e(x.address)}</option>`).join('')}</select>`
    : `<p class="lic-hint">No mailer yet, so nothing is sent; the messages are kept in ${e(f.table)}.</p>`;
  // the notes say what a Save would do with the boxes as ticked (painted from what is stored; editorNow keeps them in step)
  const now = formNow(f, {});
  const confirmSel = `<select class="acct-input" data-mail-confirm-sel aria-label="Confirm to the sender">
      <option value="" data-mail-now="confirm" ${f.confirmVisitor == null ? 'selected' : ''}>${e(now.confirm)}</option>
      <option value="true" ${f.confirmVisitor === true ? 'selected' : ''}>Yes, a copy of what they sent</option>
      <option value="false" ${f.confirmVisitor === false ? 'selected' : ''}>No</option>
    </select>`;
  const d = decidersOf(f, mc.team, mc.scopes, ownerEmail());
  // nothing picked falls as the server falls (mailerUse.js approversOf, mailRouting.js formAfter): to the form's own default
  // roles when its module names any, else to the environment's rule; the note under the boxes says which (decideNote)
  const waitsNote = f.waits ? '' : '<p class="lic-hint">Rows of this form show without a decision today; this is who decides when they wait.</p>';
  return `
    <div class="ev-mail-edit" data-mail-editor="${e(key)}" role="group" aria-label="What ${e(f.name)} sends">
      <div class="ev-mail-field"><span class="acct-label">Send from</span>${fromCtl}</div>
      <div class="ev-mail-field"><span class="acct-label">Tell these people</span>${peopleBoxes('data-mail-person', f.notifyTo, { fixed: f.recipientHold ? f.recipient : '', note: recipientHoldWords(f.recipient, f.recipientHold, f.recipientLabel) })}</div>
      <div class="ev-mail-field"><span class="acct-label">Tell these roles</span>${roleBoxes('data-mail-role', f.notifyRoles, { nowHtml: nowLine('told', now.told), note: 'A role tells everyone who holds it now, and whoever gets it later.' })}</div>
      <div class="ev-mail-field"><span class="acct-label">Confirm to the sender</span>${confirmSel}</div>
      <div class="ev-mail-field"><span class="acct-label">Who decides</span>${waitsNote}${roleBoxes('data-mail-approver-role', d.named ? d.roles : [])}${peopleBoxes('data-mail-approver', d.named ? d.people : [])}${nowLine('decide', now.decide)}</div>
      ${errLine(key)}
      <div class="acct-actions-row">${stateLead('mail-form-save', 'check', 'Save', busyState(key, 'Saving…'), `data-install="${e(f.installId)}"`, 'btn-primary')}${mc.busy === key ? '' : iconBtn('mail-form-cancel', 'x', 'Keep it as it is')}</div>
    </div>`;
}

async function saveForm(installId) {
  const f = (mc.forms || []).find(x => x.installId === installId);
  if (!f || mc.busy) return;
  const root = document.querySelector(`[data-mail-editor="form:${CSS.escape(installId)}"]`);
  if (!root) return;
  // the one body the notes read too (formPicks): the team unread keeps the people stored, the older recipient as it may be
  const known = teamKnown();
  const settings = formPicks(root, f);
  const key = `form:${installId}`;
  mc.busy = key; mc.err[key] = ''; setNote(''); paintMail();
  try {
    const d = await D.apiFetch(X.url(`${ENV_URL}/modules/${encodeURIComponent(installId)}`), { method: 'PUT', body: X.body({ settings }) });
    const got = d && d.module ? formsOf([d.module])[0] : null;
    if (got) mc.forms = mc.forms.map(x => x.installId === installId ? got : x);
    mc.edit = '';
    // who decides changed: the tab reads GET approvals again (one read; decisionsArrived repaints), and until it lands this
    // form's line reads the card's own reading of what was saved, never the deciders from before the Save
    if (X.reloadDecisions && approversChanged(f, settings)) { mc.stale.add(installId); void X.reloadDecisions(); }
    const lost = lostWords(settings, d && d.module && d.module.settings);
    const kept = known ? '' : ' The people already named were kept; the team could not be read.';
    setNote(`${f.name} is saved.${kept}${lost ? ` ${lost}` : ''}`, !!lost);
  } catch (ex) {
    const c = code(ex);
    mc.err[key] = c === 'OWNER_ONLY' ? (ex.data.error || 'Only the owner and active members of your team can be told or decide.')
      : c === 'MODULE_NOT_FOUND' ? 'That form is no longer installed. Reload the tab.'
      : c === 'SCOPE_REQUIRED' ? (ex.data.error || 'Your role cannot change this. The owner can turn it on for your role on the Team tab.')
      : words(ex, 'That could not be saved right now.');
  }
  mc.busy = ''; paintMail();
}

/* ---------- the look of the mail, per site ---------- */

function themeState(slug) { return mc.theme[slug] || (mc.theme[slug] = { open: false, loaded: false, readErr: '', source: 'default', theme: themeOf(null), draft: null, follow: true, armFollow: false, err: {}, preview: '', previewErr: '', unsupported: false, gone: false }); }
/** The theme routes answer 404 SITE_NOT_FOUND when the site's row is gone; any other 404 is a lane without the route. */
function siteGone(ex) { return code(ex) === 'SITE_NOT_FOUND'; }
let armFollowTimer = null;
const ARM_FOLLOW_MS = 8000;
/** The Follow switch armed (the first press when the owner had set a look): a second press within the window confirms; anything else puts it back. */
function armFollow(slug, on) {
  clearTimeout(armFollowTimer);
  for (const k of Object.keys(mc.theme)) if (k !== slug || !on) mc.theme[k].armFollow = false;
  if (on) {
    themeState(slug).armFollow = true;
    armFollowTimer = setTimeout(() => { if (themeState(slug).armFollow) { themeState(slug).armFollow = false; paintMail(); } }, ARM_FOLLOW_MS);
  }
}

function themesHtml() {
  const e = D.escapeHtml;
  const list = sites();
  const head = '<h4 class="acct-card-sub ev-mail-sub">The look of the mail</h4>';
  const hint = '<p class="lic-hint">Every message a site\'s forms send is framed in the site\'s look: its name or logo, its colour, its font, its footer words. The website\'s look is read again at every publish; a look you set here holds until you let it go.</p>';
  if (mc.sitesErr) return `${head}${hint}<p class="lic-hint is-bad">${e(mc.sitesErr)}</p>`;
  if (list == null) return `${head}${hint}<p class="acct-loading">Reading the published sites…</p>`;
  if (!list.length) return `${head}${hint}<p class="lic-hint">No published site yet. Publish one from the studio and its look appears here.</p>`;
  return `${head}${hint}<div class="ev-mail-list">${list.map(siteHtml).join('')}</div>`;
}

function siteHtml(s) {
  const e = D.escapeHtml;
  const t = themeState(s.slug);
  const source = t.loaded ? t.source : sourceOf(s);
  const tag = themeTag(source);
  const name = X.siteName(s);
  const toggle = X.canWrite() ? stateIcon('mail-theme-open', t.open ? 'x' : 'edit', t.open ? 'Close' : `Set the look of ${name}'s mail`, busyState(`theme-read:${s.slug}`, 'Reading…'), `data-slug="${e(s.slug)}"`) : '';
  return `
    <div class="ev-mail-item ev-mail-site" data-row="site:${e(s.slug)}">
      <div class="ev-mail-head"><span class="ev-mail-name">${e(name)}</span><span class="acct-tag ${tag.cls}">${e(tag.word)}</span>${s.address ? `<span class="lic-state is-quiet">${e(String(s.address).replace(/^https?:\/\//, '').replace(/\/+$/, ''))}</span>` : ''}<span class="ev-mail-act">${toggle}</span></div>
      <p class="ev-mail-line">${e(themeWords(source))}</p>
      ${t.open ? themeEditHtml(s, t) : ''}
    </div>`;
}

function themeEditHtml(s, t) {
  const e = D.escapeHtml;
  const key = `theme:${s.slug}`;
  if (t.gone) return `<div class="ev-mail-edit" data-mail-editor="${e(key)}"><p class="lic-hint is-bad" role="status">${e(siteGoneWords(X.siteName(s)))}</p></div>`;
  if (t.unsupported) return `<div class="ev-mail-edit" data-mail-editor="${e(key)}"><p class="lic-hint">This lane does not keep a mail look yet. Deploy the backend that carries it, then reload.</p></div>`;
  // the look could not be read (anything but a 404): nothing to edit over, so no switch, no fields and no Save; a Read again, and the words
  if (!t.loaded) {
    return `<div class="ev-mail-edit" data-mail-editor="${e(key)}"><p class="lic-hint is-bad">${e(t.readErr || 'The look could not be read right now.')} Nothing here changes until it can be read.</p><div class="acct-actions-row">${stateLead('mail-theme-reread', 'undo', 'Read again', busyState(`theme-read:${s.slug}`, 'Reading…'), `data-slug="${e(s.slug)}"`)}</div></div>`;
  }
  const follow = t.follow;
  const draft = t.draft || t.theme;
  const field = ([k, label, kind]) => {
    const err = t.err[k] ? `<p class="lic-field-err" role="alert">${e(t.err[k])}</p>` : '';
    let ctl;
    if (kind === 'color') ctl = `<span class="ev-mail-color"><input type="color" data-mail-theme-field="${k}" value="${e(draft[k])}" aria-label="${e(label)}"><code>${e(draft[k])}</code></span>`;
    else if (kind === 'font') ctl = `<select class="acct-input" data-mail-theme-field="${k}" aria-label="${e(label)}">${FONTS.map(f => `<option value="${f}" ${draft.fontFamily === f ? 'selected' : ''}>${e(FONT_WORDS[f])}</option>`).join('')}</select>`;
    else if (kind === 'textarea') ctl = `<textarea class="acct-input" data-mail-theme-field="${k}" rows="2" maxlength="300" aria-label="${e(label)}" placeholder="Sent by ${e(draft.brandName || X.siteName(s))}">${e(draft[k])}</textarea>`;
    else ctl = `<input class="acct-input" type="${kind}" data-mail-theme-field="${k}" value="${e(draft[k])}" maxlength="${k === 'brandName' ? 80 : MAX_LOGO}" aria-label="${e(label)}" autocomplete="off" spellcheck="false" placeholder="${kind === 'url' ? 'https://' : 'Your organization\'s name'}">`;
    return `<div class="ev-mail-theme-field ${kind === 'textarea' ? 'is-wide' : ''} ${err ? 'is-bad' : ''}"><span class="acct-label">${e(label)}</span>${ctl}${err}</div>`;
  };
  const fields = follow ? '' : `<div class="ev-mail-theme-grid">${THEME_FIELDS.map(field).join('')}</div>`;
  const back = t.source === 'site' && !follow ? leadBtn('mail-theme-reset', 'undo', 'Back to the website\'s look', `data-slug="${e(s.slug)}" data-tip="Let the mail follow the website again; your own look is forgotten. Asks once."`) : '';
  const save = follow ? '' : stateLead('mail-theme-save', 'check', 'Save the look', busyState(key, 'Saving…'), `data-slug="${e(s.slug)}"`, 'btn-primary');
  const preview = stateLead('mail-theme-preview', 'eye', t.preview ? 'Preview again' : 'Show a preview', busyState(`preview:${s.slug}`, 'Drawing…'), `data-slug="${e(s.slug)}" data-tip="A sample message in the look as it is saved"`);
  const frame = t.preview ? `<iframe class="ev-mail-preview" data-mail-preview="${e(s.slug)}" sandbox="" title="A sample message in ${e(X.siteName(s))}'s look"></iframe><p class="lic-hint">The look as it is saved. Save first to see a change.</p>` : '';
  // the switch armed (the owner had set a look and pressed Follow once): it stays off, says what a second press does, offers Keep my look
  const armedLine = t.armFollow ? `<p class="lic-hint is-bad" role="status">Press the switch again and the look you set is forgotten; the mail follows the website from then on. ${iconBtn('mail-theme-keep', 'x', 'Keep my look', `data-slug="${e(s.slug)}"`)}</p>` : '';
  return `
    <div class="ev-mail-edit" data-mail-editor="${e(key)}" role="group" aria-label="The look of ${e(X.siteName(s))}'s mail">
      <label class="ev-switch" data-tip="${follow ? 'Turn off to set your own name, colours, font and footer' : t.source === 'site' ? 'Turn on to let the mail follow the website again; it asks once' : 'Turn on and the mail follows the website again'}">
        <input type="checkbox" role="switch" data-mail-follow data-slug="${e(s.slug)}" ${follow ? 'checked' : ''} ${mc.busy ? 'disabled' : ''} aria-label="Follow the website">
        <span class="ev-switch-track" aria-hidden="true"><span class="ev-switch-thumb"></span></span>
        <span class="ev-switch-text">${follow ? 'Follows the website' : 'Your own look'}</span>
      </label>
      ${armedLine}
      ${fields}
      ${errLine(key)}
      <div class="acct-actions-row">${save}${back}${preview}</div>
      ${t.previewErr ? `<p class="lic-hint is-bad">${e(t.previewErr)}</p>` : ''}
      ${frame}
    </div>`;
}

/** Open a site's look: closed, it opens and reads once (readTheme); open, it closes. */
async function openTheme(slug) {
  const t = themeState(slug);
  if (t.open) { t.open = false; armFollow(slug, false); paintMail(); return; }
  t.open = true;
  if (!t.loaded && !mc.busy) await readTheme(slug);
  else paintMail();
}

/**
 * The read: the theme route once (its source is the truth); a lane without the route (404) reads the publish list's mailTheme,
 * or says so. Any other failure leaves the site UNLOADED: the editor shows the words and Read again, never the default theme
 * as if it were the site's (a Save over that would have replaced the look the owner set).
 */
async function readTheme(slug) {
  const t = themeState(slug);
  if (mc.busy) return;
  mc.busy = `theme-read:${slug}`; t.readErr = ''; paintMail();
  try {
    const d = await D.apiFetch(X.url(`${ENV_URL}/publish/${encodeURIComponent(slug)}/theme`));
    t.theme = themeOf(d && d.theme); t.source = sourceOf(d); t.unsupported = false; t.gone = false; t.loaded = true;
  } catch (ex) {
    const site = (sites() || []).find(x => x.slug === slug);
    if (siteGone(ex)) { t.gone = true; t.loaded = false; t.readErr = ''; }
    else if (ex?.status === 404 && site && site.mailTheme) { t.theme = themeOf(site.mailTheme); t.source = sourceOf(site); t.loaded = true; }
    else if (ex?.status === 404) { t.unsupported = true; t.loaded = true; }
    else { t.loaded = false; t.readErr = words(ex, 'The look could not be read right now.'); }
  }
  if (t.loaded) { t.follow = t.source !== 'site'; t.draft = null; }
  mc.busy = '';
  paintMail();
}

/**
 * The switch: off opens the fields with the current look as the draft. On, when the owner had set a look, is TWO presses:
 * the first arms it (the switch stays off and one sentence says the look will be forgotten), the second within the window
 * lets it go (DELETE); anything else keeps the look. On, when nothing was set, just closes the fields.
 */
async function followTheme(slug, on) {
  const t = themeState(slug);
  if (!on) { armFollow(slug, false); t.follow = false; t.draft = { ...t.theme }; t.err = {}; paintMail(); return; }
  if (t.source !== 'site') { t.follow = true; t.draft = null; t.err = {}; paintMail(); return; }
  if (!t.armFollow) { armFollow(slug, true); paintMail(); return; }
  armFollow(slug, false);
  await resetTheme(slug);
}

/** A field changed: the draft keeps it, so a repaint (a preview, a note) never loses what was typed. */
function themeField(slug, field, value) {
  const t = themeState(slug);
  if (!t.draft) t.draft = { ...t.theme };
  t.draft[field] = String(value == null ? '' : value);
}

async function saveTheme(slug) {
  const t = themeState(slug);
  if (mc.busy) return;
  const root = document.querySelector(`[data-mail-editor="theme:${CSS.escape(slug)}"]`);
  if (root) for (const el of root.querySelectorAll('[data-mail-theme-field]')) themeField(slug, el.dataset.mailThemeField, el.value);
  const v = validTheme(t.draft || t.theme);
  t.err = { ...v.errors };
  const key = `theme:${slug}`;
  mc.err[key] = '';
  if (!v.ok) { mc.err[key] = 'Look at the fields marked below.'; paintMail(); return; }
  // only what the owner changed goes (the server merges it over the look as stored): the filled-in name and footer stay unsent
  const sent = themeChanges(t.theme, v.theme);
  mc.busy = key; setNote(''); paintMail();
  try {
    const d = await D.apiFetch(X.url(`${ENV_URL}/publish/${encodeURIComponent(slug)}/theme`), { method: 'PUT', body: X.body(sent) });
    t.theme = themeAfterSave(t.theme, sent, d && d.theme ? d.theme : { ...t.theme, ...sent, derived: false }); t.source = d && d.source ? sourceOf(d) : 'site';
    t.follow = false; t.draft = null; t.preview = '';
    const site = (sites() || []).find(x => x.slug === slug); if (site) site.mailTheme = { ...t.theme };
    setNote(`The look of ${X.siteName(site || { slug })}'s mail is saved.`);
  } catch (ex) {
    const c = code(ex);
    if (c === 'THEME_INVALID' && ex.data && ex.data.field) t.err[ex.data.field] = ex.data.error;
    if (siteGone(ex)) t.gone = true;
    mc.err[key] = siteGone(ex) ? '' : ex?.status === 404 ? 'This lane does not keep a mail look yet.' : words(ex, 'The look could not be saved right now.');
  }
  mc.busy = ''; paintMail();
}

async function resetTheme(slug) {
  const t = themeState(slug);
  if (mc.busy) return;
  const key = `theme:${slug}`;
  mc.busy = key; mc.err[key] = ''; setNote(''); paintMail();
  try {
    const d = await D.apiFetch(X.url(`${ENV_URL}/publish/${encodeURIComponent(slug)}/theme`), { method: 'DELETE', body: X.body({}) });
    t.theme = themeOf(d && d.theme); t.source = d && d.source ? sourceOf(d) : 'default';
    t.follow = true; t.armFollow = false; t.draft = null; t.err = {}; t.preview = '';
    const site = (sites() || []).find(x => x.slug === slug); if (site) site.mailTheme = d && d.theme ? { ...t.theme } : null;
    setNote(`${X.siteName(site || { slug })}'s mail ${t.source === 'website' ? 'follows the website again' : 'has the default look again'}.`);
  } catch (ex) {
    if (siteGone(ex)) t.gone = true;
    mc.err[key] = siteGone(ex) ? '' : ex?.status === 404 ? 'This lane does not keep a mail look yet.' : words(ex, 'That could not be undone right now.');
    t.follow = false;
  }
  mc.busy = ''; paintMail();
}

/** The framed sample from the server (text/html), into the sandboxed box; the panel's fetch parses JSON, so this one reads text. */
async function previewTheme(slug) {
  const t = themeState(slug);
  if (mc.busy) return;
  mc.busy = `preview:${slug}`; t.previewErr = ''; paintMail();
  try {
    const token = accessToken();
    const res = await fetch(X.url(`${ENV_URL}/publish/${encodeURIComponent(slug)}/theme/preview`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      let data = null; try { data = await res.json(); } catch { /* no body */ }
      throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data });
    }
    t.preview = await res.text();
  } catch (ex) {
    t.preview = '';
    if (siteGone(ex)) t.gone = true;
    t.previewErr = siteGone(ex) ? '' : ex?.status === 404 ? 'This lane does not draw the preview yet.' : words(ex, 'The preview could not be drawn right now.');
  }
  mc.busy = ''; paintMail();
}

/* ---------- the tab's events, handed on by environment.js ---------- */

/** A data-env-action this card owns (mail-*); false when it is not one of them. */
export function mailAction(a, btn) {
  if (!String(a || '').startsWith('mail-')) return false;
  const ds = btn?.dataset || {};
  if (a === 'mail-mailer-edit') { mc.editMailer = String(ds.address || '').toLowerCase(); mc.edit = ''; paintMail(); document.querySelector(`[data-mail-editor="mailer:${CSS.escape(mc.editMailer)}"] input`)?.focus(); return true; }
  if (a === 'mail-mailer-cancel') { mc.editMailer = ''; paintMail(); return true; }
  if (a === 'mail-mailer-save') { saveMailer(ds.address || ''); return true; }
  if (a === 'mail-form-edit') { mc.edit = String(ds.install || ''); mc.editMailer = ''; paintMail(); document.querySelector(`[data-mail-editor="form:${CSS.escape(mc.edit)}"] select, [data-mail-editor="form:${CSS.escape(mc.edit)}"] input`)?.focus(); return true; }
  if (a === 'mail-form-cancel') { mc.edit = ''; paintMail(); return true; }
  if (a === 'mail-form-save') { saveForm(ds.install || ''); return true; }
  if (a === 'mail-theme-open') { openTheme(ds.slug || ''); return true; }
  if (a === 'mail-theme-reread') { readTheme(ds.slug || ''); return true; }
  if (a === 'mail-theme-keep') { armFollow(ds.slug || '', false); paintMail(); return true; }
  if (a === 'mail-theme-save') { saveTheme(ds.slug || ''); return true; }
  // the labelled way back asks once too (cards.js armed: the second press within six seconds acts)
  if (a === 'mail-theme-reset') { if (btn && !armed(btn, 'Forget the look you set?', { keep: 'Keep my look' })) return true; resetTheme(ds.slug || ''); return true; }
  if (a === 'mail-theme-preview') { previewTheme(ds.slug || ''); return true; }
  return true;
}

/** A change on a control this card owns (the Follow switch, a theme field); false when it is not one of them. */
export function mailChange(e) {
  const sw = e?.target?.closest?.('[data-mail-follow]');
  if (sw) { followTheme(sw.dataset.slug || '', !!sw.checked); return true; }
  const f = e?.target?.closest?.('[data-mail-theme-field]');
  if (f) {
    const slug = f.closest('[data-mail-editor]')?.dataset.mailEditor?.replace(/^theme:/, '') || '';
    themeField(slug, f.dataset.mailThemeField, f.value);
    if (f.type === 'color') { const c = f.parentElement?.querySelector('code'); if (c) c.textContent = f.value; }
    return true;
  }
  // a tick, a pick or the switch in a form's or a mailer's editor: its notes say what a Save would do now (editorNow)
  const ed = e?.target?.closest?.('[data-mail-editor^="form:"], [data-mail-editor^="mailer:"]');
  if (ed) { editorNow(ed); return true; }
  return false;
}
