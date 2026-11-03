// src/account/mailerUse.js
//
// WHICH FORM SENDS FROM WHICH MAILER (2026-11-02, Cameron: "i need to be able to control what each mailer is sending on
// behalf of, as in what table drives it"). Pure: the environment's installs (GET v1/environment/modules) and its mailers
// (GET v1/environment/mailers) in; for each mailer, the forms it sends for out. No DOM, no fetch.
//
// The rules are the platform's own, kept in one place each and mirrored here, never guessed:
//   - an install takes mail when its manifest's doors include "submissions" (the studio's rule, PragOpticsUI
//     app/src/model/mailSettings.js takesMail, the same words);
//   - its table is manifest.table, else settings.table, else "submissions" (backend auth/publicDoors.js tableOf);
//   - its `mailer` setting names the address it sends from; empty, or an address the environment no longer holds, means
//     the environment's mailer, the default (backend auth/environmentMailers.js resolve);
//   - its rows wait for a decision when its manifest says moderate, or its `moderate` setting is on, or it declares the
//     reader door and the setting is not off (backend auth/moderation.js moderates), 2026-11-03;
//   - the roles it tells (`notify_roles`), who decides (`approvers`) and its intent word (`intent`, the owner's word over
//     the manifest's) are read when the lane's backend keeps them and empty when it does not (the plan D1, D4, D5);
//   - who decides is the setting when it names anyone, else the manifest's default role words (backend auth/approvals.js
//     approversOf, the same reading), so an owner who unchecks every box falls to the module's own default, as the
//     server does.

import { roleList, emailList } from './mailRouting.js';

/** An install that takes submissions, so it mails (the studio's rule, the same words). */
export function takesMail(manifest) {
  const doors = manifest && Array.isArray(manifest.doors) ? manifest.doors : [];
  return doors.includes('submissions');
}

const isOn = v => v === true || v === 'true' || v === 1 || v === '1';
const isOff = v => v === false || v === 'false' || v === 0 || v === '0';
/** Whether an install's rows wait for a decision before they show (backend auth/moderation.js moderates, the same three cases). */
export function moderates(install) {
  if (!install) return false;
  const s = install.settings && typeof install.settings === 'object' ? install.settings : {};
  const m = install.manifest && typeof install.manifest === 'object' ? install.manifest : {};
  if (m.moderate === true) return !isOff(s.moderate);
  if (isOn(s.moderate)) return true;
  const doors = Array.isArray(m.doors) ? m.doors : [];
  return doors.includes('reader') && !isOff(s.moderate);
}

/** The intent word of an install: the owner's setting over the publisher's manifest word; '' when neither (the plan D4). */
export function intentOf(install) {
  const s = (install && install.settings) || {};
  const m = (install && install.manifest) || {};
  const w = String(s.intent || m.intent || '').trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{1,31}$/.test(w) ? w : '';
}

/**
 * Who an install names to decide, read as the backend reads it (auth/approvals.js approversOf): its `approvers` setting
 * when it names anyone (role words and addresses), else the manifest's default role words, else nobody. An empty setting
 * therefore falls to the manifest's default, never to "nobody". `approversFrom` says which: 'setting' | 'manifest' | ''.
 */
export function approversOf(install) {
  const s = (install && install.settings) || {};
  const m = (install && install.manifest) || {};
  const own = Array.isArray(s.approvers) ? [...new Set(s.approvers.map(x => String(x == null ? '' : x).trim().toLowerCase()).filter(Boolean))] : [];
  if (own.length) return { approvers: [...roleList(own), ...emailList(own)], approversFrom: 'setting' };
  const dflt = roleList(m.approvers);
  return { approvers: dflt, approversFrom: dflt.length ? 'manifest' : '' };
}

/** The table an install's submissions land in (the public door's rule). */
export function tableOf(install) {
  const m = install && install.manifest;
  const s = (install && install.settings) || {};
  const t = String((m && m.table) || s.table || 'submissions').trim();
  return t || 'submissions';
}

/** The forms out of the modules answer: the installs that take mail, each with what the mailer needs to know. */
export function formsOf(modules) {
  const list = Array.isArray(modules) ? modules : (modules && Array.isArray(modules.modules) ? modules.modules : []);
  return list.filter(m => m && takesMail(m.manifest)).map(m => {
    const s = (m.settings && typeof m.settings === 'object') ? m.settings : {};
    const cv = s.confirm_visitor;
    return {
      installId: String(m.installId || ''),
      name: String(m.name || m.buildName || 'A form'),
      table: tableOf(m),
      mailer: String(s.mailer || '').trim().toLowerCase(),
      // the form's own people and switch (2026-11-02): set, they win over the mailer's; empty or unset, the mailer's apply.
      // The older `recipient` setting (one address) counts as the form's own list too, as the door counts it.
      notifyTo: [...new Set([s.recipient, ...(Array.isArray(s.notify_to) ? s.notify_to : [])].map(x => String(x || '').trim().toLowerCase()).filter(x => x.includes('@')))],
      confirmVisitor: cv === true || cv === 'true' ? true : cv === false || cv === 'false' ? false : null,
      // 2026-11-03: the roles told, who decides, the intent word, whether rows wait
      notifyRoles: roleList(s.notify_roles),
      ...approversOf(m),
      intent: intentOf(m),
      waits: moderates(m),
      enabled: m.enabled !== false
    };
  });
}

/** The address a form sends from, as the server would resolve it: its own pick when the environment holds it, else the default. */
export function resolvedMailer(form, mailers, dflt) {
  const held = new Set((Array.isArray(mailers) ? mailers : []).map(m => String(m.address || '').toLowerCase()).filter(Boolean));
  const own = String((form && form.mailer) || '').toLowerCase();
  if (own && held.has(own)) return own;
  return String(dflt || '').toLowerCase();
}

/**
 * The forms one mailer sends for: the ones that name it, and the ones that fall to it as the environment's default.
 * Answers { explicit: [form], byDefault: [form] }, each list in the forms' own order.
 */
export function formsFor(address, forms, mailers, dflt) {
  const a = String(address || '').toLowerCase();
  const explicit = [], byDefault = [];
  for (const f of Array.isArray(forms) ? forms : []) {
    if (resolvedMailer(f, mailers, dflt) !== a) continue;
    const own = String(f.mailer || '').toLowerCase();
    (own === a ? explicit : byDefault).push(f);
  }
  return { explicit, byDefault };
}
