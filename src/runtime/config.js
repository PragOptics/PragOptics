// src/runtime/config.js
// Single source of truth for which backend lane the front end talks to.
//
// LANE = 'live'  -> api.pragoptics.com      + Stripe LIVE publishable key
// LANE = 'dev'   -> dev.api.pragoptics.com  + Stripe TEST publishable key (sandbox)
//
// Flip LANE, refresh, done. Nothing else in the codebase hardcodes a base URL
// or a Stripe key. Publishable keys are browser-safe by design; secret keys
// live only in the backend's environment.

import { sessionRoutingLane } from './studioHandoff.js';
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

// Lane selection belongs to the current tab. Existing sessions migrate from
// their verified ping; unsigned new tabs use the production default. A Studio
// handoff selects routing here, then redemption verifies access on that lane.
let sessionLane = null;
try { sessionLane = sessionRoutingLane({ hash: location.hash, session: sessionStorage, legacy: localStorage }); } catch { /* default routing */ }
export const LANE = sessionLane || (isProdHost ? 'live' : LANE_SETTING);

const lane = LANES[LANE] || LANES.live;

export const PRAG_API_BASE = lane.apiBase;
export const STRIPE_PUBLISHABLE_KEY = lane.stripePk;

// The Studio (2026-09-19, Cameron: the flagship; Open Studio opens the studio,
// nothing else). The site knows the studio's address itself, so the button
// works whether or not the lane's backend names it. The studio talks to
// WHATEVER lane the person is signed in on: the handoff carries this lane's
// API base and lane name (#handoff=<code>&api=<base>&lane=<lane>), and the
// studio redeems the code there and uses that base for everything after.
// One address for both lanes until a dev studio exists; then LANES carries two.
export const STUDIO_URL = lane.studioUrl || 'https://studio.pragoptics.com';

// Explicit guest-order claim (v1/orders/claim): the "Link a guest order" card
// and the checkout copy that points at it. Proven end to end on dev
// 2026-09-06 (guest checkout -> confirmation email -> claim by order number).
// Live once the backend carrying the route (3db9385 or later) is on blue/green.
export const ORDERS_CLAIM_LIVE = true;

// Team (the tenant spine in the account panel, the operator Tenants desk, and
// the /#join invite page) on the LIVE lane. Off until blue and green carry the
// tenant routes and Cameron calls it ready; dev always shows it. Flip to true,
// push, done.
export const TEAM_LIVE = true;
