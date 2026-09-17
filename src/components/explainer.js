// src/components/explainer.js
//
// The "How it works" pop-out. Every complex surface (teams and seats, plans
// and add-ons, sign-in security, orders and tracking, registration and
// transfers, the environment, API keys) gets one door, a plain text link,
// that opens a short, human-written explainer rendered from a Markdown file
// in /docs/explain/, in the same glass panel the legal documents use, styled
// from the site's tokens so both themes hold.
//
// The Markdown is ours, so it may carry two block types the legal viewer
// does not know: a `ladder` (a hierarchy, top rung strongest) and a `flow`
// (a sequence, left to right). Both are fenced blocks, one item per line,
// "Label | what it means".
//
//   <button type="button" class="explain-link" data-explain="team">How this works</button>
//
// Nothing here is a tooltip. The small (i) hints stay where they are; this
// is the longer read for someone who wants to understand the thing they are
// about to change, without leaving the page.

import { mdToHtml } from './legalViewer.js';

const DOCS = {
  team:        { title: 'Teams, seats and roles' },
  billing:     { title: 'Plans, seats and add-ons' },
  plans:       { title: 'Which plan fits' },
  security:    { title: 'Your sign-in' },
  orders:      { title: 'Orders and tracking' },
  warranty:    { title: 'Registration and transfers' },
  environment: { title: 'Your environment and storage' },
  keys:        { title: 'API keys' },
  domains:     { title: 'Connecting a domain' }
};
const KICKER = 'How it works';
const COPY_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';
let currentMd = '';
/** The clipboard, by the modern API or, where it refuses, the old selection-and-copy path. Throws when neither works. */
export async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (!ok) throw new Error('clipboard refused');
}
/** The text of what is open, to the clipboard; the icon reads as a check for a moment. */
export async function copyMarkdown(btn, text) {
  if (!btn) return;
  const orig = btn.innerHTML, label = btn.getAttribute('aria-label') || '';
  const say = (ok) => { btn.innerHTML = ok ? CHECK_SVG : orig; const t = ok ? 'Copied' : 'Could not copy'; btn.setAttribute('data-tip', t); btn.setAttribute('aria-label', t); };
  try { await writeClipboard(String(text || '')); say(true); } catch { say(false); }
  setTimeout(() => { btn.innerHTML = orig; btn.setAttribute('data-tip', label); btn.setAttribute('aria-label', label); }, 1600);
}
const BASE = '/docs/explain/';

let els = null;
let lastTrigger = null;
const cache = new Map();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A ladder or flow block: one item per line, "Label | text". */
function blockHtml(kind, body) {
  const items = String(body).split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const i = line.indexOf('|');
    const label = i >= 0 ? line.slice(0, i).trim() : line;
    const text = i >= 0 ? line.slice(i + 1).trim() : '';
    return `<li class="xp-item"><span class="xp-label">${esc(label)}</span>${text ? `<span class="xp-text">${esc(text)}</span>` : ''}</li>`;
  }).join('');
  const cls = kind === 'ladder' ? 'xp-ladder' : 'xp-flow';
  return `<ol class="${cls}" role="list">${items}</ol>`;
}

/** Markdown to HTML, with the two custom blocks lifted out before the generic renderer sees them. */
export function renderExplainer(md) {
  const blocks = [];
  const lifted = String(md).replace(/\r\n?/g, '\n').replace(/```(ladder|flow)\n([\s\S]*?)```/g, (_, kind, body) => {
    blocks.push(blockHtml(kind, body));
    return `\n§§XP_BLOCK_${blocks.length - 1}§§\n`;
  });
  // The panel head already carries the title, so the document's own top
  // heading would read twice; the body starts at the first paragraph.
  let html = mdToHtml(lifted.replace(/^#\s[^\n]*\n+/, ""));
  html = html.replace(/(?:<p>)?§§XP_BLOCK_(\d+)§§(?:<\/p>)?/g, (_, n) => blocks[Number(n)] || '');
  return html;
}

function ensureDom() {
  if (els) return els;
  const mask = document.createElement('div');
  mask.id = 'explainMask';
  mask.className = 'legal-mask explain-mask';
  mask.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('section');
  panel.id = 'explainPanel';
  panel.className = 'legal-panel explain-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'explainTitle');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="legal-card explain-card" tabindex="-1">
      <div class="legal-head explain-head">
        <div class="explain-head-text">
          <span class="explain-kicker">${esc(KICKER)}</span>
          <h2 id="explainTitle" class="legal-title explain-title">How it works</h2>
        </div>
        <button class="modal-close" type="button" aria-label="Close" data-explain-action="close">✕</button>
      </div>
      <div class="legal-body explain-body">
        <div id="explainLoading" class="legal-loading muted">Loading…</div>
        <article id="explainContent" class="md-view legal-content explain-content" aria-live="polite"></article>
      </div>
      <div class="legal-foot explain-foot">
        <button id="explainCopyRaw" class="btn btn-sm btn-ico" type="button" data-explain-action="copy" aria-label="Copy this text, to paste into an assistant" data-tip="Copy this text, to paste into an assistant">${COPY_SVG}</button>
      </div>
    </div>`;
  document.body.append(mask, panel);
  els = {
    mask, panel,
    card: panel.querySelector('.explain-card'),
    title: panel.querySelector('#explainTitle'),
    loading: panel.querySelector('#explainLoading'),
    content: panel.querySelector('#explainContent'),
    copy: panel.querySelector('#explainCopyRaw')
  };
  return els;
}

function isOpen() { return !!els && els.panel.classList.contains('is-open'); }

function open() {
  const d = ensureDom();
  d.mask.classList.add('is-open');
  d.panel.classList.add('is-open');
  d.mask.setAttribute('aria-hidden', 'false');
  d.panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => d.card.focus({ preventScroll: true }), 0);
}

function close() {
  if (!isOpen()) return;
  els.mask.classList.remove('is-open');
  els.panel.classList.remove('is-open');
  els.mask.setAttribute('aria-hidden', 'true');
  els.panel.setAttribute('aria-hidden', 'true');
  // Something may still be open underneath (the legal viewer, a product, the cart).
  const stillOpen = document.querySelector('#legalPanel.is-open, #productPanel.is-open, #cartPanel.is-open, #brochurePanel.is-open');
  document.body.style.overflow = stillOpen ? 'hidden' : '';
  if (lastTrigger && document.contains(lastTrigger)) { try { lastTrigger.focus(); } catch { /* fine */ } }
  lastTrigger = null;
}

export async function openExplainer(key, trigger = null) {
  const doc = DOCS[key];
  if (!doc) return;
  const d = ensureDom();
  lastTrigger = trigger;
  const url = `${BASE}${key}.md`;
  d.title.textContent = doc.title;
  currentMd = '';
  d.content.innerHTML = '';
  d.loading.style.display = 'block';
  open();
  try {
    let md = cache.get(key);
    if (!md) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load ${key}`);
      md = await res.text();
      cache.set(key, md);
    }
    currentMd = md;
    d.content.innerHTML = renderExplainer(md);
    d.content.scrollTop = 0;
  } catch {
    d.content.innerHTML = '<p>Could not load this explainer right now. Try again in a moment.</p>';
  } finally {
    d.loading.style.display = 'none';
  }
}

const INFO_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
/** The (i) that opens one, with the label as its tooltip. Sits right after the thing it explains. */
export function explainLink(key, label = 'How this works') {
  if (!DOCS[key]) return '';
  return `<button type="button" class="explain-link explain-ico" data-explain="${esc(key)}" aria-label="${esc(label)}" data-tip="${esc(label)}">${INFO_SVG}</button>`;
}

export function initExplainer() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-explain]');
    if (a) { e.preventDefault(); openExplainer(a.dataset.explain, a); return; }
    const act = e.target.closest('[data-explain-action]');
    if (act) { e.preventDefault(); if (act.dataset.explainAction === 'close') close(); else if (act.dataset.explainAction === 'copy') copyMarkdown(act, currentMd); return; }
    if (els && e.target === els.mask) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });
  window.pragExplain = openExplainer;
}
