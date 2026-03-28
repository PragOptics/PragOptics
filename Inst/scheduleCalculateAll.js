// scheduleCalculateAll.js
export function scheduleCalculateAll(deps){
  const {
    isGridsReady,     // () => boolean
    getCalcTimer,     // () => any
    setCalcTimer,     // (id)=>void
    calculateAll      // ()=>void
  } = deps;

  if (!isGridsReady()) return;

  const existing = getCalcTimer();
  if (existing) clearTimeout(existing);

  const id = setTimeout(() => {
    setCalcTimer(null);
    calculateAll();
  }, 160);

  setCalcTimer(id);
}