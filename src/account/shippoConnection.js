// Provider-return presentation only. Authority and credentials stay on the server.
export function shippoConnectionWords(connection = {}) {
  const detail = connection.detail || {};
  const active = connection.status === 'ACTIVE';
  const stage = String(detail.oauthStage || '');
  const working = !active && ['processing', 'verifying'].includes(stage);
  const failed = !active && (stage === 'failed' || detail.failed === true);
  const disconnected = connection.status === 'REJECTED' || detail.disconnected === true;
  const verifiedIdentity = detail.identityVerified === true;
  const identity = active
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
  return {
    identity: [identity, summary].filter(Boolean).join(' · '),
    label: active ? 'connected' : stage === 'processing' ? 'processing authorization' : stage === 'verifying' ? 'verifying account' : disconnected ? 'disconnected' : failed ? 'authorization failed' : detail.declined ? 'declined' : 'awaiting authorization',
    kind: active ? 'verified' : disconnected || failed ? 'bad' : 'pending',
    needs: notices.join(' ') || (active ? '' : fallback),
    canAuthorize: !active && !working,
    canCheck: true
  };
}

export function shippoReturnWords(outcome) {
  if (outcome === 'failed') return 'Shippo authorization did not finish. The connection below retains the diagnostic.';
  if (outcome === 'processing') return 'Shippo authorization is still being processed. Check the connection below; do not start another signup.';
  if (outcome === 'verifying') return 'Shippo authorization was received. Check the connection below to finish account verification.';
  if (outcome === 'declined') return 'Shippo authorization was declined.';
  return 'Returned from Shippo. Checking the connected account and its identity…';
}
