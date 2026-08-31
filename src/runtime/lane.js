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

const OVERRIDE_KEY = 'pragoptics_lane_override';
const SIGNIN_FLAG = 'pragoptics_lane_signin_v1';

/** Platform-level operator on the CURRENT lane's ping: admin or dev. */
export function isPlatformOperator() {
  try {
    const ping = JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null');
    return ping?.user?.isAdmin === true || ping?.user?.isDev === true;
  } catch { return false; }
}

/**
 * Switch this browser to the given lane ('dev' | 'live'): store the override,
 * end the current session, and reload straight into sign-in on the target.
 */
export function switchLane(lane) {
  if (lane !== 'dev' && lane !== 'live') return;
  try { localStorage.setItem(OVERRIDE_KEY, lane); } catch { return; }
  try {
    sessionStorage.removeItem('pragoptics_tokens');
    sessionStorage.removeItem('pragoptics_ping');
    sessionStorage.setItem(SIGNIN_FLAG, '1');
  } catch { /* a blocked sessionStorage also means no session to clear */ }
  location.reload();
}

/** One-shot: did a lane switch just land? Consumed by bootstrap to open the
 *  sign-in modal on the fresh lane. */
export function consumeLaneSigninFlag() {
  try {
    if (sessionStorage.getItem(SIGNIN_FLAG) === '1') {
      sessionStorage.removeItem(SIGNIN_FLAG);
      return true;
    }
  } catch { /* fine */ }
  return false;
}
