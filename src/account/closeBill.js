// src/account/closeBill.js
//
// THE FINAL BILL OF A CLOSING (decision 19; 37(1) for a close for cause), read one way by the three closers: the owner's
// own Close account (account.js closeAccountPrompt), the Users desk's Close account (account.js openUserManage) and
// the Community standards window's Close for cause (conductDesk.js). Each route answers an account still holding
// Microsoft license commitments with 409 COMMITMENT_CONFIRM (no amount was sent) or COMMITMENT_CHANGED (the amount sent
// is no longer the one owed), carrying the server's sentence (error), totalCents, totalText and the lines; the owner's
// route answers its whole summary (taxCents, subtotalCents, paidCents, confirmNeeded) BEFORE it checks the password and
// the code. The next press sends totalCents back as acceptRemainingCents.

import { cents } from '../ui/words.js';

function num(v) { return v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Math.round(Number(v)); }

/** The bill a closing refusal carries, or null when the refusal is not about the final bill. */
export function closeBillOf(ex) {
  const d = ex?.data || {};
  if (d.code !== 'COMMITMENT_CONFIRM' && d.code !== 'COMMITMENT_CHANGED') return null;
  const totalCents = Math.max(0, num(d.totalCents) || 0);
  return {
    totalCents,
    totalText: String(d.totalText || '') || cents(totalCents),
    lines: Array.isArray(d.lines) ? d.lines : [],
    taxCents: num(d.taxCents),
    subtotalCents: num(d.subtotalCents),
    paidCents: num(d.paidCents),
    sentence: String(d.error || ''),
    moved: d.code === 'COMMITMENT_CHANGED',
    // the owner's route checks the amount before the proofs: a code sent with that press is still good
    beforeProofs: Object.prototype.hasOwnProperty.call(d, 'confirmNeeded')
  };
}

/** The closing button's words for a bill: "Close and charge $X" for an operator, "Close and pay $X" for the owner. */
export function closeChargeWord(bill, { owner = false } = {}) {
  const amount = bill?.totalText || cents(bill?.totalCents);
  return `${owner ? 'Close and pay' : 'Close and charge'} ${amount}`;
}
