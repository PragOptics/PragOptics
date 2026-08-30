// src/components/videoOverlay.js
//
// One themed video viewer, shared by the product modal and the warranty page.
//
//   openVideoOverlay({ mp4 | youtube, title, poster })  opens it over the page
//   inlineVideoHtml(video, opts)                         a poster card to embed
//   hasVideoSource(video)                                is a source configured?
//
// The overlay is created once and reused: opening it again after a close is
// cheap, and closing pauses/tears down the player so a hidden video is not
// still buffering. Nothing here reaches the network until a source is set on
// the product, so the whole feature stays dormant until the How-To is hosted.

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** True when the product carries a real, playable source. */
export function hasVideoSource(video) {
  return !!(video && (video.mp4 || video.youtube));
}

/** The player markup for one source, sized to fill its container. */
function playerHtml(video, { autoplay = false } = {}) {
  if (video.youtube) {
    const params = `rel=0&modestbranding=1&playsinline=1${autoplay ? '&autoplay=1' : ''}`;
    return `<iframe class="vo-frame"
              src="https://www.youtube-nocookie.com/embed/${esc(video.youtube)}?${params}"
              title="${esc(video.title || 'Video')}"
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowfullscreen></iframe>`;
  }
  // Native player for a direct file (Azure Blob, etc.).
  return `<video class="vo-video" controls playsinline preload="metadata"
            ${autoplay ? 'autoplay' : ''}
            ${video.poster ? `poster="${esc(video.poster)}"` : ''}>
            <source src="${esc(video.mp4)}" type="video/mp4">
            Your browser cannot play this video.
          </video>`;
}

/* ---------- overlay (single instance, reused) ---------- */

let $overlay = null;
let lastFocus = null;

function ensureOverlay() {
  if ($overlay) return $overlay;
  $overlay = el('div', 'vo-overlay', `
    <div class="vo-backdrop" data-vo-close></div>
    <div class="vo-panel" role="dialog" aria-modal="true" aria-label="Video">
      <div class="vo-head">
        <strong class="vo-title"></strong>
        <button class="vo-close" type="button" data-vo-close aria-label="Close video">&times;</button>
      </div>
      <div class="vo-stage"></div>
    </div>
  `);
  $overlay.hidden = true;
  document.body.appendChild($overlay);

  $overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-vo-close]')) closeVideoOverlay();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$overlay.hidden) closeVideoOverlay();
  });
  return $overlay;
}

export function openVideoOverlay(video) {
  if (!hasVideoSource(video)) return;
  const o = ensureOverlay();
  o.querySelector('.vo-title').textContent = video.title || 'How-To';
  o.querySelector('.vo-stage').innerHTML = playerHtml(video, { autoplay: true });
  lastFocus = document.activeElement;
  o.hidden = false;
  document.body.classList.add('vo-open');
  o.querySelector('.vo-close')?.focus();
}

export function closeVideoOverlay() {
  if (!$overlay || $overlay.hidden) return;
  // Tear the player down so a closed overlay is not still streaming.
  $overlay.querySelector('.vo-stage').innerHTML = '';
  $overlay.hidden = true;
  document.body.classList.remove('vo-open');
  try { lastFocus?.focus(); } catch { /* element gone */ }
}

/* ---------- inline embed (product card) ---------- */

// A poster card that plays inline on click, with an Expand control that hands
// the same source to the overlay. Returns '' when no source is set, so the
// product modal simply shows nothing until the video is hosted.
export function inlineVideoHtml(video, { label = 'How-To' } = {}) {
  if (!hasVideoSource(video)) return '';
  return `
    <figure class="vo-inline" data-vo-inline>
      <div class="vo-inline-stage" data-vo-poster>
        ${video.poster ? `<img class="vo-inline-poster" src="${esc(video.poster)}" alt="${esc(video.title || label)}">` : ''}
        <button class="vo-play" type="button" data-vo-play aria-label="Play ${esc(label)}">
          <span class="vo-play-icon" aria-hidden="true">&#9658;</span>
          <span class="vo-play-label">${esc(label)}</span>
        </button>
      </div>
      <figcaption class="vo-inline-cap">
        <span>${esc(video.title || label)}</span>
        <button class="vo-expand" type="button" data-vo-expand aria-label="Expand video">Expand</button>
      </figcaption>
    </figure>
  `;
}

// Wire a container that holds one inlineVideoHtml block. Delegated, so it works
// no matter when the block is injected. Safe to call more than once.
export function bindInlineVideo(root, video) {
  if (!root || !hasVideoSource(video)) return;
  const fig = root.querySelector('[data-vo-inline]');
  if (!fig || fig._voBound) return;
  fig._voBound = true;

  fig.addEventListener('click', (e) => {
    if (e.target.closest('[data-vo-expand]')) {
      openVideoOverlay(video);
      return;
    }
    if (e.target.closest('[data-vo-play]')) {
      // Play inline in place, in the poster stage.
      const stage = fig.querySelector('[data-vo-poster]');
      if (stage) stage.innerHTML = playerHtml(video, { autoplay: true });
    }
  });
}
