// src/admin/admin.js
//
// The operator console no longer lives on its own page: everything internal
// renders inside THE account panel (src/account/account.js), which appends the
// Internal sidebar group when the ping says isAdmin. This module keeps the
// menu-state logic and turns the old /#mode=admin route into a redirect that
// lands an administrator on the panel's Overview section, so old deep links
// keep working.

import { presetAccountSection } from '../account/account.js';

function cachedPing() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); }
  catch { return null; }
}

function hasLiveSession() {
  // invalidateSession() removes the token but deliberately leaves the cached
  // ping in place, so the ping alone is not evidence of a live session.
  try {
    if (typeof window.isAccessTokenValid === 'function') return window.isAccessTokenValid();
    return !!JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token;
  } catch { return false; }
}

/** Strict boolean, same test the backend applies. Tier is irrelevant, and an
 *  expired session is not an admin session however stale the ping says. */
export function isAdminUser() {
  return hasLiveSession() && cachedPing()?.user?.isAdmin === true;
}

/** Menu state. Called on every ping resolution, so a different user signing
 *  in cannot inherit the previous one's menu. Login and Logout are two states
 *  of one thing; Profile only exists once there is a session to profile. */
export function refreshAdminNav() {
  const signedIn = hasLiveSession();
  document.querySelectorAll('[data-guest-only]').forEach(el => { el.hidden = signedIn; });
  document.querySelectorAll('[data-auth-only]').forEach(el => { el.hidden = !signedIn; });
  // Legacy hook: nothing in the menu is admin-only anymore (the panel itself
  // decides what to show), but keep the attribute honored if one returns.
  document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !isAdminUser(); });
}

export function initAdminView() {
  refreshAdminNav();
}

/** Old route, same destination: /#mode=admin lands an administrator on the
 *  panel's Internal Overview; everyone else goes home. */
export function onAdminEnter() {
  if (isAdminUser()) {
    presetAccountSection('overview');
    window.setAppMode?.('account');
    return;
  }
  window.setAppMode?.('landing');
}
