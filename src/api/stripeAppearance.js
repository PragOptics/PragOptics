// src/api/stripeAppearance.js
//
// One appearance for every Stripe Element on the site (goods checkout, the
// billing wizard's setup intent, the card swap in the account panel), read
// from the theme at mount time so the element follows the light/dark choice:
// light theme, Stripe's light preset with the purple primary; dark theme, the
// night preset with the teal primary. Radius matches the site's controls.
export function stripeAppearance() {
  const root = document.documentElement;
  const light = root.getAttribute('data-theme') === 'light';
  const primary = (getComputedStyle(root).getPropertyValue('--brand-600') || '').trim()
    || (light ? '#6d28d9' : '#21bca5');
  return {
    theme: light ? 'stripe' : 'night',
    variables: { colorPrimary: primary, borderRadius: '8px' }
  };
}
