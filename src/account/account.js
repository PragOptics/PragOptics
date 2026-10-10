// src/account/account.js
//
// THE panel. One container for everything about the signed-in person:
// account sections for every customer, and the internal operator sections
// appended in the SAME sidebar when (and only when) the ping says the account
// is an administrator. Customers never see the Internal group; operators get
// one place for all of it. Opened from the menu as "Profile".
//
// Gating is COSMETIC and deliberately so: every internal route this panel
// calls is admin-gated server-side in resolveUserContext, so a customer who
// forges isAdmin in their own sessionStorage gets sections where every
// request returns 403.

import { PRAG_API_BASE, LANE, ORDERS_CLAIM_LIVE, TEAM_LIVE } from '../runtime/config.js';
import { registerPasskey, passkeySupported } from '../auth/passkey.js';
import { switchLane, isPlatformOperator } from '../runtime/lane.js';
import { stripeAppearance } from '../api/stripeAppearance.js';
import { ensureStripeJs } from '../runtime/stripeLoader.js';
import { tierName, ADDON_NAME, tierBadge } from '../components/tierCopy.js';
import { mountPricingSelect } from '../components/pricingCards.js';
import { openReportAnomaly, openSupportRequest, installErrorCapture } from './report.js';
import { renderTeam, renderTenants, bindTeamActions } from './team.js';
import { renderEnvironment, bindEnvironmentActions } from './environment.js';
import { renderLicensing, bindLicensingActions } from './licensing.js';
import { renderLiveAgents, bindLiveAgentsActions } from './liveAgents.js';
import { avatarHtml, fileToAvatar, saveAvatar } from './avatar.js';
import { renderBuildsQueue, renderMyBuilds } from './buildsDesk.js';
import { renderNeedsAttention } from './needsAttentionDesk.js';
import { renderAgreementNotice } from './agreementNotice.js';
import { renderSetup, markSetupStale } from './setup.js';
import { billingDetailsHtml, editBillingDetails, cancelBillingDetails, saveBillingDetails } from './billingDetails.js';
import { loadBandwidthCard, bandwidthAction } from './bandwidth.js';
import { explainLink } from '../components/explainer.js';
import { cardHtml, iconBtn, leadBtn, btnLabel, armed, ico, setCardSummary, initCards, openCardOf, packGrid, busy, hold, copyButton, openModal } from './cards.js';
import { closeBillOf, closeChargeWord } from './closeBill.js';
import { accessToken } from '../runtime/session.js';
import { dayWord, money, cents, esc as escapeHtml } from '../ui/words.js';
import { writeClipboard } from '../ui/clipboard.js';
import { cardErrorWords } from '../api/stripeWords.js';
import { applyTheme, getTheme, applyStarfield, getStarfield } from '../runtime/theme.js';
import { sunSvg, moonSvg, LIGHT_LABEL, DARK_LABEL } from '../components/themeMarks.js';
import { syncUserTheme, rememberUserTheme, rememberUserPreference } from '../runtime/userTheme.js';

// Report Anomaly attaches the last few console errors to a report, so the
// collector starts with the panel module, not with the first click.
installErrorCapture();

const ALIASES_URL = `${PRAG_API_BASE}/auth/aliases`;
const PHONE_START_URL = `${PRAG_API_BASE}/auth/phone/start`;
const PHONE_CONFIRM_URL = `${PRAG_API_BASE}/auth/phone/confirm`;
const PHONE_REMOVE_URL = `${PRAG_API_BASE}/auth/phone/remove`;
const MINE_URL = `${PRAG_API_BASE}/warranty/mine`;
const REQUEST_CODE_URL = `${PRAG_API_BASE}/auth/request-code`;
const PING_URL = `${PRAG_API_BASE}/ping`;
const CHANGE_PW_URL = `${PRAG_API_BASE}/auth/change-password`;
const RESET_2FA_URL = `${PRAG_API_BASE}/auth/2fa/reset`;
const PASSKEY_LIST_URL = `${PRAG_API_BASE}/auth/passkey/list`;
const PASSKEY_REMOVE_URL = `${PRAG_API_BASE}/auth/passkey/remove`;
const CLOSE_ACCOUNT_URL = `${PRAG_API_BASE}/auth/account/close`;
const CLOSE_SUMMARY_URL = `${PRAG_API_BASE}/auth/account/close/summary`;
const PREFS_URL = `${PRAG_API_BASE}/account/preferences`;
const BILLING_DETAILS_URL = `${PRAG_API_BASE}/billing/profile/details`;   // decision 24: the Billing details card

const SUB_URL        = `${PRAG_API_BASE}/billing/subscription`;
const SUB_UPDATE_URL = `${PRAG_API_BASE}/billing/subscription/update`;
const SUB_CANCEL_URL = `${PRAG_API_BASE}/billing/subscription/cancel`;
const PM_URL         = `${PRAG_API_BASE}/billing/payment-method`;
const ORDERS_MINE_URL = `${PRAG_API_BASE}/orders/mine`;
const ORDERS_CLAIM_URL = `${PRAG_API_BASE}/orders/claim`;

const ISSUE_URL = `${PRAG_API_BASE}/warranty/codes/issue`;
const LIST_URL  = `${PRAG_API_BASE}/warranty/codes`;
const USERS_URL = `${PRAG_API_BASE}/admin/users`;
const USER_PATCH_URL = `${PRAG_API_BASE}/admin/users/patch`;
const CATALOG_IMPORT_URL = `${PRAG_API_BASE}/admin/catalog/import`;
const CATALOG_SYNC_URL = `${PRAG_API_BASE}/catalog/sync`;
const ADMIN_CATALOG_GOODS_URL = `${PRAG_API_BASE}/admin/catalog/goods`;
const ADMIN_ORDERS_URL = `${PRAG_API_BASE}/admin/orders`;
const ADMIN_ORDER_LABEL_URL = `${PRAG_API_BASE}/admin/orders/label`;
const ADMIN_ORDER_REFUND_URL = `${PRAG_API_BASE}/admin/orders/refund`;
const STRIPE_WH_SYNC_URL = `${PRAG_API_BASE}/admin/stripe/webhook-sync`;
const SHIPPO_WH_SYNC_URL = `${PRAG_API_BASE}/admin/shippo/webhook-sync`;
const BILLING_RECONCILE_URL = `${PRAG_API_BASE}/admin/billing/reconcile`;
const STRIPE_OVERVIEW_URL = `${PRAG_API_BASE}/admin/stripe/overview`;
const SHIPPO_LABELS_URL = `${PRAG_API_BASE}/admin/shipping/labels`;
const PRINT_QUEUE_URL = `${PRAG_API_BASE}/admin/print-queue`;
const USAGE_MINE_URL = `${PRAG_API_BASE}/usage/mine`;
const ADMIN_USAGE_URL = `${PRAG_API_BASE}/admin/usage/overview`;
const ADMIN_AI_URL = `${PRAG_API_BASE}/admin/ai/usage`;
const ADMIN_COSTS_URL = `${PRAG_API_BASE}/admin/costs`;
const NOTIFY_PREFS_URL = `${PRAG_API_BASE}/account/notifications`;
const ADMIN_NOTIFY_URL = `${PRAG_API_BASE}/admin/notifications`;
const ADMIN_NOTIFY_TEST_URL = `${PRAG_API_BASE}/admin/notifications/test`;
const ADMIN_NOTIFY_SEND_URL = `${PRAG_API_BASE}/admin/notifications/send`;
const ADMIN_ROLES_URL = `${PRAG_API_BASE}/admin/roles`;
const ADMIN_ROLES_REMOVE_URL = `${PRAG_API_BASE}/admin/roles/remove`;
const ADMIN_ANOMALIES_URL = `${PRAG_API_BASE}/admin/anomalies`;
const ADMIN_SUPPORT_URL = `${PRAG_API_BASE}/admin/support`;
const ADMIN_ANOMALY_PATCH_URL = `${PRAG_API_BASE}/admin/anomalies/patch`;

// Catalog snapshots survive lane flips (localStorage is per-origin, and the
// lane toggle reloads the same origin): snapshot on one lane, import on the
// other.
const CATALOG_SNAPSHOT_KEY = 'pragoptics_catalog_snapshot_v1';

let $body = null;
let mounted = false;
let mountedAsAdmin = false;
let activeSection = 'profile';
// Small cache so switching sections does not re-hit the API every click.
const cache = { users: null };

// escapeHtml is the platform's one HTML escape (src/ui/words.js esc), imported above under the name this file has
// always passed to its sections as deps.escapeHtml.

// Third-party URLs (Stripe invoices, Shippo labels and tracking) become
// clickable links here. escapeHtml stops attribute breakout but not a
// javascript: scheme, so only plain https ever reaches an href.
function safeUrl(u) {
  const s = String(u || '');
  return /^https:\/\/[^\s]+$/i.test(s) ? s : '';
}

/* ---------- identity / session ---------- */

function cachedPing() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); }
  catch { return null; }
}
function hasLiveSession() {
  try {
    if (typeof window.isAccessTokenValid === 'function') return window.isAccessTokenValid();
    return !!accessToken();
  } catch { return false; }
}
function isAdmin() {
  return hasLiveSession() && cachedPing()?.user?.isAdmin === true;
}
/** The platform owner (2026-10-06): the one session that may grant or remove the Admin flag; the API refuses everyone else. */
function isOwner() {
  return hasLiveSession() && cachedPing()?.user?.isOwner === true;
}
// The primary address as the server last reported it. cachedPing() is a
// snapshot taken at sign-in and is NEVER refreshed when the primary changes,
// so reading the address from it after a switch returns the OLD one. That is
// the address makePrimary/removeAlias then hand to request-code, while the
// confirm looks the code up under the CURRENT primary - so the code lands in
// the wrong inbox and the confirm fails with "That code has expired". A
// second address change in one page session was impossible without a reload.
let knownPrimary = '';
function currentEmail() { return knownPrimary || cachedPing()?.user?.email || ''; }

// Re-fetch the ping and rewrite the cached copy. knownPrimary keeps
// currentEmail() honest within a page session, but it is a module variable
// that resets on reload - after which currentEmail() falls back to the cached
// ping, which is a snapshot from sign-in and still names the OLD primary. Call
// this after a change that moves the primary so the new one survives a reload.
async function refreshCachedPing() {
  try {
    // Bypass the browser cache: a plain GET /ping can be served stale (the
    // catalog desk kept showing a retired lookup key after a sync because the
    // cached ping never updated). A cache-buster forces the current catalog.
    const fresh = await apiFetch(`${PING_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (fresh && fresh.user) sessionStorage.setItem('pragoptics_ping', JSON.stringify(fresh));
    return fresh || null;
  } catch { return null; /* best-effort; knownPrimary still covers this session */ }
}

// A session that died underneath an open console, named precisely.
//
// These are the three refusals auth/getUser.js raises once a token is no longer
// good: a blocking account status (suspension), and a session epoch that no
// longer matches (password reset, logout elsewhere, or the epoch bump that
// suspension itself writes). They are matched by the server's own wording
// because routes build their own error bodies and do not carry a machine code
// on every lane; the `code` check below picks it up wherever one is present.
//
// Matching NARROWLY is the point. A bare 401 in a step-up flow means "that
// password is not correct", and a bare 403 means "not for your account" or
// "admin only". Signing someone out for either of those would be a bug, so
// only these exact server messages end the session.
const SUSPENDED_ERROR = 'Account not active';
const DEAD_SESSION_ERRORS = ['Session expired', 'User not found'];

function sessionKillReason(status, data) {
  const msg = String(data?.error || '');
  const code = String(data?.code || '');
  if (status === 403 && (code === 'ACCOUNT_NOT_ACTIVE' || msg === SUSPENDED_ERROR)) return 'suspended';
  if (status === 401 && (code === 'SESSION_REVOKED' || DEAD_SESSION_ERRORS.includes(msg))) return 'expired';
  return null;
}

// The console fires several requests at once, and all of them fail together
// when the session dies. Tear down once.
let sessionKillFired = false;

async function apiFetch(url, options = {}) {
  const token = accessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;

    // Suspended or revoked mid-session: end the session once, say why once,
    // and mark the error so each section stays quiet instead of stacking its
    // own "not available" tile on a console that is being torn down.
    const kill = sessionKillReason(res.status, data);
    if (kill) {
      err.sessionInvalidated = true;
      // A response for a token the app no longer holds is stale (a sign-in
      // finished while this request was in flight): it says nothing about the
      // session the app has now, so it must not end it (2026-09-17).
      const stale = token && accessToken() !== token;
      try { console.warn('[session] kill', kill, 'from', String(url).replace(/\?.*$/, ''), String(data?.error || ''), stale ? '(stale response, ignored)' : ''); } catch { /* fine */ }
      if (!stale && !sessionKillFired) {
        sessionKillFired = true;
        try { window.invalidateSession?.(kill); } catch { /* teardown is best effort */ }
      }
    }
    throw err;
  }
  // A write anywhere in the panel can finish a setup step, and the checklist keeps its answer for thirty seconds, so
  // without this a step stayed on "Next" after it was done (2026-10-02). One hook here covers every card.
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') { try { markSetupStale(); } catch { /* the list reloads on the next section */ } }
  return data || {};
}

// A throttled action, said in a way the user can act on.
//
// The API only ever describes limits that belong to the CALLER - their own
// burst allowance, their own day, or the day of a number they are verifying.
// The platform-wide ceiling arrives with no scope at all and falls through to
// the server's generic message, which is deliberate: naming it would publish
// how many messages it takes to deny service to every customer at once.
const LIMIT_COPY = {
  'account-burst': (max) => `You can request ${max} codes every 15 minutes.`,
  'number-daily':  (max) => `A number can receive ${max} codes per day.`,
  'account-daily': (max) => `You can request ${max} codes per day.`,
  'account-verify-day': () => 'You have verified numbers too often today. Try again tomorrow.'
};

function formatReset(iso) {
  const at = new Date(iso);
  if (isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // These windows are UTC-aligned, so a daily one often clears on the viewer's
  // next calendar day. Naming the day avoids "try again after 7:00" reading as
  // seven o'clock this morning.
  return at.toDateString() === new Date().toDateString()
    ? `Try again after ${time}.`
    : `Try again ${at.toLocaleDateString([], { weekday: 'long' })} after ${time}.`;
}

function rateLimitMessage(data) {
  const copy = LIMIT_COPY[data.limitScope];
  const head = copy ? copy(data.limitMax) : 'You have reached a limit on this action.';
  const when = data.resetAt ? formatReset(data.resetAt) : '';
  return when ? `${head} ${when}` : head;
}

function friendlyError(ex, fallback, { passwordFlow = false } = {}) {
  // The session was already torn down centrally and the modal has said why.
  // Returning nothing makes showError() HIDE the tile, so the user reads one
  // clear sentence instead of a console full of "not available".
  if (ex?.sessionInvalidated) return '';
  // Scoped throttles carry their own ceiling and reset; unscoped ones (the
  // platform ceiling) intentionally do not, and use the generic path.
  if (ex?.status === 429 && ex?.data?.limitScope) return rateLimitMessage(ex.data);
  if (ex?.status === 404) return 'This feature is not available yet.';
  // 423: the account's phone changes are paused pending review. The server's
  // sentence is written for the customer, so it is shown as is.
  if (ex?.status === 423) return ex?.message || fallback;
  // Shared by admin and customer billing actions: a customer refused for a
  // non-admin reason must not be told they are "not an administrator".
  if (ex?.status === 403) return 'This action is not available for your account.';
  // 401 means "wrong password" only in the step-up flows that just asked for
  // one; on a plain data fetch it means the session died.
  if (ex?.status === 401) {
    // Every 401 these routes raise names its own cause: "That password is not
    // correct.", "That code has expired.", "That code is not valid.".
    // Flattening them all to "wrong password" sent the user to retype a
    // password that was already right, with no way to learn the code was the
    // problem. The server's wording is the authoritative one.
    if (passwordFlow) return ex?.message || 'That password did not match. Try again.';
    return 'Your session is no longer valid. Sign in again.';
  }
  if (ex instanceof TypeError) return 'Could not reach the API. Check that you are online.';
  return ex?.message || fallback;
}

/* ---------- shell ---------- */

const ICONS = {
  profile:      '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  products:     '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
  subscription: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  orders:       '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  shiporders:   '<path d="M16 3h5v13h-2"/><path d="M1 3h15v13H8"/><path d="M16 8h4l1 3"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  payments:     '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  builds:       '<path d="M12 2l9 4.9V17L12 22 3 17V6.9z"/><path d="M12 22V12"/><path d="M21 7l-9 5-9-5"/>',
  buildsqueue:  '<path d="M12 2l9 4.9V17L12 22 3 17V6.9z"/><path d="M12 22V12"/><path d="M21 7l-9 5-9-5"/>',
  overview:     '<path d="M4 13h6V4H4z"/><path d="M14 20h6v-9h-6z"/><path d="M14 8h6V4h-6z"/><path d="M4 20h6v-4H4z"/>',
  users:        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  warranty:     '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 11h5"/><path d="M7 15h8"/><path d="M16 3l4 4"/><path d="M8 3L4 7"/>',
  inventory:    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  catalog:      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  notify:       '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  reports:      '<path d="M12 2c-4.4 0-8 3.4-8 7.8 0 5.4 4.6 12.2 8 12.2s8-6.8 8-12.2C20 5.4 16.4 2 12 2z"/><path d="M6.8 10.2c2-.6 3.9.6 4.4 2.6-2 .6-3.9-.6-4.4-2.6z"/><path d="M17.2 10.2c-2-.6-3.9.6-4.4 2.6 2 .6 3.9-.6 4.4-2.6z"/>',
  team:         '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  tenants:      '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01"/><path d="M15 10h.01"/>',
  environment:  '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>',
  licensing:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
  ai:           '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  attention:    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  support:      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9 10a3 3 0 0 1 6 0c0 2-3 2-3 4"/><path d="M12 17h.01"/>',
  liveagents:   '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2z"/><path d="M20 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z"/><path d="M18 17v1a3 3 0 0 1-3 3h-3"/>'
};

const ACCOUNT_SECTIONS = [
  { id: 'profile',      label: 'Profile' },
  { id: 'products',     label: 'Registered hardware' },
  { id: 'subscription', label: 'Billing' },
  { id: 'team',         label: 'Team' },
  { id: 'environment',  label: 'Environment' },
  { id: 'licensing',    label: 'Licensing' },
  { id: 'liveagents',   label: 'Live Agents' },
  { id: 'orders',       label: 'Orders' },
  { id: 'builds',       label: 'My Builds' }
];

const INTERNAL_SECTIONS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'attention',  label: 'Needs attention' },
  { id: 'users',      label: 'Users' },
  { id: 'tenants',    label: 'Tenants' },
  { id: 'buildsqueue', label: 'Builds' },
  { id: 'notify',     label: 'Notifications' },
  { id: 'reports',    label: 'Anomalies' },
  { id: 'support',    label: 'Support' },
  { id: 'shiporders', label: 'Orders' },
  { id: 'payments',   label: 'Payments' },
  { id: 'warranty',   label: 'Warranty' },
  { id: 'inventory',  label: 'Inventory' },
  { id: 'catalog',    label: 'Catalog' },
  { id: 'ai',         label: 'AI' }
];

// Team, Environment and Tenants ride the tenant spine, which reaches live
// only when the lanes carry it and TEAM_LIVE is flipped. Until then the live
// lane never shows them; dev always does.
const TEAM_ON = (LANE !== 'live') || TEAM_LIVE;
const TEAM_IDS = new Set(['team', 'environment', 'licensing', 'liveagents', 'tenants']);
function customerSections() { return ACCOUNT_SECTIONS.filter(s => TEAM_ON || !TEAM_IDS.has(s.id)); }
function internalSections() { return INTERNAL_SECTIONS.filter(s => TEAM_ON || !TEAM_IDS.has(s.id)); }

function allSections() {
  return isAdmin() ? [...customerSections(), ...internalSections()] : customerSections();
}

/* LICENSING IS FOR MEMBERS AND ABOVE (2026-09-23, Part 1: "viewers never see the Licensing tab"). The role that
 * counts is the person's role on the team they are looking at (the Team tab's pick, sessionStorage
 * pragoptics_team_id; none picked is their default team). Below member (a viewer, a guest) there is no Licensing:
 * the licensing read routes answer member and above.
 *
 * The ping carries no team role (its user.role is the platform's Users table, where every customer is a viewer), so
 * the role is read from the team view, GET v1/tenant, the call Team and Environment make: once when the panel mounts
 * unless the ping already says the person owns the team in view, and again from every later read of that view
 * through the panel (a switch of team on the Team tab). While the role is NOT known the Licensing entry stays hidden,
 * and opening Licensing by its address waits for the role before it reads anything (a viewer never sees the entry
 * or the member-only reads failing). A read that fails leaves the role unknown; the next visit to Licensing asks
 * again, with a Try again on the page. A person with no team at all keeps the entry: the Licensing page itself says
 * what is missing (being set up, or the plan it starts on). */
const TEAM_PICK_KEY = 'pragoptics_team_id';
const TEAM_VIEW_URL = `${PRAG_API_BASE}/tenant`;
const TEAM_RANK = { owner: 5, admin: 4, developer: 3, member: 2, viewer: 1, guest: 0 };
// role: the membership's role on that team, or 'none' when the view answered that the person has no team at all
let teamRole = { userId: '', teamId: '', role: '' };
let roleRead = null, roleReadKey = '', roleReadError = '', licRoleWait = 0;
function pickedTeamId() { try { return sessionStorage.getItem(TEAM_PICK_KEY) || ''; } catch { return ''; } }
function pingUserId() { return String(cachedPing()?.user?.userId || ''); }
/** The role on the team in view, or null while it is not known. */
function roleInView() {
  const u = cachedPing()?.user || {};
  const picked = pickedTeamId();
  if (u.environmentId && (!picked || picked === u.environmentId)) return 'owner';
  return teamRole.role && teamRole.userId === pingUserId() && teamRole.teamId === picked ? teamRole.role : null;
}
/** Known, and below member: this person has no Licensing on the team in view. */
function licensingBlocked() {
  const r = roleInView();
  return r !== null && r !== 'none' && (TEAM_RANK[r] ?? -1) < TEAM_RANK.member;
}
/** The entry in the sidebar: hidden while the role is unknown, and for anyone below member. */
function licensingHidden() { return TEAM_ON && (roleInView() === null || licensingBlocked()); }
/** Every answer from the team view says the role on the team it was asked about (no tenant= is the default team). */
function noteTeamView(url, options, data) {
  if (String(options?.method || 'GET').toUpperCase() !== 'GET') return;
  let u; try { u = new URL(url); } catch { return; }
  if (`${u.origin}${u.pathname}` !== TEAM_VIEW_URL) return;
  const role = data?.tenant ? String(data?.membership?.role || '').toLowerCase() : 'none';
  teamRole = { userId: pingUserId(), teamId: u.searchParams.get('tenant') || '', role: role || 'unknown' };
  roleReadError = '';
  syncLicensingNav();
}
async function viewApiFetch(url, options = {}) {
  const data = await apiFetch(url, options);
  noteTeamView(url, options, data);
  return data;
}
/**
 * Read the role on the team in view, once per (person, team) while it is not known; callers share the read that is
 * out. A remembered team this account can no longer open (left, removed: 403 or 404) is forgotten for the default
 * team, as the Team tab does. Never throws; a failure leaves the role unknown and its sentence in roleReadError.
 */
function ensureTeamRole() {
  if (!TEAM_ON || !hasLiveSession() || roleInView() !== null) return Promise.resolve();
  const picked = pickedTeamId();
  const key = `${pingUserId()}|${picked}`;
  if (roleRead && roleReadKey === key) return roleRead;
  roleReadKey = key;
  const read = (async () => {
    try { await viewApiFetch(picked ? `${TEAM_VIEW_URL}?tenant=${encodeURIComponent(picked)}` : TEAM_VIEW_URL); }
    catch (ex) {
      if (picked && (ex?.status === 403 || ex?.status === 404)) {
        try { sessionStorage.removeItem(TEAM_PICK_KEY); } catch { /* fine */ }
        try { await viewApiFetch(TEAM_VIEW_URL); return; } catch (ex2) { ex = ex2; }
      }
      roleReadError = ex?.sessionInvalidated ? '' : ((ex?.status === 403 && ex?.data?.error) || friendlyError(ex, 'Could not check your role on this team.'));
    } finally {
      if (roleRead === read) { roleRead = null; roleReadKey = ''; }
    }
  })();
  roleRead = read;
  return read;
}
function syncLicensingNav() {
  const li = document.querySelector('.adm-nav-item[data-acct-section="licensing"]')?.closest('li');
  if (li) li.hidden = licensingHidden();
  if (licensingBlocked() && mounted && activeSection === 'licensing') showSection('profile');
}
/**
 * Licensing was asked for (its entry, its address, a link) while the role on the team in view is not known: the
 * page says it is loading, reads the role, then opens Licensing, or moves a viewer to Profile. A read that failed
 * says so with a Try again that turns and says "Checking…" while it reads.
 */
function waitForLicensingRole(main) {
  const seq = ++licRoleWait;
  const head = `<header class="acct-sec-head"><h2 class="acct-sec-title">Licensing</h2></header>`;
  const retry = document.getElementById('licRoleRetry');
  if (retry && main.contains(retry)) {
    // the panel's one busy helper (cards.js); the answer paints the page anew, the button with it
    busy(retry, 'Checking…');
    showError('licRoleError', '');
  } else {
    main.innerHTML = `${head}<p class="acct-loading">Loading…</p>`;
  }
  ensureTeamRole().then(() => {
    if (seq !== licRoleWait || !mounted || activeSection !== 'licensing' || !hasLiveSession()) return;
    if (roleInView() !== null) return void showSection('licensing');
    main.innerHTML = `${head}
      <p class="acct-error" id="licRoleError" role="alert"></p>
      <div class="acct-actions-row lic-role-retry">${leadBtn({ acct: 'lic-role-retry' }, 'refresh', 'Try again', 'id="licRoleRetry"', 'btn-primary')}</div>`;
    showError('licRoleError', roleReadError || 'Could not check your role on this team.');
  });
}

function icon(id) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;
}

function navItemsHtml(sections) {
  // title carries the label to the icon-only responsive rail, where the text
  // span is hidden and the glyph is all a user gets.
  return sections.map(s => `
    <li ${s.id === 'licensing' && licensingHidden() ? 'hidden' : ''}><button class="adm-nav-item ${s.id === activeSection ? 'is-active' : ''}" type="button"
        data-acct-section="${s.id}" aria-current="${s.id === activeSection ? 'page' : 'false'}"
        title="${escapeHtml(s.label)}" aria-label="${escapeHtml(s.label)}">
      <span class="adm-nav-ico">${icon(s.id)}</span><span>${escapeHtml(s.label)}</span>
    </button></li>
  `).join('');
}

function shellHtml() {
  const admin = isAdmin();
  return `
    <div class="adm-shell">
      <nav class="adm-side" aria-label="Account sections">
        <div class="adm-side-brand">
          <span class="adm-side-avatar">${avatarHtml(cachedPing()?.user, 36)}</span>
          <div class="adm-side-brand-text">
            <span class="adm-side-kicker">Account</span>
            <span class="adm-side-title">${escapeHtml(currentEmail() || 'You')}</span>
          </div>
        </div>
        <ul class="adm-nav">
          ${navItemsHtml(customerSections())}
          ${admin ? `
            <li class="adm-nav-div" aria-hidden="true">Internal</li>
            ${navItemsHtml(internalSections())}
          ` : ''}
        </ul>
        <div class="adm-side-report">
          <span class="adm-side-report-btns">
            <button class="btn btn-sm adm-side-report-btn" type="button" data-acct-action="report-anomaly"
              aria-label="Report an anomaly" data-tip="Report a bug or anything that looked wrong; page details come along"><span class="adm-side-alien" aria-hidden="true"></span><span class="adm-side-btn-text">Report Anomaly</span></button>
            <button class="btn btn-sm adm-side-report-btn is-support" type="button" data-acct-action="support-request"
              aria-label="Ask support" data-tip="Ask about your account, plan, licenses, domains or environment; a person answers by email">${ico('help')}<span class="adm-side-btn-text">Support</span></button>
          </span>
        </div>
        <div class="adm-side-foot">
          <button class="btn acct-signout" type="button" data-acct-action="logout" aria-label="Sign out" data-tip="Sign out of this browser">${ico('logOut')}<span class="adm-side-btn-text">Sign out</span></button>
        </div>
      </nav>
      <main class="adm-main" id="acctMain"><!-- section --></main>
    </div>
  `;
}

/* ================================================================
   ACCOUNT SECTIONS (every signed-in customer)
   ================================================================ */

/* ---------- profile (email addresses) ---------- */

function aliasRowHtml(a) {
  const primary = a.isPrimary || a.primary;
  const verified = a.state === 'VERIFIED' || a.verified === true;
  const pending = a.state === 'PENDING' || a.verified === false;
  return `
    <li class="acct-alias" data-alias-id="${escapeHtml(a.aliasId || '')}">
      <div class="acct-alias-main">
        <span class="acct-alias-email">${escapeHtml(a.displayEmail || a.email || a.value || '')}</span>
        <span class="acct-alias-tags">
          ${primary ? '<span class="acct-tag is-primary">Primary</span>' : ''}
          ${verified && !primary ? '<span class="acct-tag is-verified">Verified</span>' : ''}
          ${pending ? '<span class="acct-tag is-pending">Unverified</span>' : ''}
        </span>
      </div>
      <div class="acct-alias-actions act-row">
        ${pending ? iconBtn({ acct: 'verify-alias' }, 'hash', 'Enter the code we emailed to it', `data-alias="${escapeHtml(a.aliasId)}" data-claim="${escapeHtml(a.claimId || '')}"`, 'btn-primary') : ''}
        ${verified && !primary ? iconBtn({ acct: 'make-primary' }, 'star', 'Make this the primary address', `data-alias="${escapeHtml(a.aliasId)}"`) : ''}
        ${!primary ? iconBtn({ acct: 'remove-alias' }, 'trash', 'Remove this address (you confirm with a code)', `data-alias="${escapeHtml(a.aliasId)}"`, 'is-risky') : ''}
      </div>
    </li>
  `;
}

// The theme lives on the account (v1/account/preferences, every tier): apply
// it here at once, remember it, and keep the cached ping honest so a re-sync
// never undoes the click. A save that fails leaves the theme applied for this
// browser and says so.
async function setThemePreference(theme, btn = null) {
  if (btn?.disabled) return;
  const t = theme === 'light' ? 'light' : 'dark';
  applyTheme(t);
  const both = [...document.querySelectorAll('[data-acct-action="theme-set"]')];
  both.forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === t ? 'true' : 'false'));
  showError('acctThemeError', '');
  // the pressed button says it is saving; the other waits for the answer
  const done = busy(btn, 'Saving…', { hold: both.filter(b => b !== btn), why: 'Wait for the theme being saved' });
  try {
    await apiFetch(PREFS_URL, { method: 'POST', body: JSON.stringify({ theme: t }) });
    rememberUserTheme(t);
  } catch (ex) {
    if (ex?.status === 404) { showError('acctThemeError', 'Applied here. This lane does not remember the choice yet.'); return; }
    showError('acctThemeError', friendlyError(ex, 'Applied here, but the choice could not be saved to your account.'));
  } finally { done(); }
}

// The starfield switch, remembered on the account beside the theme; the
// canvas goes at once, the save follows, a failed save says so and leaves
// the choice applied here.
async function setStarfieldPreference(value) {
  const v = value === 'off' ? 'off' : 'on';
  applyStarfield(v);
  document.querySelectorAll('[data-acct-action="starfield-set"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.starfield === v ? 'true' : 'false'));
  const sw = document.getElementById('acctStarsSwitch');
  const word = sw?.closest('.ev-switch')?.querySelector('.ev-switch-text');
  if (sw) sw.checked = v === 'on';
  showError('acctThemeError', '');
  // the switch waits for its save and says so in its own words
  if (sw) sw.disabled = true;
  if (word) word.textContent = 'Saving…';
  try {
    await apiFetch(PREFS_URL, { method: 'POST', body: JSON.stringify({ starfield: v }) });
    rememberUserPreference('starfield', v);
  } catch (ex) {
    if (ex?.status === 404 || ex?.status === 400) { showError('acctThemeError', 'Applied here. This lane does not remember the stars choice yet.'); return; }
    showError('acctThemeError', friendlyError(ex, 'Applied here, but the choice could not be saved to your account.'));
  } finally {
    if (sw) sw.disabled = false;
    if (word) word.textContent = `Starfield ${v}`;
  }
}

/* ---------- the one-time mail offer (2026-09-23) ---------- */
// Right after a paid plan settles, the wizard sets a flag for this browser session; Profile opens with the offer
// until it is answered. Set up mail goes to Licensing (the account, the Microsoft details, then Turn on mail); Not now
// puts it away. Either answer is kept for this account in this browser, so it is offered once.
function mailOfferKey() { return `pragoptics_mail_offer_done:${cachedPing()?.user?.userId || cachedPing()?.user?.email || ''}`; }
function mailOfferWanted() {
  try { return sessionStorage.getItem('pragoptics_offer_mail') === '1' && localStorage.getItem(mailOfferKey()) !== '1'; } catch { return false; }
}
function mailOfferDone() {
  try { localStorage.setItem(mailOfferKey(), '1'); sessionStorage.removeItem('pragoptics_offer_mail'); } catch { /* shown again next session */ }
  document.getElementById('acctMailOffer')?.remove();
}
function mailOfferHtml() {
  if (!mailOfferWanted() || !TEAM_ON) return '';
  return `
    <section class="acct-card acct-offer" id="acctMailOffer">
      <span class="ev-card-ico">${ico('mail')}</span>
      <div class="acct-offer-main">
        <h3 class="acct-card-h">Mail for your team</h3>
        <p class="acct-card-note">Your plan includes an Exchange Online mailbox for every seat, nothing extra to pay. It is set up on Licensing: open the licensing account, name your Microsoft tenant, then Turn on mail.</p>
        <div class="acct-actions-row act-row">
          ${leadBtn({ acct: 'mail-offer-go' }, 'mail', 'Set up mail', '', 'btn-primary')}
          ${iconBtn({ acct: 'mail-offer-later' }, 'x', 'Not now; it stays on the Licensing tab')}
        </div>
      </div>
    </section>`;
}

/* ---------- the name on the account (2026-09-23, finding F16) ----------
 * The person's first and last name, read and saved through v1/account/preferences: GET answers firstName, lastName
 * and hasName; POST { firstName, lastName } saves both parts together. An agreement the person accepts for their
 * business (the Microsoft Customer Agreement on Licensing) records this name; nobody types a name anywhere else. The
 * server checks each part (1 to 60 characters: letters of any alphabet, spaces, hyphens, apostrophes and periods,
 * starting with a letter) and names the part it refuses (400 NAME_INVALID with `field`); the same rule runs here first,
 * so a slip is said before anything is sent. What was typed is never rewritten beyond trimming its spaces. */
const NAME_MAX = 60;
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'’-]*$/u;
let savedName = null;   // { firstName, lastName } as the account holds it; null until read, or on a lane without it
function squeezeName(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function nameProblem(v, word) {
  if (!v) return `Give your ${word}.`;
  if (v.length > NAME_MAX || !NAME_RE.test(v)) return `Your ${word} can have letters, spaces, hyphens, apostrophes and periods, up to ${NAME_MAX} characters, starting with a letter.`;
  return '';
}
function nameCardHtml() {
  return cardHtml({ key: 'profile:name', icon: 'user', title: 'Your name', summary: 'loading', body: `
      <div class="acct-name-fields">
        <label class="acct-name-field"><span class="acct-label">First name</span>
          <input class="acct-input" id="acctFirstName" type="text" autocomplete="given-name" spellcheck="false"></label>
        <label class="acct-name-field"><span class="acct-label">Last name</span>
          <input class="acct-input" id="acctLastName" type="text" autocomplete="family-name" spellcheck="false"></label>
      </div>
      <div class="acct-add-row acct-name-actions">
        ${leadBtn({ acct: 'name-save' }, 'check', 'Save name', '', 'btn-primary')}
        <span class="ev-status" id="acctNameStatus" aria-live="polite"></span>
      </div>
      <p class="acct-card-note ev-dom-door">Letters, spaces, hyphens, apostrophes and periods, up to ${NAME_MAX} characters each. Agreements you accept for your business, such as the Microsoft Customer Agreement, record this name.</p>
      <p class="acct-error" id="acctNameError" hidden></p>` });
}
function nameSummary() {
  const n = savedName;
  setCardSummary('profile:name', n && n.firstName && n.lastName ? escapeHtml(`${n.firstName} ${n.lastName}`) : 'not given yet');
}
function setNameStatus(text) { const el = document.getElementById('acctNameStatus'); if (el) el.textContent = text || ''; }
/** The fields and Save stay shut, their tip saying why (a lane without the name, or a read that failed). */
function shutName(why) {
  for (const el of [document.getElementById('acctFirstName'), document.getElementById('acctLastName'), document.querySelector('[data-acct-action="name-save"]')]) {
    if (!el) continue;
    el.disabled = true;
    el.setAttribute('data-tip', why);
  }
}
async function loadName() {
  const first = document.getElementById('acctFirstName'), last = document.getElementById('acctLastName');
  const save = document.querySelector('[data-acct-action="name-save"]');
  if (!first || !last) return;
  showError('acctNameError', '');
  // nothing is typed over and nothing is saved until the name the account holds is on screen
  const done = busy(save, 'Reading your name…', { hold: [first, last], why: 'Reading your name…' });
  let d = null, failed = null;
  try { d = await apiFetch(PREFS_URL); } catch (ex) { failed = ex; }
  finally { done(); }
  if (!first.isConnected) return;
  if (failed) {
    setCardSummary('profile:name', 'not read');
    showError('acctNameError', failed?.sessionInvalidated ? '' : friendlyError(failed, 'Could not read your name.'));
    shutName('Your name could not be read; open Profile again to read it');
    return;
  }
  // a lane whose preferences carry no name keeps the fields shut rather than offering a save it would refuse
  if (!d || !('firstName' in d || 'hasName' in d)) {
    savedName = null;
    setCardSummary('profile:name', 'not on this lane');
    showError('acctNameError', 'This lane does not keep a name on the account yet. Deploy the backend that carries it, then reload.');
    shutName('This lane does not keep a name on the account yet');
    return;
  }
  savedName = { firstName: String(d.firstName || ''), lastName: String(d.lastName || '') };
  first.value = savedName.firstName;
  last.value = savedName.lastName;
  nameSummary();
}
async function saveName(btn) {
  const first = document.getElementById('acctFirstName'), last = document.getElementById('acctLastName');
  if (!first || !last || btn.disabled) return;
  showError('acctNameError', ''); setNameStatus('');
  first.removeAttribute('aria-invalid'); last.removeAttribute('aria-invalid');
  const firstName = squeezeName(first.value), lastName = squeezeName(last.value);
  const bad = nameProblem(firstName, 'first name') ? [first, nameProblem(firstName, 'first name')]
    : nameProblem(lastName, 'last name') ? [last, nameProblem(lastName, 'last name')] : null;
  if (bad) { showError('acctNameError', bad[1]); bad[0].setAttribute('aria-invalid', 'true'); bad[0].focus(); return; }
  if (savedName && firstName === savedName.firstName && lastName === savedName.lastName) { setNameStatus('That is already the name on your account.'); return; }
  const done = busy(btn, 'Saving…', { hold: [first, last], why: 'Wait for your name being saved' });
  let wrong = null;
  try {
    const r = await apiFetch(PREFS_URL, { method: 'POST', body: JSON.stringify({ firstName, lastName }) });
    savedName = { firstName: String(r?.firstName ?? firstName), lastName: String(r?.lastName ?? lastName) };
    first.value = savedName.firstName;
    last.value = savedName.lastName;
    // the cached ping follows, so the rest of the panel reads the name the account now holds
    rememberUserPreference('firstName', savedName.firstName);
    rememberUserPreference('lastName', savedName.lastName);
    rememberUserPreference('hasName', true);
    nameSummary();
    setNameStatus('Saved.');
  } catch (ex) {
    const field = String(ex?.data?.field || '');
    wrong = field === 'firstName' ? first : field === 'lastName' ? last : null;
    showError('acctNameError', ex?.sessionInvalidated ? '' : (ex?.data?.error || friendlyError(ex, 'Your name could not be saved. Nothing changed.')));
  } finally { done(); }
  if (wrong) { wrong.setAttribute('aria-invalid', 'true'); wrong.focus(); }
}

async function renderProfile(main) {
  const theme = getTheme(), stars = getStarfield();
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Profile</h2></header>
    ${mailOfferHtml()}
    <div class="acct-grid">
    ${cardHtml({ key: 'profile:photo', icon: 'user', title: 'Your photo', body: `
      <div class="av-edit">
        ${avatarHtml(cachedPing()?.user, 60)}
        <div class="av-edit-main">
          <p class="acct-card-note ev-dom-door">A photo of you, so the people you interact with see who they are talking to. No photo shows the default alien, and it carries to the studio.</p>
          <div class="acct-add-row act-row">
            <label class="btn btn-sm btn-lead btn-primary av-pick">${ico('upload')}<span>Choose photo</span><input type="file" id="acctAvatarFile" accept="image/*" hidden></label>
            ${cachedPing()?.user?.avatar ? iconBtn({ acct: 'avatar-remove' }, 'trash', 'Remove the photo, back to the alien') : ''}
          </div>
          <p class="acct-error" id="acctAvatarError" hidden></p>
        </div>
      </div>` })}
    ${nameCardHtml()}
    ${cardHtml({ key: 'profile:appearance', icon: 'sun', title: 'Appearance', summary: `${escapeHtml(theme)} · stars ${escapeHtml(stars)}`, body: `
      <div class="acct-seg" role="group" aria-label="Theme">
        <button class="btn btn-sm acct-theme-btn" type="button" data-acct-action="theme-set" data-theme="dark" aria-pressed="${theme === 'dark' ? 'true' : 'false'}">${DARK_LABEL}${moonSvg('acct-theme-ico')}</button>
        <button class="btn btn-sm acct-theme-btn" type="button" data-acct-action="theme-set" data-theme="light" aria-pressed="${theme === 'light' ? 'true' : 'false'}">${LIGHT_LABEL}${sunSvg('acct-theme-ico')}</button>
      </div>
      <label class="ev-switch acct-stars-switch">
        <input type="checkbox" id="acctStarsSwitch" data-acct-stars ${stars === 'on' ? 'checked' : ''}>
        <span class="ev-switch-track" aria-hidden="true"><span class="ev-switch-thumb"></span></span>
        <span class="ev-switch-text">Starfield ${stars === 'on' ? 'on' : 'off'}</span>
      </label>
      <p class="acct-card-note ev-dom-door">Remembered on your account, so the site looks the same wherever you sign in.</p>
      <p class="acct-error" id="acctThemeError" hidden></p>` })}
    ${cardHtml({ key: 'profile:emails', icon: 'mail', title: 'Email addresses', summary: 'loading', body: `
      <ul class="acct-alias-list" id="acctAliasList"><li class="acct-loading">Loading…</li></ul>
      <div class="acct-add-row">
        <input class="acct-input" id="acctNewEmail" type="email" autocomplete="email" placeholder="add another email…" aria-label="New email address">
        ${iconBtn({ acct: 'add-alias' }, 'plus', 'Add this address (we email it a code)', '', 'btn-primary')}
      </div>
      <p class="acct-card-note ev-dom-door">Any verified address signs you in. The primary one gets account and recovery mail.</p>
      <p class="acct-error" id="acctProfileError" hidden></p>` })}
    ${cardHtml({ key: 'profile:twofactor', icon: 'shield', title: 'Two-factor', summary: 'loading', body: `
      <div class="acct-alias-list" id="acctPasskeyList"><span class="acct-loading">Loading…</span></div>
      <div class="acct-add-row act-row">
        ${leadBtn({ acct: 'add-passkey' }, 'fingerprint', 'Add passkey', 'data-tip="Registers a passkey on this device; you confirm with your password"', 'btn-primary')}
        ${iconBtn({ acct: 'reset-2fa' }, 'refresh', 'Reset the authenticator: clears it and sets up a new one (for a new phone)')}
      </div>
      <p class="acct-card-note ev-dom-door">Sign-in always needs a second step: an authenticator app, a passkey, or both. Either one completes it.</p>
      <p class="acct-error" id="acct2faError" hidden></p>` })}
    ${cardHtml({ key: 'profile:phone', icon: 'phone', title: 'Mobile number', summary: 'loading', body: `
      <div class="acct-alias-list" id="acctPhoneState"><span class="acct-loading">Loading…</span></div>
      <div class="acct-add-row">
        <input class="acct-input" id="acctNewPhone" type="tel" autocomplete="tel" placeholder="+1 555 123 4567" aria-label="Mobile number">
        ${iconBtn({ acct: 'phone-start' }, 'send', 'Text a code to this number', '', 'btn-primary')}
      </div>
      <p class="acct-card-note ev-dom-door">For sign-in codes by text. A number counts once you confirm a code sent to it.</p>
      <p class="acct-error" id="acctPhoneError" hidden></p>` })}
    ${cardHtml({ key: 'profile:notify', icon: 'bell', title: 'Notifications', summary: 'email to your primary address', body: `
      <div id="acctNotifyPrefs"><span class="acct-loading">Loading…</span></div>
      <div class="acct-add-row">
        ${leadBtn({ acct: 'notify-save' }, 'check', 'Save', '', 'btn-primary')}
      </div>
      <p class="acct-card-note ev-dom-door">Order, warranty and security mail always comes to your primary address. Texts per category once your number is verified.</p>
      <p class="acct-error" id="acctNotifyError" hidden></p>` })}
    ${cardHtml({ key: 'profile:password', icon: 'lock', title: 'Password', summary: 'change it any time', body: `
      <div class="acct-add-row">
        ${leadBtn({ acct: 'change-password' }, 'lock', 'Change password')}
      </div>
      <p class="acct-card-note ev-dom-door">Changing it signs out every other device.</p>
      <p class="acct-error" id="acctPasswordError" hidden></p>` })}
    ${cardHtml({ key: 'profile:close', icon: 'alert', title: 'Close account', summary: 'permanent', danger: true, body: `
      <p class="acct-card-note ev-dom-door">Closing is permanent: it signs you out everywhere, removes your sign-in, and ends any subscription of yours now, with no refund for the rest of a paid period. If you own your environment, closing also takes down every site it published, and a Microsoft license still under commitment is paid to the end of its commitment on your final bill; the amount is shown before you confirm. If you are a member of someone else's team, only your own sign-in goes: the team keeps its environment and its sites as they are. To keep service until the period ends, cancel on Billing instead.</p>
      <div class="acct-add-row">
        ${leadBtn({ acct: 'close-account' }, 'alert', 'Close my account', 'data-tip="Opens a confirmation step; nothing changes until you confirm there"', 'is-danger')}
      </div>
      <p class="acct-error" id="acctCloseError" hidden></p>` })}
    </div>
    ${platformLaneCardHtml()}
  `;
  packGrid(main.querySelector('.acct-grid'));
  const nameRead = loadName();
  const aliasData = await loadAliases();
  await loadPhone(aliasData);
  await loadPasskeys();
  await loadNotifyPrefs();
  await nameRead;
}

/* The profile photo (2026-10-10): a picked file is shrunk client-side and saved; removing it returns the alien. */
async function onAvatarPick(input) {
  const file = input?.files?.[0];
  try { input.value = ''; } catch { /* ignore */ }
  if (!file) return;
  showError('acctAvatarError', '');
  try {
    const dataUrl = await fileToAvatar(file);
    await saveAvatar(viewApiFetch, dataUrl);
    refreshAfterAvatar();
  } catch (e) { showError('acctAvatarError', friendlyError(e) || 'Could not set that photo.'); }
}
async function removeAvatar(btn) {
  showError('acctAvatarError', '');
  const done = busy(btn, 'Removing…');
  try { await saveAvatar(viewApiFetch, ''); refreshAfterAvatar(); }
  catch (e) { showError('acctAvatarError', friendlyError(e) || 'Could not remove the photo.'); }
  finally { done(); }
}
function refreshAfterAvatar() {
  const chip = document.querySelector('.adm-side-avatar');
  if (chip) chip.innerHTML = avatarHtml(cachedPing()?.user, 36);
  const main = document.getElementById('acctMain');
  if (main && activeSection === 'profile') renderProfile(main);
}

/* ---------- close account ---------- */

// What closing would charge is read first (decision 19, Cameron 2026-09-23): an owner holding a Microsoft license still
// under commitment sees each one, with its license seats, its commitment end and what is left of it, and the total
// that goes on the final bill, before confirming anything. PragOptics never absorbs a commitment. Then a code goes to
// the primary address (the same request-code flow the alias removal uses), and the confirmation modal collects the
// rest. The POST happens inside the modal so a wrong password or code keeps it open with the server's own reason;
// only a success replaces the section.
//
//   GET  v1/auth/account/close/summary -> { owner, lines: [{ lineId, name, seats, termWord, commitmentEndsAt,
//        remainingCents, remainingText }], totalCents, totalText, paidCents, confirmNeeded, sentence }
//   POST v1/auth/account/close { password, code, requestId, confirm: "CLOSE", acceptRemainingCents }
//        -> { ok, closed, finalChargeCents }
async function closeAccount(btn) {
  if (btn?.disabled) return;
  showError('acctCloseError', '');
  let done = busy(btn, 'Checking what closing charges…');
  let summary = null;
  try {
    summary = await apiFetch(CLOSE_SUMMARY_URL);
  } catch (ex) {
    // a lane without the read closes as before: its close route asks for no amount to be confirmed, and a route that
    // does asks with the amount itself (the modal shows it then)
    if (ex?.status !== 404) {
      done();
      showError('acctCloseError', ex?.sessionInvalidated ? '' : (ex?.data?.error || friendlyError(ex, 'Could not read what closing would charge. Nothing was changed; try again.')));
      return;
    }
  }
  done();
  done = busy(btn, 'Sending the code…');
  let requestId = '';
  try {
    const r = await apiFetch(REQUEST_CODE_URL, { method: 'POST', body: JSON.stringify({ email: currentEmail(), purpose: 'close' }) });
    requestId = r?.requestId || '';
  } catch (ex) {
    showError('acctCloseError', friendlyError(ex, 'Could not send the confirmation code.'));
    return;
  } finally { done(); }
  const result = await closeAccountPrompt({ email: currentEmail(), requestId, summary });
  if (result === 'billing') { showSection('subscription'); return; }
  if (!result) return;
  const main = document.getElementById('acctMain');
  if (main) main.innerHTML = accountClosedHtml(result.finalChargeCents);
  // The session behind this panel is gone; the next entry must rebuild from
  // whatever signs in next, never from this shell.
  mounted = false;
  cache.users = null;
}

function accountClosedHtml(finalChargeCents = 0) {
  const charged = Number(finalChargeCents) > 0;
  return `
    <div class="acct-closed">
      <section class="acct-card acct-closed-card">
        <h2 class="acct-sec-title">Your account is closed.</h2>
        ${charged ? `<p class="acct-card-note">Your final bill of ${escapeHtml(usdCents(finalChargeCents))}, for the rest of your Microsoft license commitments and the sales tax on it, was charged to the card on file. The closing email lists it.</p>` : ''}
        <p class="acct-card-note">Thank you for using PragOptics™.</p>
        <button class="cta" type="button" data-acct-action="logout">Done</button>
      </section>
    </div>
  `;
}

/** The licenses a closing account still owes, and the total for the final bill, as the closing modal shows them. */
function closeCommitHtml(s) {
  const total = Math.max(0, Math.round(Number(s?.totalCents) || 0));
  if (!total) return '';
  const lines = (Array.isArray(s.lines) ? s.lines : []).filter(l => l && Number(l.remainingCents) > 0);
  const gross = lines.reduce((n, l) => n + Math.round(Number(l.remainingCents) || 0), 0);
  // the money plan (2026-09-24): sales tax at the owner's address, from Stripe's own preview of the final bill (37(12))
  const tax = Math.max(0, Math.round(Number(s.taxCents) || 0));
  const subtotal = Number.isFinite(Number(s.subtotalCents)) ? Math.round(Number(s.subtotalCents)) : total - tax;
  // an earlier try to close that already charged part of it: what it took comes off (the server's total is net of it)
  const before = Math.max(0, gross - subtotal);
  const totalText = String(s.totalText || usdCents(total));
  return `
    <section class="ca-commit" aria-labelledby="caCommitH">
      <h4 class="ca-commit-h" id="caCommitH">Microsoft licenses still under commitment</h4>
      <p class="acct-modal-note">Each is paid for until its commitment ends. Closing now puts the rest of each on your final bill, with anything still owed and sales tax, charged to the card on file before anything is closed.</p>
      <ul class="ca-commit-list">
        ${lines.map(l => {
          const seats = Math.max(0, Number(l.seats) || 0);
          // decision 21: a failed license payment still owed; decision 38: the included mailboxes' annual term past the plan
          const meta = l.owed ? 'what its failed payment left owed'
            : [`${seats} license seat${seats === 1 ? '' : 's'}`, l.termWord ? String(l.termWord) : '', dayWord(l.commitmentEndsAt) ? `${l.included ? "Microsoft's term ends" : 'commitment ends'} ${dayWord(l.commitmentEndsAt)}` : ''].filter(Boolean).join(' · ');
          return `
          <li class="ca-commit-row">
            <div class="ca-commit-main"><span class="ca-commit-name">${escapeHtml(l.name || 'Microsoft license')}</span><span class="ca-commit-meta">${escapeHtml(meta)}</span></div>
            <span class="ca-commit-amt">${escapeHtml(String(l.remainingText || usdCents(l.remainingCents)))}</span>
          </li>`;
        }).join('')}
        ${before > 0 ? `
          <li class="ca-commit-row is-less">
            <div class="ca-commit-main"><span class="ca-commit-name">Already charged by an earlier try to close</span></div>
            <span class="ca-commit-amt">-${escapeHtml(usdCents(before))}</span>
          </li>` : ''}
        ${tax > 0 ? `
          <li class="ca-commit-row">
            <div class="ca-commit-main"><span class="ca-commit-name">Sales tax</span><span class="ca-commit-meta">at your billing address</span></div>
            <span class="ca-commit-amt">${escapeHtml(usdCents(tax))}</span>
          </li>` : ''}
      </ul>
      <div class="ca-commit-total"><span>Charged on your final bill</span><strong>${escapeHtml(totalText)}</strong></div>
      <label class="acct-check" for="caAcceptCharge">
        <input type="checkbox" id="caAcceptCharge">
        <span>I accept the final charge of ${escapeHtml(totalText)}${tax > 0 ? ', sales tax included,' : ''} to the card on file</span>
      </label>
    </section>`;
}

/**
 * Who a closing touches, in the owner's own words (the summary's owner: the Users row's environment is theirs). The
 * closing takes down only the sites of the environment the account owns (agreement 13.3; the backend's owner check), so
 * a team member reads that the team keeps its environment and sites. `owner` null: a lane without the summary read.
 */
function closeWhoWords(owner) {
  if (owner === true) return 'Every site your environment published is taken down.';
  if (owner === false) return 'Only your own sign-in goes: a team you belong to keeps its environment and its sites as they are.';
  return 'If you own your environment, every site it published is taken down. A team you belong to keeps its environment and its sites as they are.';
}

/** The closing modal: the permanence, who it touches, the final bill (closeCommitHtml), the proofs and the button. */
function closePromptHtml({ email, s, goWord, owner }) {
  return `
      <div class="acct-modal-mask" data-ca-close></div>
      <div class="acct-modal is-wide" role="dialog" aria-modal="true" aria-label="Close your account">
        <h3 class="acct-modal-h">Close your account</h3>
        <p class="acct-modal-note">This is permanent. You are signed out everywhere, your sign-in is removed, and any subscription ends now. There is no refund for the rest of a paid period. ${escapeHtml(closeWhoWords(owner))}</p>
        <div id="caCommit">${closeCommitHtml(s)}</div>
        <label class="acct-check" for="caExported">
          <input type="checkbox" id="caExported">
          <span>I have exported anything I want to keep</span>
        </label>
        <label class="acct-label" for="caConfirm">Type CLOSE to confirm</label>
        <input class="acct-input" id="caConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CLOSE">
        <label class="acct-label" for="caPass">Account password</label>
        <input class="acct-input" id="caPass" type="password" autocomplete="current-password" placeholder="Your password">
        <label class="acct-label" for="caCode">Verification code</label>
        <input class="acct-input" id="caCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" maxlength="6">
        <div class="ca-code-row">
          <p class="acct-modal-note acct-modal-hint" id="caCodeNote">We emailed a code to ${escapeHtml(email)}.</p>
          <button class="btn btn-sm btn-ghost" type="button" data-ca-resend>Send a new code</button>
        </div>
        <p class="acct-error" id="caError" hidden></p>
        <div class="acct-actions-row ca-error-acts" id="caErrorActs" hidden></div>
        <div class="acct-modal-actions">
          <button class="btn btn-ghost" type="button" data-ca-close>Cancel</button>
          <button class="cta btn-danger-solid" type="button" data-ca-confirm disabled
            title="Enabled once the boxes are checked and CLOSE, your password, and the code are filled in">${escapeHtml(goWord)}</button>
        </div>
      </div>`;
}

// Resolves { finalChargeCents } once the server confirms the close, 'billing' when the person goes to Billing to fix
// the card, null on cancel. The confirm button stays disabled until every proof is present: the export
// acknowledgement, the literal word CLOSE, the password, the emailed code, and, when licenses are still under
// commitment, the acceptance of the final charge. The amount accepted is the one on screen, sent as
// acceptRemainingCents; when it moved since it was read, the server answers with the new one (before it checks the
// password or the code, so the code stays good) and the modal shows it to accept again. The pieces: the markup
// (closePromptHtml), a new code (sendNewCode), the close (submitClose) and its refusals (applyCloseRefusal), sharing
// one ctx; the host and its listeners are cards.js openModal's.
function closeAccountPrompt({ email, requestId, summary = null }) {
  return new Promise((resolve) => {
    const ctx = { email, requestId, working: false, s: summary && Number(summary.totalCents) > 0 ? summary : null };
    ctx.totalOf = () => Math.max(0, Math.round(Number(ctx.s?.totalCents) || 0));
    ctx.goWord = () => (ctx.totalOf() > 0 ? closeChargeWord(ctx.s, { owner: true }) : 'Close my account');
    const owner = summary && typeof summary.owner === 'boolean' ? summary.owner : null;
    const m = openModal('acctCloseAccount', closePromptHtml({ email, s: ctx.s, goWord: ctx.goWord(), owner }), { onClick, onInput, onChange: onInput, focus: '#caConfirm' });
    const $ = m.$;
    Object.assign(ctx, {
      $, go: $('[data-ca-confirm]'), cancel: $('.acct-modal-actions [data-ca-close]'), resend: $('[data-ca-resend]'),
      code: $('#caCode'), note: $('#caCodeNote'),
      close: (val) => { m.close(); resolve(val); }
    });
    ctx.accepted = () => ctx.totalOf() === 0 || $('#caAcceptCharge')?.checked === true;
    ctx.ready = () => $('#caExported').checked && $('#caConfirm').value === 'CLOSE' && $('#caPass').value.length > 0 && /^\d{6}$/.test(ctx.code.value.trim()) && ctx.accepted();
    ctx.say = (msg) => { const er = $('#caError'); er.textContent = msg || ''; er.hidden = !msg; };
    ctx.sayActs = (html) => { const acts = $('#caErrorActs'); acts.innerHTML = html || ''; acts.hidden = !html; };
    ctx.paintCommit = () => { $('#caCommit').innerHTML = closeCommitHtml(ctx.s); ctx.go.textContent = ctx.goWord(); ctx.go.disabled = !ctx.ready(); };
    function onInput() { if (!ctx.working) ctx.go.disabled = !ctx.ready(); }
    function onClick(e) {
      if (e.target.closest('[data-ca-close]')) { if (!ctx.working) ctx.close(null); return; }
      if (e.target.closest('[data-ca-billing]')) { if (!ctx.working) ctx.close('billing'); return; }
      const again = e.target.closest('[data-ca-resend]');
      if (again) return void sendNewCode(again, ctx);
      if (e.target.closest('[data-ca-confirm]') && !ctx.working && ctx.ready()) submitClose(ctx);
    }
  });
}

/** A new code to the primary address: the last one expired, or a refused charge used it up. */
async function sendNewCode(btn, ctx) {
  if (ctx.working || btn.disabled) return;
  ctx.say(''); ctx.sayActs('');
  const done = busy(btn, 'Sending…');
  try {
    const r = await apiFetch(REQUEST_CODE_URL, { method: 'POST', body: JSON.stringify({ email: ctx.email, purpose: 'close' }) });
    ctx.requestId = r?.requestId || ctx.requestId;
    ctx.code.value = '';
    ctx.note.textContent = `We emailed a new code to ${ctx.email}.`;
    ctx.code.focus();
  } catch (ex) {
    ctx.say(friendlyError(ex, 'Could not send a new code.'));
  } finally { done(); ctx.go.disabled = !ctx.ready(); }
}

/** The close itself, the button busy and Cancel and Send a new code held while it is out. */
async function submitClose(ctx) {
  ctx.working = true;
  ctx.say(''); ctx.sayActs('');
  const total = ctx.totalOf();
  const done = busy(ctx.go, total > 0 ? 'Charging and closing…' : 'Closing…', { hold: [ctx.cancel, ctx.resend], why: 'Wait for the answer' });
  try {
    const r = await apiFetch(CLOSE_ACCOUNT_URL, {
      method: 'POST',
      body: JSON.stringify({ password: ctx.$('#caPass').value, code: ctx.code.value.trim(), requestId: ctx.requestId, confirm: 'CLOSE', ...(total > 0 ? { acceptRemainingCents: total } : {}) })
    });
    done();
    ctx.close({ finalChargeCents: Number(r?.finalChargeCents) || 0 });
  } catch (ex) {
    done();
    ctx.working = false;
    applyCloseRefusal(ex, ctx);
  }
}

/** A refused close: a final bill that moved is shown to accept again; a spent code is cleared; a card problem offers Billing. */
function applyCloseRefusal(ex, ctx) {
  const bill = ex?.status === 409 ? closeBillOf(ex) : null;
  if (bill) {
    // the amount on screen was not the one the server holds now: the new one replaces it, to accept again
    ctx.s = bill.totalCents > 0 ? { ...bill, lines: bill.lines.length ? bill.lines : (ctx.s?.lines || []) } : null;
    ctx.paintCommit();
  }
  // The route checks the amount before the password and the code, so a code survives that answer. A refusal after both
  // proofs (the final charge declined or not taken, an amount that moved while it was being charged, the plan not
  // ended) used the code up: the field clears and a new code is one press away.
  const spent = ex?.status === 402 || ex?.status >= 500 || (bill && !bill.beforeProofs);
  if (spent) {
    ctx.code.value = '';
    ctx.note.textContent = 'That code was used. Press Send a new code for another, then close again.';
  }
  ctx.say(friendlyError(ex, 'Could not close your account.', { passwordFlow: true }));
  const code = ex?.data?.code;
  if (code === 'CARD_DECLINED' || code === 'NO_PAYMENT_METHOD') ctx.sayActs(leadBtn({ ca: 'billing' }, 'card', 'Open Billing', 'data-ca-billing', 'btn-primary'));
  ctx.go.disabled = !ctx.ready();
}

/* ---------- mobile number ---------- */

// Three states: verified, unverified, and "verify again" (the server has asked
// for a fresh confirmation of a number it already knows; until then the number
// does not count for sign-in codes).
function phoneStateHtml({ phone, phoneVerified, reverifyDue }) {
  const reverifyNote = reverifyDue
    ? `<p class="acct-card-note acct-phone-reverify">For security, the mobile number on this account needs to be verified again. Verify it, or remove it.</p>`
    : '';
  if (!phone) {
    return reverifyDue ? reverifyNote : `<span class="acct-card-note">No mobile number on this account.</span>`;
  }
  const tag = reverifyDue
    ? '<span class="acct-tag is-pending">Verify again</span>'
    : phoneVerified
      ? '<span class="acct-tag is-verified">Verified</span>'
      : '<span class="acct-tag is-pending">Unverified</span>';
  return `
    ${reverifyNote}
    <div class="acct-alias">
      <div class="acct-alias-main">
        <span class="acct-alias-email">${escapeHtml(phone)}</span>
        <span class="acct-alias-tags">${tag}</span>
      </div>
      <div class="acct-alias-actions act-row">
        ${reverifyDue ? iconBtn({ acct: 'phone-reverify' }, 'send', 'Verify again: texts a new code to this number', `data-phone="${escapeHtml(phone)}"`, 'btn-primary') : ''}
        ${iconBtn({ acct: 'phone-remove' }, 'trash', 'Remove this number', '', 'is-risky')}
      </div>
    </div>
  `;
}

/** The phone card, from the address list's answer when the caller already has it (the Profile render does). */
async function loadPhone(known = null) {
  const host = document.getElementById('acctPhoneState');
  if (!host) return;
  try {
    const data = known || await apiFetch(ALIASES_URL);
    const reverifyDue = data.phoneReverifyRequired === true;
    host.innerHTML = phoneStateHtml({ phone: data.phone || '', phoneVerified: data.phoneVerified === true, reverifyDue });
    setCardSummary('profile:phone', escapeHtml(!data.phone ? 'none yet' : reverifyDue ? `${data.phone} · confirm again` : data.phoneVerified === true ? `${data.phone} · verified` : `${data.phone} · not confirmed`));
    // No number left to re-send to: the note explains, the input is where the
    // next step happens.
    if (reverifyDue && !data.phone) document.getElementById('acctNewPhone')?.focus();
  } catch {
    host.innerHTML = `<span class="acct-card-note">Could not load the number.</span>`;
  }
}

async function startPhone(btn = null) {
  if (btn?.disabled) return;
  const input = document.getElementById('acctNewPhone');
  const phone = (input?.value || '').trim();
  showError('acctPhoneError', '');
  if (!phone) { showError('acctPhoneError', 'Enter a mobile number.'); return; }
  let done = busy(btn, 'Texting a code…');
  try {
    const started = await apiFetch(PHONE_START_URL, { method: 'POST', body: JSON.stringify({ phone }) });
    done();
    const su = await stepUp({ title: 'Confirm your number', note: `Enter the code we texted to ${phone}.`, needCode: true });
    if (!su) return;
    done = busy(btn, 'Confirming…');
    await apiFetch(PHONE_CONFIRM_URL, { method: 'POST', body: JSON.stringify({ requestId: started.requestId, code: su.code }) });
    if (input) input.value = '';
    await loadPhone();
  } catch (ex) { showError('acctPhoneError', friendlyError(ex, 'Could not verify that number.')); }
  finally { done(); }
}

async function removePhone(btn = null) {
  if (btn?.disabled) return;
  showError('acctPhoneError', '');
  const done = busy(btn, 'Removing…');
  try {
    await apiFetch(PHONE_REMOVE_URL, { method: 'POST', body: JSON.stringify({}) });
    await loadPhone();
  } catch (ex) { showError('acctPhoneError', friendlyError(ex, 'Could not remove that number.')); }
  finally { done(); }
}

/* ---------- notifications (the customer's own preferences) ---------- */

// Order, warranty, and security email is the record and always goes out. What a
// customer adds here is text-message delivery per category, once a mobile is
// verified (the card above), and whether to hear news at all (off unless on).
let notifyPrefs = null;   // last GET /account/notifications payload

function notifyPrefsHtml(d) {
  const cats = Array.isArray(d.categories) ? d.categories : [];
  const smsOff = !d.phoneVerified || !d.smsAvailable;
  const why = !d.smsAvailable
    ? 'Text messages are not switched on for this platform yet.'
    : !d.phoneVerified ? 'Verify a mobile number above to turn on texts.' : '';
  return `
    <ul class="acct-notify-list">
      ${cats.map(c => {
        const p = d.prefs?.[c.key] || {};
        const sms = c.channels.includes('sms');
        const em = c.channels.includes('email');
        return `
          <li class="acct-notify-row">
            <div class="acct-notify-main">
              <span class="acct-notify-name">${escapeHtml(c.label)}</span>
              <span class="acct-notify-detail muted">${escapeHtml(c.detail)}</span>
            </div>
            <div class="acct-notify-ctl">
              ${sms ? `<label class="acct-chip ${smsOff ? 'is-locked' : ''}" ${why ? `data-tip="${escapeHtml(why)}"` : ''}>
                <input type="checkbox" data-np="${escapeHtml(c.key)}|sms" ${p.sms ? 'checked' : ''} ${smsOff ? 'disabled' : ''}>${ico('phone', 14)}<span>Text</span></label>` : ''}
              ${em ? `<label class="acct-chip"><input type="checkbox" data-np="${escapeHtml(c.key)}|email" ${p.email ? 'checked' : ''}>${ico('mail', 14)}<span>Email</span></label>` : ''}
            </div>
          </li>`;
      }).join('')}
    </ul>
    ${why ? `<p class="acct-card-note acct-notify-why">${escapeHtml(why)}</p>` : ''}
  `;
}

async function loadNotifyPrefs() {
  const host = document.getElementById('acctNotifyPrefs');
  if (!host) return;
  try {
    notifyPrefs = await apiFetch(NOTIFY_PREFS_URL);
    host.innerHTML = notifyPrefsHtml(notifyPrefs);
  } catch (ex) {
    // The route arrives with the backend deploy; until then the card says so
    // instead of erroring.
    host.innerHTML = `<span class="acct-card-note">${ex?.status === 404
      ? 'Notification settings are not available on this lane yet.'
      : escapeHtml(friendlyError(ex, 'Could not load notification settings.'))}</span>`;
    const save = document.querySelector('[data-acct-action="notify-save"]');
    if (save && ex?.status === 404) save.disabled = true;
  }
}

async function saveNotifyPrefs(btn) {
  const host = document.getElementById('acctNotifyPrefs');
  if (!host) return;
  const prefs = {};
  host.querySelectorAll('[data-np]').forEach(el => {
    const [key, ch] = String(el.dataset.np || '').split('|');
    if (!key || !ch) return;
    (prefs[key] ||= {})[ch] = el.checked === true;
  });
  showError('acctNotifyError', '');
  const orig = btnLabel(btn, 'Saving…');
  btn.disabled = true;
  try {
    const data = await apiFetch(NOTIFY_PREFS_URL, { method: 'POST', body: JSON.stringify({ prefs }) });
    notifyPrefs = data;
    host.innerHTML = notifyPrefsHtml(data);
    btnLabel(btn, 'Saved');
    if (data.needsPhone) showError('acctNotifyError', 'Saved. Texts stayed off: verify a mobile number first, then turn them on.');
    setTimeout(() => { btnLabel(btn, orig); }, 1400);
  } catch (ex) {
    btnLabel(btn, orig);
    showError('acctNotifyError', friendlyError(ex, 'Could not save notification settings.'));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- report anomaly ---------- */

// The modal lives in src/account/report.js; it needs the token and the address
// for the receipt line, and the same error voice as the rest of the panel.
function reportAnomaly() {
  return openReportAnomaly({ token: accessToken(), email: currentEmail(), friendlyError });
}
function supportRequest() {
  return openSupportRequest({ token: accessToken(), email: currentEmail(), friendlyError });
}

/* ---------- platform lane (operators only) ---------- */

// Platform-level operators (isAdmin or isDev on the OWNER's Users table) can
// route this browser to the dev sandbox. Each lane is its own platform with
// its own accounts. When the two accounts are linked the switch is seamless
// (the source lane vouches for you, no password); otherwise it opens sign-in
// on the target. Either way the session comes back fresh; nothing runs stale.
/** A lane switch: the handoff is asked for before the page moves; the pressed lane says so, the other waits. */
function laneSwitch(btn, lane, attr) {
  if (btn.disabled) return;
  const other = [...document.querySelectorAll(`[${attr}="lane-live"], [${attr}="lane-dev"]`)].filter(b => b !== btn);
  const done = busy(btn, 'Switching…', { hold: other, why: 'Wait for the lane switch' });
  // the page moves to the other lane on the answer; should it stay (a failure the switch could not recover), the buttons come back
  Promise.resolve(switchLane(lane)).finally(done);
}

/** Live | Dev as the environment's pill switch (2026-09-23 polish): the lane in use is filled; the other switches. */
function laneSwitchHtml(attr) {
  const opt = (k, label, tip) => `<button class="ev-lane ${LANE === k ? 'is-on' : ''}" type="button" role="tab" aria-selected="${LANE === k}" ${attr}="lane-${k}" ${LANE === k ? 'disabled' : ''} data-tip="${escapeHtml(LANE === k ? `You are on the ${k} lane` : tip)}">${label}</button>`;
  return `<div class="ev-lanes" role="tablist" aria-label="Which lane this browser calls">
    ${opt('live', 'Live', 'Signs you out here and signs you in on the live lane')}
    ${opt('dev', 'Dev', 'Signs you out here and signs you in on the dev sandbox')}
  </div>`;
}

function platformLaneCardHtml() {
  if (!isPlatformOperator()) return '';
  return `<div class="acct-grid-tail">${cardHtml({ key: 'profile:lane', icon: 'zap', title: 'Platform lane', summary: `calls go to ${escapeHtml(LANE)}`, body: `
      <p class="acct-card-note">This browser is routing API calls to the <strong>${escapeHtml(LANE)}</strong> lane.
      When your accounts are linked, switching is seamless; otherwise it asks you to sign in on the
      other lane. The site itself never changes, only where your calls go.</p>
      ${laneSwitchHtml('data-acct-action')}` })}</div>`;
}

/** The address list, read once; the phone card reads the same answer (2026-09-23: each card fetched it on its own). */
async function loadAliases() {
  const host = document.getElementById('acctAliasList');
  if (!host) return null;
  showError('acctProfileError', '');
  try {
    const data = await apiFetch(ALIASES_URL);
    const list = data.aliases || data.addresses || [];
    // The freshest statement of which address is primary; keeps currentEmail()
    // honest for the next step-up in this page session.
    const primaryRow = list.find(a => a.isPrimary || a.primary);
    knownPrimary = primaryRow ? (primaryRow.displayEmail || primaryRow.email || primaryRow.value || '') : '';
    setCardSummary('profile:emails', escapeHtml(list.length <= 1 ? (currentEmail() || '1 address') : `${list.length} addresses`));
    if (!list.length) {
      // Fall back to the ping's primary so the section is never empty.
      host.innerHTML = aliasRowHtml({ displayEmail: currentEmail(), isPrimary: true, state: 'VERIFIED' });
      return data;
    }
    host.innerHTML = list.map(aliasRowHtml).join('');
    return data;
  } catch (ex) {
    // Could not read the list, so nothing is known about the primary; fall
    // back to the ping rather than trusting a value from a previous account.
    knownPrimary = '';
    // Until the endpoint ships, show the current primary from the ping.
    host.innerHTML = aliasRowHtml({ displayEmail: currentEmail(), isPrimary: true, state: 'VERIFIED' });
    if (ex.status && ex.status !== 404) showError('acctProfileError', friendlyError(ex, 'Could not load addresses.'));
    return null;
  }
}

/* ---------- step-up prompt (password, and optionally an OTP) ---------- */

function stepUpHtml({ title, note, needCode }) {
  return `
    <div class="acct-modal-mask" data-acct-close></div>
    <div class="acct-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <h3 class="acct-modal-h">${escapeHtml(title)}</h3>
      <p class="acct-modal-note">${escapeHtml(note)}</p>
      <label class="acct-label" for="suPass">Account password</label>
      <input class="acct-input" id="suPass" type="password" autocomplete="current-password" placeholder="Your password">
      ${needCode ? `
        <label class="acct-label" for="suCode">Verification code</label>
        <input class="acct-input" id="suCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" maxlength="6">
      ` : ''}
      <p class="acct-error" id="suError" hidden></p>
      <div class="acct-modal-actions">
        <button class="btn btn-ghost" type="button" data-acct-close>Cancel</button>
        <button class="cta" type="button" data-acct-confirm>Confirm</button>
      </div>
    </div>
  `;
}

// Opens the step-up overlay and resolves with { password, code } or null.
function stepUp({ title, note, needCode }) {
  return new Promise(resolve => {
    let host = document.getElementById('acctStepUp');
    if (!host) { host = document.createElement('div'); host.id = 'acctStepUp'; host.className = 'acct-modal-host'; document.body.appendChild(host); }
    host.innerHTML = stepUpHtml({ title, note, needCode });
    host.hidden = false;
    // The host element outlives every prompt, so the listener MUST come off
    // again. It used to be added on each call and never removed: by the second
    // step-up two handlers were bound, the stale one ran first and cleared
    // host.innerHTML, and the live one then read a null #suPass and returned
    // without resolving. Its promise never settled, so `await stepUp(...)`
    // hung and the caller never sent its request - silently, with no error.
    // One prompt per session worked; every account change after it did nothing.
    function onClick(e) {
      if (e.target.closest('[data-acct-close]')) return close(null);
      if (e.target.closest('[data-acct-confirm]')) {
        const password = host.querySelector('#suPass')?.value || '';
        const code = host.querySelector('#suCode')?.value || '';
        if (!password) { const er = host.querySelector('#suError'); er.textContent = 'Enter your password.'; er.hidden = false; return; }
        if (needCode && !code) { const er = host.querySelector('#suError'); er.textContent = 'Enter the code we emailed you.'; er.hidden = false; return; }
        close({ password, code });
      }
    }
    const close = (val) => {
      host.removeEventListener('click', onClick);
      host.hidden = true; host.innerHTML = ''; resolve(val);
    };
    host.querySelector('#suPass')?.focus();
    host.addEventListener('click', onClick);
  });
}

/* ---------- email actions ---------- */

async function addAlias(btn = null) {
  if (btn?.disabled) return;
  const input = document.getElementById('acctNewEmail');
  const address = (input?.value || '').trim();
  showError('acctProfileError', '');
  if (!address) { showError('acctProfileError', 'Enter an email address to add.'); return; }
  const su = await stepUp({ title: 'Add an email', note: `Confirm it is you, then we will send a code to ${address}.`, needCode: false });
  if (!su) return;
  const done = busy(btn, 'Adding…');
  try {
    const claimId = (crypto.randomUUID?.() || String(Date.now()));
    await apiFetch(ALIASES_URL, { method: 'POST', body: JSON.stringify({ address, password: su.password, claimId }) });
    if (input) input.value = '';
    await loadAliases();
    showError('acctProfileError', `Check ${address} for a verification code, then use "Enter code".`);
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not add that address.', { passwordFlow: true })); }
  finally { done(); }
}

async function verifyAlias(aliasId, claimId, btn = null) {
  if (btn?.disabled) return;
  const su = await stepUp({ title: 'Verify this email', note: 'Enter the code we emailed to that address.', needCode: true });
  if (!su) return;
  const done = busy(btn, 'Verifying…');
  try {
    // requestId flow: the add call returned/queued a code; the backend confirm
    // matches on (claimId, code). requestId is carried by the backend per claim.
    await apiFetch(`${ALIASES_URL}/confirm`, { method: 'POST', body: JSON.stringify({ claimId, code: su.code, password: su.password }) });
    await loadAliases();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'That code did not verify.')); }
  finally { done(); }
}

async function makePrimary(aliasId, btn = null) {
  if (btn?.disabled) return;
  showError('acctProfileError', '');
  // set-primary needs an OTP sent to the CURRENT primary first.
  let done = busy(btn, 'Sending the code…');
  try { await apiFetch(REQUEST_CODE_URL, { method: 'POST', body: JSON.stringify({ email: currentEmail(), purpose: 'primary-change' }) }); } catch { /* uniform */ }
  done();
  const su = await stepUp({ title: 'Make this your primary', note: `We emailed a code to your current primary (${currentEmail()}). Enter it to confirm.`, needCode: true });
  if (!su) return;
  done = busy(btn, 'Making it primary…');
  try {
    await apiFetch(`${ALIASES_URL}/primary`, { method: 'POST', body: JSON.stringify({ aliasId, password: su.password, code: su.code }) });
    await loadAliases();
    // The primary moved, so the sign-in ping snapshot is now stale; refresh it
    // so the new primary survives a page reload, not just this session.
    await refreshCachedPing();
    // Primary drives the sidebar title; re-render the shell brand.
    const t = document.querySelector('.adm-side-title'); if (t) t.textContent = currentEmail();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not change your primary address.', { passwordFlow: true })); }
  finally { done(); }
}

async function resetTwoFactor(btn = null) {
  if (btn?.disabled) return;
  showError('acct2faError', '');
  const su = await resetTwoFactorPrompt();
  if (!su) return;
  const done = busy(btn, 'Resetting the authenticator…');
  try {
    const data = await apiFetch(RESET_2FA_URL, {
      method: 'POST',
      body: JSON.stringify({ currentPassword: su.password, code: su.code })
    });
    // The old authenticator is cleared and an enrollment token is returned;
    // hand it straight to the shared 2FA flow, which opens the enrollment modal
    // and mints a fresh secret with the current issuer label.
    if (data?.mfaEnrollmentRequired && data?.tokens?.enrollment_token && typeof globalThis.pragFinalizeAuth === 'function') {
      await globalThis.pragFinalizeAuth(data, { email: currentEmail() });
    } else {
      showError('acct2faError', 'Reset done, but enrollment did not start. Sign out and back in to set up your authenticator.');
    }
  } catch (ex) {
    showError('acct2faError', friendlyError(ex, 'Could not reset your authenticator.', { passwordFlow: true }));
  } finally { done(); }
}

// Current password + a CURRENT authenticator or recovery code, resolved to
// { password, code } or null on cancel.
function resetTwoFactorPrompt() {
  return new Promise((resolve) => {
    let hostEl = document.getElementById('acctReset2fa');
    if (!hostEl) { hostEl = document.createElement('div'); hostEl.id = 'acctReset2fa'; hostEl.className = 'acct-modal-host'; document.body.appendChild(hostEl); }
    hostEl.innerHTML = `
      <div class="acct-modal-mask" data-r2-close></div>
      <div class="acct-modal" role="dialog" aria-modal="true" aria-label="Reset authenticator">
        <h3 class="acct-modal-h">Reset authenticator</h3>
        <p class="acct-modal-note">Confirm it's you: your password and a code from your current authenticator (or a recovery code). Then you'll set up a new one.</p>
        <label class="acct-label" for="r2Pass">Account password</label>
        <input class="acct-input" id="r2Pass" type="password" autocomplete="current-password" placeholder="Your password">
        <label class="acct-label" for="r2Code">Authenticator or recovery code</label>
        <input class="acct-input" id="r2Code" type="text" autocomplete="one-time-code" placeholder="6-digit code or recovery code">
        <p class="acct-error" id="r2Error" hidden></p>
        <div class="acct-modal-actions">
          <button class="btn btn-ghost" type="button" data-r2-close>Cancel</button>
          <button class="cta" type="button" data-r2-confirm>Continue</button>
        </div>
      </div>`;
    hostEl.hidden = false;
    const pass = hostEl.querySelector('#r2Pass');
    const code = hostEl.querySelector('#r2Code');
    const er = hostEl.querySelector('#r2Error');
    pass.focus();
    function onClick(e) {
      if (e.target.closest('[data-r2-close]')) return close(null);
      if (e.target.closest('[data-r2-confirm]')) {
        if (!pass.value) { er.textContent = 'Enter your password.'; er.hidden = false; return; }
        if (!code.value.trim()) { er.textContent = 'Enter a current authenticator or recovery code.'; er.hidden = false; return; }
        close({ password: pass.value, code: code.value.trim() });
      }
    }
    const close = (val) => { hostEl.removeEventListener('click', onClick); hostEl.hidden = true; hostEl.innerHTML = ''; resolve(val); };
    hostEl.addEventListener('click', onClick);
  });
}

/* ---------- passkeys (the other second factor) ---------- */

// The Security card's list: which second factors this account holds. Either
// kind completes sign-in; the copy never implies both are needed.
async function loadPasskeys() {
  const host = document.getElementById('acctPasskeyList');
  if (!host) return;
  try {
    const data = await apiFetch(PASSKEY_LIST_URL);
    const list = data.passkeys || [];
    const totp = data.totpEnabled === true;
    const rows = [];
    rows.push(`<li class="acct-alias"><div class="acct-alias-main"><span class="acct-alias-email">Authenticator app</span>
      <span class="acct-tag">${totp ? 'on' : 'not set up'}</span></div></li>`);
    for (const p of list) {
      rows.push(`<li class="acct-alias">
        <div class="acct-alias-main">
          <span class="acct-alias-email">${escapeHtml(p.name || 'Passkey')}</span>
          <span class="acct-tag">passkey${p.backedUp ? ', synced' : ''}</span>
          <span class="muted">added ${escapeHtml(fmtDate(p.createdAt))}${p.lastUsedAt ? `, last used ${escapeHtml(fmtDate(p.lastUsedAt))}` : ''}</span>
        </div>
        <div class="acct-alias-actions act-row">
          ${iconBtn({ acct: 'remove-passkey' }, 'trash', 'Remove this passkey (you confirm with your password)', `data-cred="${escapeHtml(p.credentialId)}"`, 'is-risky')}
        </div>
      </li>`);
    }
    if (!list.length) rows.push(`<li class="acct-alias"><span class="muted">No passkeys yet. Add one to sign in with your fingerprint, face, or PIN.</span></li>`);
    host.innerHTML = `<ul class="acct-alias-list">${rows.join('')}</ul>`;
    setCardSummary('profile:twofactor', escapeHtml(`authenticator ${totp ? 'on' : 'off'} · ${list.length} passkey${list.length === 1 ? '' : 's'}`));
  } catch (ex) {
    host.innerHTML = '';
    showError('acct2faError', friendlyError(ex, 'Could not load your second-factor settings.'));
  }
}

// Password step-up for adding or removing a passkey. Resolves { password, name }
// or null on cancel. Same modal idiom as the authenticator reset.
function passkeyPrompt({ title, note, withName }) {
  return new Promise((resolve) => {
    let hostEl = document.getElementById('acctPasskeyPrompt');
    if (!hostEl) { hostEl = document.createElement('div'); hostEl.id = 'acctPasskeyPrompt'; hostEl.className = 'acct-modal-host'; document.body.appendChild(hostEl); }
    hostEl.innerHTML = `
      <div class="acct-modal-mask" data-pk-close></div>
      <div class="acct-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <h3 class="acct-modal-h">${escapeHtml(title)}</h3>
        <p class="acct-modal-note">${escapeHtml(note)}</p>
        ${withName ? `<label class="acct-label" for="pkName">Name this passkey</label>
        <input class="acct-input" id="pkName" type="text" maxlength="60" placeholder="e.g. Cameron's laptop" autocomplete="off">` : ''}
        <label class="acct-label" for="pkPass">Account password</label>
        <input class="acct-input" id="pkPass" type="password" autocomplete="current-password" placeholder="Your password">
        <p class="acct-error" id="pkError" hidden></p>
        <div class="acct-modal-actions">
          <button class="btn btn-ghost" type="button" data-pk-close>Cancel</button>
          <button class="cta" type="button" data-pk-confirm>Continue</button>
        </div>
      </div>`;
    hostEl.hidden = false;
    const pass = hostEl.querySelector('#pkPass');
    const nameEl = hostEl.querySelector('#pkName');
    const er = hostEl.querySelector('#pkError');
    (nameEl || pass).focus();
    function onClick(e) {
      if (e.target.closest('[data-pk-close]')) return close(null);
      if (e.target.closest('[data-pk-confirm]')) {
        if (!pass.value) { er.textContent = 'Enter your password.'; er.hidden = false; return; }
        close({ password: pass.value, name: (nameEl?.value || '').trim() || 'Passkey' });
      }
    }
    const close = (val) => { hostEl.removeEventListener('click', onClick); hostEl.hidden = true; hostEl.innerHTML = ''; resolve(val); };
    hostEl.addEventListener('click', onClick);
  });
}

// One-time display of recovery codes, for an account whose FIRST second
// factor was a passkey (an authenticator enrollment shows its own).
function showRecoveryCodesModal(codes) {
  return new Promise((resolve) => {
    let hostEl = document.getElementById('acctPasskeyPrompt');
    if (!hostEl) { hostEl = document.createElement('div'); hostEl.id = 'acctPasskeyPrompt'; hostEl.className = 'acct-modal-host'; document.body.appendChild(hostEl); }
    hostEl.innerHTML = `
      <div class="acct-modal-mask"></div>
      <div class="acct-modal" role="dialog" aria-modal="true" aria-label="Save your recovery codes">
        <h3 class="acct-modal-h">Save your recovery codes</h3>
        <p class="acct-modal-note">If you lose this passkey, one of these gets you back in. Each works once. They are shown only now.</p>
        <div class="acct-alias-list" style="font-family:ui-monospace,monospace;letter-spacing:1px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          ${codes.map(c => `<code>${escapeHtml(c)}</code>`).join('')}
        </div>
        <div class="acct-modal-actions">
          ${leadBtn({ rc: 'copy' }, 'copy', 'Copy')}
          <button class="cta" type="button" data-rc-done>I have saved these</button>
        </div>
      </div>`;
    hostEl.hidden = false;
    function onClick(e) {
      const rc = e.target.closest('[data-rc-action="copy"]');
      if (rc) { copyButton(rc, codes.join('\n'), { select: () => hostEl.querySelector('.acct-alias-list') }); return; }
      if (e.target.closest('[data-rc-done]')) { hostEl.removeEventListener('click', onClick); hostEl.hidden = true; hostEl.innerHTML = ''; resolve(); }
    }
    hostEl.addEventListener('click', onClick);
  });
}

// apiFetch already carries the session bearer, so the token argument the
// passkey module passes is ignored here.
const passkeyPost = (path, _token, body) => apiFetch(`${PRAG_API_BASE}${path}`, { method: 'POST', body: JSON.stringify(body || {}) });

async function addPasskey(btn = null) {
  if (btn?.disabled) return;
  showError('acct2faError', '');
  if (!passkeySupported()) { showError('acct2faError', 'This device or browser does not support passkeys.'); return; }
  const su = await passkeyPrompt({ title: 'Add a passkey', note: 'Confirm it’s you with your password, then your device will ask for your fingerprint, face, or PIN.', withName: true });
  if (!su) return;
  const done = busy(btn, 'Adding the passkey…');
  try {
    const made = await registerPasskey({ post: passkeyPost, token: '', name: su.name, extra: { currentPassword: su.password } });
    done();
    if (Array.isArray(made.recoveryCodes) && made.recoveryCodes.length) await showRecoveryCodesModal(made.recoveryCodes);
    await loadPasskeys();
  } catch (ex) {
    showError('acct2faError', ex?.data?.error || friendlyError(ex, 'Could not add that passkey.', { passwordFlow: true }));
  } finally { done(); }
}

async function removePasskey(credentialId, btn = null) {
  if (btn?.disabled) return;
  showError('acct2faError', '');
  const su = await passkeyPrompt({ title: 'Remove this passkey', note: 'Confirm it’s you with your password. Your last second factor cannot be removed.', withName: false });
  if (!su) return;
  const done = busy(btn, 'Removing…');
  try {
    await apiFetch(PASSKEY_REMOVE_URL, { method: 'POST', body: JSON.stringify({ credentialId, currentPassword: su.password }) });
    await loadPasskeys();
  } catch (ex) {
    showError('acct2faError', ex?.data?.error || friendlyError(ex, 'Could not remove that passkey.', { passwordFlow: true }));
  } finally { done(); }
}

async function changePassword(btn = null) {
  if (btn?.disabled) return;
  showError('acctPasswordError', '');
  const su = await changePasswordPrompt();
  if (!su) return;
  const done = busy(btn, 'Changing…');
  try {
    const data = await apiFetch(CHANGE_PW_URL, {
      method: 'POST',
      body: JSON.stringify({ currentPassword: su.current, newPassword: su.next })
    });
    // The epoch was bumped, so the token we authenticated with is now revoked
    // along with every other session; swap in the fresh one so THIS session
    // survives seamlessly.
    if (data?.tokens?.access_token) {
      if (typeof globalThis.setToken === 'function') globalThis.setToken(data.tokens);
      else sessionStorage.setItem('pragoptics_tokens', JSON.stringify(data.tokens));
    }
    showError('acctPasswordError', 'Password changed. Other devices have been signed out.');
  } catch (ex) {
    showError('acctPasswordError', friendlyError(ex, 'Could not change your password.', { passwordFlow: true }));
  } finally { done(); }
}

// A three-field prompt (current + new + confirm) with the same live rules the
// signup form enforces, resolved to { current, next } or null on cancel.
function changePasswordPrompt() {
  return new Promise((resolve) => {
    let hostEl = document.getElementById('acctChangePw');
    if (!hostEl) { hostEl = document.createElement('div'); hostEl.id = 'acctChangePw'; hostEl.className = 'acct-modal-host'; document.body.appendChild(hostEl); }
    hostEl.innerHTML = `
      <div class="acct-modal-mask" data-cp-close></div>
      <div class="acct-modal" role="dialog" aria-modal="true" aria-label="Change password">
        <h3 class="acct-modal-h">Change password</h3>
        <p class="acct-modal-note">Enter your current password, then a new one. Every other device is signed out.</p>
        <label class="acct-label" for="cpCurrent">Current password</label>
        <input class="acct-input" id="cpCurrent" type="password" autocomplete="current-password" placeholder="Current password">
        <label class="acct-label" for="cpNew">New password</label>
        <input class="acct-input" id="cpNew" type="password" autocomplete="new-password" placeholder="At least 12 characters">
        <label class="acct-label" for="cpConfirm">Confirm new password</label>
        <input class="acct-input" id="cpConfirm" type="password" autocomplete="new-password" placeholder="Re-enter new password">
        <p class="acct-error" id="cpError" hidden></p>
        <div class="acct-modal-actions">
          <button class="btn btn-ghost" type="button" data-cp-close>Cancel</button>
          <button class="cta" type="button" data-cp-confirm>Change password</button>
        </div>
      </div>`;
    hostEl.hidden = false;
    const cur = hostEl.querySelector('#cpCurrent');
    const nw = hostEl.querySelector('#cpNew');
    const cf = hostEl.querySelector('#cpConfirm');
    const er = hostEl.querySelector('#cpError');
    cur.focus();
    function onClick(e) {
      if (e.target.closest('[data-cp-close]')) return close(null);
      if (e.target.closest('[data-cp-confirm]')) {
        const current = cur.value, next = nw.value, confirm = cf.value;
        if (!current) { er.textContent = 'Enter your current password.'; er.hidden = false; return; }
        if (next.length < 12) { er.textContent = 'Your new password must be at least 12 characters.'; er.hidden = false; return; }
        if (next !== confirm) { er.textContent = 'The new passwords do not match.'; er.hidden = false; return; }
        if (next === current) { er.textContent = 'Your new password must be different from your current one.'; er.hidden = false; return; }
        close({ current, next });
      }
    }
    const close = (val) => { hostEl.removeEventListener('click', onClick); hostEl.hidden = true; hostEl.innerHTML = ''; resolve(val); };
    hostEl.addEventListener('click', onClick);
  });
}

async function removeAlias(aliasId, btn = null) {
  if (btn?.disabled) return;
  showError('acctProfileError', '');
  let done = busy(btn, 'Sending the code…');
  try { await apiFetch(REQUEST_CODE_URL, { method: 'POST', body: JSON.stringify({ email: currentEmail(), purpose: 'alias-remove' }) }); } catch { /* uniform */ }
  done();
  const su = await stepUp({ title: 'Remove this email', note: `We emailed a code to your primary (${currentEmail()}). Enter it to confirm removal.`, needCode: true });
  if (!su) return;
  done = busy(btn, 'Removing…');
  try {
    await apiFetch(`${ALIASES_URL}/remove`, { method: 'POST', body: JSON.stringify({ aliasId, password: su.password, code: su.code }) });
    await loadAliases();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not remove that address.', { passwordFlow: true })); }
  finally { done(); }
}

/* ---------- my products (registered warranties) ---------- */

const PRODUCT_NAMES = { omnisource: 'OmniSource', omnibus: 'OmniBus' };

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function productItemHtml(it) {
  const name = PRODUCT_NAMES[it.productId] || it.productId || 'Device';
  const e = it.eligibility || {};
  let statusHtml, action;
  if (e.resumable && e.pendingRedemptionId) {
    // The owner's own unfinished start (a closed tab at payment). Picking it
    // up lands on the same checkout; the server resumes or re-quotes.
    statusHtml = '<span class="acct-tag is-pending">Redemption started</span>';
    action = leadBtn({ acct: 'redeem-product' }, 'play', 'Resume redemption', `data-code="${escapeHtml(it.code || '')}" data-tip="Continue the redemption you started; same address and shipping resumes it"`, 'btn-primary');
  } else if (e.pendingRedemptionId) {
    statusHtml = '<span class="acct-tag is-pending">Redemption in progress</span>';
    action = '';
  } else if (e.eligible) {
    statusHtml = '<span class="acct-tag is-verified">Redemption available</span>';
    action = leadBtn({ acct: 'redeem-product' }, 'shield', 'Redeem warranty', `data-code="${escapeHtml(it.code || '')}"`, 'btn-primary');
  } else if (e.nextEligibleAt) {
    statusHtml = `<span class="acct-tag">Next redemption ${escapeHtml(fmtDate(e.nextEligibleAt))}</span>`;
    action = '';
  } else {
    statusHtml = '<span class="acct-tag is-verified">Covered</span>';
    action = '';
  }
  return `
    <li class="acct-product">
      <div class="acct-product-main">
        <span class="acct-product-name">${escapeHtml(name)}</span>
        <code class="acct-product-code">${escapeHtml(it.code || '')}</code>
        <span class="acct-product-meta muted">Registered ${escapeHtml(fmtDate(it.registeredAt))}${
          it.redemptionCount ? ` · ${escapeHtml(String(it.redemptionCount))} redemption${Number(it.redemptionCount) === 1 ? '' : 's'}` : ''}</span>
      </div>
      <div class="acct-product-side">
        ${statusHtml}
        ${action}
      </div>
    </li>
  `;
}

async function renderProducts(main) {
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Registered hardware</h2></header>
    <div class="ev-cards">
    ${cardHtml({ key: 'products:list', icon: 'box', title: 'Registered devices', summary: 'loading', open: true, body: `
      <ul class="acct-product-list" id="acctProductList"><li class="acct-loading">Loading…</li></ul>
      <p class="acct-card-note ev-dom-door">Lifetime case coverage; one redemption per year, per device.</p>
      <p class="acct-error" id="acctProductsError" hidden></p>` })}
    </div>
  `;
  const host = document.getElementById('acctProductList');
  try {
    const data = await apiFetch(`${MINE_URL}`);
    const items = Array.isArray(data.items) ? data.items : [];
    setCardSummary('products:list', escapeHtml(items.length ? `${items.length} device${items.length === 1 ? '' : 's'}` : 'none yet'));
    if (!items.length) {
      host.innerHTML = `<li class="acct-empty">No registered products yet. Register a device at
        <a href="#" data-acct-action="go-register">the warranty page</a>, and it will appear here.</li>`;
      return;
    }
    host.innerHTML = items.map(productItemHtml).join('');
  } catch (ex) {
    host.innerHTML = '';
    showError('acctProductsError', friendlyError(ex, 'Could not load your products.'));
  }
}

/* ---------- subscription: the native billing manager ----------
   Everything Stripe knows about this account, managed here: plan, cadence,
   add-ons, the card on file, invoices, cancel and resume. The wizard is only
   the FIRST-run path (address + first card); after that, billing lives on
   this section and never leaves the site. */

let subData = null;      // last GET /billing/subscription payload
let subPricing = null;   // mounted plan selector (change-plan card)
let subPmCtx = null;     // { stripe, elements } while a card update is open

// fmtDate lives with the products section above; reused here for billing.
function usdCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
}

// Two-step confirm for money buttons: first click arms (the button opens into what will happen, with a Keep-it
// beside it), second fires. The panel's one confirm (cards.js armed(), 2026-09-23 polish).
function armConfirm(btn, armedText, onConfirm) {
  if (armed(btn, armedText, { ms: 8000 })) onConfirm();
}

function keysOfCurrent(data) {
  return new Set((data?.subscription?.items || []).map(i => i.lookupKey).filter(Boolean));
}
function sameKeySets(a, b) {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

// The LIVE shape read off the subscription's own items, the same reading the
// backend makes: tier from po.<tier>.*, cadence from the price interval,
// add-ons from po.addon.<slug>. requestedSubscription is only the last
// REQUEST; a relinked or migrated account may carry none at all.
const ADDON_SLUG_TO_KEY = { storage5gb: 'storage', flows10k: 'flows', api50k: 'api', domains: 'domains' };
// Add-ons no longer sold. A holder keeps one until they remove it (the
// selector cannot represent it, so it must not arm Apply on load), and the
// removal is a period-end change like any other add-on removal.
const RETIRED_ADDON_KEYS = new Set(['domains', 'flows']);
function isRetiredLookupKey(lk) {
  const m = String(lk || '').match(/^po\.addon\.([a-z0-9]+)\./);
  return !!(m && RETIRED_ADDON_KEYS.has(ADDON_SLUG_TO_KEY[m[1]]));
}
function withoutRetiredAddons(addons = {}) {
  const out = {};
  for (const k of Object.keys(addons)) out[k] = !!addons[k] && !RETIRED_ADDON_KEYS.has(k);
  return out;
}
// Add-ons that should not be billing on this shape: every add-on on a Partner
// or Super plan (they include their capacity), and a retired add-on on User.
function strayAddonKeys(shape) {
  if (!shape?.subType) return [];
  // Seats are not in addons (shapeOfItems counts them apart), so a seat line
  // never reads as a stray add-on on Partner or Super.
  const on = Object.keys(shape.addons || {}).filter(k => shape.addons[k]);
  return shape.subType === 'user' ? on.filter(k => RETIRED_ADDON_KEYS.has(k)) : on;
}
function shapeOfItems(items = []) {
  const out = { subType: null, cadence: 'monthly', addons: { domains: false, storage: false, flows: false, api: false }, seats: 0 };
  for (const it of items) {
    const lk = String(it.lookupKey || '');
    const base = lk.match(/^po\.(user|partner|super)\./);
    if (base) { out.subType = base[1]; out.cadence = it.interval === 'year' ? 'annual' : 'monthly'; continue; }
    // Extra seats: one item whose quantity is the count.
    if (/^po\.addon\.seats\./.test(lk)) { out.seats += Math.max(1, Number(it.quantity) || 1); continue; }
    const addon = lk.match(/^po\.addon\.([a-z0-9]+)\./);
    if (addon && ADDON_SLUG_TO_KEY[addon[1]]) out.addons[ADDON_SLUG_TO_KEY[addon[1]]] = true;
  }
  return out;
}
// Same plan, same cadence, same add-ons, same seat count: nothing to apply.
function sameSelection(sel, live, currentKeys) {
  return sameKeySets(new Set(sel.lookupKeys), currentKeys) && (Number(sel.seats) || 0) === (Number(live.seats) || 0);
}

const TIER_RANK = { free: 0, user: 1, partner: 2, super: 3 };
const rankOf = (t) => TIER_RANK[String(t || 'free').toLowerCase()] ?? 0;

// Mirrors the backend rule (auth/subscriptionShape.js) so the confirm button
// can say what will happen: "more" (a higher tier, monthly to annual, an
// add-on added) applies now with a prorated charge; "less" (a lower tier,
// annual to monthly, an add-on removed) at the end of the paid period with
// no charge; "both" splits.
function changeKind(cur, des) {
  const up = rankOf(des.subType) > rankOf(cur.subType);
  const down = rankOf(des.subType) < rankOf(cur.subType);
  const cadUp = cur.cadence === 'monthly' && des.cadence === 'annual';
  const cadDown = cur.cadence === 'annual' && des.cadence === 'monthly';
  const added = Object.keys(des.addons || {}).filter(k => des.addons[k] && !cur.addons?.[k]);
  const removed = Object.keys(cur.addons || {}).filter(k => cur.addons[k] && !des.addons?.[k]);
  // Seats follow the same rule: more now, fewer at period end.
  const seatsUp = (Number(des.seats) || 0) > (Number(cur.seats) || 0);
  const seatsDown = (Number(des.seats) || 0) < (Number(cur.seats) || 0);
  if (up || (cadUp && !down)) return 'more';
  if (down || cadDown) return 'less';
  const more = added.length > 0 || seatsUp;
  const less = removed.length > 0 || seatsDown;
  if (more && less) return 'both';
  if (more) return 'more';
  if (less) return 'less';
  return 'none';
}

const STATUS_LABEL = {
  ACTIVE: 'Active', PAYMENT_PENDING: 'Payment pending', PAST_DUE: 'Past due', CANCELED: 'Canceled',
  PENDING_SUBSCRIPTION: 'Not subscribed', CHECKOUT_IN_PROGRESS: 'Checkout in progress', NONE: 'Not subscribed',
  UNKNOWN: 'Unavailable'
};
function statusLabel(s) {
  const k = String(s || '').toUpperCase();
  if (!k) return 'Not subscribed';
  return STATUS_LABEL[k] || (k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' '));
}

/* ---------- usage meters ---------- */

function nFmt(n) { return Number(n || 0).toLocaleString('en-US'); }
function gbFmt(bytes) {
  const gb = Number(bytes || 0) / (1024 * 1024 * 1024);
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

function meterRowHtml(name, used, limit, fmt = nFmt) {
  if (!limit) return '';
  const pct = Math.min(100, (used / limit) * 100);
  const cls = pct >= 95 ? 'is-hot' : pct >= 70 ? 'is-warn' : '';
  return `
    <div class="use-row">
      <div class="use-head">
        <span class="use-name">${escapeHtml(name)}</span>
        <span class="use-val">${escapeHtml(fmt(used))} / ${escapeHtml(fmt(limit))}</span>
      </div>
      <div class="use-track"><div class="use-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
    </div>
  `;
}

/** What the Bandwidth card (bandwidth.js) borrows from the panel: the fetch, the error words, the meter, the GB format. */
function bandwidthDeps() {
  return { apiFetch, friendlyError, meterRowHtml, gbFmt, cachedPing, pickedTeam: pickedTeamId };
}

async function loadUsageCard() {
  const host = document.getElementById('acctUsageCard');
  if (!host) return;
  try {
    const d = await apiFetch(USAGE_MINE_URL);
    const activeAddons = Object.entries(d.addons || {}).filter(([, on]) => on).map(([k]) => k);
    const states = Object.values(d.capState || {});
    const blocked = states.includes('blocked');
    const over = states.filter(s => s === 'grace' || s === 'blocked');
    const gracePct = Math.round(((Number(d.graceRatio) || 1.1) - 1) * 100);
    const tier = String(d.tier || 'free').toLowerCase();
    // Where more capacity comes from depends on the plan: add-ons scale the
    // User plan; Partner and Super include higher limits and move up instead.
    const morePath = tier === 'user' ? 'Add an add-on in Plan and add-ons above'
      : tier === 'super' ? 'Contact support@bridgesindust.com for more capacity'
      : 'Upgrade in Plan and add-ons above';
    const monthWords = /^\d{4}-\d{2}$/.test(String(d.month || '')) ? new Date(`${d.month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(d.month || '');
    const callsPct = d.limits?.apiCalls ? Math.round(100 * (Number(d.usage?.apiCalls) || 0) / d.limits.apiCalls) : null;
    // decision 22: connected domains beside API calls and storage; a standing count, not monthly, no grace margin.
    // A lane whose answer carries no domain number shows nothing about domains.
    const domLimit = d.limits?.domains;
    const domUsed = d.usage?.domains;
    const domainsHtml = domLimit === undefined || domLimit === null ? ''
      : Number(domLimit) <= 0 ? `<p class="acct-card-note">Connected domains: none on the Free plan. Connecting a domain starts on the User plan.</p>`
      : domUsed === null || domUsed === undefined ? `<p class="acct-card-note">Connected domains: the count could not be read right now.</p>`
      : `${meterRowHtml('Connected domains', Number(domUsed) || 0, Number(domLimit))}
        <p class="acct-card-note">Connected domains count what is connected now. They do not reset each month and have no grace margin.</p>`;
    host.innerHTML = cardHtml({ key: 'billing:usage', icon: 'activity', title: 'Usage this month', summary: escapeHtml(`${monthWords}${callsPct != null ? ` · ${callsPct}% of calls` : ''}`), cls: over.length ? 'acct-card-warn' : '', body: `
        <p class="acct-card-note">${escapeHtml(monthWords)} on the ${escapeHtml(tierName(tier))} plan${activeAddons.length
          ? `, limits raised by ${activeAddons.length} add-on${activeAddons.length === 1 ? '' : 's'}` : ''}. API calls and storage each have a ${gracePct}% grace margin.${over.length
          ? ` <span class="acct-tag is-bad">${blocked ? 'past allowance and grace' : 'past allowance'}</span> ${escapeHtml(morePath)}.${blocked
            ? ' Metered platform functions are paused until capacity is added or the month resets; your account, billing, and warranty are unaffected.'
            : ' Nothing is limited yet.'}` : ''}</p>
        ${meterRowHtml('API calls', d.usage.apiCalls, d.limits.apiCalls)}
        ${meterRowHtml('Storage', d.usage.storageBytes, d.limits.storageBytes, gbFmt)}
        ${domainsHtml}` });
  } catch (ex) {
    // Endpoint not deployed yet, or a blip: the card simply does not render.
    host.innerHTML = '';
  }
}

function invoicePill(status) {
  const s = String(status || '').toLowerCase();
  const cls = s === 'paid' ? 'is-verified' : (s === 'open' ? 'is-pending' : '');
  return `<span class="acct-tag ${cls}">${escapeHtml(s || '')}</span>`;
}

function subNotSubscribedHtml(data) {
  const tier = cachedPing()?.user?.tier || 'free';
  const status = String(data?.status || '').toUpperCase();
  const midCheckout = status === 'CHECKOUT_IN_PROGRESS';
  // A plan was chosen but the subscription is not active yet (a checkout picked
  // a plan and never finished). Show what they chose and that a card finishes
  // it, instead of a bare "Not subscribed" that reads like nothing happened
  // (2026-09-30, Cameron: the subscribe silently failed).
  const req = (status === 'PENDING_SUBSCRIPTION' && data?.requestedSubscription) ? data.requestedSubscription : null;
  const reqLabel = req ? `${tierName(req.subType)} plan, billed ${req.cadence === 'annual' ? 'annually' : 'monthly'}` : '';
  const unfinished = midCheckout || !!req;
  const note = status === 'PAYMENT_PENDING'
    ? 'Your payment is processing. This settles within a minute; check back shortly.'
    : midCheckout
      ? 'You have a subscription checkout in progress. Pick up where you left off.'
      : req
        ? `You chose the ${escapeHtml(reqLabel)}, but it is not active yet. Add a payment method to finish subscribing.`
        : status === 'CANCELED'
          ? 'Your subscription has ended and you are on the Free tier. Subscribe again any time.'
          : 'You are on the Free tier. Subscribe for cloud sync, API access with your own keys, and a provisioned workspace.';
  return `
    <section class="acct-card">
      <div class="acct-plan">
        <div>
          <span class="acct-plan-tier">${escapeHtml(tierName(tier))}</span>
          <span class="acct-tag is-pending">${escapeHtml(unfinished ? 'Not finished' : statusLabel(status))}</span>
        </div>
        <p class="acct-card-note">${note}</p>
      </div>
      <div class="acct-actions-row">
        ${status === 'PAYMENT_PENDING' ? '' : leadBtn({ acct: 'subscribe' }, unfinished ? 'play' : 'layers', unfinished ? 'Finish subscribing' : 'Subscribe', '', 'btn-primary')}
      </div>
    </section>
    ${billingDetailsHtml(cachedPing()?.billingProfile)}
  `;
}

function subManagerHtml(data) {
  const sub = data.subscription;
  const tier = data.tier || cachedPing()?.user?.tier || '';
  const status = String(data.status || '').toUpperCase();
  // The LIVE shape comes from the subscription's own items, not the last
  // request: a relinked or migrated account may carry no request at all.
  const shape = shapeOfItems(sub.items || []);
  const cadence = shape.cadence;
  const per = cadence === 'annual' ? '/yr' : '/mo';
  const totalCents = (sub.items || []).reduce((n, i) => n + (Number(i.amountCents) || 0) * (i.quantity || 1), 0);
  const pm = data.paymentMethod;
  const openInvoice = (data.invoices || []).find(i => String(i.status).toLowerCase() === 'open' && i.hostedInvoiceUrl);
  const pending = data.pendingChange || null;
  // An add-on riding a Partner or Super plan does not belong there (add-ons
  // scale the User plan; an upgrade removes them). Offer its removal at the
  // period end, unless a scheduled change already covers it.
  const strayAddons = strayAddonKeys(shape);
  // On the User plan a stray add-on is one that is no longer offered.
  const strayRetired = shape.subType === 'user';
  // A scheduled change that only drops add-ons (same plan, same cadence) is
  // the stray-add-on removal; its undo is "keep the add-on", not "keep my
  // plan". After that undo the add-on is a CHOICE the customer made, so the
  // notice reads calm instead of alarming (remembered per browser).
  const pendingIsAddonDrop = isAddonDrop(shape, pending);
  const keptAddons = keptAddonKeys().filter(k => strayAddons.includes(k));
  const strayKept = strayAddons.length > 0 && keptAddons.length === strayAddons.length;

  const cardLine = pm ? `${(pm.brand || 'card').toUpperCase()} ending in ${pm.last4 || '????'}${pm.expMonth ? `, expires ${pm.expMonth}/${pm.expYear}` : ''}` : 'no card on file';
  const invoices = data.invoices || [];
  return `
    ${data.paymentActionRequired && openInvoice ? cardHtml({ key: 'billing:action', icon: 'alert', title: 'Action needed', summary: 'your bank asked for authentication', danger: true, body: `
        <p class="acct-card-note">Your bank asked for extra authentication on the latest charge.
        Finish it and the subscription continues untouched.</p>
        <div class="acct-actions-row">
          <a class="btn btn-sm btn-lead btn-primary" href="${escapeHtml(safeUrl(openInvoice.hostedInvoiceUrl))}" target="_blank" rel="noopener">${ico('external')}<span>Finish authentication</span></a>
        </div>` }) : ''}
    ${status === 'PAST_DUE' ? cardHtml({ key: 'billing:pastdue', icon: 'alert', title: 'Payment past due', summary: 'update the card below', danger: true, body: `
        <p class="acct-card-note">The last charge did not go through. Update the card below;
        the retry happens automatically.</p>` }) : ''}

    <section class="acct-card acct-plan-card">
      <div class="acct-plan">
        <div class="acct-plan-line">
          <span class="acct-plan-tier">${escapeHtml(tierName(tier))}</span>
          <span class="acct-tag ${status === 'ACTIVE' ? 'is-verified' : 'is-pending'}">${escapeHtml(statusLabel(status))}</span>
          ${sub.cancelAtPeriodEnd ? `<span class="acct-tag is-pending">Ends ${escapeHtml(fmtDate(sub.currentPeriodEnd))}</span>` : ''}
        </div>
        <p class="acct-plan-price"><strong>${escapeHtml(usdCents(totalCents))}</strong><span>${per}</span>${shape.seats ? `<span class="acct-plan-extra">${shape.seats} extra seat${shape.seats === 1 ? '' : 's'}</span>` : ''}</p>
        <p class="acct-card-note">
          ${sub.cancelAtPeriodEnd
            ? `Runs until ${escapeHtml(fmtDate(sub.currentPeriodEnd))}, then ends`
            : `Renews ${escapeHtml(fmtDate(sub.currentPeriodEnd))}`}${sub.taxEnabled ? ' · sales tax added at your billing address' : ''}${
          data.upcomingInvoice?.amountDueCents != null && !sub.cancelAtPeriodEnd
            ? ` · next charge ${escapeHtml(usdCents(data.upcomingInvoice.amountDueCents))}` : ''}
        </p>
      </div>
    </section>
    <div id="acctUsageCard"></div>
    <div id="acctBandwidthCard"></div>

    ${pending ? cardHtml({ key: 'billing:pending', icon: 'clock', title: 'Scheduled change', summary: `on ${escapeHtml(fmtDate(pending.effectiveAt))}`, cls: 'acct-card-warn', body: `
        <p class="acct-card-note">On ${escapeHtml(fmtDate(pending.effectiveAt))}: ${escapeHtml(pending.summary || 'your plan changes')}.
        Your current plan runs until then. No charge, no credit.${pendingIsAddonDrop
          ? ' Keeping the add-on cancels this removal; it stays on the plan and keeps billing until you remove it.' : ''}</p>
        <div class="acct-actions-row">
          ${leadBtn({ acct: 'sub-keep' }, 'undo', pendingIsAddonDrop ? 'Keep the add-on' : 'Keep my current plan')}
        </div>
        <p class="acct-error" id="acctPendingError" hidden></p>` })
    : strayAddons.length && strayKept ? cardHtml({ key: 'billing:addon', icon: 'tag2', title: 'Add-on kept', summary: escapeHtml(strayAddons.map(k => ADDON_NAME[k] || k).join(', ')), body: `
        <p class="acct-card-note">You chose to keep ${escapeHtml(strayAddons.map(k => ADDON_NAME[k] || k).join(', '))} on the ${escapeHtml(tierName(shape.subType))} plan.
        ${strayRetired ? 'It is no longer offered to new subscribers but stays yours' : 'It does not raise this plan\'s limits'} and keeps billing as before. Remove it at the end of a paid period whenever you like.</p>
        <div class="acct-actions-row">
          ${leadBtn({ acct: 'sub-drop-addons' }, 'calendarX', 'Remove at period end', 'data-tip="Schedules the removal for the end of the paid period; nothing else on the plan changes"')}
        </div>
        <p class="acct-error" id="acctPendingError" hidden></p>` })
    : strayAddons.length ? cardHtml({ key: 'billing:addon', icon: 'tag2', title: strayRetired ? 'Add-on no longer offered' : 'Add-on not on this plan', summary: escapeHtml(strayAddons.map(k => ADDON_NAME[k] || k).join(', ')), cls: 'acct-card-warn', body: `
        <p class="acct-card-note">${escapeHtml(strayAddons.map(k => ADDON_NAME[k] || k).join(', '))}: ${strayRetired
          ? (strayAddons.length === 1
              ? 'this add-on is no longer offered. It stays until you remove it; removal takes effect at the end of the paid period.'
              : 'these add-ons are no longer offered. They stay until you remove them; removal takes effect at the end of the paid period.')
          : `${strayAddons.length === 1 ? 'this does' : 'these do'} not apply to the ${escapeHtml(tierName(shape.subType))} plan, which includes higher limits. Remove ${strayAddons.length === 1 ? 'it' : 'them'} at the end of the paid period and ${strayAddons.length === 1 ? 'it' : 'they'} will not be billed again.`} No charge, no credit.</p>
        <div class="acct-actions-row">
          ${leadBtn({ acct: 'sub-drop-addons' }, 'calendarX', 'Remove at period end', 'data-tip="Schedules the removal for the end of the paid period; nothing else on the plan changes"')}
        </div>
        <p class="acct-error" id="acctPendingError" hidden></p>` }) : ''}

    ${cardHtml({ key: 'billing:plan', icon: 'sliders', title: 'Plan and add-ons', summary: 'change it here', body: `
      <div id="acctPricing"></div>
      <div class="acct-actions-row">
        ${leadBtn({ acct: 'sub-apply' }, 'check', 'Apply changes', 'id="acctPlanApply" disabled data-tip="Upgrades charge the difference today; downgrades and removals take effect at the period end"', 'btn-primary')}
      </div>
      <p class="acct-card-note muted">Upgrades charge the difference today and apply once paid. Downgrades and add-on removals take effect on ${escapeHtml(fmtDate(sub.currentPeriodEnd))}, with no charge and no credit.</p>
      <p class="acct-error" id="acctPlanError" hidden></p>
      <p class="muted" id="acctPlanMsg" hidden></p>` })}

    ${cardHtml({ key: 'billing:card', icon: 'card', title: 'Payment method', summary: escapeHtml(cardLine), body: `
      <div class="acct-pm-line">
        ${pm ? `<span class="acct-pm-brand">${escapeHtml((pm.brand || 'card').toUpperCase())}</span><span class="acct-pm-num">•••• ${escapeHtml(pm.last4 || '????')}</span>${pm.expMonth ? `<span class="adm-muted">expires ${escapeHtml(String(pm.expMonth))}/${escapeHtml(String(pm.expYear))}</span>` : ''}` : '<span class="acct-card-note">No card on file yet.</span>'}
        <span class="act-row acct-pm-acts" id="acctPmActions">${leadBtn({ acct: 'pm-update' }, 'edit', pm ? 'Update card' : 'Add a card')}</span>
      </div>
      <div id="acctPmHost" hidden>
        <div id="acctPmElement"></div>
        <div class="acct-actions-row act-row">
          ${leadBtn({ acct: 'pm-save' }, 'check', 'Save card', '', 'btn-primary')}
          ${iconBtn({ acct: 'pm-cancel' }, 'x', 'Never mind')}
        </div>
      </div>
      <p class="acct-error" id="acctPmError" hidden></p>
      <p class="muted" id="acctPmMsg" hidden></p>` })}

    ${billingDetailsHtml(cachedPing()?.billingProfile)}

    ${cardHtml({ key: 'billing:invoices', icon: 'file', title: 'Invoices', summary: invoices.length ? `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}` : 'none yet', body: invoices.length ? `
        <ul class="acct-inv-list">
          ${invoices.map((i, n) => `
            <li class="acct-inv ${n >= 5 ? 'is-more' : ''}">
              <span class="acct-inv-date">${escapeHtml(fmtDate(i.createdAt))}</span>
              <code class="acct-inv-num" title="${escapeHtml(i.number || i.id)}">${escapeHtml(i.number || i.id)}</code>
              <span class="acct-inv-total">${escapeHtml(usdCents(i.totalCents))}</span>
              <span class="acct-inv-status">${invoicePill(i.status)}</span>
              <span class="act-row acct-inv-acts">
                ${safeUrl(i.hostedInvoiceUrl) ? `<a class="btn btn-sm btn-ico" href="${escapeHtml(safeUrl(i.hostedInvoiceUrl))}" target="_blank" rel="noopener" aria-label="View invoice ${escapeHtml(i.number || '')}" data-tip="View the invoice">${ico('external')}</a>` : ''}
                ${safeUrl(i.pdfUrl) ? `<a class="btn btn-sm btn-ico" href="${escapeHtml(safeUrl(i.pdfUrl))}" target="_blank" rel="noopener" aria-label="Download invoice ${escapeHtml(i.number || '')} as a PDF" data-tip="Download the PDF">${ico('download')}</a>` : ''}
              </span>
            </li>`).join('')}
        </ul>
        ${invoices.length > 5 ? `<div class="acct-actions-row acct-inv-more">${leadBtn({ acct: 'inv-more' }, 'chevron', `Show ${invoices.length - 5} more`)}</div>` : ''}` : `<p class="acct-card-note">No invoices yet.</p>` })}

    ${cardHtml({ key: 'billing:cancel', icon: 'power', title: sub.cancelAtPeriodEnd ? 'Resume subscription' : 'Cancel subscription', summary: sub.cancelAtPeriodEnd ? `ends ${escapeHtml(fmtDate(sub.currentPeriodEnd))}` : 'at the end of a paid period', danger: !sub.cancelAtPeriodEnd, body: `
      <p class="acct-card-note">${sub.cancelAtPeriodEnd
        ? `The plan is set to end on ${escapeHtml(fmtDate(sub.currentPeriodEnd))}. Resume to keep it running.`
        : 'Canceling keeps everything running until the end of the paid period, then the plan ends. No partial refunds, no surprises.'}</p>
      <div class="acct-actions-row">
        ${sub.cancelAtPeriodEnd
          ? leadBtn({ acct: 'sub-resume' }, 'play', 'Resume', '', 'btn-primary')
          : leadBtn({ acct: 'sub-cancel' }, 'calendarX', 'Cancel at period end', '', 'is-danger')}
      </div>
      <p class="acct-error" id="acctCancelError" hidden></p>` })}
  `;
}

async function renderSubscription(main) {
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">Billing</h2>${explainLink('billing')}</header>
    <p class="acct-error" id="acctSubError" hidden></p>
    <div id="acctSubBody"><p class="acct-loading">Loading your subscription…</p></div>
  `;
  const host = document.getElementById('acctSubBody');
  subPricing = null;
  subPmCtx = null;
  try {
    subData = await apiFetch(SUB_URL);
  } catch (ex) {
    host.innerHTML = '';
    showError('acctSubError', friendlyError(ex, 'Could not load billing.'));
    return;
  }

  // A render that lost the race to a newer one (the section was re-rendered
  // while this fetch was in flight) must neither mount into its now-detached
  // tree nor leave subPricing pointing at a selector nobody can see: Apply
  // would then read a stale selection and post "no change".
  if (!host.isConnected) return;

  if (!subData?.subscription) {
    host.innerHTML = subNotSubscribedHtml(subData) + '<div id="acctUsageCard"></div><div id="acctBandwidthCard"></div>';
    loadUsageCard();
    loadBandwidthCard(bandwidthDeps());
    return;
  }

  host.innerHTML = subManagerHtml(subData);
  loadUsageCard();
  loadBandwidthCard(bandwidthDeps());

  // Change-plan surface: the same catalog-driven cards as the wizard,
  // preloaded with what is billing today. Apply arms only on a real change.
  const pricingHost = document.getElementById('acctPricing');
  const applyBtn = document.getElementById('acctPlanApply');
  const live = shapeOfItems(subData.subscription.items || []);
  // The keys the selector can represent. A stray add-on on a Partner/Super
  // plan, and a retired add-on on any plan, is handled by its own card above,
  // so neither must arm Apply here.
  const currentKeys = new Set([...keysOfCurrent(subData)].filter(k => !isRetiredLookupKey(k) && (live.subType === 'user' || !k.startsWith('po.addon.') || /^po\.addon\.seats\./.test(k))));
  if (pricingHost) {
    subPricing = mountPricingSelect(pricingHost, {
      catalog: cachedPing()?.productCatalog || [],
      initial: { subType: live.subType, cadence: live.cadence, addons: live.subType === 'user' ? withoutRetiredAddons(live.addons) : {}, seats: live.seats },
      onChange: (sel) => {
        if (!applyBtn) return;
        const dirty = sel.subType && !sameSelection(sel, live, currentKeys);
        applyBtn.disabled = !dirty;
      }
    });
    const sel = subPricing.get();
    if (applyBtn) applyBtn.disabled = !sel.subType || sameSelection(sel, live, currentKeys);
  }
}

/* THE EXACT CHARGE ON A PLAN CHANGE (the money plan, item 2e, 2026-09-24; decisions 37(8) and 37(12)). An upgrade, an
 * add-on or more seats is charged today (the backend's always_invoice), so the Confirm names the amount, sales tax
 * included, from Stripe's own preview of that change, read just before the button arms:
 *   POST v1/billing/subscription/quote { subType, cadence, addons, seats }
 *     -> { quote: { subtotalCents, taxCents, totalCents, prorationDate, perPeriodCents? } }
 * and the press sends it back with the change as { expectedTotalCents, prorationDate }: the server charges nothing
 * unless the charge is still that amount (409 AMOUNT_CHANGED answers the new quote, and nothing is charged).
 * Stripe's page (https://docs.stripe.com/api/invoices/create_preview, read 2026-09-24): a preview of a subscription
 * update shows its prorations, and "to ensure that the actual proration is calculated exactly the same as the
 * previewed proration, you should pass the subscription_details.proration_date parameter when doing the actual
 * subscription update"; proration_date must fall within the current period, and proration_behavior cannot be "none".
 * A change charged nothing today (fewer, removals only) reads no quote. A lane without the quote route (404) keeps the
 * words it had, which name no amount; the route is the backend's to add (functions/billingSubscription.js). */
const SUB_QUOTE_URL = `${PRAG_API_BASE}/billing/subscription/quote`;
function planBody(sel) { return { subType: sel.subType, cadence: sel.cadence, addons: sel.addons, seats: sel.seats || 0 }; }
/** Stripe's preview of what the change charges today, or null on a lane without the route. Throws when the route could not answer. */
async function quotePlanChange(sel) {
  try {
    const d = await apiFetch(SUB_QUOTE_URL, { method: 'POST', body: JSON.stringify(planBody(sel)) });
    const q = d?.quote;
    return q && Number.isFinite(Number(q.totalCents)) ? q : null;
  } catch (ex) {
    if (ex?.status === 404 && !ex?.data?.code) return null;
    throw ex;
  }
}
/** "charge $50.66 today ($46.80 plus $3.86 sales tax)", or "charge $46.80 today" with no tax on it, or "no charge today". */
function chargeTodayWords(q) {
  const total = Math.round(Number(q.totalCents) || 0), tax = Math.max(0, Math.round(Number(q.taxCents) || 0));
  if (total <= 0) return 'no charge today';
  const sub = Number.isFinite(Number(q.subtotalCents)) ? Math.round(Number(q.subtotalCents)) : total - tax;
  return tax > 0 ? `charge ${usdCents(total)} today (${usdCents(sub)} plus ${usdCents(tax)} sales tax)` : `charge ${usdCents(total)} today`;
}

/**
 * The charge a press would take: read on the press that arms (the button busy while it is out) and kept on the button
 * for the press that confirms, so the amount confirmed is the amount shown. Answers { quote } (quote null: nothing
 * charged today, or a lane without the route), or null when it could not be read (the error is shown, nothing charged).
 */
async function planQuoteFor(btn, sel, kind) {
  if (kind === 'less') return { quote: null };
  if (btn.dataset.armed === '1') {
    try { return { quote: btn.dataset.planQuote ? JSON.parse(btn.dataset.planQuote) : null }; } catch { return { quote: null }; }
  }
  const done = busy(btn, 'Working out the exact charge…');
  try {
    const quote = await quotePlanChange(sel);
    btn.dataset.planQuote = quote ? JSON.stringify(quote) : '';
    return { quote };
  } catch (ex) {
    if (!ex?.sessionInvalidated) showError('acctPlanError', ex?.data?.code === 'TAX_LOCATION' ? friendlyError(ex, 'Your billing address is needed for sales tax.') : 'The exact charge could not be worked out right now. Try again in a moment. Nothing was charged.');
    return null;
  } finally { done(); }
}
/** The Confirm's words: what will actually happen, per the backend's rule, with the amount charged today when it is known. */
function planQuestion(kind, sel, quote, endDate) {
  const per = sel.cadence === 'annual' ? '/yr' : '/mo';
  const next = Number.isFinite(Number(quote?.perPeriodCents)) ? Number(quote.perPeriodCents) : sel.totalCents;
  if (kind === 'less') return `Confirm: ${usdCents(sel.totalCents)}${per} plus sales tax from ${endDate}, no charge now`;
  if (kind === 'both') return quote ? `Confirm: ${chargeTodayWords(quote)} for the additions; removals on ${endDate}` : `Confirm: additions charge today; removals on ${endDate}`;
  return quote ? `Confirm: ${chargeTodayWords(quote)}, then ${usdCents(next)}${per} plus sales tax` : `Confirm: ${usdCents(sel.totalCents)}${per} plus sales tax, difference charged today`;
}
/**
 * The change, sent with the amount shown. Applying… while it is out; after a refusal the button reads as a fresh Apply,
 * not as a confirm that already fired. On success it stays waiting: the section is drawn again from the new subscription.
 */
async function submitPlanChange(btn, sel, quote, endDate) {
  const done = busy(btn, 'Applying…');
  delete btn.dataset.planQuote;
  try {
    const r = await apiFetch(SUB_UPDATE_URL, {
      method: 'POST',
      body: JSON.stringify({ ...planBody(sel), ...(quote ? { expectedTotalCents: Math.round(Number(quote.totalCents) || 0), prorationDate: quote.prorationDate } : {}) })
    });
    const msg = document.getElementById('acctPlanMsg');
    const when = r?.effectiveAt ? fmtDate(r.effectiveAt) : endDate;
    const text = r?.applied === 'scheduled'
      ? `Scheduled. Your current plan runs until ${when}; the new plan starts then. No charge, no credit.`
      : r?.applied === 'both'
        ? `Additions applied; the difference settles today. Removals take effect on ${when}.`
        : r?.applied === 'none'
          ? 'No change to make.'
          : 'Plan updated. The difference settles today; your tier follows the paid invoice.';
    if (msg) { msg.textContent = text; msg.hidden = false; }
    setTimeout(() => { const m = document.getElementById('acctMain'); if (m && activeSection === 'subscription') renderSubscription(m); }, 1800);
  } catch (ex) {
    done();
    // the charge moved since it was shown: nothing was charged; the next press reads it again
    const moved = ex?.status === 409 && ex?.data?.code === 'AMOUNT_CHANGED' && quote;
    const now = Number(ex?.data?.quote?.totalCents);
    showError('acctPlanError', moved && Number.isFinite(now)
      ? `The charge is now ${usdCents(now)}, not ${usdCents(quote.totalCents)}. Check it and press again. Nothing was charged.`
      : friendlyError(ex, 'Could not update the plan.'));
  }
}

async function applyPlanChange(btn) {
  const sel = subPricing?.get();
  if (!sel?.subType || btn.disabled) return;
  const live = shapeOfItems(subData?.subscription?.items || []);
  const kind = changeKind(live, { subType: sel.subType, cadence: sel.cadence, addons: sel.addons, seats: sel.seats });
  const endDate = fmtDate(subData?.subscription?.currentPeriodEnd);
  showError('acctPlanError', '');
  const q = await planQuoteFor(btn, sel, kind);
  if (!q) return;
  armConfirm(btn, planQuestion(kind, sel, q.quote, endDate), () => submitPlanChange(btn, sel, q.quote, endDate));
}

// Drop a scheduled period-end change; the live plan is untouched.
// The stray-add-on "kept" memory: per browser, per account. Set when the
// customer undoes a scheduled add-on removal; cleared when they schedule one.
function keptAddonKey() { return `pragoptics_addon_kept_v1:${cachedPing()?.user?.userId || ''}`; }
function keptAddonKeys() { try { return JSON.parse(localStorage.getItem(keptAddonKey()) || '[]'); } catch { return []; } }
function rememberKeptAddons(keys) { try { localStorage.setItem(keptAddonKey(), JSON.stringify(keys)); } catch { /* storage blocked */ } }
function forgetKeptAddons() { try { localStorage.removeItem(keptAddonKey()); } catch { /* storage blocked */ } }
// True when the scheduled change keeps the plan and cadence and only drops
// add-ons (the shape the stray-add-on removal writes).
function isAddonDrop(cur, pending) {
  const ps = pending?.shape;
  if (!ps || ps.subType !== cur.subType || ps.cadence !== cur.cadence) return false;
  const curOn = Object.keys(cur.addons || {}).filter(k => cur.addons[k]);
  const pendOn = Object.keys(ps.addons || {}).filter(k => ps.addons[k]);
  return curOn.some(k => !pendOn.includes(k)) && !pendOn.some(k => !curOn.includes(k));
}

async function keepCurrentPlan(btn) {
  if (btn.disabled) return;
  showError('acctPendingError', '');
  const live = shapeOfItems(subData?.subscription?.items || []);
  const wasAddonDrop = isAddonDrop(live, subData?.pendingChange);
  const done = busy(btn, 'Keeping it…');
  try {
    await apiFetch(SUB_UPDATE_URL, { method: 'POST', body: JSON.stringify({ cancelPending: true }) });
    if (wasAddonDrop) rememberKeptAddons(strayAddonKeys(live));
    const m = document.getElementById('acctMain');
    if (m && activeSection === 'subscription') renderSubscription(m);
  } catch (ex) {
    showError('acctPendingError', friendlyError(ex, 'Could not cancel the scheduled change.'));
  } finally { done(); }
}

// Schedule the removal of add-ons that do not belong on this plan (or are no
// longer offered) at the end of the paid period. Every other add-on the plan
// carries is kept. The backend classifies it as "less": no charge, no credit.
async function dropStrayAddons(btn) {
  const live = shapeOfItems(subData?.subscription?.items || []);
  if (!live.subType) return;
  forgetKeptAddons();
  const stray = strayAddonKeys(live);
  const addons = {};
  for (const k of Object.keys(live.addons)) addons[k] = !!live.addons[k] && !stray.includes(k);
  armConfirm(btn, `Confirm: remove on ${fmtDate(subData?.subscription?.currentPeriodEnd)}`, async () => {
    showError('acctPendingError', '');
    const done = busy(btn, 'Scheduling the removal…');
    try {
      await apiFetch(SUB_UPDATE_URL, {
        method: 'POST',
        body: JSON.stringify({ subType: live.subType, cadence: live.cadence, addons })
      });
      const m = document.getElementById('acctMain');
      if (m && activeSection === 'subscription') renderSubscription(m);
    } catch (ex) {
      showError('acctPendingError', friendlyError(ex, 'Could not schedule the removal.'));
    } finally { done(); }
  });
}

async function startPmUpdate(btn) {
  // In-flight guard: every extra click would mint another SetupIntent.
  if (btn?.disabled || subPmCtx) return;
  const done = busy(btn, 'Opening the card form…');
  showError('acctPmError', '');
  const hostWrap = document.getElementById('acctPmHost');
  const actions = document.getElementById('acctPmActions');
  try {
    const res = await apiFetch(PM_URL, { method: 'POST', body: '{}' });
    await ensureStripeJs().catch(() => null);
    const stripe = window.Stripe?.(window.STRIPE_PUBLISHABLE_KEY);
    if (!stripe) throw new Error('Stripe is not available.');
    const elements = stripe.elements({ clientSecret: res.clientSecret, appearance: stripeAppearance() });
    const el = elements.create('payment');
    const mountAt = document.getElementById('acctPmElement');
    mountAt.innerHTML = '';
    el.mount(mountAt);
    subPmCtx = { stripe, elements };
    if (hostWrap) hostWrap.hidden = false;
    if (actions) actions.hidden = true;
  } catch (ex) {
    showError('acctPmError', friendlyError(ex, 'Could not start the card update.'));
  } finally { done(); }
}

async function savePmUpdate(btn) {
  if (!subPmCtx) return;
  btn.disabled = true;
  const orig = btnLabel(btn, 'Saving…');
  showError('acctPmError', '');
  try {
    const { error } = await subPmCtx.stripe.confirmSetup({
      elements: subPmCtx.elements,
      confirmParams: { return_url: `${location.origin}${location.pathname}?post=pm` },
      redirect: 'if_required'
    });
    // the site's own sentence for what Stripe answered, never Stripe's own text
    if (error) throw Object.assign(new Error(cardErrorWords(error, { doing: 'save' })), { plain: true });
    const msg = document.getElementById('acctPmMsg');
    if (msg) { msg.textContent = 'Card saved. It becomes the default within a few seconds.'; msg.hidden = false; }
    subPmCtx = null;
    setTimeout(() => { const m = document.getElementById('acctMain'); if (m && activeSection === 'subscription') renderSubscription(m); }, 2500);
  } catch (ex) {
    // friendlyError so a session that died mid-setup stays quiet here too; the
    // Stripe.js errors it does not recognise still fall through to ex.message.
    // (a session that died mid-setup stays quiet: friendlyError answers ''; anything else is the site's own sentence,
    // never Stripe.js's text or a browser's)
    showError('acctPmError', ex?.plain ? ex.message : ex?.sessionInvalidated ? friendlyError(ex, '') : cardErrorWords(ex, { doing: 'save' }));
    btn.disabled = false;
    btnLabel(btn, orig);
  }
}

function cancelPmUpdate() {
  subPmCtx = null;
  const hostWrap = document.getElementById('acctPmHost');
  const actions = document.getElementById('acctPmActions');
  if (hostWrap) hostWrap.hidden = true;
  if (actions) {
    actions.hidden = false;
    const btn = actions.querySelector('[data-acct-action="pm-update"]');
    if (btn) btn.disabled = false;
  }
}

async function setCancelState(btn, action) {
  if (btn.disabled) return;
  const go = async () => {
    showError('acctCancelError', '');
    const done = busy(btn, action === 'cancel' ? 'Scheduling the end…' : 'Resuming…');
    try {
      await apiFetch(SUB_CANCEL_URL, { method: 'POST', body: JSON.stringify({ action }) });
      const m = document.getElementById('acctMain');
      if (m && activeSection === 'subscription') renderSubscription(m);
    } catch (ex) {
      showError('acctCancelError', friendlyError(ex, 'Could not update the subscription.'));
    } finally { done(); }
  };
  if (action === 'cancel') armConfirm(btn, `End on ${fmtDate(subData?.subscription?.currentPeriodEnd)}?`, go);
  else go();
}

/* ---------- orders (the customer's own) ---------- */

// The carrier's latest word under the tracking number, from the track webhook.
const CARRIER_WORDS = {
  PRE_TRANSIT: 'Label created', TRANSIT: 'In transit', DELIVERED: 'Delivered',
  RETURNED: 'Returned to sender', FAILURE: 'Delivery problem', UNKNOWN: 'No carrier update yet'
};
function orderStatusPill(status) {
  const s = String(status || '').toUpperCase();
  const good = ['PAID', 'LABEL_PURCHASED', 'SHIPPED', 'DELIVERED'].includes(s);
  const bad = ['REFUNDED', 'PARTIALLY_REFUNDED', 'PAYMENT_FAILED', 'RETURNED'].includes(s);
  // An abandoned or superseded start was never money expected: no warning color.
  const quiet = ['ABANDONED', 'CANCELED', 'SUPERSEDED'].includes(s);
  const SHORT = { LABEL_PURCHASED: 'labeled', PENDING_PAYMENT: 'pending', PARTIALLY_REFUNDED: 'partial refund', PAYMENT_FAILED: 'failed' };
  return `<span class="acct-tag ${bad ? 'is-bad' : good ? 'is-verified' : quiet ? '' : 'is-pending'}" title="${escapeHtml(s.replaceAll('_', ' ').toLowerCase())}">${escapeHtml(SHORT[s] || s.replaceAll('_', ' ').toLowerCase() || 'pending')}</span>`;
}

/** "Sep 7", with the year only when it is not this year. */
function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

function orderLinesLabel(lines) {
  return (lines || []).map(l => `${l.label || l.productId}${(l.qty || 1) > 1 ? ` ×${l.qty}` : ''}`).join(', ');
}

async function renderOrders(main) {
  const showClaim = (LANE !== 'live') || ORDERS_CLAIM_LIVE;
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">Orders</h2>${explainLink('orders')}</header>
    <div class="ev-cards">
    ${cardHtml({ key: 'orders:list', icon: 'cart', title: 'Orders', summary: 'loading', open: true, body: `
      <p class="acct-error" id="acctOrdersError" hidden></p>
      <div id="acctOrdersBody"><p class="acct-loading">Loading…</p></div>` })}
    ${showClaim ? cardHtml({ key: 'orders:claim', icon: 'link', title: 'Link a guest order', summary: 'by order number', body: `
      <div class="acct-add-row">
        <input class="acct-input" type="text" id="acctClaimOrderId" placeholder="Order number" spellcheck="false" autocomplete="off" />
        <button class="btn btn-sm btn-lead btn-primary" type="button" id="acctClaimBtn">${ico('link')}<span>Link order</span></button>
      </div>
      <p class="acct-card-note ev-dom-door">The order number from your confirmation email. It must have been placed with an email verified on this account.</p>
      <p class="acct-error" id="acctClaimError" hidden></p>
      <p class="acct-card-note" id="acctClaimOk" hidden></p>` }) : ''}
    </div>
  `;

  await loadMyOrders();

  if (!showClaim) return;

  const btn = document.getElementById('acctClaimBtn');
  const input = document.getElementById('acctClaimOrderId');
  // A guest who just chose "create an account to track this order" arrives with
  // their order number stashed. Prefill it so linking is one click, but never
  // auto-submit: claiming stays an explicit action.
  try {
    const pre = sessionStorage.getItem('pragoptics_claim_order_id');
    if (pre) { input.value = pre; sessionStorage.removeItem('pragoptics_claim_order_id'); }
  } catch { /* fine */ }
  const doClaim = async () => {
    const orderId = (input.value || '').trim();
    showError('acctClaimError', '');
    const okEl = document.getElementById('acctClaimOk');
    okEl.hidden = true;
    if (!orderId) { showError('acctClaimError', 'Enter your order number.'); return; }
    if (btn.disabled) return;
    const done = busy(btn, 'Linking…');
    try {
      await apiFetch(ORDERS_CLAIM_URL, { method: 'POST', body: JSON.stringify({ orderId }) });
      input.value = '';
      okEl.textContent = 'Order linked. It now appears in your orders above.';
      okEl.hidden = false;
      await loadMyOrders();
    } catch (ex) {
      // This route writes its own customer-facing sentences, including the
      // deliberately uniform "no unclaimed order with that number under your
      // account" that a 404 carries. friendlyError maps every 404 to "This
      // feature is not available yet", which is both wrong and alarming here,
      // so the server's own wording wins. A dead session still stays silent:
      // friendlyError returns '' for it and the modal has already spoken.
      const msg = ex?.sessionInvalidated
        ? ''
        : (ex?.data?.error || friendlyError(ex, 'That order could not be linked. Check the number, and that the order email is verified on your account.'));
      showError('acctClaimError', msg);
    } finally { done(); }
  };
  btn.addEventListener('click', doClaim);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doClaim(); } });
}

async function loadMyOrders() {
  const host = document.getElementById('acctOrdersBody');
  if (!host) return;
  host.innerHTML = `<p class="acct-loading">Loading…</p>`;
  try {
    const data = await apiFetch(ORDERS_MINE_URL);
    const orders = data.orders || [];
    setCardSummary('orders:list', escapeHtml(orders.length ? `${orders.length} order${orders.length === 1 ? '' : 's'}` : 'none yet'));
    if (!orders.length) {
      host.innerHTML = `<p class="acct-empty">No orders on this account yet.</p>`;
      return;
    }
    host.innerHTML = `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap">
          <thead><tr><th>Date</th><th>Items</th><th class="adm-num">Total</th><th>Status</th><th>Tracking</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td class="adm-muted cell-tight" data-th="Date">${escapeHtml(fmtDate(o.createdAt))}</td>
                <td class="cell-ellip" data-th="Items" title="${escapeHtml(orderLinesLabel(o.lines))}">${escapeHtml(orderLinesLabel(o.lines))}</td>
                <td class="adm-num cell-tight" data-th="Total">${escapeHtml(usdCents(o.totalCents))}${Number(o.taxCents) > 0 ? `<div class="adm-muted">incl. ${escapeHtml(usdCents(o.taxCents))} tax</div>` : ''}</td>
                <td class="cell-tight" data-th="Status">${orderStatusPill(o.status)}</td>
                <td class="cell-ellip" data-th="Tracking" title="${escapeHtml(o.trackingNumber || '')}">${o.trackingNumber
                  ? (safeUrl(o.trackingUrl)
                      ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(o.trackingUrl))}" target="_blank" rel="noopener">${escapeHtml(o.trackingNumber)}</a>`
                      : `<code>${escapeHtml(o.trackingNumber)}</code>`)
                  : '<span class="adm-muted">—</span>'}${o.shipmentStatus
                  ? `<div class="adm-muted">${escapeHtml(CARRIER_WORDS[String(o.shipmentStatus).toUpperCase()] || o.shipmentStatus)}${o.lastTrackUpdateAt ? ` · ${escapeHtml(fmtDay(o.lastTrackUpdateAt))}` : ''}</div>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (ex) {
    host.innerHTML = '';
    showError('acctOrdersError', friendlyError(ex, 'Could not load your orders.'));
  }
}

/* ---------- placeholder sections ---------- */

function renderSoon(main, title, line) {
  // Honest empty state: the copy says what will appear here and what gates
  // it. No badge theater.
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">${escapeHtml(title)}</h2></header>
    <div class="acct-soon"><p>${escapeHtml(line)}</p></div>
  `;
}

/* ================================================================
   INTERNAL SECTIONS (administrators only; server re-checks every call)
   ================================================================ */

/* ---------- overview ---------- */

function statCard(n, label, hint, accent) {
  return `<div class="adm-stat-card${accent ? ` adm-stat-${escapeHtml(accent)}` : ''}">
      <span class="adm-stat-n">${escapeHtml(String(n))}</span>
      <span class="adm-stat-l">${escapeHtml(label)}</span>
      ${hint ? `<span class="adm-stat-h">${escapeHtml(hint)}</span>` : ''}
    </div>`;
}

/** The operator's AI section (2026-09-19): the month's spend against the platform ceiling, every owner who spent, the provider and its lanes. */
async function renderAdminAi(main) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">AI</h2></header>
    <p class="acct-error" id="admAiError" hidden></p>
    <div id="admAiBody"><p class="acct-loading">Loading…</p></div>`;
  const host = document.getElementById('admAiBody');
  try {
    const d = await apiFetch(ADMIN_AI_URL);
    const cap = d.cap || {}, p = d.provider || {};
    const pct = Number(cap.percent || 0);
    const cls = pct >= 95 ? 'is-hot' : pct >= 70 ? 'is-warn' : '';
    host.innerHTML = `
      <div class="adm-stat-grid">
        ${statCard(cents(cap.totalCents), `Spent in ${escapeHtml(d.month || '')}`)}
        ${statCard(cents(cap.capCents), 'Platform ceiling', 'AI_PLATFORM_CAP_CENTS', pct >= 80 ? 'amber' : '')}
        ${statCard(nFmt(cap.totalCalls), 'Calls this month')}
        ${statCard(escapeHtml(p.configured ? p.name : 'not configured'), 'Provider', p.configured ? `${(p.lanes || []).length} lanes, default ${escapeHtml(p.defaultLane || '')}` : 'AI_PROVIDER and AI_API_KEY', p.configured ? '' : 'amber')}
      </div>
      <div class="adm-card">
        <div class="use-row ev-meter">
          <div class="use-head"><span class="use-name">Ceiling used</span><span class="use-val">${escapeHtml(String(pct))}%${cap.warned80 ? ' · 80% alert sent' : ''}</span></div>
          <div class="use-track"><div class="use-fill ${cls}" style="width:${Math.min(100, pct).toFixed(1)}%"></div></div>
        </div>
        <p class="adm-note">Past the ceiling every AI call on the platform answers 503 until the month resets or the setting is raised. Each account is also held to its own credit: Free 10 calls and 2 cents, User $1, Partner $5, Super $25.</p>
      </div>
      ${(p.lanes || []).length ? `
      <div class="adm-card">
        <h3 class="adm-card-h">Lanes and prices</h3>
        <div class="adm-table-scroll">
          <table class="adm-table">
            <thead><tr><th>Lane</th><th>Model</th><th class="adm-num">Per exchange</th></tr></thead>
            <tbody>${p.lanes.map(l => `<tr><td>${escapeHtml(l.lane)}${l.lane === p.defaultLane ? ' <span class="acct-tag is-primary">default</span>' : ''}</td><td><code>${escapeHtml(l.model)}</code></td><td class="adm-num">${escapeHtml(String(l.exchangeCents))}¢</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}
      <div class="adm-card">
        <h3 class="adm-card-h">Who spent (${escapeHtml(d.month || '')})</h3>
        ${!(d.rows || []).length ? '<p class="adm-empty">Nobody has used AI this month.</p>' : `
        <div class="adm-table-scroll">
          <table class="adm-table">
            <thead><tr><th>Account</th><th>Tier</th><th class="adm-num">Spent</th><th class="adm-num">Credit</th><th class="adm-num">Calls</th><th>Lanes</th></tr></thead>
            <tbody>
              ${d.rows.map(r => { const over = r.limitCents && r.usedCents >= r.limitCents; return `
                <tr>
                  <td class="adm-cell-email cell-ellip" title="${escapeHtml(r.email || r.userId)}">${escapeHtml(r.email || r.userId)}</td>
                  <td>${tierPill(r.tier)}</td>
                  <td class="adm-num ${over ? 'adm-money-neg' : ''}">${escapeHtml(cents(r.usedCents))}</td>
                  <td class="adm-num">${escapeHtml(cents(r.limitCents))}${r.callLimit ? ` · ${escapeHtml(String(r.callLimit))} calls` : ''}</td>
                  <td class="adm-num">${escapeHtml(nFmt(r.calls))}</td>
                  <td class="adm-muted">${escapeHtml(Object.entries(r.byLane || {}).map(([k, v]) => `${k} ${v.calls}`).join(', '))}</td>
                </tr>`; }).join('')}
            </tbody>
          </table>
        </div>
        ${d.truncated ? '<p class="adm-note">Showing the first 2,000 accounts.</p>' : ''}`}
      </div>`;
  } catch (ex) {
    host.innerHTML = '';
    if (ex?.status === 404) { host.innerHTML = '<p class="adm-empty">The AI routes are not on this lane yet.</p>'; return; }
    showError('admAiError', friendlyError(ex, 'Could not read the AI usage.'));
  }
}

async function renderOverview(main) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Overview</h2></header>
    <div class="adm-stat-grid" id="admOverviewGrid">
      ${statCard('…', 'Users')}${statCard('…', 'Active')}
      ${statCard('…', 'Codes available')}${statCard('…', 'Codes claimed')}
    </div>
    <div class="adm-card">
      <h3 class="adm-card-h">Integrations</h3>
      <p class="adm-note">Each sync converges the provider to the exact event list this backend
      dispatches: nothing hand-maintained in a dashboard, nothing silently missing.</p>
      <div class="adm-actions-row">
        <button class="btn btn-sm btn-lead" type="button" data-adm-action="wh-stripe"
          data-tip="Creates or updates this lane's Stripe webhook endpoint to the canonical event list">${ico('zap')}<span>Sync Stripe webhooks</span></button>
        <button class="btn btn-sm btn-lead" type="button" data-adm-action="wh-stripe-connect"
          data-tip="Creates or updates this lane's Stripe Connect webhook endpoint (events from connected accounts: account.updated, account.application.deauthorized); a new endpoint's signing secret is shown once for STRIPE_CONNECT_WEBHOOK_SECRET">${ico('zap')}<span>Sync Stripe Connect webhook</span></button>
        <button class="btn btn-sm btn-lead" type="button" data-adm-action="wh-shippo"
          data-tip="Registers this lane's Shippo webhooks (labels, transactions, tracking)">${ico('zap')}<span>Sync Shippo webhooks</span></button>
      </div>
      <p class="muted" id="admIntegrationsResult" hidden></p>
      <h4 class="adm-card-h">Reconcile billing from Stripe</h4>
      <p class="adm-note">For an account whose live, paid subscription is no longer linked (a canceled
      profile, migrated customer, or stale metadata). Finds the live subscription on the customer,
      stamps this account on it, relinks the profile, and brings status and tier to what Stripe says,
      under the same proofs the webhook uses. Dry run shows the plan and writes nothing.</p>
      <div class="adm-actions-row">
        <input class="adm-input" type="text" id="admReconcileWho" placeholder="account email or userId" autocomplete="off" spellcheck="false">
        <button class="btn btn-sm btn-lead" type="button" data-adm-action="billing-reconcile-dry"
          data-tip="Compute the plan for this account and show it; nothing is written">${ico('eye')}<span>Dry run</span></button>
        <button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="billing-reconcile"
          data-tip="Write the plan: Stripe metadata, the profile link, status and tier">${ico('check')}<span>Reconcile</span></button>
      </div>
      <pre class="muted adm-pre" id="admReconcileResult" hidden></pre>
    </div>
    <div id="admUsageBlock"></div>
    <div id="admCostBlock"></div>
  `;
  loadAdminUsage();
  loadAdminCosts();
  const grid = main.querySelector('#admOverviewGrid');
  try {
    const [users, avail, claimed] = await Promise.all([
      apiFetch(`${USERS_URL}?limit=1000`).catch(() => ({ users: [] })),
      apiFetch(`${LIST_URL}?status=AVAILABLE&limit=1000`).catch(() => ({ codes: [] })),
      apiFetch(`${LIST_URL}?status=CLAIMED&limit=1000`).catch(() => ({ codes: [] }))
    ]);
    const all = users.users || [];
    cache.users = all;
    const active = all.filter(u => String(u.status).toUpperCase() === 'ACTIVE').length;
    const subscribed = all.filter(u => !['free', '', 'none'].includes(String(u.tier).toLowerCase())).length;
    grid.innerHTML =
      statCard(all.length, 'Users', `${active} active`) +
      statCard(subscribed, 'Subscribed', 'paid tiers') +
      statCard((avail.codes || []).length + (avail.truncated ? '+' : ''), 'Codes available',
        avail.truncated ? 'capped at first 1000' : '') +
      statCard((claimed.codes || []).length + (claimed.truncated ? '+' : ''), 'Codes claimed',
        claimed.truncated ? 'capped at first 1000' : '');
  } catch (ex) {
    grid.innerHTML = `<p class="adm-empty">${escapeHtml(friendlyError(ex, 'Could not load overview.'))}</p>`;
  }
}

async function loadAdminUsage() {
  const host = document.getElementById('admUsageBlock');
  if (!host) return;
  try {
    const d = await apiFetch(ADMIN_USAGE_URL);
    host.innerHTML = `
      <div class="adm-stat-grid" style="margin-top:12px;">
        ${statCard(nFmt(d.totals?.apiCalls), 'API calls this month')}
        ${statCard(nFmt(d.meteredUsers), 'Metered accounts', d.truncated ? 'capped at first 2000' : '')}
        ${statCard(nFmt(d.nearBaseCap), 'Near base cap', `past ${d.nearCapThresholdPct}% of base allowance`, d.nearBaseCap > 0 ? 'amber' : '')}
      </div>
      ${(d.top || []).length ? `
        <div class="adm-card">
          <h3 class="adm-card-h">Top consumers (${escapeHtml(d.month)})</h3>
          <div class="adm-table-scroll">
            <table class="adm-table">
              <thead><tr><th>Account</th><th>Tier</th><th class="adm-num">API calls</th><th class="adm-num">% of base</th></tr></thead>
              <tbody>
                ${d.top.map(u => `
                  <tr>
                    <td class="adm-cell-email cell-ellip" title="${escapeHtml(u.email)}">${escapeHtml(u.email)}</td>
                    <td>${tierPill(u.tier)}</td>
                    <td class="adm-num">${escapeHtml(nFmt(u.apiCalls))}</td>
                    <td class="adm-num ${u.apiPctOfBase >= 80 ? 'adm-money-neg' : ''}">${escapeHtml(String(u.apiPctOfBase))}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <p class="adm-note">Accounts pressing base allowances are the add-on demand signal. Allowances
          are enforced: a customer is refused at 1.1x the base until capacity is added or the month resets; operators are never capped.</p>
        </div>
      ` : ''}
    `;
  } catch (ex) {
    host.innerHTML = '';
  }
}

/* ---------- Azure spend (whole subscription, admin only) ---------- */
async function loadAdminCosts(force) {
  const host = document.getElementById('admCostBlock');
  if (!host) return;
  try {
    const d = await apiFetch(force ? `${ADMIN_COSTS_URL}?refresh=1` : ADMIN_COSTS_URL);
    if (d && d.ok === false && d.needsSetup) {
      host.innerHTML = `
        <div class="adm-card" style="margin-top:12px;">
          <h3 class="adm-card-h">Azure spend</h3>
          <p class="adm-note">${escapeHtml(d.message || 'Azure cost is not available yet.')}</p>
          <div class="adm-actions-row">${iconBtn({ adm: 'cost-refresh' }, 'refresh', 'Read Azure spend again')}</div>
        </div>`;
      return;
    }
    const rows = d.byResourceGroup || [];
    const asOf = d.asOf ? new Date(d.asOf).toLocaleString() : '';
    const sub = d.cached ? `as of ${asOf}${d.stale ? ', stale' : ''}` : `as of ${asOf}`;
    host.innerHTML = `
      <div class="adm-card" style="margin-top:12px;">
        <div class="adm-actions-row" style="justify-content:space-between;align-items:center;">
          <h3 class="adm-card-h">Azure spend this month</h3>
          ${iconBtn({ adm: 'cost-refresh' }, 'refresh', 'Read Azure spend again')}
        </div>
        <div class="adm-stat-grid" style="margin-top:8px;">
          ${statCard(money(d.total), `Total, ${escapeHtml(d.month || '')} (${escapeHtml(d.currency || 'USD')})`, escapeHtml(sub))}
        </div>
        ${rows.length ? `
          <div class="adm-table-scroll">
            <table class="adm-table">
              <thead><tr><th>Resource group</th><th class="adm-num">Cost</th></tr></thead>
              <tbody>
                ${rows.map(r => `<tr><td class="cell-ellip" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</td><td class="adm-num">${escapeHtml(money(r.cost))}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="adm-note">Whole subscription, month to date, by resource group. Cached; Refresh re-queries Cost Management.</p>
        ` : `<p class="adm-note">No cost recorded yet this month.</p>`}
      </div>`;
  } catch (ex) {
    host.innerHTML = `
      <div class="adm-card" style="margin-top:12px;">
        <h3 class="adm-card-h">Azure spend</h3>
        <p class="adm-note">${escapeHtml(friendlyError(ex, 'Could not read Azure cost.'))}</p>
        <div class="adm-actions-row">${iconBtn({ adm: 'cost-refresh' }, 'refresh', 'Read Azure spend again')}</div>
      </div>`;
  }
}

/* ---------- users ---------- */

function tierPill(tier) { return tierBadge(tier); }   // the one tier badge (src/components/tierCopy.js)
function statusPill(status) {
  const s = String(status || '').toUpperCase();
  const cls = s === 'ACTIVE' ? 'is-verified' : (s === 'SUSPENDED' || s === 'CLOSED') ? 'is-bad' : 'is-quiet';
  return `<span class="acct-tag ${cls}">${escapeHtml(s || '—')}</span>`;
}

// The per-row entry to the manage modal. A closed account is finished unless
// it still carries a billing profile, in which case the close did not get all
// the way through and can be run again.
function userManageButtonHtml(u) {
  const closed = String(u.status || '').toUpperCase() === 'CLOSED';
  const attrs = `data-adm-action="user-manage" data-user="${escapeHtml(u.userId || '')}" data-email="${escapeHtml(u.email || '')}"`;
  if (closed && !u.billingProfileId) {
    return `<button class="btn btn-sm btn-ico" type="button" ${attrs} disabled aria-label="Closed accounts cannot be changed" data-tip="Closed accounts cannot be changed">${ico('sliders')}</button>`;
  }
  if (closed) {
    return `<button class="btn btn-sm btn-lead is-danger" type="button" ${attrs} data-tip="Closed but still carries a billing profile; run the close again to finish it">${ico('power')}<span>Finish close</span></button>`;
  }
  return `<button class="btn btn-sm btn-ico" type="button" ${attrs} aria-label="Manage ${escapeHtml(u.email || '')}" data-tip="Manage: role, operator flags, suspension, phone freeze, closing">${ico('sliders')}</button>`;
}

function usersTableHtml(users) {
  if (!users.length) return `<p class="adm-empty">No users match this view.</p>`;
  return `
    <div class="adm-table-scroll">
      <table class="adm-table adm-users-table">
        <thead>
          <tr><th>Email</th><th>Tier</th><th>Status</th><th>Role</th><th>Flags</th><th>Joined</th><th></th></tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td class="adm-cell-email cell-ellip" title="${escapeHtml(u.email || '')}">${escapeHtml(u.email || '—')}</td>
              <td>${tierPill(u.tier)}</td>
              <td>${statusPill(u.status)}</td>
              <td class="adm-muted">${escapeHtml(u.role ? roleLabel(u.role) : '—')}</td>
              <td>
                ${u.isAdmin ? '<span class="adm-pill adm-flag-admin">admin</span>' : ''}
                ${u.isDev ? '<span class="adm-pill adm-flag-dev">dev</span>' : ''}
                ${u.phoneChangesFrozen ? '<span class="adm-pill is-bad" title="Phone changes are paused pending review">phone paused</span>' : ''}
                ${!u.isAdmin && !u.isDev && !u.phoneChangesFrozen ? '<span class="adm-muted">—</span>' : ''}
              </td>
              <td class="adm-muted">${escapeHtml((u.createdAt || '').slice(0, 10) || '—')}</td>
              <td class="cell-tight">${userManageButtonHtml(u)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function applyUserFilters(users) {
  const q = (document.getElementById('admUserSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('admUserStatus')?.value || '';
  const tier = document.getElementById('admUserTier')?.value || '';
  return users.filter(u => {
    if (q && !String(u.email || '').toLowerCase().includes(q)) return false;
    // FROZEN is a view, not a status: accounts whose phone changes are paused.
    if (status === 'FROZEN') { if (u.phoneChangesFrozen !== true) return false; }
    else if (status) { if (String(u.status || '').toUpperCase() !== status) return false; } else if (String(u.status || '').toUpperCase() === 'CLOSED') return false;
    if (tier && String(u.tier || '').toLowerCase() !== tier) return false;
    return true;
  });
}

function renderUserRows() {
  const host = document.getElementById('admUsersBody');
  if (!host || !cache.users) return;
  host.innerHTML = usersTableHtml(applyUserFilters(cache.users));
  const frozen = cache.users.filter(u => u.phoneChangesFrozen === true).length;
  const line = document.getElementById('admFrozenCount');
  if (line) {
    line.textContent = frozen ? `${frozen} account${frozen === 1 ? ' has' : 's have'} phone changes paused` : '';
    line.hidden = !frozen;
  }
}

/* ---------- manage one account ---------- */

const USER_ROLES = ['viewer', 'member', 'developer', 'admin'];
// The owner's custom team roles (a notification audience and nothing more), as
// the server reports them with the roster and with the Notifications desk.
function customRoles() { return Array.isArray(cache.customRoles) ? cache.customRoles : []; }
function roleLabel(key) {
  const k = String(key || '');
  const c = customRoles().find(r => r.key === k);
  return c ? c.label : (k ? k.charAt(0).toUpperCase() + k.slice(1) : '');
}

// One POST per action, every one carrying the row's email as expectEmail so
// a roster that went stale is refused by the server rather than acted on. On
// { ok, user } the row is swapped in place and the table repainted; the
// roster is never re-fetched for a single change.
/** An account the server answered with, into the roster and its rows. */
function keepUserRow(user) {
  const i = (cache.users || []).findIndex(u => u.userId === user.userId);
  if (i >= 0) cache.users[i] = user; else (cache.users ||= []).push(user);
  renderUserRows();
}
async function patchUser(row, patch) {
  showError('admUsersError', '');
  showError('umError', '');
  try {
    const r = await apiFetch(USER_PATCH_URL, {
      method: 'POST',
      body: JSON.stringify({ userId: row.userId, expectEmail: row.email, ...patch })
    });
    if (r?.ok && r.user) { keepUserRow(r.user); return r.user; }
    throw new Error('The server did not return the updated account.');
  } catch (ex) {
    const msg = friendlyError(ex, 'Could not update that account.');
    showError('admUsersError', msg);
    showError('umError', msg);
    return null;
  }
}

function userManageHtml(u, { self }) {
  const status = String(u.status || '').toUpperCase();
  const closed = status === 'CLOSED';
  const tier = String(u.tier || 'free').toLowerCase();
  const email = u.email || ''; const noEmail = !String(email).trim();
  const lockTitle = 'You cannot change your own role, status, or admin flag.';
  const lock = self ? `disabled title="${lockTitle}"` : '';
  return `
    <div class="acct-modal-mask" data-um-close></div>
    <div class="acct-modal is-wide um" role="dialog" aria-modal="true" aria-label="Manage account">
      <header class="um-head">
        <div class="um-head-main">
          <h3 class="acct-modal-h">Manage account</h3>
          <p class="um-email"><strong>${escapeHtml(email)}</strong></p>
        </div>
        <div class="um-pills">
          ${tierPill(tier)} ${statusPill(status)}
          ${u.isAdmin ? '<span class="adm-pill adm-flag-admin">admin</span>' : ''}
          ${u.isDev ? '<span class="adm-pill adm-flag-dev">dev</span>' : ''}
          ${u.phoneChangesFrozen ? '<span class="adm-pill is-bad" title="Phone changes are paused pending review">phone paused</span>' : ''}
        </div>
      </header>
      ${closed ? `
        <section class="um-sec">
          <p class="acct-modal-note">This account is closed${u.closedAt ? ` (${escapeHtml(fmtDate(u.closedAt))})` : ''}. It still carries a billing profile, so the close did not finish. Running it again ends the subscription and clears the profile.</p>
        </section>
      ` : `
        <section class="um-sec">
          <div class="um-sec-h">Role and access</div>
          <div class="um-grid2">
            <label class="um-field">
              <span class="adm-label">Role</span>
              <select class="adm-select" id="umRole" ${lock}>
                ${USER_ROLES.map(r => `<option value="${r}" ${String(u.role || '') === r ? 'selected' : ''}>${r}</option>`).join('')}
                ${customRoles().map(r => `<option value="${escapeHtml(r.key)}" ${String(u.role || '') === r.key ? 'selected' : ''}>${escapeHtml(r.label)} (team)</option>`).join('')}
                ${USER_ROLES.includes(String(u.role || '')) || customRoles().some(r => r.key === String(u.role || '')) || !u.role ? '' : `<option value="${escapeHtml(u.role)}" selected>${escapeHtml(u.role)}</option>`}
              </select>
            </label>
            <div class="um-field">
              <span class="adm-label">Operator flags</span>
              <div class="um-checks">
                <label class="um-check ${self || !isOwner() ? 'is-locked' : ''}" title="${self ? lockTitle : !isOwner() ? 'Only the platform owner grants or removes Admin' : 'Admin accounts see the Internal sections and every admin route'}">
                  <input type="checkbox" id="umAdmin" ${u.isAdmin ? 'checked' : ''} ${self || !isOwner() ? 'disabled' : ''}> Admin
                </label>
                <label class="um-check" title="Dev accounts can route this browser to the dev lane">
                  <input type="checkbox" id="umDev" ${u.isDev ? 'checked' : ''}> Dev
                </label>
              </div>
            </div>
          </div>
          ${tier !== 'free' ? `<p class="um-note">Paying: on the ${escapeHtml(tierName(tier))} plan. Suspension does not pause billing.</p>` : ''}
          <div class="um-actions">
            <button class="btn btn-sm btn-lead btn-primary" type="button" data-um-save data-tip="Saves the role and flags above in one change">${ico('check')}<span>Save changes</span></button>
          </div>
        </section>
        <section class="um-sec">
          <div class="um-sec-h">Account status</div>
          <p class="acct-modal-note">Suspending blocks sign-in and revokes every session. Billing continues. Reactivating restores sign-in.</p>
          <p class="acct-modal-note">For a breach of the community standards, use Community standards: it also holds the team's environment.</p>
          <div class="um-actions">
            ${status === 'SUSPENDED'
              ? `<button class="btn btn-sm btn-lead" type="button" data-um-status="ACTIVE" ${lock || 'title="Click twice to confirm."'}>${ico('play')}<span>Reactivate</span></button>`
              : `<button class="btn btn-sm btn-lead is-danger" type="button" data-um-status="SUSPENDED" ${lock || 'title="Click twice to confirm."'}>${ico('pause')}<span>Suspend</span></button>`}
            ${u.phoneChangesFrozen ? `<button class="btn btn-sm btn-lead" type="button" data-um-unfreeze data-tip="Lets the account add, verify, and remove mobile numbers again">${ico('lock')}<span>Unfreeze phone changes</span></button>` : ''}
          </div>
        </section>
        <section class="um-sec">
          <div class="um-sec-h">Support recovery</div>
          <p class="acct-modal-note">Clears the authenticator and every passkey and signs the account out everywhere. The customer enrolls a new second factor on their next sign-in. The password is untouched. A reason is required.</p>
          <input class="adm-input" id="umResetReason" type="text" maxlength="200" placeholder="Ticket number or short note" ${self ? 'disabled' : ''} aria-label="Reason for the second factor reset">
          <div class="um-actions">
            <button class="btn btn-sm btn-lead is-danger" type="button" data-um-2fa-reset ${self ? `disabled data-tip="${lockTitle}"` : 'title="Click twice to confirm."'}>${ico('refresh')}<span>Reset second factor</span></button>
          </div>
        </section>
      `}
      <section class="um-sec">
        <div class="um-sec-h">Community standards</div>
        <p class="acct-modal-note">Take this account's published sites down, suspend it for the community standards (its environment is held for its whole team), or close it for cause. Each is recorded and the owner is emailed.</p>
        <div class="um-actions">
          <button class="btn btn-sm btn-lead" type="button" data-um-conduct ${self ? `disabled data-tip="${lockTitle}"` : ''}>${ico('shield')}<span>Open community standards</span></button>
        </div>
      </section>
      <section class="um-sec um-sec--danger">
        <div class="um-sec-h">Close account</div>
        <p class="acct-modal-note">Permanent. Ends any subscription now, removes the sign-in, and signs the account out everywhere. An account still holding Microsoft license commitments is shown what is left of them first, and closes only once that amount is charged on the customer's final bill. ${noEmail ? "This account's email was cleared when it closed, so confirm by its account id instead: copy it below and paste it to enable the button." : 'Type the account email to enable the button.'}</p>
        ${noEmail ? `<div class="acct-actions-row um-close-idrow"><code class="ev-code um-close-id">${escapeHtml(u.userId)}</code>${iconBtn({ um: 'copy-id' }, 'copy', 'Copy the account id')}</div>` : ''}<input class="adm-input" id="umCloseEmail" type="${noEmail ? 'text' : 'email'}" autocomplete="off" spellcheck="false" placeholder="${noEmail ? 'Paste the account id' : escapeHtml(email)}" ${lock} aria-label="${noEmail ? 'Paste the account id to confirm' : 'Type the account email to confirm'}">
        <div class="um-close-bill" id="umCloseBill" role="status" aria-live="polite" hidden></div>
        <div class="um-actions">
          <button class="btn btn-sm btn-lead is-danger" type="button" data-um-close-account disabled
            data-tip="${self ? lockTitle : (noEmail ? 'Enabled once the account id above matches this account' : 'Enabled once the email above matches this account')}">${ico('power')}<span>Close account</span></button>
        </div>
      </section>
      <p class="acct-error" id="umError" hidden></p>
      <div class="acct-modal-actions">
        <button class="btn btn-ghost" type="button" data-um-close>Done</button>
      </div>
    </div>
  `;
}

/**
 * The final bill of the account being closed from the Users desk (decision 19), as the server answered the close: its
 * sentence, each license with what is left of it, the sales tax when the answer names it (37(12)), and the press that
 * confirms it.
 */
function closeBillHtml(bill) {
  const taxCents = Math.max(0, Math.round(Number(bill.taxCents) || 0));
  const lines = (bill.lines || []).map(l => `<li>${escapeHtml(l.name || 'A license')}, ${escapeHtml(String(l.seats))} license seat${Number(l.seats) === 1 ? '' : 's'}, to ${escapeHtml(fmtDate(l.commitmentEndsAt))}: ${escapeHtml(l.remainingText || '')}</li>`).join('')
    + (taxCents > 0 ? `<li>Sales tax: ${escapeHtml(usdCents(taxCents))}</li>` : '');
  return `<p class="acct-modal-note">${escapeHtml(bill.sentence)}</p>${lines ? `<ul class="um-close-lines">${lines}</ul>` : ''}<p class="acct-modal-note">Press <strong>${escapeHtml(closeChargeWord(bill))}</strong> to charge it on the customer's final bill and close the account. If the card is declined, nothing is closed.</p>`;
}
/** The bill above the Close button (or none), and the button's word for it. */
function paintCloseBill(um) {
  const box = um.$('#umCloseBill');
  const btn = um.$('[data-um-close-account]');
  if (btn && !um.working) btnLabel(btn, um.closeBill ? closeChargeWord(um.closeBill) : 'Close account');
  if (!box) return;
  box.innerHTML = um.closeBill ? closeBillHtml(um.closeBill) : '';
  box.hidden = !um.closeBill;
}
/** Whether the email typed to enable the close is this account's. */
function closeMatches(um) {
  const typed = (um.$('#umCloseEmail')?.value || '').trim().toLowerCase();
  // the email is cleared when an account closes; a row with no email is confirmed by its account id instead
  const want = String(um.row.email || '').trim().toLowerCase() || String(um.row.userId || '').trim().toLowerCase();
  return !!typed && typed === want;
}
/** One change to the account (role, flags, status, phone freeze, second-factor reset), its button busy while it is out; the window repaints from the answer. */
async function runPatch(btn, patch, um) {
  if (um.working) return;
  um.working = true;
  const done = busy(btn, 'Working…');
  const fresh = await patchUser(um.row, patch);
  um.working = false;
  done();
  if (fresh) { um.row = fresh; um.paint(); }
}
/**
 * The close: one request, its button busy while it is out. Closing an admin drops the admin flag in the same request; an
 * account with license commitments answers the amount first (closeBillOf), shown above the button, and the next press
 * confirms it with acceptRemainingCents (decision 19).
 */
async function runClose(btn, um) {
  if (um.working) return;
  um.working = true;
  showError('admUsersError', ''); showError('umError', '');
  const patch = um.row.isAdmin ? { status: 'CLOSED', isAdmin: false } : { status: 'CLOSED' };
  if (um.closeBill) patch.acceptRemainingCents = um.closeBill.totalCents;
  const done = busy(btn, um.closeBill ? 'Charging and closing…' : 'Closing…');
  try {
    const r = await apiFetch(USER_PATCH_URL, { method: 'POST', body: JSON.stringify({ userId: um.row.userId, expectEmail: um.row.email, ...patch }) });
    if (!(r?.ok && r.user)) throw new Error('The server did not return the updated account.');
    keepUserRow(r.user);
    um.working = false; done();
    um.close();
  } catch (ex) {
    um.working = false; done();
    const bill = closeBillOf(ex);
    if (bill) { um.closeBill = bill; paintCloseBill(um); return; }
    const msg = friendlyError(ex, 'Could not close that account.');
    showError('admUsersError', msg); showError('umError', msg);
    paintCloseBill(um);
  }
}
/** The Manage account window's buttons: each a selector and what its press does, looked up by the window's one click listener. */
const USER_MANAGE_ACTIONS = [
  ['[data-um-save]', (btn, um) => {
    const patch = {};
    const roleEl = um.$('#umRole'), adminEl = um.$('#umAdmin'), devEl = um.$('#umDev');
    if (roleEl && !roleEl.disabled && roleEl.value !== String(um.row.role || '')) patch.role = roleEl.value;
    if (adminEl && !adminEl.disabled && adminEl.checked !== (um.row.isAdmin === true)) patch.isAdmin = adminEl.checked;
    if (devEl && devEl.checked !== (um.row.isDev === true)) patch.isDev = devEl.checked;
    if (!Object.keys(patch).length) { showError('umError', 'Nothing to save: the role and flags match the account.'); return; }
    runPatch(btn, patch, um);
  }],
  ['[data-um-status]', (btn, um) => {
    const next = btn.dataset.umStatus;
    armConfirm(btn, `Confirm: ${next === 'ACTIVE' ? 'reactivate' : 'suspend'} ${um.row.email || ''}`, () => runPatch(btn, { status: next }, um));
  }],
  ['[data-um-unfreeze]', (btn, um) => runPatch(btn, { phoneChangesFrozen: false }, um)],
  ['[data-um-action="copy-id"]', (btn, um) => copyButton(btn, um.row.userId, { select: () => um.$('.um-close-id') })],
  // the community standards (2026-09-24): its own window over this one; the roster reloads after an action
  ['[data-um-conduct]', (btn, um) => {
    if (um.working) return;
    const done = busy(btn, 'Opening…');
    import('./conductDesk.js')
      .then(mod => mod.openConduct({ userId: um.row.userId, deps: { apiFetch, escapeHtml, friendlyError, fmtDate, cachedPing }, onChange: () => { um.close(); try { renderUsers(document.getElementById('acctMain')); } catch { /* the roster reloads on the next visit */ } } }))
      .catch(() => showError('umError', 'Could not open Community standards. Reload and try again.'))
      .finally(() => done());
  }],
  ['[data-um-2fa-reset]', (btn, um) => {
    const reason = (um.$('#umResetReason')?.value || '').trim();
    if (reason.length < 8) { showError('umError', 'Enter the reason first: the support ticket or a note, at least 8 characters.'); return; }
    armConfirm(btn, `Confirm: reset the second factor of ${um.row.email || ''}`, () => runPatch(btn, { secondFactorReset: true, reason }, um));
  }],
  ['[data-um-close-account]', (btn, um) => {
    if (!closeMatches(um)) { showError('umError', String(um.row.email || '').trim() ? 'Type the account email exactly to enable the close.' : 'Paste the account id exactly to enable the close.'); return; }
    runClose(btn, um);
  }]
];

function openUserManage(userId, email) {
  const row = (cache.users || []).find(u => u.userId === userId)
    || (cache.users || []).find(u => String(u.email || '').toLowerCase() === String(email || '').toLowerCase());
  if (!row) { showError('admUsersError', 'Roster is out of date for this account. Reload and try again.'); return; }
  const me = cachedPing()?.user || {};
  const self = (!!me.userId && me.userId === row.userId)
    || (!!me.email && String(me.email).toLowerCase() === String(row.email || '').toLowerCase());
  // um: the account in the window, whether a request is out, and the final bill a close answered (decision 19)
  const um = { row, self, working: false, closeBill: null };
  const m = openModal('admUserManage', userManageHtml(row, { self }), { onClick, onInput });
  Object.assign(um, {
    $: m.$, close: m.close,
    paint: () => { m.host.innerHTML = userManageHtml(um.row, { self }); if (um.closeBill) paintCloseBill(um); }
  });
  function onInput(e) {
    if (e.target?.id !== 'umCloseEmail' || self) return;
    const b = um.$('[data-um-close-account]');
    if (b && !b.hasAttribute('aria-busy')) b.disabled = um.working || !closeMatches(um);
  }
  function onClick(e) {
    if (e.target.closest('[data-um-close]')) { if (!um.working) um.close(); return; }
    for (const [sel, run] of USER_MANAGE_ACTIONS) {
      const btn = e.target.closest(sel);
      if (btn) { if (!btn.disabled) run(btn, um); return; }
    }
  }
}

async function renderUsers(main) {
  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Users</h2>
      <div class="adm-toolbar">
        <input class="adm-search" id="admUserSearch" type="search" placeholder="Search email…" aria-label="Search users by email">
        <select class="adm-select" id="admUserStatus" aria-label="Filter by status" title="FROZEN is a view: accounts whose phone changes are paused">
          <option value="">Open accounts</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CLOSED">Closed</option>
          <option value="FROZEN">Phone paused</option>
        </select>
        <select class="adm-select" id="admUserTier" aria-label="Filter by tier">
          <option value="">Any tier</option>
          <option value="free">Free</option>
          <option value="user">User</option>
          <option value="partner">Partner</option>
          <option value="super">Super</option>
        </select>
      </div>
    </header>
    <p class="adm-note adm-frozen-count" id="admFrozenCount" hidden></p>
    <p class="adm-error" id="admUsersError" hidden></p>
    <div id="admUsersBody"><p class="adm-note">Loading…</p></div>
  `;
  try {
    if (!cache.users) {
      const data = await apiFetch(`${USERS_URL}?limit=1000`);
      cache.users = data.users || [];
      if (Array.isArray(data.roles?.custom)) cache.customRoles = data.roles.custom;
    }
    renderUserRows();
  } catch (ex) {
    document.getElementById('admUsersBody').innerHTML = '';
    showError('admUsersError', friendlyError(ex, 'Could not load users.'));
  }
}

/* ---------- internal notifications: who hears about what, by role ---------- */

// The routing lives on the server (PlatformSettings, read live on every send).
// This desk edits it: for each platform event, the roles on the Users table,
// the operator flag, and named accounts that receive it, by email and by text.
// A notice is the same audience model turned into an outbound message.
let ntState = null;                    // { events, members, audiences, staffRoles, smsConfigured, routes, updatedAt }
let ntNotice = { roles: [], userIds: [] };

const NT_AUDIENCE_LABEL = { admin: 'Admin', developer: 'Developer', member: 'Member', viewer: 'Viewer' };
// Legacy audience names an older server may still report; the router folds
// them into Admin, so they are never offered as a second checkbox.
const NT_HIDDEN = new Set(['operators', 'owner']);
const NT_CUSTOMER = new Set(['member', 'viewer']);
function ntLabel(a) { return NT_AUDIENCE_LABEL[a] || (ntState?.customRoles || []).find(r => r.key === a)?.label || roleLabel(a); }
function ntIsCustom(a) { return (ntState?.customRoles || []).some(r => r.key === a); }
// Routing audiences: the team (Admin, Developer, the roles you add). Customer
// roles are never routed platform events, whatever an older server lists.
function ntAudiences() {
  return (ntState?.audiences || []).filter(a => !NT_HIDDEN.has(a) && !NT_CUSTOMER.has(a));
}
// Notice audiences: the team plus the customer roles (news-gated on the server).
function ntNoticeAudiences() {
  const list = Array.isArray(ntState?.noticeAudiences) ? ntState.noticeAudiences : [...ntAudiences(), 'member', 'viewer'];
  return list.filter(a => !NT_HIDDEN.has(a));
}

function ntMember(userId) {
  return (ntState?.members || []).find(m => m.userId === userId) || null;
}

function ntAudienceChecks(attrName, key, selected, list = ntAudiences()) {
  const on = new Set(selected.map(r => (NT_HIDDEN.has(r) ? 'admin' : r)));
  const title = (a) => a === 'admin' ? 'The admin role, and every account carrying the admin flag'
    : ntIsCustom(a) ? 'A team role you added. Assign it from Users, Manage account'
    : a === 'developer' ? 'The developer role on the Users table'
    : 'A customer role: receives a notice only with news turned on';
  return `<div class="nt-auds">${list.map(a => `
    <label class="um-check" title="${title(a)}">
      <input type="checkbox" ${attrName}="${escapeHtml(key)}|${escapeHtml(a)}" ${on.has(a) ? 'checked' : ''}> ${escapeHtml(ntLabel(a))}
    </label>`).join('')}</div>`;
}

function ntRowHtml(ev) {
  const r = ntState.routes[ev.key] || { roles: ['admin'], userIds: [], email: true, sms: false };
  const smsTitle = ntState.smsConfigured ? 'Also text the recipients whose mobile number is verified' : 'Text messages are not switched on for this platform';
  return `
    <tr data-nt-row="${escapeHtml(ev.key)}">
      <td>
        <strong>${escapeHtml(ev.label)}</strong>
        <div class="adm-muted nt-detail">${escapeHtml(ev.detail)}</div>
        <div class="adm-muted nt-group">${escapeHtml(ev.group)}${ev.configured ? '' : ' · default'}</div>
      </td>
      <td>${ntAudienceChecks('data-nt-role', ev.key, r.roles || [])}</td>
      <td>
        <label class="um-check"><input type="checkbox" data-nt-ch="${escapeHtml(ev.key)}|email" ${r.email !== false ? 'checked' : ''}> Email</label>
        <label class="um-check ${ntState.smsConfigured ? '' : 'is-locked'}" title="${smsTitle}">
          <input type="checkbox" data-nt-ch="${escapeHtml(ev.key)}|sms" ${r.sms ? 'checked' : ''} ${ntState.smsConfigured ? '' : 'disabled'}> Text</label>
      </td>
      <td class="cell-tight">
        <button class="btn btn-sm btn-ico" type="button" data-nt-test="${escapeHtml(ev.key)}" data-tip="Sends a test through the SAVED routing for this event" aria-label="Send a test through the saved routing">${ico('send')}</button>
      </td>
    </tr>`;
}

function ntRolesCardHtml() {
  if (!Array.isArray(ntState.customRoles)) return '';
  return `
    <div class="adm-card">
      <h3 class="adm-card-h">Team roles</h3>
      <p class="adm-note">Admin and Developer are built in. Add your own, such as Shipping, then give it to an account from
        Users, Manage account. Every role here is an audience in the routing below. A role is a notification audience and
        nothing more; access still comes from the admin flag.</p>
      <div class="nt-chips">
        <span class="adm-pill nt-role">Admin</span>
        <span class="adm-pill nt-role">Developer</span>
        ${ntState.customRoles.map(r => `<span class="adm-pill nt-role nt-chip">${escapeHtml(r.label)}<button type="button" data-nt-role-remove="${escapeHtml(r.key)}" title="Remove this role. Allowed once no account carries it. Click twice to confirm." aria-label="Remove ${escapeHtml(r.label)}">×</button></span>`).join('')}
      </div>
      <div class="adm-actions-row nt-role-add">
        <input class="adm-input nt-add" id="ntRoleLabel" type="text" maxlength="32" placeholder="New role, e.g. Shipping" autocomplete="off" aria-label="New team role">
        <button class="btn btn-sm btn-lead" type="button" data-adm-action="nt-role-add">${ico('plus')}<span>Add role</span></button>
        <span class="muted nt-result" id="ntRoleResult"></span>
      </div>
    </div>`;
}

function ntBodyHtml() {
  const saved = ntState.updatedAt ? `Last saved ${fmtDate(ntState.updatedAt)}` : 'Nothing saved yet: every event goes to Admin by email.';
  return `
    ${ntRolesCardHtml()}
    <div class="adm-card">
      <h3 class="adm-card-h">Who hears about what</h3>
      <p class="adm-note">Each row is one platform event. Pick the team roles that hear about it and choose email, text, or both.
        Admin covers the admin role and every account carrying the admin flag; the roles you add above appear here too.
        Customers are never routed team events. Texts reach only accounts with a verified mobile number. An event with
        nothing chosen falls back to Admin by email, so nothing is ever unrouted. The Test button uses what is saved, not
        what is on screen.</p>
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap nt-table">
          <thead><tr><th>Event</th><th>Roles</th><th>Channels</th><th></th></tr></thead>
          <tbody>${ntState.events.map(ntRowHtml).join('')}</tbody>
        </table>
      </div>
      <div class="adm-actions-row">
        <button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="nt-save" data-tip="Saves every row above in one change">${ico('check')}<span>Save routing</span></button>
        <span class="muted nt-result" id="ntSaved">${escapeHtml(saved)}</span>
      </div>
      <p class="muted nt-result" id="ntTestResult" hidden></p>
    </div>
    <div class="adm-card">
      <h3 class="adm-card-h">Send a notice</h3>
      <p class="adm-note">A message from you to an audience, by role. Separate from the routing above. Team roles (Admin,
        Developer, and the roles you add) receive it as written. Customer roles (Member, Viewer) receive it only if their
        account has news turned on.</p>
      ${ntAudienceChecks('data-nt-notice-role', 'notice', ntNotice.roles, ntNoticeAudiences())}
      <input class="adm-input" id="ntSubject" type="text" maxlength="120" placeholder="Subject" autocomplete="off">
      <textarea class="adm-input nt-message" id="ntMessage" rows="5" maxlength="4000" placeholder="The message. Plain text; paragraphs are kept."></textarea>
      <label class="um-check ${ntState.smsConfigured ? '' : 'is-locked'}" title="${ntState.smsConfigured ? 'Also text the recipients whose mobile number is verified' : 'Text messages are not switched on for this platform'}">
        <input type="checkbox" id="ntSms" ${ntState.smsConfigured ? '' : 'disabled'}> Also send as a text
      </label>
      <div class="adm-actions-row">
        <button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="nt-send" data-tip="Click twice: the second click sends">${ico('send')}<span>Send notice</span></button>
        <span class="muted nt-result" id="ntSendResult"></span>
      </div>
    </div>
  `;
}

function paintNotify() {
  const body = document.getElementById('ntBody');
  if (!body || !ntState) return;
  // A repaint (a role added, the routing saved) must not eat a notice being typed.
  const keep = {
    s: document.getElementById('ntSubject')?.value || '',
    m: document.getElementById('ntMessage')?.value || '',
    sms: document.getElementById('ntSms')?.checked === true
  };
  body.innerHTML = ntBodyHtml();
  const s = document.getElementById('ntSubject'); if (s && keep.s) s.value = keep.s;
  const m = document.getElementById('ntMessage'); if (m && keep.m) m.value = keep.m;
  const c = document.getElementById('ntSms'); if (c && !c.disabled) c.checked = keep.sms;
}

async function refreshNotify() {
  const data = await apiFetch(ADMIN_NOTIFY_URL);
  ntState = { ...data, routes: Object.fromEntries((data.events || []).map(e => [e.key, { ...e.route }])) };
  if (Array.isArray(data.customRoles)) cache.customRoles = data.customRoles;
  ntNotice.roles = ntNotice.roles.filter(r => ntNoticeAudiences().includes(r));
  paintNotify();
}

// The roles routes answer with the role list; the desk takes the new list and
// repaints without touching unsaved routing edits.
function ntApplyRoles(res) {
  const custom = Array.isArray(res?.custom) ? res.custom : [];
  cache.customRoles = custom;
  const keys = custom.map(r => r.key);
  ntState.customRoles = custom;
  ntState.audiences = ['admin', 'developer', ...keys];
  ntState.noticeAudiences = ['admin', 'developer', ...keys, 'member', 'viewer'];
  for (const k of Object.keys(ntState.routes)) {
    ntState.routes[k].roles = (ntState.routes[k].roles || []).filter(r => ntState.audiences.includes(r) || NT_HIDDEN.has(r));
  }
  ntNotice.roles = ntNotice.roles.filter(r => ntState.noticeAudiences.includes(r));
  paintNotify();
}

async function ntRoleAdd(btn) {
  const label = (document.getElementById('ntRoleLabel')?.value || '').trim();
  showError('ntError', '');
  if (label.length < 2) { showError('ntError', 'Name the role first: at least 2 characters.'); return; }
  const orig = btnLabel(btn);
  btn.disabled = true; btnLabel(btn, 'Adding…');
  try {
    const res = await apiFetch(ADMIN_ROLES_URL, { method: 'POST', body: JSON.stringify({ label }) });
    ntApplyRoles(res);
    const out = document.getElementById('ntRoleResult');
    if (out) out.textContent = `Added ${label}. Give it to an account from Users.`;
  } catch (ex) {
    showError('ntError', friendlyError(ex, 'Could not add the role.'));
  } finally {
    btn.disabled = false; btnLabel(btn, orig);
  }
}

function ntRoleRemove(btn) {
  const key = btn.dataset.ntRoleRemove;
  const label = ntLabel(key);
  armConfirm(btn, 'remove?', async () => {
    showError('ntError', '');
    const done = busy(btn, 'Removing…');
    try {
      const res = await apiFetch(ADMIN_ROLES_REMOVE_URL, { method: 'POST', body: JSON.stringify({ key }) });
      ntApplyRoles(res);
      const out = document.getElementById('ntRoleResult');
      if (out) out.textContent = `Removed ${label}.`;
    } catch (ex) {
      showError('ntError', friendlyError(ex, 'Could not remove the role.'));
    } finally { done(); }
  });
}

async function renderNotify(main) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Notifications</h2></header>
    <p class="adm-error" id="ntError" hidden></p>
    <div id="ntBody"><p class="adm-note">Loading…</p></div>
    <div id="agNoticeHost"></div>
  `;
  // decision 37(4): a material agreement change emailed to every owner, whatever their news setting (agreementNotice.js)
  renderAgreementNotice(document.getElementById('agNoticeHost'), { apiFetch, escapeHtml, friendlyError }).catch(() => {});
  try {
    await refreshNotify();
  } catch (ex) {
    document.getElementById('ntBody').innerHTML = `<p class="adm-empty">${ex?.status === 404
      ? 'The notification routes are not on this lane yet. Deploy the backend that carries them, then reload.'
      : escapeHtml(friendlyError(ex, 'Could not load notification routing.'))}</p>`;
  }
}

// Screen -> state, for one event's checkbox or the notice's.
function ntToggle(el) {
  const [key, val] = String(el.dataset.ntRole || el.dataset.ntCh || el.dataset.ntNoticeRole || '').split('|');
  if (!key || !val) return;
  if (el.dataset.ntNoticeRole !== undefined) {
    ntNotice.roles = el.checked ? [...new Set([...ntNotice.roles, val])] : ntNotice.roles.filter(r => r !== val);
    return;
  }
  const r = ntState.routes[key] || (ntState.routes[key] = { roles: [], userIds: [], email: true, sms: false });
  if (el.dataset.ntRole !== undefined) {
    r.roles = el.checked ? [...new Set([...(r.roles || []), val])] : (r.roles || []).filter(x => x !== val);
  } else {
    r[val] = el.checked;
  }
}

async function ntSave(btn) {
  showError('ntError', '');
  const orig = btnLabel(btn);
  btn.disabled = true; btnLabel(btn, 'Saving…');
  try {
    const data = await apiFetch(ADMIN_NOTIFY_URL, { method: 'POST', body: JSON.stringify({ routes: ntState.routes }) });
    ntState = { ...data, routes: Object.fromEntries((data.events || []).map(e => [e.key, { ...e.route }])) };
    if (Array.isArray(data.customRoles)) cache.customRoles = data.customRoles;
    paintNotify();
    const saved = document.getElementById('ntSaved');
    if (saved) saved.textContent = `Saved ${fmtDate(new Date().toISOString())}. Every send from now on uses this routing.`;
  } catch (ex) {
    showError('ntError', friendlyError(ex, 'Could not save the routing.'));
  } finally {
    btn.disabled = false; btnLabel(btn, orig);
  }
}

async function ntTest(btn) {
  const event = btn.dataset.ntTest;
  const out = document.getElementById('ntTestResult');
  const orig = btnLabel(btn);
  btn.disabled = true; btnLabel(btn, 'Sending…');
  try {
    const res = await apiFetch(ADMIN_NOTIFY_TEST_URL, { method: 'POST', body: JSON.stringify({ event }) });
    const label = ntState.events.find(e => e.key === event)?.label || event;
    if (out) {
      out.hidden = false;
      out.textContent = res.sent
        ? `Test for "${label}" sent: ${res.mailed || 0} email${res.mailed === 1 ? '' : 's'}, ${res.texted || 0} text${res.texted === 1 ? '' : 's'}.`
        : `Test for "${label}" was not sent (${res.reason || 'no recipient'}). Check the saved routing and that the accounts are active.`;
    }
  } catch (ex) {
    if (out) { out.hidden = false; out.textContent = friendlyError(ex, 'The test could not be sent.'); }
  } finally {
    btn.disabled = false; btnLabel(btn, orig);
  }
}

async function ntSend(btn) {
  const subject = (document.getElementById('ntSubject')?.value || '').trim();
  const message = (document.getElementById('ntMessage')?.value || '').trim();
  const sms = document.getElementById('ntSms')?.checked === true;
  const out = document.getElementById('ntSendResult');
  showError('ntError', '');
  if (!ntNotice.roles.length) { showError('ntError', 'Pick at least one role for the notice.'); return; }
  if (subject.length < 3) { showError('ntError', 'Give the notice a subject (at least 3 characters).'); return; }
  if (message.length < 10) { showError('ntError', 'Write the message first (at least 10 characters).'); return; }
  const send = async () => {
    const orig = btnLabel(btn);
    btn.disabled = true; btnLabel(btn, 'Sending…');
    try {
      const res = await apiFetch(ADMIN_NOTIFY_SEND_URL, { method: 'POST', body: JSON.stringify({ roles: ntNotice.roles, userIds: ntNotice.userIds, subject, message, sms }) });
      if (out) out.textContent = res.sent
        ? `Sent to ${res.recipients || 0} account${res.recipients === 1 ? '' : 's'}: ${res.mailed || 0} email${res.mailed === 1 ? '' : 's'}, ${res.texted || 0} text${res.texted === 1 ? '' : 's'}${res.skipped ? `; ${res.skipped} customer${res.skipped === 1 ? '' : 's'} skipped (news off)` : ''}.`
        : `Nobody to send to${res.skipped ? `: ${res.skipped} matched but have news turned off` : ''}.`;
      const s = document.getElementById('ntSubject'); if (s && res.sent) s.value = '';
      const m = document.getElementById('ntMessage'); if (m && res.sent) m.value = '';
    } catch (ex) {
      showError('ntError', friendlyError(ex, 'The notice could not be sent.'));
    } finally {
      btn.disabled = false; btnLabel(btn, orig);
    }
  };
  const who = ntNotice.roles.map(ntLabel).join(', ');
  armConfirm(btn, `Confirm: send to ${who}`, send);
}

/* ---------- internal reports: anomaly reports from customers ---------- */

let rpStatus = 'OPEN';

function rpStatusPill(status) {
  const open = String(status).toUpperCase() === 'OPEN';
  return `<span class="acct-tag ${open ? 'is-pending' : 'is-verified'}">${open ? 'open' : 'closed'}</span>`;
}

function rpDiagHtml(c) {
  if (!c || typeof c !== 'object') return '';
  const rows = [
    ['Page', c.route || c.url || ''], ['Theme', c.theme || ''], ['Viewport', c.viewport || ''],
    ['Browser', c.ua || ''], ['Lane', [c.lane ? `${c.lane} site` : '', c.apiLane ? `${c.apiLane} api` : ''].filter(Boolean).join(' · ')], ['Locale', [c.lang, c.tz].filter(Boolean).join(' · ')], ['Reported at', c.at ? fmtDate(c.at) : '']
  ].filter(([, v]) => v);
  const errs = Array.isArray(c.errors) ? c.errors : [];
  return `
    <table class="rp-diag">${rows.map(([k, v]) => `<tr><td class="adm-muted">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
    ${errs.length ? `<div class="adm-muted" style="margin-top:6px">Recent console errors</div><pre class="adm-pre">${escapeHtml(errs.join('\n'))}</pre>` : '<div class="adm-muted" style="margin-top:6px">No console errors were captured on that page.</div>'}
  `;
}

function rpCardHtml(r) {
  const open = String(r.status).toUpperCase() === 'OPEN';
  return `
    <div class="adm-card rp-card" data-rp-id="${escapeHtml(r.id)}">
      <div class="rp-head">
        <code>${escapeHtml(r.ref)}</code>
        ${rpStatusPill(r.status)}
        <span class="adm-pill is-claimed">${escapeHtml(r.categoryLabel || r.category)}</span>
        ${r.apiLane || r.context?.lane ? `<span class="adm-pill" title="The site's lane and the API's lane the ${rpKind === 'support' ? 'request' : 'report'} was filed on">${escapeHtml([r.context?.lane ? `${r.context.lane} site` : '', r.apiLane ? `${r.apiLane} api` : ''].filter(Boolean).join(' · '))}</span>` : ''}
        <span class="adm-muted">${escapeHtml(fmtDate(r.createdAt))}</span>
        <span class="adm-muted cell-ellip" title="${escapeHtml(r.email || '')}">from ${escapeHtml(r.email || r.userId || 'unknown')}</span>
      </div>
      <p class="rp-summary">${escapeHtml(r.summary)}</p>
      ${r.details ? `<pre class="adm-pre rp-details-text">${escapeHtml(r.details)}</pre>` : '<p class="adm-muted">No further details were given.</p>'}
      <details class="rp-details"><summary>Page details</summary>${rpDiagHtml({ ...(r.context || {}), apiLane: r.apiLane })}</details>
      ${open ? `
        <div class="rp-note">
          <textarea class="adm-input" id="rpNote-${escapeHtml(r.id)}" rows="2" maxlength="2000" placeholder="Note to the reporter (optional). Sent by email when you close."></textarea>
          <div class="adm-actions-row">
            <button class="btn btn-sm btn-lead btn-primary" type="button" data-rp-close-report="${escapeHtml(r.id)}" data-tip="Marks the report closed. If the note has text, the reporter receives it by email. Click twice to confirm.">${ico('checkCircle')}<span>Close report</span></button>
          </div>
        </div>` : `
        ${r.note ? `<div class="rp-note"><div class="adm-muted">Note to the reporter</div><pre class="adm-pre">${escapeHtml(r.note)}</pre></div>` : ''}
        <div class="adm-muted" style="margin-top:8px">Closed ${escapeHtml(fmtDate(r.closedAt))}${r.closedBy ? ` by ${escapeHtml(r.closedBy)}` : ''}</div>
        <div class="adm-actions-row"><button class="btn btn-sm btn-lead" type="button" data-rp-reopen="${escapeHtml(r.id)}">${ico('undo')}<span>Reopen</span></button></div>`}
    </div>`;
}

/** Which desk is on screen: the anomaly reports or the support requests (2026-09-22). */
let rpKind = 'anomaly';
async function renderReports(main) { rpKind = 'anomaly'; return renderDesk(main); }
async function renderSupport(main) { rpKind = 'support'; return renderDesk(main); }
async function renderDesk(main) {
  const support = rpKind === 'support';
  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">${support ? 'Support' : 'Anomalies'}</h2>
      <div class="adm-toolbar" role="tablist" aria-label="${support ? 'Request' : 'Report'} status">
        ${['OPEN', 'CLOSED', 'ALL'].map(s => `<button class="adm-tab ${s === rpStatus ? 'is-active' : ''}" type="button" role="tab" data-adm-reports="${s}" aria-selected="${s === rpStatus}">${s === 'ALL' ? 'All' : s === 'OPEN' ? 'Open' : 'Closed'}</button>`).join('')}
      </div>
    </header>
    <p class="adm-note">${support
      ? 'Support requests customers send from their account: questions and things they need done. Each says which lane it came from. Close with a note and the answer goes to them by email with their reference.'
      : 'Anomaly reports customers file from their account. Each carries the page details they agreed to send and the lane it came from. Close with a note and the reporter gets the note by email with their reference.'}</p>
    <p class="adm-error" id="rpError" hidden></p>
    <div id="rpBody"><p class="adm-note">Loading…</p></div>
  `;
  await loadReports();
}

async function loadReports() {
  const body = document.getElementById('rpBody');
  if (!body) return;
  showError('rpError', '');
  try {
    const word = rpKind === 'support' ? 'requests' : 'reports';
    const data = await apiFetch(`${rpKind === 'support' ? ADMIN_SUPPORT_URL : ADMIN_ANOMALIES_URL}?status=${encodeURIComponent(rpStatus)}&limit=200`);
    const reports = Array.isArray(data.reports) ? data.reports : [];
    body.innerHTML = reports.length
      ? reports.map(rpCardHtml).join('') + (data.truncated ? '<p class="adm-note">Showing the newest 200.</p>' : '')
      : `<p class="adm-empty">${rpStatus === 'OPEN' ? `No open ${word}.` : `No ${word} in this view.`}</p>`;
  } catch (ex) {
    body.innerHTML = `<p class="adm-empty">${ex?.status === 404
      ? `The ${rpKind === 'support' ? 'support' : 'reports'} desk is not on this lane yet. Deploy the backend that carries it, then reload.`
      : escapeHtml(friendlyError(ex, `Could not load ${word}.`))}</p>`;
  }
}

async function rpPatch(btn, id, patch) {
  const orig = btnLabel(btn);
  btn.disabled = true; btnLabel(btn, 'Working…');
  try {
    await apiFetch(ADMIN_ANOMALY_PATCH_URL, { method: 'POST', body: JSON.stringify({ id, kind: rpKind, ...patch }) });
    await loadReports();
  } catch (ex) {
    showError('rpError', friendlyError(ex, 'Could not update the report.'));
    btn.disabled = false; btnLabel(btn, orig);
  }
}

function rpCloseReport(btn) {
  const id = btn.dataset.rpCloseReport;
  const note = (document.getElementById(`rpNote-${id}`)?.value || '').trim();
  armConfirm(btn, note ? 'Confirm: close and email the note' : 'Confirm: close without a note', () => rpPatch(btn, id, { status: 'CLOSED', note }));
}

/* ---------- internal orders: the fulfillment desk ---------- */

function admOrderRowHtml(o) {
  const paid = String(o.status).toUpperCase() === 'PAID';
  const physical = !!(o.shipCarrier || o.shippingCents || o.shipRateCents);
  const dash = '<span class="adm-muted">—</span>';
  // a cell: the amount, or the dash when the order has none (not the shared money/cents formatters, which it must not shadow)
  const amt = (c) => (c == null ? dash : escapeHtml(usdCents(c)));
  const net = odNet(o);
  const taxBad = o.taxStatus === 'uncalculated';
  const taxTitle = taxBad ? 'Sales tax was NOT calculated on this order. Remit it by hand.' : (o.taxSummary ? `Stripe Tax: ${o.taxSummary}` : (o.taxCents ? 'Sales tax' : 'No taxable goods'));
  const shipTitle = o.shipRateCents ? `Rate ${usdCents(o.shipRateCents)}${o.shippingCents ? '' : ', shipped free'}` : '';
  const labelTitle = o.labelCostCents != null ? `Label cost ${usdCents(o.labelCostCents)}${o.shippingCents ? `, customer paid ${usdCents(o.shippingCents)}` : ', customer paid nothing'}` : (o.labelUrl ? 'Label bought; cost not recorded yet' : 'No label yet');
  const netTitle = net == null ? 'Net is known once Stripe reports its fee'
    : `Net: total ${usdCents(o.totalCents)}${o.refundedCents ? ` less refunds ${usdCents(o.refundedCents)}` : ''}${odTaxKept(o) ? ` less tax owed ${usdCents(odTaxKept(o))}` : ''} less Stripe fee ${usdCents(o.stripeFeeCents)}${o.labelCostCents != null ? ` less label ${usdCents(o.labelCostCents)}` : ''}${o.cogsCents != null ? ` less unit cost ${usdCents(o.cogsCents)}` : ''}`;
  return `
    <tr>
      <td class="adm-muted cell-tight" title="${escapeHtml(fmtDate(o.createdAt))}">${escapeHtml(fmtDay(o.createdAt))}</td>
      <td class="adm-cell-email cell-ellip od-ellip" title="${escapeHtml(o.email || '')}">${escapeHtml(o.email || '')}</td>
      <td class="cell-ellip od-ellip" title="${escapeHtml(orderLinesLabel(o.lines))}">${escapeHtml(orderLinesLabel(o.lines))}</td>
      <td class="adm-num cell-tight">${amt(o.goodsCents)}</td>
      <td class="adm-num cell-tight" title="${escapeHtml(shipTitle)}">${o.shippingCents ? amt(o.shippingCents) : (physical ? '<span class="adm-muted">Free</span>' : dash)}</td>
      <td class="adm-num cell-tight ${taxBad ? 'od-bad' : ''}" title="${escapeHtml(taxTitle)}">${taxBad ? 'none' : (o.taxCents ? amt(o.taxCents) : dash)}</td>
      <td class="adm-num cell-tight">${amt(o.totalCents)}${o.refundedCents ? `<div class="adm-muted adm-money-neg">-${escapeHtml(usdCents(o.refundedCents))}</div>` : ''}</td>
      <td class="adm-num cell-tight adm-muted od-cost" title="Stripe processing fee">${o.stripeFeeCents == null ? dash : '-' + escapeHtml(usdCents(o.stripeFeeCents))}</td>
      <td class="adm-num cell-tight adm-muted od-cost" title="${escapeHtml(labelTitle)}">${o.labelCostCents == null ? (o.labelUrl ? '?' : dash) : '-' + escapeHtml(usdCents(o.labelCostCents))}</td>
      <td class="adm-num cell-tight" title="${escapeHtml(netTitle)}">${net == null ? dash : escapeHtml(usdCents(net))}</td>
      <td class="cell-tight">${orderStatusPill(o.status)}${o.labelError ? `<div class="adm-muted" title="${escapeHtml(o.labelError)}">label error</div>` : ''}</td>
      <td class="cell-tight" title="${escapeHtml(o.trackingNumber || '')}">${o.trackingNumber
        ? (safeUrl(o.trackingUrl)
            ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(o.trackingUrl))}" target="_blank" rel="noopener">…${escapeHtml(String(o.trackingNumber).slice(-8))}</a>`
            : `<code>…${escapeHtml(String(o.trackingNumber).slice(-8))}</code>`)
        : '<span class="adm-muted">—</span>'}</td>
      <td class="cell-tight">
        <div class="adm-order-actions">
          ${safeUrl(o.labelUrl)
            ? `<a class="btn btn-sm btn-lead" href="${escapeHtml(safeUrl(o.labelUrl))}" target="_blank" rel="noopener" title="Opens the 4x6 label PDF for printing"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>Print</a>`
            : (paid && physical
                ? `<button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="order-label" data-order="${escapeHtml(o.orderId)}" title="Buys the shipping label from Shippo with the rate the customer paid for"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>Buy label</button>`
                : '')}
          ${orderRefundable(o)
            ? `<button class="btn btn-sm btn-lead is-danger" type="button" data-adm-action="order-refund"
                 data-order="${escapeHtml(o.orderId)}" data-total="${Number(o.totalCents) || 0}"
                 data-refunded="${Number(o.refundedCents) || 0}" data-goods="${Number(o.goodsCents) || 0}"
                 title="Refund this order through Stripe (a hardware return)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>Refund</button>`
            : ''}
          ${(!safeUrl(o.labelUrl) && !(paid && physical) && !orderRefundable(o)) ? '<span class="adm-muted">—</span>' : ''}
        </div>
      </td>
    </tr>
  `;
}

/* An order can be refunded when it carries a captured payment (paid or later)
 * and is not already fully refunded. The backend re-checks and refuses an order
 * with no PaymentIntent, so this is only about what to show. */
function orderRefundable(o) {
  const total = Number(o.totalCents) || 0;
  const refunded = Number(o.refundedCents) || 0;
  const s = String(o.status || '').toUpperCase();
  const paidLike = ['PAID', 'LABEL_PURCHASED', 'SHIPPED', 'DELIVERED', 'PARTIALLY_REFUNDED', 'RETURNED'].includes(s);
  return paidLike && total > refunded;
}

// The desk's selection: a status tab plus an optional date range (created
// date, whole days). The server returns the rows in range and the totals over
// the WHOLE selection; the export writes the rows on screen with every column.
const odRange = { from: '', to: '' };
let odLast = { orders: [], summary: null };
const OD_PAID_LIKE = new Set(['PAID', 'LABEL_PURCHASED', 'SHIPPED', 'DELIVERED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'RETURNED']);

async function renderAdminOrders(main) {
  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Orders</h2>
      <div class="adm-tabs" role="tablist">
        <button class="adm-tab is-active" type="button" role="tab" aria-selected="true" data-adm-orders="">All</button>
        <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-orders="PAID">Paid</button>
        <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-orders="LABEL_PURCHASED">Labeled</button>
        <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-orders="SHIPPED">Shipped</button>
      </div>
      <div class="adm-toolbar od-range">
        <label class="od-range-lbl">From <input class="adm-input od-date" id="odFrom" type="date" value="${escapeHtml(odRange.from)}" aria-label="Orders from date"></label>
        <label class="od-range-lbl">To <input class="adm-input od-date" id="odTo" type="date" value="${escapeHtml(odRange.to)}" aria-label="Orders to date"></label>
        <button class="btn btn-sm btn-ico" type="button" data-adm-action="orders-clear-range" data-tip="Drop the date range" aria-label="All time: drop the date range">${ico('calendarX')}</button>
        <button class="btn btn-sm btn-ico" type="button" data-adm-action="orders-export" data-tip="Every row below with every money column, as a spreadsheet file" aria-label="Export CSV: every row below with every money column">${ico('download')}</button>
      </div>
    </header>
    <p class="adm-error" id="admOrdersError" hidden></p>
    <div id="admOrdersSummary"></div>
    <div id="admOrdersBody"><p class="adm-note">Loading…</p></div>
    <div id="admLabelsBody"></div>
  `;
  loadAdminOrders('');
  loadLabelsAndQueue();
}

function odActiveStatus() {
  return document.querySelector('[data-adm-orders].is-active')?.dataset.admOrders || '';
}

// Totals when the server did not send them (an older lane): same arithmetic.
// Tax that is still a liability after refunds: a refund reverses the tax on
// it in Stripe, proportionally on a partial refund.
function odTaxKept(o) {
  const tax = Number(o.taxCents || 0), total = Number(o.totalCents || 0), ref = Number(o.refundedCents || 0);
  if (!tax || !total) return 0;
  return Math.max(0, Math.round(tax * Math.max(0, 1 - ref / total)));
}
function odNet(o) {
  if (o.stripeFeeCents == null) return null;
  return Number(o.totalCents || 0) - Number(o.refundedCents || 0) - odTaxKept(o) - Number(o.stripeFeeCents || 0) - Number(o.labelCostCents || 0) - Number(o.cogsCents || 0);
}
function odSummarize(orders) {
  const s = { count: 0, paidCount: 0, goodsCents: 0, taxableCents: 0, shippingCents: 0, taxCents: 0, taxReversedCents: 0, totalCents: 0, refundedCents: 0, stripeFeeCents: 0, labelCostCents: 0, cogsCents: 0, netCents: 0, taxUncalculated: 0, feeUnknown: 0, labelCostUnknown: 0, cogsUnknown: 0 };
  for (const o of orders) {
    s.count++;
    if (!OD_PAID_LIKE.has(String(o.status || '').toUpperCase())) continue;
    s.paidCount++;
    s.goodsCents += Number(o.goodsCents || 0); s.taxableCents += Number(o.taxableCents || 0);
    s.shippingCents += Number(o.shippingCents || 0); s.taxCents += Number(o.taxCents || 0);
    s.totalCents += Number(o.totalCents || 0); s.refundedCents += Number(o.refundedCents || 0);
    s.taxReversedCents += Number(o.taxCents || 0) - odTaxKept(o);
    if (o.taxStatus === 'uncalculated') s.taxUncalculated++;
    if (o.stripeFeeCents == null) s.feeUnknown++; else s.stripeFeeCents += Number(o.stripeFeeCents);
    if (o.labelUrl) { if (o.labelCostCents == null) s.labelCostUnknown++; else s.labelCostCents += Number(o.labelCostCents); }
    if (o.cogsCents == null) { if (Number(o.goodsCents || 0) > 0) s.cogsUnknown++; } else s.cogsCents += Number(o.cogsCents);
  }
  s.netCents = s.totalCents - s.refundedCents - (s.taxCents - s.taxReversedCents) - s.stripeFeeCents - s.labelCostCents - s.cogsCents;
  return s;
}

function admOrdersSummaryHtml(s) {
  if (!s) return '';
  const cell = (label, val, cls = '', title = '') => `<div class="od-sum ${cls}" ${title ? `title="${escapeHtml(title)}"` : ''}><span class="od-sum-l">${label}</span><span class="od-sum-v adm-num">${escapeHtml(val)}</span></div>`;
  const neg = (c) => (Number(c) ? '-' + usdCents(c) : usdCents(0));
  const warn = [];
  if (s.taxUncalculated) warn.push(`${s.taxUncalculated} order${s.taxUncalculated === 1 ? '' : 's'} without a tax calculation (remit by hand)`);
  if (s.feeUnknown) warn.push(`${s.feeUnknown} still waiting on the Stripe fee`);
  if (s.labelCostUnknown) warn.push(`${s.labelCostUnknown} label${s.labelCostUnknown === 1 ? '' : 's'} without a recorded cost`);
  if (s.cogsUnknown) warn.push(`${s.cogsUnknown} without a unit cost (set po_cost_cents on the Stripe product and sync)`);
  return `
    <div class="od-summary">
      ${cell('Paid orders', `${s.paidCount} of ${s.count}`)}
      ${cell('Goods', usdCents(s.goodsCents), '', 'Merchandise charged, before shipping and tax')}
      ${cell('Taxable goods', usdCents(s.taxableCents), '', 'Physical merchandise: the figure sales tax is owed on')}
      ${cell('Shipping charged', usdCents(s.shippingCents))}
      ${cell('Sales tax collected', usdCents(s.taxCents), 'is-tax', 'What Stripe Tax computed and the customer paid; a liability, not revenue')}
      ${cell('Charged', usdCents(s.totalCents), '', 'Goods plus shipping plus tax')}
      ${cell('Refunded', neg(s.refundedCents))}
      ${s.taxReversedCents ? cell('Tax reversed', neg(s.taxReversedCents), '', 'Tax on refunded orders, reversed in Stripe; no longer owed') : ''}
      ${cell('Stripe fees', neg(s.stripeFeeCents))}
      ${cell('Labels', neg(s.labelCostCents), '', 'What the bought labels cost at Shippo')}
      ${cell('Unit cost', neg(s.cogsCents), '', 'po_cost_cents per unit sold, from the Stripe product')}
      ${cell('Net', usdCents(s.netCents), 'is-net', 'Charged, less refunds, the tax still owed, Stripe fees, labels and unit cost')}
    </div>
    ${warn.length ? `<p class="adm-note od-warn">${escapeHtml(warn.join('. '))}.</p>` : ''}
    <p class="adm-note od-note">Totals cover every paid order in the selection, whatever happened after. Taxable goods is the figure to report; the tax on a refund is reversed in Stripe.</p>`;
}

async function loadAdminOrders(status) {
  const host = document.getElementById('admOrdersBody');
  const sum = document.getElementById('admOrdersSummary');
  if (!host) return;
  showError('admOrdersError', '');
  host.innerHTML = `<p class="adm-note">Loading…</p>`;
  try {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (odRange.from) p.set('from', odRange.from);
    if (odRange.to) p.set('to', odRange.to);
    p.set('limit', '1000');
    const data = await apiFetch(`${ADMIN_ORDERS_URL}?${p.toString()}`);
    const orders = data.orders || [];
    odLast = { orders, summary: data.summary || odSummarize(orders) };
    if (sum) sum.innerHTML = orders.length ? admOrdersSummaryHtml(odLast.summary) : '';
    if (!orders.length) { host.innerHTML = `<p class="adm-empty">No orders in this view.</p>`; return; }
    host.innerHTML = `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--orders">
          <thead><tr>
            <th>Date</th><th>Customer</th><th>Items</th>
            <th class="adm-num">Goods</th><th class="adm-num">Ship</th><th class="adm-num">Tax</th><th class="adm-num">Total</th>
            <th class="adm-num od-cost">Fee</th><th class="adm-num od-cost">Label</th><th class="adm-num">Net</th>
            <th>Status</th><th>Tracking</th><th></th>
          </tr></thead>
          <tbody>${orders.map(admOrderRowHtml).join('')}</tbody>
        </table>
      </div>
      ${data.truncated ? '<p class="adm-note">The oldest orders were left out of this view. Narrow the date range to see them.</p>' : ''}
    `;
  } catch (ex) {
    host.innerHTML = '';
    if (sum) sum.innerHTML = '';
    showError('admOrdersError', friendlyError(ex, 'Could not load orders.'));
  }
}

// Every row on screen, every money column, as a file for the books.
function exportOrdersCsv() {
  const rows = odLast.orders || [];
  if (!rows.length) { showError('admOrdersError', 'Nothing to export in this view.'); return; }
  const c = (v) => (v == null ? '' : (Number(v) / 100).toFixed(2));
  const cols = [
    ['Order', o => o.orderId], ['Created', o => o.createdAt], ['Paid at', o => o.paidAt], ['Status', o => o.status],
    ['Customer', o => o.email], ['Items', o => orderLinesLabel(o.lines)],
    ['Goods', o => c(o.goodsCents)], ['Taxable goods', o => c(o.taxableCents)], ['Shipping charged', o => c(o.shippingCents)],
    ['Sales tax', o => c(o.taxCents)], ['Tax status', o => o.taxStatus], ['Tax jurisdiction', o => o.taxSummary],
    ['Total charged', o => c(o.totalCents)], ['Refunded', o => c(o.refundedCents)],
    ['Stripe fee', o => c(o.stripeFeeCents)], ['Stripe net', o => c(o.stripeNetCents)],
    ['Label cost', o => c(o.labelCostCents)], ['Shipping rate cost', o => c(o.shipRateCents)], ['Unit cost', o => c(o.cogsCents)],
    ['Tax kept', o => c(odTaxKept(o))],
    ['Net', o => (odNet(o) == null ? '' : c(odNet(o)))],
    ['Carrier', o => o.shipCarrier], ['Service', o => o.shipService], ['Tracking', o => o.trackingNumber],
    ['Ship to state', o => o.shipTo?.state], ['Ship to zip', o => o.shipTo?.zip],
    ['Tax calculation', o => o.taxCalculationId], ['Tax transaction', o => o.taxTransactionId], ['Tax reversals', o => o.taxReversalIds],
    ['Refund reason', o => o.lastRefundReason]
  ];
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map(x => x[0]).join(',')]
    .concat(rows.map(o => cols.map(x => q(x[1](o))).join(',')))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const tag = (odRange.from || odRange.to) ? `${odRange.from || 'start'}_to_${odRange.to || 'today'}` : 'all';
  a.download = `pragoptics-orders-${tag}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function buyOrderLabel(btn) {
  const orderId = btn.dataset.order;
  if (!orderId) return;
  armConfirm(btn, 'Confirm: buy label', async () => {
    // the icon and the words come back as they were on a refusal (busy() keeps the button's own markup)
    const done = busy(btn, 'Buying…');
    showError('admOrdersError', '');
    try {
      const res = await apiFetch(ADMIN_ORDER_LABEL_URL, { method: 'POST', body: JSON.stringify({ orderId }) });
      const lu = safeUrl(res.labelUrl); if (lu) window.open(lu, '_blank', 'noopener');
      const active = document.querySelector('[data-adm-orders].is-active')?.dataset.admOrders || '';
      await loadAdminOrders(active);
    } catch (ex) {
      showError('admOrdersError', friendlyError(ex, 'Label purchase failed.'));
    } finally { done(); }
  });
}

/* ---------- refund an order (a hardware return), from the desk ---------- */
function openOrderRefund(btn) {
  const orderId = btn.dataset.order;
  if (!orderId) return;
  const totalC = Number(btn.dataset.total) || 0;
  const refundedC = Number(btn.dataset.refunded) || 0;
  const goodsC = Number(btn.dataset.goods) || 0;
  const remainingC = Math.max(0, totalC - refundedC);
  if (remainingC <= 0) return;
  // Default to the goods subtotal (the purchase price; return shipping is the
  // buyer's per the policy), capped at what is still refundable.
  const defaultC = Math.min(goodsC > 0 ? goodsC : remainingC, remainingC);

  let hostEl = document.getElementById('admOrderRefund');
  if (!hostEl) { hostEl = document.createElement('div'); hostEl.id = 'admOrderRefund'; hostEl.className = 'acct-modal-host'; document.body.appendChild(hostEl); }
  hostEl.hidden = false;
  hostEl.innerHTML = `
    <div class="acct-modal-mask" data-or-close></div>
    <div class="acct-modal" role="dialog" aria-modal="true" aria-label="Refund order">
      <div class="acct-modal-h">Refund order</div>
      <p class="acct-modal-note">
        Total ${usdCents(totalC)}${refundedC ? `, already refunded ${usdCents(refundedC)}` : ''}. You can refund up to ${usdCents(remainingC)}.
        Return shipping is the buyer's; the goods subtotal is ${usdCents(goodsC)}.
      </p>
      <label class="acct-label" for="orAmount">Refund amount (USD)</label>
      <input class="acct-input" id="orAmount" type="number" min="0.01" step="0.01" value="${(defaultC / 100).toFixed(2)}">
      <label class="acct-label" for="orReason">Reason (optional)</label>
      <input class="acct-input" id="orReason" type="text" maxlength="200" placeholder="Return, within the 30-day window">
      <p class="acct-card-note">Stripe keeps its processing fee on a refund; the fee is not returned. This moves money.</p>
      <p class="acct-error" id="orError" hidden></p>
      <div class="acct-modal-actions">
        <button class="btn btn-ghost" type="button" data-or-close>Cancel</button>
        <button class="btn btn-danger" type="button" data-or-confirm>Refund</button>
      </div>
    </div>
  `;
  const close = () => { hostEl.hidden = true; hostEl.innerHTML = ''; hostEl.removeEventListener('click', onClick); };
  const onClick = async (e) => {
    if (e.target.closest('[data-or-close]')) { close(); return; }
    if (!e.target.closest('[data-or-confirm]')) return;
    const dollars = Number(document.getElementById('orAmount')?.value);
    const cents = Math.round(dollars * 100);
    const errEl = document.getElementById('orError');
    const setErr = (m) => { if (errEl) { errEl.textContent = m; errEl.hidden = false; } };
    if (!Number.isFinite(cents) || cents <= 0) { setErr('Enter a refund amount.'); return; }
    if (cents > remainingC) { setErr(`The most you can refund is ${usdCents(remainingC)}.`); return; }
    const reason = document.getElementById('orReason')?.value || '';
    const confirmBtn = e.target.closest('[data-or-confirm]');
    confirmBtn.disabled = true; confirmBtn.textContent = 'Refunding…';
    try {
      await apiFetch(ADMIN_ORDER_REFUND_URL, { method: 'POST', body: JSON.stringify({ orderId, amountCents: cents, reason }) });
      close();
      // The charge.refunded webhook updates refundedCents + status; give it a
      // moment, then reload the current tab so the desk reflects it.
      const active = document.querySelector('[data-adm-orders].is-active')?.dataset.admOrders || '';
      setTimeout(() => loadAdminOrders(active), 1500);
    } catch (ex) {
      confirmBtn.disabled = false; confirmBtn.textContent = 'Refund';
      setErr(friendlyError(ex, 'The refund could not be created.'));
    }
  };
  hostEl.addEventListener('click', onClick);
}

/* ---------- payments: the Stripe account, read from here ---------- */

async function renderPayments(main) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Payments</h2></header>
    <p class="adm-error" id="admPayError" hidden></p>
    <div id="admPayBody"><p class="adm-note">Loading from Stripe…</p></div>
  `;
  const host = document.getElementById('admPayBody');
  try {
    const d = await apiFetch(STRIPE_OVERVIEW_URL);
    const balances = (arr) => (arr || []).map(b => `${usdCents(b.amountCents)} ${escapeHtml(b.currency)}`).join(' · ') || '$0.00';
    host.innerHTML = `
      <div class="adm-stat-grid">
        ${statCard(balances(d.balance?.available), 'Available balance')}
        ${statCard(balances(d.balance?.pending), 'Pending balance')}
        ${statCard(d.activeSubscriptions ?? '—', 'Active subscriptions')}
        ${statCard(d.livemode === false ? 'TEST' : d.livemode === true ? 'LIVE' : '—', 'Stripe mode',
          '', d.livemode === false ? 'amber' : d.livemode === true ? 'teal' : '')}
      </div>
      ${d.planCounts && Object.keys(d.planCounts).length ? `
        <div class="adm-card">
          <h3 class="adm-card-h">Subscriptions in force</h3>
          <div class="adm-table-scroll">
            <table class="adm-table">
              <thead><tr><th>Price</th><th class="adm-num">Subscribers</th><th class="adm-num">Monthly run rate</th></tr></thead>
              <tbody>
                ${Object.entries(d.planCounts).map(([lk, v]) => `
                  <tr>
                    <td><code>${escapeHtml(lk)}</code></td>
                    <td class="adm-num">${escapeHtml(String(v.count))}</td>
                    <td class="adm-num adm-money-pos">${escapeHtml(usdCents(v.runRateCents))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <p class="adm-note">Attach counts against the base plans show whether each add-on earns its
          keep. Per-account usage metering (what people actually consume against their limits) is the
          next build and needs its own counters.</p>
        </div>
      ` : ''}
      <div class="adm-card">
        <h3 class="adm-card-h">Recent charges</h3>
        ${(d.charges || []).length ? `
          <div class="adm-table-scroll">
            <table class="adm-table">
              <thead><tr><th>Date</th><th class="adm-num">Amount</th><th>Status</th><th>Customer</th><th></th></tr></thead>
              <tbody>
                ${d.charges.map(c => `
                  <tr>
                    <td class="adm-muted">${escapeHtml(fmtDate(c.createdAt))}</td>
                    <td class="adm-num ${c.refunded ? 'adm-money-neg' : c.status === 'succeeded' ? 'adm-money-pos' : ''}">${c.refunded ? '-' : ''}${escapeHtml(usdCents(c.amountCents))}</td>
                    <td><span class="acct-tag ${c.refunded ? 'is-bad' : c.status === 'succeeded' ? 'is-verified' : 'is-quiet'}">${escapeHtml(c.refunded ? 'refunded' : c.status)}</span></td>
                    <td class="adm-cell-email cell-ellip" title="${escapeHtml(c.email || '')}">${escapeHtml(c.email || '—')}</td>
                    <td>${safeUrl(c.receiptUrl) ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(c.receiptUrl))}" target="_blank" rel="noopener">Receipt</a>` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p class="adm-empty">No charges yet.</p>`}
      </div>
      <div class="adm-card">
        <h3 class="adm-card-h">Payouts</h3>
        ${(d.payouts || []).length ? `
          <div class="adm-table-scroll">
            <table class="adm-table">
              <thead><tr><th>Created</th><th>Arrives</th><th class="adm-num">Amount</th><th>Status</th></tr></thead>
              <tbody>
                ${d.payouts.map(p => `
                  <tr>
                    <td class="adm-muted">${escapeHtml(fmtDate(p.createdAt))}</td>
                    <td class="adm-muted">${escapeHtml(fmtDate(p.arrivalAt))}</td>
                    <td class="adm-num ${p.status === 'paid' ? 'adm-money-pos' : ''}">${escapeHtml(usdCents(p.amountCents))}</td>
                    <td><span class="acct-tag ${p.status === 'paid' ? 'is-verified' : 'is-quiet'}">${escapeHtml(p.status)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p class="adm-empty">No payouts yet.</p>`}
      </div>
      <p class="adm-note">Read-only by design. Refunds and disputes stay in Stripe's own dashboard.</p>
    `;
  } catch (ex) {
    host.innerHTML = '';
    showError('admPayError', friendlyError(ex, 'Could not load Stripe.'));
  }
}

/* ---------- shipping labels + print queue (below the orders table) ---------- */

async function loadLabelsAndQueue() {
  const host = document.getElementById('admLabelsBody');
  if (!host) return;
  try {
    const [labels, queue] = await Promise.all([
      apiFetch(`${SHIPPO_LABELS_URL}?limit=50`).catch(() => null),
      apiFetch(`${PRINT_QUEUE_URL}?limit=50`).catch(() => null)
    ]);
    const pending = (queue?.jobs || []).filter(j => j.state === 'PENDING').length;
    host.innerHTML = `
      <div class="adm-card">
        <h3 class="adm-card-h">Print queue</h3>
        <p class="adm-note">${!queue
          ? 'Could not reach the print queue endpoint.'
          : pending
            ? `${pending} label${pending === 1 ? '' : 's'} waiting for the print agent.`
            : 'Queue is clear. Labels queue here automatically when bought; the agent on your network prints and acks them.'}</p>
        ${(queue?.jobs || []).length ? `
          <div class="adm-table-scroll">
            <table class="adm-table">
              <thead><tr><th>Queued</th><th>Tracking</th><th>State</th><th>Printed by</th><th></th></tr></thead>
              <tbody>
                ${queue.jobs.map(j => `
                  <tr>
                    <td class="adm-muted">${escapeHtml(fmtDate(j.createdAt))}</td>
                    <td class="cell-ellip" title="${escapeHtml(j.trackingNumber || '')}"><code>${escapeHtml(j.trackingNumber || j.jobId.slice(0, 10))}</code></td>
                    <td class="cell-tight"><span class="adm-pill ${j.state === 'PRINTED' ? 'is-available' : 'is-claimed'}">${escapeHtml(j.state.toLowerCase())}</span></td>
                    <td class="adm-muted cell-ellip" title="${escapeHtml(j.printedBy || '')}">${escapeHtml(j.printedBy || '—')}</td>
                    <td>${safeUrl(j.labelUrl) ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(j.labelUrl))}" target="_blank" rel="noopener">PDF</a>` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
      <div class="adm-card">
        <h3 class="adm-card-h">Labels in Shippo</h3>
        ${labels?.labels?.length ? `
          <div class="adm-table-scroll">
            <table class="adm-table">
              <thead><tr><th>Created</th><th>Status</th><th>Tracking</th><th>Order</th><th></th></tr></thead>
              <tbody>
                ${labels.labels.map(l => `
                  <tr>
                    <td class="adm-muted">${escapeHtml(fmtDate(l.createdAt))}${l.isTest ? ' <span class="adm-pill">test</span>' : ''}</td>
                    <td><span class="adm-pill ${l.status === 'SUCCESS' ? 'is-available' : 'is-claimed'}">${escapeHtml(l.status.toLowerCase())}</span></td>
                    <td class="cell-ellip" title="${escapeHtml(l.trackingNumber || '')}">${l.trackingNumber
                      ? (safeUrl(l.trackingUrl)
                          ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(l.trackingUrl))}" target="_blank" rel="noopener">${escapeHtml(l.trackingNumber)}</a>`
                          : `<code>${escapeHtml(l.trackingNumber)}</code>`)
                      : '<span class="adm-muted">—</span>'}</td>
                    <td class="adm-muted">${escapeHtml((l.orderId || '').slice(0, 8) || '—')}</td>
                    <td>${safeUrl(l.labelUrl) ? `<a class="btn adm-copy" href="${escapeHtml(safeUrl(l.labelUrl))}" target="_blank" rel="noopener" title="Opens the 4x6 label PDF for printing">Print</a>` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p class="adm-empty">${labels ? 'No labels in this Shippo mode yet.' : 'Could not reach the labels endpoint.'}</p>`}
      </div>
    `;
  } catch (ex) {
    host.innerHTML = `<p class="adm-empty">${escapeHtml(friendlyError(ex, 'Could not load labels.'))}</p>`;
  }
}

async function runWebhookSync(btn, url, label, body = {}) {
  btn.disabled = true;
  const orig = btnLabel(btn);
  btnLabel(btn, 'Syncing…');
  const out = document.getElementById('admIntegrationsResult');
  try {
    const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
    let text = `${label}: ${res.action || 'ok'}${res.url ? ` (${res.url})` : ''}`;
    if (res.action === 'created' && res.secret) {
      text += `. NEW SIGNING SECRET (shown once, set it as ${res.setting || 'the app setting'} on this lane now): ${res.secret}`;
    }
    if (Array.isArray(res.created) && res.created.length) text += `. Registered: ${res.created.join(', ')}`;
    if (Array.isArray(res.missingBefore) && res.missingBefore.length) text += `. Added events: ${res.missingBefore.join(', ')}`;
    // Shippo sync now converges: stale-token, inactive and duplicate webhooks
    // at our address are deleted. Show what went so a rotation is visible.
    if (Array.isArray(res.removed) && res.removed.length) {
      text += `. Removed ${res.removed.length} stale: ${res.removed.map(r => `${r.event} (${r.reason})`).join(', ')}`;
    }
    if (Array.isArray(res.existing) && res.existing.length && !(res.created || []).length) text += `. Already correct: ${res.existing.join(', ')}`;
    if (out) { out.textContent = text; out.hidden = false; }
  } catch (ex) {
    if (out) { out.textContent = `${label}: ${friendlyError(ex, 'sync failed')}`; out.hidden = false; }
  } finally {
    btn.disabled = false;
    btnLabel(btn, orig);
  }
}

// Reconcile one account's billing to Stripe's truth (admin). dryRun=true
// only computes and shows the plan; the write path asks for confirmation
// because it changes Stripe metadata and the live profile.
async function runBillingReconcile(btn, dryRun) {
  const who = String(document.getElementById('admReconcileWho')?.value || '').trim();
  const out = document.getElementById('admReconcileResult');
  const show = (text) => { if (out) { out.textContent = text; out.hidden = false; } };
  if (!who) { show('Enter the account email or userId first.'); return; }
  if (!dryRun && !armed(btn, `Write it for ${who}?`)) return;

  const body = who.includes('@') ? { email: who.toLowerCase(), dryRun } : { userId: who, dryRun };
  btn.disabled = true;
  const orig = btnLabel(btn);
  btnLabel(btn, dryRun ? 'Planning…' : 'Reconciling…');
  try {
    const r = await apiFetch(BILLING_RECONCILE_URL, { method: 'POST', body: JSON.stringify(body) });
    const lines = [
      `${r.dryRun ? 'DRY RUN (nothing written)' : 'RECONCILED'} for user ${r.userId}`,
      `profile ${r.billingProfileId}`,
      `customer ${r.stripeCustomerId}  subscription ${r.stripeSubscriptionId} (${r.subscriptionStatus})${r.owed ? '  money owed' : '  nothing owed'}`,
      `status  ${r.before?.status || '?'} -> ${r.after?.status}`,
      `tier    ${r.before?.tier || '?'} -> ${r.after?.tier}`,
      `stamp metadata: customer ${r.stamped?.customer ? 'yes' : 'already correct'}, subscription ${r.stamped?.subscription ? 'yes' : 'already correct'}`,
      r.lookupKeys?.length ? `prices  ${r.lookupKeys.join(', ')}` : 'prices  (none reported)',
      ...(r.notes || []).map(n => `note    ${n}`)
    ];
    show(lines.join('\n'));
  } catch (ex) {
    show(`Reconcile: ${friendlyError(ex, 'failed')}`);
  } finally {
    btn.disabled = false;
    btnLabel(btn, orig);
  }
}

/* ---------- warranty (mint + inventory) ---------- */

function mintResultHtml(result) {
  const codes = result.codes || [];
  return `
    <div class="adm-result">
      <div class="adm-result-head">
        <strong>${codes.length} code${codes.length === 1 ? '' : 's'} minted</strong>
        <button class="btn btn-sm btn-ico" type="button" data-adm-action="copy" data-tip="Copy every minted code to the clipboard" aria-label="Copy every minted code">${ico('copy')}</button>
      </div>
      <p class="adm-note">Batch ${escapeHtml(result.batchId || '')}</p>
      <ul class="adm-codes" id="admCodeList">
        ${codes.map(c => `<li><code>${escapeHtml(c)}</code></li>`).join('')}
      </ul>
    </div>
  `;
}

function inventoryHtml(data) {
  const rows = data.codes || [];
  if (!rows.length) return `<p class="adm-empty">No codes in this view.</p>`;
  return `
    <div class="adm-table-scroll">
      <table class="adm-table">
        <thead>
          <tr><th>Code</th><th>Status</th><th>Product</th><th>Issued</th><th>Claimed by</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><code>${escapeHtml(r.code)}</code></td>
              <td><span class="adm-pill ${r.status === 'CLAIMED' ? 'is-claimed' : 'is-available'}">${escapeHtml(r.status)}</span></td>
              <td>${escapeHtml(r.productId || 'Any')}</td>
              <td class="adm-muted">${escapeHtml((r.issuedAt || '').slice(0, 10))}</td>
              <td class="adm-muted cell-ellip" title="${escapeHtml(r.claimedByEmail || '')}">${escapeHtml(r.claimedByEmail || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderWarranty(main) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Warranty codes</h2></header>
    <div class="adm-grid">
      <section class="adm-card" aria-labelledby="admMintTitle">
        <h3 class="adm-h2" id="admMintTitle">Mint codes</h3>
        <p class="adm-note">
          Codes are minted unclaimed. Write one on a card, ship it, and the
          customer redeems it at <code>/#warranty</code>. Leave the product
          blank for a code any product can use.
        </p>
        <div class="adm-fields">
          <label class="adm-label" for="admCount">How many</label>
          <input class="adm-input" id="admCount" type="number" min="1" max="500" value="10" inputmode="numeric" title="1 to 500 codes per batch">
          <label class="adm-label" for="admProduct">Product</label>
          <select class="adm-input" id="admProduct">
            <option value="">Any product</option>
            <option value="omnisource">OmniSource</option>
            <option value="omnibus">OmniBus</option>
          </select>
          <label class="adm-label" for="admNote">Note</label>
          <input class="adm-input" id="admNote" type="text" maxlength="80" placeholder="e.g. October build">
        </div>
        <div class="adm-actions"><button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="mint">${ico('plus')}<span>Mint codes</span></button></div>
        <p class="adm-error" id="admMintError" hidden></p>
        <div id="admMintResult"></div>
      </section>

      <section class="adm-card" aria-labelledby="admInvTitle">
        <div class="adm-inv-head">
          <h3 class="adm-h2" id="admInvTitle">Inventory</h3>
          <div class="adm-tabs" role="tablist">
            <button class="adm-tab is-active" type="button" role="tab" aria-selected="true" data-adm-filter="AVAILABLE">Available</button>
            <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-filter="CLAIMED">Claimed</button>
            <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-filter="ALL">All</button>
          </div>
        </div>
        <p class="adm-error" id="admInvError" hidden></p>
        <div id="admInvBody"><p class="adm-note">Loading…</p></div>
      </section>
    </div>
  `;
  loadInventory('AVAILABLE');
}

async function loadInventory(status) {
  const host = document.getElementById('admInvBody');
  if (!host) return;
  showError('admInvError', '');
  host.innerHTML = `<p class="adm-note">Loading…</p>`;
  try {
    const data = await apiFetch(`${LIST_URL}?status=${encodeURIComponent(status)}&limit=500`);
    host.innerHTML = inventoryHtml(data);
  } catch (ex) {
    host.innerHTML = '';
    showError('admInvError', friendlyError(ex, 'Could not load inventory.'));
  }
}

async function mint(btn) {
  const count = Number(document.getElementById('admCount')?.value || 0);
  const productId = document.getElementById('admProduct')?.value || '';
  const note = document.getElementById('admNote')?.value || '';
  showError('admMintError', '');
  if (!Number.isFinite(count) || count < 1) { showError('admMintError', 'Enter how many codes to mint.'); return; }
  // The input sits outside any form, so its max attribute never runs; the
  // backend refuses over-cap batches, but say so BEFORE the round trip.
  if (count > 500) { showError('admMintError', 'You can mint at most 500 codes per batch.'); return; }
  btn.disabled = true;
  const original = btnLabel(btn);
  btnLabel(btn, 'Minting…');
  try {
    const result = await apiFetch(ISSUE_URL, { method: 'POST', body: JSON.stringify({ count, productId, note }) });
    const out = document.getElementById('admMintResult');
    if (out) out.innerHTML = mintResultHtml(result);
    const active = document.querySelector('.adm-tab.is-active')?.dataset.admFilter || 'AVAILABLE';
    loadInventory(active);
  } catch (ex) {
    showError('admMintError', friendlyError(ex, 'Mint failed.'));
  } finally {
    btn.disabled = false;
    btnLabel(btn, original);
  }
}

function copyCodes(btn) {
  const codes = [...document.querySelectorAll('#admCodeList code')].map(c => c.textContent).join('\n');
  if (!codes) return;
  copyButton(btn, codes, { select: () => document.getElementById('admCodeList') });
}

/* ---------- catalog (lane mirror) ---------- */

function readSnapshot() {
  // Shape-validate: localStorage is user-writable, and the renderer reads
  // .items.length / .sourceLane / .takenAt straight off this object.
  try {
    const s = JSON.parse(localStorage.getItem(CATALOG_SNAPSHOT_KEY) || 'null');
    return (s && Array.isArray(s.items) && typeof s.sourceLane === 'string' && typeof s.takenAt === 'string')
      ? s : null;
  } catch { return null; }
}

function catalogPlanRowHtml(r) {
  return `<tr>
    <td><code>${escapeHtml(r.lookupKey)}</code></td>
    <td>${escapeHtml(r.interval || '')}</td>
    <td>${r.amount !== '' && r.amount != null ? '$' + (Number(r.amount) / 100).toFixed(2) : ''}</td>
  </tr>`;
}
function renderCatalog(main) {
  const ping = cachedPing();
  const rows = Array.isArray(ping?.productCatalog) ? ping.productCatalog : [];
  const snap = readSnapshot();

  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Catalog</h2>
      <span class="adm-pill">lane: ${escapeHtml(LANE)}</span>
    </header>

    <div class="adm-card">
      <h3 class="adm-card-h">Lane</h3>
      <p class="muted">This browser is routing API calls to the <strong>${escapeHtml(LANE)}</strong> lane
      (${escapeHtml(PRAG_API_BASE)}). Each lane is its own platform: its own accounts, keys, and
      Stripe mode. When your accounts are linked the switch is seamless (no password); otherwise
      it opens sign-in on the other lane. Either way the session and every cached response come
      back fresh. The deployed site never changes; only where this browser routes.</p>
      ${laneSwitchHtml('data-adm-action')}
    </div>

    <div class="adm-card">
      <h3 class="adm-card-h">This lane's catalog</h3>
      ${rows.length ? `
        <div class="adm-table-scroll">
          <table class="adm-table">
            <thead><tr><th>Lookup key</th><th>Interval</th><th>Amount</th></tr></thead>
            <tbody id="admCatalogPlanBody">
              ${rows.map(catalogPlanRowHtml).join('')}
            </tbody>
          </table>
        </div>
        <div class="adm-actions-row">
          <button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="catalog-snapshot"
            data-tip="Saves this lane's catalog in this browser so you can import it after flipping lanes">${ico('database')}<span>Snapshot ${rows.length} row${rows.length === 1 ? '' : 's'} from ${escapeHtml(LANE)}</span></button>
        </div>
      ` : `
        <p class="muted">No catalog rows on this lane yet. Sign out and back in if you subscribed
        recently; the catalog rides on the ping.</p>
      `}
    </div>

    <div class="adm-card">
      <h3 class="adm-card-h">Sync from Stripe</h3>
      <p class="adm-note">Reads this lane's Stripe prices into the catalog table: plans and add-ons by lookup key, and the
        physical goods bound to their products (a one-time price with lookup key <code>po.goods.&lt;sku&gt;.&lt;variant&gt;</code>
        on a product tagged <code>po_sku</code>). Run it after changing products or prices in Stripe. Nothing pulls at page load.</p>
      <div class="adm-actions-row">
        <button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="catalog-sync" data-tip="Reads Stripe now and updates the catalog table on this lane">${ico('refresh')}<span>Sync from Stripe</span></button>
        <button class="btn btn-sm btn-ico" type="button" data-adm-action="catalog-copy" data-tip="Copies the raw inventory as plain text: every keyed price, the goods rows, and the keyless prices from the last sync" aria-label="Copy the raw inventory as plain text">${ico('copy')}</button>
        <span class="muted nt-result" id="admCatalogSyncResult"></span>
      </div>
      <p class="adm-error" id="admCatalogSyncError" hidden></p>
      <div id="admCatalogSyncDiag"></div>
      <pre class="adm-raw" id="admCatalogRaw" hidden></pre>
    </div>

    <div class="adm-card">
      <h3 class="adm-card-h">Physical goods</h3>
      <p class="adm-note">The products the shop sells, as the last sync bound them to Stripe. Checkout charges these prices and
        Stripe Tax uses these tax codes; the unit cost feeds the Orders desk. The plan table above is the subscription side.</p>
      <div id="admCatalogGoods"><p class="adm-note">Loading…</p></div>
    </div>

    <div class="adm-card">
      <h3 class="adm-card-h">Stored snapshot</h3>
      ${snap ? `
        <p class="muted"><strong>${snap.items.length}</strong> rows from the
        <strong>${escapeHtml(snap.sourceLane)}</strong> lane, taken ${escapeHtml(new Date(snap.takenAt).toLocaleString())}.</p>
        ${snap.sourceLane === LANE
          ? `<p class="muted">You are on the lane this snapshot came from. Flip to the other lane to import it.</p>`
          : `<p class="muted">Importing creates the missing products and prices in the
             <strong>${escapeHtml(LANE)}</strong> lane's Stripe account (by lookup key, idempotent),
             then syncs its ProductCatalog table.</p>
             <div class="adm-actions-row">
               ${LANE === 'live' ? '<input class="adm-input adm-live-word" id="admImportLiveWord" type="text" autocomplete="off" spellcheck="false" placeholder="type live" aria-label="Type live to import into the live Stripe account">' : ''}
               <button class="btn btn-sm btn-lead btn-primary" type="button" data-adm-action="catalog-import"
                 data-tip="Creates the missing products and prices in this lane's Stripe account, then syncs its catalog table">${ico('upload')}<span>Import into ${escapeHtml(LANE)}</span></button>
             </div>`}
      ` : `
        <p class="muted">No snapshot stored. Take one on the lane that has the catalog (live), then
        flip lanes and import it here.</p>
      `}
      <p class="adm-error" id="admCatalogError" hidden></p>
      <p class="muted" id="admCatalogResult" hidden></p>
    </div>
  `;
  loadCatalogGoods();
}

// The goods rows the sync wrote, from the catalog table itself (they never
// ride the ping). An older lane answers 404 and the card says so.
async function loadCatalogGoods() {
  const host = document.getElementById('admCatalogGoods');
  if (!host) return;
  try {
    const data = await apiFetch(ADMIN_CATALOG_GOODS_URL);
    const rows = data.goods || [];
    if (!rows.length) { host.innerHTML = '<p class="adm-empty">No goods rows yet. Give the Stripe product its lookup key, then Sync from Stripe.</p>'; return; }
    host.innerHTML = `
      <div class="adm-table-scroll">
        <table class="adm-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Configuration</th><th class="adm-num">Price</th><th>Tax code</th><th>Ships</th><th class="adm-num">Unit cost</th><th>Lookup key</th><th>Status</th></tr></thead>
          <tbody>${rows.map(g => `
            <tr>
              <td>${escapeHtml(g.name || g.sku)}</td>
              <td><code>${escapeHtml(g.sku)}</code></td>
              <td>${escapeHtml(g.variant)}${g.nickname ? `<div class="adm-muted">${escapeHtml(g.nickname)}</div>` : ''}</td>
              <td class="adm-num cell-tight">${g.amount == null ? '—' : escapeHtml(usdCents(g.amount))}</td>
              <td><code>${escapeHtml(g.taxCode || '')}</code>${g.taxCode ? '' : '<div class="adm-muted">general goods by default</div>'}</td>
              <td>${g.physical ? 'yes' : 'no'}</td>
              <td class="adm-num cell-tight">${g.costCents == null ? '<span class="adm-muted" title="Set po_cost_cents on the Stripe product and sync">—</span>' : escapeHtml(usdCents(g.costCents))}</td>
              <td><code>${escapeHtml(g.lookupKey)}</code></td>
              <td>${g.active ? '<span class="acct-tag is-verified">active</span>' : `<span class="acct-tag" title="${escapeHtml(g.retiredAt)}">retired</span>`}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  } catch (ex) {
    host.innerHTML = `<p class="adm-empty">${ex?.status === 404
      ? 'This lane does not carry the goods list yet. Deploy the backend that has it.'
      : escapeHtml(friendlyError(ex, 'Could not load the goods rows.'))}</p>`;
  }
}

// The last sync's answer, kept so Copy list can include the keyless prices.
let lastCatalogSync = null;

// The raw inventory as plain text, for sharing: what this lane's catalog
// offers, what the sync bound as goods, and what Stripe holds that carries no
// key. Copies to the clipboard; when the browser refuses, the text is shown so
// it can be selected by hand.
async function copyCatalogList(btn) {
  if (btn.disabled) return;
  const done = busy(btn, 'Gathering the list…');
  try { await copyCatalogListNow(); } finally { done(); }
}
async function copyCatalogListNow() {
  const ping = cachedPing();
  const rows = (ping?.productCatalog || []).filter(r => String(r.active) !== 'false')
    .map(r => `${r.lookupKey}  ${usdCents(r.amount)}  ${r.interval || 'one-time'}`).sort();
  let goods = [];
  try { goods = (await apiFetch(ADMIN_CATALOG_GOODS_URL)).goods || []; } catch { goods = []; }
  const d = lastCatalogSync?.diagnostics || null;
  const lines = [];
  lines.push(`PragOptics catalog, lane ${LANE}, build ${ping?.deployment?.build || '?'}, ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`PLANS AND ADD-ONS OFFERED (${rows.length})`);
  rows.forEach(r => lines.push('  ' + r));
  if (lastCatalogSync) {
    const hiddenKeys = Array.isArray(lastCatalogSync.diagnostics?.hiddenKeys) ? lastCatalogSync.diagnostics.hiddenKeys : [];
    lines.push(`  keyed in Stripe: ${lastCatalogSync.upserted || 0}`);
    if (hiddenKeys.length) {
      lines.push('');
      lines.push(`KEYED BUT NEVER OFFERED, RETIRED ADD-ONS (${hiddenKeys.length}) - archive these in Stripe to clear the clutter`);
      hiddenKeys.forEach(k => lines.push('  ' + k));
    }
  }
  lines.push('');
  lines.push(`GOODS (${goods.length})`);
  goods.forEach(g => lines.push(`  ${g.lookupKey}  ${g.name}  ${g.amount == null ? '' : usdCents(g.amount)}  tax ${g.taxCode || '(default)'}  ships ${g.physical ? 'yes' : 'no'}  cost ${g.costCents == null ? '(unset)' : usdCents(g.costCents)}  ${g.active ? 'active' : 'retired'}`));
  lines.push('');
  if (d) {
    const k = Array.isArray(d.keylessPrices) ? d.keylessPrices : [];
    lines.push(`KEYLESS PRICES IN STRIPE, IGNORED (${d.pricesWithoutLookupKey || 0})`);
    k.forEach(p => lines.push(`  ${p.id}  ${p.product || ''}${p.nickname ? ' (' + p.nickname + ')' : ''}  ${p.amount == null ? '' : usdCents(p.amount)}  ${p.interval || ''}`));
    if ((d.pricesWithoutLookupKey || 0) > k.length) lines.push(`  (${(d.pricesWithoutLookupKey || 0) - k.length} more not listed)`);
  } else {
    lines.push('KEYLESS PRICES IN STRIPE: run Sync from Stripe first to include them');
  }
  const text = lines.join('\n');
  const out = document.getElementById('admCatalogSyncResult');
  const raw = document.getElementById('admCatalogRaw');
  let copied = false;
  try { await writeClipboard(text); copied = true; } catch { copied = false; }
  if (raw) { raw.textContent = text; raw.hidden = copied; }
  if (out) out.textContent = copied ? `Copied ${lines.length} lines.` : 'The browser refused the clipboard; the list is shown below to select and copy.';
}

// One click, one read of Stripe, and a plain account of what came across. When
// a product the owner tagged for the shop has no goods price, the desk names it.
async function catalogSync(btn) {
  showError('admCatalogSyncError', '');
  const out = document.getElementById('admCatalogSyncResult');
  const diagEl = document.getElementById('admCatalogSyncDiag');
  const orig = btnLabel(btn);
  btn.disabled = true; btnLabel(btn, 'Syncing…');
  try {
    const r = await apiFetch(CATALOG_SYNC_URL, { method: 'POST', body: '{}' });
    lastCatalogSync = r;
    const d = r.diagnostics || {};
    if (out) out.textContent = `Plans: ${r.upserted || 0} updated, ${r.retired || 0} retired. Goods: ${r.goodsUpserted || 0} updated, ${r.goodsRetired || 0} retired.`;
    const notes = [];
    if (Array.isArray(d.goodsKeysSeen) && d.goodsKeysSeen.length) notes.push(`Goods prices found: ${d.goodsKeysSeen.map(k => `<code>${escapeHtml(k)}</code>`).join(', ')}.`);
    for (const p of d.skuProductsWithoutGoodsPrice || []) {
      notes.push(`<strong>${escapeHtml(p.name || p.id)}</strong> is tagged <code>po_sku=${escapeHtml(p.sku)}</code> but none of its active one-time prices carries the lookup key <code>po.goods.${escapeHtml(p.sku)}.default</code>. Set the lookup key on the price, then sync again.`);
    }
    if (d.pricesWithoutLookupKey) {
      const list = Array.isArray(d.keylessPrices) ? d.keylessPrices : [];
      const items = list.map(p => `<li><strong>${escapeHtml(p.product || p.id)}</strong>${p.nickname ? ` (${escapeHtml(p.nickname)})` : ''}: ${p.amount != null ? escapeHtml(usdCents(p.amount)) + ' ' : ''}${escapeHtml(p.interval || '')} <code>${escapeHtml(p.id)}</code></li>`).join('');
      notes.push(`<details class="adm-details"><summary>${d.pricesWithoutLookupKey} active price${d.pricesWithoutLookupKey === 1 ? '' : 's'} in this Stripe account carr${d.pricesWithoutLookupKey === 1 ? 'ies' : 'y'} no lookup key. The sync leaves them alone and nothing on the site offers them. Open to see which.</summary>${items ? `<ul>${items}</ul>` : ''}</details>`);
    }
    loadCatalogGoods();
    // The sync just changed this lane's catalog; the ping the desk read is now
    // stale (retired rows still showing). Refresh it and refill the plan table
    // in place, so a rename or retirement drops out of the view at once.
    await refreshCachedPing();
    const planBody = document.getElementById('admCatalogPlanBody');
    if (planBody) {
      const fresh = Array.isArray(cachedPing()?.productCatalog) ? cachedPing().productCatalog : [];
      if (fresh.length) planBody.innerHTML = fresh.map(catalogPlanRowHtml).join('');
    }
    if (!(r.goodsUpserted || 0) && !(d.skuProductsWithoutGoodsPrice || []).length && !(d.goodsKeysSeen || []).length) notes.push('No goods came across and no product is tagged <code>po_sku</code> in the Stripe account this lane uses. If you created the product in a different sandbox, this lane cannot see it.');
    if (diagEl) diagEl.innerHTML = notes.length ? `<ul class="adm-note adm-diag">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : '';
  } catch (ex) {
    showError('admCatalogSyncError', friendlyError(ex, 'The sync could not run.'));
  } finally {
    btn.disabled = false; btnLabel(btn, orig);
  }
}

function catalogSnapshot() {
  const rows = cachedPing()?.productCatalog || [];
  if (!rows.length) return;
  try {
    localStorage.setItem(CATALOG_SNAPSHOT_KEY, JSON.stringify({
      sourceLane: LANE,
      takenAt: new Date().toISOString(),
      items: rows.map(r => ({
        lookupKey: r.lookupKey,
        amount: Number(r.amount),
        currency: r.currency || 'USD',
        interval: r.interval,
        productName: String(r.lookupKey || '').replace(/\.(monthly|annual)$/, '')
      }))
    }));
  } catch { /* storage blocked */ }
  showSection('catalog');
}

async function catalogImport(btn) {
  const snap = readSnapshot();
  if (!snap || snap.sourceLane === LANE) return;
  // Importing into live rewrites the account real customers bill against. The
  // backend refuses without the confirm token; the operator types the word.
  let confirm;
  if (LANE === 'live') {
    const word = String(document.getElementById('admImportLiveWord')?.value || '').trim().toLowerCase();
    if (word !== 'live') { showError('admCatalogError', 'This imports into the LIVE Stripe account. Type live in the box beside the button, then press Import.'); document.getElementById('admImportLiveWord')?.focus(); return; }
    confirm = 'live';
  }
  if (btn.disabled) return;
  const done = busy(btn, 'Importing…');
  try {
    const data = await apiFetch(CATALOG_IMPORT_URL, {
      method: 'POST',
      body: JSON.stringify({ items: snap.items, ...(confirm ? { confirm } : {}) })
    });
    const out = document.getElementById('admCatalogResult');
    if (out) {
      out.textContent = `Done: ${data.created} created, ${data.skipped} already present, ${data.synced} table rows synced` +
        (data.errors?.length ? `. Rejected: ${data.errors.join('; ')}` : '.');
      out.hidden = false;
    }
    showError('admCatalogError', '');
  } catch (ex) {
    showError('admCatalogError', friendlyError(ex, 'Import failed.'));
  } finally { done(); }
}

/* ================================================================
   ROUTING / BEHAVIOUR
   ================================================================ */

// What the Team module borrows from this panel, so it carries no second copy. Its fetch notes the role each read
// of the team view answers with, so the Licensing entry follows the team in view (licensingHidden above);
// teamPicked is called when the Team tab changes the team in view, so the entry hides until that team's role is read.
function teamDeps() {
  return { apiFetch: viewApiFetch, escapeHtml, friendlyError, showError, fmtDate, cachedPing, teamPicked: syncLicensingNav };
}

function showSection(id) {
  // A customer must never land on an internal section id (stale deep link),
  // and nobody lands on Team while it is off for this lane.
  if (cachedPing() && !isAdmin() && INTERNAL_SECTIONS.some(s => s.id === id)) id = 'profile';
  if (!TEAM_ON && TEAM_IDS.has(id)) id = 'profile';
  // below member on the team in view there is no Licensing (a stale link, the address bar)
  if (id === 'licensing' && TEAM_ON && licensingBlocked()) id = 'profile';
  activeSection = id;
  // The section rides in the hash (2026-09-21, Cameron: a reload sent him to the landing): replaceState never fires
  // hashchange, and on load /#account?section=<id> opens exactly this section (runtime/bootstrap.js routeToAccountOnLoad).
  try { if (/^#account/i.test(String(location.hash || '')) || !location.hash) history.replaceState(null, '', `#account?section=${encodeURIComponent(id)}`); } catch { /* the section still opens */ }
  document.querySelectorAll('.adm-nav-item').forEach(b => {
    const on = b.dataset.acctSection === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const main = document.getElementById('acctMain');
  if (!main) return;
  // the role on the team in view is not known yet: nothing of Licensing is read until it is
  if (id === 'licensing' && TEAM_ON && roleInView() === null) return void waitForLicensingRole(main);
  // a role read that failed (or a team picked since) is asked again on the next section; Team and Environment read the view themselves
  if (TEAM_ON && id !== 'team' && id !== 'environment' && roleInView() === null) ensureTeamRole();
  consumeOpenCard(id);
  paintSection(id, main);
  // the setup checklist at the top of every customer section (setup.js): mounted after the section's first paint, which
  // every section writes in one go; what each reads later lands inside its own hosts, so the block stays
  if (SETUP_SECTIONS.has(id)) renderSetup(main, teamDeps());
}

// The sections of the panel that carry the setup checklist: every customer section, never an internal desk.
const SETUP_SECTIONS = new Set(ACCOUNT_SECTIONS.map(s => s.id));

/** The section's own paint into main (each writes its shell at once and reads into it after). */
function paintSection(id, main) {
  if (id === 'profile')      return void renderProfile(main);
  if (id === 'products')     return void renderProducts(main);
  if (id === 'subscription') return void renderSubscription(main);
  if (id === 'orders')       return void renderOrders(main);
  if (id === 'team')         return void renderTeam(main, teamDeps());
  if (id === 'environment')  return void renderEnvironment(main, teamDeps());
  if (id === 'licensing')    return void renderLicensing(main, teamDeps());
  if (id === 'liveagents')   return void renderLiveAgents(main, teamDeps());
  if (id === 'builds')       return void renderMyBuilds(main, teamDeps());
  if (id === 'overview')     return void renderOverview(main);
  if (id === 'users')        return void renderUsers(main);
  if (id === 'tenants')      return void renderTenants(main, teamDeps());
  if (id === 'buildsqueue')  return void renderBuildsQueue(main, teamDeps());
  if (id === 'attention')    return void renderNeedsAttention(main, teamDeps());
  if (id === 'notify')       return void renderNotify(main);
  if (id === 'reports')      return void renderReports(main);
  if (id === 'support')      return void renderSupport(main);
  if (id === 'shiporders')   return void renderAdminOrders(main);
  if (id === 'payments')     return void renderPayments(main);
  if (id === 'warranty')     return void renderWarranty(main);
  if (id === 'inventory')    return renderSoon(main, 'Inventory', 'Physical stock levels for hardware, cases, and screwdrivers will live here.');
  if (id === 'catalog')      return void renderCatalog(main);
  if (id === 'ai')           return void renderAdminAi(main);
}

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (message) { el.textContent = message; el.hidden = false; } else { el.textContent = ''; el.hidden = true; }
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;
  bindTeamActions(teamDeps());
  bindEnvironmentActions(teamDeps());
  bindLicensingActions(teamDeps());
  bindLiveAgentsActions(teamDeps());
  initCards();

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-acct-section]');
    if (nav) {
      e.preventDefault();
      const section = nav.dataset.acctSection, card = nav.dataset.acctCard || '';
      // a link that names a card (the setup checklist, "Change them on Billing"): the card is kept for the section to open
      // once it has painted (consumeOpenCard); on the section already in view it opens in place, nothing read again
      if (card) keepOpenCard(section, card);
      if (card && section === activeSection && document.getElementById('acctMain')) { consumeOpenCard(section); return; }
      showSection(section);
      return;
    }

    const act = e.target.closest('[data-acct-action]');
    if (act) {
      e.preventDefault();
      const a = act.dataset.acctAction;
      if (a === 'logout') return void window.logout?.();
      if (a === 'subscribe') {
        if (act.disabled) return;
        // the wizard reads the account's state first: the button waits for that answer, saying so
        const opening = window.openWizardFromMenu?.();
        if (!opening) return void window.setAppMode?.('wizard');
        const done = busy(act, 'Opening…');
        return void Promise.resolve(opening).finally(done);
      }
      if (a === 'inv-more') { const l = act.closest('.ev-card-body')?.querySelector('.acct-inv-list'); if (l) l.classList.add('is-all'); act.closest('.acct-inv-more')?.remove(); return; }
      if (a === 'sub-apply') return void applyPlanChange(act);
      if (a === 'sub-cancel') return void setCancelState(act, 'cancel');
      if (a === 'sub-resume') return void setCancelState(act, 'resume');
      if (a === 'sub-keep') return void keepCurrentPlan(act);
      if (a === 'sub-drop-addons') return void dropStrayAddons(act);
      if (a === 'pm-update') return void startPmUpdate(act);
      if (a === 'pm-save') return void savePmUpdate(act);
      if (a === 'pm-cancel') return void cancelPmUpdate();
      if (a === 'bw-payg' || a === 'bw-cap') return void bandwidthAction(act, a);
      if (a === 'mail-offer-go') { mailOfferDone(); return void showSection('licensing'); }
      if (a === 'mail-offer-later') return void mailOfferDone();
      if (a === 'lic-role-retry') return void showSection('licensing');
      if (a === 'phone-start') return void startPhone(act);
      if (a === 'phone-reverify') {
        if (act.disabled) return;
        const input = document.getElementById('acctNewPhone');
        if (input) input.value = act.dataset.phone || '';
        return void startPhone(act);
      }
      if (a === 'phone-remove') { if (act.disabled || !armed(act, 'Remove?')) return; return void removePhone(act); }
      if (a === 'report-anomaly') return void reportAnomaly();
      if (a === 'support-request') return void supportRequest();
      if (a === 'notify-save') return void saveNotifyPrefs(act);
      if (a === 'theme-set') return void setThemePreference(act.dataset.theme, act);
      if (a === 'starfield-set') return void setStarfieldPreference(act.dataset.starfield);
      if (a === 'name-save') return void saveName(act);
      if (a === 'avatar-remove') return void removeAvatar(act);
      if (a === 'bd-edit') return void editBillingDetails();
      if (a === 'bd-cancel') { if (act.disabled) return; return void cancelBillingDetails(); }
      if (a === 'bd-save') return void saveBillingDetails(act, { apiFetch, url: BILLING_DETAILS_URL });
      if (a === 'close-account') return void closeAccount(act);
      if (a === 'add-alias') return void addAlias(act);
      if (a === 'change-password') return void changePassword(act);
      if (a === 'reset-2fa') return void resetTwoFactor(act);
      if (a === 'add-passkey') return void addPasskey(act);
      if (a === 'remove-passkey') return void removePasskey(String(act.dataset.cred || ''), act);
      if (a === 'make-primary') return void makePrimary(act.dataset.alias, act);
      if (a === 'remove-alias') return void removeAlias(act.dataset.alias, act);
      if (a === 'verify-alias') return void verifyAlias(act.dataset.alias, act.dataset.claim, act);
      if (a === 'lane-live' || a === 'lane-dev') return void laneSwitch(act, a === 'lane-live' ? 'live' : 'dev', 'data-acct-action');
      if (a === 'redeem-product') {
        try { sessionStorage.setItem('pragoptics_redeem_prefill', act.dataset.code || ''); } catch {}
        window.location.hash = '#redeem';
        return void window.setAppMode?.('warranty');
      }
      if (a === 'go-register') { window.location.hash = '#warranty'; return void window.setAppMode?.('warranty'); }
      return;
    }

    const admAct = e.target.closest('[data-adm-action]');
    if (admAct) {
      e.preventDefault();
      if (admAct.dataset.admAction === 'mint') mint(admAct);
      if (admAct.dataset.admAction === 'copy') copyCodes(admAct);
      if (admAct.dataset.admAction === 'catalog-snapshot') catalogSnapshot();
      if (admAct.dataset.admAction === 'catalog-sync') catalogSync(admAct);
      if (admAct.dataset.admAction === 'catalog-copy') copyCatalogList(admAct);
      if (admAct.dataset.admAction === 'catalog-import') catalogImport(admAct);
      if (admAct.dataset.admAction === 'lane-live') laneSwitch(admAct, 'live', 'data-adm-action');
      if (admAct.dataset.admAction === 'lane-dev') laneSwitch(admAct, 'dev', 'data-adm-action');
      if (admAct.dataset.admAction === 'order-label') buyOrderLabel(admAct);
      if (admAct.dataset.admAction === 'order-refund') openOrderRefund(admAct);
      if (admAct.dataset.admAction === 'orders-export') exportOrdersCsv();
      if (admAct.dataset.admAction === 'orders-clear-range' && !admAct.disabled) {
        odRange.from = ''; odRange.to = '';
        const f = document.getElementById('odFrom'); if (f) f.value = '';
        const t = document.getElementById('odTo'); if (t) t.value = '';
        const done = busy(admAct, 'Loading every order…', { hold: [...document.querySelectorAll('[data-adm-orders]')], why: 'Loading…' });
        loadAdminOrders(odActiveStatus()).finally(done);
      }
      if (admAct.dataset.admAction === 'cost-refresh' && !admAct.disabled) {
        // the card paints anew with the answer; until then its refresh turns and says so
        busy(admAct, 'Reading Azure spend…');
        loadAdminCosts(true);
      }
      if (admAct.dataset.admAction === 'user-manage') openUserManage(admAct.dataset.user, admAct.dataset.email);
      if (admAct.dataset.admAction === 'wh-stripe') runWebhookSync(admAct, STRIPE_WH_SYNC_URL, 'Stripe');
      if (admAct.dataset.admAction === 'wh-stripe-connect') runWebhookSync(admAct, STRIPE_WH_SYNC_URL, 'Stripe Connect', { kind: 'connect' });
      if (admAct.dataset.admAction === 'wh-shippo') runWebhookSync(admAct, SHIPPO_WH_SYNC_URL, 'Shippo');
      if (admAct.dataset.admAction === 'billing-reconcile-dry') runBillingReconcile(admAct, true);
      if (admAct.dataset.admAction === 'billing-reconcile') runBillingReconcile(admAct, false);
      if (admAct.dataset.admAction === 'nt-save') ntSave(admAct);
      if (admAct.dataset.admAction === 'nt-send') ntSend(admAct);
      if (admAct.dataset.admAction === 'nt-role-add') ntRoleAdd(admAct);
      return;
    }

    // Notifications desk: test one event's routing, remove a named account.
    const ntTestBtn = e.target.closest('[data-nt-test]');
    if (ntTestBtn) { e.preventDefault(); ntTest(ntTestBtn); return; }
    const ntRoleRm = e.target.closest('[data-nt-role-remove]');
    if (ntRoleRm) { e.preventDefault(); ntRoleRemove(ntRoleRm); return; }

    // Reports desk: close with a note, reopen, switch status view.
    const rpCloseBtn = e.target.closest('[data-rp-close-report]');
    if (rpCloseBtn) { e.preventDefault(); rpCloseReport(rpCloseBtn); return; }
    const rpReopenBtn = e.target.closest('[data-rp-reopen]');
    if (rpReopenBtn) { e.preventDefault(); rpPatch(rpReopenBtn, rpReopenBtn.dataset.rpReopen, { status: 'OPEN' }); return; }
    const rpTab = e.target.closest('[data-adm-reports]');
    if (rpTab) {
      e.preventDefault();
      if (rpTab.disabled) return;
      rpStatus = rpTab.dataset.admReports || 'OPEN';
      const group = [...document.querySelectorAll('[data-adm-reports]')];
      group.forEach(t => {
        const on = t === rpTab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const release = hold(group, 'Loading…');
      loadReports().finally(release);
      return;
    }

    const ordersTab = e.target.closest('[data-adm-orders]');
    if (ordersTab) {
      e.preventDefault();
      if (ordersTab.disabled) return;
      const group = [...document.querySelectorAll('[data-adm-orders]')];
      group.forEach(t => {
        const on = t === ordersTab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const release = hold([...group, ...document.querySelectorAll('[data-adm-action="orders-clear-range"], #odFrom, #odTo')], 'Loading…');
      loadAdminOrders(ordersTab.dataset.admOrders || '').finally(release);
      return;
    }

    const tab = e.target.closest('[data-adm-filter]');
    if (tab) {
      e.preventDefault();
      if (tab.disabled) return;
      const group = [...document.querySelectorAll('[data-adm-filter]')];
      group.forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const release = hold(group, 'Loading…');
      loadInventory(tab.dataset.admFilter).finally(release);
    }
  });

  // Live user filtering, delegated so it survives section re-renders.
  document.addEventListener('input', (e) => {
    if (e.target.id === 'admUserSearch') renderUserRows();
    if (e.target.id === 'acctFirstName' || e.target.id === 'acctLastName') { e.target.removeAttribute('aria-invalid'); setNameStatus(''); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.id === 'acctFirstName' || e.target.id === 'acctLastName')) { e.preventDefault(); document.querySelector('[data-acct-action="name-save"]')?.click(); }
  });
  document.addEventListener('change', (e) => {
    // The profile photo: a picked file is shrunk and saved (2026-10-10)
    if (e.target.id === 'acctAvatarFile') { onAvatarPick(e.target); return; }
    // Appearance: the starfield is a switch (2026-09-23 polish)
    if (e.target.id === 'acctStarsSwitch') { setStarfieldPreference(e.target.checked ? 'on' : 'off'); return; }
    if (e.target.id === 'admUserStatus' || e.target.id === 'admUserTier') renderUserRows();
    // Orders desk: the date range reloads the selection and its totals.
    if (e.target.id === 'odFrom' || e.target.id === 'odTo') {
      odRange[e.target.id === 'odFrom' ? 'from' : 'to'] = e.target.value || '';
      loadAdminOrders(odActiveStatus());
    }
    // Notifications desk: checkboxes write straight into the routing state;
    // the account selects add a named account.
    if (e.target.matches('[data-nt-role], [data-nt-ch], [data-nt-notice-role]')) ntToggle(e.target);
  });
}

/** Deep-link target for the next panel entry (e.g. the old admin route lands
 *  on Overview; the warranty success screen lands on Registered hardware). */
/* A card link (2026-09-16): the software's "one button" lands here with
 * { section, card, row } kept in sessionStorage by routeToAccountOnLoad. Once
 * the section has rendered, the card opens, scrolls into view and flashes once;
 * cards paint after their loads, so this looks for the element for a few
 * seconds and gives up quietly. A named row (the Microsoft row of Connected
 * accounts, from the studio's door) arrives with its card's own list, after
 * the card: it is looked for a while longer and gets the same scroll and flash.
 * The kept copy survives the panel rewriting the address to the bare section
 * (runtime/bootstrap.js captureAccountReturn keeps it before the rehydrate). */
// The setup checklist's names (setup.js; the server's link.card) are here too (2026-09-28): a card made by cardHtml is
// found by its body's id, card-<key with : as ->; a name with no card of its own opens the section's first card.
const CARD_IDS = {
  environment: { environment: 'evBody', storage: 'evBody', lanes: 'evBody', publish: 'evBody', files: 'evFiles', data: 'evData', ai: 'evAi', connections: 'evConnections', domains: 'evDomains', keys: 'evKeys' },
  subscription: { plan: 'acctPricing', card: 'acctPmActions', payment: 'acctPmActions', details: 'card-billing-details', bandwidth: 'card-billing-bandwidth' },
  profile: { name: 'card-profile-name', passkeys: 'acctPasskeyList', password: 'acctPasswordError', phone: 'acctPhoneState', email: 'acctAliasList' },
  team: { members: 'card-team-members', invite: 'card-team-invite' },
  licensing: { account: 'card-licensing-account', tenant: 'card-licensing-tenant', agreement: 'card-licensing-agreement', mail: 'card-licensing-mailboxes', mailboxes: 'card-licensing-mailboxes' }
};
/** Keep a card for its section to open once it has painted (the same note a card link in the address leaves). */
function keepOpenCard(section, card) {
  try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify({ section, card, row: '' })); } catch { /* the section still opens */ }
}
const CARD_TRIES = 24;   // about six seconds for the card
const ROW_TRIES = 56;    // about fourteen in all for its row
function consumeOpenCard(sectionId) {
  if (!hasLiveSession()) return;   // signed out, the card waits for the sign-in that lands here
  let want = null;
  try { want = JSON.parse(sessionStorage.getItem('pragoptics_open_card') || 'null'); } catch { want = null; }
  if (!want || (want.section && want.section !== sectionId)) return;
  try { sessionStorage.removeItem('pragoptics_open_card'); } catch { /* fine */ }
  let id = (CARD_IDS[sectionId] || {})[String(want.card || '')] || '';
  // The guided licensing wizard (2026-10-03) is one card for steps 1 to 5 (card-licensing-wizard); the per-step cards
  // (account, tenant, agreement, mail) exist again only in the management view. A step with no card of its own, the
  // sign-in and the connection, falls back to the wizard card so a licensing step link always has somewhere to go.
  if (sectionId === 'licensing' && !id) id = 'card-licensing-wizard';
  if (!id) return;
  const row = String(want.row || '');
  const flash = (el) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 2600);
  };
  let tries = 0, cardShown = false;
  const tick = () => {
    if (activeSection !== sectionId) return;   // the person moved on: nothing scrolls them back
    tries += 1;
    // The id names the card's wrapper (evConnections holds the card) or something inside a card (acctPricing). The
    // element is found again on every pass: the section and each card repaint as their reads land. While the licensing
    // wizard card is on screen, every licensing step scrolls to it rather than to a per-step card that is gone.
    const el = (sectionId === 'licensing' ? document.getElementById('card-licensing-wizard') : null) || document.getElementById(id);
    const card = el && (el.matches('.acct-card') ? el : (el.querySelector(':scope > .acct-card') || el.closest('.acct-card') || el));
    if (!card) { if (tries < CARD_TRIES) setTimeout(tick, 250); return; }
    if (!cardShown) { openCardOf(card); flash(card); cardShown = true; }
    if (!row) return;
    const r = card.querySelector(`[data-row="${CSS.escape(row)}"]`);
    if (r) { flash(r); return; }
    if (tries < ROW_TRIES) setTimeout(tick, 250);
  };
  setTimeout(tick, 150);
}

export function presetAccountSection(id) {
  const all = [...customerSections(), ...internalSections()];
  if (!all.some(s => s.id === id)) return;
  // Render immediately only when the panel is actually on screen. When the
  // caller is about to setAppMode('account'), onAccountEnter renders once;
  // rendering here too double-fetched every section that loads data.
  const visible = mounted && !document.getElementById('accountView')?.classList?.contains('hidden');
  if (visible) showSection(id); else activeSection = id;
}

export function initAccountView() {
  // Lets other surfaces (the tier gallery) land on a section without
  // importing this module.
  window.presetAccountSection = presetAccountSection;
  // The join page's "Open Team" lands here. Team lives in this panel only,
  // never in the header menu (Cameron, 2026-09-09).
  window.openTeamFromMenu = () => { presetAccountSection(TEAM_ON ? 'team' : 'profile'); window.setAppMode?.('account'); };
  $body = document.getElementById('accountBody');
  if (!$body) return;
  bindOnce();
  // Deep link from the warranty success screen: jump to a named section.
  window.addEventListener('pragoptics:account-section', (e) => {
    presetAccountSection(e?.detail);
  });
}

// The two ways a load lands in the panel (the sign-in's own landing and the address bar's route) arrive within a moment
// of each other; the second found the same section already rendering and fetched all of it again (2026-09-23,
// Profile read its lists twice, the address list four times). A second entry into the same section inside this
// window is the same visit.
const ENTER_WINDOW_MS = 1500;
let lastEnter = { id: '', at: 0 };

export function onAccountEnter() {
  if (!$body) return;
  syncUserTheme();
  if (!hasLiveSession()) {
    $body.innerHTML = '';
    mounted = false;
    window.openLoginModal?.() || window.setAppMode?.('landing');
    return;
  }
  // Remount when admin-ness changed (a different user signed in): the sidebar
  // groups must never leak between identities.
  const admin = isAdmin();
  if (mounted && mountedAsAdmin !== admin) { mounted = false; cache.users = null; }
  if (!mounted) {
    // A preset internal section (the queue, from /#account?section=buildsqueue on a reload) is kept while the ping that
    // says who this is has not landed yet; showSection demotes it only once the answer is known (2026-09-21, Cameron
    // reloaded on the Builds queue and landed on Profile).
    const known = [...customerSections(), ...internalSections()];
    if (!known.some(s => s.id === activeSection) || (cachedPing() && !allSections().some(s => s.id === activeSection))) activeSection = 'profile';
    // a fresh mount may be a different person: the role on the team in view is read again (the entry stays hidden until then)
    teamRole = { userId: '', teamId: '', role: '' }; roleReadError = '';
    $body.innerHTML = shellHtml();
    mounted = true;
    mountedAsAdmin = admin;
    lastEnter = { id: '', at: 0 };
    // the role on the team in view, for the Licensing entry; Team and Environment read the same view themselves, and a
    // preset Licensing waits for this same read (showSection)
    if (activeSection !== 'team' && activeSection !== 'environment') ensureTeamRole();
  }
  const now = Date.now();
  if (lastEnter.id === activeSection && now - lastEnter.at < ENTER_WINDOW_MS) return;
  lastEnter = { id: activeSection, at: now };
  showSection(activeSection);
}
