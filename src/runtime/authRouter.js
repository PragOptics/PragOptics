// src/runtime/authRouter.js

import { fetchJson } from "../api/client.js";
import { setAppMode } from "./appRouter.js";

export function startPragOpticsLogin({
  mode,
  ciamLoginInit,
  passwordLoginInit
}) {
  const returnUrl = encodeURIComponent(`${location.origin}${location.pathname}`);

  const endpoint =
    mode === "ciam" ? ciamLoginInit :
    mode === "password" ? passwordLoginInit :
    null;

  if (!endpoint) {
    throw new Error("No login mode configured");
  }

  return fetchJson(`${endpoint}?returnUrl=${returnUrl}`)
    .then(data => {
      if (!data?.authorizeUrl) {
        throw new Error("Missing authorizeUrl");
      }
      window.location = data.authorizeUrl;
    });
}

function extractAuthResultFromLocation() {
  const params = new URLSearchParams(location.search);

  let encoded = params.get("authResult");
  if (encoded) return encoded;

  const post = params.get("post");
  if (post && post.includes("authResult=")) {
    return post.split("authResult=")[1] || null;
  }

  const idx = location.search.indexOf("authResult=");
  if (idx >= 0) {
    return location.search.slice(idx + "authResult=".length);
  }

  return null;
}

export async function handlePragOpticsCallback({
  pingUrl,
  onPingResolved,
  setToken
}) {
  const encoded = extractAuthResultFromLocation();
  if (!encoded) return;

  let auth;
  try {
    auth = JSON.parse(decodeURIComponent(encoded));
  } catch {
    alert("Login failed: invalid callback payload.");
    return;
  }

  if (!auth.success) {
    alert(`Login failed: ${auth.errorDescription || auth.error}`);
    return;
  }

  const tokens = auth.tokens;
  setToken(tokens);

  // Clean URL
  window.history.replaceState({}, document.title, location.pathname);

  const ping = await fetchJson(pingUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));
  onPingResolved(ping);
}

export function routePostLogin({ ping }) {
  // Auth router no longer owns UI decisions
  // Bootstrap will centrally resolve post-login state
  if (typeof window.applyPostLoginResolution === "function") {
    window.applyPostLoginResolution({ ping });
    return;
  }

  // Defensive fallback
  setAppMode("console");
}
