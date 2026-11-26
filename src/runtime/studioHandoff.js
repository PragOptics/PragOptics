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

// Routing belongs to a tab, like its session. A fresh tab must not inherit
// another account's dev switch through localStorage. Migrate existing signed-in
// tabs once, preferring the lane verified by their last account response.
export function sessionRoutingLane({ hash = '', session, legacy } = {}) {
  const pinned = studioHandoffLane(hash, session);
  if (pinned) return pinned;
  try {
    if (!JSON.parse(session?.getItem('pragoptics_tokens') || 'null')?.access_token) return null;
    const raw = JSON.parse(session?.getItem('pragoptics_ping') || 'null')?.deployment?.lane;
    let lane = raw === 'dev' ? 'dev' : ['live', 'blue', 'green'].includes(raw) ? 'live' : null;
    if (!lane) {
      const old = legacy?.getItem('pragoptics_lane_override');
      if (['dev', 'live'].includes(old)) lane = old;
    }
    if (lane) session?.setItem(SESSION_LANE_KEY, lane);
    return lane;
  } catch { return null; }
}

async function verifiedAccount({ apiBase, tokens, fetcher, signal, expectedLane }) {
  const pingRes = await fetcher(`${apiBase}/ping`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal });
  if (!pingRes.ok) throw Object.assign(new Error('Account verification failed.'), { code: `HANDOFF_PING_${pingRes.status}` });
  const ping = await pingRes.json();
  if (!ping?.user) throw Object.assign(new Error('Account verification failed.'), { code: 'HANDOFF_ACCOUNT_MISSING' });
  const rawLane = ping.deployment?.lane;
  const actualLane = rawLane === 'dev' ? 'dev' : ['live', 'blue', 'green'].includes(rawLane) ? 'live' : null;
  if (expectedLane && actualLane !== expectedLane) throw Object.assign(new Error('The account response did not verify the selected platform lane.'), { code: 'HANDOFF_LANE_MISMATCH' });
  return { tokens, ping };
}

export async function redeemStudioSession({ apiBase, code, fetcher = fetch }) {
  const signal = AbortSignal.timeout(20000);
  const res = await fetcher(`${apiBase}/auth/software/redeem`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.tokens?.access_token) throw Object.assign(new Error('Session transfer failed.'), { code: `HANDOFF_REDEEM_${res.status}` });
  return verifiedAccount({ apiBase, tokens: data.tokens, fetcher, signal });
}

export async function redeemLaneSession({ apiBase, token, verifier, code, lane, fetcher = fetch }) {
  const signal = AbortSignal.timeout(20000);
  const res = await fetcher(`${apiBase}/auth/lane/redeem`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, verifier, code }), signal
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.tokens?.access_token) throw Object.assign(new Error(typeof data.error === 'string' ? data.error.slice(0, 300) : 'The platform could not complete the lane switch.'), { code: `LANE_REDEEM_${res.status}` });
  return verifiedAccount({ apiBase, tokens: data.tokens, fetcher, signal, expectedLane: lane });
}
