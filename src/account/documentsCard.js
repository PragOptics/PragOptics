/* THE DOCUMENTS CARD (2026-11-10, Cameron's nine capabilities: OCR and full-text search, metadata extraction,
 * classification, validation, indexing, separation, handwriting and forms, integration, workflow). A scanned page, a
 * photo or a PDF among the environment's files is read by the environment's AI under a profile the team wrote (the kinds
 * expected, the fields to pull out, whether a batch is cut into its documents), validated, and indexed as records of a
 * table with the text and a trace to the file; a record with an issue is marked for a person. Search reads the table by
 * words. Painted into #evDocuments after Files (environment.js) and handed that tab's helpers (setDocumentsContext). */
import { PRAG_API_BASE } from '../runtime/config.js';
import { ico, iconBtn, leadBtn, cardHtml, busy } from './cards.js';
import { explainLink } from '../components/explainer.js';
import { countWord } from '../ui/words.js';

const ENV_URL = `${PRAG_API_BASE}/environment`;
let D = null;   // apiFetch, escapeHtml, fmtDate, friendlyError, showError
let X = null;   // url(path, extra, lane), body(obj, lane), myRole(), lane(), files() (the Files card's listing), tables()
let st = fresh();
function fresh() { return { data: null, note: '', edit: null, arm: '', pick: new Set(), profile: '', busy: false, result: null, q: '', hits: null, hitsNote: '', hitsTable: '' }; }

export function setDocumentsContext(deps, ctx) { D = deps; X = ctx; }
export function resetDocuments() { st = fresh(); }
/** The saved profiles, for the Import card's picker. */
export function documentProfiles() { return (st.data && st.data.profiles) || []; }
const errText = (ex, fallback) => (ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback)));
const manage = () => ['owner', 'admin', 'agent'].includes(X.myRole());
const member = () => ['owner', 'admin', 'agent', 'developer', 'member'].includes(X.myRole());
const READABLE = /\.(png|jpe?g|webp|gif|pdf)$/i;

export async function loadDocuments() {
  try {
    st.data = await D.apiFetch(X.url(`${ENV_URL}/documents`, {}, X.lane()));
    st.note = '';
    if (!st.profile || !(st.data.profiles || []).some(p => p.id === st.profile)) st.profile = ((st.data.profiles || [])[0] || {}).id || '';
  } catch (ex) {
    st.data = null;
    st.note = ex?.status === 404 ? 'Documents are not on this lane yet.' : errText(ex, 'Could not read the document profiles.');
  }
  paintDocuments();
}
export function paintDocuments() { const h = document.getElementById('evDocuments'); if (h) h.innerHTML = documentsHtml(); }

export function documentsHtml() {
  const e = D.escapeHtml, d = st.data;
  const explain = explainLink('documents', 'How documents work');
  if (!d) {
    return cardHtml({ key: 'documents', icon: 'file', title: 'Documents', summary: st.note ? 'not on this lane' : 'loading', explain,
      body: st.note ? `<p class="acct-card-note">${e(st.note)}</p>` : '<p class="acct-loading">Loading the document profiles…</p>' });
  }
  const profiles = d.profiles || [], can = manage(), may = member();
  const files = (X.files() || []).filter(f => READABLE.test(String(f.name || '')));
  const summary = !profiles.length ? 'no profile yet' : `${countWord(profiles.length, 'profile', 'profiles')} · ${countWord(files.length, 'readable file', 'readable files')}`;
  const note = !d.enabled ? '<p class="acct-card-note">AI is off for this environment. Turn it on from the AI page and the worker reads.</p>' : '';
  const list = !profiles.length ? `<p class="acct-empty">${can ? 'No profile yet. A profile says what the worker should expect in a file and which fields to pull out.' : 'No profile yet. The owner or an admin makes one.'}</p>`
    : `<div class="ev-agents">${profiles.map(p => {
      const editing = st.edit && st.edit.id === p.id, armed = st.arm === p.id;
      return `
      <div class="ev-agent" data-profile="${e(p.id)}">
        <div class="ev-agent-head">
          <span class="ev-agent-name">${ico('file', 14)} ${e(p.name)}</span>
          <span class="acct-tag">${e(p.table)}</span>
          <span class="adm-muted">${p.kinds && p.kinds.length ? e(p.kinds.join(', ')) : 'any kind'} · ${e(countWord((p.fields || []).length, 'field', 'fields'))}${p.separate ? ' · cuts a batch into its documents' : ''}${p.roles && p.roles.length ? ` · mails ${e(p.roles.join(', '))}` : ''} · ${e(p.lane || 'mid')}</span>
        </div>
        ${can ? `<div class="act-row ev-agent-actions">
          ${iconBtn('docs-edit', 'edit', 'Edit this profile', `data-id="${e(p.id)}" ${editing ? 'disabled' : ''}`)}
          ${armed ? `<span class="act-row"><button class="btn btn-sm btn-ico is-armed" type="button" data-env-action="docs-remove" data-id="${e(p.id)}" aria-label="Remove? Its records stay in the Data card. Press again to confirm.">${ico('trash')}<span>Remove?</span></button>${iconBtn('docs-arm-cancel', 'x', 'Keep it', '', 'btn-arm-cancel')}</span>` : iconBtn('docs-remove', 'trash', 'Remove this profile', `data-id="${e(p.id)}"`, 'is-risky')}
        </div>` : ''}
      </div>`; }).join('')}</div>`;
  const form = st.edit && can ? formHtml(st.edit, d, e) : '';
  const reader = profiles.length && may && !st.edit ? readerHtml(profiles, files, d, e) : (!profiles.length || st.edit ? '' : '<p class="acct-card-note">Seat members read files; as a viewer you search the records.</p>');
  const searchBox = profiles.length ? searchHtml(profiles, e) : '';
  return cardHtml({
    key: 'documents', icon: 'file', title: 'Documents', summary, explain,
    body: `
      ${note}
      ${list}
      ${form}
      ${can && !st.edit ? `<div class="ev-key-row">${profiles.length < Number(d.caps?.profiles || 20) ? leadBtn('docs-new', 'plus', 'New profile', '', profiles.length ? '' : 'btn-primary') : ''}</div>` : ''}
      ${reader}
      ${searchBox}
      <p class="acct-error" id="evDocsError" hidden></p>`
  });
}

function formHtml(p, d, e) {
  const types = d.types || ['text', 'number', 'date', 'email', 'phone', 'boolean', 'list'];
  const roles = d.roles || ['owner', 'admin', 'member'];
  const fields = (p.fields && p.fields.length ? p.fields : [{ name: '', type: 'text', required: false, hint: '' }]);
  return `
    <div class="ev-agent-form">
      <div class="ev-conn-fields">
        <label class="ev-conn-field"><span class="ev-conn-field-label">Name</span><input class="acct-input" type="text" id="evDpName" maxlength="60" value="${e(p.name || '')}" placeholder="Invoices" autocomplete="off" /></label>
        <label class="ev-conn-field"><span class="ev-conn-field-label">Records go to table</span><input class="acct-input" type="text" id="evDpTable" maxlength="64" value="${e(p.table || d.table || 'documents')}" placeholder="documents" autocomplete="off" spellcheck="false" /></label>
        <label class="ev-conn-field"><span class="ev-conn-field-label">Kinds it expects (comma separated, or blank for any)</span><input class="acct-input" type="text" id="evDpKinds" maxlength="800" value="${e((p.kinds || []).join(', '))}" placeholder="invoice, credit note, delivery note" autocomplete="off" /></label>
        <label class="ev-conn-field"><span class="ev-conn-field-label">Model</span><select class="acct-input acct-select" id="evDpLane">${['fast', 'mid', 'pro', 'best'].map(l => `<option value="${l}" ${(p.lane || 'mid') === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="ev-docs-fields" id="evDpFields">
        <span class="ev-conn-field-label">Fields to pull out</span>
        ${fields.map((f, i) => fieldRowHtml(f, i, types, e)).join('')}
        <div class="ev-key-row">${iconBtn('docs-field-add', 'plus', 'Another field', '')}</div>
      </div>
      <div class="ev-scopes" role="group" aria-label="How the worker reads" style="margin-top:10px">
        <label class="acct-chip" data-tip="A file may hold several documents in a row; the worker finds the boundaries"><input type="checkbox" id="evDpSeparate" ${p.separate ? 'checked' : ''} />${ico('layers', 14)}<span>Cut a batch into its documents</span></label>
        <label class="acct-chip" data-tip="The full text of every page is kept on the record, so it can be searched"><input type="checkbox" id="evDpText" ${p.keepText === false ? '' : 'checked'} />${ico('search', 14)}<span>Keep the text</span></label>
      </div>
      <div class="ev-conn-fields" style="margin-top:10px">
        <label class="ev-conn-field"><span class="ev-conn-field-label">Flag a duplicate on this field (optional)</span><input class="acct-input" type="text" id="evDpDup" maxlength="40" value="${e((p.rules && p.rules.duplicateOn) || '')}" placeholder="invoice_number" autocomplete="off" spellcheck="false" /></label>
      </div>
      <div class="ev-scopes" role="group" aria-label="Who gets the summary by mail" style="margin-top:10px">
        <span class="ev-conn-field-label">Mail the summary to</span>
        ${roles.map(r => `<label class="acct-chip"><input type="checkbox" data-dp-role="${e(r)}" ${(p.roles || []).includes(r) ? 'checked' : ''} />${ico('mail', 14)}<span>${e(r)}</span></label>`).join('')}
      </div>
      <div class="act-row ev-key-row">
        ${leadBtn('docs-save', 'save', p.id ? 'Save' : 'Make the profile', '', 'btn-primary')}
        ${iconBtn('docs-cancel', 'x', 'Cancel', '')}
      </div>
    </div>`;
}
function fieldRowHtml(f, i, types, e) {
  return `
    <div class="ev-docs-field" data-field-row="${i}">
      <input class="acct-input" type="text" data-dp-fname maxlength="40" value="${e(f.name || '')}" placeholder="field_name" autocomplete="off" spellcheck="false" aria-label="Field name" />
      <select class="acct-input acct-select" data-dp-ftype aria-label="Field type">${types.map(t => `<option value="${e(t)}" ${(f.type || 'text') === t ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>
      <input class="acct-input" type="text" data-dp-fhint maxlength="200" value="${e(f.hint || '')}" placeholder="where it is on the page, or what it looks like" autocomplete="off" aria-label="Hint" />
      <label class="acct-chip" data-tip="A record without it is marked for a person"><input type="checkbox" data-dp-freq ${f.required ? 'checked' : ''} />${ico('check', 14)}<span>Required</span></label>
      ${iconBtn('docs-field-remove', 'x', 'Remove this field', `data-row="${i}"`)}
    </div>`;
}
function readForm() {
  const rows = [...document.querySelectorAll('#evDpFields [data-field-row]')];
  const fields = rows.map(r => ({ name: (r.querySelector('[data-dp-fname]')?.value || '').trim(), type: r.querySelector('[data-dp-ftype]')?.value || 'text', hint: (r.querySelector('[data-dp-fhint]')?.value || '').trim(), required: !!r.querySelector('[data-dp-freq]')?.checked })).filter(f => f.name);
  return {
    name: (document.getElementById('evDpName')?.value || '').trim(),
    table: (document.getElementById('evDpTable')?.value || '').trim() || 'documents',
    kinds: (document.getElementById('evDpKinds')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    lane: document.getElementById('evDpLane')?.value || 'mid',
    fields,
    separate: !!document.getElementById('evDpSeparate')?.checked,
    keepText: !!document.getElementById('evDpText')?.checked,
    rules: { duplicateOn: (document.getElementById('evDpDup')?.value || '').trim() },
    roles: [...document.querySelectorAll('[data-dp-role]')].filter(c => c.checked).map(c => c.dataset.dpRole)
  };
}

function readerHtml(profiles, files, d, e) {
  const picked = st.pick;
  const r = st.result;
  return `
    <div class="ev-docs-reader">
      <div class="ev-conn-fields">
        <label class="ev-conn-field"><span class="ev-conn-field-label">Read with profile</span>
          <select class="acct-input acct-select" id="evDocsProfile">${profiles.map(p => `<option value="${e(p.id)}" ${p.id === st.profile ? 'selected' : ''}>${e(p.name)} → ${e(p.table)}</option>`).join('')}</select></label>
      </div>
      ${files.length ? `
      <div class="ev-docs-files" role="group" aria-label="Files to read">
        <span class="ev-conn-field-label">Files on this lane the worker reads (PNG, JPEG, WebP, GIF, PDF; 20 MB at most, 20 files at a time)</span>
        ${files.slice(0, 200).map(f => `<label class="ev-docs-file"><input type="checkbox" data-docs-file="${e(f.name)}" ${picked.has(f.name) ? 'checked' : ''} ${Number(f.size || 0) > 20 * 1024 * 1024 ? 'disabled' : ''} /><span class="cell-ellip" title="${e(f.name)}">${e(f.name)}</span><span class="adm-muted">${e(sizeWords(f.size))}</span></label>`).join('')}
      </div>` : '<p class="acct-card-note">No readable file on this lane yet. Upload a scanned page, a photo or a PDF on the Files card above, then read it here.</p>'}
      <div class="act-row ev-key-row">${leadBtn('docs-read', 'sparkles', st.busy ? 'Reading…' : picked.size ? `Read ${countWord(picked.size, 'file', 'files')}` : 'Read the picked files', `${st.busy || !picked.size || !d.enabled ? 'disabled' : ''}`, 'btn-primary')}</div>
      ${r ? resultHtml(r, e) : ''}
    </div>`;
}
function sizeWords(n) { n = Number(n || 0); return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${Math.round(n / 1024 / 1024 * 10) / 10} MB`; }
function resultHtml(r, e) {
  const profile = (st.data.profiles || []).find(p => p.id === r.profile) || {};
  const line = `${countWord(r.indexed, 'record', 'records')} indexed into ${e(profile.table || 'the table')}${r.review ? `, ${r.review} for a person` : ''}${r.failed ? `, ${countWord(r.failed, 'file', 'files')} failed` : ''}${r.mailed ? `, mailed to ${r.mailed}` : r.mailNote ? `, ${e(r.mailNote)}` : ''}${r.priceCents ? ` (${e(String(r.priceCents))} cents of credit)` : r.costCents ? ` (your own account)` : ''}.`;
  return `
    <div class="ev-docs-result">
      <p class="acct-card-note"><b>${line}</b></p>
      <ul class="ev-docs-list">${(r.results || []).map(x => !x.ok ? `<li><b>${e(x.file)}</b>: ${e(x.error)}</li>`
        : x.documents.map(doc => `<li>${doc.needsReview ? '<span class="acct-tag is-pending">for a person</span>' : '<span class="acct-tag is-verified">ok</span>'} ${iconBtn('docs-open', 'external', 'Open the record in the Data card', `data-table="${e(profile.table || '')}" data-row="${e(doc.key)}"`)} <b>${e(doc.title)}</b> <span class="adm-muted">${e(doc.kind)} · pages ${e((doc.pages || []).join(', ') || '?')} · from ${e(x.file)}</span>${doc.issues && doc.issues.length ? `<div class="adm-muted">${e(doc.issues.map(i => `${i.field}: ${i.issue}`).join('; '))}</div>` : ''}</li>`).join('')).join('')}</ul>
    </div>`;
}
function searchHtml(profiles, e) {
  const tables = [...new Set(profiles.map(p => p.table))];
  const hits = st.hits;
  return `
    <div class="ev-docs-search">
      <div class="ev-key-row">
        <input class="acct-input" type="search" id="evDocsQ" maxlength="200" value="${e(st.q)}" placeholder="Search the records: a name, a number, a word on the page" autocomplete="off" />
        ${tables.length > 1 ? `<select class="acct-input acct-select" id="evDocsTable" aria-label="Table to search">${tables.map(t => `<option value="${e(t)}" ${t === (st.hitsTable || tables[0]) ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>` : `<input type="hidden" id="evDocsTable" value="${e(tables[0] || 'documents')}" />`}
        ${leadBtn('docs-search', 'search', 'Search', '')}
      </div>
      ${st.hitsNote ? `<p class="acct-card-note">${e(st.hitsNote)}</p>` : ''}
      ${hits ? (hits.items.length ? `<ul class="ev-docs-list">${hits.items.map(h => `<li>${h.needsReview ? '<span class="acct-tag is-pending">for a person</span> ' : ''}${iconBtn('docs-open', 'external', 'Open the record in the Data card', `data-table="${e(st.hitsTable)}" data-row="${e(h.key)}"`)} <b>${e(h.title || h.key)}</b> <span class="adm-muted">${e(h.kind)}${h.file ? ` · ${e(h.file)}` : ''}${h.at ? ` · ${e(D.fmtDate(h.at))}` : ''}</span>${h.snippet ? `<div class="adm-muted">${e(h.snippet)}</div>` : ''}</li>`).join('')}</ul>${hits.truncated ? `<p class="adm-muted">The first ${hits.scanned} records were searched; narrow the words to search more.</p>` : ''}` : '<p class="acct-empty">No record holds every one of those words.</p>') : ''}
    </div>`;
}

async function putProfiles(list, btn, word) {
  D.showError('evDocsError', '');
  if (btn && btn.disabled) return false;
  const done = btn ? busy(btn, word) : () => {};
  try {
    const r = await D.apiFetch(X.url(`${ENV_URL}/documents`, {}, X.lane()), { method: 'PUT', body: X.body({ profiles: list }, X.lane()) });
    st.data.profiles = r.profiles || list; st.edit = null; st.arm = '';
    if (!st.profile || !st.data.profiles.some(p => p.id === st.profile)) st.profile = (st.data.profiles[0] || {}).id || '';
    paintDocuments();
    return true;
  } catch (ex) {
    D.showError('evDocsError', errText(ex, 'The profiles could not be saved.'));
    return false;
  } finally { done(); }
}
async function readFiles(btn) {
  D.showError('evDocsError', '');
  if (btn.disabled || st.busy) return;
  const files = [...st.pick];
  if (!files.length) { D.showError('evDocsError', 'Tick at least one file.'); return; }
  st.busy = true; st.result = null; paintDocuments();
  try {
    const r = await D.apiFetch(X.url(`${ENV_URL}/documents/process`, {}, X.lane()), { method: 'POST', body: X.body({ profile: st.profile, files }, X.lane()) });
    st.result = { ...r, profile: st.profile }; st.pick = new Set();
  } catch (ex) {
    // a batch where every file failed answers 502 with the results: show them, and the reason
    if (ex?.data?.results) st.result = { ...ex.data, profile: st.profile };
    D.showError('evDocsError', errText(ex, 'The files could not be read.'));
  }
  st.busy = false;
  paintDocuments();
  if (X.reloadTables) { try { await X.reloadTables(); } catch { /* the Data card refreshes on its own next read */ } }
}
async function searchRecords(btn) {
  D.showError('evDocsError', '');
  st.q = (document.getElementById('evDocsQ')?.value || '').trim();
  st.hitsTable = document.getElementById('evDocsTable')?.value || 'documents';
  if (!st.q) { D.showError('evDocsError', 'Type a word or two to search for.'); return; }
  const done = busy(btn, 'Searching…');
  try {
    const r = await D.apiFetch(X.url(`${ENV_URL}/documents/search`, { q: st.q, table: st.hitsTable }, X.lane()));
    st.hits = { items: r.items || [], scanned: r.scanned || 0, truncated: !!r.truncated }; st.hitsNote = r.note || '';
  } catch (ex) {
    st.hits = null; st.hitsNote = '';
    D.showError('evDocsError', errText(ex, 'The search did not run.'));
  } finally { done(); }
  paintDocuments();
}

let armTimer = null;
/** The card's presses; true when one was this card's. */
export function documentsAction(a, btn) {
  if (!a || !a.startsWith('docs-')) return false;
  const d = st.data; if (!d) return true;
  const id = btn?.dataset?.id || '';
  if (a === 'docs-new') { st.edit = { id: '', name: '', table: d.table || 'documents', kinds: [], fields: [], separate: false, keepText: true, roles: ['owner'], lane: 'mid', rules: { duplicateOn: '' } }; st.arm = ''; paintDocuments(); document.getElementById('evDpName')?.focus(); return true; }
  if (a === 'docs-edit') { st.edit = JSON.parse(JSON.stringify((d.profiles || []).find(x => x.id === id) || {})); st.arm = ''; paintDocuments(); return true; }
  if (a === 'docs-cancel') { st.edit = null; paintDocuments(); return true; }
  if (a === 'docs-field-add') { const f = readForm(); st.edit = { ...st.edit, ...f, fields: [...f.fields, { name: '', type: 'text', required: false, hint: '' }] }; paintDocuments(); return true; }
  if (a === 'docs-field-remove') { const f = readForm(); const rows = [...document.querySelectorAll('#evDpFields [data-field-row]')].map(r => (r.querySelector('[data-dp-fname]')?.value || '').trim()); const gone = rows[Number(btn.dataset.row)]; st.edit = { ...st.edit, ...f, fields: f.fields.filter((x, i) => !(gone ? x.name === gone : false)) }; if (!gone) { const all = [...document.querySelectorAll('#evDpFields [data-field-row]')]; all[Number(btn.dataset.row)]?.remove(); } else paintDocuments(); return true; }
  if (a === 'docs-save') {
    const f = readForm();
    if (!f.name) { D.showError('evDocsError', 'Give the profile a name.'); return true; }
    const cur = d.profiles || [];
    const next = st.edit && st.edit.id ? cur.map(x => (x.id === st.edit.id ? { ...x, ...f } : x)) : [...cur, f];
    void putProfiles(next, btn, 'Saving…');
    return true;
  }
  if (a === 'docs-remove') {
    if (st.arm !== id) { st.arm = id; paintDocuments(); clearTimeout(armTimer); armTimer = setTimeout(() => { if (st.arm === id) { st.arm = ''; paintDocuments(); } }, 6000); return true; }
    clearTimeout(armTimer);
    void putProfiles((d.profiles || []).filter(x => x.id !== id), btn, 'Removing…');
    return true;
  }
  if (a === 'docs-arm-cancel') { clearTimeout(armTimer); st.arm = ''; paintDocuments(); return true; }
  if (a === 'docs-read') { void readFiles(btn); return true; }
  if (a === 'docs-search') { void searchRecords(btn); return true; }
  if (a === 'docs-open') {
    try { sessionStorage.setItem('pragoptics_open_table', JSON.stringify({ table: btn.dataset.table || '', row: btn.dataset.row || '' })); } catch { /* the card still opens */ }
    try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify({ section: 'environment', card: 'data', row: '' })); } catch { /* fine */ }
    if (X.openRow) X.openRow(btn.dataset.table || '', btn.dataset.row || ''); else location.hash = '#account?section=environment';
    return true;
  }
  return false;
}
/** A tick on a file, the profile picked: kept between paints. */
export function documentsChange(e) {
  const t = e.target;
  if (!t || typeof t.matches !== 'function') return false;
  if (t.matches('[data-docs-file]')) { const n = t.dataset.docsFile; if (t.checked) st.pick.add(n); else st.pick.delete(n); const b = document.querySelector('[data-env-action="docs-read"]'); if (b) { b.disabled = !st.pick.size || st.busy || !(st.data && st.data.enabled); const s = b.querySelector('span'); if (s) s.textContent = st.pick.size ? `Read ${countWord(st.pick.size, 'file', 'files')}` : 'Read the picked files'; } return true; }
  if (t.matches('#evDocsProfile')) { st.profile = t.value; return true; }
  return false;
}
