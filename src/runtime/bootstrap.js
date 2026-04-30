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
    import { startPragOpticsLogin, handlePragOpticsCallback } from "../runtime/authRouter.js";
    import { formatPhone, gotoStep1, gotoStep2, gotoStep3, gotoStep4, gotoStep5, syncWizardAuthIndicator, initPostLoginWizard, buildRequestedSubscription } from "../wizard/index.js";
    import { handleBillingProfile, startPaymentStep, pollUntilResolved } from "../api/billing.js";
    import { setDnaMode } from "../components/dnaController.js";
    import { showStatusModal } from "../components/statusModal.js";
    import { renderBillingLanding } from "../billing/billingLanding.js";
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

    // routePostLogin is now a thin forwarder only
    function routePostLoginForward({ ping }) {
      applyPostLoginResolution({ ping });
    }
    
    
    await loadView('/views/header.view.html', 'view-header');
    await loadView('/views/background.view.html', 'view-bg');
    // background must exist before starfield init
    requestAnimationFrame(() => {
      initStarfield({
        canvasId: "bg-stars",
        starCount: 160
      });
    });

    await loadView('/views/landing.view.html', 'view-landing');
    await loadView('/views/wizard.view.html', 'view-wizard');
    await loadView('/views/console.view.html', 'view-console');
    await loadView('/views/modals/modals.view.html', 'view-modals');
    await loadView('/views/legal.view.html', 'view-legal');
    initLegalViewer({
      termsPath: "/docs/PragOptics-Subscriber-Agreement.md",
      privacyPath: "/docs/PragOptics-Privacy.md"
    });

    await loadView('/views/footer.view.html', 'view-footer');

    initFooter();
   
    initHeaderMenu();

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
    const PRAG_API_BASE   = "https://api.pragoptics.com/api/v1";
    const CIAM_LOGIN_INIT = `${PRAG_API_BASE}/auth/ciam-login`;
    const LOGIN_INIT = `${PRAG_API_BASE}/auth/login`;
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

    // Return app to safe baseline
    setAppMode("landing");

    // User feedback (once per action)
    if (reason === "expired") {
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
      const needsWizard =
        (decision.mode === "wizard" || decision.mode === "provisioningWizard");

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

function launchLogin() {
  return startPragOpticsLogin({
    mode: "password",
    passwordLoginInit: LOGIN_INIT,
    ciamLoginInit: CIAM_LOGIN_INIT
  });
}


function applyPostLoginResolution({ ping }) {
  if (!isSessionActive()) {
    invalidateSession("expired");
    return;
  }


  const decision = updateWizardMenuFromPing(ping);
  const token = getStoredTokens()?.access_token;

  // Always start by cleaning secondary UI
  clearBillingLandingOnly();

  if (decision.mode === "wizard") {
    ensureWizardStepsPresent();

    const flow = document.getElementById("platformFlow");
    if (flow) flow.classList.remove("mode-billing-landing");

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
    showBillingLanding(ping, decision.urgent === true);
    return;
  }

  if (decision.mode === "provisioningWizard") {
    showProvisioningShell(ping);
    return;
  }

  if (decision.mode === "console") {
    setAppMode("console");
    const flow = document.getElementById("platformFlow");
    if (flow) {
      flow.style.display = "none";
    }
    window.setConsoleAuthenticated?.();
    return;
  }
}

window.applyPostLoginResolution = applyPostLoginResolution;



  handlePragOpticsCallback({
    pingUrl: PING_URL,
    setToken,
    onPingResolved: (ping) => {
      applyPostLoginResolution({ ping });
      window.setConsoleAuthenticated?.();
    }
  });


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

    function showBillingLanding(ping, urgent = false) {
      setAppMode("wizard");

      // one authoritative wipe (global + platformFlow)
      clearAllWizardSurfaces();

      const flow = document.getElementById("platformFlow");
      if (!flow) return;

      flow.classList.add("mode-billing-landing");

      ensureWizardVisibleAndBranded(ping, {
        title: "PragOptics™ Billing",
        hint: urgent
          ? "Payment action required."
          : "Manage your subscription and billing details.",
        hasTokens: true
      });

      renderBillingLanding({
        containerId: "platformFlow",
        billingProfile: ping.billingProfile,
        catalog: ping.productCatalog
      });
    }

    function showProvisioningShell(ping) {
      setAppMode("wizard");

      // one authoritative wipe (global + platformFlow)
      clearAllWizardSurfaces();

      const flow = document.getElementById("platformFlow");
      if (!flow) return;

      flow.classList.remove("mode-billing-landing");
      flow.style.display = "block";
      flow.innerHTML = `
        <div class="provisioning-shell">
          <div class="login-panel">
            <h3>Environment Setup</h3>
            <p class="hint">Create your PragOptics environment and define the Azure Table resources your account will use.</p>

            <div class="row">
              <div class="form-field">
                <label for="envDisplayName">Environment Name</label>
                <input id="envDisplayName" type="text" placeholder="PragOptics Environment">
              </div>
              <div class="form-field">
                <label for="envOrgName">Organization Name</label>
                <input id="envOrgName" type="text" placeholder="Optional organization name">
              </div>
            </div>

            <div class="row">
              <div class="form-field">
                <label for="envUsersTable">Users Table</label>
                <input id="envUsersTable" type="text" value="Users">
              </div>
              <div class="form-field">
                <label for="envEnvironmentTable">Environment Table</label>
                <input id="envEnvironmentTable" type="text" value="Environment">
              </div>
            </div>

            <div class="row">
              <div class="form-field">
                <label for="envDataTable">Primary Data Table</label>
                <input id="envDataTable" type="text" placeholder="Your primary table name">
              </div>
              <div class="form-field">
                <label for="envPrefix">Table Prefix</label>
                <input id="envPrefix" type="text" placeholder="Optional naming prefix">
              </div>
            </div>

            <div class="dblStepBtn">
              <button class="btn" type="button" onclick="setAppMode('console')">Back to Console</button>
              <button class="cta" type="button" disabled>Create Environment</button>
            </div>
          </div>
        </div>
      `;

      ensureWizardVisibleAndBranded(ping, {
        title: "PragOptics™ Environment",
        hint: "Provision your environment resources to continue platform setup.",
        hasTokens: true
      });

      syncWizardAuthIndicator();
    }
    
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

    // Always fetch latest ping before routing
    let ping;
    try {
      ping = await fetchJson(PING_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));

      // ✅ Force wizard re-init on menu entry
      window.__wizardInit = false;

    } catch {
      ensureWizardVisibleAndBranded(null, {
        title: "PragOptics™ Billing",
        hint: "Sign in to manage billing.",
        hasTokens: false
      });
      gotoStep1();
      return;
    }

    if (!ping) return;

    const billingStatus = String(ping?.billingProfile?.status || "").toUpperCase();
    const needsBillingSetup = ping?.needsBillingSetup === true;

    // Billing menu must always go to billing surface when billing is already active.
    // Provisioning is irrelevant here.
    if (ping.billingProfile && !needsBillingSetup && (billingStatus === "ACTIVE" || billingStatus === "PAST_DUE")) {
      showBillingLanding(ping, billingStatus === "PAST_DUE");
      return;
    }

    // Otherwise, billing is incomplete → go to billing wizard (safe to reuse standard resolver)
    applyPostLoginResolution({ ping });
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

    // Otherwise launch the next required wizard (billing wizard or provisioning wizard)
    applyPostLoginResolution({ ping });
  }


    function redirectToStripePortalWithDna(status, ping) {
  const isUrgent = String(status).toUpperCase() === "PAST_DUE";

  ensureWizardVisibleAndBranded(ping, {
    title: "PragOptics™ Billing",
    hint: isUrgent ? "Payment issue detected — opening Stripe portal…" : "Opening Stripe billing portal…",
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
  // Remove any stray provisioning shells that may exist outside #platformFlow
  document.querySelectorAll(".provisioning-shell").forEach(el => el.remove());

  // Remove any stray billing landing cards that may exist outside #platformFlow
  document.querySelectorAll(".billing-landing").forEach(el => el.remove());

  // Remove banner wherever it ended up
  document.querySelectorAll("#billingCanceledBanner").forEach(el => el.remove());

  const flow = document.getElementById("platformFlow");
  if (!flow) return;

  // Reset the shared container completely
  flow.classList.remove("mode-billing-landing");
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
  startPragOpticsLogin: launchLogin,
  logout,
  callPragOpticsPing,
  callPragOpticsAuth,

  // billing menu entry
  openBillingFromMenu,
  openWizardFromMenu,

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