// src/account/idleGate.js
//
// MAKE A DORMANT SESSION HONEST ON pragoptics.com (Cameron, 2026-11-17 in the studio; asked for the front end 2026-11-18).
// The sliding session in runtime/bootstrap.js trades the token for a fresh one only while the person is active; an idle tab
// lapses on its own, and the page still LOOKS signed in, so you only learn it lapsed on the next action. This gate makes the
// pause visible: after IDLE_MS with no pointer or key, a signed-in session shows "Are you still there?" and holds, however long
// the tab sits, even days. "I'm back" forces a refresh if the session can still be renewed, otherwise opens sign-in. It never
// refreshes on its own. Hooks already on the page: window.isAccessTokenValid() (bootstrap.js) and window.pragRefreshSession()
// (the forced sliding-session refresh), plus the page's own sign-in modal.
import { openLoginModal } from "../ui/login.modal.js";

const IDLE_MS = 30 * 60 * 1000;   // Cameron's 30-minute inactive window

function signedIn() {
  try { return typeof window.isAccessTokenValid === "function" ? !!window.isAccessTokenValid() : false; }
  catch { return false; }
}

export function createIdleGate() {
  let timer = 0, overlay = null, started = false;
  const arm = () => { clearTimeout(timer); timer = setTimeout(dormant, IDLE_MS); };
  const onActivity = () => { if (!overlay) arm(); };   // activity re-arms the window; while the gate is up, only the button resumes

  function dormant() {
    if (overlay || !signedIn()) return;   // only a live, signed-in session goes dormant
    overlay = document.createElement("div");
    overlay.className = "idle-gate";
    overlay.innerHTML = `<div class="idle-card" role="dialog" aria-modal="true" aria-label="Session paused">
        <span class="idle-dot"></span>
        <h3>Are you still there?</h3>
        <p>You have been away, so PragOptics paused this session. Nothing is lost. Pick up right where you left off.</p>
        <button type="button" class="idle-go">I'm back</button>
      </div>`;
    overlay.querySelector(".idle-go").addEventListener("click", resume);
    document.body.appendChild(overlay);
  }

  async function resume() {
    const go = overlay && overlay.querySelector(".idle-go");
    if (go) { go.disabled = true; go.textContent = "One moment..."; }
    let ok = signedIn();
    try {
      if (typeof window.pragRefreshSession === "function") { const r = await window.pragRefreshSession(true); ok = (r && r.refreshed) || signedIn(); }
    } catch { /* fall through to the sign-in fallback */ }
    close();
    if (!ok) { try { openLoginModal("login"); } catch { /* the next real request still decides */ } }
  }

  function close() { if (overlay) { overlay.remove(); overlay = null; } arm(); }

  return {
    start() {
      if (started || typeof document === "undefined") return;
      started = true;
      for (const ev of ["pointerdown", "keydown", "touchstart"]) document.addEventListener(ev, onActivity, { passive: true, capture: true });
      arm();
    }
  };
}
