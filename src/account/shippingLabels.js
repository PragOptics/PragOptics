import { esc } from '../ui/words.js';
import { iconBtn, ico } from './cards.js';
import { trackingWords } from './shippingTracking.js';

const VIEW_KEY = 'pragoptics_shipping_labels_view_v1';
export function labelView() { try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'; } catch { return 'list'; } }
export function rememberLabelView(view) { if (['list', 'cards'].includes(view)) try { localStorage.setItem(VIEW_KEY, view); } catch {} }
export function labelGroups(labels = [], tracking = {}) {
  const active = [], history = [];
  for (const label of labels) {
    const status = String(label.status || '').toUpperCase();
    if (status === 'ERROR') continue;
    const delivery = String(tracking[label.transactionId]?.status || label.trackingStatus || '').toUpperCase();
    (['REFUNDED', 'REFUNDPENDING'].includes(status) || ['DELIVERED', 'RETURNED'].includes(delivery) ? history : active).push(label);
  }
  return { active, history };
}
function labelState(status) { return ({ SUCCESS: 'Bought', REFUNDPENDING: 'Refund pending', REFUNDED: 'Refunded', REFUNDREJECTED: 'Refund declined', QUEUED: 'Finishing', WAITING: 'Finishing' })[String(status || '').toUpperCase()] || String(status || 'Pending'); }
export function shippingLabelsHtml({ labels, tracking = {}, filter = 'active', view = 'list', armed = '', formatDate = value => value, nextPage = null, loadingMore = false } = {}) {
  if (labels == null) return '<p class="acct-loading">Loading labels…</p>';
  const groups = labelGroups(labels, tracking), total = groups.active.length + groups.history.length;
  const button = (action, value, text, selected) => `<button type="button" class="btn btn-sm ${selected ? 'is-on' : ''}" data-env-action="${action}" data-value="${value}" aria-pressed="${selected}">${text}</button>`;
  const controls = `<div class="ev-label-controls"><div role="group" aria-label="Filter labels">${button('ship-label-filter', 'active', `Active (${groups.active.length})`, filter === 'active')}${button('ship-label-filter', 'history', `History (${groups.history.length})`, filter === 'history')}${button('ship-label-filter', 'all', `All (${total})`, filter === 'all')}</div><div role="group" aria-label="Labels view">${button('ship-label-view', 'list', 'List', view === 'list')}${button('ship-label-view', 'cards', 'Cards', view === 'cards')}</div></div>`;
  const actions = label => `<span class="act-row">${label.trackingNumber ? iconBtn('ship-track', 'search', 'Check tracking', `data-id="${esc(label.transactionId)}"`) : ''}${label.transactionId ? iconBtn('ship-label-open', 'external', 'Open the label PDF', `data-id="${esc(label.transactionId)}"`) : ''}${label.status === 'SUCCESS' ? (armed === label.transactionId ? `<button class="btn btn-sm btn-ico is-armed" type="button" data-env-action="ship-refund" data-id="${esc(label.transactionId)}" aria-label="Refund? Press again to confirm." data-tip="Press again to confirm">${ico('trash')}<span>Refund?</span></button>${iconBtn('ship-refund-cancel', 'x', 'Keep it', '', 'btn-arm-cancel')}` : iconBtn('ship-refund', 'trash', 'Refund this label', `data-id="${esc(label.transactionId)}"`, 'is-risky')) : ''}</span>`;
  const values = label => ({ number: esc(label.trackingNumber || 'Pending'), label: esc(labelState(label.status)), delivery: esc((tracking[label.transactionId]?.status || label.trackingStatus) ? trackingWords(tracking[label.transactionId]?.status || label.trackingStatus) : 'Not checked'), date: esc(label.createdAt ? formatDate(label.createdAt) : '—'), labelClass: label.status === 'SUCCESS' ? 'is-verified' : /^REFUND/.test(label.status) ? 'is-quiet' : '' });
  const group = (key, heading) => {
    const rows = groups[key];
    if (!rows.length) return `<section class="ev-label-group"><h5>${heading}</h5><p class="acct-empty">${key === 'active' ? 'No active labels. Refunded and completed labels are in History.' : 'No refunded or completed labels.'}</p></section>`;
    const content = view === 'cards' ? `<div class="ev-label-cards">${rows.map(label => { const v = values(label); return `<article class="ev-label-card"><header><strong>${v.number}</strong>${label.test ? '<span class="acct-tag">Test</span>' : ''}</header><dl><div><dt>Label</dt><dd><span class="acct-tag ${v.labelClass}">${v.label}</span></dd></div><div><dt>Delivery</dt><dd><span class="acct-tag">${v.delivery}</span></dd></div><div><dt>Purchased</dt><dd>${v.date}</dd></div></dl><footer>${actions(label)}</footer></article>`; }).join('')}</div>` : `<div class="adm-table-scroll ev-label-scroll"><table class="adm-table ev-label-table"><thead><tr><th>Tracking number</th><th>Label</th><th>Delivery</th><th>Purchased</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(label => { const v = values(label); return `<tr><td class="ev-label-number">${v.number}${label.test ? ' <span class="acct-tag">Test</span>' : ''}</td><td><span class="acct-tag ${v.labelClass}">${v.label}</span></td><td><span class="acct-tag">${v.delivery}</span></td><td>${v.date}</td><td class="ev-actions-cell">${actions(label)}</td></tr>`; }).join('')}</tbody></table></div>`;
    return `<section class="ev-label-group" aria-label="${heading}"><h5>${heading} <span>${rows.length}</span></h5>${content}</section>`;
  };
  return `<div class="ev-labels" data-label-view="${view === 'cards' ? 'cards' : 'list'}">${controls}${filter === 'all' ? group('active', 'Active labels') + group('history', 'Label history') : filter === 'history' ? group('history', 'Label history') : group('active', 'Active labels')}${nextPage ? `<div class="ev-key-row"><button type="button" class="btn btn-sm" data-env-action="ship-label-more" ${loadingMore ? 'disabled aria-busy="true"' : ''}>${loadingMore ? 'Loading…' : 'Load earlier labels'}</button><span class="acct-card-note">${total} labels loaded</span></div>` : ''}</div>`;
}
