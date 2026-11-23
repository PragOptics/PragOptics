// A shared, explicit review for human and Quark navigation. No network or order placement here.
export function supplierOrderChoices(rows, connectionId, currency = '') {
  const records = Array.isArray(rows) ? rows : rows?.ok === false ? [] : Array.isArray(rows?.items) ? rows.items : rows?.rows;
  const choices = [];
  for (const row of Array.isArray(records) ? records : []) {
    const product = row?.value;
    if (!product || product.supplier !== connectionId || !Array.isArray(product.variants)) continue;
    for (const variant of product.variants) {
      const variantId = String(variant.id || variant.variantId || '');
      const price = String(variant.price ?? '');
      const code = String(product.currency || currency).toUpperCase();
      if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId) || !/^\d+(?:\.\d{1,2})?$/.test(price) || !/^[A-Z]{3}$/.test(code)) continue;
      const unitCents = Math.round(Number(price) * 100);
      if (!Number.isSafeInteger(unitCents)) continue;
      if (choices.some(choice => choice.variantId === variantId)) continue;
      choices.push({ variantId, productTitle: String(product.title || product.name || product.productId || 'Product'),
        variantTitle: String(variant.title || ''), sku: String(variant.sku || ''), unitCents, currency: code });
    }
  }
  return choices;
}

export function supplierOrderReview(choices, variantId, quantity, address = null) {
  const choice = choices.find(item => item.variantId === variantId);
  if (!choice) throw new Error('Choose a product variant from this supplier’s synced catalog.');
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10000) throw new Error('Enter a whole quantity between 1 and 10000.');
  const totalCents = qty * choice.unitCents;
  if (!Number.isSafeInteger(totalCents)) throw new Error('The order estimate is too large.');
  let shipTo = null;
  if (address) {
    shipTo = Object.fromEntries(['name','street1','street2','city','state','zip','country','phone'].map(key => [key,String(address[key] || '').trim()]));
    shipTo.country = shipTo.country.toUpperCase();
    if (!shipTo.name || !shipTo.street1 || !shipTo.city || !shipTo.zip || !/^[A-Z]{2}$/.test(shipTo.country)) throw new Error('Provide the recipient, street, city, ZIP and two-letter country code.');
  }
  return { lines: [{ variantId: choice.variantId, qty }], shipTo, summary: { ...choice, qty, totalCents } };
}
