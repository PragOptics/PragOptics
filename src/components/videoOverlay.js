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

/** The player markup for one source, sized to fill its container.
 *  enablejsapi lets applyDefaultVolume set the in-player volume after load. */
function playerHtml(video, { autoplay = false } = {}) {
  if (video.youtube) {
    // cc_load_policy=0 + the captions-off nudge in tuneYtPlayer: the How-To
    // videos carry burned-in captions, so the player's own track is noise.
    const params = `rel=0&modestbranding=1&playsinline=1&enablejsapi=1&cc_load_policy=0&iv_load_policy=3${autoplay ? '&autoplay=1' : ''}`;
    return `<iframe class="vo-frame" data-vo-yt
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

// House tuning: players start at half volume so a How-To never blasts a quiet
// shop floor, and the caption module is unloaded because the videos carry
// burned-in captions. YouTube takes both over its iframe API (it ignores
// messages until the player exists, so it is nudged a few times); native video
// is a property set.
function tuneYtPlayer(yt) {
  const send = () => {
    try {
      yt.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [50] }), '*');
      yt.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unloadModule', args: ['captions'] }), '*');
      yt.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unloadModule', args: ['cc'] }), '*');
    } catch { /* frame gone */ }
  };
  yt.addEventListener('load', () => { send(); setTimeout(send, 600); setTimeout(send, 1500); });
  // Already loaded (cached) frames never fire load again: nudge now too.
  send(); setTimeout(send, 600); setTimeout(send, 1500);
}

function applyDefaultVolume(stage) {
  if (!stage) return;
  const vid = stage.querySelector('video');
  if (vid) { try { vid.volume = 0.5; } catch { /* not ready */ } }
  const yt = stage.querySelector('[data-vo-yt]');
  if (yt) tuneYtPlayer(yt);
}

// Stop whatever is playing inside a stage, without tearing the player down.
// Used before the overlay opens so the inline/framed player never doubles the
// overlay's audio.
function pausePlayback(stage) {
  if (!stage) return;
  const vid = stage.querySelector('video');
  if (vid) { try { vid.pause(); } catch { /* not started */ } }
  const yt = stage.querySelector('[data-vo-yt]');
  if (yt) {
    try {
      yt.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
    } catch { /* frame gone */ }
  }
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
  const stage = o.querySelector('.vo-stage');
  stage.innerHTML = playerHtml(video, { autoplay: true });
  applyDefaultVolume(stage);
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
  // Same thumbnail everywhere: with no custom poster, a YouTube source uses
  // YouTube's own frame, which is exactly what the warranty page's framed
  // player shows.
  const poster = video.poster ||
    (video.youtube ? `https://i.ytimg.com/vi/${encodeURIComponent(video.youtube)}/hqdefault.jpg` : '');
  return `
    <figure class="vo-inline" data-vo-inline>
      <div class="vo-inline-stage" data-vo-poster>
        ${poster ? `<img class="vo-inline-poster" src="${esc(poster)}" alt="${esc(video.title || label)}">` : ''}
        <button class="vo-play" type="button" data-vo-play aria-label="Play ${esc(label)}">
          <svg class="vo-play-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
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
      // The overlay is about to own the audio: silence the inline player
      // first or both stream at once.
      pausePlayback(fig.querySelector('[data-vo-poster]'));
      openVideoOverlay(video);
      return;
    }
    if (e.target.closest('[data-vo-play]')) {
      // Play inline in place, in the poster stage.
      const stage = fig.querySelector('[data-vo-poster]');
      if (stage) {
        stage.innerHTML = playerHtml(video, { autoplay: true });
        applyDefaultVolume(stage);
      }
    }
  });
}

/* ---------- framed embed (warranty page) ---------- */

// A titled frame hosting the player directly: the video is right there to
// watch, no poster interstitial. YouTube supplies its own thumbnail inside
// the iframe, and the house half-volume applies once the player is up.
export function framedVideoHtml(video) {
  if (!hasVideoSource(video)) return '';
  return `
    <figure class="vo-framed" data-vo-framed>
      <figcaption class="vo-framed-head">
        <span class="vo-framed-title">${esc(video.title || 'How-To')}</span>
        <button class="vo-expand" type="button" data-vo-expand aria-label="Expand video">Expand</button>
      </figcaption>
      <div class="vo-framed-stage">${playerHtml(video, { autoplay: false })}</div>
    </figure>
  `;
}

/** Wire a container holding one framedVideoHtml block: half volume now, and
 *  the Expand control hands the same source to the overlay. */
export function bindFramedVideo(root, video) {
  if (!root || !hasVideoSource(video)) return;
  const fig = root.querySelector('[data-vo-framed]');
  if (!fig || fig._voBound) return;
  fig._voBound = true;
  applyDefaultVolume(fig.querySelector('.vo-framed-stage'));
  fig.addEventListener('click', (e) => {
    if (e.target.closest('[data-vo-expand]')) {
      // Same rule as the inline embed: one player audible at a time.
      pausePlayback(fig.querySelector('.vo-framed-stage'));
      openVideoOverlay(video);
    }
  });
}
