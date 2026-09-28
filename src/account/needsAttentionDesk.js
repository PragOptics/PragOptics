// src/account/needsAttentionDesk.js
//
// THE NEEDS ATTENTION DESK (2026-09-23, Part 1). The operator's list of what the platform could not settle by
// itself: a paid order that never reached Pax8, an order that stalled, one Pax8 cancelled, a company Pax8 holds
// inactive, a tenant Microsoft has not made, a subscription Pax8 bills with no line behind it, an ending or a
// decrease Pax8 refused past the retries, a customer who left, a pause that failed, and (2026-09-23) a customer's
// Microsoft 365 connection waiting on an administrator's approval in a tenant the platform made and administers.
//
// That last one's action answers { url }: Microsoft's admin approval page for THAT tenant. The desk opens it in this
// tab; the operator signs in there with the tenant's administrator login (the platform never stores it) and Microsoft
// sends them back to the desk, where the line above the list says what Microsoft answered: approved (the item has
// resolved), or why the item stays open. Any action that answers an https url is opened the same way.
//
// Each open item says what happened, whose environment it is (its name, then its id to copy), when it was first and
// last seen, how many times, the detail, every press recorded on it (History), and one button per action it offers.
// The backend runs the action and answers with the item: resolved, it leaves the list (the line above the list says
// so, with its note); not resolved, it stays and shows the note it came back with. An item settled while it was on
// screen (another operator, or the platform clearing it) answers 409 ITEM_RESOLVED: it leaves the list and the line
// says so. An action nothing on the lane carries out answers 501 HANDLER_MISSING with the item: the card takes its
// new note and history. The Resolved tab lists what was settled, by whom ("the platform" when it cleared on its own)
// and when.
//
//   GET  v1/admin/needs-attention?status=OPEN|RESOLVED     -> { ok, items }   newest first, each with environmentName
//   POST v1/admin/needs-attention/{id}/actions/{actionId}  -> { ok, item }
//
// Operators only: the section sits in the Internal group, which renders for isAdmin, and the backend checks
// isAdmin again on every call. Built from the panel's own action language (cards.js): the refresh is an icon with
// a tip, each item's actions are worded buttons (a decision needs its word; a phone has no hover), and an action that
// cannot be taken back ("Mark refused", "Handed over", "Done at Pax8 by hand") asks once before it acts. Attach takes the
// Pax8 subscription id the operator types beside it (empty: the newest one no line owns), sent as { input:
// { subscriptionId } }. A button whose request is out is disabled, spins and says why; it comes back with its label
// when the answer comes, errors included.
//
// CLOSING (2026-09-24): a report of a site or an account (conduct.report, auth/conductReport.js) carries a small box:
// which sites (this one, or every site on both lanes) when the report named a site, the account or environment when the
// report matched none, the category (the report's, changeable) and a note for the record; Take the site down, Suspend
// the account and Close for cause each ask once before they act, and a closure with a final bill comes back with the
// amount, which the next press confirms ("Charge $X and close?"). An owner's ask for an administrator account
// (tenant.admin-ask) takes the sign-in name as made (empty: as asked) and, for Cannot make it, the reason the owner reads.
//
// DECISION 37 (2026-09-24). Made it also takes the account's first password, typed once in a masked box: it goes with
// that one press and is then dropped from the page (never kept in the desk's memory after the answer, never in browser
// storage); the server keeps it only for the owner (auth/tenantAdminAsk.js). An amount owed after a closure for cause
// (close.owed) offers Charge the card again (asking with the amount) and Paid another way (with the note it needs). A
// closing's sites not all down (closing.sites) and an agreement notice that did not reach every owner
// (agreement.notice) offer Try again.

import { PRAG_API_BASE } from '../runtime/config.js';
import { iconBtn, leadBtn, armed, ico, busy, hold, stateLead, copyButton } from './cards.js';
import { cents as dollars } from '../ui/words.js';
import { categoryOptionsHtml } from './conductWords.js';

const NA_URL = `${PRAG_API_BASE}/admin/needs-attention`;

let D = null;   // deps from account.js: apiFetch, escapeHtml, friendlyError, showError, fmtDate, cachedPing

/** The desk's state. `busy` holds the action out per item id; `seq` lets a newer load win over an older one. */
const na = { status: 'OPEN', items: [], loading: false, busy: {}, flash: '', seq: 0, errors: {}, typed: {}, form: {} };

// A short name for each kind the backend raises (auth/licenseOrders.js ATTENTION; the title carries the particulars).
const KIND_LABEL = {
  'order.stuck-paid': 'Paid, not ordered',
  'order.delayed': 'Order not active',
  'order.cancelled': 'Order cancelled',
  // decision 37(9) (2026-09-24): money taken for a license, or license seats, Microsoft did not deliver; never a credit
  'order.refused': 'Charged, nothing delivered',
  'company.inactive': 'Company inactive',
  'tenant.not-created': 'Tenant not created',
  'tenant.handover': 'Hand over the tenant',
  'subscription.orphan': 'Billed with no line',
  'sweep.refused': 'Change refused',
  'sweep.failed': 'Sweep keeps failing',
  'billing.failed': 'Billing change failed',
  'kiosk.unlisted': 'Kiosk not listed',
  'decrease.moved': 'Decrease moved',
  'close.credit-failed': 'Closing charge not credited',
  'plan.ended': 'Customer left',
  'pause.failed': 'Pause failed',
  // licensing L1 (2026-09-24): a Microsoft skuId whose mailbox Microsoft's table does not say; the answer is kept for all
  'license.mail-unknown': 'Mailbox or not',
  'microsoft.approval': 'Approve Microsoft 365',
  // one per lane: Microsoft refused the platform's own sign-in (its certificate, Key Vault's signing, the scopes); the
  // item's detail names the fix, and the next token Microsoft gives closes it
  'microsoft.platform': 'Microsoft sign-in refused',
  // Pax8 Part 2 (2026-09-27, decision 16): a tenant PragOptics made, waiting for the operator to connect it from here
  // (Connect this tenant opens Microsoft's approval page for that tenant); a tenant two environments both want; the
  // tenant app's own credential refused on a lane
  'tenant.connect': 'Connect this tenant',
  'tenant.connect-clash': 'Tenant wanted twice',
  'tenant.credential': 'Tenant app sign-in refused',
  // closing (2026-09-24)
  'conduct.report': 'Report: community standards',
  'credentials.erase': 'Credentials not erased',
  'tenant.admin-ask': 'Administrator account asked',
  // decision 37 (2026-09-24)
  'close.owed': 'Owed after closing',
  'closing.sites': 'Sites not down after closing',
  'agreement.notice': 'Agreement notice not sent',
  // the money plan (2026-09-24): a failed license payment still owed (decision 21), a Microsoft price change (37(11)),
  // sales tax an automatic charge could not collect (37(12)), a charge Stripe made other than the quote, a closure
  // stopped after its final charge (kept toward the next close, never credited), an Education or Nonprofit approval
  'license.debt': 'Unpaid license term',
  'price.changed': 'License price changed',
  'tax.not-collected': 'Sales tax not collected',
  'billing.amount-differs': 'Charge differs from quote',
  'close.stopped-after-charge': 'Closure stopped after its charge',
  'qualification.request': 'Approval asked for',
  // decisions 33 and 34: a stored build found carrying an environment's data (rows, photos, a key), held off the board
  'build.carries-data': 'Build carried data',
  // the one-time sweep of stored builds (H1, 2026-09-24): a build whose project file could not be read back or
  // rewritten with its keys held back; Sweep again sweeps that one build
  'builds.secret-sweep': 'Build keys not swept',
  // the platform's one-time pass over every environment's stored studio drafts (auth/projectSecretSweep.js), not
  // finished after a day of hourly runs; Try again runs the pass now
  'projects.secret-sweep': 'Draft keys not swept'
};
// The icon beside each action's word, and the word it shows while its request is out.
const ACTION_ICON = { attach: 'link', refused: 'xCircle', check: 'search', ack: 'check', retry: 'refresh', done: 'checkCircle', approve: 'external', connect: 'external', takedown: 'stop', suspend: 'pause', close: 'power', 'mailbox-yes': 'check', 'mailbox-no': 'x', charge: 'card', paid: 'checkCircle', reorder: 'send', refund: 'undo', approved: 'checkCircle', denied: 'xCircle' };
const ACTION_BUSY = { attach: 'Attaching…', refused: 'Marking refused…', check: 'Checking…', ack: 'Saving…', retry: 'Trying again…', done: 'Recording it…', approve: 'Opening Microsoft…', connect: 'Connecting…', takedown: 'Taking it down…', suspend: 'Suspending…', close: 'Closing…', 'mailbox-yes': 'Saving…', 'mailbox-no': 'Saving…', charge: 'Charging…', paid: 'Recording it…', reorder: 'Ordering again…', refund: 'Refunding…', approved: 'Recording it…', denied: 'Recording it…' };
// Actions that cannot be taken back ask once, in words, before they act ('' asks with the action's own label). Money
// moves on Order again (a new order on the money taken) and Refund to card (decision 37(9)).
const ASK_FIRST = { refused: 'Mark refused?', done: '', reorder: 'Order again?', refund: 'Refund to card?' };
// A kind's own words where an action id means something else there: null asks nothing.
const KIND_ASK = {
  'conduct.report': { takedown: 'Take it down?', suspend: 'Suspend the account?', close: 'Close for cause?', done: null },
  'tenant.admin-ask': { done: 'Made it?', refused: 'Cannot make it?' },
  'close.owed': { charge: 'Charge the card again?', paid: 'Record it paid?' },
  // decision 21: Charge again charges the customer's card on file
  'license.debt': { retry: 'Charge the card again?' },
  'qualification.request': { approved: 'Microsoft approved?', denied: 'Microsoft did not approve?' },
  // a held build's files and row go for good on Remove
  'build.carries-data': { remove: 'Remove the build and its files?' }
};
const KIND_BUSY = {
  'build.carries-data': { remove: 'Removing…', 'keep-off': 'Recording it…' },
  'builds.secret-sweep': { retry: 'Sweeping…' },
  'projects.secret-sweep': { retry: 'Sweeping…' },
  'conduct.report': { done: 'Closing the report…' },
  'tenant.admin-ask': { done: 'Recording it…', refused: 'Recording it…' },
  'license.debt': { retry: 'Charging…' }
};
function askFor(kind, actionId, label) {
  const own = KIND_ASK[kind];
  if (own && Object.prototype.hasOwnProperty.call(own, actionId)) return own[actionId];
  if (Object.prototype.hasOwnProperty.call(ASK_FIRST, actionId)) return ASK_FIRST[actionId] || `${label}?`;
  return null;
}
function busyFor(kind, actionId) { return KIND_BUSY[kind]?.[actionId] || ACTION_BUSY[actionId] || 'Working…'; }
// Back from Microsoft's approval page: the backend sends the operator to section=attention&approval=microsoft&outcome=...
// (functions/microsoftConnect.js deskLeg); bootstrap.js keeps the outcome here, and the line above the list says it once.
// Approved: the owner's email may not have gone out (no address on record, or the send failed), and the item's closing
// note says which. The line names the email only when the return says whether it went (&emailed=1|0); without that it
// points at the note instead of claiming an email (2026-09-24 walk: it always said the owner was emailed).
const APPROVAL_RETURN = 'pragoptics_approval_return';
const APPROVED_SAID = {
  sent: 'Microsoft approved it. The item moved to the Resolved tab, and the owner is emailed to press Connect on Connected accounts.',
  unsent: "Microsoft approved it and the item moved to the Resolved tab, but the owner's email did not go out. Tell the owner to press Connect on Connected accounts.",
  unknown: "Microsoft approved it. The item moved to the Resolved tab; its note there says whether the owner was emailed to press Connect on Connected accounts."
};
const APPROVAL_SAID = {
  approved: APPROVED_SAID.unknown,
  'wrong-tenant': "Microsoft approved a different tenant than the one this item is for, so the item stays open. Press Approve at Microsoft again and sign in with that tenant's administrator account. The approval given in the other tenant stays there until its administrator removes it.",
  declined: 'The approval at Microsoft was not given, so nothing changed and the item stays open. Press Approve at Microsoft again when you are ready.',
  failed: 'Microsoft did not finish the approval, so the item stays open. Press Approve at Microsoft to try again.',
  expired: 'The approval took longer than ten minutes, so it was not accepted and the item stays open. Press Approve at Microsoft for a fresh page.',
  superseded: 'Microsoft answered an approval page that a later press replaced, or one already answered, so nothing was recorded. The item below says where it stands.'
};
// Back from Connect this tenant's page (Pax8 Part 2, decision 16; functions/environmentLicensingTenant.js consent, the
// operator's leg): the same address with approval=tenant. The item's own note says what happened when it stays open.
const TENANT_SAID = {
  connected: 'Microsoft approved it and the tenant is connected. The item moved to the Resolved tab; the subscriber\'s seats get their mailboxes on the next hourly pass.',
  declined: 'The approval at Microsoft was not given, so nothing changed and the item stays open. Press Connect this tenant again when you are ready.',
  failed: 'Microsoft did not finish the approval, so the item stays open. Its note says what came back; press Connect this tenant to try again.',
  unproven: 'Microsoft reported an approval, but the platform\'s token for that tenant is still refused; Microsoft can take a minute to apply it. Press Connect this tenant again in a minute.',
  taken: 'That Microsoft organization is already connected to another environment, so nothing was recorded. The item\'s note says which.',
  changed: 'The environment\'s tenant changed since the page was opened, so nothing was recorded. Press Connect this tenant again.',
  expired: 'That page had been used or was more than ten minutes old, so nothing was recorded. Press Connect this tenant for a fresh one.',
  missing: 'The environment of that item no longer exists.'
};
/** Microsoft's answer to the operator's approval or connect page, read once: its sentence, or '' when this visit is not that return. */
function approvalReturn() {
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(APPROVAL_RETURN) || 'null'); sessionStorage.removeItem(APPROVAL_RETURN); } catch { r = null; }
  if (!r) return '';
  if (r.kind === 'tenant') return TENANT_SAID[String(r.outcome || '')] || 'Back from Microsoft. The list below shows where each item stands.';
  if (r.outcome === 'approved' && typeof r.emailed === 'boolean') return r.emailed ? APPROVED_SAID.sent : APPROVED_SAID.unsent;
  return APPROVAL_SAID[String(r.outcome || '')] || 'Back from Microsoft. The list below shows where each item stands.';
}

const e = (s) => D.escapeHtml(s);
function idOf(it) { return String(it?.id || ''); }
function stamp(it) { return String(na.status === 'RESOLVED' ? (it.resolvedAt || it.lastSeenAt || it.createdAt || '') : (it.lastSeenAt || it.createdAt || '')); }
function sorted(items) { return [...items].sort((a, b) => stamp(b).localeCompare(stamp(a))); }
function acting() { return Object.keys(na.busy).length > 0; }

/** "Sep 23, 2026, 2:14 PM": first and last seen need the time, not only the day. */
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
/** "4 minutes ago", for the line at the top of a card. */
function ago(iso) {
  const t = new Date(iso || '').getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const unit = (n, w) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (s < 3600) return unit(Math.round(s / 60), 'minute');
  if (s < 86400) return unit(Math.round(s / 3600), 'hour');
  return unit(Math.round(s / 86400), 'day');
}
/**
 * Who acted: the backend records the operator's address on a press, and "system" when the owning module closed the
 * item itself because the condition cleared (needsAttention.close). Nothing recorded answers ''.
 */
const PLATFORM = 'system';
function who(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return String(v.email || v.userId || '');
}
function isPlatform(v) { return who(v).trim().toLowerCase() === PLATFORM; }
function byHtml(v, platformWords) {
  if (isPlatform(v)) return `<span class="na-by-platform">${e(platformWords)}</span>`;
  const w = who(v);
  return w ? e(w) : '<span class="adm-muted">Not recorded</span>';
}

/* ---------- paint ---------- */

function idHtml(value, label) {
  return `<span class="na-id"><code>${e(value)}</code>${iconBtn({ na: 'copy' }, 'copy', label, `data-copy="${e(value)}"`)}</span>`;
}

/** The customer's environment: its name as the backend reads it (environmentName), then its id to copy. */
function envHtml(it) {
  if (!it.environmentId) return '<span class="adm-muted">Not tied to one customer</span>';
  const name = String(it.environmentName || '').trim();
  return `<span class="na-env-name">${name ? e(name) : '<span class="adm-muted">Unnamed team</span>'}</span>${idHtml(String(it.environmentId), 'Copy the environment id')}`;
}

/** A disclosure line tall enough for a finger, with a chevron that turns when it opens. */
function foldHtml(cls, label, inner) {
  return `<details class="na-fold ${cls}"><summary>${ico('chevron')}<span>${e(label)}</span></summary>${inner}</details>`;
}

/** Every press recorded on the item (its last 25, newest first): when, who, which action, and what came back. */
function historyHtml(it) {
  const list = Array.isArray(it.history) ? it.history.filter(h => h && typeof h === 'object') : [];
  if (!list.length) return '';
  const rows = list.map(h => {
    const outcome = h.resolved === true ? '<span class="acct-tag is-verified">resolved</span>' : '<span class="acct-tag is-pending">still open</span>';
    const what = String(h.label || h.action || 'Action');
    return `
      <li class="na-hist-row">
        <div class="na-hist-top"><span class="na-hist-what">${e(what)}</span>${outcome}</div>
        <div class="adm-muted na-hist-meta">${e(when(h.at))} · ${byHtml(h.by, 'The platform')}</div>
        ${h.note ? `<p class="na-hist-note">${e(String(h.note))}</p>` : ''}
      </li>`;
  }).join('');
  return foldHtml('na-hist', `History (${list.length})`, `<ol class="na-hist-list">${rows}</ol>`);
}

/** Attach's box: the Pax8 subscription id to attach, kept as typed across repaints. */
function attachBoxHtml(it, out) {
  const id = idOf(it);
  const v = na.typed[id] || '';
  return `
    <label class="na-input">
      <span class="na-k">Pax8 subscription id</span>
      <input class="adm-input" type="text" autocomplete="off" spellcheck="false" maxlength="100" data-na-typed="${e(id)}" value="${e(v)}" placeholder="Empty: the newest one no line owns" ${out ? 'disabled' : ''} aria-describedby="naAttachHint-${e(id)}">
      <span class="adm-muted na-input-hint" id="naAttachHint-${e(id)}">It must be this company's, for this product, and held by no other line.</span>
    </label>`;
}

/** What the operator typed or chose on a card with a form, kept across repaints. */
function formOf(id) { return na.form[id] || (na.form[id] = {}); }
function fieldAttrs(id, name, out) { return `data-na-form="${e(id)}" data-na-field="${e(name)}" ${out ? 'disabled' : ''}`; }

/**
 * A community-standards report (conduct.report): which sites when the report named a site, the account or environment
 * when it matched none, the category (the report's unless changed), and a note for the record. Sent with every press.
 */
function conductBoxHtml(it, out) {
  const id = idOf(it);
  const f = formOf(id);
  const t = it.data?.target || {};
  const chosen = f.category || String(it.data?.category || '');
  const scope = f.scope || (t.slug ? 'one' : 'every');
  const siteWord = t.slug && t.slug !== 'root' ? `This site (${t.slug}, ${t.lane || 'live'})` : t.slug === 'root' ? `The site at the root of the address (${t.lane || 'live'})` : '';
  return `
    <div class="na-form">
      ${t.kind === 'site' ? `
        <fieldset class="na-choice">
          <legend class="na-k">Which sites</legend>
          ${siteWord ? `<label><input type="radio" name="naScope-${e(id)}" value="one" ${scope === 'one' ? 'checked' : ''} ${fieldAttrs(id, 'scope', out)}><span>${e(siteWord)}</span></label>` : ''}
          <label><input type="radio" name="naScope-${e(id)}" value="every" ${scope === 'every' || !siteWord ? 'checked' : ''} ${fieldAttrs(id, 'scope', out)}><span>Every site of the environment, live and sandbox</span></label>
        </fieldset>` : ''}
      ${t.kind === 'unmatched' ? `
        <label class="na-input">
          <span class="na-k">Account or environment</span>
          <input class="adm-input" type="text" autocomplete="off" spellcheck="false" maxlength="300" value="${e(f.target || '')}" placeholder="The account's email, or the environment id" ${fieldAttrs(id, 'target', out)}>
          <span class="adm-muted na-input-hint">The report matched no account. Type who it is about, then press.</span>
        </label>` : ''}
      <label class="na-input">
        <span class="na-k">What it breaks</span>
        <select class="adm-input" ${fieldAttrs(id, 'category', out)}>${categoryOptionsHtml(e, chosen)}</select>
      </label>
      <label class="na-input">
        <span class="na-k">Note for the record (optional)</span>
        <input class="adm-input" type="text" maxlength="500" value="${e(f.note || '')}" placeholder="What you checked, what you decided" ${fieldAttrs(id, 'note', out)}>
      </label>
      ${Number(it.data?.confirmCents) > 0 ? `<p class="adm-note na-confirm">Closing charges <b>${e(dollars(it.data.confirmCents))}</b> for the rest of the Microsoft license commitments on the final bill. Close for cause asks you to confirm that amount.</p>` : ''}
    </div>`;
}
/** An owner's ask for an administrator account (tenant.admin-ask): the name as made, and the reason for Cannot make it. */
function adminAskBoxHtml(it, out) {
  const id = idOf(it);
  const f = formOf(id);
  const asked = String(it.data?.name || '');
  const suffix = it.data?.prefix ? `@${it.data.prefix}.onmicrosoft.com` : '';
  return `
    <div class="na-form">
      <label class="na-input">
        <span class="na-k">Sign-in name as made (for Made it)</span>
        <span class="na-suffix-row"><input class="adm-input" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${e(f.signInName || '')}" placeholder="${e(asked || 'as asked')}" ${fieldAttrs(id, 'signInName', out)}><span class="adm-muted">${e(suffix)}</span></span>
        <span class="adm-muted na-input-hint">Empty: made as the owner asked${asked ? `, ${e(asked)}${e(suffix)}` : ''}.</span>
      </label>
      <label class="na-input">
        <span class="na-k">First password (for Made it)</span>
        <input class="adm-input" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="256" value="${e(f.password || '')}" placeholder="Exactly as Microsoft showed it" ${fieldAttrs(id, 'password', out)} aria-describedby="naPwHint-${e(id)}">
        <span class="adm-muted na-input-hint" id="naPwHint-${e(id)}">Microsoft shows it once, after Finish adding. It goes with Made it and is dropped from this page; PragOptics keeps it only until the owner sees it once on their Licensing tab. Never print it or email it.</span>
      </label>
      <label class="na-input">
        <span class="na-k">Reason (for Cannot make it)</span>
        <input class="adm-input" type="text" maxlength="500" value="${e(f.reason || '')}" placeholder="The owner reads this" ${fieldAttrs(id, 'reason', out)}>
      </label>
    </div>`;
}
/** An amount owed after a closure for cause (close.owed): the note Paid another way needs. */
function owedBoxHtml(it, out) {
  const id = idOf(it);
  const f = formOf(id);
  return `
    <div class="na-form">
      ${Number(it.data?.cents) > 0 ? `<p class="adm-note na-confirm">Owed: <b>${e(dollars(it.data.cents))}</b>. Charge the card again tries the card saved on the customer's Stripe record; nothing is forgiven from here.</p>` : ''}
      <label class="na-input">
        <span class="na-k">How it was paid (for Paid another way)</span>
        <input class="adm-input" type="text" maxlength="500" value="${e(f.note || '')}" placeholder="For example: bank transfer, reference 4411" ${fieldAttrs(id, 'note', out)}>
      </label>
    </div>`;
}

function actionsHtml(it) {
  const id = idOf(it);
  const out = na.busy[id] || '';
  const acts = Array.isArray(it.actions) ? it.actions.filter(a => a && a.id) : [];
  if (!acts.length) return '';
  const box = acts.some(a => a.id === 'attach') ? attachBoxHtml(it, out)
    : it.kind === 'conduct.report' ? conductBoxHtml(it, out)
      : it.kind === 'tenant.admin-ask' ? adminAskBoxHtml(it, out)
        : it.kind === 'close.owed' ? owedBoxHtml(it, out) : '';
  return `${box}<div class="na-actions">${acts.map((a, i) => {
    const label = String(a.label || a.id);
    const at = `data-id="${e(id)}" data-act="${e(a.id)}"`;
    const cls = ['refused', 'close', 'takedown', 'suspend'].includes(a.id) ? 'is-danger' : (i === 0 ? 'btn-primary' : '');
    // drawn from the desk's state in the panel's one set of looks (cards.js stateLead)
    return stateLead({ na: 'act' }, ACTION_ICON[a.id] || 'zap', label, { out: out === a.id, busyWord: busyFor(it.kind, a.id), waiting: out && out !== a.id ? 'Waiting for the other action on this item to finish' : '' }, at, cls);
  }).join('')}</div>`;
}

/** What goes with a press: Attach's id; a report's scope, account, category and note; the name as made or the reason. */
function inputFor(it, actionId) {
  const id = idOf(it);
  if (actionId === 'attach') { const typed = String(na.typed[id] || '').trim(); return typed ? { subscriptionId: typed } : null; }
  const f = na.form[id] || {};
  const pick = (keys) => { const o = {}; for (const k of keys) { const v = String(f[k] ?? '').trim(); if (v) o[k] = v; } return o; };
  if (it.kind === 'conduct.report') {
    const t = it.data?.target || {};
    const o = pick(['target', 'note']);
    o.category = String(f.category || it.data?.category || '');
    if (actionId === 'takedown') o.scope = f.scope || (t.slug ? 'one' : 'every');
    if (actionId === 'close' && Number(it.data?.confirmCents) > 0) o.acceptRemainingCents = Number(it.data.confirmCents);
    return o;
  }
  if (it.kind === 'tenant.admin-ask') {
    if (actionId === 'refused') return pick(['reason']);
    if (actionId !== 'done') return null;
    // the first password goes exactly as typed (never trimmed), with this press only
    const o = pick(['signInName']);
    if (typeof f.password === 'string' && f.password) o.password = f.password;
    return o;
  }
  if (it.kind === 'close.owed') return actionId === 'paid' ? pick(['note']) : null;
  return null;
}

function cardHtml(it) {
  const id = idOf(it);
  const resolved = String(it.status || '').toUpperCase() === 'RESOLVED';
  const count = Math.max(1, Number(it.count) || 1);
  const data = it.data && typeof it.data === 'object' && Object.keys(it.data).length ? it.data : null;
  const err = na.errors[id] || '';
  // a 501 answer's sentence is the same as the note it left on the item: said once, in red
  const note = it.note && it.note !== err ? String(it.note) : '';
  return `
    <article class="adm-card na-card${resolved ? ' is-resolved' : ''}" data-na-card="${e(id)}">
      <div class="na-head">
        <span class="adm-pill is-claimed" title="${e(it.kind || '')}">${e(KIND_LABEL[it.kind] || it.kind || 'Item')}</span>
        ${resolved ? '<span class="acct-tag is-verified">resolved</span>' : (count > 1 ? `<span class="acct-tag is-pending">${e(String(count))} times</span>` : '')}
        <span class="adm-muted na-ago">${e(resolved ? `resolved ${ago(it.resolvedAt)}` : `last seen ${ago(it.lastSeenAt || it.createdAt)}`)}</span>
      </div>
      <p class="na-title">${e(it.title || 'Untitled item')}</p>
      <dl class="na-facts">
        <div class="na-wide"><dt>Environment</dt><dd class="na-env">${envHtml(it)}</dd></div>
        ${it.ref ? `<div class="na-wide"><dt>Reference</dt><dd>${idHtml(String(it.ref), 'Copy the reference')}</dd></div>` : ''}
        <div><dt>First seen</dt><dd>${e(when(it.createdAt))}</dd></div>
        <div><dt>Last seen</dt><dd>${e(when(it.lastSeenAt || it.createdAt))}</dd></div>
        <div><dt>Times</dt><dd>${e(String(count))}</dd></div>
        ${resolved ? `<div><dt>Resolved</dt><dd>${e(when(it.resolvedAt))}</dd></div><div><dt>By</dt><dd>${byHtml(it.resolvedBy, 'The platform, when the condition cleared')}</dd></div>` : ''}
      </dl>
      ${it.detail ? `<pre class="na-detail">${e(it.detail)}</pre>` : '<p class="adm-muted na-nodetail">No detail was recorded.</p>'}
      ${data ? foldHtml('na-data', 'Recorded data', `<pre class="na-detail">${e(JSON.stringify(data, null, 2))}</pre>`) : ''}
      ${note ? `<p class="na-note"><span class="na-k">${resolved ? 'Note' : 'Last answer'}</span>${e(note)}</p>` : ''}
      ${err ? `<p class="adm-error na-err" role="alert">${e(err)}</p>` : ''}
      ${historyHtml(it)}
      ${resolved ? '' : actionsHtml(it)}
    </article>`;
}

function listHtml() {
  if (!na.items.length) return `<p class="adm-empty">${na.status === 'OPEN' ? 'Nothing needs attention.' : 'Nothing resolved yet.'}</p>`;
  return `<p class="adm-note na-count">${countLine()}</p>${na.items.map(cardHtml).join('')}`;
}
function countLine() {
  const n = na.items.length;
  return na.status === 'OPEN' ? `<b>${n}</b> open, the most recently seen first.` : `<b>${n}</b> resolved, the most recently resolved first.`;
}

/** The line above the list: how many, in what order. */
function paintCount() {
  const el = document.querySelector('#naBody .na-count');
  if (el) el.innerHTML = countLine();
}
function paint() {
  const host = document.getElementById('naBody');
  if (host) host.innerHTML = listHtml();
  paintTools();
}
/** One card, in place, so an open "Recorded data" on another card stays open; this card's open folds open again. */
function paintCard(id) {
  const sel = `[data-na-card="${CSS.escape(id)}"]`;
  const el = document.querySelector(sel);
  const it = na.items.find(i => idOf(i) === id);
  if (!el) return;
  if (!it) { paint(); return; }
  const open = ['na-data', 'na-hist'].filter(c => el.querySelector(`details.${c}[open]`));
  el.outerHTML = cardHtml(it);
  const fresh = document.querySelector(sel);
  for (const c of open) fresh?.querySelector(`details.${c}`)?.setAttribute('open', '');
}
/** Take one card off the list (resolved, here or elsewhere); the last one out paints the empty desk. */
function dropCard(id) {
  na.items = na.items.filter(i => idOf(i) !== id);
  delete na.errors[id];
  delete na.typed[id];
  delete na.form[id];
  const el = document.querySelector(`[data-na-card="${CSS.escape(id)}"]`);
  if (el && na.items.length) { el.remove(); paintCount(); paintTools(); } else paint();
}
function paintFlash() {
  const el = document.getElementById('naFlash');
  if (!el) return;
  el.textContent = na.flash;
  el.hidden = !na.flash;
}
/**
 * The refresh and the tabs: disabled while a load or an action is out, saying why, through the panel's one busy
 * helper (cards.js): a load turns the refresh and says "Loading…", an action holds both with "Wait for the action to
 * finish"; the answer puts them back as they were.
 */
let tools = null;   // { why, el, done } while the tools are held
function paintTools() {
  const why = na.loading ? 'Loading…' : acting() ? 'Wait for the action to finish' : '';
  const r = document.getElementById('naRefresh');
  const tabs = [...document.querySelectorAll('[data-na-tab]')];
  for (const t of tabs) {
    const on = t.dataset.naTab === na.status;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  if (tools && (tools.why !== why || tools.el !== r || !tools.el?.isConnected)) { tools.done(); tools = null; }
  if (why && !tools && r) {
    tools = { why, el: r, done: na.loading ? busy(r, why, { hold: tabs, why }) : hold([r, ...tabs], why) };
  }
  const box = document.getElementById('naTabs');
  if (box) box.setAttribute('aria-busy', na.loading ? 'true' : 'false');
}

/* ---------- load and act ---------- */

async function load() {
  const host = document.getElementById('naBody');
  if (!host) return;
  const seq = ++na.seq;
  const status = na.status;
  na.loading = true;
  D.showError('naError', '');
  paintTools();
  try {
    const d = await D.apiFetch(`${NA_URL}?status=${encodeURIComponent(status)}`);
    if (seq !== na.seq) return;   // a newer load owns the view
    na.items = sorted(Array.isArray(d?.items) ? d.items : []);
    na.errors = {};
    na.loading = false;
    paint();
  } catch (ex) {
    if (seq !== na.seq) return;
    na.items = [];
    na.loading = false;
    const box = document.getElementById('naBody');
    if (box) box.innerHTML = ex?.status === 404 ? '<p class="adm-empty">The Needs attention desk is not on this lane yet. Deploy the backend that carries it, then reload.</p>' : '';
    if (ex?.status !== 404 && !ex?.sessionInvalidated) D.showError('naError', ex?.data?.error || D.friendlyError(ex, 'Could not load the desk.'));
    paintTools();
  }
}

async function runAction(btn) {
  const id = String(btn.dataset.id || ''), actionId = String(btn.dataset.act || '');
  if (!id || !actionId || na.busy[id] || na.loading) return;
  const it = na.items.find(i => idOf(i) === id);
  if (!it) return;
  // an action that cannot be taken back asks once, in words, before it acts: "Mark refused?", "Handed over?"; a
  // closure with a final bill asks with the amount: "Charge $X and close?"
  {
    const label = String((it.actions || []).find(a => a && a.id === actionId)?.label || actionId);
    let ask = askFor(it.kind, actionId, label);
    if (it.kind === 'conduct.report' && actionId === 'close' && Number(it.data?.confirmCents) > 0) ask = `Charge ${dollars(it.data.confirmCents)} and close?`;
    if (it.kind === 'close.owed' && actionId === 'charge' && Number(it.data?.cents) > 0) ask = `Charge ${dollars(it.data.cents)} again?`;
    if (ask && !armed(btn, ask)) return;
  }
  // what the operator typed or chose with the press, trimmed; nothing typed sends nothing
  const input = inputFor(it, actionId);
  const payload = input && Object.keys(input).length ? { input } : {};
  // decision 37(3): a first password goes with this one press and is dropped from the page now; a press that does not
  // go through asks for it to be typed again
  if (na.form[id] && 'password' in na.form[id]) delete na.form[id].password;
  na.busy[id] = actionId;
  delete na.errors[id];
  na.flash = ''; paintFlash();
  paintCard(id); paintTools();
  try {
    const d = await D.apiFetch(`${NA_URL}/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}`, { method: 'POST', body: JSON.stringify(payload) });
    // an action that answers a page to open (Approve at Microsoft): it opens in this tab, and the button stays turning
    // until the page leaves; the page it opens sends the operator back here
    if (typeof d?.url === 'string' && /^https:\/\//i.test(d.url)) { window.location.assign(d.url); return; }
    delete na.busy[id];
    // the list may have been read again while this was out: look the item up now, not before
    const cur = na.items.find(i => idOf(i) === id) || it;
    const next = { ...cur, ...(d?.item || {}) };
    if (String(next.status || '').toUpperCase() === 'RESOLVED') {
      na.flash = `Resolved: ${next.title || 'the item'}.${next.note ? ` ${next.note}` : ''}`;
      paintFlash();
      // take the one card out, so a "Recorded data" open on another card stays open
      dropCard(id);
    } else {
      na.items = na.items.map(i => idOf(i) === id ? next : i);
      paintCard(id);
      paintTools();
    }
  } catch (ex) {
    delete na.busy[id];
    const code = String(ex?.data?.code || '');
    const cur = na.items.find(i => idOf(i) === id) || it;
    if (code === 'ITEM_RESOLVED' || code === 'ITEM_UNKNOWN') {
      // settled while it was on screen (another operator, or the platform itself when the condition cleared), or gone:
      // it leaves the open list instead of answering every press with the same refusal
      na.flash = code === 'ITEM_RESOLVED'
        ? `Already resolved: ${cur.title || 'the item'}. Someone else settled it, or the platform cleared it on its own; the Resolved tab says who and when.`
        : `No longer on the desk: ${cur.title || 'the item'}.`;
      paintFlash();
      dropCard(id);
      return;
    }
    // 501 HANDLER_MISSING: nothing on this lane carries the action out; the answer carries the item with its new note
    // and history, which the card takes (the environment's name is kept from the list)
    if (ex?.data?.item && typeof ex.data.item === 'object' && idOf(ex.data.item) === id) {
      const next = { ...cur, ...ex.data.item, environmentName: ex.data.item.environmentName || cur.environmentName || '' };
      na.items = na.items.map(i => idOf(i) === id ? next : i);
    }
    if (!ex?.sessionInvalidated) na.errors[id] = ex?.data?.error || D.friendlyError(ex, 'That action did not go through.');
    paintCard(id);
    paintTools();
  }
}

/** An id to the clipboard (cards.js copyButton); where the browser refuses, its <code> beside the button is selected for the keyboard. */
function copyValue(btn) {
  return copyButton(btn, String(btn.dataset.copy || ''), { select: () => btn.closest('.na-id')?.querySelector('code') });
}

/* ---------- the section ---------- */

let bound = false;
function bindOnce() {
  if (bound) return;
  bound = true;
  // Attach's typed id is kept as it is typed, so a repaint of the card (an answer, a refresh) never wipes it
  document.addEventListener('input', (ev) => {
    const t = ev.target?.closest?.('[data-na-typed]');
    if (t) na.typed[t.dataset.naTyped] = String(t.value || '');
  });
  // a card's form (a report's sites, account, category and note; an ask's name and reason), kept as it is changed
  const keepField = (ev) => {
    const f = ev.target?.closest?.('[data-na-field]');
    if (!f) return;
    if (f.type === 'radio' && !f.checked) return;
    formOf(String(f.dataset.naForm || ''))[f.dataset.naField] = String(f.value || '');
  };
  document.addEventListener('input', keepField);
  document.addEventListener('change', keepField);
  document.addEventListener('click', (ev) => {
    const tab = ev.target.closest?.('[data-na-tab]');
    if (tab) {
      ev.preventDefault();
      if (tab.disabled || tab.dataset.naTab === na.status) return;
      na.status = tab.dataset.naTab === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
      na.flash = ''; paintFlash();
      const host = document.getElementById('naBody');
      if (host) host.innerHTML = '<p class="adm-note">Loading…</p>';
      load();
      return;
    }
    const btn = ev.target.closest?.('[data-na-action]');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    const a = btn.dataset.naAction;
    if (a === 'refresh') {
      na.flash = ''; paintFlash();
      const host = document.getElementById('naBody');
      if (host) host.innerHTML = '<p class="adm-note">Loading…</p>';
      load();
      return;
    }
    if (a === 'copy') { copyValue(btn); return; }
    if (a === 'act') runAction(btn);
  });
  // Back from Microsoft's page with the browser's Back button, the desk can come back from the browser's memory with the
  // button still turning: its request finished (the page was opened), so the button comes back and the list is read again
  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted || !acting() || !document.getElementById('naBody')) return;
    na.busy = {};
    paint();
    load();
  });
}

/** Internal: the operator's Needs attention desk. */
export async function renderNeedsAttention(main, deps) {
  D = deps;
  bindOnce();
  na.flash = '';
  if (tools) { tools.done(); tools = null; }   // the tools of an earlier visit are gone with its page
  const tab = (s, label) => `<button class="adm-tab" type="button" role="tab" data-na-tab="${s}" aria-selected="${s === na.status}">${label}</button>`;
  main.innerHTML = `
    <div class="na-desk">
      <header class="adm-sec-head">
        <h2 class="adm-sec-title">Needs attention</h2>
        <div class="ev-actions na-tools">
          <div class="adm-tabs" id="naTabs" role="tablist" aria-label="Which items">${tab('OPEN', 'Open')}${tab('RESOLVED', 'Resolved')}</div>
          ${iconBtn({ na: 'refresh' }, 'refresh', 'Refresh', 'id="naRefresh"')}
        </div>
      </header>
      <p class="adm-note">What the platform could not settle by itself, across every customer: orders, companies, tenants, subscriptions, endings, pauses and Microsoft 365 approvals, and what people report or ask for: a site or an account reported for the community standards, an owner's ask for an administrator account. Closings put here an amount still owed after a closure for cause and published files a closing could not delete; an agreement notice puts here the owners it could not reach. Each item offers what can be done about it; an action the platform finishes resolves the item, and one it cannot finish leaves the item here with the answer it came back with. Approve at Microsoft opens Microsoft's approval page in this tab: sign in there with that tenant's administrator account, and Microsoft sends you back here. You get one email when an item is new or comes back, not one per repeat.</p>
      <p class="adm-error" id="naError" hidden></p>
      <p class="na-flash" id="naFlash" role="status" aria-live="polite" hidden></p>
      <div id="naBody"><p class="adm-note">Loading…</p></div>
    </div>`;
  // the operator back from Microsoft's approval page: what Microsoft answered, above the list the load brings
  na.flash = approvalReturn();
  paintFlash();
  paintTools();
  await load();
}
