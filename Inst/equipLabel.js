// equipLabel.js
export function equipLabel(e){
  const id   = (e?.id ?? '').toString().trim();
  const name = (e?.name ?? '').toString().trim();
  const desc = (e?.desc ?? e?.description ?? '').toString().trim();

  // Display: "ID — Name — Desc" (skip missing parts)
  const parts = [];
  if (id) parts.push(id);
  if (name && name !== id) parts.push(name);
  if (desc) parts.push(desc);

  return parts.join(' — ') || '';
}