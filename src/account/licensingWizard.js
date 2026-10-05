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
import { LIC_URL, lc, st, cardHtml, call, send, perms, me, reqLead, errHtml, noteHtml, setNote, kept, forget, sentence, tenantNamed, agreementStands, saveAccountName } from './licensingShared.js';

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
 * Which phase to paint. 'phase1' until steps 1 to 4 are done; then 'signin' (the sign-in and connect cards) until the
 * tenant is connected; then 'manage' (the full management view). An ineligible or read-only team never sees the wizard.
 */
export function wizardStage(v) {
  if (!v) return 'phase1';
  if (tenantConnected()) return 'manage';
  if (phase1Done(v)) return 'signin';
  return 'phase1';
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
  const note = making
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
// the mailbox name the server would make from the signed-in email (auth/tenantAccess.js aliasOf: the +tag dropped), as the placeholder
function autoMailName() { return String(me().email || '').split('@')[0].toLowerCase().replace(/\+.*$/, '').replace(/[^a-z0-9._-]/g, '') || 'user'; }
const MAIL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;

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
      <div class="lic-wiz-field">
        <label class="acct-label" for="licWizMail">Your mailbox name <span class="adm-muted">(optional)</span></label>
        <div class="lic-suffix"><input class="acct-input" id="licWizMail" type="text" data-keep value="${e(kept('licWizMail', ''))}" maxlength="60" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${e(autoMailName())}" aria-describedby="licWizMailHint"><span id="licWizMailSuffix">@${e(tnPreview)}</span></div>
        <p class="lic-hint" id="licWizMailHint">Letters, numbers, dots, dashes. Left empty, it is made from your email. It cannot be changed once the mailbox exists, which is why it is asked here and not after.</p>
      </div>
      ${nameRow}
      <label class="lic-wiz-agree" for="licWizMca">
        <input type="checkbox" id="licWizMca" ${kept('licWizMca', false) ? 'checked' : ''} data-keep>
        <span>I accept the <a href="${MCA_URL}" target="_blank" rel="noopener noreferrer">Microsoft Customer Agreement</a> on behalf of my business.</span>
      </label>
    </div>`;
  const progress = lc.busy === 'wizard' && lc.wizStep ? `<p class="acct-card-note" role="status" aria-live="polite">${e(lc.wizStep)}</p>` : '';
  return cardHtml({
    key: 'wizard', icon: 'rocket', title: 'Set up Microsoft 365', summary: e(`${done} of 4 ready`), open: true,
    body: `
      ${noteHtml('wizard')}${errHtml('wizard')}
      <p class="acct-card-note">Microsoft 365 for your team, in one step. We create your Microsoft account and tenant, record the agreement, and order your first mailbox. It takes about a minute, and nothing is charged.</p>
      ${checklist}
      ${form}
      ${progress}
      ${v.lane?.test ? '<p class="acct-card-note ev-note is-bad">Test lane: this environment is not armed for real orders, so the mail order below is a test and no tenant will be made. The operator arms real orders for it on the Tenants desk first (2026-10-05: the final walk\'s first account ordered before it was armed).</p>' : ''}
      <div class="acct-actions-row">${leadBtn({ lic: 'wiz-go' }, 'rocket', done ? 'Finish setup' : 'Set up Microsoft 365', lc.busy === 'wizard' ? 'disabled' : '', 'btn-primary btn-lg')}</div>
      <p class="lic-hint">After this, Microsoft sends you one administrator sign-in to approve, and then everything else happens on its own.</p>`
  });
}

/** Read the form once (trimmed), for the checks and the run. */
function wizInput() {
  return {
    businessName: String(kept('licWizBiz', document.getElementById('licWizBiz')?.value || '') || '').trim().replace(/\s+/g, ' '),
    website: String(kept('licWizWeb', document.getElementById('licWizWeb')?.value || '') || '').trim(),
    firstName: String(kept('licWizFirst', document.getElementById('licWizFirst')?.value || '') || '').trim(),
    lastName: String(kept('licWizLast', document.getElementById('licWizLast')?.value || '') || '').trim(),
    // the mailbox name, chosen here before anything is ordered (2026-10-05: the step 3 field came and went in the seconds
    // before the mailbox was made; the choice belongs in this form or nowhere)
    mailName: String(kept('licWizMail', document.getElementById('licWizMail')?.value || '') || '').trim().toLowerCase(),
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
  if (inp.mailName && !MAIL_NAME_RE.test(inp.mailName)) return { error: 'The mailbox name is letters, numbers, dots, dashes or underscores, starting with a letter or digit, up to 60.', focus: 'licWizMail' };
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
    // the mailbox name chosen in the form, saved on the owner's seat now that the seat exists and long before the mailbox
    // is made (after the connect); a name that cannot be set never fails the setup, the automatic one stands instead
    if (inp.mailName) {
      lc.wizStep = 'Keeping your mailbox name…'; st.paint();
      try { await call(`${LIC_URL}/tenant/mailbox/name`, 'POST', { name: inp.mailName }); }
      catch (ex) { setNote('wizard', `Your mailbox name could not be kept (${ex?.data?.error || 'no reason given'}); the automatic one is used.`, true); }
    }
    lc.wizStep = '';
    forget('licWizBiz', 'licWizWeb', 'licWizMail', 'licWizFirst', 'licWizLast', 'licWizMca');
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
    const suffix = document.getElementById('licWizMailSuffix');
    if (suffix) suffix.textContent = `@${tenant}`;
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
  if (a === 'wiz-connect') { runSignInApprove(); return true; }
  return false;
}
