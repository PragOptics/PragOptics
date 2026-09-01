// The lookup key itself is the naming authority (po.<role>.<plan>.<cadence>,
// po.addon.* for add-ons). The stored role column used to be inferred with a
// contains-".partner." check on the backend, which stamped po.super.base.* as
// role=user and hid the super tier from every catalog-driven surface - so the
// role is re-derived here and the column is only a fallback.
function roleFromLookupKey(lk = "") {
  if (lk.startsWith("po.addon.")) return "any";
  const m = lk.match(/^po\.([a-z0-9]+)\./);
  return m ? m[1] : null;
}

export function normalizeCatalog(productCatalog = []) {
  const normalized = {
    plans: {},
    globalAddons: {},
    oneTimeProducts: []
  };

  for (const item of productCatalog) {
    if (!item || item.active !== "true") continue;

    const { lookupKey, productId, interval, priceId, amount } = item;
    const role = roleFromLookupKey(lookupKey) || item.role;
    if (!lookupKey || !productId || !interval || !role) continue;

    // Ensure role bucket exists (future roles supported automatically)
    if (!normalized.plans[role]) {
      normalized.plans[role] = { base: null, addons: {} };
    }

    const cadence = interval === "year" ? "annual" : "monthly";
    const isAddon = lookupKey.startsWith("po.addon.");
    const isGlobalRole = role === "any" || role === "all" || role === "*";

    // -------- ADD‑ONS (role-aware) --------
    // -------- ADD‑ONS (role-aware + global) --------
    if (isAddon) {
    const addonKey = lookupKey
        .replace("po.addon.", "")
        .replace(".monthly", "")
        .replace(".annual", "");

    const target = isGlobalRole
        ? normalized.globalAddons
        : (normalized.plans[role] ??= { base: null, addons: {} }).addons;

    if (!target[addonKey]) {
        target[addonKey] = { productId };
    }

    target[addonKey][cadence] = {
        priceId,
        amount: Number(amount),
        lookupKey
    };

    continue;
    }

    // -------- BASE PLANS (role-aware, non-addon items) --------
    // For now treat non-addon, role-scoped items as the base subscription plan.
    if (!normalized.plans[role].base) {
      normalized.plans[role].base = { productId };
    }

    normalized.plans[role].base[cadence] = {
      priceId,
      amount: Number(amount),
      lookupKey
    };
  }

  return normalized;
}