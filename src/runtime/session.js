// The session lives entirely in sessionStorage. Everything in localStorage is
// the customer's own work - cart, warranty and builds queues, pending
// reservations, account-link intents - so signing out must not touch it.
// This used to call localStorage.clear(), which silently emptied the cart.
const SESSION_KEYS = ["pragoptics_tokens", "pragoptics_ping"];

// The ONE localStorage key that is session policy, not the customer's work: the
// lane override pins this browser to a non-default lane (a platform operator's
// dev switch). A sign-out must drop it, or the browser stays stranded on the
// lane it was switched to - so pragoptics.com would keep talking to the dev
// sandbox after logout instead of returning to its live default. Cleared
// surgically; the cart and queues are left untouched.
const LANE_OVERRIDE_KEY = "pragoptics_lane_override";

/**
 * The session's access token, or '' signed out: the one reader of the stored tokens outside bootstrap.js (which writes
 * them). Read at every use and never kept, so a sign-out or a new sign-in is seen at once.
 */
export function accessToken() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEYS[0]) || "null")?.access_token || ""; }
  catch { return ""; }
}

export function logout() {
  for (const k of SESSION_KEYS) {
    try { sessionStorage.removeItem(k); } catch {}
  }
  try { localStorage.removeItem(LANE_OVERRIDE_KEY); } catch {}

  // Return user to PragOptics in a signed-out state
  window.location.replace('/');
}