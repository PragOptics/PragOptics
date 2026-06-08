// src/runtime/viewLoader.js
export async function loadView(path, mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  mount.innerHTML = await res.text();
}