// src/auth/native.js
import { getAgreementAck } from "../runtime/state.js";

const PRAG_API_BASE = "https://api.pragoptics.com/api/v1";

async function postJson(path, body) {
  const res = await fetch(`${PRAG_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  // Try to parse JSON if present
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
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
export async function submitNativeLogin(e) {
  e.preventDefault();
  setLoginError("");
  setCodeError("");

  const email = normalizeEmail(document.getElementById("loginEmail")?.value);
  const password = document.getElementById("loginPassword")?.value || "";
  if (!email || !password) return;

  try {
    const data = await postJson("/auth/login-password", { email, password });

    
    // Persist tokens via bootstrap (single authority)
    if (!data?.tokens?.access_token) {
      throw new Error("Login did not return access token.");
    }

    if (typeof globalThis.setToken === "function") {
      globalThis.setToken(data.tokens);
    } else {
      sessionStorage.setItem(
        "pragoptics_tokens",
        JSON.stringify(data.tokens)
      );
    }

    closeLoginUi();

    // ALWAYS run the same post-login resolution path
    const pingRes = await fetch(`${PRAG_API_BASE}/ping`, {
      headers: {
        Authorization: `Bearer ${data.tokens.access_token}`
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

  } catch (err) {
    setCodeError(err?.message || "Invalid email or password.");
  }
}

// -------------------------------
// REQUEST CODE -> /auth/request-code (signup/reset)
// NOTE: your backend expects smsOptIn + phone when sending SMS. (you proved this)
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

  return postJson("/auth/signup", body);
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