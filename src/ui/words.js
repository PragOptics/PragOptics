// src/ui/words.js
//
// THE PLATFORM'S FORMATTERS (2026-09-24), one copy for the whole site: the HTML escape, an amount of money, a date the
// way the backend and its emails write it, and a count with its noun. Every section imports them from here instead of
// declaring its own; licensingShared.js re-exports them for the Licensing tab's modules. A copy that drifts (a date read
// in the reader's own time zone, so "Sending started" near midnight UTC named another day) is what this file prevents.

/** Text made safe to put inside HTML, attribute values included. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** "$46.80" from dollars. */
export function money(n) { return `$${Number(n || 0).toFixed(2)}`; }

/** "$46.80" from cents. */
export function cents(c) { return money((Number(c) || 0) / 100); }

/** "October 22, 2026", read in UTC like the server's own words, so a date is the same day wherever it is read. */
export function dayWord(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
}

/** "1 owner", "3 owners". */
export function countWord(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
