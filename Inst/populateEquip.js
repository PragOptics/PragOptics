import { equipLabel } from './equipLabel.js';

export function populateEquip(selectEl, list){
  if (!selectEl) return;

  selectEl.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = '-- select equipment --';
  selectEl.appendChild(ph);

  (list || []).forEach(e => {
    if (!e) return;
    const id = (e?.id ?? '').toString().trim() || (e?.name ?? '').toString().trim();
    if (!id) return;

    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = equipLabel(e);
    selectEl.appendChild(opt);
  });
}