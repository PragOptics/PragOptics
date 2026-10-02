// src/account/licensingShared.js
//
// What the Licensing section's modules share (2026-09-22; Part 1, 2026-09-23): the routes, the tab's state, the
// team-aware url and body, the card wrapper, the words for terms and dates, and the three habits every card keeps:
//
//   ONE REQUEST AT A TIME (standing rule c). A button that sends a request goes through send(): while its request is
//   out it is disabled, spins and says what it is doing ("Saving…"); every other request button on the tab waits,
//   disabled, and its tip says what it waits for; on the answer, errors included, every button comes back with its
//   own word. The state lives in `lc.busy`, so a repaint mid-request keeps it.
//   WHAT WAS TYPED STAYS. An input marked data-keep is remembered as it is typed (lc.draft) and painted back, so a
//   repaint (an answer, another card's request) never wipes a half-filled form.
//   ERRORS AND NOTES BELONG TO THEIR CARD. lc.err[card] and lc.notes[card] are painted inside the card, so a repaint
//   keeps them; the server's sentences are shown as they are (they are plain words and never name a provider).
//
// licensing.js owns the read and the paint and hands them over in `st` at render.

import { PRAG_API_BASE } from '../runtime/config.js';
import { cardHtml as sharedCard, stateLead, stateIcon, waitingWord } from './cards.js';
import { esc, countWord, money, cents, dayWord } from '../ui/words.js';
// the platform's formatters (src/ui/words.js), handed on to the tab's modules from here as before
export { countWord, money, cents, dayWord };

export const LIC_URL = `${PRAG_API_BASE}/environment/licensing`;
export const REQ_URL = `${LIC_URL}/requests`;
const TEAM_KEY = 'pragoptics_team_id';

/**
 * The tab's state. view: the read; reqs: the requests read (null when the lane has none); busy/busyWord: the request
 * that is out; draft: typed values by input id; err/notes: per card; prices/requires: offers read per product; add:
 * the add box; acctConfirm: the business name the owner is confirming before the licensing account is created; the
 * rest are each card's own switches.
 */
export const lc = {
  view: null, reqs: null, canDecide: false, busy: '', busyWord: '', draft: {}, err: {}, links: {}, notes: {},
  prices: {}, requires: {}, add: null, needPhone: false, tnMode: '', tnEdit: false, bizEdit: false, acctConfirm: '', declining: '', bill: null, p8: null, cat: null, loadMsg: '',
  // the money plan (2026-09-24): the offers a license has on other terms than the plan's (decision 38), and the exact
  // charge read for a license-seat change and for a waiting request (licensingMoney.js)
  notForPlan: {}, seatQuote: {}, reqQuote: {}
};
/** The deps the panel hands in (apiFetch, escapeHtml, showError, friendlyError, fmtDate, cachedPing) and the section's paint and load. */
export const st = { D: null, paint: () => {}, load: async () => {} };

export const TERM_NAMES = { Monthly: 'a month', Annual: 'a year', '2-Year': 'every two years', '3-Year': 'every three years' };
/** Only for a backend that sends no statusText of its own: the state in a customer's words, promising nothing. */
export const STATUS_WORDS = { CHARGING: 'Charging your card.', PAID: 'Paid, ordering from Microsoft.', ORDERED: 'Ordered, waiting for Microsoft.', ACTIVE: 'Active.', ENDING: 'Ending.', CANCELED: 'Ended.', FAILED: 'Microsoft could not complete this order.' };

export function cardHtml(o) { return sharedCard({ ...o, key: `licensing:${o.key}` }); }
export function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
/** A sentence ends with one full stop. */
export function sentence(s) { s = String(s || '').trim(); return !s ? '' : /[.!?]$/.test(s) ? s : `${s}.`; }
function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
export function url(path, extra = {}) {
  const u = new URL(path);
  const t = teamId(); if (t) u.searchParams.set('tenant', t);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}
export function body(obj) { const t = teamId(); return JSON.stringify({ ...(t ? { tenant: t } : {}), ...obj }); }
/** A write on the tab's routes: JSON in, JSON out, the team in view named. */
export function call(path, method = 'POST', payload = {}) {
  return st.D.apiFetch(url(path), { method, headers: { 'Content-Type': 'application/json' }, body: body(payload) });
}

/** What the person looking may do, as the server says (auth/licensing.js describe). Read only when it says nothing. */
export function perms() {
  const v = lc.view || {};
  return v.permissions || { isOwner: false, readOnly: true, canOpenAccount: false, canNameTenant: false, canTurnOnMail: false, canBuy: false, canRequest: false, canAssign: false, canAccept: false, canAskForMailbox: false, canDecline: false };
}
/**
 * Licensing L4 (2026-09-24): whether the tab shows the team's licensing at all. On a plan that includes it, yes; after
 * the plan ended, paused, or on Free, yes still when the team has licensing (an account, or a license ever held), so
 * the owner sees every license and its end date, read-only, and can decline a waiting request.
 */
export function showsLicensing() { const v = lc.view; return !!(v && (v.eligible || v.hasLicensing)); }

// (Licensing L5c's shared bill is gone, 2026-09-24: decision 37(8) bills each license on its own, from the day it is
// bought, on Microsoft's dates. The exact charge of every button is Stripe's own quote: licensingMoney.js.)

/** The platform's operator (the ping's isAdmin); the backend checks it again on every operator call. */
export function isOperator() { try { return st.D.cachedPing?.()?.user?.isAdmin === true; } catch { return false; } }
/** The signed-in person, from the session's ping. */
export function me() { try { const u = st.D.cachedPing?.()?.user || {}; return { userId: String(u.userId || ''), email: String(u.email || '') }; } catch { return { userId: '', email: '' }; } }

/* ---------- one request at a time ---------- */

/**
 * Run one request for the button named `key`. `word` is what that button says while it is out ("Saving…"). An error
 * lands on the card `errKey` in plain words (sayError with `codes`), and the answer, good or bad, repaints every
 * button with its own word. Answers true when the request went through.
 */
export async function send(key, word, fn, { errKey = '', fallback = 'That could not be done.', codes = {} } = {}) {
  if (lc.busy) return false;
  lc.busy = key; lc.busyWord = word;
  if (errKey) { lc.err[errKey] = ''; lc.links[errKey] = null; }
  st.paint();
  try { await fn(); return true; }
  catch (ex) { if (errKey) lc.err[errKey] = sayError(ex, fallback, codes); return false; }
  finally { lc.busy = ''; lc.busyWord = ''; st.paint(); }
}
/** The state of the tab's one request for the button named `key`, in the panel's painted-busy terms (cards.js stateLead). */
function stateOf(key, busyLabel) {
  const mine = lc.busy === key, other = !!lc.busy && !mine;
  return { out: mine, busyWord: busyLabel, waiting: other ? waitingWord(lc.busyWord) : '' };
}
/**
 * A request button with a word (leadBtn): its own busy word and a spinning icon while its request is out; disabled
 * with the reason in its tip while another one is. The looks are the panel's one set (cards.js stateLead).
 */
export function reqLead(key, action, icon, label, busyLabel, attrs = '', cls = '') {
  return stateLead(action, icon, label, stateOf(key, busyLabel), attrs, cls);
}
/** A request icon (iconBtn): its tip and label say what it is doing while out, or what it waits for while another is. */
export function reqIcon(key, action, icon, label, busyLabel, attrs = '', cls = '') {
  return stateIcon(action, icon, label, stateOf(key, busyLabel), attrs, cls);
}

/* ---------- plain errors ---------- */

/**
 * A refusal in plain words: the card's own sentence for a code it names, else the server's sentence (the routes send
 * plain words and never a provider's), else the panel's friendly error. Empty when the session ended (the panel said so).
 */
export function sayError(ex, fallback, codes = {}) {
  const code = ex?.data?.code;
  if (code && Object.prototype.hasOwnProperty.call(codes, code)) { const c = codes[code]; return typeof c === 'function' ? c(ex) : c; }
  if (ex?.status === 404 && !code && !ex?.data?.error) return 'This lane does not have that route yet. Reload once the backend that carries it is deployed.';
  return ex?.data?.error || st.D.friendlyError(ex, fallback);
}
/**
 * A card's error line, painted inside the card so a repaint keeps it. lc.links[key] = { section, label } adds the
 * way to fix it in the panel ("Open Billing"), set by a code's sentence in sayError's `codes`.
 */
export function errHtml(key) {
  const m = lc.err[key];
  if (!m) return '';
  const l = lc.links[key];
  return `<p class="acct-error" role="alert">${esc(m)}${l ? ` <a href="#account?section=${esc(l.section)}" data-acct-section="${esc(l.section)}">${esc(l.label)}</a>` : ''}</p>`;
}
/** A code's sentence that also links to the panel section that fixes it. */
export function withLink(key, section, label, text) { return () => { lc.links[key] = { section, label }; return text; }; }
/** A link into a section of the panel and one of its cards; account.js opens the card once the section has painted. */
export function cardLink(section, card, label) {
  return `<a class="acct-inline-link" href="#account?section=${esc(section)}&card=${esc(card)}" data-acct-section="${esc(section)}" data-acct-card="${esc(card)}">${esc(label)}</a>`;
}

/* ---------- the owner's steps, in order ----------
 *
 * EVERY STEP, NOT THE NUMBERED FOUR (2026-10-02, Cameron: "i want a process that doesn't hide how many steps there
 * are"). This said four, and typed the number into four cards by hand. Two things the owner has to do carried no
 * number at all, because they live as paragraphs inside the tenant card: signing in to Microsoft once, which no one
 * can do for them and which held +wiz for 8h47m, and approving PragOptics on the tenant afterwards. Being told four
 * and then meeting six is the complaint. The list is now one array in one place, the ids match the server's own
 * licensing steps (backend auth/setupSteps.js), and each card asks for its number by id rather than stating one.
 */
export const LICENSING_STEPS = Object.freeze(['account', 'tenant', 'agreement', 'mail', 'msSignIn', 'connected']);
export const STEPS = LICENSING_STEPS.length;
/** A step's number by its id, 1-based; 0 when the id is not a numbered step (Mailboxes is optional, My mailbox is not a step). */
export function stepNo(id) { return LICENSING_STEPS.indexOf(String(id)) + 1; }
/** A card's summary with its step in front: "Step 2 of 6 · not named yet". `summaryHtml` is already escaped.
 *  Takes the step's ID, so a card can never carry a number the list does not agree with. */
export function stepWord(id, summaryHtml) {
  const n = stepNo(id);
  return n ? `<span class="lic-step">Step ${n} of ${STEPS}</span> · ${summaryHtml}` : summaryHtml;
}
/** The tenant is named (a new name Microsoft makes) or given (the ID of one the business has). */
export function tenantNamed(m) { return !!(m?.tenantId || m?.domainPrefix); }
/** The Microsoft Customer Agreement stands: the server's agreement.stands, else an acceptance on record. */
export function agreementStands(m) { return m?.agreement ? !!m.agreement.stands : !!m?.mca; }
/**
 * Why a step's control waits: one sentence naming the first step before it that is not done, and its card; '' when
 * every step before it is done. `upTo` is how many steps must be done first: 1 the account (the tenant's Save), 2 and
 * the tenant (the agreement's Accept), 3 and the agreement (Turn on mail).
 */
export function stepGate(v, upTo) {
  const m = v?.microsoft || {};
  if (!v?.account) return 'Create your licensing account first, on the Licensing account card above.';
  if (upTo >= 2 && !tenantNamed(m)) return 'Name your Microsoft tenant first, on the card above.';
  if (upTo >= 3 && !agreementStands(m)) return 'Accept the Microsoft Customer Agreement first, on the card above.';
  return '';
}
/** A card's note (what the last action did), painted inside the card; `bad` marks one that did not go as asked. */
export function noteHtml(key) { const n = lc.notes[key]; return n?.text ? `<p class="acct-card-note ev-note ${n.bad ? 'is-bad' : ''}" role="status">${esc(n.text)}</p>` : ''; }
export function setNote(key, text, bad = false) { lc.notes[key] = text ? { text, bad } : null; }

/* ---------- what was typed stays ---------- */

/** An input's value as typed (lc.draft), else its starting value. */
export function kept(id, dflt = '') { return Object.prototype.hasOwnProperty.call(lc.draft, id) ? lc.draft[id] : dflt; }
export function forget(...ids) { for (const id of ids) delete lc.draft[id]; }
/** The tab's input and change listener: an element carrying data-keep is remembered by its id. */
export function keepInput(e) {
  const t = e.target;
  if (!t || !t.id || !t.hasAttribute?.('data-keep')) return;
  lc.draft[t.id] = t.type === 'checkbox' ? !!t.checked : String(t.value ?? '');
}

/* ---------- a license's offers (2026-09-22): one per billing term and commitment, from the pricing route ---------- */

const BILL_MONTHS = { Monthly: 1, Annual: 12, '2-Year': 24, '3-Year': 36 };
/** The offers from the route's answer; an older backend answers terms only, so they are derived the same way. */
export function offersFrom(d) {
  if (Array.isArray(d?.options)) return d.options;
  const priced = (d?.terms || []).filter(t => (t.rates || []).length);
  const committed = new Set(priced.filter(t => t.commitmentMonths > 0).map(t => t.billingTerm));
  const seen = new Set();
  return priced.filter(t => t.commitmentMonths > 0 || !committed.has(t.billingTerm))
    .map(t => ({ key: `${t.billingTerm}:${t.commitmentMonths || 0}`, billingTerm: t.billingTerm, commitmentMonths: t.commitmentMonths || 0, list: t.rates[0].list, canDecrease: true, canCancelEarly: true, cancelFee: false, available: true }))
    .filter(o => !seen.has(o.key) && seen.add(o.key))
    .sort((a, b) => (a.commitmentMonths - b.commitmentMonths) || ((BILL_MONTHS[a.billingTerm] || 99) - (BILL_MONTHS[b.billingTerm] || 99)));
}
/** Read a license's offers once; null when it has none to order on. */
export async function loadOffers(id) {
  if (!id || lc.prices[id] !== undefined) return lc.prices[id];
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/products/${encodeURIComponent(id)}/pricing`));
    const offers = offersFrom(d);
    lc.prices[id] = offers.length ? offers : null;
    lc.requires[id] = Array.isArray(d?.requires) ? d.requires : [];
    // decision 38: the server offers only the plan's term; how many it left out says why a license has none to order on
    lc.notForPlan[id] = Number(d?.notForPlan || 0);
  } catch (ex) { lc.prices[id] = null; throw ex; }
  return lc.prices[id];
}
/**
 * Licensing L3b: whether the team already holds a base license is marked on each license's price read (requires[].held),
 * from the team's own licenses, so a license added, ended or kept can change the mark on any other license. After one of
 * those every read is dropped and read again when its license opens; the license open now (its add box, or its card in
 * the list) is read at once, so nothing waits on a read nobody started. A mark the server gave on a refusal goes too.
 */
export async function forgetMarks() {
  for (const k of Object.keys(lc.prices)) delete lc.prices[k];
  for (const k of Object.keys(lc.requires)) delete lc.requires[k];
  for (const k of Object.keys(lc.notForPlan)) delete lc.notForPlan[k];
  for (const k of Object.keys(lc.seatQuote)) delete lc.seatQuote[k];
  if (lc.add) delete lc.add.needs;
  const id = lc.add?.productId || lc.cat?.open || '';
  if (id) { try { await loadOffers(id); } catch { /* the box says it has no price to order on, as any failed read does */ } }
}
/** "a month", "a year", "every two years". */
export function billWord(term) { return TERM_NAMES[term] || String(term || '').toLowerCase(); }
/** The commitment in words: month to month, a 1-year commitment. */
export function commitWord(o) {
  const m = Number(o?.commitmentMonths || 0);
  if (m <= 1) return 'month to month';
  if (m % 12 === 0) return `${m / 12}-year commitment`;
  return `${m}-month commitment`;
}
/**
 * What the commitment means for the customer, in a few words; empty when nothing is held back. Money plan item 3
 * (2026-09-24): a commitment longer than the billing period runs, and is billed, to its end even if it is ended sooner
 * (Microsoft bills it for the whole commitment); no early-ending fee is ever said, since none is ever charged.
 */
export function ruleWords(o) {
  const out = [];
  const months = Number(o?.commitmentMonths || 0);
  const longer = months > (BILL_MONTHS[o?.billingTerm] || 1);
  if (longer) out.push(`it runs, and is billed, to the end of its ${months % 12 === 0 ? `${months / 12}-year` : `${months}-month`} commitment, even if you end it sooner`);
  if (!o?.canDecrease && longer) out.push('license seats go down only when the commitment ends');
  return out.join('; ');
}
/** The price per month, to compare offers. */
export function perMonth(o) { return Number(o?.list || 0) / (BILL_MONTHS[o?.billingTerm] || 1); }
/** A license's name without the distributor's program suffix ("[New Commerce Experience]"). */
export function licName(n) { return String(n || '').replace(/\s*\[New Commerce Experience\]\s*/i, ' ').replace(/\s{2,}/g, ' ').trim(); }
/** The mailbox included with every seat (decision 14: by exact code), or any business Kiosk: never offered for sale (MINE M11). */
export function isKiosk(p) {
  if (!p) return false;
  if (String(p.sku || '').toUpperCase() === 'MST-NCE-183-C100' || String(p.id || '').toLowerCase() === 'd65db4e4-8014-4765-bb04-96050619f337') return true;
  const n = String(p.name || '');
  return /exchange online kiosk/i.test(n) && !/education|student|faculty|government|\bgcc\b|non-?profit|trial/i.test(n);
}
