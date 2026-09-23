// src/components/tooltip.js
//
// One smart tooltip for the whole site (2026-09-17). Any element with a
// data-tip attribute gets a floating bubble on hover or keyboard focus. A
// single shared element is positioned with JS in viewport coordinates, so it
// is never clipped:
//
//   - it opens BELOW the anchor when the anchor sits in the top ~55% of the
//     viewport, and ABOVE when the anchor is lower, so a tip near the bottom
//     of the screen points up and one near the top points down;
//   - it clamps left and right to stay on screen, and its little arrow slides
//     to keep pointing at the anchor's centre;
//   - it follows scroll and closes on leave, blur, Escape, or a resize.
//
// The CSS pseudo-bubble in tooltip.css is the no-JS fallback; once this runs
// it adds `js-tips` to <html> and that fallback is suppressed (tooltip.css),
// so there is never a double bubble.
//
// The label is read from data-tip; aria-label carries it for assistive tech
// whether or not the visual bubble ever shows. On touch, press and hold shows
// the tip (2026-09-23); a plain tap acts.

let tip = null;         // the floating element
let arrow = null;
let current = null;     // the anchor the tip is showing for
const MARGIN = 8;       // keep this far from the viewport edge
const GAP = 9;          // between the anchor and the bubble

function ensure() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'po-tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  arrow = document.createElement('span');
  arrow.className = 'po-tip-arrow';
  const text = document.createElement('span');
  text.className = 'po-tip-text';
  tip.append(text, arrow);
  document.body.appendChild(tip);
  tip._text = text;
  return tip;
}

function labelFor(el) {
  return (el.getAttribute('data-tip') || el.getAttribute('aria-label') || '').trim();
}

function place(anchor) {
  const t = ensure();
  const label = labelFor(anchor);
  if (!label) { hide(); return; }
  t._text.textContent = label;
  t.classList.add('is-shown');       // make it measurable
  t.setAttribute('aria-hidden', 'false');

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const a = anchor.getBoundingClientRect();
  const w = t.offsetWidth, h = t.offsetHeight;

  // Below when the anchor's centre is in the top 55% of the viewport, else above.
  const anchorCentreY = a.top + a.height / 2;
  const below = anchorCentreY < vh * 0.55;
  let top = below ? a.bottom + GAP : a.top - h - GAP;
  // If the chosen side does not fit, take the other one.
  if (below && top + h > vh - MARGIN) top = a.top - h - GAP;
  else if (!below && top < MARGIN) top = a.bottom + GAP;

  // Centre horizontally on the anchor, then clamp to the viewport.
  const anchorCentreX = a.left + a.width / 2;
  let left = anchorCentreX - w / 2;
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

  t.classList.toggle('is-below', below);
  t.classList.toggle('is-above', !below);
  t.style.left = `${Math.round(left)}px`;
  t.style.top = `${Math.round(top)}px`;

  // The arrow tracks the anchor's centre within the bubble's width.
  const arrowX = Math.max(10, Math.min(anchorCentreX - left, w - 10));
  arrow.style.left = `${Math.round(arrowX)}px`;
}

function show(el) {
  if (!el || !labelFor(el)) return;
  current = el;
  place(el);
}
function hide() {
  current = null;
  if (!tip) return;
  tip.classList.remove('is-shown');
  tip.setAttribute('aria-hidden', 'true');
}

let bound = false;
export function initTooltips() {
  if (bound) return;
  bound = true;
  try { document.documentElement.classList.add('js-tips'); } catch { /* fine */ }

  // Hover (mouse/pen). pointerover/out bubble, so one pair of listeners covers
  // every current and future [data-tip] without re-binding on re-render.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;   // touch has no hover; skip the bubble
    const el = e.target.closest?.('[data-tip]');
    if (el && el !== current) show(el);
  });
  document.addEventListener('pointerout', (e) => {
    if (!current) return;
    const to = e.relatedTarget;
    if (to && current.contains(to)) return;  // moving within the same anchor
    const el = e.target.closest?.('[data-tip]');
    if (el === current) hide();
  });
  // Touch (2026-09-23 polish): a touch has no hover, so pressing and holding
  // anything with a tip shows it; the press that showed it does not also act
  // (its click is swallowed), and the tip fades a moment after the finger lifts.
  // A plain tap acts at once, as before. A finger that moves (a scroll) cancels.
  let holdTimer = null, holdEl = null, holdX = 0, holdY = 0, swallowEl = null;
  const endHold = () => { clearTimeout(holdTimer); holdTimer = null; holdEl = null; };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    swallowEl = null;
    const el = e.target.closest?.('[data-tip]');
    if (!el) return;
    endHold();
    holdEl = el; holdX = e.clientX; holdY = e.clientY;
    holdTimer = setTimeout(() => { if (holdEl === el) { show(el); swallowEl = el; } }, 450);
  }, { passive: true });
  document.addEventListener('pointermove', (e) => {
    if (!holdEl || e.pointerType !== 'touch') return;
    if (Math.abs(e.clientX - holdX) > 10 || Math.abs(e.clientY - holdY) > 10) endHold();
  }, { passive: true });
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    endHold();
    if (swallowEl) { const el = swallowEl; setTimeout(() => { if (current === el) hide(); }, 1400); }
  }, { passive: true });
  document.addEventListener('pointercancel', endHold, { passive: true });
  // the click that follows a hold was a question, not an action
  document.addEventListener('click', (e) => {
    if (swallowEl && swallowEl.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); swallowEl = null; }
  }, true);
  // no long-press menu over a tipped control while it is being held
  document.addEventListener('contextmenu', (e) => {
    if (swallowEl && swallowEl.contains(e.target)) e.preventDefault();
  });

  // Keyboard focus.
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) show(el);
  });
  document.addEventListener('focusout', () => hide());
  // Anything that moves the anchor closes the tip rather than leaving it stranded.
  document.addEventListener('scroll', () => { if (current) hide(); }, true);
  window.addEventListener('resize', () => { if (current) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) hide(); });
  // A click on the anchor (a copy button, a card toggle) closes the tip so it
  // does not sit over what the click just changed.
  document.addEventListener('click', (e) => { if (current && e.target.closest?.('[data-tip]') === current) hide(); });
}
