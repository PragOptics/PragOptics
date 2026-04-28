// src/wizard/wizard.controller.js

export function initWizardNavigation() {
  const wizard = document.getElementById('wizardView');
  if (!wizard) return;

  wizard.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-wizard-nav]');
    const actionBtn = e.target.closest('[data-wizard-action]');

    if (navBtn) {
      e.preventDefault();
      const step = navBtn.dataset.wizardNav;
      gotoStep(step);
      return;
    }

    if (actionBtn) {
      e.preventDefault();

      if (actionBtn.dataset.wizardAction === 'poll') {
        window.pollUntilResolved?.();
      }
    }
  });
}

function gotoStep(step) {
  switch (step) {
    case '1':
      window.gotoStep1?.();
      break;
    case '2':
      window.gotoStep2?.();
      break;
    case '3':
      window.gotoStep3?.();
      break;
  }
}