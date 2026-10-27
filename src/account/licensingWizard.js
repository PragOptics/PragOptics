// src/account/licensingWizard.js
//
// THE GUIDED LICENSING WIZARD (2026-10-03, Cameron: "a friendly, seamless front end... get all the info in one step,
// and that be 1-4... one button to perform steps 1-4"). The six licensing steps (licensingShared.LICENSING_STEPS) are
// shown as three things the customer actually does, not six cards at once:
//
//   Phase 1  "Set up Microsoft 365"  one card, least info, the agreement checkbox, one button that runs steps 1 to 4
//            in sequence: the licensing account, the tenant name (suggested from the business name), the Microsoft
//            Customer Agreement, and the first mail order. Pax8 then provisions the tenant and emails the admin login.
//   Phase 2  "Approve PragOptics"    the sign-in that already works (licensingTenant.signInHtml / connectHtml). The page
//            stays on it and says plainly: sign in once, grant PragOptics permission, and the moment you do we connect
//            the tenant and build your mailbox.
//   Phase 3  the management view (licensing.js): mailboxes, My mailbox, licenses. Reached once the tenant is connected.
//
// This module owns Phase 1 only. licensing.js decides which phase to paint and composes Phases 2 and 3 from the cards
// that already exist. Nothing here calls Microsoft or Pax8 itself: it drives the same routes the separate cards drive
// (POST /account, POST /microsoft, POST /microsoft {accept}, POST /enroll), in order, on one button.

import { leadBtn, ico } from './cards.js';
import { LIC_URL, lc, st, cardHtml, call, send, perms, reqLead, errHtml, noteHtml, setNote, kept, forget, sentence, tenantNamed, agreementStands, saveAccountName } from './licensingShared.js';

const MCA_URL = 'https://www.microsoft.com/licensing/docs/customeragreement';
const WEBSITE_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** The tenant's onmicrosoft prefix suggested from the business name: letters and digits, up to 27. */
function slugName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 27); }

/** Mail has been ordered (or is on): step 4 is done. */
const MAIL_ON = new Set(['ordering', 'delayed', 'on', 'ending']);
function mailOn(v) { return MAIL_ON.has(String(v?.mail?.state || '')); }

/** Steps 1 to 4 all done: the account, the tenant named, the agreement accepted, mail turned on. */
export function phase1Done(v) {
  const m = v?.microsoft || {};
  return !!v?.account && tenantNamed(m) && agreementStands(m) && mailOn(v);
}
/** The tenant is connected (the consent is in): Phase 3, the management view. */
export function tenantConnected() { return !!lc.tn?.tenant?.connected; }
/**
 * A TENANT THE BUSINESS BROUGHT (2026-10-26, Cameron connecting the Bridges Industrial tenant on live): named by its ID,
 * not made by the platform. It needs no licensing account, no agreement and no mail order before it is connected (the
 * server asks for none of them to name or connect it), so the one-button wizard, which runs exactly those, is the wrong
 * page for it; until today the owner had no way off that page and could not bring a tenant at all.
 */
export function broughtTenant(v) { const m = v?.microsoft || {}; return !!m.tenantId && !m.domainPrefix && !m.createdByPlatform; }

/**
 * Which phase to paint. 'phase1' until steps 1 to 4 are done; then 'signin' (the sign-in and connect cards) until the
 * tenant is connected; then 'manage' (the full management view). A brought tenant goes straight from its name to
 * 'bring' (connect it) and then 'manage'. An ineligible or read-only team never sees the wizard.
 */
export function wizardStage(v) {
  if (!v) return 'phase1';
  if (tenantConnected()) return 'manage';
  if (broughtTenant(v)) return 'bring';
  if (phase1Done(v)) return 'signin';
  return 'phase1';
}

/** The lead above the connect card for a brought tenant: one sign-in, and the tenant is connected. */
export function bringLead(v) {
  const e = st.D.escapeHtml, id = String(v?.microsoft?.tenantId || '');
  return `
    <div class="lic-wiz-lead">
      <p class="lic-wiz-lead-head">Connect your Microsoft tenant</p>
      <p class="acct-card-note">Your tenant <span class="ev-code">${e(id)}</span> is named. Sign in at Microsoft once as one of its administrators and approve PragOptics; the moment you do, it is connected, and your domains, mail and mailboxes are managed from here.</p>
    </div>`;
}

/* ---------- the three-phase spine: Set up, Approve, Ready ---------- */

/** The rail across the top of the licensing tab, so the customer always sees where they are in the three phases. */
export function phaseRail(stage) {
  const idx = stage === 'phase1' ? 0 : stage === 'signin' ? 1 : 2;
  const steps = ['Set up', 'Approve', 'Ready'];
  return `<ol class="lic-rail" aria-label="Setting up Microsoft 365">${steps.map((label, i) => {
    const cls = i < idx ? 'is-done' : i === idx ? 'is-on' : 'is-next';
    const mark = i < idx ? ico('check', 13) : String(i + 1);
    return `<li class="lic-rail-step ${cls}" ${i === idx ? 'aria-current="step"' : ''}><span class="lic-rail-dot">${mark}</span><span class="lic-rail-label">${st.D.escapeHtml(label)}</span></li>`;
  }).join('')}</ol>`;
}

/** Phase 2, the one human step: sign in once, grant permission, and the connection and mailbox happen on their own. */
export function phase2Lead() {
  return `
    <div class="lic-wiz-lead">
      <p class="lic-wiz-lead-head">One sign-in, and the rest is automatic</p>
      <p class="acct-card-note">Microsoft asks you to approve PragOptics before it lets us set anything up in your tenant. It is the one step only you can do. Sign in once with the administrator login Microsoft emailed you, grant PragOptics permission to manage your tenant, and the moment you do, we connect it and build your mailbox for you.</p>
    </div>`;
}

/** Phase 3, done: the tenant is connected; the owner's own admin account and the mailboxes are made. */
export function phase3Lead(v) {
  if (!perms().isOwner) return '';
  // the lead tells the truth of the moment (2026-10-05, the final walk): right after the approval the owner's mailbox and
  // administrator account are still being made, by this read on the server or the next; the page keeps reading until ready
  const mine = lc.tn?.mine;
  const making = !!(mine && mine.seat && mine.state !== 'ready' && mine.state !== 'failed');
  // a tenant the business brought has no platform-made administrator account and no mailbox order yet: the lead says what
  // the tenant card below now does for it, instead of promising a first password that was never made
  const note = broughtTenant(v)
    ? 'Your tenant is connected. On the tenant card below, add your domain to it and switch its mail when you are ready; shared mailboxes on your domain are made on the Shared mailboxes card; licenses and mailboxes for your people come from the cards after it.'
    : making
    ? 'Your tenant is connected. Your mailbox and your own administrator account are being made now, a minute or two; this page updates itself when they are ready.'
    : 'Your tenant is connected. Your own administrator account and its first password are on your My mailbox card below, so you run your tenant with that, not the login from the setup email. Add people on the Team tab and give each one a mailbox here.';
  return `
    <div class="lic-wiz-lead is-done">
      <p class="lic-wiz-lead-head">${ico('check', 16)}Your Microsoft 365 is ${making ? 'almost ready' : 'set up'}</p>
      <p class="acct-card-note">${note}</p>
    </div>`;
}

/* ---------- Phase 1: one card, one button, steps 1 to 4 ---------- */

/** The business's legal name to set up under: what they confirmed on Billing, kept editable here. */
function bizNameDefault(v) { return v.account?.businessName || v.accountDraft?.businessName || ''; }
// THE MAILBOX IS NAMED AUTOMATICALLY (2026-10-05, Cameron: "if we are doing it automatically that is ok, as long as we can
// alias on top of it later... keep it simple and clean"): the address is made from the person's email (auth/tenantAccess.js
// aliasOf), no field asks for it anywhere in the wizard, and aliases on top of it are a later feature of the platform.

export function phase1Html(v) {
  const e = st.D.escapeHtml, m = v.microsoft || {}, p = perms();
  // only the owner sets this up; anyone else is told who does
  if (!p.isOwner || v.readOnly) {
    const why = v.readOnly && v.readOnlyWhy ? sentence(v.readOnlyWhy) : 'The owner sets up Microsoft 365 for your team here.';
    return cardHtml({ key: 'wizard', icon: 'rocket', title: 'Set up Microsoft 365', summary: 'for your team', body: `<p class="acct-card-note">${e(why)}</p>` });
  }
  // what is already done shows as a check, so the one button is honest about what is left
  const steps = [
    ['Your licensing account', !!v.account],
    ['Your Microsoft tenant', tenantNamed(m)],
    ['The Microsoft agreement', agreementStands(m)],
    ['Your mailbox ordered', mailOn(v)]
  ];
  const done = steps.filter(s => s[1]).length;
  const acc = m.accepter || {};
  const haveName = !!acc.hasName;
  const bizName = kept('licWizBiz', bizNameDefault(v));
  const tnPreview = slugName(bizName) ? `${slugName(bizName)}.onmicrosoft.com` : 'yourbusiness.onmicrosoft.com';
  const checklist = `
    <ul class="lic-wiz-steps" aria-label="What this sets up">
      ${steps.map(([label, ok]) => `<li class="lic-wiz-step ${ok ? 'is-done' : ''}">${ok ? ico('check', 14) : '<span class="lic-wiz-dot" aria-hidden="true"></span>'}<span>${e(label)}</span></li>`).join('')}
    </ul>`;
  // the one form: the business name (from Billing, editable), the website, the agreement checkbox, and a name when the
  // signed-in person has none on file (the agreement records it; nobody types a name twice otherwise)
  const nameRow = haveName ? '' : `
      <div class="lic-wiz-field lic-wiz-name">
        <p class="acct-card-note">The agreement is signed in your name, and we don't have it yet. Add it once.</p>
        <div class="lic-wiz-two">
          <div><label class="acct-label" for="licWizFirst">First name</label><input class="acct-input" id="licWizFirst" type="text" data-keep value="${e(kept('licWizFirst', acc.firstName || ''))}" maxlength="60" autocomplete="given-name"></div>
          <div><label class="acct-label" for="licWizLast">Last name</label><input class="acct-input" id="licWizLast" type="text" data-keep value="${e(kept('licWizLast', acc.lastName || ''))}" maxlength="60" autocomplete="family-name"></div>
        </div>
      </div>`;
  const form = `
    <div class="lic-wiz-form">
      <div class="lic-wiz-field">
        <label class="acct-label" for="licWizBiz">Your business's legal name</label>
        <input class="acct-input" id="licWizBiz" type="text" data-keep value="${e(bizName)}" maxlength="160" autocomplete="organization" placeholder="Your business, LLC" aria-describedby="licWizBizHint">
        <p class="lic-hint" id="licWizBizHint">Your Microsoft account and tenant are set up under this. Your tenant will be <span class="ev-code" id="licWizTnPreview">${e(tnPreview)}</span>.</p>
      </div>
      <div class="lic-wiz-field">
        <label class="acct-label" for="licWizWeb">Your business's website</label>
        <input class="acct-input" id="licWizWeb" type="url" inputmode="url" data-keep value="${e(kept('licWizWeb', ''))}" placeholder="yourbusiness.com" autocomplete="url" aria-describedby="licWizWebHint">
        <p class="lic-hint" id="licWizWebHint">Microsoft files your licensing account under your website's domain.</p>
      </div>
      ${nameRow}
      <label class="lic-wiz-agree" for="licWizMca">
        <input type="checkbox" id="licWizMca" ${kept('licWizMca', false) ? 'checked' : ''} data-keep>
        <span>I accept the <a href="${MCA_URL}" target="_blank" rel="noopener noreferrer">Microsoft Customer Agreement</a> on behalf of my business.</span>
      </label>
    </div>`;
  const progress = lc.busy === 'wizard' && lc.wizStep ? `<p class="acct-card-note" role="status" aria-live="polite">${e(lc.wizStep)}</p>` : '';
  // THE CHOICE FIRST (2026-10-26, Cameron: "a surface where I am asked which method I desire", the way the Domains card
  // asks). Two ways: PragOptics sets up a new tenant (the one-button walk, exactly as built), or the business connects a
  // tenant it already has (its ID). Nothing of the walk shows until it is chosen; once the walk has started (anything
  // done), it is the only way and the chooser is gone, so a walk in progress is never interrupted.
  const mode = done ? 'new' : (lc.wizMode === 'new' || lc.wizMode === 'bring' ? lc.wizMode : '');
  const pick = (m, icon, title, desc) => `
      <button class="ev-dom-pick ${mode === m ? 'is-on' : ''}" type="button" data-lic-action="wiz-mode" data-mode="${m}" aria-pressed="${mode === m}">
        <span class="ev-dom-pick-ico">${ico(icon, 20)}</span>
        <span class="ev-dom-pick-t">${e(title)}</span>
        <span class="ev-dom-pick-d">${e(desc)}</span>
      </button>`;
  const chooser = done ? '' : `
    <p class="acct-card-note ev-dom-lead">Microsoft 365 for your team: mail, licenses and your own tenant. Start with a tenant PragOptics sets up for you, or connect one your business already has.</p>
    <div class="ev-dom-choose" role="group" aria-label="How do you want to set up Microsoft 365">
      ${pick('new', 'rocket', 'Set up a new tenant', 'PragOptics creates your Microsoft account and tenant, records the agreement and orders your first mailbox. One step, about a minute, nothing charged.')}
      ${pick('bring', 'building', 'Connect a tenant we have', 'Give the ID of your business\'s Microsoft tenant and approve PragOptics in it once. No account, agreement or order is needed for that.')}
    </div>`;
  // the walk, exactly as built: the checklist, the form, the one button
  const walk = mode !== 'new' ? '' : `
      <p class="acct-card-note">Microsoft 365 for your team, in one step. We create your Microsoft account and tenant, record the agreement, and order your first mailbox. It takes about a minute, and nothing is charged.</p>
      ${checklist}
      ${form}
      ${progress}
      ${v.lane?.test ? '<p class="acct-card-note ev-note is-bad">Test lane: this environment is not armed for real orders, so the mail order below is a test and no tenant will be made. The operator arms real orders for it on the Tenants desk first (2026-10-05: the final walk\'s first account ordered before it was armed).</p>' : ''}
      <div class="acct-actions-row">${leadBtn({ lic: 'wiz-go' }, 'rocket', done ? 'Finish setup' : 'Set up Microsoft 365', lc.busy === 'wizard' ? 'disabled' : '', 'btn-primary btn-lg')}</div>
      <p class="lic-hint">After this, Microsoft sends you one administrator sign-in to approve, and then everything else happens on its own.</p>`;
  // the other way: a tenant the business already has, by its ID (broughtTenant); the walk's fields are not shown for it
  const tidErr = lc.err['wizard-tid'] ? `<p class="lic-field-err" id="licWizTidErr" role="alert">${e(lc.err['wizard-tid'])}</p>` : '';
  const bring = mode !== 'bring' ? '' : `
    <div class="lic-wiz-bring" role="group" aria-labelledby="licWizBringHead">
      <p class="lic-wiz-lead-head" id="licWizBringHead">Connect a tenant you already have</p>
      <p class="acct-card-note">Give its tenant ID. Then you sign in at Microsoft once as one of its administrators and approve PragOptics; licenses you add later join it.</p>
      <div class="lic-wiz-field">
        <label class="acct-label" for="licWizTid">Tenant ID</label>
        <input class="acct-input" id="licWizTid" type="text" data-keep value="${e(kept('licWizTid', ''))}" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="licWizTidHint${tidErr ? ' licWizTidErr' : ''}">
        ${tidErr}
        <p class="lic-hint" id="licWizTidHint">Microsoft Entra admin center, Overview: the Tenant ID. It looks like 6eda43f3-fbf0-4e2b-9978-b543d9dd31e3.</p>
      </div>
      <div class="acct-actions-row">${reqLead('wiz-bring', { lic: 'wiz-bring' }, 'building', 'Use this tenant', 'Saving…', '', 'btn-primary')}</div>
    </div>`;
  const summary = done ? `${done} of 4 ready` : mode === 'bring' ? 'connect a tenant you have' : mode === 'new' ? '0 of 4 ready' : 'choose how';
  return cardHtml({
    key: 'wizard', icon: 'rocket', title: 'Set up Microsoft 365', summary: e(summary), open: true,
    body: `
      ${noteHtml('wizard')}${errHtml('wizard')}
      ${chooser}
      ${walk}
      ${bring}`
  });
}

/** A tenant the business already has, named by its ID (POST /microsoft { tenantId }); the page then paints the connect step. */
async function bringTenant() {
  const typed = String(kept('licWizTid', document.getElementById('licWizTid')?.value || '')).trim();
  lc.err.wizard = ''; lc.err['wizard-tid'] = ''; setNote('wizard', '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(typed)) { lc.err['wizard-tid'] = 'A Microsoft tenant ID looks like 6eda43f3-fbf0-4e2b-9978-b543d9dd31e3.'; st.paint(); document.getElementById('licWizTid')?.focus(); return; }
  await send('wiz-bring', 'Saving…', async () => {
    try { await call(`${LIC_URL}/microsoft`, 'POST', { tenantId: typed }); }
    catch (ex) { if (ex?.data?.code === 'TENANT_ID_INVALID') { lc.err['wizard-tid'] = ex.data.error; return; } throw ex; }
    forget('licWizTid');
    setNote('wizard', 'Saved. Next, connect it: sign in at Microsoft as its administrator and approve PragOptics once.');
    await st.load();
  }, {
    errKey: 'wizard', fallback: 'The tenant could not be saved.',
    codes: { TENANT_LOCKED: (ex) => ex?.data?.error || 'The tenant is fixed once mail or a license is ordered.', DOMAIN_REQUIRED: 'Connect and verify a domain you own first, on the Environment tab.', LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.' }
  });
  if (lc.err['wizard-tid']) { st.paint(); document.getElementById('licWizTid')?.focus(); }
}

/** Read the form once (trimmed), for the checks and the run. */
function wizInput() {
  return {
    businessName: String(kept('licWizBiz', document.getElementById('licWizBiz')?.value || '') || '').trim().replace(/\s+/g, ' '),
    website: String(kept('licWizWeb', document.getElementById('licWizWeb')?.value || '') || '').trim(),
    firstName: String(kept('licWizFirst', document.getElementById('licWizFirst')?.value || '') || '').trim(),
    lastName: String(kept('licWizLast', document.getElementById('licWizLast')?.value || '') || '').trim(),
    agree: !!(document.getElementById('licWizMca')?.checked)
  };
}

/** The same checks the separate cards make, in one place, before anything is sent: { error, focus } or null. */
function checkWizard(v, inp) {
  const haveName = !!(v.microsoft?.accepter?.hasName);
  if (!inp.businessName) return { error: "Give your business's legal name. Your Microsoft account and tenant are set up from it.", focus: 'licWizBiz' };
  if (inp.businessName.length > 160) return { error: 'The business name is at most 160 characters.', focus: 'licWizBiz' };
  if (!slugName(inp.businessName)) return { error: 'Your business name needs at least one letter or digit, so Microsoft can make your tenant name from it.', focus: 'licWizBiz' };
  if (!inp.website) return { error: "Give your business's website. Your licensing account is filed under its domain.", focus: 'licWizWeb' };
  if (/\s/.test(inp.website) || !inp.website.replace(WEBSITE_RE, '').split('/')[0].includes('.')) return { error: 'That is not a website address. Give it as yourbusiness.com.', focus: 'licWizWeb' };
  if (!haveName && (!inp.firstName || !inp.lastName)) return { error: 'Add your first and last name. The Microsoft agreement is signed in your name.', focus: inp.firstName ? 'licWizLast' : 'licWizFirst' };
  if (!inp.agree) return { error: 'Accept the Microsoft Customer Agreement to continue.', focus: 'licWizMca' };
  return null;
}

/**
 * The one button: steps 1 to 4 in order, each skipped when it is already done, the card saying which one is running.
 * A refusal stops the run on its step with the server's own words, and what already succeeded stays done, so pressing
 * again picks up where it left off.
 */
async function runWizard() {
  const v = lc.view; if (!v) return;
  const inp = wizInput();
  const bad = checkWizard(v, inp);
  if (bad) { lc.err.wizard = bad.error; setNote('wizard', ''); st.paint(); document.getElementById(bad.focus)?.focus(); return; }
  lc.wizStep = '';
  await send('wizard', 'Setting up…', async () => {
    const m0 = lc.view?.microsoft || {};
    // 1: the licensing account, under the business name and website
    if (!lc.view.account) {
      lc.wizStep = 'Creating your licensing account…'; st.paint();
      await call(`${LIC_URL}/account`, 'POST', { businessName: inp.businessName, website: inp.website });
      await st.load();
    }
    // 2: the tenant, named from the business name (letters and digits)
    if (!tenantNamed(lc.view?.microsoft || {})) {
      lc.wizStep = 'Naming your Microsoft tenant…'; st.paint();
      await call(`${LIC_URL}/microsoft`, 'POST', { domainPrefix: slugName(inp.businessName) });
      await st.load();
    }
    // 3: the agreement, signed in the person's name (saved first when it was not on file)
    if (!agreementStands(lc.view?.microsoft || {})) {
      if (!lc.view?.microsoft?.accepter?.hasName && inp.firstName && inp.lastName) {
        lc.wizStep = 'Saving your name…'; st.paint();
        await saveAccountName(inp.firstName, inp.lastName);
      }
      lc.wizStep = 'Recording the Microsoft agreement…'; st.paint();
      await call(`${LIC_URL}/microsoft`, 'POST', { accept: true });
      await st.load();
    }
    // 4: the first mail order, which is what has Microsoft make the tenant
    if (!mailOn(lc.view)) {
      lc.wizStep = 'Ordering your first mailbox…'; st.paint();
      await call(`${LIC_URL}/enroll`, 'POST');
      await st.load();
    }
    lc.wizStep = '';
    forget('licWizBiz', 'licWizWeb', 'licWizFirst', 'licWizLast', 'licWizMca');
    setNote('wizard', 'Done. Microsoft is making your tenant now. Next, approve PragOptics with the sign-in it emails you.');
    await st.load();
  }, {
    errKey: 'wizard', fallback: 'Setup could not be finished. What was done is kept; press again to carry on.',
    codes: {
      BILLING_ADDRESS_INCOMPLETE: 'Your billing address is incomplete. Complete it on Billing, then try again.',
      WEBSITE_TAKEN: 'That website is already on another licensing account. Use your business\'s own website.',
      WEBSITE_INVALID: 'That is not a website address. Give it as yourbusiness.com.',
      TENANT_NAME_TAKEN: 'That tenant name is already taken at Microsoft. Change your business name slightly, or edit it, and try again.',
      PHONE_REQUIRED: 'Your licensing account needs a phone number. Add one to your billing details on Billing, then try again.',
      PHONE_INVALID: 'The phone on your billing details is in a form Microsoft refuses. Fix it on Billing, then try again.',
      NAME_REQUIRED: 'Add your first and last name on Profile, then try again. The agreement is signed in your name.',
      LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.'
    }
  });
  lc.wizStep = '';
  if (lc.err.wizard) st.paint();
}

/** Keep the tenant-name preview in step with the business-name box as it is typed. */
if (typeof document !== 'undefined') {
  document.addEventListener('input', (ev) => {
    if (ev.target?.id !== 'licWizBiz') return;
    const prev = document.getElementById('licWizTnPreview');
    const s = slugName(ev.target.value);
    const tenant = s ? `${s}.onmicrosoft.com` : 'yourbusiness.onmicrosoft.com';
    if (prev) prev.textContent = tenant;
  });
}

/* ---------- Phase 2: one sign-in and approval, merged from the old steps 5 and 6 ---------- */
//
// THE WALK PROVED THESE ARE ONE (PROOFS.md 2026-10-03 03:12Z: "the consent IS the connection... GDAP played no part";
// 2026-10-02 22:25Z: six cards including a separate Sign in and a separate Connect). The customer signs in with the
// Pax8 administrator login, sets the password, and approves PragOptics, all in one Microsoft trip. The old step 5
// (admin.microsoft.com) and step 6 (the consent) overlapped, which is why approving in step 5 left step 6 landing in
// the admin center. One button now opens the consent flow in a NEW tab (the platform tab stays), and this tab polls
// the licensing read until the connection lands, then paints Phase 3 on its own. No reliance on the Microsoft redirect.

/** The administrator login the customer signs in with: the owner's own account once made, else the one Pax8 emailed. */
function adminLoginOf(v) {
  const t = lc.tn?.tenant || {};
  return String(t.ownerAccount?.upn || t.adminLogin || (v.microsoft?.domainPrefix ? `admin@${v.microsoft.domainPrefix}.onmicrosoft.com` : 'your administrator login'));
}

export function phase2Card(v) {
  const e = st.D.escapeHtml, p = perms(), m = v.microsoft || {};
  if (!p.isOwner && !p.canManageDomainsMail) {
    return cardHtml({ key: 'wizard', icon: 'external', title: 'Sign in and approve', summary: 'the owner does this', body: '<p class="acct-card-note">The owner signs in to Microsoft once and approves PragOptics, and your mailbox is built right after.</p>' });
  }
  // Until Microsoft has made the tenant there is nothing to sign in to, and the login and password come in an email from
  // Pax8 that takes about ten minutes. The wait says that plainly and offers no button; once the tenant is ready, the
  // one sign-in redirects to Microsoft and back (same tab, no popup to block), the way the walk proved works.
  const made = !!m.tenantId;
  const login = adminLoginOf(v);
  if (!made) {
    return cardHtml({
      key: 'wizard', icon: 'mail', title: 'Sign in and approve', summary: 'waiting on your email', open: true,
      body: `
        ${noteHtml('wizard')}${errHtml('wizard')}
        <div class="lic-wait">
          <p class="lic-wait-head">${ico('refresh', 18)} Microsoft is building your account. This takes about 10 minutes.</p>
          <p class="lic-wait-line">You do not have to stay on this page. When it is ready, this step turns on by itself.</p>
          <p class="lic-wait-line"><strong>Watch for an email from Pax8</strong>, titled as a Microsoft order and sent from a noreply address. It carries the administrator login and password you sign in with. The emails you already have are setup confirmations; the Pax8 one, in about ten minutes, is the one to wait for.</p>
        </div>`
    });
  }
  return cardHtml({
    key: 'wizard', icon: 'external', title: 'Sign in and approve', summary: 'ready for you', open: true,
    body: `
      ${noteHtml('wizard')}${errHtml('wizard')}
      <div class="lic-call">
        <p class="lic-call-head">Sign in once and approve PragOptics</p>
        <p class="lic-call-line">Your account is ready. Use the administrator login and password from your Pax8 email. The button sends you to Microsoft; sign in, set your own password, approve PragOptics, and Microsoft brings you back here.</p>
        <dl class="lic-call-facts">
          <div><dt>Your sign-in</dt><dd><span class="ev-code">${e(login)}</span></dd></div>
          <div><dt>Your password</dt><dd>In your Pax8 email. You enter it twice: once to sign in, then again to set your own.</dd></div>
        </dl>
        <div class="acct-actions-row">${reqLead('wiz-connect', { lic: 'wiz-connect' }, 'external', 'Sign in and approve', 'Opening Microsoft…', '', 'btn-primary btn-lg')}</div>
      </div>`
  });
}

/**
 * The one button: the same-tab redirect to Microsoft (Cameron, 2026-10-03: the new tab got the popup blocked, and the
 * redirect is the part he liked). The page goes to Microsoft's sign-in, the customer signs in and approves, and
 * Microsoft's callback brings them back to the Licensing tab connected, which paints Phase 3.
 */
function runSignInApprove() {
  lc.err.wizard = ''; setNote('wizard', '');
  send('wiz-connect', 'Opening Microsoft…', async () => {
    const d = await call(`${LIC_URL}/tenant/connect`, 'POST');
    if (!d || typeof d.url !== 'string' || !/^https:\/\/login\.microsoftonline\.com\//.test(d.url)) throw new Error("Microsoft's sign-in page could not be opened.");
    window.location.assign(d.url);
    await new Promise((_, reject) => setTimeout(() => reject(new Error("Microsoft's page did not open. Try again.")), 15000));
  }, {
    errKey: 'wizard', fallback: "Microsoft's sign-in could not be opened.",
    codes: {
      PLATFORM_TENANT_CONNECTS: 'Your Microsoft tenant is being connected by PragOptics; nothing to do here yet.',
      MICROSOFT_DETAILS_REQUIRED: 'Finish the setup step first.',
      MS_NOT_CONFIGURED: 'Connecting your tenant is being set up. Look again soon.',
      UNKNOWN_ORIGIN: 'Open this page at pragoptics.com and try again.',
      LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.'
    }
  });
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function wizardAction(a, btn) {
  if (a === 'wiz-go') { runWizard(); return true; }
  if (a === 'wiz-bring') { bringTenant(); return true; }
  // the choice between the two ways; a press sends nothing
  if (a === 'wiz-mode') { lc.wizMode = btn.dataset.mode === 'bring' ? 'bring' : 'new'; lc.err.wizard = ''; lc.err['wizard-tid'] = ''; st.paint(); document.getElementById(lc.wizMode === 'bring' ? 'licWizTid' : 'licWizBiz')?.focus(); return true; }
  if (a === 'wiz-connect') { runSignInApprove(); return true; }
  return false;
}
