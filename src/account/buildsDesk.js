// src/account/buildsDesk.js
//
// THE BUILDS DESK (2026-09-21). Two sections of the account panel over the same registry:
//
//   My Builds (every customer): what this person published from the Studio, with its status: on
//   the board, awaiting review, or sent back with the operator's reason. GET v1/builds with the
//   session lists the person's own drafts and pending builds beside the public ones.
//
//   Builds (Internal, operators): the queue. Every build on the platform, pending first, with
//   Approve and Reject. GET v1/admin/builds; POST v1/admin/builds/{id}/approve | reject.
//
// A module that declares actions for the assistant is marked Assistant-ready, the same mark the
// public board and the Studio show.

import { PRAG_API_BASE } from '../runtime/config.js';

const BUILDS_URL = `${PRAG_API_BASE}/builds`;
const ADMIN_BUILDS_URL = `${PRAG_API_BASE}/admin/builds`;

let D = null;

const TYPE_LABEL = { module: 'Module', template: 'Template', plugin: 'Plugin', automation: 'Automation', tool: 'Tool' };
const STATUS_LABEL = { published: 'On the board', pending: 'Awaiting review', rejected: 'Sent back', draft: 'Not finished', superseded: 'Replaced by a newer build' };
// the chain (2026-09-21): a finished build is a ready draft its builder proves on their own environment; Submit sends it
// for review, Retract takes a pending one back, Remove drops a draft or a sent-back build; the operator reads What changed
function statusLabel(b) { const s = String(b.status || 'draft'); return s === 'draft' && b.ready ? 'Draft, ready to submit' : (STATUS_LABEL[s] || s); }

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
function assistantReady(b) { return !!(b?.manifest && Array.isArray(b.manifest.actions) && b.manifest.actions.length); }
function buildIdOf(b) { return /^[A-Za-z0-9]{6,40}$/.test(String(b?.buildId || '')) ? String(b.buildId) : ''; }

function rowHtml(b, { operator = false } = {}) {
  const e = D.escapeHtml;
  const status = String(b.status || 'draft');
  const settings = b.manifest && Array.isArray(b.manifest.settings) ? b.manifest.settings.length : 0;
  return `
    <tr data-build-row="${e(buildIdOf(b))}">
      <td class="cell-ellip"><b>${e(b.name)}</b> <span class="adm-muted">v${e(b.version || '')}</span>
        ${b.summary ? `<div class="adm-muted">${e(b.summary)}</div>` : ''}
        <div class="adm-muted">${e(TYPE_LABEL[b.type] || 'Build')}${settings ? ` · ${settings} setting${settings === 1 ? '' : 's'}` : ''} · ${e(fmtSize(b.size))}${assistantReady(b) ? ' · <span class="acct-tag">Assistant-ready</span>' : ''}</div></td>
      <td class="cell-ellip">${e(b.handle || '')}</td>
      <td class="cell-tight"><span class="acct-tag${status === 'published' ? ' is-ok' : status === 'pending' ? ' is-pending' : status === 'rejected' ? ' is-off' : ''}">${e(statusLabel(b))}</span>${b.revision ? ` <span class="adm-muted">rev ${e(String(b.revision))}</span>` : ''}
        ${status === 'rejected' && b.reason ? `<div class="adm-muted">${e(b.reason)}</div>` : ''}${Number(b.installs) ? `<div class="adm-muted">installed ${e(String(b.installs))} time${b.installs === 1 ? '' : 's'}</div>` : ''}</td>
      <td class="adm-muted cell-tight">${e(D.fmtDate(b.publishedAt || b.updatedAt || b.createdAt))}</td>
      <td class="cell-tight tm-actions">
        ${operator && status === 'pending' ? `<button class="btn btn-sm btn-ghost" type="button" data-build-action="diff" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">What changed</button>` : ''}
        ${operator && (status === 'pending' || status === 'rejected') ? `<button class="btn btn-sm" type="button" data-build-action="approve" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">Approve</button>` : ''}
        ${operator && status === 'pending' ? `<button class="btn btn-sm btn-ghost" type="button" data-build-action="reject" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">Reject</button>` : ''}
        ${!operator && ((status === 'draft' && b.ready) || status === 'rejected') ? `<button class="btn btn-sm" type="button" data-build-action="submit" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">Submit for review</button>` : ''}
        ${!operator && status === 'pending' ? `<button class="btn btn-sm btn-ghost" type="button" data-build-action="retract" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">Retract</button>` : ''}
        ${!operator && (status === 'draft' || status === 'rejected' || status === 'pending') ? `<button class="btn btn-sm btn-ghost" type="button" data-build-action="remove" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">Remove</button>` : ''}
        ${!operator && status === 'pending' ? `<button class="btn btn-sm btn-ghost" type="button" data-build-action="diff" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">What changed</button>` : ''}
      </td>
    </tr>
    <tr class="bd-diff-row" data-diff-for="${e(buildIdOf(b))}" hidden><td colspan="5" class="bd-diff-cell"></td></tr>`;
}

function tableHtml(rows, { operator = false } = {}) {
  return `
    <div class="adm-table-scroll">
      <table class="adm-table adm-table--wrap">
        <thead><tr><th>Build</th><th>Builder</th><th>Status</th><th>When</th><th></th></tr></thead>
        <tbody>${rows.map(b => rowHtml(b, { operator })).join('')}</tbody>
      </table>
    </div>`;
}

/** What changed in a build against the one it replaces, rendered under its row (the chain, 2026-09-21). */
function diffHtml(d) {
  const e = D.escapeHtml, m = d.manifest || {};
  const list = (arr) => arr.length ? arr.map(x => `<code>${e(String(x))}</code>`).join(', ') : '<span class="adm-muted">none</span>';
  const changed = (arr, key) => arr.length ? arr.map(c => `<code>${e(String(c[key]))}</code> <span class="adm-muted">(${e(Object.keys(c.to || {}).filter(k => JSON.stringify((c.from || {})[k]) !== JSON.stringify((c.to || {})[k])).join(', ') || 'changed')})</span>`).join(', ') : '<span class="adm-muted">none</span>';
  const files = (d.files || []).map(f => `<tr><td><code>${e(f.path)}</code></td><td>${e(f.change)}</td><td class="adm-num">${e(fmtSize(f.size[0] || 0))} \u2192 ${e(fmtSize(f.size[1] || 0))}</td></tr>`).join('');
  const text = Object.entries(d.text || {}).map(([path, td]) => td.tooLarge
    ? `<p class="adm-muted">${e(path)}: too large to show line by line (${e(String(td.linesA))} \u2192 ${e(String(td.linesB))} lines).</p>`
    : `<details><summary><code>${e(path)}</code>: +${e(String(td.added))} \u2212${e(String(td.removed))} lines</summary><pre class="bd-diff">${(td.hunks || []).map(h => h.lines.map(l => `<span class="${l[0] === '+' ? 'is-add' : l[0] === '-' ? 'is-del' : ''}">${e(l)}</span>`).join('\n')).join('\n\u2026\n')}</pre></details>`).join('');
  return `
    <div class="bd-diff-box">
      <p class="adm-note">${d.against ? `Revision ${e(String(d.revision))}, against v${e(d.against.version)} on the board since ${e(D.fmtDate(d.against.publishedAt))}${Number(d.against.installs) ? `, installed ${e(String(d.against.installs))} time${d.against.installs === 1 ? '' : 's'}` : ''}. Version ${e(m.version?.from || '')} \u2192 ${e(m.version?.to || '')}.` : 'The first build of this module: nothing to compare against.'}</p>
      ${m.name ? `<p class="adm-note">Name: ${e(m.name.from)} \u2192 ${e(m.name.to)}</p>` : ''}${m.summary ? `<p class="adm-note">Summary: ${e(m.summary.from)} \u2192 ${e(m.summary.to)}</p>` : ''}
      <p class="adm-note"><b>Settings</b> added ${list(m.settings?.added || [])}; removed ${list(m.settings?.removed || [])}; changed ${changed(m.settings?.changed || [], 'key')}.</p>
      <p class="adm-note"><b>Actions</b> added ${list(m.actions?.added || [])}; removed ${list(m.actions?.removed || [])}; changed ${changed(m.actions?.changed || [], 'name')}. <b>Doors</b> added ${list(m.doors?.added || [])}; removed ${list(m.doors?.removed || [])}.</p>
      <div class="adm-table-scroll"><table class="adm-table adm-table--wrap"><thead><tr><th>File</th><th>Change</th><th class="adm-num">Size</th></tr></thead><tbody>${files}</tbody></table></div>
      ${text}
    </div>`;
}
async function toggleDiff(btn, host) {
  const id = btn.dataset.id;
  const row = host.querySelector(`[data-diff-for="${CSS.escape(id)}"]`);
  if (!row) return;
  if (!row.hidden) { row.hidden = true; return; }
  const cell = row.querySelector('.bd-diff-cell');
  cell.innerHTML = '<p class="adm-note">Reading the changes\u2026</p>'; row.hidden = false;
  try { const d = await D.apiFetch(`${BUILDS_URL}/${encodeURIComponent(id)}/diff`); cell.innerHTML = diffHtml(d); }
  catch (ex) { cell.innerHTML = `<p class="adm-error">${D.escapeHtml(D.friendlyError(ex, 'Could not read the changes.'))}</p>`; }
}

/** Internal: every build, pending first, with Approve and Reject. */
export async function renderBuildsQueue(main, deps) {
  D = deps;
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Builds</h2><button class="btn btn-sm btn-ghost" type="button" id="bqRefresh">Refresh</button></header>
    <p class="adm-note">Everything published to the board from the Studio. A build waits here until it is approved; its builder can already use it in their own environment. Approve lists it for everyone; Reject keeps it off with a reason the builder sees.</p>
    <p class="adm-error" id="bqError" hidden></p>
    <div id="bqBody"><p class="adm-note">Loading…</p></div>
  `;
  const host = document.getElementById('bqBody');
  document.getElementById('bqRefresh')?.addEventListener('click', () => { host.innerHTML = '<p class="adm-note">Loading…</p>'; load(); });
  const load = async () => {
    try {
      const d = await D.apiFetch(ADMIN_BUILDS_URL);
      const rows = d.builds || [];
      if (!rows.length) { host.innerHTML = `<p class="adm-empty">Nothing published yet. Publish a web app as a module from the Studio's Export menu.</p>`; return; }
      const pending = rows.filter(b => b.status === 'pending').length;
      host.innerHTML = `${pending ? `<p class="adm-note"><b>${pending}</b> awaiting review.</p>` : ''}${tableHtml(rows, { operator: true })}`;
      host.querySelectorAll('[data-build-action]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.id, verb = btn.dataset.buildAction, name = btn.dataset.name;
        if (verb === 'diff') return void toggleDiff(btn, host);
        let reason = '';
        if (verb === 'reject') { reason = window.prompt(`Why is "${name}" sent back? The builder reads this.`, '') ?? null; if (reason === null) return; }
        btn.disabled = true;
        try {
          await D.apiFetch(`${ADMIN_BUILDS_URL}/${encodeURIComponent(id)}/${verb}`, { method: 'POST', body: JSON.stringify(verb === 'reject' ? { reason } : {}) });
          await load();
        } catch (ex) { btn.disabled = false; D.showError('bqError', D.friendlyError(ex, `Could not ${verb} it.`)); }
      }));
    } catch (ex) {
      host.innerHTML = '';
      if (ex?.status === 404) { host.innerHTML = `<p class="adm-empty">The builds routes are not on this lane yet.</p>`; return; }
      D.showError('bqError', D.friendlyError(ex, 'Could not load the builds.'));
    }
  };
  await load();
}

/** A customer's own builds, with their status. */
export async function renderMyBuilds(main, deps) {
  D = deps;
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">My Builds</h2><button class="btn btn-sm btn-ghost" type="button" id="mbRefresh">Refresh</button></header>
    <p class="acct-card-note">What you published to the board from the Studio (Export, Publish as a module). A finished build is a draft only you see: install it in your own environment to prove it, then submit it for review; you can retract it until an operator decides. A new version of the same module replaces the old one on the board once approved. It waits for review before others see it; you can install it in your own environment right away.</p>
    <p class="acct-error" id="mbError" hidden></p>
    <div id="mbBody"><p class="acct-loading">Loading…</p></div>
  `;
  const host = document.getElementById('mbBody');
  document.getElementById('mbRefresh')?.addEventListener('click', () => renderMyBuilds(main, D));
  try {
    const me = D.cachedPing()?.user;
    const d = await D.apiFetch(BUILDS_URL);
    const mine = (d.builds || []).filter(b => me && (String(b.publisherUserId || '') === String(me.userId || me.rowKey || me.id || '') || b.status !== 'published'));
    if (!mine.length) { host.innerHTML = `<p class="acct-empty">Nothing yet. In the Studio, open a web app and choose Export, Publish as a module.</p>`; return; }
    host.innerHTML = tableHtml(mine);
    // the builder's own chain: Submit for review, Retract, Remove, What changed
    host.querySelectorAll('[data-build-action]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.id, verb = btn.dataset.buildAction, name = btn.dataset.name;
      if (verb === 'diff') return void toggleDiff(btn, host);
      if (verb === 'remove' && !window.confirm(`Remove "${name}"? Its files go with it.`)) return;
      btn.disabled = true;
      try {
        if (verb === 'remove') await D.apiFetch(`${BUILDS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        else await D.apiFetch(`${BUILDS_URL}/${encodeURIComponent(id)}/${verb}`, { method: 'POST', body: '{}' });
        await renderMyBuilds(main, D);
      } catch (ex) { btn.disabled = false; D.showError('mbError', D.friendlyError(ex, `Could not ${verb} it.`)); }
    }));
  } catch (ex) {
    host.innerHTML = '';
    D.showError('mbError', D.friendlyError(ex, 'Could not load your builds.'));
  }
}
