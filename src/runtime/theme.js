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

// The starfield behind the page (src/components/starfield.js) can be switched
// off. Same shape as the theme: per-browser (localStorage), stamped on <html>
// before first paint by themeBoot.js, remembered on the account for a
// signed-in person (src/runtime/userTheme.js). On is the default; anything
// but a stored "off" resolves to on.
const STARS_KEY = 'pragoptics_starfield';

/** 'on' | 'off' */
export function getStarfield() {
  try { return localStorage.getItem(STARS_KEY) === 'off' ? 'off' : 'on'; }
  catch { return 'on'; }
}

/** Apply the starfield choice to <html>, persist it, and announce the change. */
export function applyStarfield(value) {
  const off = value === 'off';
  const root = document.documentElement;
  if (off) root.setAttribute('data-starfield', 'off');
  else root.removeAttribute('data-starfield');
  try { localStorage.setItem(STARS_KEY, off ? 'off' : 'on'); } catch { /* blocked */ }
  try {
    window.dispatchEvent(new CustomEvent('pragoptics:starfieldchange', { detail: { starfield: off ? 'off' : 'on' } }));
  } catch { /* CustomEvent unsupported: CSS hides the canvas anyway */ }
}

/** Flip the theme and return the new value. */
export function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}
