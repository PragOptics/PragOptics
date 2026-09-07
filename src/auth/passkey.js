// src/auth/passkey.js
//
// The browser half of passkeys (WebAuthn), used by the sign-in second-factor
// step, by enrollment, and by the account panel's Security card. Raw
// navigator.credentials only: no third-party script in the auth path.
//
// The API speaks base64url strings (what @simplewebauthn/server produces and
// verifies); the browser API speaks ArrayBuffers. This module is the
// translation, plus the two round trips:
//
//   registerPasskey({ post, token, name, extra })
//     POST /auth/passkey/enroll/options -> navigator.credentials.create ->
//     POST /auth/passkey/enroll/confirm { challengeId, response, name, ...extra }
//   authenticatePasskey({ post, token })
//     POST /auth/passkey/auth/options -> navigator.credentials.get ->
//     POST /auth/passkey/auth/verify { challengeId, response }
//
// `post(path, token, body)` is whatever the caller uses to talk to the API with
// a bearer (twoFactorFlow's post2fa, or an apiFetch adapter in the panel).

export function passkeySupported() {
  return typeof window !== "undefined"
    && !!window.PublicKeyCredential
    && typeof navigator?.credentials?.create === "function";
}

// ---- base64url <-> ArrayBuffer ---------------------------------------------
function b64urlToBuf(s) {
  const b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Server JSON -> what navigator.credentials.create() wants.
function toCreationOptions(o) {
  return {
    ...o,
    challenge: b64urlToBuf(o.challenge),
    user: { ...o.user, id: b64urlToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) }))
  };
}
// Server JSON -> what navigator.credentials.get() wants.
function toRequestOptions(o) {
  return {
    ...o,
    challenge: b64urlToBuf(o.challenge),
    allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) }))
  };
}

// PublicKeyCredential -> the JSON shape @simplewebauthn/server verifies.
function credentialToJSON(cred) {
  const r = cred.response;
  const isReg = typeof r.attestationObject !== "undefined";
  const response = isReg
    ? {
        clientDataJSON: bufToB64url(r.clientDataJSON),
        attestationObject: bufToB64url(r.attestationObject),
        transports: typeof r.getTransports === "function" ? r.getTransports() : []
      }
    : {
        clientDataJSON: bufToB64url(r.clientDataJSON),
        authenticatorData: bufToB64url(r.authenticatorData),
        signature: bufToB64url(r.signature),
        userHandle: r.userHandle ? bufToB64url(r.userHandle) : undefined
      };
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response,
    clientExtensionResults: typeof cred.getClientExtensionResults === "function" ? cred.getClientExtensionResults() : {},
    authenticatorAttachment: cred.authenticatorAttachment || undefined
  };
}

// A cancelled or unsupported prompt must read as a clear sentence, not a
// DOMException name.
function friendlyWebAuthnError(e) {
  const n = e?.name || "";
  if (n === "NotAllowedError") return "The passkey prompt was cancelled or timed out. Try again.";
  if (n === "InvalidStateError") return "This device already holds a passkey for this account. Sign in and use it.";
  if (n === "SecurityError") return "Passkeys need a secure page on the site's own domain.";
  if (n === "NotSupportedError") return "This device or browser does not support passkeys.";
  return e?.message || "The passkey step did not complete.";
}

export async function registerPasskey({ post, token, name = "Passkey", extra = {} }) {
  if (!passkeySupported()) throw new Error("This device or browser does not support passkeys.");
  const { challengeId, options } = await post("/auth/passkey/enroll/options", token, {});
  let cred;
  try { cred = await navigator.credentials.create({ publicKey: toCreationOptions(options) }); }
  catch (e) { throw new Error(friendlyWebAuthnError(e)); }
  if (!cred) throw new Error("The passkey prompt did not return a credential.");
  return post("/auth/passkey/enroll/confirm", token, { challengeId, response: credentialToJSON(cred), name, ...extra });
}

export async function authenticatePasskey({ post, token }) {
  if (!passkeySupported()) throw new Error("This device or browser does not support passkeys.");
  const { challengeId, options } = await post("/auth/passkey/auth/options", token, {});
  let cred;
  try { cred = await navigator.credentials.get({ publicKey: toRequestOptions(options) }); }
  catch (e) { throw new Error(friendlyWebAuthnError(e)); }
  if (!cred) throw new Error("The passkey prompt did not return a credential.");
  return post("/auth/passkey/auth/verify", token, { challengeId, response: credentialToJSON(cred) });
}
