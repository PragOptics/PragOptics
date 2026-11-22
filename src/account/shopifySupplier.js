export const COLLECTIVE_HELP = 'https://help.shopify.com/en/manual/online-sales-channels/shopify-collective/retailers/discovery';

export function shopifyIntent(text) {
  const words = String(text || '').toLowerCase();
  if (/\bshopify collective\b/.test(words)) return 'discovery';
  if (/\bmy (?:own )?shopify (?:store|shop)\b/.test(words)) return 'connection';
  if (/\b(?:suppliers?|dropship(?:ping)?|wholesale|dealership)\b/.test(words)) return 'discovery';
  return /\bshopify\b/.test(words) ? 'connection' : '';
}

export function supplierSearchPhrase(text) {
  const match = String(text || '').trim().match(/\b(?:suppliers?\s+for|dropship(?:ping)?|wholesale\s+supplier\s+of)\s+(.+?)[?.!]*$/i);
  if (!match || /^(?:a |an |my |the )?(?:shopify |dropshipping )?(?:suppliers?|store|business)\b/i.test(match[1])) return '';
  return match[1].trim().slice(0, 120);
}

export function publicWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function supplierEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && !/[\u0000-\u001f\u007f]/.test(email) && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ? email : '';
}

const MAIL_REFUSALS = new Set(['TENANT_NOT_CONNECTED', 'NO_MAILER', 'NO_RECIPIENT', 'MAIL_SEND_NOT_ALLOWED', 'MAILBOX_GONE', 'MS_NOT_CONSENTED']);

export function supplierName(value) {
  const name = String(value || '').trim();
  return name.length <= 160 && !/[\u0000-\u001f\u007f]/.test(name) ? name : '';
}

export function supplierInquiryResponse(result, recipient, checked) {
  const status = result?.disposition;
  if (result?.submitted === true) {
    return { disposition: 'submitted', note: `Your environment’s mailer accepted the inquiry for ${recipient}. Delivery is unconfirmed. Check Sent Items and watch for a reply.`, error: '' };
  }
  if (status === 'refused') {
    return { disposition: 'refused', note: '', error: 'No inquiry was sent. Check the recipient and your environment’s mailer before trying again.' };
  }
  const prefix = checked ? 'This check sent no email. ' : '';
  if (status === 'absent') {
    return { disposition: 'absent', note: `${prefix}No send receipt was found. Check Sent Items before choosing to send again.`, error: '' };
  }
  return { disposition: status === 'pending' ? 'pending' : 'unknown', note: `${prefix}Sending is unconfirmed. Check Sent Items in your environment’s mailer before sending another inquiry.`, error: '' };
}

export function supplierInquiryFailure(error, checked) {
  const code = error?.data?.code;
  if (code === 'REQUEST_CHANGED') {
    return { disposition: 'refused', error: 'This request belongs to another inquiry. Review the recipient again to start a separate request.' };
  }
  if (checked) return { disposition: 'unknown', error: 'This check sent no email. The previous send is unconfirmed. Check Sent Items or check its status again.' };
  if (MAIL_REFUSALS.has(code) || error?.data?.disposition === 'refused' || [400, 401, 403, 404, 405, 422].includes(error?.status)) {
    const detail = error?.data?.error || ([404, 405].includes(error?.status)
      ? 'Sending is unavailable on this lane. Use the supplier’s published contact page or email.'
      : 'Check the recipient and your environment’s mailer.');
    return { disposition: 'refused', error: `No inquiry was sent. ${detail}` };
  }
  return { disposition: 'unknown', error: 'Sending is unconfirmed. Check Sent Items in your environment’s mailer or check the inquiry status.' };
}

export function supplierMatches(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const name = supplierName(row?.name);
    const storeUrl = publicWebUrl(row?.storeUrl);
    const productTitle = String(row?.productTitle || '').trim();
    const productUrl = publicWebUrl(row?.productUrl);
    if (!name || !storeUrl || !productTitle || !productUrl) return [];
    return [{
      name, storeUrl, productTitle, productUrl,
      contactUrl: publicWebUrl(row.contactUrl), contactEmail: supplierEmail(row.contactEmail),
      contactTopic: String(row.contactTopic || '').trim().slice(0, 120)
    }];
  });
}

export function supplierQuestion() {
  return 'Do you work with online dealers, and can you ship individual orders directly to our customers? If so, could you share your dealer terms and the right contact for getting started?';
}

export function supplierOrderResult(result) {
  const order = result.order || {};
  const reference = order.name || order.supplierOrderId;
  const status = order.status ? ` (${order.status})` : '';
  const placed = reference ? `Shopify placed order ${reference}${status}.` : `Shopify placed the order${status}.`;
  if (result.recorded === true) return `${placed} It was saved to supplier_orders.`;
  if (result.recorded === false) return `${placed} The local record could not be saved. Keep the Shopify order reference and do not place this order again.`;
  return `${placed} Local storage is unconfirmed. Check the Shopify order reference before taking any further action.`;
}

export async function readShopifySupplierMode(apiBase, request = fetch) {
  try {
    const response = await request(`${apiBase}/shopify/catalog/profile`, { cache: 'no-store', credentials: 'omit' });
    if (response.status === 404) return 'legacy';
    if (!response.ok) return 'unavailable';
    const result = await response.json();
    const capability = result?.ucp?.capabilities?.['dev.shopify.catalog.global'];
    return Array.isArray(capability) && capability.length ? 'current' : 'unavailable';
  } catch { return 'unavailable'; }
}

export function shopifyStartFields(mode, value) {
  if (mode === 'legacy') {
    const shop = String(value || '').trim();
    return shop ? { shop } : null;
  }
  if (mode !== 'current') return null;
  const label = supplierName(value);
  return label && label.length <= 60 ? { label } : null;
}

export function shopifyOnboardingUrl(mode, response) {
  return mode === 'legacy' ? response.directUrl || response.url : response.url;
}

export function newSupplierSearch() {
  return { query: '', matches: null, selected: null, busy: '', note: '', error: '', attempt: null, recipientDraft: null, approval: false };
}

export function shopifyDiscoveryHtml(state, { e, stateLead, copy, waiting }) {
  const note = (text) => text ? `<p class="acct-card-note ev-note">${e(text)}</p>` : '';
  const error = state.error ? `<p class="acct-error" role="alert">${e(state.error)}</p>` : '';
  const disabled = state.busy || waiting ? 'disabled' : '';
  const button = (action, icon, label, busyWord, extra = '') => stateLead(`conn-shopify-${action}`, icon, label, {
    out: state.busy === action, busyWord, waiting: waiting || (state.busy && state.busy !== action ? 'Wait for the current request' : '')
  }, extra, 'btn-primary');
  const link = (url, label) => `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>`;
  const back = (label) => `<button class="ev-back" type="button" data-env-action="conn-shopify-discovery-back" ${disabled}>${label}</button>`;
  const result = state.selected;
  if (result) {
    const attempt = state.attempt;
    const canReview = !attempt || attempt.disposition === 'absent' || attempt.disposition === 'refused';
    const contact = result.contactUrl || result.contactEmail
      ? `<p class="acct-card-note ev-note">${result.contactUrl ? link(result.contactUrl, 'Open supplier contact page') : ''}${result.contactUrl && result.contactEmail ? ' · ' : ''}${result.contactEmail ? e(result.contactEmail) : ''}</p>`
      : note('No supplier-published contact was found. Confirm a business address with the supplier before sending an inquiry.');
    const inquiry = canReview ? `
      <label for="evSupplierInquiryEmail">Recipient for the dealership inquiry</label>
      <div class="ev-key-row">
        <input id="evSupplierInquiryEmail" class="acct-input" type="email" autocomplete="off" maxlength="254" ${disabled} value="${e(state.recipientDraft ?? attempt?.recipient ?? result.contactEmail)}">
        ${button('review-inquiry', 'check', 'Review inquiry email', '')}
      </div>` : attempt.disposition === 'review' ? `
      ${note(`Send a dealership inquiry to ${attempt.recipient} from this environment’s mailer?`)}
      ${button('send-inquiry', 'send', 'Send inquiry', 'Sending inquiry…')}
      <button class="ev-back" type="button" data-env-action="conn-shopify-edit-inquiry" ${disabled}>Change recipient</button>`
      : attempt.disposition === 'submitted' ? ''
      : button('check-inquiry', 'check', 'Check inquiry status', 'Checking inquiry…');
    const approval = state.approval ? `
      ${note('Create a link for the Shopify store administrator. You can copy it or enter their designated email after the link is ready. The supplier signs in to Shopify, reviews access, and approves in their own store.')}
      ${button('create-approval', 'send', 'Create approval link', 'Creating approval link…')}`
      : `<button class="ev-back" type="button" data-env-action="conn-shopify-agreed" ${disabled}>We already have a dealership or fulfillment agreement</button>`;
    return `<div class="ev-supplier-details">
      <p class="acct-card-note ev-note"><b>${e(result.name)}</b> · ${link(result.productUrl, result.productTitle)} · ${link(result.storeUrl, 'Seller website')}</p>
      ${note('Ask this business whether it accepts online dealers and ships individual orders to your customers.')}
      ${contact}
      ${result.contactUrl && result.contactTopic ? note(`Choose “${result.contactTopic}” on the contact form.`) : ''}
      ${note(supplierQuestion())}
      <div class="ev-key-row">${copy(supplierQuestion())}</div>
      ${inquiry}
      ${approval}
      ${error}${state.note ? `<p class="acct-card-note ev-note" role="status">${e(state.note)}</p>` : ''}
      ${back('Back to supplier results')}</div>`;
  }
  const matches = state.matches === null ? '' : state.matches.length
    ? `<ul class="ev-supplier-results">${state.matches.map((item, index) => `<li>
        <div class="ev-supplier-offer"><b>${e(item.name)}</b>${link(item.productUrl, item.productTitle)}${link(item.storeUrl, new URL(item.storeUrl).hostname)}</div>
        ${button('select-supplier', 'check', 'Choose this business', '', `data-match="${index}"`)}
      </li>`).join('')}</ul>`
    : note('No matching Shopify sellers found. Try another brand or product, or enter the business name if you already know who will approve.');
  return `
    <label for="evSupplierQuery">Which brand or product would you like to sell?</label>
    <div class="ev-key-row">
      <input class="acct-input" id="evSupplierQuery" type="search" maxlength="120" ${disabled} value="${e(state.query)}">
      ${button('search', 'search', 'Find Shopify sellers', 'Looking up sellers…')}
    </div>
    ${error}${matches}
    ${note('Use Shopify Collective separately if your retailer store and the supplier are eligible. Connect with suppliers inside Shopify.')}
    ${link(COLLECTIVE_HELP, 'How to find suppliers in Shopify Collective')}
    ${back('I know the business name')}`;
}
