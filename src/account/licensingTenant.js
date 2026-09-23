// src/account/licensingTenant.js
//
// The customer's Microsoft tenant on the Licensing tab (2026-09-23): connecting it (its administrator approves
// PragOptics once at Microsoft), each seat's person and mailbox in it, the team's domain added to it, and mail
// switched over. Every call is the platform's own route; the backend proves the approval with the tenant itself.
//
//   GET  v1/environment/licensing/tenant                         the tenant read live
//   POST v1/environment/licensing/tenant/connect                 -> { url }   Microsoft's approval page
//   POST v1/environment/licensing/tenant/seats/sync              every seat's person and mailbox
//   POST v1/environment/licensing/tenant/domains                 { host }   a proven domain added and verified
//   POST v1/environment/licensing/tenant/domains/{host}/verify   Microsoft checks again
//   GET  v1/environment/licensing/tenant/domains/{host}/mail     what switching mail writes
//   POST v1/environment/licensing/tenant/domains/{host}/mail     { confirm: true }   the switch
//   POST v1/environment/licensing/tenant/domains/{host}/mail/confirm   records added by hand, seen
//
// Microsoft sends the administrator back to /#account?section=licensing&tenant=<outcome>; bootstrap.js keeps the
// outcome in sessionStorage (pragoptics_tenant_return) and this card reads it once. licensing.js paints the card
// and routes its clicks here.

import { iconBtn, leadBtn, armed, btnLabel, ico } from './cards.js';
import { LIC_URL, lc, st, url, body, cardHtml, countWord } from './licensingShared.js';

const T_URL = `${LIC_URL}/tenant`;
const RETURN_KEY = 'pragoptics_tenant_return';
const OUTCOME_WORDS = {
  declined: 'The approval was not given at Microsoft.',
  mismatch: 'That approval was for a different tenant.',
  expired: 'That approval link had expired. Start again.',
  unproven: 'Microsoft did not let PragOptics into the tenant.',
  missing: 'That environment no longer exists.',
  failed: 'Something went wrong on the way back from Microsoft.'
};

function ts() { return lc.tn || (lc.tn = { status: null, loading: false, busy: '', plans: {}, note: '', noteBad: false, seats: null, returned: false }); }

/** Microsoft's answer, kept by bootstrap.js when the administrator came back; read once. */
function takeReturn() {
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null'); sessionStorage.removeItem(RETURN_KEY); } catch { r = null; }
  if (!r || !r.outcome) return;
  const t = ts();
  t.returned = true;
  if (r.outcome === 'connected') { t.note = 'Your tenant is connected.'; t.noteBad = false; }
  else { t.note = `${OUTCOME_WORDS[r.outcome] || 'The tenant was not connected.'}${r.why ? ` ${r.why}` : ''}`; t.noteBad = true; }
}

/** The live read, once per visit to the tab; a paint follows. */
async function ensureStatus() {
  const t = ts();
  if (t.status || t.loading) return;
  t.loading = true;
  try { const d = await st.D.apiFetch(url(T_URL)); t.status = d.tenant || null; }
  // a lane whose backend has no tenant routes yet answers 404: the card stays away
  catch (ex) { t.status = ex?.status === 404 && !ex?.data?.code ? { absent: true } : { error: ex?.data?.error || st.D.friendlyError(ex, 'The tenant could not be read.') }; }
  finally { t.loading = false; st.paint(); }
  if (t.returned) {
    t.returned = false;
    requestAnimationFrame(() => document.querySelector('[data-card="licensing:tenant"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

export function resetTenant() { lc.tn = null; takeReturn(); }

export function tenantHtml() {
  const v = lc.view, m = v?.microsoft || {};
  if (!v?.eligible || !v.account || !m.ready) return '';
  const e = st.D.escapeHtml, t = ts(), s = t.status;
  if (!s && !t.loading) queueMicrotask(ensureStatus);
  if (s?.absent) return '';
  const on = !!(s ? s.connected : m.connected);
  const named = m.tenantId || (m.domainPrefix ? `${m.domainPrefix}.onmicrosoft.com` : 'your tenant');
  const summary = t.loading && !s ? 'reading…' : on ? e(s?.orgName || m.orgName || 'connected') : s?.lost ? 'removed at Microsoft' : 'not connected';
  const note = t.note ? `<p class="acct-card-note ev-note ${t.noteBad ? 'is-bad' : ''}">${e(t.note)}</p>` : '';
  let inner;
  if (s?.error && !on) inner = `<p class="acct-card-note">${e(s.error)}</p>`;
  else if (!on) inner = notConnectedHtml(v, s, named, e);
  else inner = connectedHtml(v, s || {}, e);
  return cardHtml({
    key: 'tenant', icon: 'building', title: 'Your Microsoft tenant', summary,
    body: `<p class="acct-error" id="licTnError" hidden></p>${note}${inner}`
  });
}

function notConnectedHtml(v, s, named, e) {
  if (s && s.configured === false) return '<p class="acct-card-note">Tenant access is being set up on the platform. Nothing to do on your side; this card opens on its own.</p>';
  const t = ts();
  return `
    ${s?.lost ? '<p class="acct-card-note"><span class="acct-tag is-bad">removed at Microsoft</span> The tenant\'s administrator removed PragOptics. Connect it again and the seats pick up where they were.</p>' : ''}
    <p class="acct-card-note">Connect <strong>${e(named)}</strong> and PragOptics makes each seat's person and mailbox in it, adds your domain to it and switches your mail when you say so. An administrator of the tenant approves it once at Microsoft, and can remove it there at any time.</p>
    ${v.canManage
      ? `<div class="acct-actions-row">${leadBtn({ lic: 'tn-connect' }, t.busy === 'connect' ? 'refresh' : 'link', t.busy === 'connect' ? 'Opening Microsoft…' : 'Connect your tenant', t.busy === 'connect' ? 'disabled' : '', t.busy === 'connect' ? 'is-spinning' : 'btn-primary')}</div>`
      : '<p class="acct-card-note">The owner or an admin connects it.</p>'}`;
}

function connectedHtml(v, s, e) {
  const t = ts(), m = v.microsoft || {};
  const lic = (s.licenses || []).filter(l => l.enabled > 0);
  const facts = `
    <div class="lic-facts">
      <div class="lic-fact"><span class="lic-k">Organization</span><span class="lic-v">${e(s.orgName || m.orgName || '')}</span></div>
      <div class="lic-fact"><span class="lic-k">Tenant id</span><span class="lic-v ev-code">${e(s.tenantId || '')}</span></div>
      <div class="lic-fact"><span class="lic-k">Approved</span><span class="lic-v">${e(st.D.fmtDate(s.consentAt || m.consentAt))}</span></div>
      ${lic.length ? `<div class="lic-fact"><span class="lic-k">Licenses</span><span class="lic-v">${lic.map(l => `${e(l.name)}: ${e(String(l.consumed))} of ${e(String(l.enabled))} in use`).join('<br>')}</span></div>` : ''}
    </div>`;
  const readOnly = s.writes === false ? '<p class="acct-card-note"><span class="acct-tag is-pending">read only</span> This lane reads your tenant and shows what it would do. It makes nothing there.</p>' : '';
  const sync = t.seats ? seatsResultHtml(t.seats, e) : '';
  const seatsRow = v.canManage ? `
    <div class="tn-row">
      <span class="lic-k">Seats</span>
      <span class="acct-card-note tn-row-note">Each seat with its included mailbox gets its person here. A seat waits while Microsoft adds the license.</span>
      ${iconBtn({ lic: 'tn-sync' }, 'refresh', 'Bring every seat up to date in the tenant', t.busy === 'sync' ? 'disabled' : '', t.busy === 'sync' ? 'is-spinning' : '')}
    </div>${sync}` : '';
  return `${readOnly}${facts}${seatsRow}${domainsHtml(v, s, e)}`;
}

function seatsResultHtml(r, e) {
  if (!r.seats?.length) return '<p class="acct-card-note">No seat holds its included mailbox yet. Give one from Mailboxes below.</p>';
  const word = { ready: 'ready', waiting: 'waiting for Microsoft', failed: 'not made', planned: 'would be made' };
  return `<ul class="tn-list">${r.seats.map(x => `<li><span class="ev-code">${e(x.address || x.email)}</span> <span class="acct-tag ${x.state === 'ready' ? 'is-verified' : x.state === 'failed' ? 'is-bad' : 'is-pending'}">${e(word[x.state] || x.state)}</span>${x.why ? ` <span class="adm-muted">${e(x.why)}</span>` : ''}${x.planned ? ` <span class="adm-muted">${e(x.planned)}</span>` : ''}</li>`).join('')}</ul>`;
}

/* ---------- domains and mail ---------- */

function domainsHtml(v, s, e) {
  const hosts = v.mailDomains || [];
  const ours = new Map((s.domains || []).map(d => [d.host, d]));
  const theirs = new Map((s.tenantDomains || []).map(d => [d.host, d]));
  if (!hosts.length) return `<div class="tn-row"><span class="lic-k">Domains</span><span class="acct-card-note tn-row-note">Add your domain on <a href="#account?section=environment&card=domains" data-acct-section="environment">Environment</a> first; then it joins the tenant here.</span></div>`;
  const rows = hosts.map(h => domainRowHtml(h, ours.get(h), theirs.get(h), v.canManage, e)).join('');
  return `
    <div class="tn-domains">
      <span class="lic-k">Domains</span>
      <p class="acct-card-note">Switch your domain's mail before giving seats their mailboxes, so each address is on your domain from the start.</p>
      ${rows}
    </div>`;
}

function domainRowHtml(host, ours, theirs, canManage, e) {
  const t = ts(), busy = (k) => t.busy === `${k}:${host}`;
  const d = ours || (theirs ? { host, state: theirs.verified ? 'verified' : 'verifying' } : null);
  const plan = t.plans[host];
  let tag, acts = '', extra = '';
  if (!d) {
    tag = '<span class="acct-tag is-quiet">not in the tenant</span>';
    if (canManage) acts = leadBtn({ lic: 'tn-dom-add' }, busy('add') ? 'refresh' : 'plus', busy('add') ? 'Adding…' : 'Add to the tenant', `data-host="${e(host)}" ${t.busy ? 'disabled' : ''}`, busy('add') ? 'is-spinning' : 'btn-primary');
  } else if (d.state === 'planned') {
    tag = `<span class="acct-tag is-pending">would be added</span> <span class="adm-muted">${e(d.planned || '')}</span>`;
  } else if (d.state !== 'verified') {
    tag = '<span class="acct-tag is-pending">verifying</span>';
    if (canManage) acts = iconBtn({ lic: 'tn-dom-verify' }, 'checkCircle', 'Ask Microsoft to check the record again', `data-host="${e(host)}" ${t.busy ? 'disabled' : ''}`, busy('verify') ? 'is-spinning' : '');
    if (d.txt && !d.written) extra = `<p class="acct-card-note">Add this record where ${e(host)}'s DNS is managed, then check again:</p>${recordsHtml([d.txt], e)}`;
    else if (d.why) extra = `<p class="acct-card-note adm-muted">${e(d.why)} DNS changes can take up to an hour.</p>`;
  } else if (d.mailAt) {
    tag = `<span class="acct-tag is-verified">mail on Microsoft</span> <span class="adm-muted">since ${e(st.D.fmtDate(d.mailAt))}</span>`;
  } else {
    tag = '<span class="acct-tag is-verified">in the tenant</span>';
    if (canManage && !plan) acts = leadBtn({ lic: 'tn-mail-plan' }, busy('plan') ? 'refresh' : 'mail', busy('plan') ? 'Reading…' : 'Switch mail to Microsoft', `data-host="${e(host)}" ${t.busy ? 'disabled' : ''}`, busy('plan') ? 'is-spinning' : '');
    if (plan) extra = planHtml(host, plan, canManage, e);
  }
  return `
    <div class="tn-domain" data-row="${e(host)}">
      <div class="tn-domain-head"><strong class="tn-host">${e(host)}</strong>${tag}<span class="tn-acts">${acts}</span></div>
      ${extra}
    </div>`;
}

/** Records in a table; `copy` puts a copy button on each, for records the customer adds by hand. */
function recordsHtml(recs, e, copy = true) {
  const val = (r) => r.value || r.target || (r.exchange ? `${r.exchange} (priority ${r.preference ?? 0})` : '');
  return `
    <div class="adm-table-scroll">
      <table class="adm-table adm-table--wrap lic-table tn-records">
        <thead><tr><th>Type</th><th>Name</th><th>Value</th>${copy ? '<th></th>' : ''}</tr></thead>
        <tbody>${recs.map(r => `
          <tr>
            <td class="cell-tight" data-th="Type">${e(r.type)}</td>
            <td data-th="Name"><span class="ev-code">${e(r.name)}</span></td>
            <td data-th="Value"><span class="ev-code tn-val">${e(val(r))}</span></td>
            ${copy ? `<td class="cell-tight">${iconBtn({ lic: 'tn-copy' }, 'copy', 'Copy the value', `data-copy="${e(r.value || r.target || r.exchange || '')}"`)}</td>` : ''}
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function planHtml(host, p, canManage, e) {
  const t = ts(), busy = (k) => t.busy === `${k}:${host}`;
  const self = p.managed === 'self';
  const writes = p.writes || [];
  const notes = (p.notes || []).map(n => `<p class="acct-card-note tn-warn">${ico('alert')}<span>${e(n)}</span></p>`).join('');
  const shows = (p.shows || []).length ? `<p class="acct-card-note">${e(p.shows[0].why)}</p>${recordsHtml(p.shows, e)}<p class="acct-card-note adm-muted">It replaces <span class="ev-code">${e(p.shows[0].replaces)}</span>.</p>` : '';
  const head = self
    ? `<p class="acct-card-note">${e(host)}'s DNS is managed outside PragOptics. Add these records there, then confirm:</p>`
    : `<p class="acct-card-note">Switching writes ${e(countWord(writes.length, 'record', 'records'))} to ${e(host)}'s DNS. Mail for ${e(host)} goes to Microsoft from then on.</p>`;
  const act = !canManage ? '' : self
    ? leadBtn({ lic: 'tn-mail-confirm' }, busy('confirm') ? 'refresh' : 'checkCircle', busy('confirm') ? 'Checking…' : 'The records are in', `data-host="${e(host)}" ${t.busy ? 'disabled' : ''}`, busy('confirm') ? 'is-spinning' : 'btn-primary')
    : leadBtn({ lic: 'tn-mail-go' }, busy('go') ? 'refresh' : 'mail', busy('go') ? 'Switching…' : 'Switch mail', `data-host="${e(host)}" ${t.busy ? 'disabled' : ''}`, busy('go') ? 'is-spinning' : 'btn-primary is-risky');
  return `
    <div class="tn-plan">
      ${head}${writes.length ? recordsHtml(writes, e, self) : ''}${shows}${notes}
      <div class="acct-actions-row act-row">${act}${iconBtn({ lic: 'tn-mail-cancel' }, 'x', 'Not now', `data-host="${e(host)}"`)}</div>
    </div>`;
}

/* ---------- actions ---------- */

async function run(key, fn, errText) {
  const t = ts();
  if (t.busy) return;
  t.busy = key; st.D.showError('licTnError', ''); st.paint();
  try { await fn(); }
  catch (ex) {
    const code = ex?.data?.code;
    t.busy = ''; st.paint();
    st.D.showError('licTnError', code === 'TENANT_NOT_CONNECTED' ? 'Connect the tenant first.'
      : code === 'MS_NOT_CONFIGURED' ? 'Tenant access is being set up on the platform. Try again later.'
      : code === 'DOMAIN_NOT_VERIFIED' ? 'Verify the domain on Environment first.'
      : code === 'MX_NOT_SEEN' ? ex.data.error
      : (ex?.data?.error || st.D.friendlyError(ex, errText)));
    return;
  }
  t.busy = ''; st.paint();
}
const post = (path, payload = {}) => st.D.apiFetch(url(`${T_URL}${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(payload) });
const hostPath = (btn) => `/domains/${encodeURIComponent(btn.dataset.host)}`;
async function reread() { const t = ts(); const d = await st.D.apiFetch(url(T_URL)); t.status = d.tenant || t.status; }

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function tenantAction(a, btn) {
  const t = ts();
  if (a === 'tn-connect') {
    run('connect', async () => { const d = await post('/connect'); window.location.assign(d.url); }, 'Microsoft could not be opened.');
    return true;
  }
  if (a === 'tn-sync') {
    run('sync', async () => { t.seats = await post('/seats/sync'); await st.load(); }, 'The seats could not be brought up to date.');
    return true;
  }
  if (a === 'tn-dom-add') {
    run(`add:${btn.dataset.host}`, async () => { await post('/domains', { host: btn.dataset.host }); await reread(); }, 'The domain could not be added.');
    return true;
  }
  if (a === 'tn-dom-verify') {
    run(`verify:${btn.dataset.host}`, async () => { await post(`${hostPath(btn)}/verify`); await reread(); }, 'Microsoft could not check the domain.');
    return true;
  }
  if (a === 'tn-mail-plan') {
    run(`plan:${btn.dataset.host}`, async () => { const d = await st.D.apiFetch(url(`${T_URL}${hostPath(btn)}/mail`)); t.plans[btn.dataset.host] = d.mail; }, 'The mail records could not be read.');
    return true;
  }
  if (a === 'tn-mail-cancel') { delete t.plans[btn.dataset.host]; st.paint(); return true; }
  if (a === 'tn-mail-go') {
    // mail for the domain moves on this press: asked twice
    if (!armed(btn, 'Switch now?')) return true;
    const host = btn.dataset.host;
    run(`go:${host}`, async () => {
      const d = await post(`${hostPath(btn)}/mail`, { confirm: true });
      if (d.mail?.switched) { delete t.plans[host]; t.note = `Mail for ${host} now goes to Microsoft.`; t.noteBad = false; }
      else { t.plans[host] = d.mail; if (d.mail?.planned) { t.note = d.mail.planned; t.noteBad = false; } }
      await reread();
    }, 'Mail could not be switched.');
    return true;
  }
  if (a === 'tn-mail-confirm') {
    const host = btn.dataset.host;
    run(`confirm:${host}`, async () => { await post(`${hostPath(btn)}/mail/confirm`); delete t.plans[host]; t.note = `Mail for ${host} now goes to Microsoft.`; t.noteBad = false; await reread(); }, 'The records could not be checked.');
    return true;
  }
  if (a === 'tn-copy') {
    (async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copy || ''); btn.innerHTML = ico('check'); btn.setAttribute('data-tip', 'Copied'); btn.classList.add('is-done'); }
      catch { btnLabel(btn, 'Select and copy it'); }
    })();
    return true;
  }
  return false;
}
