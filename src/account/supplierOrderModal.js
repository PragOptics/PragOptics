import { openModal } from './cards.js';
import { supplierOrderReview } from './supplierOrderReview.js';

// One reviewed order component for direct use and Quark navigation. It never owns authority.
export function openSupplierOrderReview({ supplier, choices, address, valid, onPlace, onError, onClose = () => {}, escape }) {
  const e = escape, stillHere = valid;
  const supplierName = supplier.detail?.name || supplier.label || supplier.detail?.shop || 'Supplier';
  const price = (cents, currency) => currency + ' ' + (cents / 100).toFixed(2);
  const addressFields = [['name','Recipient'],['street1','Street'],['street2','Apt or suite'],['city','City'],['state','State or province'],['zip','ZIP or postal code'],['country','Country code'],['phone','Phone (optional)']];
  const picker = () => '<p class="acct-modal-note">Supplier: <b>' + e(supplierName) + '</b> · ' + e(supplier.detail?.shop || '') + '</p>' +
    '<label class="acct-label" for="evSupplierOrderVariant">Product and variant</label><select class="acct-input" id="evSupplierOrderVariant"><option value="">Choose a product variant</option>' +
    choices.map(choice => '<option value="' + e(choice.variantId) + '">' + e(choice.productTitle + (choice.variantTitle && choice.variantTitle !== 'Default Title' ? ' · ' + choice.variantTitle : '') + (choice.sku ? ' · ' + choice.sku : '') + ' · ' + price(choice.unitCents, choice.currency)) + '</option>').join('') + '</select>' +
    '<label class="acct-label" for="evSupplierOrderQuantity">Quantity</label><input class="acct-input" id="evSupplierOrderQuantity" type="number" min="1" max="10000" step="1" value="1">' +
    '<label><input type="checkbox" id="evSupplierOrderShip"' + (address.street1 && address.city && address.zip ? ' checked' : '') + '> Include a shipping address</label>' +
    '<p class="acct-modal-note">Physical products require a shipping address. The supplier verifies the product before any order is placed.</p>' +
    addressFields.map(([key,title]) => '<label class="acct-label" for="evSupplierShip-' + key + '">' + title + '</label><input class="acct-input" id="evSupplierShip-' + key + '" value="' + e(address[key]) + '">').join('') +
    '<p class="acct-modal-note">Catalog estimate only. The supplier’s fulfillment and billing terms apply. No order is placed by opening this review.</p>' +
    '<p class="acct-error" role="alert" id="evSupplierOrderReviewError"></p><div class="acct-modal-actions"><button class="btn btn-sm" type="button" data-shopify-order="cancel">Cancel</button><button class="btn btn-sm btn-primary" type="button" data-shopify-order="review">Review selected order</button></div>';
  let draft = null, formSnapshot = null;
  let modal;
  const close = () => { modal.close(); onClose(); };
  modal = openModal('evConfirmShopifyOrder',
    '<div class="acct-modal-mask" data-shopify-order="cancel"></div><div class="acct-modal" role="dialog" aria-modal="true" aria-labelledby="evShopifyOrderTitle"><h3 class="acct-modal-h" id="evShopifyOrderTitle">Review a supplier order</h3><div id="evSupplierOrderReviewBody">' + picker() + '</div></div>', {
      focus: '#evSupplierOrderVariant',
      onKey: event => { if (event.key === 'Escape') close(); },
      onClick: event => {
        const action = event.target.closest('[data-shopify-order]')?.dataset.shopifyOrder;
        if (action === 'cancel') return close();
        if (!['review','back','confirm'].includes(action)) return;
        if (!stillHere()) { close(); onError('The environment, lane or supplier changed. Review the order again. No order was placed.'); return; }
        const bodyEl = document.getElementById('evSupplierOrderReviewBody');
        if (action === 'back') { draft = null; bodyEl.innerHTML = picker(); if (formSnapshot) { document.getElementById('evSupplierOrderVariant').value = formSnapshot.variantId; document.getElementById('evSupplierOrderQuantity').value = formSnapshot.quantity; document.getElementById('evSupplierOrderShip').checked = formSnapshot.includeAddress; for (const [key] of addressFields) document.getElementById('evSupplierShip-' + key).value = formSnapshot.address[key]; } document.getElementById('evSupplierOrderVariant')?.focus(); return; }
        if (action === 'review') {
          formSnapshot = { variantId: document.getElementById('evSupplierOrderVariant').value, quantity: document.getElementById('evSupplierOrderQuantity').value, includeAddress: document.getElementById('evSupplierOrderShip').checked, address: Object.fromEntries(addressFields.map(([key]) => [key, document.getElementById('evSupplierShip-' + key).value])) };
          try {
            const shipTo = document.getElementById('evSupplierOrderShip').checked ? Object.fromEntries(addressFields.map(([key]) => [key, document.getElementById('evSupplierShip-' + key).value])) : null;
            draft = supplierOrderReview(choices, document.getElementById('evSupplierOrderVariant').value, document.getElementById('evSupplierOrderQuantity').value, shipTo);
            const summary = draft.summary;
            bodyEl.innerHTML = '<p class="acct-modal-note">Place this order with <b>' + e(supplierName) + '</b>?</p><p>' + e(summary.productTitle) + (summary.variantTitle ? ' · ' + e(summary.variantTitle) : '') + (summary.sku ? ' · SKU ' + e(summary.sku) : '') + '</p><p>Quantity: <b>' + summary.qty + '</b></p><p>Catalog estimate: <b>' + e(price(summary.totalCents, summary.currency)) + '</b></p>' +
              (draft.shipTo ? '<p>Ship to: ' + e([draft.shipTo.name,draft.shipTo.street1,draft.shipTo.street2,draft.shipTo.city,draft.shipTo.state,draft.shipTo.zip,draft.shipTo.country,draft.shipTo.phone].filter(Boolean).join(', ')) + '</p>' : '<p>No shipping address included. A physical product will be refused before submission.</p>') +
              '<p class="acct-modal-note">This creates a real supplier order. Your supplier can fulfill it and bill you under your agreement. This does not run the PragOptics Hardware Shop checkout.</p><div class="acct-modal-actions"><button class="btn btn-sm" type="button" data-shopify-order="back">Back</button><button class="btn btn-sm" type="button" data-shopify-order="cancel">Cancel</button><button class="btn btn-sm btn-primary" type="button" data-shopify-order="confirm">Place selected supplier order</button></div>';
            bodyEl.querySelector('[data-shopify-order="back"]')?.focus();
          } catch (error) { document.getElementById('evSupplierOrderReviewError').textContent = error.message; }
          return;
        }
        if (action === 'confirm' && draft) { const reviewed = draft; draft = null; modal.close(); void onPlace(reviewed); }
      }
    });
  return modal;
}
