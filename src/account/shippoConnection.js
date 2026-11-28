// Provider-return presentation only. Authority and credentials stay on the server.
export function shippoCanBuy(connection) {
  const d = connection?.detail;
  return connection?.status === 'ACTIVE' && d?.oauthStage === 'connected' && d.identityVerified === true && !d.historyOnly &&
    d.requiresAccountConfirmation !== true && !!d.shippoAccountId && d.confirmedAccountId === d.shippoAccountId &&
    !!d.shippoAccountEmail && d.confirmedAccountEmail === d.shippoAccountEmail;
}

export function shippoConnectionWords(connection = {}) {
  const detail = connection.detail || {};
  const active = connection.status === 'ACTIVE';
  const stage = String(detail.oauthStage || '');
  const working = !active && ['processing', 'verifying', 'awaiting_confirmation'].includes(stage);
  const failed = !active && (stage === 'failed' || detail.failed === true);
  const disconnected = connection.status === 'REJECTED' || detail.disconnected === true;
  const verifiedIdentity = detail.identityVerified === true;
  const historyOnly = detail.historyOnly === true;
  const confirmed = shippoCanBuy(connection);
  const review = !historyOnly && !confirmed && (active || ['verifying', 'awaiting_confirmation'].includes(stage));
  const rejected = stage === 'account_rejected';
  const newAttempt = ['account_mismatch', 'identity_unavailable', 'intent_required'].includes(stage);
  const intended = String(detail.intendedEmail || '').trim().toLowerCase();
  const matchesIntent = !!intended && intended === String(detail.shippoAccountEmail || '').trim().toLowerCase();
  const identity = active || stage === 'awaiting_confirmation' || (stage === 'verifying' && verifiedIdentity)
    ? (verifiedIdentity && (detail.shippoAccountEmail || detail.shippoAccountId)
      ? [detail.shippoAccountEmail, detail.shippoAccountId].filter(Boolean).join(' · ')
      : 'Shippo account identity has not been verified')
    : (stage === 'verifying' ? 'Authorization received; checking the Shippo account' : 'Shippo account not yet confirmed');
  const count = Number(detail.carrierAccounts);
  const summary = active && Number.isFinite(count) ? `${count} carrier ${count === 1 ? 'account' : 'accounts'}` : '';
  const fallback = stage === 'processing' ? 'Shippo authorization is being processed. Check the connection again; a second signup is not needed.'
    : stage === 'verifying' ? 'Authorization was received. Check the connection again to finish verification; your saved authorization will be reused.'
      : disconnected ? 'This Shippo authorization is no longer available. Connect the account again.'
        : failed ? 'Shippo authorization did not finish. Review the diagnostic before trying again.'
          : 'At Shippo, sign in or create the account you want this environment to use.';
  const notices = [String(connection.lastError || '').trim(), active && !verifiedIdentity ? String(detail.identityWarning || 'Check which Shippo account is connected before purchasing a label.') : ''].filter(Boolean);
  const diagnostic = String(detail.oauthErrorCode || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
  if (diagnostic && !active && !notices.some(text => text.includes(diagnostic))) notices.push(`Shippo diagnostic: ${diagnostic}${Number(detail.oauthHttpStatus) ? ` (HTTP ${Number(detail.oauthHttpStatus)})` : ''}.`);
  const previous = detail.lastAuthorizationFailure;
  const previousCode = String(previous?.code || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
  if (active && previousCode && Number.isFinite(Date.parse(previous?.at)) && Date.parse(detail.authorizedAt) > Date.parse(previous.at)) {
    notices.push(`Earlier authorization attempt: ${previousCode}${Number(previous.httpStatus) ? ` (HTTP ${Number(previous.httpStatus)})` : ''}. A later authorization completed successfully.`);
  }
  if (historyOnly) notices.push('Past labels stay available in Shipping.');
  else if (rejected) notices.push('You declined this billing account. Choose the Shippo email for a new authorization.');
  else if (newAttempt) notices.push(shippoReturnWords(stage));
  else if (stage === 'preparing_storage') notices.push('PragOptics is preparing secure storage for this connection. Retry secure setup to continue to Shippo.');
  else if (!active && stage === 'awaiting_confirmation' && !matchesIntent) notices.push('Choose a different account to restart authorization with your intended Shippo email.');
  else if (review) notices.push(verifiedIdentity && detail.confirmationId
    ? 'Confirm the Shippo account that should pay for new shipping labels.'
    : 'Check the connection again for the provider account details needed to confirm new label purchases.');
  return {
    identity: [identity, summary].filter(Boolean).join(' · '),
    label: historyOnly ? 'label history only' : confirmed ? 'confirmed for shipping' : stage === 'verifying' ? 'verifying account' : review ? 'confirmation needed' : stage === 'account_mismatch' ? 'account mismatch' : newAttempt ? 'account selection needed' : rejected ? 'choose another account' : stage === 'preparing_storage' ? 'preparing secure connection' : stage === 'processing' ? 'processing authorization' : disconnected ? 'disconnected' : failed ? 'authorization failed' : detail.declined ? 'declined' : 'awaiting authorization',
    kind: confirmed ? 'verified' : disconnected || failed ? 'bad' : 'pending',
    needs: notices.join(' ') || (active ? '' : fallback),
    canAuthorize: !active && !working && !historyOnly,
    canConfirm: review && stage === 'awaiting_confirmation' && !!detail.confirmationId && verifiedIdentity &&
      detail.lastCheckSucceeded === true && !!detail.shippoAccountId && !!detail.shippoAccountEmail &&
      (matchesIntent || (active && !intended)) && (!detail.confirmedAccountId || detail.confirmedAccountId === detail.shippoAccountId),
    canReject: review && !!detail.confirmationId,
    canCheck: stage !== 'preparing_storage' && !newAttempt && !rejected
  };
}

export function shippoReturnWords(outcome) {
  if (outcome === 'account_rejected') return 'You declined this billing account. Choose the Shippo email for a new authorization.';
  if (outcome === 'preparing_storage') return 'PragOptics is preparing secure storage for this connection.';
  if (outcome === 'account_mismatch') return 'Shippo returned a different account. Nothing was connected. Choose the account you want and sign in again at Shippo.';
  if (outcome === 'identity_unavailable') return 'Shippo could not verify the account email. Nothing was connected. Choose the intended account to retry.';
  if (outcome === 'intent_required') return 'Choose your Shippo account email to start a new authorization.';
  if (outcome === 'awaiting_confirmation' || outcome === 'confirmation') return 'Review the Shippo account below and choose whether to use it for new labels.';
  if (outcome === 'failed') return 'Shippo authorization did not finish. The connection below retains the diagnostic.';
  if (outcome === 'processing') return 'Shippo authorization is still being processed. Check the connection below; do not start another signup.';
  if (outcome === 'verifying') return 'Shippo authorization was received. Check the connection below to finish account verification.';
  if (outcome === 'declined') return 'Shippo authorization was declined.';
  return 'Returned from Shippo. Checking the connected account and its identity…';
}
