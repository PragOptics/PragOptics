export function microsoftWriteAccess(connection = {}) {
  const detail = connection.detail || {};
  const active = connection.status === 'ACTIVE';
  const pending = detail.writeAccessPending === true;
  const needsApproval = detail.writeAccessNeedsApproval === true;
  const supported = detail.writeAccessSupported === true || pending || ['canWrite', 'canCreateLists', 'canWriteItems'].some(key => typeof detail[key] === 'boolean');
  const enabled = detail.canWrite === true || (detail.canCreateLists === true && detail.canWriteItems === true);
  const state = needsApproval ? 'Your Microsoft organization requires administrator approval before SharePoint publishing can be enabled. Your existing read connection is retained.'
    : pending && detail.awaitingConfirm ? 'Finish the Microsoft sign-in on this PragOptics page, or cancel publishing approval. Your existing connection is retained.'
    : pending ? 'SharePoint publishing approval is in progress. Your existing connection is retained. Continue in Microsoft, or cancel this approval.'
      : enabled ? 'SharePoint list creation and data publishing are enabled for the access this Microsoft account has.'
        : active && !supported ? 'Connected for reading. Check this connection to verify SharePoint publishing availability.'
          : active ? 'Connected for reading. Publishing a Studio export to SharePoint needs your additional approval.' : '';
  return { pending, needsApproval, enabled, supported, canUpgrade: active && supported && !pending && !enabled && !needsApproval,
    words: [state, String(detail.writeAccessError || '').trim()].filter(Boolean).join(' ') };
}
