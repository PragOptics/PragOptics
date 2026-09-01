// ui/login.modal.js

import { PRAG_API_BASE } from "../runtime/config.js";
import { getAgreementAck } from "../runtime/state.js";

let isBound = false;

/* ======================================================
   MODAL OPEN / CLOSE
   ====================================================== */

export function openLoginModal(mode = "login") {
  const modal = document.getElementById("loginModal");
  const mask  = document.getElementById("loginMask");
  if (!modal || !mask) return;

  modal.dataset.act = mode;

  modal.classList.add("is-open");
  mask.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");

  bindLoginModal(modal);

  // reset UI/state every time modal opens (without rebinding listeners)
  modal.__loginRefresh?.();

  requestAnimationFrame(() => {
    modal.querySelector("#loginEmail")?.focus();
  });
}

export function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  const mask  = document.getElementById("loginMask");
  if (!modal || !mask) return;

  modal.classList.remove("is-open");
  mask.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");

  // allow clean rebind on reopen
}

/* ======================================================
   CORE BIND (SCOPED + DETERMINISTIC)
   ====================================================== */

function bindLoginModal(modal) {
  if (isBound) return;
  isBound = true;

  const form   = modal.querySelector("#loginForm");
  const email  = modal.querySelector("#loginEmail");
  const pwd    = modal.querySelector("#loginPassword");
  const pwd2   = modal.querySelector("#loginPasswordConfirm");
  const pwdField  = pwd?.closest(".form-field");
  const pwd2Field = pwd2?.closest(".form-field");
  const error  = modal.querySelector("#loginError");
  const error2  = modal.querySelector("#codeError");
  const rules  = modal.querySelector("#passwordRules");
  const meter  = modal.querySelector("#passwordStrength");
  const bar    = meter?.querySelector(".pw-strength-bar");
  const title = document.getElementById("loginTitle");

  const phoneBlock = modal.querySelector("#loginPhoneBlock");
  const phoneInput = modal.querySelector("#loginPhone");
  const smsOptIn   = modal.querySelector("#loginSmsOptIn");

  const codeBlock  = modal.querySelector("#loginCodeBlock");
  const codeInput  = modal.querySelector("#loginCode");
  const requestCodeBtn = modal.querySelector("#requestCodeBtn");

  const forgotBtn  = modal.querySelector("#forgotPasswordBtn");
  const backBtn    = modal.querySelector("#backToSignInBtn");
  const submitBtn  = modal.querySelector("#loginSubmitBtn");

  if (!form || !email || !pwd || !pwd2 || !error || !rules || !meter || !bar || !submitBtn || !forgotBtn || !backBtn) {
    console.error("[login] Modal DOM contract violated");
    return;
  }

  let codeState = "idle"; // 'idle' | 'requested'
  const codeBtnLabel = () => requestCodeBtn?.querySelector("span") || requestCodeBtn;

  resetUI();

  applyMode(currentMode());

  // allow openLoginModal() to reset state without rebinding events
  modal.__loginRefresh = () => {
    resetUI();
    applyMode(currentMode());
  };

  /* ======================================================
     CODE STATE (signup/reset): idle -> requested -> verified (^ let codeState = "idle"; ^)
     ====================================================== */

  function digitsOnly10(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, 10);
  }

  function formatUSPhone(raw) {
    const d = digitsOnly10(raw);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  }


  function setEnabled(el, on) {
    if (!el) return;
    el.disabled = !on;
  }

  function setCodeBtnText(txt) {
    const node = codeBtnLabel();
    if (node) node.textContent = txt;
  }

  function isCodeValid() {
    // The backend mints 6-digit numeric codes (crypto.randomInt padded);
    // letters were never valid.
    const v = (codeInput?.value || "").trim();
    return /^\d{6}$/.test(v);
  }

  function applyCodeState() {
    const mode = currentMode();
    const isLogin = mode === "login";
    // hard guarantee: login submit is always clickable
    if (isLogin) setEnabled(submitBtn, true);

    // code flow only exists in signup/reset
    if (isLogin) {
      codeState = "idle";
      if (codeInput) codeInput.value = "";
      setCodeBtnText("Request Code");
      setEnabled(codeInput, false);
      setEnabled(requestCodeBtn, false);
      // login mode passwords stay enabled
      setEnabled(pwd, true);
      setEnabled(pwd2, false); // confirm hidden anyway, but keep consistent with setReq()
      setEnabled(submitBtn, true);
      // login mode: identity inputs are editable
      setEnabled(email, true);
      setEnabled(smsOptIn, true);
      setEnabled(phoneInput, true);
      // login mode: force visibility state
      show(pwdField, true);
      show(pwd2Field, false); // confirm must NEVER be visible in login
      return;
    }

    // password sections are visible in login mode
    const canShowPassword = isLogin || codeState === "requested";
    show(pwdField, canShowPassword);
    show(pwd2Field, isLogin ? false : canShowPassword); // confirm never shown in login

    // signup/reset: show block, but gate behavior by state
    setEnabled(requestCodeBtn, true);

    if (codeState === "idle") {
      // user must request a code before typing one
      if (codeInput) codeInput.value = "";
      setEnabled(codeInput, false);
      setCodeBtnText("Request Code");

      // lock password section until code verified
      setEnabled(pwd, false);
      setEnabled(pwd2, false);
      setEnabled(submitBtn, false);
      // before requesting a code, identity inputs are editable
      setEnabled(email, true);
      setEnabled(smsOptIn, true);
      setEnabled(phoneInput, true);
    }

    if (codeState === "requested") {
      setEnabled(codeInput, true);
      setCodeBtnText("Code Sent");

      // request-code is single-shot
      setEnabled(requestCodeBtn, false);
      requestCodeBtn.disabled = true;

      // unlock password section + submit (server validates code on submit)
      setEnabled(pwd, true);
      setEnabled(pwd2, true);
      setEnabled(submitBtn, true);

      // lock identity inputs after requesting a code
      setEnabled(email, false);
      setEnabled(smsOptIn, false);
      setEnabled(phoneInput, false);

      // nudge focus to password for next step
      requestAnimationFrame(() => pwd?.focus());
    }
  }

  /* ======================================================
     PURE PASSWORD LOGIC
     ====================================================== */

  function analyzePassword(value) {
    const res = {
      length: value.length >= 12,
      upper:  /[A-Z]/.test(value),
      lower:  /[a-z]/.test(value),
      number: /[0-9]/.test(value),
      symbol: /[^A-Za-z0-9]/.test(value)
    };

    res.score = Object.values(res).filter(Boolean).length;
    return res;
  }

  function updateStrength(res) {
  const score = Math.max(0, Math.min(5, res.score)); // defensive
  const pct = score * 20; // 0,20,40,60,80,100

  bar.style.width = pct + "%";

  bar.dataset.level =
    score === 0 ? "none"   :
    score <= 2  ? "weak"   :
    score <= 3  ? "medium" :
    score === 4 ? "strong" :
                  "valid";
}

  function updateRules(res) {
    rules.querySelectorAll("li").forEach(li => {
      const key = li.dataset.rule;
      li.classList.toggle("ok", !!res[key]);
    });
  }

  function passwordsMatch() {
    if (!pwd2.value) return true;
    return pwd.value === pwd2.value;
  }

  function showError(msg) {
    error.textContent = msg;
    error.classList.remove("hidden");
  }

  function clearError() {
    error.textContent = "";
    error.classList.add("hidden");
  }

    function showError2(msg) {
    error2.textContent = msg;
    error2.classList.remove("hidden");
  }

  function clearError2() {
    error2.textContent = "";
    error2.classList.add("hidden");
  }

  function show(el, on) {
    if (!el) return;
    el.classList.toggle("hidden", !on);
  }

  function setReq(el, on) {
    if (!el) return;
    el.required = !!on;
    el.disabled = !on && (el.tagName === "INPUT");
  }

  function currentMode() {
    return modal.dataset.act || "login";
  }

  function applyMode(mode) {
    modal.dataset.act = mode;

    // Titles + submit label
    if (title) {
      title.textContent =
        mode === "login" ? "Sign in to PragOptics™" :
        mode === "signup" ? "Create your PragOptics™ account" :
        "Reset your PragOptics™ password";
    }

    submitBtn.textContent =
      mode === "login" ? "Sign in" :
      mode === "signup" ? "Create account" :
      "Reset password";

    // Login: email+password only
    const isLogin = mode === "login";
    const isSignup = mode === "signup";
    const isReset = mode === "reset";

    // Password creation UI only in signup/reset
    show(meter, !isLogin);
    show(rules, !isLogin);

    // Code entry exists in signup/reset. The phone/SMS block is SIGNUP ONLY:
    // for reset (and login) the backend delivers codes to the address on the
    // account, or a phone that was verified on the account beforehand - never
    // to a number typed into this form. Showing the field on reset promised
    // an SMS that will not come.
    show(phoneBlock, isSignup);
    show(codeBlock, !isLogin);

    // The delivery hint must tell the truth per mode.
    const codeHint = modal.querySelector("#codeHint");
    if (codeHint) {
      codeHint.textContent = isReset
        ? "We will email a one-time code to the address on your account."
        : "We will send a one-time code to your email (and optionally SMS).";
    }

    // Buttons swap
    show(forgotBtn, isLogin);
    show(backBtn, !isLogin);

    // Required rules
    setReq(pwd2, !isLogin);     // confirm required in signup/reset
    setReq(phoneInput, false);  // optional unless SMS checked
    setReq(codeInput, false); // require code in signup/reset

    // For login, don’t enforce strength rules
    if (isLogin) {
      clearError();
      clearError2();
    }

    // reset code flow when switching modes
    codeState = isLogin ? "idle" : "idle";
    applyCodeState();
  }

  function resetUI() {
  delete modal.dataset.requestId;

  pwd.value = "";
  pwd2.value = "";
  modal.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.dataset.state = "hidden";
    btn.setAttribute("aria-label", "Show password");
  });

  if (pwd) pwd.type = "password";
  if (pwd2) pwd2.type = "password";

  clearError();
  clearError2();
  bar.style.width = "0%";
  bar.dataset.level = "none";
  rules.querySelectorAll("li").forEach(li => li.classList.remove("ok"));
}

  /* ======================================================
     EVENTS — LIVE, NO SUBMIT REQUIRED
     ====================================================== */

  codeInput?.addEventListener("input", () => {
    if (currentMode() === "login") return;
    if (codeState !== "requested") return;
    if (isCodeValid()) clearError2();

    // no verify step — do NOT re-enable requestCodeBtn here
  });


  phoneInput?.addEventListener("input", () => {
    // keep cursor-friendly: sanitize + format
    const d = digitsOnly10(phoneInput.value);
    phoneInput.value = formatUSPhone(d);
  });

  pwd.addEventListener("input", () => {
    const res = analyzePassword(pwd.value);
    updateStrength(res);
    updateRules(res);

    if (pwd2.value && !passwordsMatch()) {
      showError("Passwords do not match.");
    } else {
      clearError();
    }
  });

  pwd2.addEventListener("input", () => {
    if (!passwordsMatch()) {
      showError("Passwords do not match.");
    } else {
      clearError();
    }
  });

  form.addEventListener("submit", async (e) => {
    const mode = currentMode();

    // LOGIN: no strength gates, just hand off to existing login handler
    if (mode === "login") {
      e.preventDefault();

      clearError();
      clearError2();

      const emailVal = email.value.trim();
      const pwdVal = pwd.value;

      if (!emailVal) {
        showError2("Enter your email.");
        email.focus();
        return;
      }

      if (!email.checkValidity()) {
        showError2("Enter a valid email address.");
        email.focus();
        return;
      }

      if (!pwdVal) {
        showError2("Enter your password.");
        pwd.focus();
        return;
      }

      if (typeof globalThis.submitNativeLogin === "function") {
        // submitNativeLogin expects the event; it already calls preventDefault,
        // but we already did above, which is fine.
        showError2();
        return globalThis.submitNativeLogin(e);
      }

      showError2("Login handler not available.");
    
      return;
    }

    // SIGNUP / RESET: enforce strong password + match + require code
    const res = analyzePassword(pwd.value);

    if (res.score < 5) {
      e.preventDefault();
      showError("Password does not meet security requirements.");
      pwd.focus();
      return;
    }

    if (!passwordsMatch()) {
      e.preventDefault();
      showError("Passwords do not match.");
      pwd2.focus();
      return;
    }

    const codeVal = codeInput?.value?.trim() || "";
    if (!codeVal) {
      e.preventDefault();
      showError2("Enter the verification code.");
      codeInput?.focus();
      return;
    }

    // Hook point: call endpoint by mode
    e.preventDefault();
    clearError();
    clearError2();

    const emailVal  = email.value.trim();
    const pwdVal    = pwd.value;
    const pwd2Val   = pwd2.value;
    const sms       = !!smsOptIn?.checked;
    const phoneVal  = phoneInput?.value?.trim() || "";
    const requestId = modal.dataset.requestId || "";

    if (!requestId) {
      showError2("Request a verification code first.");
      return;
    }


    if (mode === "signup") {
      // The backend refuses signup without the agreement acknowledgement.
      // Catch it HERE, before the request, and route the user straight into
      // the agreement modal instead of letting the submit dead-end on a 400.
      if (!getAgreementAck()) {
        showError2("Read and accept the Subscriber Agreement to continue.");
        if (typeof globalThis.openAgreementModal === "function") {
          closeLoginModal();
          globalThis.openAgreementModal();
        }
        return;
      }
      try {
        const resp = await globalThis.pragSignup?.({
          email: emailVal,
          password: pwdVal,
          confirmPassword: pwd2Val,
          requestId,
          verificationCode: codeVal,
          smsOptIn: sms,
          phone: phoneVal
        });

        // tokens come back from backend
    if (!resp?.tokens?.access_token) {
      showError2("Signup did not return access token.");
      return;
    }

    if (typeof globalThis.setToken === "function") {
      globalThis.setToken(resp.tokens);
    } else {
      sessionStorage.setItem(
        "pragoptics_tokens",
        JSON.stringify(resp.tokens)
      );
    }

    closeLoginModal();

    const pingRes = await fetch(`${PRAG_API_BASE}/ping`, {
      headers: {
        Authorization: `Bearer ${resp.tokens.access_token}`
      }
    });

    if (!pingRes.ok) {
      throw new Error(`Ping failed: HTTP ${pingRes.status}`);
    }

    const ping = await pingRes.json();
    sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));

    if (typeof globalThis.routePostLogin === "function") {
      globalThis.routePostLogin({ ping });
      return;
    }

    if (typeof globalThis.applyPostLoginResolution === "function") {
      globalThis.applyPostLoginResolution({ ping });
      return;
    }

    return;


      } catch (e) {
        showError2(e?.message || "Signup failed.");
        return;
      }
    }

    if (mode === "reset") {
      try {
        const resp = await globalThis.pragResetPassword?.({
          email: emailVal,
          password: pwdVal,
          confirmPassword: pwd2Val,
          requestId,
          verificationCode: codeVal
        });

        // Reset successful → close modal and return user to login
        closeLoginModal();

        // Reopen login cleanly so user can sign in with new password
        openLoginModal("login");

        return;
      } catch (e) {
        showError2(e?.message || "Password reset failed.");
        return;
      }
    }
  });

  forgotBtn.addEventListener("click", () => {
    applyMode("reset");
  });

  backBtn.addEventListener("click", () => {
    applyMode("login");
  });



  /* ======================================================
     PASSWORD VISIBILITY TOGGLES
     ====================================================== */

  // ======================================================
// PASSWORD VISIBILITY (delegated - survives reopen)
// ======================================================
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest(".pw-toggle");
      if (!btn) return;

      const wrap = btn.closest(".password-wrap");
      const input = wrap?.querySelector("input");
      if (!input) return;

      const visible = btn.dataset.state === "visible";
      input.type = visible ? "password" : "text";
      btn.dataset.state = visible ? "hidden" : "visible";
      btn.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    });


    smsOptIn?.addEventListener("change", () => {
    const needsPhone = !!smsOptIn.checked;
    setReq(phoneInput, needsPhone);

    if (needsPhone && !phoneInput.value.trim()) {
      showError2("Phone is required when SMS verification is enabled.");
      phoneInput.focus();
    } else {
      clearError2();
    }
  });


  requestCodeBtn?.addEventListener("click", async () => {
    const mode = currentMode();
    if (mode === "login") return;

    const emailVal = email.value.trim();
    if (!emailVal) { showError2("Enter your email first."); email.focus(); return; }

    // native email validity (novalidate doesn't disable this check)
    if (!email.checkValidity()) {
      showError2("Enter a valid email address.");
      email.focus();
      return;
    }

    // SMS is a signup-only delivery: on reset the backend routes the code to
    // the account's own address (or its pre-verified phone) and ignores any
    // phone in the request, so never send one.
    const sms = mode === "signup" && !!smsOptIn?.checked;
    const phoneVal = mode === "signup" ? (phoneInput?.value?.trim() || "") : "";
    if (sms && !phoneVal) { showError2("Phone is required when SMS verification is enabled."); phoneInput.focus(); return; }

    clearError2();

    // PHASE A: Request Code (single‑shot)
    if (codeState === "idle") {
      setEnabled(requestCodeBtn, false);
      setCodeBtnText("Sending…");

      try {
        // call native auth layer (wired in native.js)
        const resp = await globalThis.pragRequestCode?.({
          email: emailVal,
          purpose: mode,                    // "signup" | "reset"
          channel: sms ? "both" : "email",
          smsOptIn: sms,
          phone: phoneVal
        });

        // store requestId for later submit (signup/reset)
        modal.dataset.requestId = resp?.requestId || "";

        // advance state
        codeState = "requested";
        applyCodeState();

        // allow user to type code
        setEnabled(codeInput, true);
        codeInput?.focus();
      } catch (e) {
        showError2(e?.message || "Failed to send verification code.");
        setCodeBtnText("Request Code");
        setEnabled(requestCodeBtn, true);
      }

      return;
    }

  });
}