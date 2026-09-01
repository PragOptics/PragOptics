// src/runtime/state.js

export const state = {
  agreementAck: null,      // { agreementUrl, acceptedAt, userAgent }
  lastPing: null,          // cached ping object
};

// The ack must survive a reload: signup REQUIRES it in the payload (the
// backend 400s without it), and it used to live only in this module's memory.
// A refresh between a failed attempt and the retry silently dropped it, the
// retry was rejected, and the user was bounced back to the landing page to
// re-read the agreement. Persist per tab session; acceptance already carries
// its own timestamp and user agent.
const ACK_KEY = "pragoptics_agreement_ack_v1";

export function setAgreementAck(ack) {
  state.agreementAck = ack || null;
  try {
    if (ack) sessionStorage.setItem(ACK_KEY, JSON.stringify(ack));
    else sessionStorage.removeItem(ACK_KEY);
  } catch { /* storage blocked: memory copy still works for this page */ }
}

export function getAgreementAck() {
  if (state.agreementAck) return state.agreementAck;
  try {
    const raw = sessionStorage.getItem(ACK_KEY);
    if (raw) {
      const ack = JSON.parse(raw);
      if (ack?.agreementUrl && ack?.acceptedAt && ack?.userAgent) {
        state.agreementAck = ack;
        return ack;
      }
    }
  } catch { /* corrupted or blocked: treat as not acknowledged */ }
  return null;
}

export function setLastPing(ping) {
  state.lastPing = ping || null;
}

export function getLastPing() {
  return state.lastPing;
}