// flushCalculateAll.js
export function flushCalculateAll(deps){
  const {
    isGridsReady,     // () => boolean
    getCalcTimer,     // () => any
    setCalcTimer,     // (id|null)=>void
    calculateAll      // ()=>void
  } = deps;

  if (!isGridsReady()) return;

  const existing = getCalcTimer();
  if (existing) {
    clearTimeout(existing);
    setCalcTimer(null);
  }

  calculateAll();
}