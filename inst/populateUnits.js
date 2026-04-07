// populateUnits.js
export function populateUnits(selectEl, units, placeholder='Select units...'){
  if (!selectEl) return;

  selectEl.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder;
  selectEl.appendChild(ph);

  (units || []).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.value;
    opt.textContent = u.label;
    selectEl.appendChild(opt);
  });
}