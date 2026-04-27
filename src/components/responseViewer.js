// src/components/responseViewer.js

let viewerMode = "visual";

export function applyViewerModeUI() {
  document
    .getElementById("po-raw-view")
    ?.classList.toggle("hidden", viewerMode !== "raw");

  document
    .getElementById("po-visual-view")
    ?.classList.toggle("hidden", viewerMode !== "visual");

  // Ensure visual placeholder exists when in visual mode
  if (viewerMode === "visual") {
    const visualHost = document.getElementById("po-visual-view");
    if (visualHost && !visualHost.hasChildNodes()) {
      renderEmptyVisual();
    }
  }

  // Slider sync (checked = RAW)
  const toggle = document.getElementById("viewerToggle");
  if (toggle && toggle.type === "checkbox") {
    toggle.checked = (viewerMode === "raw");
  }
  
  const rawHost = document.getElementById("po-output");
  if (rawHost && !rawHost.classList.contains("po-json-highlight")) {
    const seed = (rawHost.textContent || "").trim();
    if (seed) {
      rawHost.classList.add("po-json-highlight", "po-json-output");
      rawHost.innerHTML = highlightJsonToHtml(seed);
    }
  }

}

export function toggleViewerMode() {
  viewerMode = (viewerMode === "raw") ? "visual" : "raw";
  applyViewerModeUI();
}

export function setOutput(obj) {
  const rawHost = document.getElementById("po-output");
  const json = JSON.stringify(obj, null, 2);

  if (rawHost) {
    // ensure raw output uses the same token CSS classes as the request editor
    rawHost.classList.add("po-json-highlight", "po-json-output");
    rawHost.innerHTML = highlightJsonToHtml(json);
  }

  const endpointKey = normalizeEndpointKey(obj);
  const payload =
    obj?.response ??
    obj?.ping ??
    obj?.data ?? null;

  if (viewerMode === "visual") {
    renderVisual(endpointKey, payload, obj);
  } else {
    renderVisual(endpointKey, payload, obj, { silent: true });
  }

  applyViewerModeUI();
}

function normalizeEndpointKey(obj) {
  const ep = (obj?.endpoint || "").toString();

  // Handle existing shapes:
  // - "/ping"
  // - "https://api.pragoptics.com/api/v1/auth"
  // - or ACTIVE path: {mode:"ACTIVE", ping:{...}} (treat as "/ping")
  if (obj?.ping) return "/ping";

  if (ep.includes("/auth")) return "/auth";
  if (ep.includes("/ping")) return "/ping";

  // If direct api call sets endpoint as full URL like .../v1/ping etc
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

function renderEmptyVisual() {
  const host = document.getElementById("po-visual-view");
  if (!host) return;

  host.innerHTML = `
    <div class="login-panel">
      <strong>Hint</strong>

      <div class="hint" style="margin-top:8px;">
        Login first or call <code>GET auth</code> to learn more.
      </div>
    </div>
  `;
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
        ${renderCodeBlock("js", examples.startLogin || "")}
      </div>

      <div class="login-panel field">
        <strong>&nbsp;</strong>
        <div class="hint" style="margin-top:6px;">Handle Callback</div>
        ${renderCodeBlock("js", examples.handleCallback || "")}
      </div>

      <div class="login-panel field">
        <strong>&nbsp;</strong>
        <div class="hint" style="margin-top:6px;">Call API / curl</div>
        ${renderCodeBlock("js", examples.callApi || "")}
        ${examples.curl ? renderCodeBlock("curl", examples.curl) : ""}
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

// response colorizer

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// Deterministic JSON → HTML highlighter (string-aware, no regex bleed)
function highlightJsonToHtml(text) {
  text = String(text ?? "");
  let out = "";
  let i = 0;

  const stack = []; // '{' and '[' for depth rotation
  const DEPTH_MOD = 6;

  const depthClass = (d) => `d${Math.abs(d) % DEPTH_MOD}`;

  const puncClass = (ch) => {
    if (ch === "{") return `tok-brace open ${depthClass(stack.length)}`;
    if (ch === "}") return `tok-brace close ${depthClass(Math.max(0, stack.length - 1))}`;
    if (ch === "[") return `tok-bracket open ${depthClass(stack.length)}`;
    if (ch === "]") return `tok-bracket close ${depthClass(Math.max(0, stack.length - 1))}`;
    if (ch === ":") return "tok-colon";
    if (ch === ",") return "tok-comma";
    return "tok-punc";
  };

  const isPropertyName = (endIdx) => {
    let k = endIdx;
    while (k < text.length && /\s/.test(text[k])) k++;
    return text[k] === ":";
  };

  while (i < text.length) {
    const ch = text[i];

    // strings
    if (ch === '"') {
      let j = i + 1, escd = false;
      while (j < text.length) {
        const c = text[j];
        if (escd) { escd = false; j++; continue; }
        if (c === "\\") { escd = true; j++; continue; }
        if (c === '"') { j++; break; }
        j++;
      }
      const raw = text.slice(i, j);
      const cls = isPropertyName(j) ? "tok-prop" : "tok-val-str";
      out += `<span class="${cls}">${escapeHtml(raw)}</span>`;
      i = j;
      continue;
    }

    // numbers
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < text.length && /[0-9eE+\-\.]/.test(text[j])) j++;
      const raw = text.slice(i, j);
      out += `<span class="tok-val-num">${escapeHtml(raw)}</span>`;
      i = j;
      continue;
    }

    // keywords
    if (/[a-zA-Z]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[a-zA-Z]/.test(text[j])) j++;
      const raw = text.slice(i, j);
      if (raw === "true" || raw === "false") {
        out += `<span class="tok-val-bool">${raw}</span>`;
      } else if (raw === "null") {
        out += `<span class="tok-val-null">${raw}</span>`;
      } else {
        out += escapeHtml(raw);
      }
      i = j;
      continue;
    }

    // punctuation with depth rotation
    if ("{}[]:,".includes(ch)) {
      const cls = puncClass(ch);

      if (ch === "{" || ch === "[") {
        out += `<span class="${cls}">${escapeHtml(ch)}</span>`;
        stack.push(ch);
        i++;
        continue;
      }

      if (ch === "}" || ch === "]") {
        out += `<span class="${cls}">${escapeHtml(ch)}</span>`;
        const top = stack[stack.length - 1];
        if ((ch === "}" && top === "{") || (ch === "]" && top === "[")) stack.pop();
        i++;
        continue;
      }

      out += `<span class="${cls}">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // whitespace / other
    out += escapeHtml(ch);
    i++;
  }

  return out;
}

function highlightJsToHtml(src) {
  src = String(src ?? "");
  let out = "";
  let i = 0;

  const isWord = (c) => /[A-Za-z0-9_$]/.test(c);
  const kw = new Set([
    "const","let","var","function","return","async","await","if","else","try","catch","throw","new",
    "for","while","do","switch","case","break","continue","typeof","instanceof","in",
    "import","from","export","default","class","extends","super"
  ]);

  while (i < src.length) {
    const ch = src[i];

    // line comment //
    if (ch === "/" && src[i + 1] === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      out += `<span class="tok-comment">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // block comment /* ... */
    if (ch === "/" && src[i + 1] === "*") {
      let j = i + 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++;
      j = Math.min(src.length, j + 2);
      out += `<span class="tok-comment">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // strings: "..." or '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1, escd = false;
      while (j < src.length) {
        const c = src[j];
        if (escd) { escd = false; j++; continue; }
        if (c === "\\") { escd = true; j++; continue; }
        if (c === quote) { j++; break; }
        j++;
      }
      out += `<span class="tok-val-str">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // template literals `...` (no expression parsing; just treat as string)
    if (ch === "`") {
      let j = i + 1, escd = false;
      while (j < src.length) {
        const c = src[j];
        if (escd) { escd = false; j++; continue; }
        if (c === "\\") { escd = true; j++; continue; }
        if (c === "`") { j++; break; }
        j++;
      }
      out += `<span class="tok-val-str">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // numbers
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < src.length && /[0-9eE+\-\.]/.test(src[j])) j++;
      out += `<span class="tok-val-num">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // identifiers / keywords / booleans / null
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && isWord(src[j])) j++;
      const w = src.slice(i, j);

      if (w === "true" || w === "false") out += `<span class="tok-val-bool">${w}</span>`;
      else if (w === "null") out += `<span class="tok-val-null">${w}</span>`;
      else if (kw.has(w)) out += `<span class="tok-kw">${w}</span>`;
      else out += escapeHtml(w);

      i = j;
      continue;
    }

    // punctuation/operators (keep subtle, don’t overdo)
    if ("{}[]():;,.=".includes(ch)) {
      out += `<span class="tok-punc">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // whitespace / other
    out += escapeHtml(ch);
    i++;
  }

  return out;
}

function highlightCurlToHtml(src) {
  src = String(src ?? "");
  let out = "";
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    // quoted strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1, escd = false;
      while (j < src.length) {
        const c = src[j];
        if (escd) { escd = false; j++; continue; }
        if (c === "\\") { escd = true; j++; continue; }
        if (c === quote) { j++; break; }
        j++;
      }
      out += `<span class="tok-val-str">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // flags like -X, -H, --data, etc.
    if (ch === "-" && /[-A-Za-z]/.test(src[i + 1] || "")) {
      let j = i + 1;
      while (j < src.length && /[-A-Za-z]/.test(src[j])) j++;
      out += `<span class="tok-kw">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // HTTP verbs + curl keyword
    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
      const w = src.slice(i, j);
      const upper = w.toUpperCase();
      if (w === "curl" || ["GET","POST","PUT","PATCH","DELETE"].includes(upper)) {
        out += `<span class="tok-kw">${escapeHtml(w)}</span>`;
      } else {
        out += escapeHtml(w);
      }
      i = j;
      continue;
    }

    // numbers
    if (ch >= "0" && ch <= "9") {
      let j = i + 1;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      out += `<span class="tok-val-num">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    out += escapeHtml(ch);
    i++;
  }

  return out;
}

function renderCodeBlock(lang, code) {
  const safe = String(code ?? "");
  const html =
    (lang === "curl") ? highlightCurlToHtml(safe) :
    (lang === "js") ? highlightJsToHtml(safe) :
    escapeHtml(safe);

  return `<pre class="po-code-block" data-lang="${escapeHtml(lang)}">${html}</pre>`;
}




export {
  formatMoney,
  labelFromLookupKey,
  toggleCatalog
};