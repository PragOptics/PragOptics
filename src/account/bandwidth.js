// src/account/bandwidth.js
//
// THE BANDWIDTH CARD on Billing (Cameron's ruling, 2026-09-29). What the account's published sites served this calendar
// month (UTC) against the plan's allowance, which site served the most, pay as you go past the allowance, and the closed
// months. One route reads it and one changes it, and both answer the same shape (the backend's functions/usageBandwidth.js):
//
//   GET  v1/usage/bandwidth          { ok, tier, month, usedBytes, allowanceBytes, percent, level, paused, clearsAt,
//                                      bySite: [{ site, bytes }], siteSplit, payg: { available, on, capCents, rateCents,
//                                      accruedCents, canChange }, history: [{ month, bytes, allowanceBytes, overageBytes,
//                                      chargedCents, billing, paused }] }
//   POST v1/account/bandwidth/payg   { on, capCents } -> the same shape; the owner only; Free is refused
//
// Pay as you go belongs to the account OWNER and covers every lane and site of theirs. Turning it on can charge money, so
// the switch asks first (cards.js armed()); turning it off is one press, and raising the cap asks first too. The switch
// is the AI switch's look drawn as a button (environment.css .btn.ev-switch), so the panel's one two-press confirm can
// open it into its question. The per-site bytes come from the storage logs and only point at the busiest site: the total
// is the figure that counts against the allowance and that is billed. A pause clears at 00:11 UTC on the 1st (the hourly
// pass); the time left is worked out from the route's clearsAt while the card is on screen.
//
// FREE (Cameron's addendum, 2026-09-29): Free is enforced at 1 GB a month for each free environment and never gets the
// switch, since a switch would be a way around subscribing. Its card is the meter against 1 GB, the notices' own words,
// the one sentence about a paid plan with the way to the plans, and when it is paused the live time until it clears. A
// free site's figure is counted from the shared account's storage logs once a night; when those logs could not be read
// (siteSplit "unavailable") the card says the figure may be behind, and nothing is paused on the server's side.
//
// Shared helpers arrive through `deps` from account.js: apiFetch, friendlyError, meterRowHtml, gbFmt, cachedPing,
// pickedTeam.

import { PRAG_API_BASE } from '../runtime/config.js';
import { cardHtml, leadBtn, stateLead, armed } from './cards.js';
import { esc, cents, countWord } from '../ui/words.js';

const READ_URL = `${PRAG_API_BASE}/usage/bandwidth`;
const PAYG_URL = `${PRAG_API_BASE}/account/bandwidth/payg`;
const HOST_ID = 'acctBandwidthCard';
const CARD_KEY = 'billing:bandwidth';
const CAP_MIN = 100;       // $1, the route's floor (400 CAP_RANGE below it)
const CAP_MAX = 100000;    // $1,000, the route's ceiling
const RATE_FALLBACK = 20;  // cents per GB, when an answer carries no rate

let D = null;
const bw = { data: null, error: '', note: '', busy: '', capDraft: null, seq: 0 };

/* ---------- words ---------- */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function known(v) { return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)); }
function isFree(d) { return d?.payg ? d.payg.available === false : String(d?.tier || '').toLowerCase() === 'free'; }
function rateWords(d) { return `${cents(num(d?.payg?.rateCents) || RATE_FALLBACK)} per GB`; }
/** "12" or "12.50": a cap in the dollars box. */
function capDollars(c) { const v = num(c); return v <= 0 ? '' : v % 100 === 0 ? String(v / 100) : (v / 100).toFixed(2); }
/** "August 2026" from "2026-08". */
function monthWords(ym) {
  const s = String(ym || '');
  return /^\d{4}-\d{2}$/.test(s) ? new Date(`${s}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : s;
}
/** The share of the allowance used, rounded down so 99.6 percent never reads as reached. */
function percentOf(d) {
  if (known(d.percent)) return Math.max(0, Math.floor(Number(d.percent)));
  const allow = num(d.allowanceBytes);
  return allow > 0 && known(d.usedBytes) ? Math.floor((num(d.usedBytes) / allow) * 100) : 0;
}
/** A site's bytes: the panel's gbFmt, with "under 0.1 GB" where that would read as none. */
function siteSize(bytes) {
  const b = num(bytes);
  const s = D.gbFmt(b);
  return b > 0 && s === '0.0 GB' ? 'under 0.1 GB' : s;
}
/** "1 GB", "10 GB", "2.5 GB": an allowance in a sentence, without the meter's ".0". */
function gbWords(bytes) { return D.gbFmt(bytes).replace(/\.0 GB$/, ' GB'); }
/** The site the account's root address serves has no folder of its own; the route may name it with an empty slug. A
 *  free site's pointer is its folder under the shared account (<environmentId>/<slug>): the slug is its name. */
function siteName(site) {
  let s = String(site ?? '').trim();
  if (s.includes('/') && s !== '/') s = s.replace(/\/+$/, '').split('/').pop() || '';
  return /^(|\/|\(root\)|\$root|_root|@root)$/i.test(s) ? 'Main site' : s;
}
/** "in 2 days and 5 hours" from now to `at`. */
function untilWords(ms) {
  if (ms <= 0) return 'in a few minutes';
  const hours = Math.floor(ms / 3600000);
  const d = Math.floor(hours / 24), h = hours % 24;
  if (!d && !h) return 'in less than an hour';
  return `in ${[d ? countWord(d, 'day', 'days') : '', h ? countWord(h, 'hour', 'hours') : ''].filter(Boolean).join(' and ')}`;
}
/** "October 1": the day a pause clears, read in UTC. */
function clearDay(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
}
/** "October 1 at 00:11 UTC, in 2 days and 5 hours", worked out at `now`. */
function clearsWords(iso, now = Date.now()) {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return 'the first of next month at 00:11 UTC';
  const at = new Date(t);
  const hm = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
  return `${clearDay(iso)} at ${hm} UTC, ${untilWords(t - now)}`;
}
/** "There are 12 days left in September." at `now`, in UTC like the allowance's month; today counts while it lasts. */
function monthLeftWords(now = Date.now()) {
  const d = new Date(now);
  const left = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - now;
  const name = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  if (left < 86400000) return `Less than a day is left in ${name}.`;
  const days = Math.ceil(left / 86400000);
  return `There are ${days} days left in ${name}.`;
}
/** "October 1", the day after this month in UTC: when a pause that has not happened yet would clear. */
function nextMonthDay(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}
function splitUnavailable(d) { return String(d?.siteSplit || '').toLowerCase() === 'unavailable'; }
function errText(ex, fallback) { return ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback)); }
function capWords(then) { return `Enter a monthly cap from $1 to $1,000 in the Monthly cap box, then ${then}.`; }

/** The level in words (decision 3: 75 percent close, 90 very close, 100 reached; with pay as you go on, the cap's own). */
function levelWords(d) {
  const pct = percentOf(d);
  const p = d.payg || {};
  if (isFree(d)) {
    // the free notices' own words (the addendum): 75 and 90 percent tell, 1 GB pauses this environment's sites only
    const allow = num(d.allowanceBytes) > 0 ? gbWords(d.allowanceBytes) : '1 GB';
    if (pct >= 100) return `Your free site has used all of this month's ${allow}. It pauses until ${nextMonthDay()} at the next reading.`;
    const first = `Your free site has used ${pct} percent of this month's bandwidth.`;
    return pct >= 75 ? `${first} At ${allow} it pauses until ${nextMonthDay()}.` : first;
  }
  if (pct >= 100 && p.on) return 'Your sites passed this month\'s allowance, and pay as you go is keeping them up.';
  if (pct >= 100) return 'Your sites have used this month\'s allowance. They pause at the next reading unless pay as you go is on.';
  if (pct >= 90) return `Your sites are very close to this month's allowance: ${pct} percent is used.`;
  if (pct >= 75) return `Your sites are close to this month's allowance: ${pct} percent is used.`;
  return `Your sites have used ${pct} percent of this month's allowance.`;
}

/* ---------- the card ---------- */

function meterHtml(d) {
  if (!known(d.usedBytes) || num(d.allowanceBytes) <= 0) return `<p class="acct-card-note">This month's figure is not available yet. It is read once a night.</p>`;
  const meter = D.meterRowHtml('Served this month', num(d.usedBytes), num(d.allowanceBytes), D.gbFmt);
  // a free site's total IS the logs' count, so logs that could not be read leave it behind (paid totals come from the
  // account's own metric and only the per-site list waits)
  return isFree(d) && splitUnavailable(d)
    ? `${meter}<p class="acct-card-note bw-line">The latest traffic could not be counted yet, so this figure may be behind. It is counted once a night.</p>`
    : meter;
}

function pausedHtml(d) {
  if (!d.paused) return '';
  if (isFree(d)) {
    // a free site is paused on its own (its files set aside, a notice page in their place): a paid plan brings it back now
    const allow = num(d.allowanceBytes) > 0 ? gbWords(d.allowanceBytes) : '1 GB';
    return `<p class="acct-error bw-paused" role="status">Your free site is paused until <span data-bw-live="clears">${esc(clearsWords(d.clearsAt))}</span>, because it served this month's ${esc(allow)}. Every file is kept, and visitors see a page that says it will be back. A paid plan brings it back now.</p>`;
  }
  const p = d.payg || {};
  const owner = !!p.canChange;
  const fix = p.on
    ? (owner ? 'Raise the monthly cap below to bring them back now.' : 'The account owner can raise the pay as you go cap on Billing to bring them back now.')
    : (owner ? `Turn on pay as you go below to bring them back now at ${rateWords(d)}.` : 'The account owner can turn on pay as you go on Billing to bring them back now.');
  const why = p.on ? 'pay as you go reached its monthly cap' : 'they served this month\'s allowance';
  return `<p class="acct-error bw-paused" role="status">Your sites are paused until <span data-bw-live="clears">${esc(clearsWords(d.clearsAt))}</span>, because ${why}. Every file is kept. ${esc(fix)}</p>`;
}

function capLevelHtml(d) {
  const p = d.payg || {};
  const cap = num(p.capCents);
  if (!p.on || d.paused || cap <= 0) return '';
  const pct = Math.floor((num(p.accruedCents) / cap) * 100);
  if (pct < 80) return '';
  return `<p class="acct-card-note bw-line">Pay as you go charges have reached ${pct} percent of the ${esc(cents(cap))} cap. At the cap your sites pause until ${esc(clearDay(d.clearsAt) || nextMonthDay())} unless ${p.canChange ? 'you raise it' : 'the account owner raises it'}.</p>`;
}

function sitesHtml(d) {
  const list = (Array.isArray(d.bySite) ? d.bySite : []).filter(s => s && typeof s === 'object');
  const head = '<h4 class="bw-sub">By site this month</h4>';
  if (splitUnavailable(d)) {
    const names = [...new Set(list.map(s => siteName(s.site)).filter(Boolean))];
    const named = names.length === 1 ? ` The site on this account is ${esc(names[0])}.` : names.length ? ` The sites on this account are ${esc(names.join(', '))}.` : '';
    return `${head}<p class="acct-card-note">Per-site figures are not available yet.${named}</p>`;
  }
  if (!list.length) return `${head}<p class="acct-card-note">No site has served anything this month yet.</p>`;
  const rows = [...list].sort((a, b) => num(b.bytes) - num(a.bytes));
  return `${head}
    <ul class="bw-sites">
      ${rows.map(s => `<li class="bw-site"><span class="bw-site-name">${esc(siteName(s.site))}</span><span class="bw-site-val">${esc(siteSize(s.bytes))}</span></li>`).join('')}
    </ul>
    <p class="lic-hint">The per-site figures come from the storage logs and show which site is busiest. The total above is the one that counts against the allowance.</p>`;
}

/** The switch: the AI switch's track, thumb and words, as a button that armed() can open into its question. */
function switchHtml(p) {
  const on = !!p.on;
  const out = bw.busy === 'on' || bw.busy === 'off';
  const word = bw.busy === 'on' ? 'Turning it on…' : bw.busy === 'off' ? 'Turning it off…' : on ? 'Pay as you go is on' : 'Pay as you go is off';
  const tip = bw.busy ? (out ? word : 'Wait for the cap to save') : on ? 'Turn pay as you go off. It saves at once.' : 'Turn pay as you go on. It asks you first.';
  // data-on is the switch's own state: armed() keeps data-armed for its press-again state (the two clashed on the Tenants desk)
  return `<button class="btn ev-switch bw-switch" type="button" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="Pay as you go" data-acct-action="bw-payg" data-on="${on ? '1' : '0'}" data-tip="${esc(tip)}" ${bw.busy ? 'disabled' : ''} ${out ? 'aria-busy="true"' : ''}>
      <span class="ev-switch-track" aria-hidden="true"><span class="ev-switch-thumb"></span></span>
      <span class="ev-switch-text">${esc(word)}</span>
    </button>`;
}

/** Save the cap arms only when the box holds a different cap than the one saved (an unreadable one arms it too, so
 *  the press can say what to fix). */
function capDirty() {
  const p = bw.data?.payg || {};
  if (!p.on || bw.capDraft === null) return false;
  return capCentsOf(bw.capDraft) !== num(p.capCents) && String(bw.capDraft).trim() !== '';
}

function paygHtml(d) {
  const p = d.payg || {};
  const head = '<h4 class="bw-sub">Pay as you go</h4>';
  const cap = num(p.capCents), accrued = num(p.accruedCents);
  const charged = (p.on || accrued > 0) && cap > 0 ? D.meterRowHtml('Charged this month', accrued, cap, cents) : '';
  if (!p.canChange) {
    return `${head}
      <p class="acct-card-note">${p.on
        ? `Pay as you go is on. The sites stay up past the allowance at ${esc(rateWords(d))}, up to a ${esc(cents(cap))} cap each month.`
        : 'Pay as you go is off. At the allowance the sites pause until the first of next month.'} Only the account owner can change it.</p>
      ${charged}`;
  }
  const value = bw.capDraft !== null ? bw.capDraft : capDollars(cap);
  const over = known(d.usedBytes) && num(d.allowanceBytes) > 0 && num(d.usedBytes) >= num(d.allowanceBytes);
  return `${head}
    <p class="acct-card-note">Keep your sites up past the allowance for ${esc(rateWords(d))}, up to the cap you set. Billed with your plan.</p>
    <div class="bw-payg-row">
      ${switchHtml(p)}
      <label class="bw-cap" for="bwCap">
        <span class="bw-cap-k">Monthly cap</span>
        <span class="bw-cap-box"><span class="bw-cap-cur" aria-hidden="true">$</span><input class="acct-input bw-cap-in" id="bwCap" type="number" inputmode="decimal" min="1" max="1000" step="any" placeholder="25" value="${esc(value)}" aria-describedby="bwCapHint" required ${bw.busy ? 'disabled' : ''}></span>
      </label>
      ${p.on ? stateLead({ acct: 'bw-cap' }, 'check', 'Save the cap', { out: bw.busy === 'cap', busyWord: 'Saving the cap…', waiting: bw.busy && bw.busy !== 'cap' ? 'Wait for the switch to finish' : '' }, capDirty() ? '' : 'disabled') : ''}
    </div>
    <p class="lic-hint" id="bwCapHint">The cap is for each month and covers every site and lane on this account, from $1 to $1,000.${p.on && over && !d.paused ? ' Your sites are past this month\'s allowance, so turning pay as you go off pauses them at once.' : ''}</p>
    ${charged}`;
}

function freeHtml() {
  return `
    <p class="acct-card-note bw-line">A paid plan includes 10 GB or more a month and can keep your site up past it.</p>
    <div class="acct-actions-row">${leadBtn({ acct: 'subscribe' }, 'layers', 'See plans')}</div>`;
}

const BILLING_WORDS = { 'invoice-item': 'with the plan', invoice: 'invoiced', carried: 'carried' };
function chargedCell(h) {
  const c = num(h.chargedCents);
  if (c <= 0) return 'None';
  const how = BILLING_WORDS[String(h.billing || '')] || 'pending';
  return `${esc(cents(c))} <span class="acct-tag">${esc(how)}</span>`;
}

function historyHtml(d) {
  const rows = (Array.isArray(d.history) ? d.history : []).filter(h => h && typeof h === 'object').slice(0, 12);
  const head = '<h4 class="bw-sub">Past months</h4>';
  if (!rows.length) return `${head}<p class="acct-card-note">No closed months yet. Each month appears here once it ends.</p>`;
  const carried = rows.some(h => String(h.billing || '') === 'carried');
  // Free is never charged (no pay as you go), so its table has no Charged column; a month charged before a move to Free
  // still shows it
  const charges = !isFree(d) || rows.some(h => num(h.chargedCents) > 0);
  return `${head}
    <div class="adm-table-scroll">
      <table class="adm-table adm-table--wrap bw-hist">
        <thead><tr><th>Month</th><th class="adm-num">Served</th><th class="adm-num">Allowance</th><th class="adm-num">Past the allowance</th>${charges ? '<th class="adm-num">Charged</th>' : ''}<th>Paused</th></tr></thead>
        <tbody>
          ${rows.map(h => `
            <tr>
              <td class="cell-tight" data-th="Month">${esc(monthWords(h.month))}</td>
              <td class="adm-num cell-tight" data-th="Served">${esc(D.gbFmt(h.bytes))}</td>
              <td class="adm-num cell-tight" data-th="Allowance">${esc(D.gbFmt(h.allowanceBytes))}</td>
              <td class="adm-num cell-tight" data-th="Past the allowance">${num(h.overageBytes) > 0 ? esc(siteSize(h.overageBytes)) : 'None'}</td>
              ${charges ? `<td class="adm-num cell-tight" data-th="Charged">${chargedCell(h)}</td>` : ''}
              <td class="cell-tight" data-th="Paused">${h.paused ? 'Yes' : 'No'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${carried ? '<p class="lic-hint">On an annual plan, charges under $5.00 are carried and invoiced together once they reach $5.00.</p>' : ''}`;
}

function summaryOf(d) {
  if (d.paused) return `paused until ${clearDay(d.clearsAt) || nextMonthDay()}`;
  const parts = [];
  if (known(d.usedBytes) && num(d.allowanceBytes) > 0) parts.push(`${D.gbFmt(d.usedBytes)} of ${D.gbFmt(d.allowanceBytes)}`);
  if (d.payg?.on) parts.push('pay as you go on');
  return parts.join(' · ') || monthWords(d.month);
}

function bodyHtml(d) {
  const free = isFree(d);
  const level = d.paused || !known(d.usedBytes) ? '' : `<p class="acct-card-note bw-line">${esc(levelWords(d))} <span data-bw-live="left">${esc(monthLeftWords())}</span></p>`;
  return `
    ${meterHtml(d)}
    ${pausedHtml(d)}${level}
    ${capLevelHtml(d)}
    ${sitesHtml(d)}
    ${free ? freeHtml() : paygHtml(d)}
    <p class="acct-error" id="bwError" ${bw.error ? '' : 'hidden'}>${esc(bw.error)}</p>
    <p class="acct-card-note bw-msg" role="status" ${bw.note ? '' : 'hidden'}>${esc(bw.note)}</p>
    ${historyHtml(d)}
    <p class="lic-hint">${free ? 'Your free site\'s bandwidth is counted once a night.' : 'Bandwidth is read from Azure once a night, and every hour once the sites pass 75 percent of the allowance.'}</p>`;
}

function paint() {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  const d = bw.data;
  if (!d) {
    host.innerHTML = bw.error ? cardHtml({ key: CARD_KEY, icon: 'globe', title: 'Bandwidth', summary: 'could not be read', body: `<p class="acct-error">${esc(bw.error)}</p>` }) : '';
    return;
  }
  const pct = percentOf(d);
  host.innerHTML = cardHtml({
    key: CARD_KEY, icon: 'globe', title: 'Bandwidth', summary: esc(summaryOf(d)),
    danger: !!d.paused, cls: !d.paused && (pct >= 75 || capLevelHtml(d)) ? 'acct-card-warn' : '',
    body: bodyHtml(d)
  });
  startTicker();
}

/* ---------- the time left, kept true while the card is on screen ---------- */

let ticker = 0;
function liveWords() {
  const d = bw.data;
  if (!d) return;
  const now = Date.now();
  document.querySelectorAll('[data-bw-live="clears"]').forEach(el => { el.textContent = clearsWords(d.clearsAt, now); });
  document.querySelectorAll('[data-bw-live="left"]').forEach(el => { el.textContent = monthLeftWords(now); });
}
function startTicker() {
  clearInterval(ticker);
  ticker = 0;
  if (!document.querySelector('[data-bw-live]')) return;
  ticker = setInterval(() => {
    if (!document.querySelector('[data-bw-live]')) { clearInterval(ticker); ticker = 0; return; }
    liveWords();
  }, 30000);
}

/* ---------- reading ---------- */

/** Billing is the signed-in person's own account, so the server picks their own environment. A person with no
 *  environment of their own sees the team in view (the Team section's pick), the one the Environment section shows. */
function readUrl(withTeam) {
  const u = new URL(READ_URL);
  const team = withTeam && !D.cachedPing?.()?.environment ? String(D.pickedTeam?.() || '') : '';
  if (team) u.searchParams.set('tenant', team);
  return { url: u.toString(), team };
}

/** Read the card and paint it into #acctBandwidthCard. A route that is not there yet (404) leaves no card. */
export async function loadBandwidthCard(deps) {
  D = deps;
  bindOnce();
  const seq = ++bw.seq;
  bw.error = ''; bw.note = ''; bw.busy = ''; bw.capDraft = null;
  let d = null, err = null;
  const first = readUrl(true);
  try { d = await D.apiFetch(first.url); }
  catch (ex) {
    err = ex;
    // a remembered team this account can no longer open reads the default instead, as the Environment section does
    if (first.team && (ex?.status === 403 || ex?.status === 404)) {
      try { d = await D.apiFetch(readUrl(false).url); err = null; } catch (ex2) { err = ex2; }
    }
  }
  if (seq !== bw.seq) return;   // a newer read (the section painted again) owns the card
  if (err) {
    bw.data = null;
    bw.error = err?.status === 404 ? '' : errText(err, 'Bandwidth could not be read. Press Billing in the menu to read it again.');
  } else bw.data = d || null;
  paint();
}

/* ---------- changing ---------- */

/** A cap in cents from what the dollars box holds, or null when it is empty or outside $1 to $1,000. */
function capCentsOf(raw) {
  const s = String(raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return c >= CAP_MIN && c <= CAP_MAX ? c : null;
}
/** The cap the owner is asking for: what was typed, else what the box shows, else the saved one. */
function capFromDraft() {
  const raw = bw.capDraft !== null ? bw.capDraft : (document.getElementById('bwCap')?.value ?? capDollars(bw.data?.payg?.capCents));
  return capCentsOf(raw);
}

function refuse(words) {
  bw.error = words; bw.note = '';
  paint();
  document.getElementById('bwCap')?.focus();
}

function doneWords(kind, wasPaused, d) {
  const p = d.payg || {};
  const back = wasPaused && !d.paused ? ' Your sites are back up now.' : '';
  if (kind === 'off') {
    return d.paused
      ? `Pay as you go is off. Your sites are past this month's allowance, so they are paused until ${clearsWords(d.clearsAt)}.`
      : 'Pay as you go is off. At the allowance your sites pause until the first of next month.';
  }
  // a cap lowered under what this month has already charged pauses the sites at once (decision 9)
  const stopped = !wasPaused && d.paused ? ` This month's charges have reached it, so your sites are paused until ${clearsWords(d.clearsAt)}.` : '';
  if (kind === 'cap') return `The cap is now ${cents(p.capCents)} a month.${back}${stopped}`;
  return `Pay as you go is on, with a ${cents(p.capCents)} cap each month.${back}`;
}

async function send(payload, kind) {
  const wasPaused = !!bw.data?.paused;
  bw.busy = kind; bw.error = ''; bw.note = '';
  paint();
  try {
    const d = await D.apiFetch(PAYG_URL, { method: 'POST', body: JSON.stringify(payload) });
    // the answer is the read's shape; a part it leaves out keeps what was shown
    bw.data = { ...bw.data, ...(d || {}), history: Array.isArray(d?.history) ? d.history : bw.data?.history, bySite: Array.isArray(d?.bySite) ? d.bySite : bw.data?.bySite };
    bw.capDraft = null;
    bw.note = doneWords(kind, wasPaused, bw.data);
  } catch (ex) {
    bw.error = errText(ex, kind === 'on' ? 'Pay as you go could not be turned on. Press the switch again.'
      : kind === 'off' ? 'Pay as you go could not be turned off. Press the switch again.'
      : 'The cap could not be saved. Press Save the cap again.');
  } finally {
    bw.busy = '';
    paint();
  }
}

function togglePayg(btn) {
  const p = bw.data?.payg;
  if (btn.disabled || bw.busy || !p?.canChange) return;
  const turnOn = btn.dataset.on !== '1';
  if (!turnOn) return void send({ on: false }, 'off');
  const capCents = capFromDraft();
  if (capCents === null) return void refuse(capWords('press the switch again'));
  // it can charge money: the first press asks, the second turns it on
  if (!armed(btn, 'Turn it on?', { keep: 'Leave it off' })) return;
  send({ on: true, capCents }, 'on');
}

function saveCap(btn) {
  const p = bw.data?.payg;
  if (btn.disabled || bw.busy || !p?.on || !p.canChange) return;
  const capCents = capFromDraft();
  if (capCents === null) return void refuse(capWords('press Save the cap'));
  const cur = num(p.capCents);
  if (capCents === cur) return;
  // a higher cap lets more be charged: it asks first; a lower one saves at once
  if (capCents > cur && !armed(btn, `Raise the cap to ${cents(capCents)}?`, { keep: 'Keep the current cap' })) return;
  send({ on: true, capCents }, 'cap');
}

/** The panel's click dispatcher (account.js) hands this card's actions here. Answers true when it was one of them. */
export function bandwidthAction(btn, action) {
  if (action === 'bw-payg') { togglePayg(btn); return true; }
  if (action === 'bw-cap') { saveCap(btn); return true; }
  return false;
}

let bound = false;
function bindOnce() {
  if (bound) return;
  bound = true;
  // the cap box: what is typed is kept for the next paint, and Save the cap arms only on a real change
  document.addEventListener('input', (e) => {
    if (e.target?.id !== 'bwCap') return;
    bw.capDraft = e.target.value;
    const save = document.querySelector('[data-acct-action="bw-cap"]');
    if (save && !bw.busy) save.disabled = !capDirty();
    if (bw.error) { bw.error = ''; const el = document.getElementById('bwError'); if (el) { el.textContent = ''; el.hidden = true; } }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target?.id !== 'bwCap') return;
    e.preventDefault();
    const save = document.querySelector('[data-acct-action="bw-cap"]');
    if (save && !save.disabled) save.click();
  });
}
