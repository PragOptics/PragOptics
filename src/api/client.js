    // src/api/client.js
    
   export async function fetchJson(url, options = {}) {
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

    
export function authHeaders(accessToken) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
