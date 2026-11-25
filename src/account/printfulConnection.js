export function isManagedPrintful(connection) {
  return connection?.provider === 'printful' && connection?.detail?.managed === 'printful-connect';
}

export function printfulStoreSettingsUrl(connection) {
  const id = String(connection?.detail?.storeId || '');
  return isManagedPrintful(connection) && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
    ? `https://www.printful.com/dashboard/settings/${id}/store-defaults` : '';
}

export function printfulConnectionWords(connection) {
  const detail = connection?.detail || {};
  const connected = connection?.status === 'ACTIVE';
  const requestedName = String(detail.requestedStoreName || '');
  const namingRequired = !!requestedName && String(detail.storeName || '').trim().normalize('NFC') !== requestedName;
  const status = connected ? 'connected' : detail.disconnected ? 'disconnected' : detail.declined ? 'declined' : detail.awaitingConfirm ? 'finishing authorization' : 'waiting for authorization';
  return {
    connected, status, requestedName, namingRequired, settingsUrl: printfulStoreSettingsUrl(connection),
    identity: detail.storeName || 'Printful store not yet verified',
    needs: connected ? (namingRequired ? `Store name setup is unfinished. Set the name to “${requestedName}” in Printful, then check again.` : '') : connection?.lastError || (detail.awaitingConfirm
      ? 'Return using the PragOptics account that started this connection to finish authorization.'
      : 'Sign in at Printful, select your store and approve PragOptics.'),
    billing: 'Printful bills your account when you confirm fulfillment. Connecting a store does not place an order.'
  };
}
