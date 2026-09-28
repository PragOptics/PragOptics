// src/ui/clipboard.js
//
// THE CLIPBOARD (2026-09-24): the site's one way to put text on the clipboard. Every copy button goes through
// cards.js copyButton, which calls this and says what happened on the button. (explainer.js hands this on under the
// same name for the pages that already import it from there. The API console keeps its own copy until it is discussed,
// decision 39.)

/**
 * The modern API or, where it refuses (an embedded browser, a page without the permission), the old
 * selection-and-copy path. Throws when neither works.
 * `host` is where the hidden textarea of the old path goes. A modal <dialog> (showModal) makes everything outside it
 * inert, and an inert textarea takes no selection, so a copy from inside one puts the textarea inside the dialog. The
 * focus goes back where it was once the textarea is gone.
 */
export async function writeClipboard(text, host = document.body) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* fall through */ }
  const back = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  (host && host.isConnected ? host : document.body).appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  try { back?.focus?.({ preventScroll: true }); } catch { /* nothing held the focus */ }
  if (!ok) throw new Error('clipboard refused');
}

/** Select an element's text for the keyboard's copy: a field's value, or the text of anything else. */
export function selectText(el) {
  if (!el) return false;
  try {
    if (typeof el.select === 'function') { el.focus?.({ preventScroll: true }); el.select(); return true; }
    const r = document.createRange(); r.selectNodeContents(el);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    return true;
  } catch { return false; }
}
