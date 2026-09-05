// src/auth/native.js
import { getAgreementAck } from "../runtime/state.js";
import { fetchJsonWithDna } from "../api/apiWithDna.js";
import { finalizeAuth } from "./twoFactorFlow.js";

import { PRAG_API_BASE } from "../runtime/config.js";

async function postJson(path, body) {
  return fetchJsonWithDna(
    `${PRAG_API_BASE}${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
}

function closeLoginUi() {
  document.getElementById("loginMask")?.classList.remove("is-open");
  document.getElementById("loginModal")?.classList.remove("is-open");
  document.querySelectorAll(".hero .cta").forEach(el => el.classList.add("hidden"));
}

function setCodeError(msg) {
  const el = document.getElementById("codeError");
  if (el) el.textContent = msg || "";
}

function setLoginError(msg) {
  const el = document.getElementById("loginError");
  if (el) el.textContent = msg || "";
}

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

// -------------------------------
// LOGIN (password)  -> /auth/login-password
// -------------------------------
// Ask the browser's password manager to save the credential.
//
// The forms are semantically correct (a real <form>, type="password",
// autocomplete="current-password"), but sign-in submits via fetch and calls
// preventDefault, so there is no navigation for Chrome's save-password
// heuristic to notice - and it stays silent. The Credential Management API is
// the SPA-correct trigger: storing the credential explicitly on success makes
// the "Save password?" prompt appear. Guarded, since it exists only in secure
// contexts and Chromium-family browsers; elsewhere it is a harmless no-op.
async function saveCredential(email, password) {
  try {
    if (!window.PasswordCredential || !window.isSecureContext) return;
    const cred = new window.PasswordCredential({ id: email, password, name: email });
    await navigator.credentials.store(cred);
  } catch { /* user declined, or unsupported: never block the login */ }
}

export async function submitNativeLogin(e) {
  e.preventDefault();
  setLoginError("");
  setCodeError("");

  const email = normalizeEmail(document.getElementById("loginEmail")?.value);
  const password = document.getElementById("loginPassword")?.value || "";
  if (!email || !password) return;

  try {
    const data = await postJson("/auth/login-password", { email, password });

    // The password is proven here even when a second factor is still owed, so
    // offer to save the credential now.
    await saveCredential(email, password);

    closeLoginUi();

    // finalizeAuth resolves all three sign-in shapes: a full access token, an
    // mfa challenge (enrolled account), or mandatory enrollment (an account
    // with no authenticator yet). Only it writes a session to storage, and
    // only after the backend returns an access token.
    await finalizeAuth(data, { email });

  } catch (err) {
    // A suspended account is refused with a named code; every other failure
    // stays generic so a caller cannot probe which part was wrong.
    if (err?.status === 403 && err?.data?.code === "ACCOUNT_SUSPENDED") {
      setCodeError("This account is suspended. Contact support@bridgesindust.com.");
    } else {
      setCodeError(err?.message || "Invalid email or password.");
    }
  }
}

// -------------------------------
// REQUEST CODE -> /auth/request-code (signup/reset)
// The modal always asks for email delivery (channel "email", smsOptIn false).
// On signup the optional mobile number rides along so the new account stores
// it; it is verified later from the profile, never texted here.
// -------------------------------
export async function requestNativeCode({ email, purpose, smsOptIn, phone, channel }) {
  const body = {
    email: normalizeEmail(email),
    purpose: String(purpose || "login").toLowerCase(),
    channel: String(channel || "email").toLowerCase(),
    smsOptIn: !!smsOptIn,
    phone: String(phone || "").trim()
  };
  return postJson("/auth/request-code", body);
}

// -------------------------------
// VERIFY CODE -> /auth/verify-code (optional; modal uses this to unlock password fields)
// -------------------------------
export async function verifyNativeCode({ requestId, code, email, purpose }) {
  const body = {
    requestId: String(requestId || ""),
    code: String(code || "").trim(),
    email: normalizeEmail(email),
    purpose: String(purpose || "login").toLowerCase()
  };
  return postJson("/auth/verify-code", body);
}

// -------------------------------
// SIGNUP -> /auth/signup
// -------------------------------
export async function submitNativeSignup({
  email,
  password,
  confirmPassword,
  requestId,
  verificationCode,
  smsOptIn,
  phone
}) {
  const agreementAck = getAgreementAck?.() || null;

  const body = {
    mode: "signup",
    email: normalizeEmail(email),
    password: String(password || ""),
    confirmPassword: String(confirmPassword || ""),
    requestId: String(requestId || ""),
    verificationCode: String(verificationCode || ""),
    smsOptIn: !!smsOptIn,
    phone: String(phone || "").trim(),
    agreementAck
  };

  const result = await postJson("/auth/signup", body);
  // A brand-new account just set a password: offer to save it. Signup now
  // returns an enrollment token rather than an access token, so gate on
  // success, not on the token shape.
  if (result?.success) {
    await saveCredential(body.email, body.password);
  }
  return result;
}


// -------------------------------
// RESET PASSWORD -> /auth/reset-password
// -------------------------------
export async function submitNativeResetPassword({
  email,
  password,
  confirmPassword,
  requestId,
  verificationCode
}) {
  const body = {
    email: normalizeEmail(email),
    password: String(password || ""),
    confirmPassword: String(confirmPassword || ""),
    requestId: String(requestId || ""),
    verificationCode: String(verificationCode || "")
  };

  return postJson("/auth/reset-password", body);
}

// -------------------------------
// Make available to modal code without new imports
// -------------------------------
globalThis.pragRequestCode = requestNativeCode;
globalThis.pragVerifyCode = verifyNativeCode;
globalThis.pragSignup = submitNativeSignup;
globalThis.pragResetPassword = submitNativeResetPassword;