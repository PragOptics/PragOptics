// src/runtime/userTheme.js
//
// The theme a signed-in person chose follows them: it is remembered on the
// account (v1/account/preferences) and arrives on /ping as user.theme. This
// module applies it the moment a session exists, and marks the page as
// signed in so the footer's public toggle steps aside (the choice then lives
// on the Profile section). Signed out, the footer toggle and the browser's
// own stored choice work exactly as before.
//
//   syncUserTheme()  call after any write of the cached ping, and on the
//                    account panel's entry; safe to call often

import { applyTheme, getTheme } from './theme.js';

function cachedPing() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); }
  catch { return null; }
}
// A session is a token that has not expired. The bootstrap's own check is
// used once it exists; before that (this can run early in boot) the token's
// exp claim is read the same way, so a dead token left in storage never
// counts as signed in.
function hasSession() {
  try {
    if (typeof window.isAccessTokenValid === 'function') return !!window.isAccessTokenValid();
    const token = JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token;
    if (!token) return false;
    const parts = String(token).split('.');
    if (parts.length < 2) return false;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(atob(b64));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

/** Apply the account's remembered theme, if any, and mark the page signed in or out. */
export function syncUserTheme() {
  const signedIn = hasSession();
  try { document.body.classList.toggle('has-session', signedIn); } catch { /* no body yet */ }
  if (!signedIn) return;
  const theme = String(cachedPing()?.user?.theme || '');
  if ((theme === 'light' || theme === 'dark') && theme !== getTheme()) applyTheme(theme);
}

/** The Profile section saved a choice: keep the cached ping honest so a re-sync does not undo it. */
export function rememberUserTheme(theme) {
  try {
    const p = cachedPing();
    if (p && p.user) { p.user.theme = theme; sessionStorage.setItem('pragoptics_ping', JSON.stringify(p)); }
  } catch { /* fine */ }
}
