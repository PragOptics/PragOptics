export function initHeaderMenu() {
  const navs = document.querySelectorAll('.dev-nav, .btnContainer, .product-highlight, .shop, .software-shop');
  if (!navs.length) return;

  navs.forEach(nav => {
    nav.addEventListener('click', (e) => {
      const link = e.target.closest('[data-action]');
      if (!link) return;

      e.preventDefault();

      const { action, mode, endpoint } = link.dataset;

      switch (action) {
        case 'set-mode':
          window.setAppMode?.(mode);
          break;

        case 'open-billing':
          window.openBillingFromMenu?.();
          break;

        case 'open-wizard':
          window.openWizardFromMenu?.();
          break;

        case 'call-api':
          endpoint === 'ping'
            ? window.callPragOpticsPing?.()
            : window.callPragOpticsAuth?.();
          break;

        case 'open-login':
          window.openLoginModal?.();
          break;

        case 'logout':
          window.logout?.();
          break;

        case 'switch-lane':
          window.switchLaneFromMenu?.();
          break;

        case 'open-docs':
          window.location.href = '/docs/';
          break;

        case 'open-cart':
          window.openCart?.();
          break;

        case 'checkout':
          window.setAppMode?.('checkout');
          break;

        case 'open-product':
          window.openProductModal?.(link.dataset.productId);
          break;

        case 'add-to-cart':
          window.addToCart?.(link.dataset.productId, link.dataset.variant || null);
          break;

        case 'buy':
          // Landing / highlight primary action: add to cart AND open the drawer
          // so the click has visible feedback and a path to checkout.
          window.addToCart?.(link.dataset.productId, link.dataset.variant || null);
          window.openCart?.();
          break;

        case 'notify':
          try { localStorage.setItem('pragoptics_notify_intent_v1', link.dataset.productId || ''); } catch {}
          window.setAppMode?.('checkout');
          break;
      }
    });
  });
}
