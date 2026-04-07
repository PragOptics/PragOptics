    /*bootsrap.js*/
    
    import { initDnaSwirl, registerLegacyGlobals } from './router.js';
    import { logout } from './session.js';

    
    const _mountSwirl = () => {
      // one frame later ensures layout metrics exist
      requestAnimationFrame(() => initDnaSwirl?.());
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _mountSwirl, { once: true });
    } else {
      _mountSwirl();
    }


    /* ===========================
       CONFIG
       =========================== */
    const PRAG_API_BASE   = "https://api.pragoptics.com/api/v1";
    const CIAM_LOGIN_INIT = `${PRAG_API_BASE}/auth/login`;
    const PING_URL        = `${PRAG_API_BASE}/ping`;
    const AUTH_URL        = `${PRAG_API_BASE}/auth`;
    const BILLING_PROFILE_URL  = `${PRAG_API_BASE}/billing/profile`;
    const CHECKOUT_SESSION_URL = `${PRAG_API_BASE}/billing/checkout-session`;
    const AGREEMENT_MD_URL = "https://pragoptics.com/docs/PragOptics-Subscriber-Agreement.md";
    const STRIPE_PORTAL_LOGIN_URL = "https://billing.stripe.com/p/login/4gM00beIf91O1Kzc3DdjO00";

    /* ===========================
       STATE
       =========================== */
    let pragopticsToken = null;
    let selectedType = null;
    let stripe = null;
    let elements = null;

    // Expose only the handlers referenced by inline onclick="..." in index.html
registerLegacyGlobals({
  // menu + navigation
  setAppMode,

  // agreement modal
  openAgreementModal,
  closeAgreementModal,
  submitAgreementAck,

  // auth / api
  startPragOpticsLogin,
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
  handleBillingProfile,
  pollUntilResolved,
  formatPhone
});

    function setAppMode(mode) {
      ["landingView","wizardView","consoleView"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
      document.getElementById(mode + "View")?.classList.remove("hidden");
    }

    function ensureWizardVisibleAndBranded(ping, { title, hint } = {}) {
  // Show wizard view
  setAppMode("wizard");

  // Make wizard container visible (this is the missing piece)
  const flow = document.getElementById("platformFlow");
  if (flow) flow.style.display = "block";

  // Mark signed-in if we have ping/user OR tokens exist
  const badge = document.getElementById("authBadge");
  const hasTokens = !!getStoredTokens()?.access_token;
  const signedIn = !!ping?.user || hasTokens;

  if (badge) {
    badge.textContent = signedIn ? "Signed in" : "Signed out";
    badge.style.color = signedIn ? "#21bca5" : "";
  }

  // Update header copy (optional but makes this feel like “Billing”, not “Wizard”)
  const h2 = document.getElementById("wizardTitle");
  const sub = document.getElementById("wizardHint");
  if (h2 && title) h2.textContent = title;
  if (sub && hint) sub.textContent = hint;
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
    document.addEventListener("click", (e) => {
      const toggleBtn = e.target.closest(".dropdown-toggle");
      document.querySelectorAll(".dropdown").forEach(d => {
        if (toggleBtn && d.contains(toggleBtn)) d.classList.toggle("open");
        else d.classList.remove("open");
      });
    });

    /* ===========================
       STARFIELD (ported)
       =========================== */
    window.addEventListener("load", () => {
      const canvas = document.getElementById("bg-stars");
      const ctx = canvas.getContext("2d");
      function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
      resize(); addEventListener("resize", resize);

      const starCount = 160;
      const stars = Array.from({length: starCount}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        r: Math.random()*1.2 + 0.4,
        alpha: Math.random(),
        delta: Math.random()*0.015 + 0.005
      }));

      function animate(){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        for (const s of stars){
          s.alpha += s.delta;
          if (s.alpha <= 0 || s.alpha >= 1) s.delta = -s.delta;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
          ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
          ctx.fill();
        }
        requestAnimationFrame(animate);
      }
      animate();
    });

        /* ===========================
       RESPONSE VIEWER
       =========================== */
      let viewerMode = "raw"; // raw | visual

      function toggleViewerMode() {
        viewerMode = (viewerMode === "raw") ? "visual" : "raw";

        document.getElementById("po-raw-view").classList.toggle("hidden", viewerMode !== "raw");
        document.getElementById("po-visual-view").classList.toggle("hidden", viewerMode !== "visual");

        document.getElementById("viewerToggle").textContent =
          viewerMode === "raw" ? "Visual View" : "Raw JSON";
      }   

    /* ===========================
       TOKENS
       =========================== */
    function getStoredTokens() {
      try { return JSON.parse(sessionStorage.getItem("pragoptics_tokens") || "null"); }
      catch { return null; }
    }

    async function fetchJson(url, options = {}) {
      const res = await fetch(url, options);
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        const msg = data?.error || data?.raw || `${res.status} ${res.statusText}`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    }

    /* ===========================
       AGREEMENT MODAL
       =========================== */
    const $mask  = document.getElementById("agreementMask");
    const $modal = document.getElementById("agreementModal");
    const $md    = document.getElementById("mdContainer");
    const $agree = document.getElementById("agreeChk");
    const $go    = document.getElementById("agreeGoBtn");

    function mdToHtml(md) {
  const esc = s => s.replace(/[&<>]/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c])
  );

  md = md.replace(/\r\n?/g, '\n');

  // Horizontal rules
  md = md.replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, '<hr>');

  // Code fences
  md = md.replace(/```([\s\S]*?)```/g, (_,code)=>
    `<pre><code>${esc(code)}</code></pre>`
  );

  // Inline code
  md = md.replace(/`([^`]+)`/g, (_,c)=>`<code>${esc(c)}</code>`);

  // Headings
  md = md.replace(/^######\s?(.*)$/gm,'<h6>$1</h6>')
         .replace(/^#####\s?(.*)$/gm,'<h5>$1</h5>')
         .replace(/^####\s?(.*)$/gm,'<h4>$1</h4>')
         .replace(/^###\s?(.*)$/gm,'<h3>$1</h3>')
         .replace(/^##\s?(.*)$/gm,'<h2>$1</h2>')
         .replace(/^#\s?(.*)$/gm,'<h1>$1</h1>');

  // Bold / Italic
  md = md.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
         .replace(/\*([^*]+)\*/g,'<em>$1</em>');

  // ✅ GFM tables
  md = md.replace(
    /(^\|.+\|\s*\n\|(?:\s*:?-+:?\s*\|)+\s*\n(?:\|.*\|\s*\n)+)/gm,
    block => {
      const lines = block.trim().split('\n');
      const header = lines[0].slice(1,-1).split('|').map(c=>c.trim());
      const body = lines.slice(2).map(row =>
        row.slice(1,-1).split('|').map(c=>c.trim())
      );

      const thead = `<thead><tr>${
        header.map(h=>`<th>${h}</th>`).join('')
      }</tr></thead>`;

      const tbody = `<tbody>${
        body.map(r=>`<tr>${
          r.map(c=>`<td>${c}</td>`).join('')
        }</tr>`).join('')
      }</tbody>`;

      return `<table>${thead}${tbody}</table>`;
    }
  );

  // ✅ Protect tables before paragraph wrapping
  const TABLE_PLACEHOLDER = '§§TABLE_BLOCK§§';
  const tables = [];

  md = md.replace(/<table[\s\S]*?<\/table>/g, match => {
    tables.push(match);
    return TABLE_PLACEHOLDER;
  });

  // Paragraphs
  md = md.replace(
    /^(?!<h\d|<ul|<pre|<p|<table|<hr|<\/|\s*$)(.+)$/gm,
    '<p>$1</p>'
  );

  // ✅ Restore tables
  md = md.replace(new RegExp(TABLE_PLACEHOLDER, 'g'), () => tables.shift());

  return md;
}


    function openAgreementModal() {
      $agree.checked = false;
      $go.disabled = true;
      $md.innerHTML = `<p class="muted">Loading agreement…</p>`;
      $mask.classList.add("is-open");
      $modal.classList.add("is-open");

      fetch(AGREEMENT_MD_URL, { cache: "no-store" })
        .then(r => r.text())
        .then(t => { $md.innerHTML = mdToHtml(t); })
        .catch(() => { $md.innerHTML = `<p class="muted">Unable to load agreement.</p>`; });
    }

    function closeAgreementModal() {
      $mask.classList.remove("is-open");
      $modal.classList.remove("is-open");
    }

    $agree.addEventListener("change", () => { $go.disabled = !$agree.checked; });
    $mask.addEventListener("click", closeAgreementModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $modal.classList.contains("is-open")) closeAgreementModal();
    });

    async function submitAgreementAck() {
      if (!$agree.checked) return;
      closeAgreementModal();
      await startPragOpticsLogin();
    }

    /* ===========================
       LOGIN + CALLBACK
       =========================== */
    async function startPragOpticsLogin() {
      const returnUrl = encodeURIComponent(`${location.origin}${location.pathname}`);
      const data = await fetchJson(`${CIAM_LOGIN_INIT}?returnUrl=${returnUrl}`);
      if (!data?.authorizeUrl) throw new Error("Missing authorizeUrl");
      window.location = data.authorizeUrl;
    }

    function extractAuthResultFromLocation() {
      const params = new URLSearchParams(location.search);
      let encoded = params.get("authResult");
      if (encoded) return encoded;

      // handles: ?post=subscribe?authResult=...
      const post = params.get("post");
      if (post && post.includes("authResult=")) return post.split("authResult=")[1] || null;

      const idx = location.search.indexOf("authResult=");
      if (idx >= 0) return location.search.slice(idx + "authResult=".length);
      return null;
    }

    async function handlePragOpticsCallback() {
      const encoded = extractAuthResultFromLocation();
      if (!encoded) return;

      let auth;
      try { auth = JSON.parse(decodeURIComponent(encoded)); }
      catch { alert("Login failed: invalid callback payload."); return; }

      if (!auth.success) { alert(`Login failed: ${auth.errorDescription || auth.error}`); return; }

      const tokens = auth.tokens;
      pragopticsToken = tokens.access_token;
      sessionStorage.setItem("pragoptics_tokens", JSON.stringify(tokens));

      // clean URL
      window.history.replaceState({}, document.title, location.pathname);

      // ping → decide UI
      const ping = await fetchJson(PING_URL, { headers: { Authorization: `Bearer ${pragopticsToken}` } });
      sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));
      handlePostLoginUI(ping);
    }

    window.addEventListener("load", handlePragOpticsCallback);

    /* ===========================
       POST LOGIN ROUTER
       =========================== */
    function handlePostLoginUI(ping) {
      const bp = ping?.billingProfile || null;

      // no billing profile → wizard
      if (!bp) {
        setAppMode("wizard");
        initPostLoginWizard(pragopticsToken, ping);
        gotoStep1();
        return;
      }

      const bpStatus = (bp.status || "").toUpperCase();

      if (bpStatus === "ACTIVE") {
        setAppMode("console");
        setOutput({ mode: "ACTIVE", ping });
        return;
      }

      if (bpStatus === "PAYMENT_PENDING") {
        setAppMode("wizard");
        initPostLoginWizard(pragopticsToken, ping);

        // ✅ Instant “fast” since we already know we’re mid-flight
        gotoStep5();
        setDnaMode("fast", "Subscription created…", "Finalizing entitlements…");

        pollUntilResolved();
        return;
      }

      if (bpStatus === "PENDING_SUBSCRIPTION" || bpStatus === "PAST_DUE") {
        setAppMode("wizard");
        initPostLoginWizard(pragopticsToken, ping);
        startPaymentStep(pragopticsToken);
        return;
      }

      // fallback
      setAppMode("wizard");
      initPostLoginWizard(pragopticsToken, ping);
      gotoStep1();
    }

    /* ===========================
       DEV CONSOLE FUNCTIONS
       =========================== */

    

    function formatMoney(cents, currency="USD") {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2
    }).format(n / 100);
  } catch {
    return `$${(n/100).toFixed(2)}`;
  }
}

function labelFromLookupKey(lookupKey="") {
  // po.user.base.monthly -> "User Base"
  // po.addon.domains.monthly -> "Addon: Domains"
  const key = String(lookupKey);
  const parts = key.split(".");
  if (parts.length < 3) return key;

  const type = parts[1]; // user, partner, addon
  const name = parts[2]; // base, premium, domains, storage5gb, api50k, flows10k
  const pretty = name
    .replace(/([a-z])([0-9])/i, "$1 $2")
    .replace(/5gb/i, "5GB")
    .replace(/10k/i, "10K")
    .replace(/50k/i, "50K")
    .replace(/_/g, " ");

  if (type === "addon") return `Addon: ${pretty[0].toUpperCase()}${pretty.slice(1)}`;
  if (type === "user") return `User: ${pretty[0].toUpperCase()}${pretty.slice(1)}`;
  if (type === "partner") return `Partner: ${pretty[0].toUpperCase()}${pretty.slice(1)}`;
  return `${type}: ${pretty}`;
}

    function toggleCatalog(forceOpen) {
  const el = document.getElementById("catalogDrawer");
  if (!el) return;
  const open = (forceOpen === true) ? true : (forceOpen === false) ? false : (el.style.display === "none");
  el.style.display = open ? "block" : "none";
}
    
    function setOutput(obj) {
  document.getElementById("po-output").textContent = JSON.stringify(obj, null, 2);

  // Decide what payload we are visualizing and what "endpoint key" it maps to.
  const endpointKey = normalizeEndpointKey(obj);
  const payload =
    obj?.response ??        // typical: { endpoint, response }
    obj?.ping ??            // active path: { mode, ping }
    obj?.data ?? null;

  // Visual render: route by endpoint, else fallback
  if (viewerMode === "visual") {
    renderVisual(endpointKey, payload, obj);
  } else {
    // Still render visuals in the background so it’s ready when user toggles
    renderVisual(endpointKey, payload, obj, { silent: true });
  }
}

function normalizeEndpointKey(obj) {
  const ep = (obj?.endpoint || "").toString();

  // Handle your existing shapes:
  // - "/ping"
  // - "https://api.pragoptics.com/api/v1/auth"
  // - or ACTIVE path: {mode:"ACTIVE", ping:{...}} (treat as "/ping")
  if (obj?.ping) return "/ping";

  if (ep.includes("/auth")) return "/auth";
  if (ep.includes("/ping")) return "/ping";

  // If your direct api call sets endpoint as full URL like .../v1/ping etc
  if (ep.includes("v1/auth")) return "/auth";
  if (ep.includes("v1/ping")) return "/ping";

  // Fallback: keep whatever it is
  return ep || "unknown";
}

    
    function renderVisual(endpointKey, payload, fullObj, opts = {}) {
  const host = document.getElementById("po-visual-view");
  if (!host) return;

  const renderers = {
    "/ping": renderPingVisual,
    "/auth": renderAuthVisual
  };

  const fn = renderers[endpointKey] || renderGenericVisual;

  // Some calls (like /auth) return the doc under fullObj.response
  // Ensure payload is the inner response doc if needed.
  fn(payload, fullObj);

  if (!opts.silent && viewerMode === "visual") {
    document.getElementById("po-raw-view")?.classList.add("hidden");
    document.getElementById("po-visual-view")?.classList.remove("hidden");
  }
}

    function renderGenericVisual(payload) {
  const host = document.getElementById("po-visual-view");
  if (!host) return;

  const esc = (v) => String(v ?? "—").replace(/[&<>"]/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])
  );

  const entries = Object.entries(payload || {});
  const rows = entries.slice(0, 30).map(([k, v]) => {
    const val = (typeof v === "object") ? JSON.stringify(v) : String(v ?? "—");
    return `
      <div class="kv">
        <div class="k">${esc(k)}</div>
        <div class="v">${esc(val).slice(0, 260)}</div>
      </div>
    `;
  }).join("");

  host.innerHTML = `
    <div class="login-panel">
      <strong>Visual Summary</strong>
      <div class="hint">Generic view (first 30 fields)</div>
      <div style="margin-top:10px;">${rows || `<div class="hint">No fields.</div>`}</div>
    </div>
  `;
}

    function renderAuthVisual(authDoc) {
  const host = document.getElementById("po-visual-view");
  if (!host) return;

  // safe escape
  const esc = (v) => String(v ?? "—").replace(/[&<>"]/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])
  );

  const pill = (text, tone="neutral") => {
    const styles = {
      good:   "border-color:rgba(33,188,165,.35); color:#a7fff1;",
      warn:   "border-color:rgba(255,190,120,.35); color:#ffd7b0;",
      bad:    "border-color:rgba(255,107,107,.35); color:#ffb3b3;",
      neutral:"border-color:rgba(255,255,255,.14); color:rgba(255,255,255,.92);"
    };
    return `<span class="pill" style="${styles[tone] || styles.neutral}">${esc(text)}</span>`;
  };

  const flow = authDoc?.flow || {};
  const prereq = Array.isArray(authDoc?.prerequisites) ? authDoc.prerequisites : [];
  const steps = Array.isArray(authDoc?.steps) ? authDoc.steps : [];
  const examples = authDoc?.examples || {};

  // Compact “copy” buttons for endpoints
  const copyBtn = (label, value) => `
    <button class="copy-btn" type="button"
      onclick="navigator.clipboard.writeText('${esc(value).replace(/'/g, "\\'")}')">
      Copy ${esc(label)}
    </button>
  `;

  const stepCards = steps.map(s => `
    <div class="login-panel field" style="cursor:default;">
      <strong>Step ${esc(s.step)} — ${esc(s.title)}</strong>
      <div class="hint" style="margin-top:8px;">${esc(s.detail)}</div>
    </div>
  `).join("");

  const prereqList = prereq.length
    ? prereq.map(p => `<div class="hint">• ${esc(p)}</div>`).join("")
    : `<div class="hint">—</div>`;

  // Render
  host.innerHTML = `
    <div class="row">

      <div class="login-panel field">
        <strong>${esc(authDoc?.service || "Authentication")}</strong>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          ${pill(`v${esc(authDoc?.version || "—")}`, "good")}
          ${pill("PKCE Browser Flow", "neutral")}
          ${pill("CORS‑gated", prereq.length ? "warn" : "neutral")}
        </div>
        <div class="hint" style="margin-top:10px;">${esc(authDoc?.purpose || "")}</div>
      </div>

      <div class="login-panel field">
        <strong>Endpoints</strong>
        <div class="kv"><div class="k">Start Login</div><div class="v">${esc(flow.startLogin || "—")}</div></div>
        <div class="kv"><div class="k">Callback</div><div class="v">${esc(flow.callback || "—")}</div></div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          ${flow.startLogin ? copyBtn("Start Login URL", flow.startLogin) : ""}
          ${flow.callback ? copyBtn("Callback URL", flow.callback) : ""}
        </div>
      </div>

      <div class="login-panel field">
        <strong>Prerequisites</strong>
        ${prereqList}
        <div class="hint" style="margin-top:10px;">
          Tip: this doc is returned from <code>/v1/auth</code> for developer onboarding.
        </div>
      </div>

    </div>

    <div class="row" style="margin-top:12px;">
      ${stepCards || `<div class="login-panel field"><strong>Steps</strong><div class="hint">—</div></div>`}
    </div>

    <div class="row" style="margin-top:12px;">

      <div class="login-panel field">
        <strong>Examples</strong>
        <div class="hint" style="margin-top:6px;">Start Login</div>
        <pre style="margin-top:8px; color:var(--ink); background:#0f1626; padding:10px 12px; border-radius:10px; overflow:auto;">${esc(examples.startLogin || "")}</pre>
      </div>

      <div class="login-panel field">
        <strong>&nbsp;</strong>
        <div class="hint" style="margin-top:6px;">Handle Callback</div>
        <pre style="margin-top:8px; color:var(--ink); background:#0f1626; padding:10px 12px; border-radius:10px; overflow:auto;">${esc(examples.handleCallback || "")}</pre>
      </div>

      <div class="login-panel field">
        <strong>&nbsp;</strong>
        <div class="hint" style="margin-top:6px;">Call API / curl</div>
        <pre style="margin-top:8px; color:var(--ink); background:#0f1626; padding:10px 12px; border-radius:10px; overflow:auto;">${esc(examples.callApi || examples.curl || "")}</pre>
      </div>

    </div>
  `;
}

    
    function renderPingVisual(ping) {
  const host = document.getElementById("po-visual-view");
  if (!host) return;

  // ---------- helpers ----------
  const esc = (v) => String(v ?? "—").replace(/[&<>"]/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])
  );

  const fmtTime = (iso) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch { return String(iso); }
  };

  const toneForStatus = (s) => {
    s = String(s || "").toUpperCase();
    if (s === "ACTIVE") return "good";
    if (s.includes("PAST") || s.includes("DUE") || s.includes("PENDING")) return "warn";
    if (s.includes("CANCEL") || s.includes("FAIL") || s.includes("ERROR")) return "bad";
    return "neutral";
  };

  const pill = (text, tone="neutral") => {
    const styles = {
      good:   "border-color:rgba(33,188,165,.35); color:#a7fff1;",
      warn:   "border-color:rgba(255,190,120,.35); color:#ffd7b0;",
      bad:    "border-color:rgba(255,107,107,.35); color:#ffb3b3;",
      neutral:"border-color:rgba(255,255,255,.14); color:rgba(255,255,255,.92);"
    };
    return `<span class="pill" style="${styles[tone] || styles.neutral}">${esc(text)}</span>`;
  };

  const kv = (k, v) => `
    <div class="kv">
      <div class="k">${esc(k)}</div>
      <div class="v">${esc(v)}</div>
    </div>
  `;

  const truthy = (v) => v === true ? "✅" : (v === false ? "—" : "—");

  const renderCatalog = (items) => {
  if (!Array.isArray(items) || !items.length) return "";

  // Active-only by default
  const active = items.filter(x => String(x.active || "true").toLowerCase() === "true");

  // Sort stable: role -> interval -> label
  const sortKey = (x) => `${x.role || ""}|${x.interval || ""}|${x.lookupKey || ""}`;
  active.sort((a,b) => sortKey(a).localeCompare(sortKey(b)));

  const card = (x) => {
    const title = labelFromLookupKey(x.lookupKey);
    const interval = (x.interval === "year") ? "Annual" : (x.interval === "month" ? "Monthly" : (x.interval || "—"));
    const role = (x.role || "—").toUpperCase();
    const price = formatMoney(x.amount, x.currency);
    const priceId = x.priceId || "—";

    return `
      <div class="catalog-card">
        <div class="catalog-title">${esc(title)}</div>
        <div class="catalog-meta">
          <span class="pill">${esc(role)}</span>
          <span class="pill">${esc(interval)}</span>
          <span class="pill">${esc((x.currency || "USD").toUpperCase())}</span>
        </div>
        <div class="catalog-price">${esc(price)}</div>
        <div class="catalog-sub">lookupKey: <span style="opacity:.9">${esc(x.lookupKey)}</span></div>
        <div class="catalog-sub">priceId: <span style="opacity:.9">${esc(priceId)}</span></div>
        <div class="catalog-actions">
          <button class="copy-btn" type="button"
            onclick="navigator.clipboard.writeText('${esc(x.lookupKey).replace(/'/g, "\\'")}')">Copy lookupKey</button>
          <button class="copy-btn" type="button"
            onclick="navigator.clipboard.writeText('${esc(priceId).replace(/'/g, "\\'")}')">Copy priceId</button>
        </div>
      </div>
    `;
  };

  const html = active.map(card).join("");
  const total = items.length;
  const shown = active.length;

  return `
    <div class="catalog-drawer" id="catalogDrawer" style="display:none;">
      <div class="catalog-head">
        <div>
          <strong>Product Catalog</strong>
          <div class="hint">${shown}/${total} active items</div>
        </div>
        <button class="copy-btn" type="button" onclick="toggleCatalog(false)">Hide</button>
      </div>
      <div class="catalog-grid">
        ${html || `<div class="hint">No active items.</div>`}
      </div>
    </div>
  `;
};

  // ---------- extract from YOUR ping schema ----------
  const deployment = ping?.deployment || {};
  const user = ping?.user || {};
  const bp = ping?.billingProfile || {};

  const lane = deployment.lane || "—";
  const build = deployment.build || "—";
  const service = ping?.service || "—";
  const timestamp = ping?.timestamp || "—";

  const userStatus = (user.status || "UNKNOWN").toUpperCase();
  const bpStatus = (bp.status || "—").toUpperCase();

  const requested = bp.requestedSubscription || {};
  const addons = requested.addons || {};
  const cadence = requested.cadence || "—";
  const subType = requested.subType || "—";

  const needsProvisioning = !!ping?.needsProvisioning;
  const env = ping?.environment || null; // only present when provisioned (non-admin)
  const operatorResources = Array.isArray(ping?.operatorResources) ? ping.operatorResources : [];

  const hasCatalog = Array.isArray(ping?.productCatalog) && ping.productCatalog.length > 0;

  // ---------- build UI ----------
  host.innerHTML = `
    <div class="row">

      <div class="login-panel field">
        <strong>Status</strong>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          ${pill(userStatus, toneForStatus(userStatus))}
          ${bpStatus !== "—" ? pill(`BILLING: ${bpStatus}`, toneForStatus(bpStatus)) : pill("BILLING: —", "neutral")}
          ${needsProvisioning ? pill("NEEDS PROVISIONING", "warn") : pill("PROVISIONED", env ? "good" : "neutral")}
        </div>
        <div class="hint" style="margin-top:8px;">User + billing + routing state</div>
      </div>

      <div class="login-panel field">
        <strong>Deployment</strong>
        ${kv("Service", service)}
        ${kv("Lane", lane)}
        ${kv("Build", build)}
        ${kv("Timestamp", fmtTime(timestamp))}
      </div>

      <div class="login-panel field">
        <strong>User</strong>
        ${kv("Email", user.email || "—")}
        ${kv("Tier", (user.tier || "—").toUpperCase())}
        ${kv("Role", (user.role || "—").toUpperCase())}
        ${kv("Admin", truthy(user.isAdmin))}
        ${kv("Dev", truthy(user.isDev))}
      </div>

    </div>

    <div class="row" style="margin-top:12px;">

      <div class="login-panel field">
        <strong>Billing Profile</strong>
        ${kv("BillingProfileId", bp.billingProfileId || user.billingProfileId || "—")}
        ${kv("Plan", `${String(subType).toUpperCase()} • ${String(cadence).toUpperCase()}`)}
        ${kv("Addons", (requested.addons ? [
            addons.domains ? "domains" : null,
            addons.storage ? "storage" : null,
            addons.flows ? "flows" : null,
            addons.api ? "api" : null
          ].filter(Boolean).join(", ") || "none" : "—"))}
        ${kv("Stripe Subscription", bp.stripeSubscriptionId || "—")}
        ${kv("Default Payment Method", bp.stripeDefaultPaymentMethodId || "—")}
      </div>

      <div class="login-panel field">
        <strong>Activity</strong>
        ${kv("Last Login", fmtTime(user.lastLoginAt))}
        ${kv("Last API Call", fmtTime(user.lastApiCallAt))}
        ${kv("Last Updated", fmtTime(user.lastUpdatedAt))}
        ${kv("EnvironmentId", user.environmentId || "—")}
      </div>

      <div class="login-panel field">
        <strong>Routing</strong>
        ${
          operatorResources.length
            ? `<div class="hint" style="margin-top:6px;">Operator Resources</div>
               ${operatorResources.slice(0,8).map(r => `<div class="hint">• ${esc(r.descriptor || r.id || "—")}</div>`).join("")}`
            : env
              ? `<div class="hint" style="margin-top:6px;">Environment</div>
                 ${kv("PartitionKey", env.partitionKey || "—")}
                 ${kv("RowKey", env.rowKey || "—")}`
              : `<div class="hint" style="margin-top:6px;">No environment loaded (may be provisioning).</div>`
        }
        <div class="hint" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <span>Catalog attached: ${hasCatalog ? "✅" : "—"}</span>
          ${hasCatalog ? `<button class="copy-btn" type="button" onclick="toggleCatalog(true)">View Product Catalog</button>` : ""}
        </div>
        ${hasCatalog ? renderCatalog(ping.productCatalog) : ""}
      </div>

    </div>
  `;

  // If user is currently in visual mode, keep it visible
  if (typeof viewerMode !== "undefined" && viewerMode === "visual") {
    document.getElementById("po-raw-view")?.classList.add("hidden");
    document.getElementById("po-visual-view")?.classList.remove("hidden");
  }
}

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

    // API console UX
    const methodSelect = document.getElementById("po-api-method");
    const bodyContainer = document.getElementById("po-api-body-container");
    const bodyInput = document.getElementById("po-api-body");

    methodSelect.addEventListener("change", () => {
      const m = methodSelect.value;
      bodyContainer.style.display = ["POST","PUT","PATCH"].includes(m) ? "block" : "none";
    });

    document.getElementById("po-api-send").addEventListener("click", async () => {
      const route = document.getElementById("po-api-route").value.trim();
      if (!route) return;

      const method = methodSelect.value;
      const url = `${PRAG_API_BASE}/${route}`;

      const stored = getStoredTokens();
      const accessToken = stored?.access_token;

      const options = { method, headers: { "Content-Type":"application/json" } };
      if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;

      if (["POST","PUT","PATCH"].includes(method)) {
        try { options.body = JSON.stringify(JSON.parse(bodyInput.value || "{}")); }
        catch { setOutput({ endpoint: url, error: "Invalid JSON body" }); return; }
      }

      try {
        const res = await fetch(url, options);
        const text = await res.text();
        let json; try { json = JSON.parse(text); } catch { json = text; }
        setOutput({ endpoint: url, status: res.status, response: json });
      } catch (e) {
        setOutput({ endpoint: url, error: String(e) });
      }
    });

    document.getElementById("po-api-curl").addEventListener("click", () => {
      const route = document.getElementById("po-api-route").value.trim();
      if (!route) return;

      const method = methodSelect.value;
      const url = `${PRAG_API_BASE}/${route}`;

      const stored = getStoredTokens();
      const accessToken = stored?.access_token;

      let curl = `curl -X ${method}`;
      if (accessToken) curl += ` -H "Authorization: Bearer ${accessToken}"`;
      if (["POST","PUT","PATCH"].includes(method)) {
        curl += ` -H "Content-Type: application/json" -d '${bodyInput.value || "{}"}'`;
      }
      curl += ` "${url}"`;
      navigator.clipboard.writeText(curl);
    });

    /* ===========================
       WIZARD HELPERS
       =========================== */
    function formatPhone(input) {
      let digits = (input.value || "").replace(/\D/g, '').substring(0, 10);
      if (digits.length === 10) {
        const area = digits.substring(0,3), mid = digits.substring(3,6), last = digits.substring(6);
        input.value = `+1 (${area}) ${mid}-${last}`;
        input.dataset.raw = digits;
      } else {
        input.value = digits;
        input.dataset.raw = digits;
      }
    }

    function gotoStep1(){ setStep("step1"); }
    function gotoStep2(){ setStep("step2"); }
    function gotoStep3(){ setStep("step3"); }
    function gotoStep4(){ setStep("step4"); }
    function gotoStep5(){ setStep("step5"); }

    function setStep(id){
      document.querySelectorAll(".wizard .step").forEach(s => s.classList.remove("is-active"));
      document.getElementById(id)?.classList.add("is-active");
    }

    function buildRequestedSubscription({ subType, cadence, addons }) {
      return { subType, cadence, addons: subType === "user" ? { ...addons } : {} };
    }

    function initPostLoginWizard(accessToken, ping) {
      if (window.__wizardInit) return;
      window.__wizardInit = true;
      const badge = document.getElementById("authBadge");
      if (badge) { badge.textContent = "Signed in"; badge.style.color = "#21bca5"; }

      // show wizard container
      document.getElementById("platformFlow").style.display = "block";

      // seed selectedType from radio if already set
      selectedType = document.querySelector('input[name="subType"]:checked')?.value || null;

      // enable Next when selection made
      document.querySelectorAll('input[name="subType"]').forEach(r => {
        r.addEventListener("change", () => {
          selectedType = r.value;
          document.getElementById("toStep2").disabled = !selectedType;
          applySubTypeUI();
          updatePriceSummary();
        });
      });

      // cadence + addons
      document.querySelectorAll('input[name="cadence"]').forEach(r => r.addEventListener("change", updatePriceSummary));
      ["aoDomains","aoStorage","aoFlows","aoApi"].forEach(id => document.getElementById(id)?.addEventListener("change", updatePriceSummary));

      // apply partner UI immediately
      applySubTypeUI();
      updatePriceSummary();

      // prefill from ping.billingProfile if present
      prefillBillingProfileFromPing(ping);
    }

    function applySubTypeUI() {
      const isPartner = (selectedType === "partner");
      ["aoDomains","aoStorage","aoFlows","aoApi"].forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        if (isPartner) box.checked = false;
        box.disabled = isPartner;
        box.closest('.option-card')?.classList.toggle('hidden', isPartner);
      });
    }

    function prefillNameFields(fullName) {
      if (!fullName) return;
      const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return;
      const first = parts.shift() || "";
      const last = parts.join(" ");
      const f = document.getElementById("bpFirstName");
      const l = document.getElementById("bpLastName");
      if (f && !f.value) f.value = first;
      if (l && !l.value) l.value = last;
    }

    function prefillBillingProfileFromPing(ping) {
      const bp = ping?.billingProfile;
      if (!bp) return;
      prefillNameFields(bp.customerName);
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val != null && val !== "" && !el.value) el.value = String(val);
      };
      set("bpEmail", bp.primaryEmail);
      set("bpPhone", bp.phone);
      set("bpOrg", bp.organizationName || "");
      set("bpAddr1", bp.addressLine1);
      set("bpAddr2", bp.addressLine2);
      set("bpCity", bp.city);
      set("bpState", bp.state);
      set("bpPostal", bp.postalCode);
      set("bpCountry", bp.country || "US");
    }

    // simple summary placeholder (you can swap in catalog-based summary later)
    function updatePriceSummary() {
      const summary = document.getElementById("priceSummary");
      if (!summary) return;

      const cadence = document.querySelector('input[name="cadence"]:checked')?.value || "monthly";
      const addons = {
        domains: !!document.getElementById("aoDomains")?.checked,
        storage: !!document.getElementById("aoStorage")?.checked,
        flows:   !!document.getElementById("aoFlows")?.checked,
        api:     !!document.getElementById("aoApi")?.checked
      };

      if (!selectedType) { summary.textContent = "Select options to view an estimate."; return; }

      summary.textContent =
        `${selectedType.toUpperCase()} • ${cadence} • addons: ` +
        (selectedType === "partner" ? "N/A" : JSON.stringify(addons));
    }

    async function handleBillingProfile(e) {
      e.preventDefault();

      const stored = getStoredTokens();
      const accessToken = stored?.access_token || pragopticsToken;
      if (!accessToken) { alert("Please sign in first."); return; }

      const firstName = document.getElementById("bpFirstName")?.value?.trim();
      const lastName  = document.getElementById("bpLastName")?.value?.trim();
      if (!firstName || !lastName) { alert("Enter first and last name."); return; }

      const customerName = `${firstName} ${lastName}`;
      const cadence = document.querySelector('input[name="cadence"]:checked')?.value || "monthly";
      const addons = {
        domains: !!document.getElementById("aoDomains")?.checked,
        storage: !!document.getElementById("aoStorage")?.checked,
        flows:   !!document.getElementById("aoFlows")?.checked,
        api:     !!document.getElementById("aoApi")?.checked
      };

      const requestedSubscription = buildRequestedSubscription({ subType: selectedType || "user", cadence, addons });

      const payload = {
        customerName,
        primaryEmail: document.getElementById("bpEmail")?.value?.trim(),
        phone: document.getElementById("bpPhone")?.value?.trim() || "",
        addressLine1: document.getElementById("bpAddr1")?.value?.trim(),
        addressLine2: document.getElementById("bpAddr2")?.value?.trim() || "",
        city: document.getElementById("bpCity")?.value?.trim(),
        state: (document.getElementById("bpState")?.value || "").trim(),
        postalCode: document.getElementById("bpPostal")?.value?.trim(),
        country: document.getElementById("bpCountry")?.value?.trim(),
        organizationName: document.getElementById("bpOrg")?.value?.trim() || "",
        requestedSubscription
      };

      await fetchJson(BILLING_PROFILE_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
      });

      await startPaymentStep(accessToken);
    }

    async function startPaymentStep(accessToken) {
      let csResp;
      try {
        csResp = await fetchJson(CHECKOUT_SESSION_URL, {
          method: "POST",
          headers: { "Content-Type":"application/json", "Authorization": `Bearer ${accessToken}` },
          body: JSON.stringify({})
        });
      } catch (err) {
        if (err?.status === 409) { showProcessingState("Finalizing subscription…"); await pollUntilResolved(); return; }
        throw err;
      }

      const clientSecret = csResp?.paymentIntentClientSecret || csResp?.clientSecret;
      if (!clientSecret) throw new Error("Missing Stripe client secret.");

      const key = window.STRIPE_PUBLISHABLE_KEY || "";
      if (!key) throw new Error("Stripe publishable key not configured.");

      stripe = Stripe(key);
      elements = stripe.elements({
        clientSecret,
        appearance: { theme:"night" }
      });

      document.getElementById("payment-element").innerHTML = "";
      const paymentEl = elements.create("payment");
      paymentEl.mount("#payment-element");

      document.getElementById("payNowBtn").disabled = false;
      document.getElementById("payNowBtn").onclick = async () => {
        const msg = document.getElementById("payMsg");
        msg.textContent = "Saving payment method…";

        const { error } = await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: `${location.origin}${location.pathname}?post=subscribe` },
          redirect: "if_required"
        });

        if (error) {
          msg.textContent = error.message || "Setup error.";
          return;
        }

        // ✅ DNA speeds up — payment saved
        setDnaMode("fast", "Payment method saved…", "Creating subscription…");

        // keep that message visible briefly before switching to the generic finalizing copy
        setTimeout(() => showProcessingState("Finalizing subscription…"), 250);

        await pollUntilResolved();
      };

      gotoStep4();
      const msg = document.getElementById("payMsg");
      if (msg) msg.textContent = "Enter payment details to activate.";
    }

    function setDnaMode(mode, msg, sub) {
      const box = document.querySelector(".dna-container");
      if (!box) return;
      box.dataset.dna = mode;

      if (msg) document.getElementById("finalizeMsg").textContent = msg;
      if (sub) document.getElementById("finalizeSub").textContent = sub;
    }

    function markDnaComplete() {
      const box = document.querySelector(".dna-container");
      if (!box) return;
      box.classList.add("is-complete");
      setTimeout(() => box.classList.add("hidden"), 500);
    }    

    function showProcessingState(message = "Finalizing subscription…") {
      gotoStep5();

      // ✅ DO NOT override a faster mode if it’s already set
      const box = document.querySelector(".dna-container");
      const current = box?.dataset?.dna || "idle";
      const modeToUse = (current === "fast" || current === "lock") ? current : "idle";

      setDnaMode(
        modeToUse,
        message,
        modeToUse === "fast" ? "Creating subscription…" : "Confirming with Stripe…"
      );

      const btn = document.getElementById("payNowBtn");
      if (btn) btn.disabled = true;
    }

    async function pollUntilResolved() {
  const stored = getStoredTokens();
  const accessToken = stored?.access_token || pragopticsToken;
  if (!accessToken) return;

  const started = Date.now();
  const TIMEOUT = 60000;

  while (Date.now() - started < TIMEOUT) {
    await new Promise(r => setTimeout(r, 1500));

    const ping = await fetchJson(PING_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));

    const status = (ping?.billingProfile?.status || "").toUpperCase();

    // Mid-state
    if (status === "PAYMENT_PENDING") {
      setDnaMode("fast", "Subscription created…", "Finalizing entitlements…");
    }

    // Success
    if (status === "ACTIVE") {
      setDnaMode("lock", "Activated ✅", "Launching console…");
      markDnaComplete();
      handlePostLoginUI(ping);
      return;
    }

    // Recoverable
    if (status === "PAST_DUE") {
      setDnaMode("idle", "Payment issue detected", "Please update payment method.");
      handlePostLoginUI(ping);
      return;
    }

    // Terminal
    if (status === "CANCELED") {
      setDnaMode("idle", "Subscription canceled", "You may restart onboarding anytime.");
      handlePostLoginUI(ping);
      return;
    }
  }

  // ✅ Timeout fallback (this was missing)
  setDnaMode(
    "idle",
    "Still working…",
    "You can safely refresh, or click Refresh Status again."
  );
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

  const banner = document.createElement("div");
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
  let ping = JSON.parse(sessionStorage.getItem("pragoptics_ping") || "null");

  // If we don't have ping cached but we do have a token, fetch ping so we can route correctly
  if (!ping) {
    const token = getStoredTokens()?.access_token;
    if (token) {
      try {
        ping = await fetchJson(PING_URL, { headers: { Authorization: `Bearer ${token}` } });
        sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));
      } catch {
        // If ping fails, fall back to wizard step 1
        ensureWizardVisibleAndBranded(null, {
          title: "PragOptics™ Billing",
          hint: "Sign in to manage billing."
        });
        gotoStep1();
        return;
      }
    }
  }

  // No billing profile → onboarding wizard
  if (!ping || !ping.billingProfile) {
    ensureWizardVisibleAndBranded(ping, {
      title: "PragOptics™ Subscription Wizard",
      hint: "Complete setup to activate your PragOptics subscription."
    });
    gotoStep1();
    return;
  }

  const status = String(ping.billingProfile.status || "").toUpperCase();

  // PENDING_SUBSCRIPTION → resume wizard
  if (status === "PENDING_SUBSCRIPTION") {
    ensureWizardVisibleAndBranded(ping, {
      title: "PragOptics™ Billing",
      hint: "Complete billing to activate your subscription."
    });
    gotoStep2();
    return;
  }

  // PAYMENT_PENDING → show finalizing DNA (no redirect)
  if (status === "PAYMENT_PENDING") {
    ensureWizardVisibleAndBranded(ping, {
      title: "PragOptics™ Billing",
      hint: "Finalizing your subscription with Stripe…"
    });
    gotoStep5();
    setDnaMode("fast", "Finalizing subscription…", "Confirming with Stripe…");
    return;
  }

  // CANCELED → restart wizard
  if (status === "CANCELED") {
    ensureWizardVisibleAndBranded(ping, {
      title: "PragOptics™ Billing",
      hint: "Your subscription was canceled. Restart billing anytime."
    });
    showCanceledBanner();
    gotoStep1();
    return;
  }

  // ACTIVE / PAST_DUE → Stripe portal (with DNA bridge)
  if (status === "ACTIVE" || status === "PAST_DUE") {
    redirectToStripePortalWithDna(status, ping);
    return;
  }

  // Fallback
  ensureWizardVisibleAndBranded(ping, {
    title: "PragOptics™ Billing",
    hint: "Billing status could not be determined. Please review setup."
  });
  gotoStep1();
}

    function redirectToStripePortalWithDna(status, ping) {
  const isUrgent = String(status).toUpperCase() === "PAST_DUE";

  ensureWizardVisibleAndBranded(ping, {
    title: "PragOptics™ Billing",
    hint: isUrgent ? "Payment issue detected — opening Stripe portal…" : "Opening Stripe billing portal…"
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