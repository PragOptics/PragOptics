// src/runtime/config.js
// Single source of truth for which backend lane the front end talks to.
//
// LANE = 'live'  -> api.pragoptics.com      + Stripe LIVE publishable key
// LANE = 'dev'   -> dev.api.pragoptics.com  + Stripe TEST publishable key (sandbox)
//
// Flip LANE, refresh, done. Nothing else in the codebase hardcodes a base URL
// or a Stripe key. Publishable keys are browser-safe by design; secret keys
// live only in the backend's environment.

const LANE_SETTING = 'dev';

const LANES = {
  live: {
    apiBase: 'https://api.pragoptics.com/api/v1',
    stripePk: 'pk_live_51SX4Af0R5awBvgpyhwfA6OQDZ8RLLqKACGjCZwF5qgfgv7dLcF9tHM6CgnyyT033CMvHg2AzFMaoluga0Nf79etr00IvVf5SmG',
  },
  dev: {
    apiBase: 'https://dev.api.pragoptics.com/api/v1',
    stripePk: 'pk_test_51SX4Af0R5awBvgpyPXFJ4gEoY1KwQsba3soyvBZSOCjlO4eSHvXQa9v4XtqnBsQhkYc8dD8hxQNISvdt1iAEtH4F00ebEuaNwB',
  },
};

// Production safety net: this repo IS the live site, so the production domain
// ALWAYS runs the live lane, even if LANE_SETTING = 'dev' gets committed and
// deployed. The dev override only takes effect on localhost / previews.
const host = typeof location !== 'undefined' ? location.hostname : '';
const isProdHost = host === 'pragoptics.com' || host === 'www.pragoptics.com';

// Runtime lane toggle for platform operators (see src/runtime/lane.js): a
// localStorage override set only by an explicit sign-out-and-switch gesture.
// It changes where THIS browser routes API calls (and which Stripe
// publishable key rides along); the deployed site itself never changes.
//
// The production default stays untouchable: absent that explicit gesture,
// pragoptics.com is ALWAYS live, so a committed LANE_SETTING = 'dev' can
// never route customers to the sandbox. The override is honored everywhere
// because it cannot exist without the gesture.
let laneOverride = null;
try { laneOverride = localStorage.getItem('pragoptics_lane_override'); } catch { /* blocked */ }
if (laneOverride !== 'dev' && laneOverride !== 'live') laneOverride = null;

export const LANE = laneOverride || (isProdHost ? 'live' : LANE_SETTING);

const lane = LANES[LANE] || LANES.live;

export const PRAG_API_BASE = lane.apiBase;
export const STRIPE_PUBLISHABLE_KEY = lane.stripePk;

// Explicit guest-order claim (v1/orders/claim). Ships dark on the live lane
// until that route is deployed to live, so the "Link a guest order" card and
// the checkout copy that points at it never reference a route that 404s a real
// customer. The dev lane always exposes it for testing. Flip to true and push
// once the backend claim route is live on all lanes.
export const ORDERS_CLAIM_LIVE = false;
