    /*bootsrap.js*/
    
    import { initDnaSwirl, registerLegacyGlobals } from './router.js';
    import { logout } from './session.js';
    import { openLoginModal, closeLoginModal } from '../ui/login.modal.js';
    import { submitNativeLogin } from '../auth/native.js';
    import { initStarfield } from '../components/starfield.js';
    import { initAgreementModal } from '../components/agreement.modal.js';
    import { fetchJsonWithDna as fetchJson } from '../api/apiWithDna.js';
    import { initLandingExpanders } from '../components/landing.expanders.js';
    import { initDropdownMenu } from '../components/dropdown.js';
    import { toggleViewerMode, setOutput } from '../components/responseViewer.js';
    import { setAppMode, ensureWizardVisibleAndBranded } from '../runtime/appRouter.js';
    import { formatPhone, gotoStep1, gotoStep2, gotoStep3, gotoStep4, gotoStep5, syncWizardAuthIndicator, initPostLoginWizard, buildRequestedSubscription } from "../wizard/index.js";
    import { handleBillingProfile, startPaymentStep, pollUntilResolved } from "../api/billing.js";
    import { setDnaMode } from "../components/dnaController.js";
    import { showStatusModal } from "../components/statusModal.js";
    import { promptForCode } from "../auth/twoFactorFlow.js";
    import { initHeaderMenu } from '../components/header.menu.js';
    import { initWizardNavigation } from '../wizard/wizard.controller.js';
    import { initConsoleController } from '../components/console.controller.js';
    import { initWizardForms } from '../wizard/forms.controller.js';
    import { initModalControls } from '../components/modal.controller.js';
    import { loadView } from './viewLoader.js';
    import { setHelixSpeedMul } from '../components/dna_swirl.speed.controller.js';
    import { resolvePostLoginUI } from "../runtime/postLoginResolver.js";
    import { initFooter } from '../components/footer.js';
    import { initLegalViewer } from '../components/legalViewer.js';
    import { initBrochureViewer } from '../components/brochureViewer.js';
    import { renderHardwareGallery } from '../shop/gallery.js';
    import { renderFeaturedProducts } from '../shop/featured.js';
    import { renderSoftwareGallery } from '../shop/software.js';
    import { openProductModal, closeProductModal, initProductModal } from '../shop/product-modal.js';
    import { openCart, closeCart, initCartDrawer } from '../shop/cart-drawer.js';
    import { addItem as cartAddItem } from '../shop/cart.js';
    import { initCheckoutView, onCheckoutEnter } from '../shop/checkout.js';
    import { initWarrantyView, onWarrantyEnter } from '../warranty/warranty.js';
    import { initBuildsView } from '../builds/builds.js';
    import { initAdminView, onAdminEnter, refreshAdminNav } from '../admin/admin.js';
    import { initAccountView, onAccountEnter, presetAccountSection } from '../account/account.js';
    import { PRAG_API_BASE, LANE } from './config.js';
    import { consumeLaneSigninFlag, consumeLaneVerifier, consumeLaneHandoff } from './lane.js';

    // routePostLogin is now a thin forwarder only
    function routePostLoginForward({ ping }) {
      applyPostLoginResolution({ ping });
    }
    
    
    // Every view mounts into its own host and none reads another, so these
    // load in parallel. They used to be 14 sequential awaits, each waiting on
    // the last, which put roughly 1.5s of pure round-trip latency in front of
    // first paint.
    await Promise.all([
      loadView('/views/header.view.html', 'view-header'),
      loadView('/views/background.view.html', 'view-bg'),
      loadView('/views/landing.view.html', 'view-landing'),
      loadView('/views/wizard.view.html', 'view-wizard'),
      loadView('/views/console.view.html', 'view-console'),
      loadView('/views/shop.view.html', 'view-shop'),
      loadView('/views/software.view.html', 'view-software'),
      loadView('/views/checkout.view.html', 'view-checkout'),
      loadView('/views/warranty.view.html', 'view-warranty'),
      loadView('/views/builds.view.html', 'view-builds'),
      loadView('/views/admin.view.html', 'view-admin'),
      loadView('/views/account.view.html', 'view-account'),
      loadView('/views/modals/modals.view.html', 'view-modals'),
      loadView('/views/legal.view.html', 'view-legal'),
      loadView('/views/footer.view.html', 'view-footer')
    ]);

    // background exists now, so the starfield can bind to its canvas
    requestAnimationFrame(() => {
      initStarfield({
        canvasId: "bg-stars",
        starCount: 160
      });
    });
    initLegalViewer({
      termsPath: "/docs/PragOptics-Subscriber-Agreement.md",
      privacyPath: "/docs/PragOptics-Privacy.md",
      licensePath: "/docs/omni-LICENSE.md"
    });

    initBrochureViewer({ src: "/docs/brochure-view.html" });

    initFooter();

    initHeaderMenu();

    // Shop: render the hardware + software galleries into their view shells,
    // wire the detail modal, cart drawer, and checkout page.  Exposing the
    // three action handlers on window lets header.menu.js dispatch to them
    // without needing to import the modules.
    renderHardwareGallery('shopGallery');
    renderFeaturedProducts('featuredProducts');
    renderSoftwareGallery('softwareGallery');
    initProductModal();
    initCartDrawer();
    initCheckoutView();
    initWarrantyView();
    initBuildsView();
    initAdminView();
    initAccountView();
    window.openProductModal  = openProductModal;
    window.closeProductModal = closeProductModal;
    window.openCart          = openCart;
    window.closeCart         = closeCart;
    window.addToCart         = (pid, variant) => cartAddItem(pid, variant || null, 1);
    window.onEnterMode       = (mode) => {
      if (mode === 'checkout') onCheckoutEnter();
      if (mode === 'warranty') onWarrantyEnter();
      if (mode === 'admin') onAdminEnter();
      if (mode === 'account') onAccountEnter();
    };

    const _mountSwirl = () => {
      // one frame later ensures layout metrics exist
      requestAnimationFrame(() => initDnaSwirl?.());
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _mountSwirl, { once: true });
    } else {
      _mountSwirl();
    }

    initWizardNavigation();

    initLandingExpanders();

    initWizardForms();

    initModalControls();

        // snapshot wizard DOM so we can restore it if anything ever wipes platformFlow
    const __flow = document.getElementById("platformFlow");
    if (__flow && !window.__wizardFlowMarkup) {
      window.__wizardFlowMarkup = __flow.innerHTML;
    }


    /* ===========================
       CONFIG
       =========================== */
    // PRAG_API_BASE comes from ./config.js (lane switch: dev vs live)
    const PING_URL        = `${PRAG_API_BASE}/ping`;
    const AUTH_URL        = `${PRAG_API_BASE}/auth`;
    const BILLING_PROFILE_URL  = `${PRAG_API_BASE}/billing/profile`;
    const CHECKOUT_SESSION_URL = `${PRAG_API_BASE}/billing/checkout-session`;
    const AGREEMENT_MD_URL = "/docs/PragOptics-Subscriber-Agreement.md";
    const STRIPE_PORTAL_LOGIN_URL = "https://billing.stripe.com/p/login/4gM00beIf91O1Kzc3DdjO00";


    initConsoleController({
      apiBase: PRAG_API_BASE,
      getStoredTokens
    });

    /* ===========================
       CONTINUE WITH FREE
       =========================== */
    // Free is a real destination, not a wizard failure. A signed-in owner
    // with no billing profile who chose "Continue with Free" lands in the
    // console on later loads instead of being marched back to step 1. The
    // choice is keyed per user so a shared browser never inherits another
    // account's answer, and a storage failure reads as "not chosen": the
    // wizard is the safe default. Declared ahead of the rehydrate below,
    // which already resolves a stored ping.
    let lastPing = null;

    function freeContinueKey(ping) {
      return 'pragoptics_free_continue_v1:' + (ping?.user?.userId || '');
    }

    function readFreeContinue(ping) {
      try { return localStorage.getItem(freeContinueKey(ping)) === '1'; }
      catch { return false; }
    }

    function writeFreeContinue(ping) {
      try { localStorage.setItem(freeContinueKey(ping), '1'); }
      catch { /* storage blocked: the choice holds for this page only */ }
    }

    function cachedPing() {
      try {
        const p = JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null');
        if (p) return p;
      } catch { /* fall through to the last ping this page resolved */ }
      return lastPing;
    }

    // The console branch of applyPostLoginResolution, shared so the Free
    // path enters the console exactly the way an active subscriber does.
    function enterConsole(banner = null) {
      setAppMode("console");
      const flow = document.getElementById("platformFlow");
      if (flow) {
        flow.style.display = "none";
      }
      window.setConsoleAuthenticated?.();
      renderConsoleBanner(banner);
    }

    // A slim, dismissible notice on console landing. Today it carries only the
    // past-due nudge: a customer whose renewal failed lands working but is told,
    // with a one-click route to Billing, instead of finding out at the next
    // failed charge. A bottom bar, so it never fights the fixed site header.
    function renderConsoleBanner(kind) {
      document.getElementById("pragConsoleBanner")?.remove();
      if (kind !== "past-due") return;
      const bar = document.createElement("div");
      bar.id = "pragConsoleBanner";
      bar.setAttribute("role", "status");
      bar.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:1200;display:flex;gap:12px;align-items:center;" +
        "justify-content:center;flex-wrap:wrap;padding:10px 16px;background:rgba(239,95,107,0.16);" +
        "border-top:1px solid rgba(239,95,107,0.45);color:#ffd7db;font:600 0.85rem system-ui,sans-serif;";
      const msg = document.createElement("span");
      msg.textContent = "Your last payment did not go through. Update your payment method to keep your subscription active.";
      const manage = document.createElement("button");
      manage.type = "button";
      manage.textContent = "Manage billing";
      manage.style.cssText =
        "cursor:pointer;border:1px solid rgba(239,95,107,0.6);background:rgba(239,95,107,0.2);" +
        "color:#ffd7db;border-radius:8px;padding:5px 12px;font:inherit;";
      manage.onclick = () => {
        document.getElementById("pragConsoleBanner")?.remove();
        window.presetAccountSection?.("subscription");
        window.setAppMode?.("account");
      };
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.setAttribute("aria-label", "Dismiss");
      dismiss.textContent = "✕";
      dismiss.style.cssText = "cursor:pointer;border:none;background:transparent;color:#ffd7db;font:inherit;";
      dismiss.onclick = () => document.getElementById("pragConsoleBanner")?.remove();
      bar.append(msg, manage, dismiss);
      document.body.appendChild(bar);
    }

    function continueWithFree() {
      const ping = cachedPing();
      writeFreeContinue(ping);
      // The wizard menu entry stays: a plan is one click away from the same
      // menu, and that route forces the wizard open regardless of this choice.
      setWizardMenuVisible(true);
      enterConsole();
    }

    // ✅ Rehydrate API console auth state from stored ping/token
    try {
      const storedTokens = getStoredTokens();
      const storedPing = JSON.parse(
        sessionStorage.getItem("pragoptics_ping") || "null"
      );

      if (storedTokens?.access_token && storedPing) {
        window.setConsoleAuthenticated?.();
        applyPostLoginResolution({ ping: storedPing });
      }
    } catch {
      // noop – console will remain unauthenticated
    }
    /* ===========================
       STATE
       =========================== */
    let pragopticsToken = null;
    // ✅ wizard lifecycle guard (authoritative)
    window.__wizardInit = false;


// ✅ authRouter contract: bootstrap owns token persistence
function setToken(tokens) {
  pragopticsToken = tokens?.access_token || null;

  if (tokens) {
    sessionStorage.setItem(
      "pragoptics_tokens",
      JSON.stringify(tokens)
    );
  } else {
    sessionStorage.removeItem("pragoptics_tokens");
  }
}
    /* ===========================
       NAV / ENTRY
       =========================== */
    const navLaunchBtn = document.getElementById("navLaunch");
    if (navLaunchBtn) {
      navLaunchBtn.addEventListener("click", openAgreementModal);
    }
    /* ===========================
       DROPDOWN MENU (same behavior as devconsole)
       =========================== */
       initDropdownMenu();

    // Mark which lane this browser is on so lane-specific UI can react in CSS.
    // Public signup is a LIVE-only path; on dev the entry points are hidden
    // (and the route is refused server-side regardless).
    try { document.documentElement.setAttribute('data-lane', LANE); } catch {}




    /* ===========================
       TOKENS
       =========================== */
    function getStoredTokens() {
      try { return JSON.parse(sessionStorage.getItem("pragoptics_tokens") || "null"); }
      catch { return null; }
    }

    function isAccessTokenValid() {
      try {
        const raw = sessionStorage.getItem("pragoptics_tokens");
        if (!raw) return false;

        const { access_token } = JSON.parse(raw);
        if (!access_token) return false;

        const parts = access_token.split(".");
        if (parts.length < 2) return false;

        // base64url -> base64 (+ padding)
        let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";

        const payload = JSON.parse(atob(b64));
        const now = Math.floor(Date.now() / 1000);

        return Number(payload.exp) > now;
      } catch {
        return false;
      }
    }

    function isSessionActive() {
      return !!getStoredTokens()?.access_token && isAccessTokenValid();
    }

    function getWizardMenuEl() {
      return document.getElementById("navWizard");
    }

    function setWizardMenuVisible(on) {
      const el = getWizardMenuEl();
      if (!el) return;
      el.classList.toggle("hidden", !on);
    }

    function invalidateSession(reason = "expired") {
    // Clear all privileged UI
    clearAllWizardSurfaces();
    setWizardMenuVisible(false);

    // Reset auth indicator explicitly
    const indicator = document.getElementById("authIndicator");
    if (indicator) indicator.classList.remove("signed-in");

    // Restore landing CTAs (Get Started)
    document.querySelectorAll(".hero .cta").forEach(el => {
      el.classList.remove("hidden");
    });

    // Reset stored auth (frontend-only; backend remains authoritative)
    sessionStorage.removeItem("pragoptics_tokens");

    // Drop any lane override too, so an expired session on the dev lane returns
    // this browser to its host default (live on pragoptics.com) on next load,
    // rather than stranding it on the sandbox. localStorage cart/queues stay.
    try { localStorage.removeItem("pragoptics_lane_override"); } catch {}

    // The token is gone, so Login must come back and Logout/Admin must go.
    // logout() reloads the page and boot handles it, but expiry does not
    // reload, so refresh the nav here too.
    refreshAdminNav();

    // Return app to safe baseline
    setAppMode("landing");

    // User feedback (once per action)
    //
    // "suspended" is the operator suspending an account that is ALREADY signed
    // in. The backend refuses every authenticated call the moment the status
    // flips (auth/getUser.js blocks the status and the patch bumps the session
    // epoch), but the console used to just fill with per-section "not
    // available" tiles. Say it once, in the same words sign-in uses, and put
    // the user back on the landing page signed out.
    if (reason === "suspended") {
      showStatusModal({
        mode: "error",
        message: "This account is suspended. Contact support@bridgesindust.com."
      });
    } else if (reason === "expired") {
      showStatusModal({
        mode: "info",
        message: "Your session has expired. Please sign in again."
      });
    }
  }

    function updateWizardMenuFromPing(ping) {
      // expired token → wizard is meaningless
      if (!isSessionActive()) {
        setWizardMenuVisible(false);
        return { mode: "expired" };
      }

      const decision = resolvePostLoginUI({ ping });
      const needsWizard = decision.mode === "wizard";

      setWizardMenuVisible(needsWizard);
      return decision;
    }

    // make it available to all view controllers
    window.isAccessTokenValid = isAccessTokenValid;

    /* ===========================
       AGREEMENT MODAL
       =========================== */
       
      const agreement = initAgreementModal({ agreementUrl: AGREEMENT_MD_URL }) || {};
      const openAgreementModal  = agreement.openAgreementModal  || (() => {});
      const closeAgreementModal = agreement.closeAgreementModal || (() => {});
      const submitAgreementAck  = agreement.submitAgreementAck  || (() => {});


    /* ===========================
       LOGIN + CALLBACK
       =========================== */

/* Sign-in is the modal on this page: openLoginModal -> submitNativeLogin.
   launchLogin used to redirect the browser to the CIAM authorize URL and take
   the session back through ?authResult=. Both halves of that flow are gone. */
function launchLogin() {
  openLoginModal();
}


// force: an explicit "open the wizard" from the menu. It bypasses the
// Continue-with-Free gate so that route always mounts the wizard.
function applyPostLoginResolution({ ping, force = false }) {
  if (!isSessionActive()) {
    invalidateSession("expired");
    return;
  }

  if (ping) lastPing = ping;

  // Internal-only nav follows the freshly resolved identity.
  refreshAdminNav();


  const decision = updateWizardMenuFromPing(ping);
  const token = getStoredTokens()?.access_token;

  // Always start by cleaning secondary UI
  clearBillingLandingOnly();

  // A Free owner who already chose "Continue with Free" goes to the console,
  // not back to step 1. Only the first-run shape is gated: a billing profile
  // in any state, a canceled banner, and the finalizing step (5) always win.
  // The wizard menu entry stays visible (updateWizardMenuFromPing just set it).
  if (
    decision.mode === "wizard" &&
    Number(decision.wizardStep) === 1 &&
    !decision.banner &&
    !ping?.billingProfile &&
    !force &&
    readFreeContinue(ping)
  ) {
    enterConsole();
    return;
  }

  if (decision.mode === "wizard") {
    ensureWizardStepsPresent();

    setAppMode("wizard");

    showWizardFlow();

    // ✅ single, deterministic init gate
    if (!window.__wizardInit) {
      initPostLoginWizard(token, ping);
      window.__wizardInit = true;
    }
    
    syncWizardAuthIndicator();

    ensureWizardVisibleAndBranded(ping, {
      title: "PragOptics™ Billing",
      hint:
        decision.banner === "canceled"
          ? "Your subscription was canceled. Restart billing anytime."
          : decision.urgent
          ? "Payment action required."
          : "Manage your subscription and billing details.",
      hasTokens: !!token
    });

    if (decision.banner === "canceled") {
      showCanceledBanner();
    }

    if (decision.wizardStep) {
  const step = Number(decision.wizardStep);

  if (step === 1) gotoStep1();
  else if (step === 2) gotoStep2();
  else if (step === 3) gotoStep3();
  else if (step === 4) gotoStep4();
  else if (step === 5) gotoStep5();
}

    if (decision.dna) {
      setDnaMode(
        decision.dna.speed,
        decision.dna.title,
        decision.dna.subtitle
      );
    }

    return;
  }


  if (decision.mode === "billingLanding") {
    // Billing is managed natively in the account panel now; the old
    // read-only billing landing surface is gone.
    presetAccountSection('subscription');
    setAppMode('account');
    return;
  }

  if (decision.mode === "console") {
    enterConsole(decision.banner);
    return;
  }
}

window.applyPostLoginResolution = applyPostLoginResolution;



  /* Removed: handlePragOpticsCallback().

     It ran on every page load, read an authResult parameter out of the URL,
     and called setToken() with whatever tokens that JSON contained. Nothing
     checked where the value came from, and it was dug out of three different
     places in the query string, so it was hard NOT to trigger.

     Anyone could therefore hand a customer a link to this site carrying their
     own access token and have the browser adopt it as the session. The
     customer sees a normal signed-in page and keeps working - billing address,
     phone, warranty registration - into an account that belongs to the
     attacker, who reads it at leisure. Classic session fixation.

     It existed to receive the CIAM redirect. That flow is gone; the login
     modal posts credentials and gets a token in the response body, which
     never puts a session in a URL. */


    /* ===========================
       DEV CONSOLE FUNCTIONS
       =========================== */

    async function callPragOpticsAuth() {
      try {
        const stored = getStoredTokens();
        const accessToken = stored?.access_token;
        const data = await fetchJson(AUTH_URL, { headers: accessToken ? { Authorization:`Bearer ${accessToken}` } : {} });
        setOutput({ endpoint: "/auth", response: data });
      } catch (e) {
        setOutput({ endpoint: "/auth", error: e.message || String(e) });
      }
    }

    async function callPragOpticsPing() {
      try {
        const stored = getStoredTokens();
        const accessToken = stored?.access_token;
        const data = await fetchJson(PING_URL, { headers: accessToken ? { Authorization:`Bearer ${accessToken}` } : {} });
        setOutput({ endpoint: "/ping", response: data });
      } catch (e) {
        setOutput({ endpoint: "/ping", error: e.message || String(e) });
      }
    }




      // ===========================
      // LANDING CTA GATING
      // ===========================

    function isUserLoggedIn() {
      try {
        const tokens = getStoredTokens();
        return !!tokens?.access_token;
      } catch {
        return false;
      }
    }


    if (isUserLoggedIn()) {
      document.querySelectorAll(".hero .cta").forEach(el => {
        el.classList.add("hidden");
      });
    }

    /* ===========================
       BOOT
       =========================== */

    setAppMode("landing");

    // Deep-link support: codex/app links use "/#mode=shop" etc. Parse the hash
    // on load and route to that surface so those links land correctly instead
    // of always showing landing.
    (function routeFromHash() {
      const m = String(location.hash || "").match(/mode=(landing|console|shop|software|checkout|warranty|builds|admin)/);
      if (m) setAppMode(m[1]);
      // Warranty-card short link: /#warranty (with optional &device=)
      else if (/^#warranty/i.test(String(location.hash || ""))) setAppMode("warranty");
      // Ownership-transfer short link: /#transfer (same page, transfer mode)
      else if (/^#transfer/i.test(String(location.hash || ""))) setAppMode("warranty");
      // Redemption short link: /#redeem (same page, redeem mode; used by the
      // replacement-card email)
      else if (/^#redeem/i.test(String(location.hash || ""))) setAppMode("warranty");
    })();

    // A SEAMLESS lane switch just landed: redeem the one-time handoff token for
    // a fresh session on THIS lane - no password. Falls back to sign-in if the
    // token is stale/rejected.
    const __handoff = consumeLaneHandoff();
    const __verifier = consumeLaneVerifier();
    if (__handoff) {
      (async () => {
        try {
          // The target lane requires a code from ITS authenticator before it
          // redeems a handoff, so a compromise of one lane can never mint a
          // session on the other. Ask for it up front: the handoff is single
          // use and is burned by the redeem call, so a wrong or missing code
          // costs a fresh switch rather than a retry.
          const code = await promptForCode({
            title: "Confirm it's you on this lane",
            sub: "Enter the 6-digit code from your authenticator for this lane, or a recovery code."
          });
          if (!code) throw new Error("switch canceled");
          // The verifier proves this is the browser that started the switch;
          // the target lane refuses the token without it.
          const res = await fetch(`${PRAG_API_BASE}/auth/lane/redeem`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: __handoff, verifier: __verifier, code })
          });
          if (!res.ok) throw new Error("handoff rejected");
          const data = await res.json();
          sessionStorage.setItem("pragoptics_tokens", JSON.stringify(data.tokens));
          const pingRes = await fetch(`${PRAG_API_BASE}/ping`, {
            headers: { Authorization: `Bearer ${data.tokens.access_token}` }
          });
          const ping = await pingRes.json();
          sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));
          window.setConsoleAuthenticated?.();
          applyPostLoginResolution({ ping });
        } catch {
          // Handoff failed: fall back to a plain sign-in on this lane.
          openLoginModal("login");
        }
      })();
    }
    // A FALLBACK lane switch landed (no handoff): open sign-in for a fresh
    // session on THIS lane.
    else if (consumeLaneSigninFlag()) {
      setTimeout(() => openLoginModal("login"), 400);
    }

    // The lane flag lives in the FOOTER's environment chip (footer.js), the
    // established home for environment status. Nothing rides the header.


    /* ===========================
       BILLING
       =========================== */

    function showCanceledBanner() {
  const host = document.getElementById("platformFlow");
  if (!host) return;

    if (host.querySelector("#billingCanceledBanner")) return;

  const banner = document.createElement("div");
  banner.id = "billingCanceledBanner";
  banner.className = "login-panel";
  banner.style.borderColor = "rgba(255,107,107,.45)";
  banner.innerHTML = `
    <strong>Subscription canceled</strong>
    <div class="hint" style="margin-top:6px;">
      Your previous subscription was canceled. You can restart billing at any time.
    </div>
  `;

  host.prepend(banner);
}

    /* Environment provisioning happens in the PragOptics software, not here.
       The front-end wizard ends at the subscription payment step; active
       subscribers resolve straight to the console. */

   async function openBillingFromMenu() {
    if (!isSessionActive()) {
      invalidateSession("expired");
      return;
    }

    // Gate billing behind authentication
    const token = getStoredTokens()?.access_token;
    if (!token) {
      showStatusModal({
        mode: "info",
        message: "Please sign in or click Get Started to access billing."
      });
      return;
    }

    // Refresh the ping so the panel opens on current state, then manage
    // billing NATIVELY in the account panel. The wizard exists only for the
    // first run (no billing profile yet); everything after that - plan,
    // add-ons, card, invoices, cancel - lives on the Billing section.
    try {
      const ping = await fetchJson(PING_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));

      if (!ping?.billingProfile) {
        // Nothing to manage yet: run first-time setup. force: the owner asked
        // for Billing, so an earlier "Continue with Free" must not swallow it.
        window.__wizardInit = false;
        applyPostLoginResolution({ ping, force: true });
        return;
      }
    } catch { /* stale ping is still enough to open the panel */ }

    presetAccountSection('subscription');
    setAppMode('account');
  }

  async function openWizardFromMenu() { 
    if (!isSessionActive()) {
      invalidateSession("expired");
      return;
    }


    const token = getStoredTokens()?.access_token;
    if (!token) {
      showStatusModal({
        mode: "info",
        message: "Please sign in to continue setup."
      });
      return;
    }

    let ping;
    try {
      ping = await fetchJson(PING_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));
    } catch (e) {
      showStatusModal({
        mode: "error",
        message: e?.message || "Unable to check setup status."
      });
      return;
    }

    const decision = updateWizardMenuFromPing(ping);

    // If nothing is required, hide button and notify.
    if (decision.mode === "console" || decision.mode === "none") {
      setWizardMenuVisible(false);
      showStatusModal({
        mode: "success",
        message: "You're all set."
      });
      return;
    }

    // Otherwise launch the billing wizard (the only front-end wizard). force:
    // an explicit menu open always mounts it, "Continue with Free" or not.
    applyPostLoginResolution({ ping, force: true });
  }


    function redirectToStripePortalWithDna(status, ping) {
  const isUrgent = String(status).toUpperCase() === "PAST_DUE";

  ensureWizardVisibleAndBranded(ping, {
    title: "PragOptics™ Billing",
    hint: isUrgent ? "Payment issue detected. Opening Stripe portal…" : "Opening Stripe billing portal…",
    hasTokens: !!getStoredTokens()?.access_token
  });

  gotoStep5();

  setDnaMode(
    isUrgent ? "fast" : "idle",
    isUrgent ? "Redirecting to update payment method…" : "Preparing billing management…",
    "Launching Stripe portal…"
  );

  // Make sure we do NOT hide the flow container
  const flow = document.getElementById("platformFlow");
  if (flow) flow.style.display = "block";

  setTimeout(() => {
    window.location.href = STRIPE_PORTAL_LOGIN_URL;
  }, 5000);
}

function resetForLanding() {
  clearBillingLandingOnly();
  const flow = document.getElementById("platformFlow");
  if (!flow) return;
  flow.style.display = "block";
}

function clearBillingLandingOnly() {
  clearAllWizardSurfaces();
}

function clearAllWizardSurfaces() {
  // Remove any stray billing landing cards that may exist outside #platformFlow
  document.querySelectorAll(".billing-landing").forEach(el => el.remove());

  // Remove banner wherever it ended up
  document.querySelectorAll("#billingCanceledBanner").forEach(el => el.remove());

  // The past-due bar is fixed to the body, outside #platformFlow, so clearing
  // the flow never reached it: suspending a past-due account left "Your last
  // payment did not go through" pinned to the signed-out landing page.
  document.querySelectorAll("#pragConsoleBanner").forEach(el => el.remove());

  const flow = document.getElementById("platformFlow");
  if (!flow) return;

  // Reset the shared container completely
  flow.innerHTML = "";
  flow.style.display = "block";
}

function ensureWizardStepsPresent() {
  const flow = document.getElementById("platformFlow");
  if (!flow) return;

  // if wizard steps were wiped, restore them AND allow rebind
  if (!flow.querySelector("#step1") && window.__wizardFlowMarkup) {
    flow.innerHTML = window.__wizardFlowMarkup;

    // wizard DOM is new again → allow rebind
    flow.__wizardBound = false;
    window.__wizardInit = false;
  }
}

function showWizardFlow() {
  const flow = document.getElementById("platformFlow");
  if (!flow) return;
  flow.style.display = "block";   // ✅ DO NOT clear innerHTML
}

function handleBillingProfileSubmit(e) {
  return handleBillingProfile({
    e,
    getStoredTokens,
    pragopticsToken,
    buildRequestedSubscription,
    BILLING_PROFILE_URL,
    CHECKOUT_SESSION_URL,
    PING_URL,
    setDnaMode,
    gotoStep4,
    gotoStep5,
    pollUntilResolved: pollUntilResolvedSubmit,
    startPaymentStep
  });
}

function pollUntilResolvedSubmit() {
  return pollUntilResolved({
    PING_URL,
    getStoredTokens,
    pragopticsToken,
    setDnaMode,
    onResolved: (ping) => {
      applyPostLoginResolution({ ping });
      window.setConsoleAuthenticated?.();
    }
  });
}



    // Expose only the handlers referenced by inline onclick="..." in index.html
registerLegacyGlobals({
  setToken,
  // menu + navigation
  setAppMode,
  
  // dna helix speed control (debug + orchestration)
  setHelixSpeedMul,


  // agreement modal
  openAgreementModal,
  closeAgreementModal,
  submitAgreementAck,
  openLoginModal,
  closeLoginModal,
  submitNativeLogin,

  routePostLogin: routePostLoginForward,

  // auth / api
  startPragOpticsLogin: launchLogin,   // opens the login modal; no redirect
  logout,
  // Any module holding a token can end the session cleanly: the account console
  // calls this when the API says the account was suspended or the session was
  // revoked mid-session.
  invalidateSession,
  callPragOpticsPing,
  callPragOpticsAuth,

  // billing menu entry
  openBillingFromMenu,
  openWizardFromMenu,
  continueWithFree,

  // console UX
  toggleViewerMode,

  // wizard (inline handlers)
  gotoStep1,
  gotoStep2,
  gotoStep3,
  gotoStep4,
  gotoStep5,
  handleBillingProfile: handleBillingProfileSubmit,
  pollUntilResolved: pollUntilResolvedSubmit,
  formatPhone
});