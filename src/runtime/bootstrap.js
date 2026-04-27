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
    import { startPragOpticsLogin, handlePragOpticsCallback, routePostLogin } from "../runtime/authRouter.js";
    import { formatPhone, gotoStep1, gotoStep2, gotoStep3, gotoStep4, gotoStep5, initPostLoginWizard, buildRequestedSubscription } from "../wizard/index.js";
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
  const decision = resolvePostLoginUI({ ping });
  const token = getStoredTokens()?.access_token;

  // Always start by cleaning secondary UI
  clearBillingLandingOnly();

  if (decision.mode === "wizard") {
    ensureWizardStepsPresent();

    const flow = document.getElementById("platformFlow");
    if (flow) flow.classList.remove("mode-billing-landing");

    setAppMode("wizard");

    ensureWizardVisibleAndBranded(ping, {
      title: "PragOptics™ Billing",
      hint:
        decision.banner === "canceled"
          ? "Your subscription was canceled. Restart billing anytime."
          : "Complete setup to activate your PragOptics subscription.",
      hasTokens: !!token
    });

    showWizardFlow();

    // ✅ single, deterministic init gate
    if (!window.__wizardInit) {
      initPostLoginWizard(token, ping);
    }


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
    setAppMode("wizard"); // still inside wizard view shell

    const flow = document.getElementById("platformFlow");
    if (flow) {
      flow.style.display = "block";
      flow.classList.add("mode-billing-landing");
    }

    ensureWizardVisibleAndBranded(ping, {
      title: "PragOptics™ Billing",
      hint: decision.urgent
        ? "Payment action required."
        : "Manage your subscription and billing details.",
      hasTokens: true
    });

    renderBillingLanding({
      containerId: "platformFlow",
      billingProfile: ping.billingProfile,
      catalog: ping.productCatalog
    });

    return;
  }
}

window.applyPostLoginResolution = applyPostLoginResolution;



  handlePragOpticsCallback({
    pingUrl: PING_URL,
    setToken,
    onPingResolved: (ping) => {
      routePostLogin({ ping });
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

    
   async function openBillingFromMenu() {
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

    // ✅ Single authoritative entry point
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
  const flow = document.getElementById("platformFlow");
  if (!flow) return;

  flow.classList.remove("mode-billing-landing");
  flow.querySelector(".billing-landing")?.remove();
  flow.querySelector("#billingCanceledBanner")?.remove();
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
    pollUntilResolved,
    startPaymentStep
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

  routePostLogin,

  // auth / api
  startPragOpticsLogin: launchLogin,
  logout,
  callPragOpticsPing,
  callPragOpticsAuth,

  // billing menu entry
  openBillingFromMenu,

  // console UX
  toggleViewerMode,

  // wizard (inline handlers)
  gotoStep1,
  gotoStep2,
  gotoStep3,
  gotoStep4,
  gotoStep5,
  handleBillingProfile: handleBillingProfileSubmit,
  pollUntilResolved,
  formatPhone
});