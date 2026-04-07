export function formatTo2(el){
  if (!el) return;

  const raw = (el.value ?? '').toString().trim();

  // allow empty
  if (raw === '') return;

  // allow mid-entry states (caller already guards, but keep defensive)
  if (
    raw === '-' ||
    raw === '.' ||
    raw === '-.' ||
    raw.endsWith('.')
  ) return;

  const n = Number(raw);
  if (Number.isNaN(n)) return;

  el.value = n.toFixed(2);
}