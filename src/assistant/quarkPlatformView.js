import { capabilityFamilies, findCapabilities, capabilityDestination, setupView, isLaunchRequest } from './quarkPlatform.js';
import { shopifyIntent, supplierSearchPhrase } from '../account/shopifySupplier.js';

export const escapeQuark = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e = escapeQuark;
const button = (label, action, attributes = '') => `<button type="button" class="quark-btn quark-ghost" data-quark="${action}" ${attributes}>${e(label)}</button>`;
const actions = html => `<div class="quark-card-actions">${html}</div>`;
const go = (label, destination, card = '', row = '') => button(label, 'go', `data-to="${e(destination)}" data-card="${e(card)}" data-row="${e(row)}"`);
const label = capability => capability.id.split('.').at(-1).replace(/-/g, ' ');

export function platformIndex(capabilities) {
  const groups = capabilityFamilies(capabilities);
  if (!groups.length) return 'I could not read the platform knowledge. I can still open your account, but I cannot confirm capabilities or current setup.' + actions(go('Open account', 'home'));
  return `The platform declares ${capabilities.length} capabilities. Choose an area, or tell me the outcome you want.` + actions(groups.map(group => button(`${group.title} (${group.capabilities.length})`, 'family', `data-id="${e(group.id)}"`)).join(''));
}

export function capabilityDetails(capability, context) {
  const destination = capabilityDestination(capability, context);
  const scope = capability.scope === 'user-environment' ? 'This belongs to the selected environment.' : capability.scope === 'platform' ? 'This is a platform capability.' : 'The platform supplies the machinery; the selected environment keeps its own authority and data.';
  const prerequisites = (capability.when || []).filter(Boolean);
  return `<div class="quark-card"><div class="quark-card-t">${e(capability.what || label(capability))}</div><p>${e(scope)}</p>` +
    (prerequisites.length ? `<p>Requires: ${e(prerequisites.join('; '))}.</p>` : '') +
    `<p>Done when: ${e(capability.doneState || 'The platform reports the requested outcome.')}</p>` +
    (destination ? actions(button('Open this workflow', 'open-capability', `data-id="${e(capability.id)}"`)) : '<p>This has no direct action available in your current account view. Background processing and external approvals keep their own guards.</p>') + '</div>';
}

export function actualSetup(value) {
  const view = setupView(value);
  if (!view) return 'I could not read your current setup. I have not marked any step complete.' + actions(go('Open your environment', 'environment'));
  const states = {done:'Done',next:'Next',open:'Available',waiting:'Waiting',off:'Unavailable'};
  const next = view.next;
  const intro = next ? `Next: ${e(next.title)}. ${e(next.why || '')}` : view.waiting.length ? 'The remaining steps are waiting on their prerequisites.' : 'There is no required open setup step. Optional workflows keep their own requirements.';
  const nextButton = next?.link?.section ? actions(go(next.title, next.link.section === 'billing' ? 'subscription' : next.link.section, next.link.card || '')) : '';
  return `${intro}${nextButton}<ul class="quark-steps">${view.steps.map(step=>`<li><b>${e(states[step.state] || 'Unverified')}: ${e(step.title)}</b>${step.optional ? ' (optional)' : ''}${step.why ? ` — ${e(step.why)}` : ''}</li>`).join('')}</ul>`;
}

function values(result) { return (Array.isArray(result?.rows) ? result.rows : []).map(row=>row?.value).filter(value=>value && typeof value === 'object' && !Array.isArray(value)); }
function supplierButtons(connection) {
  const id = e(connection.id), available = connection.status === 'ACTIVE';
  return actions(button('Check provider access', 'supplier-action', `data-action="check" data-id="${id}"`) +
    (available ? button('Sync products', 'supplier-action', `data-action="sync" data-id="${id}"`) + go('Review a supplier order', 'shopify-review', 'connections', connection.id) : go('Open supplier approval', 'environment', 'connections', connection.id)));
}

export function supplierResult(action, result) {
  if (action === 'sync') return `Product sync finished. ${Number.isFinite(result?.written) ? `${result.written} product records written. ` : ''}${Number.isFinite(result?.removed) ? `${result.removed} obsolete records removed. ` : ''}These are supplier records in this environment.`;
  if (action === 'tracking') {
    const order = result.order || result;
    const tracking = Array.isArray(order.tracking) ? order.tracking : [];
    return `${e(order.name || order.supplierOrderId || 'Supplier order')}: ${e(order.status || 'Status not reported')}.` +
      (tracking.length ? `<ul>${tracking.map(t=>`<li>${e(t.company || '')} ${e(t.number || '')}</li>`).join('')}</ul>` : '<p>No tracking was reported.</p>');
  }
  const connection = result.connection;
  return connection ? `${e(connection.label || connection.detail?.shop || 'Supplier')}: ${e(connection.message || connection.status || 'Status not reported')}.` : 'The provider check returned. Open Connected accounts for the recorded result.';
}

async function shopifyAnswer(text, guide) {
  const intent = shopifyIntent(text);
  if (intent === 'discovery' && !/\b(?:sync|catalog|products|orders|tracking|status|connected)\b/i.test(text)) {
    const query = supplierSearchPhrase(text);
    return 'Find the supplier by brand or product, verify the business and its dealer terms, then send its Shopify administrator an approval link. The supplier approves in its own account.' +
      actions(button('Find a supplier', 'go', `data-to="shopify-discovery" data-query="${e(query)}"`));
  }
  const list = await guide.read('connections');
  const connections = (list.connections || []).filter(row=>row.provider === 'shopify' && row.detail?.managed === 'shopify-supplier');
  const active = connections.filter(row=>row.status === 'ACTIVE');
  if (/\bsync\b.{0,30}\b(?:products|catalog)\b/i.test(text) && active.length === 1) return supplierResult('sync', await guide.supplierAction('sync', active[0].id));
  if (/\b(?:products|catalog)\b/i.test(text)) {
    const result = await guide.read('catalog'), products = values(result);
    return `Supplier catalog in the selected ${e(guide.scope().lane)} environment lane. Showing up to 50 stored records.` +
      (products.length ? `<ul>${products.map(p=>`<li><b>${e(p.title || p.name || p.productId)}</b>${p.supplierName ? ` — ${e(p.supplierName)}` : ''}${Array.isArray(p.variants) ? `<ul>${p.variants.map(v=>`<li>${e(v.sku || v.title || 'Variant')}: ${e(p.currency || '')} ${e(v.price ?? 'price not reported')}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>` : '<p>No product records were returned. Sync an approved supplier first.</p>') +
      actions(go('Open supplier data', 'environment', 'data')) + connections.map(supplierButtons).join('');
  }
  if (/\b(?:orders|tracking|fulfillment|fulfilment)\b/i.test(text)) {
    const orders = values(await guide.read('orders'));
    return `Shopify supplier orders in the selected ${e(guide.scope().lane)} environment lane. These are separate from the PragOptics Hardware Shop.` +
      (orders.length ? `<ul>${orders.map(order=>{
        const connectionId = order.connectionId || order.supplier || '';
        const canCheck = connections.some(c=>c.id === connectionId && c.status === 'ACTIVE') && /^gid:\/\/shopify\/Order\/\d+$/.test(order.supplierOrderId || '');
        return `<li><b>${e(order.name || order.supplierOrderId)}</b> — ${e(order.status || 'Status not reported')}${Array.isArray(order.tracking) ? `<ul>${order.tracking.map(t=>`<li>${e(t.company)} ${e(t.number)}</li>`).join('')}</ul>` : ''}${canCheck ? actions(button('Refresh tracking', 'supplier-action', `data-action="tracking" data-id="${e(connectionId)}" data-order="${e(order.supplierOrderId)}"`)) : ''}</li>`;
      }).join('')}</ul>` : '<p>No supplier order records were returned.</p>') + actions(go('Open supplier-order data', 'environment', 'data'));
  }
  return 'Shopify supplier relationships for this environment. A recorded connection is distinct from a fresh provider-access check.' +
    (connections.length ? connections.map(connection=>`<div class="quark-card"><b>${e(connection.label || connection.detail?.shop || connection.id)}</b><p>${e(connection.status || 'Unknown')}</p>${supplierButtons(connection)}</div>`).join('') : '<p>No Shopify supplier relationship was returned.</p>') +
    actions(go('Open Connected accounts', 'environment', 'connections'));
}

export async function answerPlatform(text, { capabilities, guide, context }) {
  const input = String(text || '').trim();
  if (input.startsWith('capability:')) {
    const capability = capabilities?.find(c=>c.id === input.slice(11));
    return capability ? capabilityDetails(capability, context()) : 'That capability is not in the current platform knowledge.';
  }
  if (input.startsWith('family:')) {
    const group = capabilityFamilies(capabilities || []).find(g=>g.id === input.slice(7));
    return group ? `${e(group.title)}: ${group.capabilities.length} declared capabilities.` + actions(group.capabilities.map(c=>button(c.what || label(c), 'capability', `data-id="${e(c.id)}"`)).join('')) : platformIndex(capabilities || []);
  }
  if (shopifyIntent(input)) return shopifyAnswer(input, guide);
  if (isLaunchRequest(input) || /\b(?:next step|my progress|my setup|what is left|what remains|setup status)\b/i.test(input)) return actualSetup(await guide.read('setup'));
  if (/\b(?:capabilities|everything|whole platform|all features|what can .*platform|what does .*platform|what can this do)\b/i.test(input)) return platformIndex(capabilities || []);
  const matches = findCapabilities(capabilities || [], input);
  if (matches.length === 1) return capabilityDetails(matches[0], context());
  if (matches.length) return 'These platform workflows match your request. Choose the outcome you mean.' + actions(matches.map(c=>button(c.what || label(c), 'capability', `data-id="${e(c.id)}"`)).join(''));
  return platformIndex(capabilities || []);
}
