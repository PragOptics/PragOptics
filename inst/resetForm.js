// resetForm.js
export function resetForm(deps){
  const {
    documentRef,          // pass `document`
    outputEl,
    forceShowAsLeft,

    // shared state + mutators
    asLeftDirty,          // Set()
    setAnyOutOfTolerance, // (bool)=>void
    setLastAnyOut,        // (bool)=>void
    setGridsReady,        // (bool)=>void

    // grids + builders
    asFoundGrid,
    asLeftGrid,
    buildReadingGrid,
    attach2dpBlurFormatting,

    // other helpers
    setToleranceByClass,
    scheduleCalculateAll,
    toast,
    onAfterReset
  } = deps;

  documentRef.querySelectorAll('input').forEach(i => {
    if (i.type === 'checkbox') return;
    if (i.hasAttribute('readonly')) return;
    i.value = '';
  });

  documentRef.querySelectorAll('select').forEach(s => {
    // leave characteristic selection if you want; otherwise reset all
    s.selectedIndex = 0;
  });

  const comments = documentRef.getElementById('comments');
  const tech = documentRef.getElementById('tech');
  if (comments) comments.value = '';
  if (tech) tech.value = '';
  if (outputEl) outputEl.value = '';

  asLeftDirty.clear();
  setAnyOutOfTolerance(false);
  setLastAnyOut(false);
  if (forceShowAsLeft) forceShowAsLeft.checked = false;

  buildReadingGrid(asFoundGrid, 'af', false);
  buildReadingGrid(asLeftGrid,  'al', true);
  attach2dpBlurFormatting();
  setGridsReady(true);

  setToleranceByClass(null);
  scheduleCalculateAll();

  toast('Form reset.', 'info', 1400);

  onAfterReset?.();
}