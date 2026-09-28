// src/components/agreementVersion.js
//
// The version the Platform Agreement names, read from its own text (/docs/PragOptics-Subscriber-Agreement.md, the
// "**Version:** 2026-09.11" line near the top). One reader for the two places that need it, so they can never disagree
// about which terms are current: the sign-up's agreement modal (the version rides on the acceptance record) and the
// operator's "Tell every owner about the new agreement" card (agreementNotice.js).

/** The version token after "**Version:**", or '' when the text names none. */
export function agreementVersionOf(markdown) {
  const m = /\*\*Version:\*\*\s*([^\s*]+)/.exec(String(markdown || ''));
  return m ? m[1] : '';
}
