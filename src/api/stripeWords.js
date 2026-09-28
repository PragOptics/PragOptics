// src/api/stripeWords.js
//
// A card step's failure in the site's own plain words (2026-09-23, standing rule: never a provider's raw text). Stripe.js
// answers confirmSetup and confirmPayment with an error object ({ type, code, decline_code, message }) or throws on a
// dropped connection; its `message` is Stripe's own sentence and is never shown. The codes below are the card codes on
// docs.stripe.com/error-codes (read 2026-09-23); a card_declined error carries a decline_code, and any decline_code not
// named here reads as a plain decline. A validation_error is also shown by the Payment Element beside its field.
//
//   cardErrorWords(error, { doing })   one plain sentence; `doing` is 'save' (a card kept for later) or 'pay'

const DECLINE = {
  insufficient_funds: 'The card was declined: not enough funds.',
  lost_card: 'The card was declined.',
  stolen_card: 'The card was declined.',
  expired_card: 'The card has expired.',
  incorrect_cvc: 'The security code is not right.',
  incorrect_number: 'The card number is not right.',
  card_velocity_exceeded: 'The card was declined: it has reached its limit for now.',
  do_not_honor: 'The card was declined by the bank.',
  generic_decline: 'The card was declined.'
};
const CODE = {
  expired_card: 'The card has expired. Use another card.',
  incorrect_cvc: 'The security code is not right. Check it and try again.',
  invalid_cvc: 'The security code is not right. Check it and try again.',
  incorrect_number: 'The card number is not right. Check it and try again.',
  invalid_number: 'The card number is not right. Check it and try again.',
  invalid_expiry_month: 'The expiry date is not right. Check it and try again.',
  invalid_expiry_year: 'The expiry date is not right. Check it and try again.',
  incorrect_zip: 'The postal code does not match the card. Check it and try again.',
  processing_error: 'The card could not be processed. Try again in a moment.',
  authentication_required: 'Your bank did not confirm the card. Try again and finish the check your bank shows.',
  setup_intent_authentication_failure: 'Your bank did not confirm the card. Try again and finish the check your bank shows.',
  payment_intent_authentication_failure: 'Your bank did not confirm the payment. Try again and finish the check your bank shows.'
};

/** One plain sentence for a card step that did not go through; never Stripe's own words. */
export function cardErrorWords(error, { doing = 'save' } = {}) {
  const failed = doing === 'pay' ? 'The payment did not go through' : 'The card could not be saved';
  if (!error) return `${failed}. Try again in a moment.`;
  // a throw, not an answer: the connection dropped or Stripe.js did not load
  if (error instanceof Error && !error.type) return `${failed}: the connection dropped. Check your connection and try again.`;
  const type = String(error.type || ''), code = String(error.code || ''), decline = String(error.decline_code || '');
  if (type === 'validation_error') return 'Check the card details above and try again.';
  if (code === 'card_declined') return `${DECLINE[decline] || 'The card was declined.'} Use another card, or ask your bank.`;
  if (CODE[code]) return CODE[code];
  if (type === 'card_error') return `${failed}. Check the card details, or use another card.`;
  return `${failed} right now. Try again in a moment.`;
}
