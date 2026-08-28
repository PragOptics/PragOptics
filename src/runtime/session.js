// The session lives entirely in sessionStorage. Everything in localStorage is
// the customer's own work - cart, warranty and builds queues, pending
// reservations, account-link intents - so signing out must not touch it.
// This used to call localStorage.clear(), which silently emptied the cart.
const SESSION_KEYS = ["pragoptics_tokens", "pragoptics_ping"];

export function logout() {
  for (const k of SESSION_KEYS) {
    try { sessionStorage.removeItem(k); } catch {}
  }

  // Return user to PragOptics in a signed-out state
  window.location.replace('/');
}