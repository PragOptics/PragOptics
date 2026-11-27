// One account presentation preference, shared by customer and operator views.
// It changes presentation only; cards and their authorized actions stay intact.
const VIEW_KEY = 'pragoptics_account_view_v1';
let transientView;
export function cardView() {
  if (transientView) return transientView;
  try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'; } catch { return 'list'; }
}
export function cardStateKey() { return cardView() === 'list' ? 'pragoptics_acct_open_list' : 'pragoptics_acct_open'; }
export function cardDefaultOpen(fallback) { return cardView() === 'list' ? false : !!fallback; }
let root = null, observer = null, callbacks = null, queued = false, listening = false;
function sync() {
  queued = false;
  const account = document.getElementById('accountView');
  if (!account) return;
  const mode = cardView(); account.dataset.cardView = mode;
  const main = account.querySelector('#acctMain'); if (!main) return;
  const cards = [...main.querySelectorAll('.ev-card[data-card]')];
  let bar = main.querySelector('[data-card-view-controls]');
  if (!cards.length) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div'); bar.className = 'acct-view-controls';
    bar.setAttribute('data-card-view-controls', ''); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Section view');
    bar.innerHTML = '<span class="acct-view-label">View</span><button type="button" class="btn btn-sm" data-account-view="list">List</button><button type="button" class="btn btn-sm" data-account-view="cards">Cards</button>';
    const header = main.querySelector('.acct-sec-head');
    if (header) header.after(bar); else main.prepend(bar);
  }
  for (const button of bar.querySelectorAll('[data-account-view]')) {
    const on = button.dataset.accountView === mode;
    button.setAttribute('aria-pressed', String(on)); button.classList.toggle('is-on', on);
  }
}
function schedule() { if (!queued) { queued = true; queueMicrotask(sync); } }
export function setCardView(mode) {
  if (!['list', 'cards'].includes(mode)) return;
  transientView = mode;
  try { localStorage.setItem(VIEW_KEY, mode); } catch { /* The default remains usable without storage. */ }
  for (const card of document.querySelectorAll('#accountView .ev-card[data-card]')) {
    callbacks?.apply(card, callbacks.isOpen(card.dataset.card, card.dataset.open !== '0'));
    card.style.gridRowEnd = '';
  }
  sync();
}
export function initCardLayout(handlers) {
  callbacks = handlers;
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
  const account = document.getElementById('accountView');
  if (account && account !== root && typeof MutationObserver !== 'undefined') {
    observer?.disconnect(); root = account;
    observer = new MutationObserver(schedule); observer.observe(root, { childList: true, subtree: true });
  }
  if (!listening) {
    listening = true;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-account-view]');
      if (button) { event.preventDefault(); setCardView(button.dataset.accountView); }
    });
  }
  schedule();
}
