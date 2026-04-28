import { setOutput, toggleViewerMode, applyViewerModeUI } from './responseViewer.js';
import { initJsonBodyEditor } from './jsonBodyEditor.js';
import { fetchWithDna } from '../api/fetchWithDna.js';

let apiRequestMode = "pragoptics";

export function initConsoleController({
  apiBase,
  getStoredTokens
}) {
    // --- Ensure JSON helper buttons exist (view may be reloaded) ---
  
  const view = document.getElementById("consoleView");
  if (!view) return;

  const methodSelect = view.querySelector("#po-api-method");
  const bodyContainer = view.querySelector("#po-api-body-container");
  const bodyInput = view.querySelector("#po-api-body");
  const routeInput = view.querySelector("#po-api-route");
  const formatBtn = view.querySelector("#po-api-format");
  const minifyBtn = view.querySelector("#po-api-minify");
  const repairBtn = view.querySelector("#po-api-repair");

  // ===== Request Mode Toggle (PragOptics vs Global) =====
  const apiModeToggle = view.querySelector("#apiModeToggle");
  const apiConsoleTitle = view.querySelector("#apiConsoleTitle"); // <strong id="apiConsoleTitle">
  const apiRoutePrefix = view.querySelector(".api-route-prefix");

  function applyApiModeUI() {
    const isGlobal = (apiRequestMode === "global");

    // Checkbox convention: checked = Global (right), unchecked = PragOptics (left)
    if (apiModeToggle && apiModeToggle.type === "checkbox") {
      apiModeToggle.checked = isGlobal;
    }

    if (apiConsoleTitle) {
      apiConsoleTitle.textContent = isGlobal ? "Global API Call" : "PragOptics™ API Call";
    }

    // Prefix only makes sense in PragOptics mode
    if (apiRoutePrefix) {
      apiRoutePrefix.style.display = isGlobal ? "none" : "inline";
    }

    // Placeholder guidance (do not overwrite user input)
    if (routeInput) {
      routeInput.placeholder = isGlobal ? "https://example.com/api" : "auth";
    }
  }

  function resolveRequestUrl(route) {
    const isGlobal = (apiRequestMode === "global");
    if (isGlobal) return route; // expect absolute URL

    // PragOptics mode: keep current base+route behavior, but normalize slashes
    const base = String(apiBase || "").replace(/\/+$/, "");
    const path = route.startsWith("/") ? route : `/${route}`;
    return `${base}${path}`;
  }

  function syncMethodUI() {
    const hasBody = ["POST", "PUT", "PATCH"].includes(methodSelect.value);

    if (bodyContainer) {
      bodyContainer.style.display = hasBody ? "block" : "none";
    }

    // Show format/minify only when a body is valid/meaningful
      syncBodyToolButtons(hasBody);
  }

  const authIndicator = view.querySelector("#authIndicator");

  function syncAuthIndicator() {
    const token = getStoredTokens()?.access_token;
    if (authIndicator) authIndicator.classList.toggle("signed-in", !!token);
  }

  // Allow bootstrap to force auth indicator re-sync
    window.setConsoleAuthenticated = function () {
      syncAuthIndicator();
    };

  // ===== Copy Response (local-only, no imports) =====
function ensureCopyResponseToastHost() {
  // scoped to consoleView only
  let host = view.querySelector("#copyResponseToastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "copyResponseToastHost";
    host.style.position = "fixed";
    host.style.right = "12px";
    host.style.top = "82px";
    host.style.zIndex = "80";
    host.style.pointerEvents = "none";
    document.querySelector("header").appendChild(host);
  }
  return host;
}

function showCopyResponseToast(message, ttl = 1800) {
  const host = ensureCopyResponseToastHost();
  const t = document.createElement("div");
  t.textContent = message;

  // isolated inline styling (no shared toast system)
  t.style.pointerEvents = "none";
  t.style.marginTop = "8px";
  t.style.background = "rgba(12,12,12,0.92)";
  t.style.color = "var(--muted)";
  t.style.padding = "10px 14px";
  t.style.borderRadius = "12px";
  t.style.borderLeft = "4px solid var(--brand)";
  t.style.boxShadow = "0 10px 34px rgba(2,23,18,0.55)";
  t.style.fontWeight = "600";
  t.style.opacity = "1";
  t.style.transform = "translateY(0)";
  t.style.transition = "opacity .18s ease, transform .18s ease";

  host.appendChild(t);

  const fadeAt = Math.max(250, ttl - 220);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(-6px)";
  }, fadeAt);

  setTimeout(() => t.remove(), ttl);
}

async function copyTextToClipboard(text) {
  const s = String(text || "");
  if (!s.trim()) return false;

  // modern clipboard (works in secure contexts / some localhost)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(s);
    return true;
  }

  // fallback for non-secure contexts
  const ta = document.createElement("textarea");
  ta.value = s;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}


  function syncBodyToolButtons(hasBody) {
  if (!hasBody) {
    if (formatBtn) formatBtn.style.display = "none";
    if (minifyBtn) minifyBtn.style.display = "none";
    if (repairBtn) repairBtn.style.display = "none";
    return;
  }

  if (bodyIsValid) {
    if (formatBtn) formatBtn.style.display = "inline-flex";
    if (minifyBtn) minifyBtn.style.display = "inline-flex";
    if (repairBtn) repairBtn.style.display = "none";
  } else {
    if (formatBtn) formatBtn.style.display = "none";
    if (minifyBtn) minifyBtn.style.display = "none";
    if (repairBtn) repairBtn.style.display = "inline-flex";
  }
}

  
let bodyIsValid = true;
const bodyStatus = view.querySelector("#po-api-body-status");

initJsonBodyEditor({
  textarea: bodyInput,
  statusHost: bodyStatus,
  onValidityChange: (valid) => {
    bodyIsValid = valid;
    const hasBody = ["POST", "PUT", "PATCH"].includes(methodSelect.value);
    syncBodyToolButtons(hasBody);
  }
});

syncMethodUI();
syncAuthIndicator();
applyApiModeUI();

  // Method → body visibility
 methodSelect?.addEventListener("change", syncMethodUI);

  // Action delegation
  view.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-console-action]");
    if (!btn) return;

    e.preventDefault();
    const action = btn.dataset.consoleAction;
    syncAuthIndicator();

    if (action === "toggle-view") {
      toggleViewerMode();
      return;
    }

    if (action === "toggle-api-mode") {
      apiRequestMode = (apiRequestMode === "pragoptics") ? "global" : "pragoptics";
      applyApiModeUI();
      return;
    }

    if (action === "copyResponse") {
      const rawHost = document.getElementById("po-output");

      // IMPORTANT: responseViewer renders highlighted HTML into po-output,
      // but textContent is still the correct "raw" text to copy. 
      const text = (rawHost?.textContent || "").trim();

      if (!text) {
        showCopyResponseToast("No response to copy");
        return;
      }

      try {
        const ok = await copyTextToClipboard(text);
        showCopyResponseToast(ok ? "Copied response to clipboard" : "Copy failed");
      } catch {
        showCopyResponseToast("Copy failed");
      }
      return;
    }

    const route = routeInput.value.trim();
    if (!route) return;

    const method = methodSelect.value;
    const url = resolveRequestUrl(route);
    const token = getStoredTokens()?.access_token;


    const headers = { "Content-Type": "application/json" };
    if (apiRequestMode === "pragoptics" && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (action === "send") {
      const options = { method, headers };

      if (["POST","PUT","PATCH"].includes(method)) {
        if (!bodyIsValid) return; // UI already explains why
        options.body = bodyInput.value;
      }

      try {
        const res = await fetchWithDna(url, options, {
          rampUpMs: 250,
          mul: 8,
          rampDownMs: 700,

          // DEV: set to 0 after you visually confirm DNA triggers from console sends
          minVisibleMs: 900
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = text; }

        setOutput({ endpoint: url, status: res.status, response: json });
      } catch (err) {
        setOutput({ endpoint: url, error: String(err) });
      }
      return;
    }

    if (action === "curl") {
      let curl = `curl -X ${method}`;
      if (apiRequestMode === "pragoptics" && token) {
        curl += ` -H "Authorization: Bearer ${token}"`;
      }
      if (["POST","PUT","PATCH"].includes(method)) {
        curl += ` -H "Content-Type: application/json" -d '${bodyInput.value || "{}"}'`;
      }
      curl += ` "${url}"`;
      navigator.clipboard.writeText(curl);
    }
  });

  // ✅ Ensure response viewer UI matches viewerMode on console load

applyViewerModeUI();
}