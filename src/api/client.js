    // src/api/client.js
    
/** A body as JSON when it is JSON, else { raw: text } (null when empty). */
function parsed(text) {
  try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; }
}
/** The refusal every read shares: the server's own sentence when it sent one; the status and the body kept on the error. */
function refused(res, data) {
  const err = new Error(data?.error || data?.raw || `${res.status} ${res.statusText}`);
  err.status = res.status;
  err.data = data;
  return err;
}

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = parsed(await res.text());
  if (!res.ok) throw refused(res, data);
  return data;
}

/** fetchJson's sibling for a body that is text (a file as published): the same refusal, the text itself on success. */
export async function fetchText(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw refused(res, parsed(text));
  return text;
}

    
export function authHeaders(accessToken) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
