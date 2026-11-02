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
//     the environment's mailer, the default (backend auth/environmentMailers.js resolve).

/** An install that takes submissions, so it mails (the studio's rule, the same words). */
export function takesMail(manifest) {
  const doors = manifest && Array.isArray(manifest.doors) ? manifest.doors : [];
  return doors.includes('submissions');
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
  return list.filter(m => m && takesMail(m.manifest)).map(m => ({
    installId: String(m.installId || ''),
    name: String(m.name || m.buildName || 'A form'),
    table: tableOf(m),
    mailer: String((m.settings && m.settings.mailer) || '').trim().toLowerCase(),
    enabled: m.enabled !== false
  }));
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
