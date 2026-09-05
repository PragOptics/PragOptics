// src/components/tierCopy.js
//
// The ONE copy of what each tier includes. The warranty tier gallery
// (tierCards.js) and the plan selector (pricingCards.js: the wizard and the
// account change-plan surface) both render from here, so the offer can never
// drift between surfaces. Prices never live here; they come from the catalog.
//
// Add-ons are a User-plan product: Partner and Super include their capacity,
// and an upgrade drops any add-ons as part of the same change.

export const FREE_TIER = {
  id: 'free',
  name: 'Free',
  tag: 'For every owner',
  features: [
    'Warranty registration and transfers',
    'All PragOptics software, free to run',
    'Product docs, print profiles, and schematics',
    'Community support'
  ]
};

export const TIER_COPY = {
  user: {
    name: 'User',
    tag: 'The platform',
    features: [
      'Everything in Free',
      'Cloud sync for field data and calibration records',
      'API access with your own keys',
      'Provisioned workspace and storage',
      'Add-ons to scale storage and API calls',
      'Email support'
    ],
    cta: 'Start with User'
  },
  partner: {
    name: 'Partner',
    tag: 'Build on PragOptics',
    featured: true,
    features: [
      'Everything in User, with higher included limits',
      'Five seats included, each with a mailbox on request',
      'Publish your own APIs under the platform',
      'Usage billed through your subscription',
      'Your commerce stays yours',
      'Priority support'
    ],
    cta: 'Start with Partner'
  },
  super: {
    name: 'Super',
    tag: 'The platform at full scale',
    features: [
      'Everything in Partner',
      'Forty-five seats included',
      'The highest platform limits',
      'First in line for support'
    ],
    cta: 'Start with Super'
  }
};

// Add-on display copy, keyed by the catalog's normalized add-on keys.
export const ADDON_COPY = {
  domains:    { name: 'Custom domains', blurb: 'Serve your environment under your own domain names.' },
  storage5gb: { name: 'Storage +5 GB',  blurb: 'Five more gigabytes on your workspace.' },
  flows10k:   { name: 'Flows +10k',     blurb: 'Ten thousand more flow runs each month.' },
  api50k:     { name: 'API +50k',       blurb: 'Fifty thousand more API calls each month.' }
};

// Stable order for known tiers; anything new the catalog grows lands after.
export const TIER_ORDER = ['user', 'partner', 'super'];

const TIER_NAME = { free: 'Free', user: 'User', partner: 'Partner', super: 'Super' };
/** Customer-facing tier name for a tier id ('partner' -> 'Partner'). */
export function tierName(t) {
  return TIER_NAME[String(t || 'free').toLowerCase()] || 'Free';
}

// Customer-facing name per backend add-on state key.
export const ADDON_NAME = { domains: 'Custom domains', storage: 'Storage +5 GB', flows: 'Flows +10k', api: 'API +50k' };
