/* THE IMPORT CARD (2026-11-10, Cameron: "a whole organization could move on a click. be told how long it is going to
 * take ... first size the repo. get an estimate. a cost estimate ... the ability to see what is about to happen, then you
 * press import ... a recursively updated timeline ... something that doesnt lie"). A folder of this environment's files, or
 * a repository on a connected GitHub, sized first (what is about to happen: the entries, the readable ones, the skipped
 * and why, the pages, a first estimate of time and cost said as one), then one press; the job runs in the platform's
 * sweep through the document worker under a profile, and its timeline is remeasured from the files actually read.
 * Painted into #evImport after Documents (environment.js) and handed that tab's helpers (setImportContext). */
import { PRAG_API_BASE } from '../runtime/config.js';
import { ico, iconBtn, leadBtn, cardHtml, busy } from './cards.js';
import { explainLink } from '../components/explainer.js';
import { countWord } from '../ui/words.js';

const ENV_URL = `${PRAG_API_BASE}/environment`;
let D = null;   // apiFetch, escapeHtml, fmtDate, friendlyError, showError
let X = null;   // url, body, myRole, lane, view, profiles() (the Documents card's), connections() (the Connected accounts card's), openTable(table)
let st = fresh();
let poll = null;
function fresh() { return { data: null, note: '', kind: 'files', form: { prefix: '', connectionId: '', repo: '', branch: 'main', path: '' }, profile: '', size: null, sizeNote: '', busy: '', status: '' }; }

export function setImportContext(deps, ctx) { D = deps; X = ctx; }
export function resetImport() { st = fresh(); stopPoll(); }
const errText = (ex, fallback) => (ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback)));
const manage = () => ['owner', 'admin', 'agent'].includes(X.myRole());
const member = () => ['owner', 'admin', 'agent', 'developer', 'member'].includes(X.myRole());

export async function loadImport() {
  try {
    st.data = await D.apiFetch(X.url(`${ENV_URL}/imports`, {}, X.lane()));
    st.note = '';
    if (!st.form.connectionId) st.form.connectionId = ((st.data.github || []).find(g => g.status === 'ACTIVE') || {}).id || '';
  } catch (ex) {
    st.data = null;
    st.note = ex?.status === 404 ? 'Imports are not on this lane yet.' : errText(ex, 'Could not read the imports.');
  }
  paintImport();
  // a running or paused job is read again every ten seconds while the card is on the page: the timeline is live
  const live = (st.data?.jobs || []).some(j => j.status === 'RUNNING' || j.status === 'PAUSED');
  if (live && !poll) poll = setInterval(() => { if (!document.getElementById('evImport')) return stopPoll(); void loadImport(); }, 10000);
  if (!live) stopPoll();
}
function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }
export function paintImport() { const h = document.getElementById('evImport'); if (h) h.innerHTML = importHtml(); }

const STATUS_WORDS = { RUNNING: 'running', PAUSED: 'paused', DONE: 'finished', CANCELLED: 'cancelled', FAILED: 'stopped' };
function minutesWords(sec) { sec = Number(sec || 0); if (sec < 90) return `${Math.max(1, Math.round(sec))} seconds`; if (sec < 5400) return `${Math.round(sec / 60)} minutes`; if (sec < 172800) return `${Math.round(sec / 360) / 10} hours`; return `${Math.round(sec / 8640) / 10} days`; }
function centsWords(c) { c = Number(c || 0); return c >= 100 ? `$${(c / 100).toFixed(2)}` : `${c} cents`; }
function sizeWords(n) { n = Number(n || 0); return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${Math.round(n / 1024 / 1024 * 10) / 10} MB` : `${Math.round(n / 1024 ** 3 * 100) / 100} GB`; }

export function importHtml() {
  const e = D.escapeHtml, d = st.data;
  const explain = explainLink('imports', 'How an import works');
  if (!d) {
    return cardHtml({ key: 'import', icon: 'download', title: 'Import', summary: st.note ? 'not on this lane' : 'loading', explain,
      body: st.note ? `<p class="acct-card-note">${e(st.note)}</p>` : '<p class="acct-loading">Loading the imports…</p>' });
  }
  const jobs = d.jobs || [], can = manage(), may = member();
  const live = jobs.filter(j => j.status === 'RUNNING' || j.status === 'PAUSED');
  const summary = live.length ? `${countWord(live.length, 'import', 'imports')} running` : jobs.length ? `last ${e(STATUS_WORDS[jobs[0].status] || jobs[0].status.toLowerCase())} ${e(D.fmtDate(jobs[0].finishedAt || jobs[0].updatedAt))}` : 'nothing imported yet';
  const profiles = X.profiles() || [];
  return cardHtml({
    key: 'import', icon: 'download', title: 'Import', summary, explain,
    body: `
      ${jobs.length ? `<div class="ev-agents">${jobs.slice(0, 8).map(j => jobHtml(j, can, e)).join('')}</div>` : ''}
      ${may ? sourceHtml(d, profiles, can, e) : '<p class="acct-card-note">Seat members start imports; as a viewer you see them run.</p>'}
      <p class="acct-error" id="evImportError" hidden></p>
      ${st.status ? `<p class="acct-card-note" id="evImportStatus">${e(st.status)}</p>` : ''}`
  });
}

function timelineWords(j, e) {
  const p = j.progress || {}, s = j.size || {}, eta = j.eta || {};
  const left = Math.max(0, (s.readable || 0) - (p.done || 0) - (p.failed || 0) - (p.skipped || 0));
  if (j.status === 'DONE') return `Finished ${e(D.fmtDate(j.finishedAt))}.`;
  if (j.status === 'CANCELLED') return `Cancelled ${e(D.fmtDate(j.finishedAt))} with ${left} left.`;
  if (j.status === 'FAILED') return `Stopped ${e(D.fmtDate(j.finishedAt))} with ${left} left: ${e(j.lastError || 'no reason given')}`;
  if (j.status === 'PAUSED') return `Paused with ${left} left.`;
  const basis = eta.basis === 'measured' ? `measured from ${countWord(j.rate?.measured || 0, 'file', 'files')} read, ${e(String(j.rate?.filesPerMinute || 0))} a minute` : 'a first estimate from the file sizes, until a few files are read';
  return `About ${e(minutesWords(eta.seconds))} left (${e(minutesWords(eta.low))} to ${e(minutesWords(eta.high))}), ${basis}; recounted ${e(D.fmtDate(eta.updatedAt))}.`;
}
function jobHtml(j, can, e) {
  const p = j.progress || {}, s = j.size || {};
  const pct = s.readable ? Math.min(100, Math.round(((p.done || 0) + (p.failed || 0) + (p.skipped || 0)) / s.readable * 100)) : 0;
  const where = j.source?.kind === 'github' ? `${j.source.repo}@${j.source.branch}${j.source.path ? `/${j.source.path}` : ''}` : `Files${j.source?.prefix ? `/${j.source.prefix}` : ''}`;
  return `
    <div class="ev-agent ev-import-job" data-job="${e(j.id)}">
      <div class="ev-agent-head">
        <span class="ev-agent-name">${ico('download', 14)} ${e(where)}</span>
        <span class="acct-tag ${j.status === 'RUNNING' ? 'is-pending' : j.status === 'DONE' ? 'is-verified' : j.status === 'FAILED' ? 'is-bad' : ''}">${e(STATUS_WORDS[j.status] || j.status.toLowerCase())}</span>
        <span class="adm-muted">→ ${e(j.table)} · ${e(j.profileName || j.profile)} · ${e(j.lane)} · started ${e(D.fmtDate(j.startedAt))}</span>
      </div>
      <div class="ev-import-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <p class="acct-card-note ev-agent-run">${e(String(p.done || 0))} of ${e(String(s.readable || 0))} files read${p.failed ? `, ${p.failed} failed` : ''}${p.skipped ? `, ${p.skipped} skipped` : ''} · ${countWord(p.records || 0, 'record', 'records')}${p.review ? `, ${p.review} for a person` : ''}${p.priceCents ? ` · ${e(centsWords(p.priceCents))} of credit` : p.costCents ? ` · ${e(centsWords(p.costCents))} on your account` : ''}</p>
      <p class="acct-card-note ev-agent-run">${timelineWords(j, e)}</p>
      <div class="act-row ev-agent-actions">
        ${iconBtn('import-open', 'external', 'Open the table in the Data card', `data-table="${e(j.table || '')}"`)}
        ${can && j.status === 'RUNNING' ? leadBtn('import-pause', 'pause', 'Pause', `data-id="${e(j.id)}"`) : ''}
        ${can && j.status === 'PAUSED' ? leadBtn('import-resume', 'play', 'Resume', `data-id="${e(j.id)}"`) : ''}
        ${can && (j.status === 'RUNNING' || j.status === 'PAUSED') ? leadBtn('import-cancel', 'stop', 'Cancel', `data-id="${e(j.id)}"`, 'is-risky') : ''}
      </div>
    </div>`;
}
function sourceHtml(d, profiles, can, e) {
  const github = d.github || [];
  const f = st.form;
  const size = st.size;
  return `
    <div class="ev-agent-form">
      <div class="ev-scopes" role="group" aria-label="Where to read from">
        <span class="ev-conn-field-label">Read from</span>
        <label class="acct-chip" data-tip="A folder of this environment's files, uploaded on the Files card"><input type="radio" name="evImpKind" value="files" ${st.kind === 'files' ? 'checked' : ''} />${ico('folder', 14)}<span>Files</span></label>
        <label class="acct-chip" data-tip="A repository on a GitHub account connected under Connected accounts"><input type="radio" name="evImpKind" value="github" ${st.kind === 'github' ? 'checked' : ''} />${ico('code', 14)}<span>GitHub</span></label>
      </div>
      <div class="ev-conn-fields">
        ${st.kind === 'files' ? `<label class="ev-conn-field"><span class="ev-conn-field-label">Folder (a prefix of the file names; blank for every file)</span><input class="acct-input" type="text" id="evImpPrefix" maxlength="200" value="${e(f.prefix)}" placeholder="scans/2026/" autocomplete="off" spellcheck="false" /></label>`
        : `<label class="ev-conn-field"><span class="ev-conn-field-label">GitHub account</span><select class="acct-input acct-select" id="evImpConn">${github.length ? github.map(g => `<option value="${e(g.id)}" ${g.id === f.connectionId ? 'selected' : ''}>${e(g.label)}${g.login ? ` (${e(g.login)})` : ''}${g.status !== 'ACTIVE' ? ' · not active' : ''}</option>`).join('') : '<option value="">Connect a GitHub account first</option>'}</select></label>
          <label class="ev-conn-field"><span class="ev-conn-field-label">Repository</span><input class="acct-input" type="text" id="evImpRepo" maxlength="200" value="${e(f.repo)}" placeholder="owner/name" autocomplete="off" spellcheck="false" /></label>
          <label class="ev-conn-field"><span class="ev-conn-field-label">Branch</span><input class="acct-input" type="text" id="evImpBranch" maxlength="100" value="${e(f.branch)}" placeholder="main" autocomplete="off" spellcheck="false" /></label>
          <label class="ev-conn-field"><span class="ev-conn-field-label">Folder in the repository (blank for all)</span><input class="acct-input" type="text" id="evImpPath" maxlength="300" value="${e(f.path)}" placeholder="batches/2026" autocomplete="off" spellcheck="false" /></label>`}
        <label class="ev-conn-field"><span class="ev-conn-field-label">Read each file with profile</span>
          <select class="acct-input acct-select" id="evImpProfile">${profiles.length ? profiles.map(p => `<option value="${e(p.id)}" ${p.id === (st.profile || profiles[0].id) ? 'selected' : ''}>${e(p.name)} → ${e(p.table)}</option>`).join('') : '<option value="">Make a document profile first</option>'}</select></label>
      </div>
      <div class="act-row ev-key-row">
        ${leadBtn('import-size', 'search', st.busy === 'size' ? 'Sizing…' : 'See what will happen', `${st.busy ? 'disabled' : ''}`)}
        ${size && can ? leadBtn('import-start', 'play', st.busy === 'start' ? 'Starting…' : `Import ${countWord(size.readable, 'file', 'files')}`, `${st.busy || !size.readable ? 'disabled' : ''}`, 'btn-primary') : ''}
      </div>
      ${!profiles.length ? '<p class="acct-card-note">An import reads every file with a document profile: make one on the Documents card above, then come back here.</p>' : ''}
      ${st.sizeNote ? `<p class="acct-card-note">${e(st.sizeNote)}</p>` : ''}
      ${size ? sizeHtml(size, e) : ''}
    </div>`;
}
function sizeHtml(s, e) {
  const est = s.estimate || {};
  const types = Object.entries(s.byType || {}).map(([m, n]) => `${n} ${m.replace('image/', '').replace('application/', '')}`).join(', ');
  return `
    <div class="ev-import-size">
      <p class="acct-card-note"><b>What will happen in ${e(s.where)}:</b> ${countWord(s.entries, 'entry', 'entries')}${s.truncated ? ' (the first 100,000)' : ''}, ${e(sizeWords(s.bytes))}. <b>${countWord(s.readable, 'file', 'files')}</b> will be read (${e(types || 'none')}, about ${countWord(s.pages, 'page', 'pages')})${s.skipped?.type ? `; ${s.skipped.type} left out, not an image or a PDF` : ''}${s.skipped?.tooLarge ? `; ${s.skipped.tooLarge} left out, over 20 MB` : ''}.</p>
      ${s.readable ? `<p class="acct-card-note"><b>About ${e(minutesWords(est.seconds?.mid))}</b> (${e(minutesWords(est.seconds?.low))} to ${e(minutesWords(est.seconds?.high))}) and <b>${est.own ? 'your provider\'s bill' : `about ${e(centsWords(est.cents?.mid))} of credit`}</b>${est.own ? '' : ` (${e(centsWords(est.cents?.low))} to ${e(centsWords(est.cents?.high))})`}. ${e(est.words || '')}</p>` : '<p class="acct-card-note">Nothing here is a file the worker reads. Upload images or PDFs, or point at another folder.</p>'}
    </div>`;
}

function readSource() {
  if (st.kind === 'files') { st.form.prefix = (document.getElementById('evImpPrefix')?.value || '').trim(); return { kind: 'files', prefix: st.form.prefix }; }
  st.form.connectionId = document.getElementById('evImpConn')?.value || '';
  st.form.repo = (document.getElementById('evImpRepo')?.value || '').trim();
  st.form.branch = (document.getElementById('evImpBranch')?.value || '').trim() || 'main';
  st.form.path = (document.getElementById('evImpPath')?.value || '').trim();
  return { kind: 'github', connectionId: st.form.connectionId, repo: st.form.repo, branch: st.form.branch, path: st.form.path };
}
async function sizeIt(btn) {
  D.showError('evImportError', '');
  const source = readSource();
  st.profile = document.getElementById('evImpProfile')?.value || st.profile;
  if (source.kind === 'github' && !source.connectionId) { D.showError('evImportError', 'Connect a GitHub account under Connected accounts first, then pick it here.'); return; }
  if (source.kind === 'github' && !source.repo) { D.showError('evImportError', 'Name the repository as owner/name.'); return; }
  if (!st.profile) { D.showError('evImportError', 'Make a document profile on the Documents card first.'); return; }
  st.busy = 'size'; st.size = null; st.sizeNote = ''; paintImport();
  try {
    const r = await D.apiFetch(X.url(`${ENV_URL}/imports/size`, {}, X.lane()), { method: 'POST', body: X.body({ source, profile: st.profile }, X.lane()) });
    st.size = r.size || null;
  } catch (ex) { D.showError('evImportError', errText(ex, 'The source could not be sized.')); }
  st.busy = ''; paintImport();
}
async function startIt(btn) {
  D.showError('evImportError', '');
  const source = readSource();
  st.profile = document.getElementById('evImpProfile')?.value || st.profile;
  st.busy = 'start'; paintImport();
  try {
    const r = await D.apiFetch(X.url(`${ENV_URL}/imports`, {}, X.lane()), { method: 'POST', body: X.body({ source, profile: st.profile }, X.lane()) });
    st.status = r.note || 'Started.'; st.size = null;
  } catch (ex) { D.showError('evImportError', errText(ex, 'The import did not start.')); }
  st.busy = '';
  await loadImport();
  if (st.status) { const s = document.getElementById('evImportStatus'); if (!s) paintImport(); }
}
async function controlIt(id, action, btn) {
  D.showError('evImportError', '');
  if (btn.disabled) return;
  const done = busy(btn, action === 'cancel' ? 'Cancelling…' : action === 'pause' ? 'Pausing…' : 'Resuming…');
  try { await D.apiFetch(X.url(`${ENV_URL}/imports/control`, {}, X.lane()), { method: 'POST', body: X.body({ id, action }, X.lane()) }); }
  catch (ex) { D.showError('evImportError', errText(ex, 'The import did not take that.')); }
  finally { done(); }
  await loadImport();
}

/** The card's presses; true when one was this card's. */
export function importAction(a, btn) {
  if (!a || !a.startsWith('import-')) return false;
  if (!st.data) return true;
  const id = btn?.dataset?.id || '';
  if (a === 'import-size') { void sizeIt(btn); return true; }
  if (a === 'import-start') { void startIt(btn); return true; }
  if (a === 'import-pause') { void controlIt(id, 'pause', btn); return true; }
  if (a === 'import-resume') { void controlIt(id, 'resume', btn); return true; }
  if (a === 'import-cancel') { void controlIt(id, 'cancel', btn); return true; }
  if (a === 'import-open') { if (X.openTable) X.openTable(btn.dataset.table || ''); return true; }
  return false;
}
/** The source kind picked, the fields kept between paints. */
export function importChange(e) {
  const t = e.target;
  if (!t || typeof t.matches !== 'function') return false;
  if (t.matches('input[name="evImpKind"]')) { readSource(); st.kind = t.value === 'github' ? 'github' : 'files'; st.size = null; paintImport(); return true; }
  if (t.matches('#evImpProfile')) { st.profile = t.value; return true; }
  return false;
}
