// src/components/cookieNotice.js
//
// The storage notice. PragOptics sets no cookies of its own and runs no
// analytics or advertising; what it keeps lives in this browser's storage and
// exists so the site works: the cart, the sign-in session, the theme choice,
// and short-lived hand-offs between steps. Two third parties can set cookies,
// each only on the visitor's own action: Stripe when a payment step opens
// (Stripe.js is not loaded before that, see runtime/stripeLoader.js) and
// YouTube when a video is played (youtube-nocookie, poster first).
//
// Because nothing optional is stored, the notice informs and is acknowledged
// once; it does not pretend to offer a choice that does not exist. The footer
// "Cookies" link reopens it, and Details opens the Privacy policy, which
// carries the full inventory.

const SEEN_KEY = 'pragoptics_storage_notice_v1';
const VERSION = 1;

function seen() {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
    return !!v && Number(v.v) === VERSION;
  } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ v: VERSION, at: new Date().toISOString() })); } catch { /* fine */ }
}

function html() {
  return `
    <div class="cn-card glass" role="region" aria-label="Storage notice">
      <div class="cn-body">
        <span class="cn-kicker">Cookies and storage</span>
        <p class="cn-text">PragOptics sets no cookies of its own and runs no analytics or advertising. Your browser keeps only what the site needs
          to work: your cart, your sign-in session, and your theme choice. Stripe sets its own fraud-prevention cookies only when you reach a
          payment step, and a video loads YouTube only when you press play.</p>
      </div>
      <div class="cn-actions">
        <button class="btn btn-sm" type="button" data-legal="privacy" title="Opens the Privacy policy, which lists everything stored and why">Details</button>
        <button class="cta btn-sm" type="button" data-cn-ok>Got it</button>
      </div>
    </div>
  `;
}

let host = null;

function show() {
  if (!host) {
    host = document.createElement('div');
    host.id = 'storageNotice';
    host.className = 'cn-host';
    document.body.appendChild(host);
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-cn-ok]')) { markSeen(); hide(); }
      // Details opens the Privacy policy through the legal viewer's own
      // delegate; the notice stays until Got it is pressed.
    });
  }
  host.innerHTML = html();
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add('is-in'));
}

function hide() {
  if (!host) return;
  host.classList.remove('is-in');
  setTimeout(() => { if (host) host.hidden = true; }, 220);
}

/** Show the notice once per browser (per notice version). */
export function initCookieNotice() {
  if (!seen()) show();
  // The footer "Cookies" link, and anything else, can reopen it.
  window.openStorageNotice = show;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-storage-notice]');
    if (a) { e.preventDefault(); show(); }
  });
}
