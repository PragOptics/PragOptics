export function isManagedPrintful(connection) {
  return connection?.provider === 'printful' && connection?.detail?.managed === 'printful-connect';
}

export function printfulConnectionWords(connection) {
  const detail = connection?.detail || {};
  const connected = connection?.status === 'ACTIVE';
  const status = connected ? 'connected' : detail.disconnected ? 'disconnected' : detail.declined ? 'declined' : detail.awaitingConfirm ? 'finishing authorization' : 'waiting for authorization';
  return {
    connected, status,
    identity: detail.storeName || 'Printful store not yet verified',
    needs: connected ? '' : connection?.lastError || (detail.awaitingConfirm
      ? 'Return using the PragOptics account that started this connection to finish authorization.'
      : 'Sign in at Printful, select your store and approve PragOptics.'),
    billing: 'Printful bills your account when you confirm fulfillment. Connecting a store does not place an order.'
  };
}
