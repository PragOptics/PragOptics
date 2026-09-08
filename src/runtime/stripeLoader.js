// src/runtime/stripeLoader.js
//
// Stripe.js loads only when a payment surface needs it, never on the landing.
// Stripe sets its own cookies (fraud prevention) the moment the script runs,
// so a visitor who never reaches a payment step never receives them. The three
// payment surfaces (goods checkout, the billing wizard's setup intent, the
// card swap in the account panel) call ensureStripeJs() right before they
// create Elements. The CSP already allows the script origin.
let loading = null;

export function ensureStripeJs() {
  if (typeof window.Stripe === 'function') return Promise.resolve(window.Stripe);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3';
    s.async = true;
    s.onload = () => {
      if (typeof window.Stripe === 'function') resolve(window.Stripe);
      else { loading = null; reject(new Error('Stripe.js did not initialize')); }
    };
    s.onerror = () => { loading = null; s.remove(); reject(new Error('Stripe.js failed to load')); };
    document.head.appendChild(s);
  });
  return loading;
}
