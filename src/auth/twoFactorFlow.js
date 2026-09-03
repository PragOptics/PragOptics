// src/auth/twoFactorFlow.js
//
// The client half of two-factor auth. Password login and signup now return one
// of three shapes, and every caller funnels through finalizeAuth():
//   { tokens.access_token }            -> already fully authenticated (legacy / future)
//   { mfaRequired, challenge_token }   -> enrolled; prove the second factor
//   { mfaEnrollmentRequired, enrollment_token } -> set up an authenticator first
//
// The modal is built in code (no HTML template to keep in sync) and is the only
// place a 2FA token is ever spent. A full session is written to storage ONLY
// after the backend returns an access token from one of the 2FA endpoints.

import { PRAG_API_BASE } from "../runtime/config.js";

// ---- shared session finalizer (mirrors native.js / login.modal.js) ------
async function finalizeSession(tokens) {
  if (typeof globalThis.setToken === "function") globalThis.setToken(tokens);
  else sessionStorage.setItem("pragoptics_tokens", JSON.stringify(tokens));

  const pingRes = await fetch(`${PRAG_API_BASE}/ping`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (!pingRes.ok) throw new Error(`Ping failed: HTTP ${pingRes.status}`);
  const ping = await pingRes.json();
  sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));

  closeHost();
  document.getElementById("loginMask")?.classList.remove("is-open");
  document.getElementById("loginModal")?.classList.remove("is-open");
  document.getElementById("loginModal")?.setAttribute("aria-hidden", "true");

  if (typeof globalThis.routePostLogin === "function") return globalThis.routePostLogin({ ping });
  if (typeof globalThis.applyPostLoginResolution === "function") return globalThis.applyPostLoginResolution({ ping });
}

async function post2fa(path, token, body) {
  const res = await fetch(`${PRAG_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {})
  });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data || {};
}

// ---- modal host ---------------------------------------------------------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function host() {
  let h = document.getElementById("twoFaHost");
  if (!h) {
    h = document.createElement("div");
    h.id = "twoFaHost";
    h.innerHTML = `<style>
      #twoFaHost .tfa-mask{position:fixed;inset:0;background:rgba(4,8,18,.72);z-index:1000;}
      #twoFaHost .tfa-modal{position:fixed;inset:0;z-index:1001;display:grid;place-items:center;padding:20px;}
      #twoFaHost .tfa-card{width:min(440px,94vw);max-height:92vh;overflow:auto;background:#0d1424;
        border:1px solid #1e2c48;border-radius:16px;padding:26px;color:#e8eefc;
        box-shadow:0 24px 60px rgba(0,0,0,.5);font-size:14px;line-height:1.55;}
      #twoFaHost h3{margin:0 0 6px;font-size:20px;color:#fff;}
      #twoFaHost .tfa-sub{color:#9fb0d0;margin:0 0 18px;}
      #twoFaHost .tfa-qr{background:#fff;border-radius:12px;padding:12px;width:190px;height:190px;margin:0 auto 14px;}
      #twoFaHost .tfa-qr svg{width:100%;height:100%;display:block;}
      #twoFaHost .tfa-secret{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:2px;
        background:#0a1120;border:1px solid #1e2c48;border-radius:8px;padding:10px 12px;color:#8fe6dc;
        word-break:break-all;text-align:center;margin:0 0 6px;}
      #twoFaHost .tfa-hint{font-size:12px;color:#7f92b4;margin:0 0 16px;text-align:center;}
      #twoFaHost input.tfa-code{width:100%;box-sizing:border-box;font-size:20px;letter-spacing:6px;
        text-align:center;padding:12px;border-radius:10px;border:1px solid #26365a;background:#0a1120;
        color:#fff;font-family:ui-monospace,monospace;}
      #twoFaHost .tfa-err{color:#ff9a9a;font-size:13px;min-height:18px;margin:8px 0 0;}
      #twoFaHost .tfa-actions{display:flex;gap:10px;margin-top:18px;}
      #twoFaHost button.tfa-cta{flex:1;padding:12px;border-radius:10px;border:0;cursor:pointer;
        background:linear-gradient(135deg,#2f9e8a,#8fe6dc);color:#04121a;font-weight:700;font-size:14px;}
      #twoFaHost button.tfa-cta:disabled{opacity:.5;cursor:not-allowed;}
      #twoFaHost button.tfa-ghost{padding:12px 16px;border-radius:10px;border:1px solid #26365a;
        background:transparent;color:#9fb0d0;cursor:pointer;font-size:14px;}
      #twoFaHost .tfa-link{background:none;border:0;color:#8fe6dc;cursor:pointer;font-size:13px;
        padding:0;margin-top:12px;text-decoration:underline;}
      #twoFaHost .tfa-codes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0;}
      #twoFaHost .tfa-codes code{background:#0a1120;border:1px solid #1e2c48;border-radius:6px;
        padding:8px;text-align:center;font-family:ui-monospace,monospace;color:#e8eefc;letter-spacing:1px;}
      #twoFaHost .tfa-ack{display:flex;gap:8px;align-items:flex-start;margin:14px 0 0;color:#cfd8ee;font-size:13px;}
      #twoFaHost .tfa-warn{background:#1a1206;border:1px solid #4a3410;color:#ffcf8f;border-radius:8px;
        padding:10px 12px;font-size:12px;margin:0 0 14px;}
    </style><div class="tfa-mask"></div><div class="tfa-modal"><div class="tfa-card" role="dialog" aria-modal="true"></div></div>`;
    document.body.appendChild(h);
  }
  h.hidden = false;
  return h.querySelector(".tfa-card");
}

function closeHost() {
  const h = document.getElementById("twoFaHost");
  if (h) { h.hidden = true; h.querySelector(".tfa-card").innerHTML = ""; }
}

// ---- enrollment ---------------------------------------------------------
async function openEnrollment(enrollmentToken, email) {
  const card = host();
  card.innerHTML = `<h3>Set up two-factor</h3><p class="tfa-sub">Loading your setup key…</p>`;

  let start;
  try {
    start = await post2fa("/auth/2fa/enroll/start", enrollmentToken, {});
  } catch (e) {
    card.innerHTML = `<h3>Set up two-factor</h3><p class="tfa-err">${esc(e.message || "Could not start setup.")}</p>
      <div class="tfa-actions"><button class="tfa-ghost" data-close>Close</button></div>`;
    card.querySelector("[data-close]").onclick = closeHost;
    return;
  }

  card.innerHTML = `
    <h3>Set up two-factor</h3>
    <p class="tfa-sub">Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy), then enter the 6-digit code it shows.</p>
    <div class="tfa-qr">${start.qrSvg || ""}</div>
    <div class="tfa-secret" id="tfaSecret">${esc(start.secret)}</div>
    <p class="tfa-hint">Can't scan? Type this key into your app by hand.</p>
    <input class="tfa-code" id="tfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="6-digit code">
    <p class="tfa-err" id="tfaErr"></p>
    <div class="tfa-actions">
      <button class="tfa-ghost" data-cancel>Cancel</button>
      <button class="tfa-cta" id="tfaVerify" disabled>Verify &amp; continue</button>
    </div>`;

  const codeEl = card.querySelector("#tfaCode");
  const btn = card.querySelector("#tfaVerify");
  const err = card.querySelector("#tfaErr");
  codeEl.addEventListener("input", () => {
    codeEl.value = codeEl.value.replace(/\D/g, "");
    btn.disabled = codeEl.value.length !== 6;
    err.textContent = "";
  });
  codeEl.focus();
  card.querySelector("[data-cancel]").onclick = closeHost;

  btn.onclick = async () => {
    btn.disabled = true; err.textContent = "";
    try {
      const done = await post2fa("/auth/2fa/enroll/confirm", enrollmentToken, { code: codeEl.value });
      showRecoveryCodes(done.recoveryCodes || [], done.tokens);
    } catch (e) {
      err.textContent = e.status === 429
        ? "Too many attempts. Wait a few minutes and try again."
        : (e.message || "That code did not match.");
      btn.disabled = false;
    }
  };
}

function showRecoveryCodes(codes, tokens) {
  const card = host();
  card.innerHTML = `
    <h3>Save your recovery codes</h3>
    <p class="tfa-sub">If you lose your authenticator, one of these gets you back in. Each works once. Store them somewhere safe. They are shown only now.</p>
    <div class="tfa-codes">${codes.map((c) => `<code>${esc(c)}</code>`).join("")}</div>
    <div class="tfa-actions">
      <button class="tfa-ghost" id="tfaCopy">Copy</button>
      <button class="tfa-ghost" id="tfaDownload">Download</button>
    </div>
    <label class="tfa-ack"><input type="checkbox" id="tfaAck"> I have saved these recovery codes somewhere safe.</label>
    <div class="tfa-actions">
      <button class="tfa-cta" id="tfaFinish" disabled>Finish</button>
    </div>`;

  const text = codes.join("\n");
  card.querySelector("#tfaCopy").onclick = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    card.querySelector("#tfaCopy").textContent = "Copied";
  };
  card.querySelector("#tfaDownload").onclick = () => {
    const blob = new Blob([`PragOptics recovery codes\n\n${text}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pragoptics-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const ack = card.querySelector("#tfaAck");
  const finish = card.querySelector("#tfaFinish");
  ack.onchange = () => { finish.disabled = !ack.checked; };
  finish.onclick = async () => {
    finish.disabled = true;
    try { await finalizeSession(tokens); }
    catch (e) {
      card.querySelector("h3").insertAdjacentHTML("afterend",
        `<p class="tfa-err">${esc(e.message || "Could not finish. Sign in again.")}</p>`);
    }
  };
}

// ---- challenge (sign-in) ------------------------------------------------
function openChallenge(challengeToken) {
  const card = host();
  let recoveryMode = false;

  function render() {
    card.innerHTML = `
      <h3>Two-factor</h3>
      <p class="tfa-sub">${recoveryMode
        ? "Enter one of your recovery codes."
        : "Enter the 6-digit code from your authenticator app."}</p>
      <input class="tfa-code" id="tfaCode" ${recoveryMode
        ? 'maxlength="11" placeholder="XXXXX-XXXXX" style="letter-spacing:3px;font-size:16px"'
        : 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"'} aria-label="verification code">
      <p class="tfa-err" id="tfaErr"></p>
      <div class="tfa-actions">
        <button class="tfa-ghost" data-cancel>Cancel</button>
        <button class="tfa-cta" id="tfaVerify" disabled>Verify</button>
      </div>
      <button class="tfa-link" id="tfaToggle">${recoveryMode ? "Use your authenticator instead" : "Use a recovery code"}</button>`;

    const codeEl = card.querySelector("#tfaCode");
    const btn = card.querySelector("#tfaVerify");
    const err = card.querySelector("#tfaErr");
    codeEl.addEventListener("input", () => {
      if (recoveryMode) {
        codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
        btn.disabled = codeEl.value.replace(/-/g, "").length < 10;
      } else {
        codeEl.value = codeEl.value.replace(/\D/g, "");
        btn.disabled = codeEl.value.length !== 6;
      }
      err.textContent = "";
    });
    codeEl.focus();
    card.querySelector("[data-cancel]").onclick = closeHost;
    card.querySelector("#tfaToggle").onclick = () => { recoveryMode = !recoveryMode; render(); };
    btn.onclick = async () => {
      btn.disabled = true; err.textContent = "";
      try {
        const done = await post2fa("/auth/2fa/verify", challengeToken, { code: codeEl.value });
        await finalizeSession(done.tokens);
      } catch (e) {
        err.textContent = e.status === 429
          ? "Too many attempts. Wait a few minutes and try again."
          : (e.message || "That code did not match.");
        btn.disabled = false;
      }
    };
  }
  render();
}

// ---- entry point --------------------------------------------------------
// Called by both login and signup with the raw auth response. Returns true if
// it took over the flow (2FA in progress or session finalized).
export async function finalizeAuth(data, { email } = {}) {
  if (data?.mfaEnrollmentRequired && data?.tokens?.enrollment_token) {
    await openEnrollment(data.tokens.enrollment_token, email);
    return true;
  }
  if (data?.mfaRequired && data?.tokens?.challenge_token) {
    openChallenge(data.tokens.challenge_token);
    return true;
  }
  if (data?.tokens?.access_token) {
    await finalizeSession(data.tokens);
    return true;
  }
  throw new Error("Unexpected sign-in response.");
}

globalThis.pragFinalizeAuth = finalizeAuth;
