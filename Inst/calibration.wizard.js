// calibration.wizard.js
export function initCalibrationWizard(deps) {
  const {
    instrumentSetupCard,
    asFoundCard,
    asLeftCard,
    techCard,
    outputCard,

    toast,
    flushCalculateAll,
    isSetupSane,
    hasAllAsFoundData,
    shouldRequireAsLeft,
  } = deps;

  let wizStep = 'setup';
  let suppressWizardScroll = true;

  function transitionWizardCards(fromEl, toEl, direction = 'forward') {
    if (!fromEl || !toEl || fromEl === toEl) return;

    const exitClass  = direction === 'back' ? 'wiz-exit-right' : 'wiz-exit-left';
    const enterClass = direction === 'back' ? 'wiz-enter-left' : 'wiz-enter-right';

    toEl.classList.remove('wiz-hidden');
    toEl.classList.add('wiz-anim', enterClass);

    fromEl.classList.add('wiz-anim', exitClass);

    requestAnimationFrame(() => {
      toEl.classList.add('wiz-enter-active');
    });

    setTimeout(() => {
      fromEl.classList.add('wiz-hidden');
      fromEl.classList.remove('wiz-anim', exitClass);
      toEl.classList.remove('wiz-anim', enterClass, 'wiz-enter-active');
    }, 200);
  }

  function scrollPageToTop(force = false) {
    if (document.activeElement?.blur) document.activeElement.blur();

    const root = document.scrollingElement || document.documentElement;
    root.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);

    if (force) {
      requestAnimationFrame(() => {
        const r = document.scrollingElement || document.documentElement;
        r.scrollTop = 0;
        window.scrollTo(0, 0);
      });
    }
  }

  function shimmerCardTitle(cardEl) {
    if (!cardEl) return;
    const title = cardEl.querySelector('h2');
    if (!title) return;
    title.classList.remove('shimmer-once');
    void title.offsetWidth;
    title.classList.add('shimmer-once');
  }

  function setWizStep(step) {
    const stepMap = {
      setup: instrumentSetupCard,
      af: asFoundCard,
      al: asLeftCard,
      final: techCard
    };

    const fromEl = stepMap[wizStep];
    const toEl   = stepMap[step];

    const direction =
      (wizStep === 'af' && step === 'setup') ||
      (wizStep === 'al' && step === 'af') ||
      (wizStep === 'final' && step === 'al')
        ? 'back'
        : 'forward';

    transitionWizardCards(fromEl, toEl, direction);
    shimmerCardTitle(toEl);

    wizStep = step;

    if (outputCard) outputCard.classList.add('wiz-hidden');

    if (!suppressWizardScroll) {
      scrollPageToTop(true);
    }
  }

  function goNext() {
    if (wizStep === 'setup') {
      if (!isSetupSane()) {
        toast('Setup incomplete: enter valid input/output ranges first.', 'warn', 3600);
        return;
      }
      setWizStep('af');
      return;
    }

    if (wizStep === 'af') {
      flushCalculateAll();
      if (!hasAllAsFoundData()) {
        toast(
          'Complete all As‑Found fields (Actual Input and Actual Output at every point) before continuing.',
          'warn',
          4200
        );
        return;
      }
      setWizStep('al');
      return;
    }

    if (wizStep === 'al') {
      flushCalculateAll();
      setWizStep('final');
    }
  }

  function goBack() {
    if (wizStep === 'af') return setWizStep('setup');
    if (wizStep === 'al') return setWizStep('af');
    if (wizStep === 'final') {
      return setWizStep(shouldRequireAsLeft() ? 'al' : 'af');
    }
  }

  // initial state
  setWizStep('setup');
  suppressWizardScroll = false;
  scrollPageToTop();
  shimmerCardTitle(instrumentSetupCard);

  window.addEventListener('pageshow', () => {
    scrollPageToTop(true);
  });

  return {
    setWizStep,
    goNext,
    goBack,
    scrollPageToTop
  };
}