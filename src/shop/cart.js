// src/shop/cart.js
// Local shopping cart store.  Persists to localStorage under a versioned key.
// Publish/subscribe: cart-drawer, cart-badge, and checkout all react to changes.

import { getProduct } from './products.js';

const LS_KEY = 'pragoptics_cart_v1';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}

function write(items) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); }
  catch { /* localStorage full or blocked — silently continue */ }
  emit();
}

function emit() {
  const items = read();
  listeners.forEach(fn => { try { fn(items); } catch { /* isolate handlers */ } });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(read());
  return () => listeners.delete(fn);
}

export function getItems() { return read(); }

export function addItem(productId, variantId = null, qty = 1) {
  const items = read();
  const found = items.find(i => i.productId === productId && i.variantId === variantId);
  if (found) found.qty += qty;
  else items.push({ productId, variantId, qty });
  write(items);
}

export function setQty(productId, variantId, qty) {
  let items = read();
  const found = items.find(i => i.productId === productId && i.variantId === variantId);
  if (!found) return;
  found.qty = Math.max(0, Math.floor(qty));
  items = items.filter(i => i.qty > 0);
  write(items);
}

export function removeItem(productId, variantId = null) {
  const items = read().filter(i => !(i.productId === productId && i.variantId === variantId));
  write(items);
}

/* Donations — the only cart line software creates. One line per software
   title, qty is always 1, and the user-chosen amount lives on the stored item
   (unitCentsOverride) because the catalog carries no price for software.
   Minimum $1, integer cents. */
function cleanDonationCents(cents) {
  return Math.max(100, Math.round(Number(cents) || 0));
}

export function addDonation(productId, cents = 100) {
  const items = read();
  const found = items.find(i => i.productId === productId && i.variantId === 'donation');
  if (found) return; // keep the amount the user already set
  items.push({ productId, variantId: 'donation', qty: 1, unitCentsOverride: cleanDonationCents(cents) });
  write(items);
}

export function setDonationAmount(productId, cents) {
  const items = read();
  const found = items.find(i => i.productId === productId && i.variantId === 'donation');
  if (!found) return;
  found.unitCentsOverride = cleanDonationCents(cents);
  write(items);
}

export function clear() { write([]); }

export function count() {
  return read().reduce((sum, i) => sum + i.qty, 0);
}

/** Enrich cart lines with product + variant metadata for rendering. */
export function lines() {
  return read().map(i => {
    const product = getProduct(i.productId);
    if (!product) return null;
    const variant = i.variantId ? (product.variants || []).find(v => v.id === i.variantId) : null;
    const isDonation = i.variantId === 'donation';
    const unitCents = isDonation
      ? (i.unitCentsOverride ?? 100)
      : (variant?.priceCents ?? product.priceCents ?? null);
    return {
      productId: i.productId,
      variantId: i.variantId,
      qty: i.qty,
      product,
      variant,
      isPreorder: i.variantId === 'preorder',
      isDonation,
      unitCents,
      lineCents: unitCents == null ? null : unitCents * i.qty
    };
  }).filter(Boolean);
}

/** Whole-cart subtotal in cents, or null if any line has TBD pricing. */
export function subtotal() {
  const ls = lines();
  if (ls.some(l => l.unitCents == null)) return null;
  return ls.reduce((sum, l) => sum + l.lineCents, 0);
}
