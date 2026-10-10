// src/account/avatar.js
//
// THE AVATAR (2026-10-10, Cameron). One small identity unit used across the account, and carried to the studio: a
// person's photo if they set one, else the default alien (the site's own anomaly glyph on a brand circle, so there is
// always a face and it is clearly "a human, not an AI"). The photo is a small square image the person uploads; the
// browser shrinks it to 128px and keeps it as a data URL on the Users row (v1/account/preferences), so it follows them
// to any browser and into the studio's profile icon.

import { PRAG_API_BASE } from '../runtime/config.js';
import { rememberUserPreference } from '../runtime/userTheme.js';

const MAX_PX = 128;
const MAX_BYTES = 48 * 1024;   // the Users-row string cap the backend enforces

/** The avatar for a user: their photo if set, else the default alien on a brand circle. `size` in px. */
export function avatarHtml(user, size = 32) {
  const av = user && typeof user.avatar === 'string' ? user.avatar : '';
  const s = Math.max(16, Math.round(Number(size) || 32));
  if (av && /^data:image\//.test(av)) {
    return `<span class="av" style="--av:${s}px"><img class="av-img" src="${av.replace(/"/g, '&quot;')}" alt="" loading="lazy" decoding="async" /></span>`;
  }
  return `<span class="av av--alien" style="--av:${s}px" title="A live human (no photo yet)" aria-hidden="true"><span class="av-alien"></span></span>`;
}

/** Read an image File and return a small square data URL, cover-cropped to 128px and kept under the row cap. */
export function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Choose an image file (PNG, JPEG or WebP).'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('That image is too big. Pick one under 10 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight) || 1;
        const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
        const c = document.createElement('canvas'); c.width = MAX_PX; c.height = MAX_PX;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_PX, MAX_PX);
        URL.revokeObjectURL(url);
        let out = '';
        try { out = c.toDataURL('image/webp', 0.85); } catch { out = ''; }
        if (!out || !out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
        if (out.length > MAX_BYTES) out = c.toDataURL('image/webp', 0.6);
        if (out.length > MAX_BYTES) out = c.toDataURL('image/jpeg', 0.6);
        if (out.length > MAX_BYTES) return reject(new Error('Could not shrink that image enough. Try a simpler one.'));
        resolve(out);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

/** Save the avatar (or clear it with "") to the account, and update the cached ping so the UI follows at once. */
export async function saveAvatar(apiFetch, dataUrl) {
  await apiFetch(`${PRAG_API_BASE}/account/preferences`, { method: 'POST', body: JSON.stringify({ avatar: dataUrl }) });
  try { rememberUserPreference('avatar', dataUrl); } catch { /* the cached update is best effort */ }
}
