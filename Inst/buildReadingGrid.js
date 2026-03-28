// buildReadingGrid.js
export function buildReadingGrid(container, prefix, disabled, points){
  if (!container) return;
  container.innerHTML = '';

  points.forEach(p => {
    const row = document.createElement('div');
    row.className = 'reading-row';
    row.dataset.point = p;

    row.innerHTML = `
      <div class="reading-header">
        <div class="reading-point">${p}%</div>
        <div class="reading-expected">
          <div>Exp In: <span id="${prefix}_exp_in_${p}">—</span></div>
          <div>Exp Out: <span id="${prefix}_exp_out_${p}">—</span></div>
        </div>
      </div>

      <div class="reading-inputs">
        <div>
          <label for="${prefix}_act_in_${p}">Actual Input</label>
          <input id="${prefix}_act_in_${p}" type="text" inputmode="decimal" autocomplete="off" ${disabled ? 'disabled' : ''}>
        </div>
        <div>
          <label for="${prefix}_act_out_${p}">Actual Output</label>
          <input id="${prefix}_act_out_${p}" type="text" inputmode="decimal" autocomplete="off" ${disabled ? 'disabled' : ''}>
        </div>
      </div>

      <div class="reading-footer">
        <div class="muted">Error (%)</div>
        <div class="reading-error" id="${prefix}_err_${p}">—</div>
      </div>
    `;

    container.appendChild(row);
  });
}