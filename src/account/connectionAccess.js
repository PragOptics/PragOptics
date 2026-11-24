// Presentation of server-authorized access only; authorization stays in the API.
export function connectionAccessMode(response) {
  const access = response?.access;
  return access?.kind === 'shopify-review' && Number.isFinite(Date.parse(access.expiresAt))
    ? { kind: 'shopify-review', expiresAt: access.expiresAt } : null;
}
export function connectionOptions(managed, credentials, access) {
  return access?.kind === 'shopify-review'
    ? { managed: managed.filter(([id]) => id === 'm:shopify'), credentials: [] }
    : { managed, credentials };
}
export function connectionAccessNote(access) {
  return access?.kind === 'shopify-review'
    ? 'Complimentary Shopify review access expires ' + new Date(access.expiresAt).toLocaleString() + '. Your billing plan remains Free. Other paid integrations are unavailable.' : '';
}
