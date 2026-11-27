import { esc } from '../ui/words.js';
import { writeClipboard } from '../ui/clipboard.js';
import { openModal, ico } from './cards.js';
import { sessionVersion, assertSessionVersion, registerPrivateModal } from './sessionPrivacy.js';
import { mountTrackingMap, trackingLocationWords } from './shippingMap.js';

export const TRACKING_WORDS = { UNKNOWN: 'Awaiting tracking', PRE_TRANSIT: 'Label created', TRANSIT: 'In transit', DELIVERED: 'Delivered', RETURNED: 'Returned to sender', FAILURE: 'Delivery issue' };
export function trackingWords(status) { return TRACKING_WORDS[String(status || '').toUpperCase()] || 'Awaiting tracking'; }
function dateWords(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
export function trackingEvents(data) {
  const events = [...(Array.isArray(data.history) ? data.history : [])];
  const current = data.current || (!Array.isArray(data.history) && (data.status || data.detail) ? { status: data.status, detail: data.detail, at: '', location: null } : null);
  const key = event => JSON.stringify([event.status, event.detail, event.at, event.location]);
  if (current && !events.some(event => key(event) === key(current))) events.push(current);
  return events.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}
export function trackingBody(data) {
  const status = String(data.status || 'UNKNOWN').toUpperCase(), current = data.current || {}, events = trackingEvents(data);
  const stageOf = event => ['DELIVERED', 'RETURNED'].includes(event?.status) ? 4 : /out_for_delivery/i.test(event?.substatus?.code || '') ? 3 : event?.status === 'TRANSIT' ? 2 : 0;
  const progress = Math.max(stageOf({ ...current, status }), ...events.map(stageOf), 0);
  const steps = ['Label created', 'With carrier', 'In transit', 'Out for delivery', status === 'RETURNED' ? 'Returned to sender' : 'Delivered'];
  return `<div class="shipment-status ${status === 'FAILURE' || status === 'RETURNED' ? 'has-issue' : ''}">
    <span class="shipment-status-icon">${ico(status === 'DELIVERED' ? 'checkCircle' : status === 'FAILURE' ? 'alert' : 'truck')}</span>
    <div><span class="shipment-eyebrow">${esc(String(data.carrier || 'Carrier').toUpperCase())}${data.service ? ` · ${esc(data.service)}` : ''}</span>
      <h4>${esc(trackingWords(status))}</h4><p>${esc(data.detail || 'The carrier has not supplied an update yet.')}</p></div>
    <span class="shipment-status-tag">${esc(trackingWords(status))}</span>
  </div>
  <ol class="shipment-progress" aria-label="Delivery progress">${steps.map((step, index) => `<li class="${index < progress ? 'is-complete' : index === progress ? 'is-current' : ''}" ${index === progress ? 'aria-current="step"' : ''}><span>${index < progress ? '✓' : index + 1}</span>${esc(step)}</li>`).join('')}</ol>
  <div class="shipment-route"><div><span class="shipment-eyebrow">From</span><strong>${esc(trackingLocationWords(data.origin) || 'Not supplied by carrier yet')}</strong></div><span aria-hidden="true">→</span><div><span class="shipment-eyebrow">To</span><strong>${esc(trackingLocationWords(data.destination) || 'Not supplied by carrier yet')}</strong></div></div>
  <dl class="shipment-facts"><div><dt>Tracking number</dt><dd>${esc(data.trackingNumber || 'Pending')}</dd></div><div><dt>Expected delivery</dt><dd>${esc(dateWords(data.eta) || 'Not supplied yet')}</dd></div><div><dt>Last carrier event</dt><dd>${esc(dateWords(current.at) || 'Time not supplied')}</dd></div><div><dt>Checked</dt><dd>${esc(dateWords(data.checkedAt) || 'Just now')}</dd></div></dl>
  <div class="shipment-map" id="shipmentMap" role="region" aria-label="Shipment locations"><span>Preparing shipment map…</span></div>
  <p class="shipment-map-note" id="shipmentMapNote" aria-live="polite"></p>${data.locationNote ? `<p class="shipment-request-status is-error">${esc(data.locationNote)}</p>` : ''}
  <div class="shipment-events-head"><h4>Tracking events</h4><span>${events.length} ${events.length === 1 ? 'event' : 'events'}</span></div>
  <ol class="shipment-events">${events.length ? events.map((event, index) => ({ event, index })).reverse().map(({ event, index }) => `<li><span class="shipment-event-dot" aria-hidden="true"></span><div><div class="shipment-event-top"><strong>${esc(trackingWords(event.status))}</strong>${event.at ? `<time datetime="${esc(event.at)}">${esc(dateWords(event.at))}</time>` : ''}</div><p>${esc(event.detail || 'No additional detail supplied.')}</p>${event.location ? `<button type="button" class="shipment-event-location" data-shipment-event="${index}">${ico('globe')}${esc(trackingLocationWords(event.location))}</button>` : ''}${event.substatus?.text ? `<p class="shipment-event-sub ${event.substatus.actionRequired ? 'needs-action' : ''}">${esc(event.substatus.text)}</p>` : ''}</div></li>`).join('') : '<li class="shipment-no-events">The label exists. Carrier scans will appear here when reported.</li>'}</ol>`;
}
let activeClose = null;
export function closeShipmentTracking() { activeClose?.(); }
export function openShipmentTracking({ read, onResult = () => {}, onClose = () => {}, isCurrent = () => true, errorText = error => error?.message || 'Tracking could not be read. Try again.' }) {
  closeShipmentTracking();
  const session = sessionVersion(), returnFocus = document.activeElement;
  let modal, closed = false, busy = false, version = 0, map = null, data = null, observer = null, unregister = () => {};
  const close = () => {
    if (closed) return;
    closed = true; version++; observer?.disconnect(); window.removeEventListener('hashchange', close);
    map?.dispose(); unregister(); modal?.close(); if (activeClose === close) activeClose = null;
    if (isCurrent()) { if (returnFocus?.isConnected) returnFocus.focus(); else onClose(); }
  };
  modal = openModal('evShipmentTracking', `<div class="acct-modal-mask" data-shipment-action="close"></div><div class="modal-card shipment-dialog" role="dialog" aria-modal="true" aria-labelledby="shipmentTrackingTitle"><div class="modal-head"><h3 class="modal-title" id="shipmentTrackingTitle">Shipment tracking</h3><button class="modal-close" type="button" aria-label="Close" data-shipment-action="close">✕</button></div><div class="modal-body shipment-body"><p id="shipmentRequestStatus" class="shipment-request-status" role="status" aria-live="polite">Checking carrier tracking…</p><div id="shipmentTrackingBody"></div></div><div class="modal-foot shipment-foot"><button type="button" class="btn" data-shipment-action="copy">${ico('copy')}<span>Copy tracking</span></button><button type="button" class="btn btn-primary" data-shipment-action="refresh">${ico('refresh')}<span>Refresh tracking</span></button></div></div>`, {
    focus: '[data-shipment-action="close"]',
    onClick: event => {
      const action = event.target.closest('[data-shipment-action]')?.dataset.shipmentAction;
      if (action === 'close') close();
      if (action === 'refresh') void refresh();
      if (action === 'copy' && data?.trackingNumber) void writeClipboard(data.trackingNumber).catch(() => {});
      const item = event.target.closest('[data-shipment-event]'); if (item) map?.selectEvent(item.dataset.shipmentEvent);
    },
    onKey: event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const controls = [...modal.host.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')].filter(node => node.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
  });
  activeClose = close; unregister = registerPrivateModal('shipment-tracking-map', close);
  window.addEventListener('hashchange', close);
  const account = document.getElementById('accountView');
  if (account && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => { if (!isCurrent()) close(); });
    observer.observe(account, { childList: true, subtree: true });
  }
  const alive = () => !closed && !modal.host.hidden && isCurrent();
  async function refresh() {
    if (busy || !alive()) return;
    busy = true; const run = ++version;
    const button = modal.$('[data-shipment-action="refresh"]'), note = modal.$('#shipmentRequestStatus');
    button.disabled = true; button.setAttribute('aria-busy', 'true'); button.querySelector('span').textContent = 'Checking…';
    note.textContent = 'Checking carrier tracking…'; note.classList.remove('is-error');
    try {
      const result = await read(); assertSessionVersion(session);
      if (!alive() || run !== version) return;
      data = { ...result, history: trackingEvents(result) }; onResult(data);
      map?.dispose(); map = null;
      modal.$('#shipmentTrackingBody').innerHTML = trackingBody(data);
      note.textContent = 'Tracking updated.';
      const mapRun = run;
      void mountTrackingMap(modal.$('#shipmentMap'), data, { isCurrent: () => alive() && mapRun === version, note: text => { if (alive() && mapRun === version) modal.$('#shipmentMapNote').textContent = text; } }).then(view => { if (alive() && mapRun === version) map = view; else view.dispose(); }).catch(() => { if (alive() && mapRun === version) { modal.$('#shipmentMap').textContent = 'The map could not load. The tracking timeline is still available.'; } });
    } catch (error) {
      if (error?.sessionInvalidated || !isCurrent()) { close(); return; }
      if (alive() && run === version) { note.textContent = `${errorText(error)}${data ? ' The last successful result remains below.' : ''}`; note.classList.add('is-error'); }
    } finally {
      busy = false;
      if (alive() && run === version) { button.disabled = false; button.removeAttribute('aria-busy'); button.querySelector('span').textContent = 'Refresh tracking'; }
    }
  }
  void refresh();
  return { close, refresh, host: modal.host };
}
