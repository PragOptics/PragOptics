// src/runtime/stripeKey.js
//
// Exposes the lane's Stripe publishable key to Stripe.js before checkout mounts.
// Lives in its own file (not inline in index.html) because the site's Content
// Security Policy allows no inline script.
import { STRIPE_PUBLISHABLE_KEY } from "./config.js";
window.STRIPE_PUBLISHABLE_KEY = STRIPE_PUBLISHABLE_KEY;
