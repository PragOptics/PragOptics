// src/runtime/lane.js
//
// Switching lanes is switching PLATFORMS: the dev lane has its own database,
// its own JWT secret, and its own Stripe account, so a live session is
// meaningless there (and vice versa). A lane switch is therefore a sign-out
// plus a fresh sign-in on the target lane: tokens and the cached ping are
// cleared, the page reloads with the override in place, and the sign-in modal
// opens so the operator authenticates against the new lane and every
// endpoint, key, and cached response comes back fresh. Nothing runs stale.
//
// Who sees the toggle: platform-level operators only (isAdmin or isDev on the
// OWNER's Users table, read from the ping). That gate is cosmetic like every
// front-end gate here: a visitor who flips the localStorage key by hand has
// simply pointed their own browser at the sandbox API, where every route
// still authenticates server-side against the sandbox's own tables.
//
// The production default is untouchable: on pragoptics.com the lane is live
// unless THIS explicit gesture stored an override, so a committed
// LANE_SETTING can never route customers to the sandbox (config.js).
//
// The switch tries a SEAMLESS handoff first: the source lane vouches for the
// operator with a 60-second single-use token (POST /auth/lane/exchange) which
// the target lane redeems for a fresh session (POST /auth/lane/redeem) - no
// password re-entry when the two accounts are linked. If the handoff is not
// available (no link, not an operator, offline), it falls back to the plain
// sign-out-and-sign-in behavior. Either way the target session is minted
// fresh on the target lane, so nothing runs stale.

import { PRAG_API_BASE } from './config.js';

const OVERRIDE_KEY = 'pragoptics_lane_override';
const SIGNIN_FLAG = 'pragoptics_lane_signin_v1';
const HANDOFF_KEY = 'pragoptics_lane_handoff_v1';
const HANDOFF_VERIFIER_KEY = 'pragoptics_lane_handoff_verifier_v1';

// Proof of possession for the handoff token. The browser mints a 256-bit
// verifier, sends only its sha256 at exchange, keeps the verifier in this
// tab's sessionStorage across the reload, and presents it at redeem. A token
// captured on its own (a log, a proxy, the exchange response) is useless
// without it.
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Platform-level operator on the CURRENT lane's ping: admin or dev. */
export function isPlatformOperator() {
  try {
    const ping = JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null');
    return ping?.user?.isAdmin === true || ping?.user?.isDev === true;
  } catch { return false; }
}

function currentToken() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || null; }
  catch { return null; }
}

function landOnTarget(lane, { handoff, verifier } = {}) {
  try {
    localStorage.setItem(OVERRIDE_KEY, lane);
    sessionStorage.removeItem('pragoptics_tokens');
    sessionStorage.removeItem('pragoptics_ping');
    if (handoff) {
      sessionStorage.setItem(HANDOFF_KEY, handoff);
      if (verifier) sessionStorage.setItem(HANDOFF_VERIFIER_KEY, verifier);
    } else {
      sessionStorage.setItem(SIGNIN_FLAG, '1');
    }
  } catch { /* blocked storage: nothing to clear, fall through to reload */ }
  location.reload();
}

/**
 * Switch this browser to the given lane ('dev' | 'live'). Attempts a seamless
 * handoff from the current lane; falls back to sign-in on the target.
 */
export async function switchLane(lane) {
  if (lane !== 'dev' && lane !== 'live') return;

  const token = currentToken();
  if (token) {
    try {
      const verifier = randomHex(32);
      const bindingHash = await sha256Hex(verifier);
      const res = await fetch(`${PRAG_API_BASE}/auth/lane/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toLane: lane, bindingHash })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.token) { landOnTarget(lane, { handoff: data.token, verifier }); return; }
      }
      // 403 (not an operator) / 409 (not linked) / anything else -> fall back.
    } catch { /* offline etc. -> fall back */ }
  }
  landOnTarget(lane); // plain sign-in on the target lane
}

/** One-shot: a seamless handoff token, if a switch just landed with one. */
export function consumeLaneHandoff() {
  try {
    const t = sessionStorage.getItem(HANDOFF_KEY);
    if (t) { sessionStorage.removeItem(HANDOFF_KEY); return t; }
  } catch { /* fine */ }
  return null;
}

/** One-shot: the verifier bound to the handoff token, if a switch just landed. */
export function consumeLaneVerifier() {
  try {
    const v = sessionStorage.getItem(HANDOFF_VERIFIER_KEY);
    if (v) { sessionStorage.removeItem(HANDOFF_VERIFIER_KEY); return v; }
  } catch { /* fine */ }
  return null;
}

/** One-shot: did a fallback (non-seamless) lane switch just land? */
export function consumeLaneSigninFlag() {
  try {
    if (sessionStorage.getItem(SIGNIN_FLAG) === '1') {
      sessionStorage.removeItem(SIGNIN_FLAG);
      return true;
    }
  } catch { /* fine */ }
  return false;
}
