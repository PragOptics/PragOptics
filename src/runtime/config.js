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

// Runtime lane toggle for operators (admin panel > Catalog): a localStorage
// override so live catalog data can be snapshotted and replayed into dev from
// one browser session. Honored ONLY off the production domain; on
// pragoptics.com the guard above always wins.
let laneOverride = null;
try { laneOverride = localStorage.getItem('pragoptics_lane_override'); } catch { /* blocked */ }
if (laneOverride !== 'dev' && laneOverride !== 'live') laneOverride = null;

export const LANE = isProdHost ? 'live' : (laneOverride || LANE_SETTING);

const lane = LANES[LANE] || LANES.live;

export const PRAG_API_BASE = lane.apiBase;
export const STRIPE_PUBLISHABLE_KEY = lane.stripePk;
