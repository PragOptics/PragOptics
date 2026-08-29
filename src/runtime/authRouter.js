// src/runtime/authRouter.js
//
// What is left of this module is one function: where to go after a ping
// resolves. The login half is gone.
//
// It used to do two things, and both were the CIAM redirect flow:
//
//   startPragOpticsLogin()      asked the API for an authorize URL and sent
//                               the browser to it
//   handlePragOpticsCallback()  read an "authResult" parameter out of the URL
//                               on every page load and called setToken() with
//                               whatever tokens that JSON contained
//
// The second one was the problem. Nothing checked where the value came from,
// and it was dug out of three separate places in the query string, so it was
// hard not to trigger. Anyone could hand a customer a link to this site
// carrying their own access token and the browser would adopt it as the
// session. The customer sees a normal signed-in page and keeps working -
// billing address, phone number, warranty registration - into an account
// belonging to whoever sent the link, who reads it later at leisure. Session
// fixation, no credential required, no backend involvement at all.
//
// Sign-in is now the modal on the page: ui/login.modal.js collects the
// credentials, auth/native.js posts them to v1/auth/login-password, and the
// token comes back in the response body. A session never travels in a URL,
// which is the property that makes the attack above impossible rather than
// merely patched.

import { setAppMode } from "./appRouter.js";

export function routePostLogin({ ping }) {
  // Auth router no longer owns UI decisions
  // Bootstrap will centrally resolve post-login state
  if (typeof window.applyPostLoginResolution === "function") {
    window.applyPostLoginResolution({ ping });
    return;
  }

  // Defensive fallback
  setAppMode("console");
}
