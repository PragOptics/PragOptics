// toast.js
export function toast(toastWrap, message, type='info', ttl=3200){
  if (!toastWrap) return;
  const t = document.createElement('div');
  t.className = `toast ${type === 'warn' ? 'warn' : ''}`.trim();
  t.textContent = message;
  toastWrap.appendChild(t);

  const fadeAt = Math.max(300, ttl - 240);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(-6px)'; }, fadeAt);
  setTimeout(() => { t.remove(); }, ttl);
}