// src/shop/launchInterest.js
//
// "NOTIFY ME AT LAUNCH" LANDS ON THE PLATFORM (2026-11-15). Until tonight the sign-up wrote the email into the visitor's own
// browser and showed "You're on the list"; nobody was told. pragoptics.com is the platform itself, so the sign-up is platform
// business, kept and told like an order or a support request: POST v1/shop/interest behind the platform's own captcha
// (api/intakeDoor.js: the challenge solved ahead, used once; the honeypot), a row in the platform's ShopInterest table, the
// operators mailed through the notifier (event shop.interest), the rows on the admin view's Launch interest desk.
import { PRAG_API_BASE } from '../runtime/config.js';
import { postWithProof, warmProof } from '../api/intakeDoor.js';

export const LAUNCH_INTEREST = Object.freeze({ url: `${PRAG_API_BASE}/shop/interest`, challenge: `${PRAG_API_BASE}/shop/interest/challenge` });

/** The fields a sign-up sends: the product by name and id, the visitor's email and name, the page they were on. Pure. */
export function interestFields({ product, email, name = '', page = '' } = {}) {
  const out = {};
  const pid = String(product?.id || product || '').trim().slice(0, 80);
  const pname = String(product?.name || '').trim().slice(0, 120);
  if (pname) out.product = pname;
  if (pid) out.product_id = pid;
  const em = String(email || '').trim().slice(0, 200);
  if (em) out.email = em;
  const nm = String(name || '').trim().slice(0, 120);
  if (nm) out.name = nm;
  const pg = String(page || '').trim().slice(0, 200);
  if (pg) out.page = pg;
  return out;
}

/** Whether an address looks like an email, the same loose check the form used. */
export function looksLikeEmail(v) { return /^\S+@\S+\.\S+$/.test(String(v || '').trim()); }

/** What the visitor reads when a sign-up did not go through: the platform's own sentence, else a plain one. */
export function failureWords(err) {
  if (err && err.platform && err.message) return `${err.message}`;
  return 'That did not go through. Check your connection and try again, or email support@bridgesindust.com.';
}

/** Fetch and solve the door's challenge as the form appears, so the send is instant. */
export function warmLaunchAlerts() { warmProof(LAUNCH_INTEREST.challenge); }

/** The sign-up, sent to the platform. Resolves { ok, ref }; throws with the words for the visitor on `words`. */
export async function submitLaunchInterest({ product, email, name, page, hp = '' } = {}) {
  try { return await postWithProof(LAUNCH_INTEREST.url, interestFields({ product, email, name, page }), { challengeUrl: LAUNCH_INTEREST.challenge, hp }); }
  catch (err) { err.words = failureWords(err); throw err; }
}
