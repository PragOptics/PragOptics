// wireAsFoundGridEvents.js
export function wireAsFoundGridEvents(asFoundGrid, scheduleCalculateAll, flushCalculateAll){
  if (!asFoundGrid) return;

  asFoundGrid.addEventListener('input', (e) => {
    if (!e.target || !(e.target instanceof HTMLInputElement)) return;
    scheduleCalculateAll();
  });

  asFoundGrid.addEventListener('blur', (e) => {
    if (!e.target || !(e.target instanceof HTMLInputElement)) return;
    flushCalculateAll();
  }, true);
}