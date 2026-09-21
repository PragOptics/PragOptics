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
const STATUS_LABEL = { published: 'On the board', pending: 'Awaiting review', rejected: 'Sent back', draft: 'Not finished' };

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
      <td class="cell-tight"><span class="acct-tag${status === 'published' ? ' is-ok' : status === 'pending' ? ' is-pending' : status === 'rejected' ? ' is-off' : ''}">${e(STATUS_LABEL[status] || status)}</span>
        ${status === 'rejected' && b.reason ? `<div class="adm-muted">${e(b.reason)}</div>` : ''}${Number(b.installs) ? `<div class="adm-muted">installed ${e(String(b.installs))} time${b.installs === 1 ? '' : 's'}</div>` : ''}</td>
      <td class="adm-muted cell-tight">${e(D.fmtDate(b.publishedAt || b.updatedAt || b.createdAt))}</td>
      ${operator ? `<td class="cell-tight tm-actions">
        ${status !== 'published' ? `<button class="btn btn-sm" type="button" data-build-action="approve" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">Approve</button>` : ''}
        ${status !== 'rejected' ? `<button class="btn btn-sm btn-ghost" type="button" data-build-action="reject" data-id="${e(buildIdOf(b))}" data-name="${e(b.name)}">Reject</button>` : ''}
      </td>` : ''}
    </tr>`;
}

function tableHtml(rows, { operator = false } = {}) {
  return `
    <div class="adm-table-scroll">
      <table class="adm-table adm-table--wrap">
        <thead><tr><th>Build</th><th>Builder</th><th>Status</th><th>When</th>${operator ? '<th></th>' : ''}</tr></thead>
        <tbody>${rows.map(b => rowHtml(b, { operator })).join('')}</tbody>
      </table>
    </div>`;
}

/** Internal: every build, pending first, with Approve and Reject. */
export async function renderBuildsQueue(main, deps) {
  D = deps;
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Builds</h2></header>
    <p class="adm-note">Everything published to the board from the Studio. A build waits here until it is approved; its builder can already use it in their own environment. Approve lists it for everyone; Reject keeps it off with a reason the builder sees.</p>
    <p class="adm-error" id="bqError" hidden></p>
    <div id="bqBody"><p class="adm-note">Loading…</p></div>
  `;
  const host = document.getElementById('bqBody');
  const load = async () => {
    try {
      const d = await D.apiFetch(ADMIN_BUILDS_URL);
      const rows = d.builds || [];
      if (!rows.length) { host.innerHTML = `<p class="adm-empty">Nothing published yet. Publish a web app as a module from the Studio's Export menu.</p>`; return; }
      const pending = rows.filter(b => b.status === 'pending').length;
      host.innerHTML = `${pending ? `<p class="adm-note"><b>${pending}</b> awaiting review.</p>` : ''}${tableHtml(rows, { operator: true })}`;
      host.querySelectorAll('[data-build-action]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.id, verb = btn.dataset.buildAction, name = btn.dataset.name;
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
    <header class="acct-sec-head"><h2 class="acct-sec-title">My Builds</h2></header>
    <p class="acct-card-note">What you published to the board from the Studio (Export, Publish as a module). A new build waits for review before others see it; you can install it in your own environment right away.</p>
    <p class="acct-error" id="mbError" hidden></p>
    <div id="mbBody"><p class="acct-loading">Loading…</p></div>
  `;
  const host = document.getElementById('mbBody');
  try {
    const me = D.cachedPing()?.user;
    const d = await D.apiFetch(BUILDS_URL);
    const mine = (d.builds || []).filter(b => me && (String(b.publisherUserId || '') === String(me.userId || me.rowKey || me.id || '') || b.status !== 'published'));
    if (!mine.length) { host.innerHTML = `<p class="acct-empty">Nothing yet. In the Studio, open a web app and choose Export, Publish as a module.</p>`; return; }
    host.innerHTML = tableHtml(mine);
  } catch (ex) {
    host.innerHTML = '';
    D.showError('mbError', D.friendlyError(ex, 'Could not load your builds.'));
  }
}
