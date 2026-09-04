// src/runtime/theme.js
//
// Optional "daylight nebula" light theme. The site is galactic-DARK by default,
// which needs no attribute; the light theme sets [data-theme="light"] on the
// <html> element and every design token in css/tokens.css swaps to its light
// value. The choice is per-browser (localStorage) and is applied BEFORE first
// paint by a tiny inline script in index.html <head>, so the page never flashes
// dark before switching. This module is the runtime toggle used after load.
//
// Dark is the ground truth: absent or any non-'light' stored value resolves to
// dark, so a blocked or empty localStorage can never strand a viewer in a
// half-applied light theme.

const KEY = 'pragoptics_theme';

/** 'light' | 'dark' — dark unless the viewer explicitly chose light. */
export function getTheme() {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

/** Apply a theme to <html>, persist it, and announce the change. */
export function applyTheme(theme) {
  const light = theme === 'light';
  const root = document.documentElement;
  if (light) root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  try { localStorage.setItem(KEY, light ? 'light' : 'dark'); } catch { /* blocked */ }
  // Non-CSS surfaces (the starfield canvas, any themed backdrop) listen for this.
  try {
    window.dispatchEvent(new CustomEvent('pragoptics:themechange', { detail: { theme: light ? 'light' : 'dark' } }));
  } catch { /* CustomEvent unsupported: CSS still applied above */ }
}

/** Flip the theme and return the new value. */
export function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}
