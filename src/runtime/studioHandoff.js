// Routing a handoff to a lane grants no access: that lane must redeem the code
// and verify the resulting account before the frontend accepts the session.
export const SESSION_LANE_KEY = 'pragoptics_session_lane';

export function parseStudioHandoff(hash) {
  if (!String(hash || '').startsWith('#handoff=')) return null;
  const params = new URLSearchParams(String(hash).slice(1));
  const code = params.get('handoff');
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(code || '')) return null;
  const to = params.get('to') || 'account';
  return { code, to: /^account(\?|$)/.test(to) ? to : 'account', lane: ['dev', 'live'].includes(params.get('lane')) ? params.get('lane') : null };
}

export function studioHandoffLane(hash, storage) {
  const lane = parseStudioHandoff(hash)?.lane;
  if (lane) {
    try { storage?.setItem(SESSION_LANE_KEY, lane); } catch { /* the fragment still selects this load */ }
    return lane;
  }
  try { const stored = storage?.getItem(SESSION_LANE_KEY); return ['dev', 'live'].includes(stored) ? stored : null; }
  catch { return null; }
}

export async function redeemStudioSession({ apiBase, code, fetcher = fetch }) {
  const signal = AbortSignal.timeout(20000);
  const res = await fetcher(`${apiBase}/auth/software/redeem`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.tokens?.access_token) throw Object.assign(new Error('Session transfer failed.'), { code: `HANDOFF_REDEEM_${res.status}` });
  const pingRes = await fetcher(`${apiBase}/ping`, { headers: { Authorization: `Bearer ${data.tokens.access_token}` }, signal });
  if (!pingRes.ok) throw Object.assign(new Error('Account verification failed.'), { code: `HANDOFF_PING_${pingRes.status}` });
  const ping = await pingRes.json();
  if (!ping?.user) throw Object.assign(new Error('Account verification failed.'), { code: 'HANDOFF_ACCOUNT_MISSING' });
  return { tokens: data.tokens, ping };
}
