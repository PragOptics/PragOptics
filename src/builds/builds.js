// src/builds/builds.js
// "Share your build" — community uploads, anonymous or with an account.
//
// Backend seam: BUILDS_API_LIVE gates the real call (multipart POST — photos +
// metadata). Until the endpoint is deployed, submissions queue their METADATA
// locally under pragoptics_builds_queue_v1 (files stay on the user's machine;
// there is nowhere to put them yet) so the whole flow is testable today and
// flips live with one flag — same pattern as the warranty registration.

import { HARDWARE, getProduct } from '../shop/products.js';

const BUILDS_API_LIVE = false; // ← flip when POST /builds (multipart) is deployed
import { PRAG_API_BASE } from '../runtime/config.js';
const BUILDS_UPLOAD_URL = `${PRAG_API_BASE}/builds`;

const INTENT_KEY = 'pragoptics_build_intent_v1'; // consumed by the account path
const QUEUE_KEY  = 'pragoptics_builds_queue_v1'; // local metadata queue until live

const MAX_PHOTOS = 6;
const MAX_MB_PER_PHOTO = 12;

const CHECK_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';
const CAM_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="14" r="3.4"/></svg>';

let $body = null;
let $gallery = null;
let photos = []; // [{ file, url }]

// Photos submitted THIS session keep a live object URL so their gallery card
// can show the real image immediately (local queue only stores metadata —
// bytes upload once the backend is live).
const sessionPhotos = new Map(); // submittedAt -> objectURL

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- templates ---------- */

function formHtml() {
  const opts = HARDWARE.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  return `
    <div class="bd-form" data-bd-step="form">
      <div class="bd-fields">
        <div class="form-field">
          <label for="bdDevice">What did you build?</label>
          <div class="wr-select-wrap">
            <select id="bdDevice" class="wr-select">
              <option value="" selected disabled>Select the design…</option>
              ${opts}
              <option value="custom">Something of my own, from the designs</option>
            </select>
            <span class="wr-select-caret" aria-hidden="true">▾</span>
          </div>
        </div>
        <div class="form-field">
          <label for="bdHandle">Display name <span class="bd-optional">optional — blank posts as Anonymous</span></label>
          <input id="bdHandle" type="text" maxlength="40" autocomplete="nickname" placeholder="e.g. LoopTech_Hank">
        </div>
      </div>

      <div class="bd-drop" id="bdDrop" role="button" tabindex="0" aria-label="Add photos of your build">
        <span class="bd-drop-ico">${CAM_ICON}</span>
        <span class="bd-drop-t">Add photos of your build</span>
        <span class="bd-drop-s">Up to ${MAX_PHOTOS} images · drag them here or click to browse</span>
        <input id="bdFiles" type="file" accept="image/*" multiple hidden>
      </div>
      <div class="bd-thumbs" id="bdThumbs" hidden></div>

      <div class="form-field">
        <label for="bdNotes">Build notes <span class="bd-optional">printer, resin or filament, what you'd tell the next builder</span></label>
        <textarea id="bdNotes" rows="4" maxlength="2000" placeholder="Printed flat on a flexible plate, released clean. Swapped the…"></textarea>
      </div>

      <p class="wr-error" id="bdError" hidden></p>

      <div class="bd-paths">
        <button class="btn bd-path" type="button" data-bd-action="share-anon">
          <span class="bd-path-t">Share anonymously</span>
          <span class="bd-path-s">No account, no sign-in — just the build.</span>
        </button>
        <button class="cta bd-path" type="button" data-bd-action="share-account">
          <span class="bd-path-t">Share with my account</span>
          <span class="bd-path-s">Your builds live on your profile.</span>
        </button>
      </div>
    </div>
  `;
}

function successHtml(withAccount) {
  return `
    <div class="bd-done" data-bd-step="done">
      <span class="wr-done-badge">${CHECK_ICON}</span>
      <span class="wr-thanks-big">That's a good-looking build.</span>
      <p class="wr-thanks-sub">Thanks for sharing it — builds like yours are exactly why the designs are free.</p>
      ${withAccount ? `<p class="wr-thanks-sub">Finishing up: we're taking you to sign-in so it posts under your account.</p>` : ''}
      <div class="wr-done-actions">
        <button class="btn" type="button" data-bd-action="share-another">Share another</button>
        <button class="btn" type="button" data-bd-action="back-home">Back to PragOptics</button>
      </div>
    </div>
  `;
}

/* ---------- community showcase wall ---------- */

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function galleryCardHtml(b) {
  const p = b.deviceId && b.deviceId !== 'custom' ? getProduct(b.deviceId) : null;
  const img = sessionPhotos.get(b.submittedAt) || p?.image || null;
  const name = p?.name || 'Custom build';
  const who = b.handle || 'Anonymous';
  const when = b.submittedAt ? new Date(b.submittedAt).toLocaleDateString() : '';
  const shots = b.photos?.length || 0;
  return `
    <article class="bg-card">
      <div class="bg-media">
        ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(name)} build" loading="lazy">`
              : `<div class="bg-media-ph" aria-hidden="true">${CAM_ICON}</div>`}
        <span class="bg-pill">Queued for launch</span>
      </div>
      <div class="bg-info">
        <span class="bg-name">${escapeHtml(name)}</span>
        <span class="bg-meta">${escapeHtml(who)}${when ? ` · ${escapeHtml(when)}` : ''}${shots ? ` · ${shots} photo${shots === 1 ? '' : 's'}` : ''}</span>
        ${b.notes ? `<p class="bg-notes">${escapeHtml(b.notes)}</p>` : ''}
      </div>
    </article>
  `;
}

function renderGallery() {
  if (!$gallery) return;
  // Seam: when BUILDS_API_LIVE flips, this reads the moderated community feed
  // (endpoint TBD — named with the backend) instead of the local queue.
  const builds = readQueue().slice().reverse();
  if (!builds.length) {
    $gallery.innerHTML = `
      <div class="bg-empty">
        <span class="bg-empty-glyph" aria-hidden="true">${CAM_ICON}</span>
        <p class="bg-empty-t">The wall is waiting.</p>
        <p class="bg-empty-s muted">No builds on this device yet — yours could be the first one on it.</p>
      </div>
    `;
    return;
  }
  $gallery.innerHTML = builds.map(galleryCardHtml).join('');
}

/* ---------- photos ---------- */

function renderThumbs() {
  const host = $body.querySelector('#bdThumbs');
  if (!host) return;
  host.hidden = photos.length === 0;
  host.innerHTML = photos.map((p, i) => `
    <figure class="bd-thumb">
      <img src="${p.url}" alt="">
      <button type="button" class="bd-thumb-x" data-bd-remove="${i}" aria-label="Remove photo">✕</button>
    </figure>
  `).join('');
}

function addFiles(fileList) {
  const err = $body.querySelector('#bdError');
  if (err) err.hidden = true;
  for (const file of fileList) {
    if (photos.length >= MAX_PHOTOS) break;
    if (!file.type.startsWith('image/')) continue;
    if (file.size > MAX_MB_PER_PHOTO * 1024 * 1024) {
      if (err) { err.textContent = `"${file.name}" is over ${MAX_MB_PER_PHOTO} MB — resize it and try again.`; err.hidden = false; }
      continue;
    }
    photos.push({ file, url: URL.createObjectURL(file) });
  }
  renderThumbs();
}

function clearPhotos() {
  // Don't revoke a URL that a session gallery card is still showing.
  const kept = new Set(sessionPhotos.values());
  photos.forEach(p => { if (!kept.has(p.url)) { try { URL.revokeObjectURL(p.url); } catch {} } });
  photos = [];
}

/* ---------- submission ---------- */

async function submitBuild({ anonymous }) {
  const meta = {
    deviceId: $body.querySelector('#bdDevice')?.value || null,
    handle: ($body.querySelector('#bdHandle')?.value || '').trim() || null,
    notes: ($body.querySelector('#bdNotes')?.value || '').trim() || null,
    photos: photos.map(p => ({ name: p.file.name, size: p.file.size, type: p.file.type })),
    anonymous: !!anonymous,
    submittedAt: new Date().toISOString(),
    source: 'web-v1'
  };
  // Keep the first photo alive for this session's gallery card.
  if (photos[0]) sessionPhotos.set(meta.submittedAt, photos[0].url);

  if (BUILDS_API_LIVE) {
    // Real call — multipart: photos + a metadata part. The backend stores the
    // images and writes the build entity (moderated before it shows anywhere).
    const fd = new FormData();
    photos.forEach((p, i) => fd.append(`photo${i}`, p.file, p.file.name));
    fd.append('meta', JSON.stringify(meta));
    const res = await fetch(BUILDS_UPLOAD_URL, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return res.json().catch(() => ({}));
  }

  // Metadata queue until the endpoint ships (files can't be persisted locally).
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    q.push(meta);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* storage blocked — still complete locally */ }
  await new Promise(r => setTimeout(r, 600));
  return { queued: true };
}

/* ---------- wiring ---------- */

function validate() {
  const err = $body.querySelector('#bdError');
  const device = $body.querySelector('#bdDevice')?.value;
  if (!device) { if (err) { err.textContent = 'Pick which design you built.'; err.hidden = false; } return false; }
  if (photos.length === 0) { if (err) { err.textContent = 'Add at least one photo — the build is the point.'; err.hidden = false; } return false; }
  if (err) err.hidden = true;
  return true;
}

function bindOnce() {
  if (bindOnce._bound || !$body) return;
  bindOnce._bound = true;

  $body.addEventListener('click', async (e) => {
    const drop = e.target.closest('#bdDrop');
    if (drop) { $body.querySelector('#bdFiles')?.click(); return; }

    const rm = e.target.closest('[data-bd-remove]');
    if (rm) {
      const i = Number(rm.dataset.bdRemove);
      try { URL.revokeObjectURL(photos[i]?.url); } catch {}
      photos.splice(i, 1);
      renderThumbs();
      return;
    }

    const path = e.target.closest('[data-bd-action="share-anon"], [data-bd-action="share-account"]');
    if (path) {
      if (!validate()) return;
      const withAccount = path.dataset.bdAction === 'share-account';
      path.disabled = true;
      let intent = null;
      if (withAccount) {
        intent = {
          deviceId: $body.querySelector('#bdDevice')?.value,
          handle: ($body.querySelector('#bdHandle')?.value || '').trim() || null,
          photoCount: photos.length
        };
      }
      try {
        await submitBuild({ anonymous: !withAccount });
      } catch (ex) {
        path.disabled = false;
        const err = $body.querySelector('#bdError');
        if (err) { err.textContent = ex?.message || 'Upload failed — please try again.'; err.hidden = false; }
        return;
      }
      clearPhotos();
      renderGallery(); // the new build appears on the wall immediately
      $body.innerHTML = successHtml(withAccount);
      if (withAccount) {
        // Same handoff as warranty: stash the intent, run the normal sign-in /
        // account-creation flow; the backend ties the build to the account.
        try { localStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch {}
        setTimeout(() => {
          // Agreement -> account creation on the landing, matching warranty
          // and transfer. (Was startPragOpticsLogin, which left the site for
          // the retired CIAM host.)
          window.setAppMode?.('landing');
          setTimeout(() => { window.openAgreementModal?.(); }, 250);
        }, 1600);
      }
      return;
    }

    if (e.target.closest('[data-bd-action="share-another"]')) {
      $body.innerHTML = formHtml();
      renderThumbs();
      return;
    }
    if (e.target.closest('[data-bd-action="back-home"]')) {
      window.setAppMode?.('landing');
    }
  });

  $body.addEventListener('change', (e) => {
    if (e.target.closest('#bdFiles')) {
      addFiles(e.target.files || []);
      e.target.value = ''; // allow re-picking the same file
    }
  });

  $body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('#bdDrop')) {
      e.preventDefault();
      $body.querySelector('#bdFiles')?.click();
    }
  });

  // drag & drop
  $body.addEventListener('dragover', (e) => {
    const drop = e.target.closest('#bdDrop');
    if (!drop) return;
    e.preventDefault();
    drop.classList.add('is-over');
  });
  $body.addEventListener('dragleave', (e) => {
    e.target.closest('#bdDrop')?.classList.remove('is-over');
  });
  $body.addEventListener('drop', (e) => {
    const drop = e.target.closest('#bdDrop');
    if (!drop) return;
    e.preventDefault();
    drop.classList.remove('is-over');
    addFiles(e.dataTransfer?.files || []);
  });
}

export function initBuildsView() {
  $body = document.getElementById('buildsBody');
  $gallery = document.getElementById('buildsGallery');
  if (!$body) return;
  $body.innerHTML = formHtml();
  renderGallery();
  bindOnce();
}
