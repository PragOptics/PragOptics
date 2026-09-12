# PragOptics™

The public PragOptics™ web front end: the site at `pragoptics.com` and the
signed-in console that runs on top of it. This repository IS the deployed site
(GitHub Pages), so `main` is production.

PragOptics™ · published hardware, free docs, proven designs.

- Site: `https://pragoptics.com`
- API it talks to: `https://api.pragoptics.com/api/v1` (sandbox:
  `https://dev.api.pragoptics.com/api/v1`)

---

## Table of Contents

- [What This Repository Is](#what-this-repository-is)
- [Layout](#layout)
- [Running It Locally](#running-it-locally)
- [Lanes and Configuration](#lanes-and-configuration)
- [Feature Flags](#feature-flags)
- [Authentication Model (client side)](#authentication-model-client-side)
- [Deploying](#deploying)
- [Documentation and the Codex](#documentation-and-the-codex)
- [Licence and Use](#licence-and-use)

---

## What This Repository Is

A static, build-free front end. There is no bundler, no framework, and no
compile step: `index.html` loads `src/runtime/bootstrap.js` as a native ES
module, and every other module is imported from there. What is in the repo is
exactly what the browser runs.

It covers the whole customer-facing surface:

- Marketing pages, the OmniBus product surface, and the docs Codex
- Shop, cart, and checkout (Stripe Elements, server-priced)
- Warranty registration, replacement redemption, and transfer
- Sign-in, signup, two-factor enrollment and verification
- The account console: profile, emails, phone, subscription and billing,
  usage meters, orders, builds
- The operator (Internal) console: users, orders desk, warranty codes, usage
  and Azure cost, integrations

The backend that serves it lives in a separate repository
(`FortiviewHoldings/PragOptics`) and is documented there. This front end holds
no secrets: the Stripe **publishable** key is the only key it ever carries.

---

## Layout

| Path | Holds |
|------|-------|
| `index.html` | The single entry document. Loads `src/runtime/bootstrap.js` |
| `src/runtime/` | Boot, app mode/routing, lane config, session, post-login resolution |
| `src/auth/` | Native sign-in, signup, two-factor flow |
| `src/ui/` | Login modal and shared UI shells |
| `src/components/` | Agreement modal, pricing cards, status modal, header menu, visuals |
| `src/account/` | The signed-in console, customer and operator sections |
| `src/admin/` | Operator-only surfaces |
| `src/billing/` , `src/api/` | Subscription and billing calls |
| `src/shop/` | Products, cart, checkout |
| `src/warranty/` | Registration, redemption, transfer |
| `src/builds/` | The builds board (a list of verified builds; publishing is not here) |
| `src/wizard/` | Post-signup subscription wizard |
| `views/` | HTML partials fetched at runtime |
| `css/` | Global tokens plus per-view stylesheets |
| `docs/` | **Published**: agreements, policies, brochures, rendered by the Codex |
| `_local/` | Gitignored working notes. Never published |

`docs/` is served publicly. Anything private belongs in `_local/`.

---

## Running It Locally

The app must be served over HTTPS (Stripe.js and the module graph both require
a secure context). Local certificates are committed for convenience.

```bash
npm run serve:https
```

That serves on **`https://localhost:8443`** with the committed local
certificates. 8443 is the origin allowlisted for CORS on the dev Function App,
so it works as-is. If you change the port, add the new origin to that lane's
CORS list in Azure or every API call fails preflight.

Point the app at the sandbox before signing in (see below), and test against the
dev lane only. Never exercise checkout or account changes against live.

---

## Lanes and Configuration

`src/runtime/config.js` is the only place an API base or Stripe publishable key
is chosen. Nothing else hardcodes a base URL.

- `LANE_SETTING` selects `dev` or `live` for local development.
- **`pragoptics.com` is always live.** The production hostname resolves to the
  live lane regardless of what `LANE_SETTING` is committed as, so a
  `LANE_SETTING = 'dev'` that reaches `main` can never route customers to the
  sandbox.
- A platform operator can pin a browser to the other lane with an explicit
  sign-out-and-switch gesture (`src/runtime/lane.js`), stored as a
  `localStorage` override. It changes only where that browser routes; the
  deployed site is untouched. Signing out drops it.

---

## Feature Flags

Surfaces that depend on a backend route ship dark until that route is deployed
to the live lane, so the site never calls an endpoint that 404s a customer.
Flip the flag and push once the backend is live.

| Flag | Where | State |
|------|-------|-------|
| `SHOP_LIVE` | `src/shop/products.js` | on |
| `WARRANTY_API_LIVE` | `src/warranty/warranty.js` | on |
| `TRANSFER_API_LIVE` | `src/warranty/transfer.js` | on |
| `ORDERS_CLAIM_LIVE` | `src/runtime/config.js` | on (2026-09-06) |
| `TEAM_LIVE` | `src/runtime/config.js` | off: the Team and Environment sections, the join page and the Tenants desk stay off the live lane until the lanes carry tenant storage (dev shows them regardless) |
| `BUILDS_API_LIVE` | `src/builds/builds.js` | off |

---

## Authentication Model (client side)

The backend is authoritative for every decision here; this describes what the
client does and what it may assume.

**Two factors, always.** Submitting a password does not produce a session. The
API answers `login-password` with a short-lived 2FA-scoped token, and the client
exchanges it:

- enrolled account → an MFA challenge. The response says which second factors
  the account holds (`methods: { totp, passkey }`). Either one completes the
  step, never both: a passkey through `/v1/auth/passkey/auth/options` and
  `/auth/verify` (a WebAuthn assertion, user verification required), or an
  authenticator code or recovery code through `/v1/auth/2fa/verify`. When the
  account has a passkey and the browser supports it, the prompt opens first;
  the code field stays one link away, so a lost passkey recovers exactly like
  a lost authenticator.
- not yet enrolled → an enrollment token and a chooser: passkey (fingerprint,
  face, or PIN on a device the customer owns) or authenticator app. A password
  alone never picks the factor: for a pre-existing account the API also emails
  a code and demands it at confirm. Recovery codes are minted at the first
  enrollment of either kind and shown once.

There is no un-enrolled session to hand out, so every account, operators
included, is carried onto 2FA at its next sign-in. `src/auth/twoFactorFlow.js`
drives both branches; `src/auth/passkey.js` is the WebAuthn half, raw
`navigator.credentials` with no third-party script in the auth path. The
account panel's Two-factor card adds or removes passkeys behind a password
step-up and refuses to remove the last remaining factor.

**Tokens** live in `sessionStorage` only, and carry no privileges. Role, tier,
status, `isAdmin`, and `isDev` are re-read server-side on every request, so the
client can never elevate itself by editing what it holds. Signing out clears the
session keys and the lane override, and deliberately leaves `localStorage`
alone, because the cart, warranty queue, and builds queue are the customer's own
work.

**A session slides while the person works.** An access token lives one hour. In
its last ten minutes, if the person has clicked or typed within the last
fifteen, the app trades it for a fresh one through `POST /v1/auth/refresh`,
which re-reads the account row and refuses past a twelve-hour absolute age
from the original sign-in. Idle tabs still lapse at the hour. A lane without
the route answers 404 once and the app stops asking for that session.

**A session can die underneath an open console.** An operator suspending an
account, a password reset, or a sign-out elsewhere all take effect on the very
next request. The account console detects this in one place (the `apiFetch`
chokepoint), tears the console down once, and says why once, rather than letting
each panel render its own failure tile. Only the API's specific
session-invalidating answers trigger it: a wrong password in a step-up flow, or
an ordinary "not for your account" refusal, must never sign anyone out.

**Password reset recovers the password, not the second factor.** It is
OTP-gated, revokes existing sessions, and mints none. Losing the authenticator
or the passkey still requires a recovery code, or the other factor if one is
enrolled.

**Guests** can check out, register a warranty, and get shipping rates without an
account. A guest order is linked to an account later only by an explicit claim
that requires the order number plus a verified email; it is never attached
silently by email match.

---

## Deploying

Pushing `main` publishes the site. There is no build and no deploy step:
GitHub Pages serves the repository as-is at `pragoptics.com` (see `CNAME`).

Because of that, treat `main` as production:

- Do not push a surface whose backend route is not live. Gate it with a flag.
- `docs/` changes are published the moment they land.
- The backend lanes are deployed separately and manually; a front-end push
  never moves them.

---

## Documentation and the Codex

**The Environment section** (`src/account/environment.js`,
`css/views/environment.css`) is the customer's view of the private space a
paid plan sets up: the storage bar against the allowance, the files in their
container, their connected domains (a Domains card that hands out the TXT
record to create, verifies it on demand, shows the CNAME once the software
is hosted, and registers a new name through PragOptics: a quote, the
registrant contact, the registrar agreements, and payment in the card
through the shop order path), and their API keys. It follows the Team section's choice of team.
An upload goes straight from the browser to the tenant's container through a
ten-minute link the API mints, so the page's Content Security Policy lists
the two storage hosts in `connect-src` and each storage account carries a CORS
rule for the site's origin. Files are named and sized here; tenant data
values are never fetched by the site.

**In-product explainers.** Every complex surface carries a plain text link,
"How this works", that opens a short, human-written explainer from
`docs/explain/` in the legal viewer's frame (`src/components/explainer.js`,
`css/components/explainer.css`). The Markdown may carry two blocks the legal
viewer does not know: a `ladder` (a hierarchy, top rung strongest) and a
`flow` (a sequence), one item per line as `Label | what it means`. Today:
teams and seats, plans and add-ons, which plan fits, sign-in security, orders
and tracking, registration and transfers, and, for the cards that land with
round 3, the environment and API keys.

Human-readable documentation, agreements, and policy materials live in `/docs`
and are rendered through the PragOptics Codex, which provides a structured,
navigable view rather than exposing raw files by default.

The subscriber agreement at
[docs/PragOptics-Subscriber-Agreement.md](docs/PragOptics-Subscriber-Agreement.md)
is the published, canonical version and governs the plans, allowances, add-ons,
and return window the pricing surfaces describe.

---

## Licence and Use

Use of PragOptics™ and associated services is governed by the applicable
subscription agreement and privacy policy.

PragOptics hardware is **published hardware**, source-available rather than open
source. Every design is published free (schematic, BOM, enclosure files) under
CC BY-NC-SA 4.0: build one for yourself or your employer, but not for resale.
Firmware is proprietary and unpublished. The full licence is
[omni-LICENSE.md](docs/omni-LICENSE.md), a copy of which travels with every
design download; see also
[Published Hardware, Warranty & Liability](docs/PragOptics-Published-Hardware-and-Warranty.md).

Copyright Bridges Industrial LLC. PragOptics™ is a trademark of Bridges
Industrial.

---

## Status

Updated 2026-09-11. Landed since 2026-09-08: the Team section in the profile
panel, the invite join page and the operator's Tenants desk (all behind
`TEAM_LIVE`); extra seats in the plan editor and the wizard; the carrier's
latest status on the guest track page and the Orders section; the sliding
session; the How it works explainers; the platform's own social preview; the
Environment section (storage bar, files, domains, API keys) and the Tenants
desk's storage column and Repair door; mobile close buttons, the hero scenes on the
light theme, the footer trim, the Privacy Teams section.

Next on this repo (round 3, in order): the serving record once the software
is hosted, domain registration pass-through, then the front end closeout
list. PragOptics is actively evolving; this repository is the current
state of that evolution.
