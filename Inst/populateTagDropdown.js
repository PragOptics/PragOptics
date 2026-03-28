// populateTagDropdown.js
export function populateTagDropdown(tagSelect, tags){
  if (!tagSelect) return;

  tagSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- select tag --';
  tagSelect.appendChild(placeholder);

  (tags || []).forEach(t => {
    const tag = (t && typeof t === 'object') ? t.tag : t;
    if (!tag) return;

    const desc = (t && typeof t === 'object') ? (t.desc || t.description || '') : '';
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = desc ? `${tag} — ${desc}` : tag;
    tagSelect.appendChild(opt);
  });
}
