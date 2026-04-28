export function initHeaderMenu() {
  const navs = document.querySelectorAll('.dev-nav, .btnContainer');
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
      }
    });
  });
}
