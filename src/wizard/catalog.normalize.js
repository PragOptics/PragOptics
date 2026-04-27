export function normalizeCatalog(productCatalog = []) {
  const normalized = {
    plans: {},
    globalAddons: {},
    oneTimeProducts: []
  };

  for (const item of productCatalog) {
    if (!item || item.active !== "true") continue;

    const { lookupKey, productId, interval, role, priceId, amount } = item;
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