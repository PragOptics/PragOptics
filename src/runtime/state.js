// src/runtime/state.js

export const state = {
  agreementAck: null,      // { agreementUrl, acceptedAt, userAgent }
  lastPing: null,          // cached ping object
};

export function setAgreementAck(ack) {
  state.agreementAck = ack || null;
}

export function getAgreementAck() {
  return state.agreementAck;
}

export function setLastPing(ping) {
  state.lastPing = ping || null;
}

export function getLastPing() {
  return state.lastPing;
}