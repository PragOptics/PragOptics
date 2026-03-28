// wireAsLeftEditing.js
export function wireAsLeftEditing(deps){
  const {
    asLeftGrid,            // element
    forceShowAsLeft,       // checkbox element
    clearAsLeftBtn,        // button element (optional)
    points,                // [0,25,50,75,100]
    asLeftDirty,           // Set()
    toast,                 // (msg,type,ttl)=>void
    scheduleCalculateAll,  // ()=>void
    flushCalculateAll,     // ()=>void

    // NOTE: these two are only for clearing values when disabling As-Left
    getAnyOutOfTolerance,  // ()=>boolean
  } = deps;

  // --- As-Left grid input/blur wiring ---
  if (asLeftGrid) {
    asLeftGrid.addEventListener('input', (e) => {
      if (!e.target || !(e.target instanceof HTMLInputElement)) return;

      const m = e.target.id.match(/^al_act_(in|out)_(\d+)$/);
      if (m) asLeftDirty.add(Number(m[2]));

      scheduleCalculateAll();
    });

    asLeftGrid.addEventListener('blur', (e) => {
      if (!e.target || !(e.target instanceof HTMLInputElement)) return;
      flushCalculateAll();
    }, true);
  }

  // --- Checkbox toggles edit mode (no hiding) ---
  if (forceShowAsLeft) {
    forceShowAsLeft.addEventListener('change', () => {
      // If calibration required, do not allow turning it off
      if (getAnyOutOfTolerance() && !forceShowAsLeft.checked) {
        forceShowAsLeft.checked = true;
        toast('Calibration required — As‑Left editing is required.', 'warn', 4000);
        return;
      }

      if (!forceShowAsLeft.checked) {
        // Clearing AL means the tech hasn’t edited any point
        asLeftDirty.clear();

        // Clear AL inputs
        points.forEach(p => {
          const ai = document.getElementById(`al_act_in_${p}`);
          const ao = document.getElementById(`al_act_out_${p}`);
          if (ai) ai.value = '';
          if (ao) ao.value = '';
        });
      }

      scheduleCalculateAll();
    });
  }

  // --- Clear As-Left button ---
  if (clearAsLeftBtn) {
    clearAsLeftBtn.addEventListener('click', () => {
      asLeftDirty.clear();

      asLeftGrid?.querySelectorAll('input').forEach(i => {
        i.value = '';
        i.disabled = false;
      });

      toast('As‑Left fields cleared.', 'info', 2400);
      scheduleCalculateAll();
    });
  }
}