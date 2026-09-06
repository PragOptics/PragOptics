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
| `ORDERS_CLAIM_LIVE` | `src/runtime/config.js` | off (dev shows it regardless) |
| `BUILDS_API_LIVE` | `src/builds/builds.js` | off |

---

## Authentication Model (client side)

The backend is authoritative for every decision here; this describes what the
client does and what it may assume.

**Two factors, always.** Submitting a password does not produce a session. The
API answers `login-password` with a short-lived 2FA-scoped token, and the client
exchanges it:

- enrolled account → an MFA challenge, exchanged at `/v1/auth/2fa/verify` with
  an authenticator code or a recovery code
- not yet enrolled → an enrollment token, which forces authenticator setup
  before any session exists

There is no un-enrolled session to hand out, so every account, operators
included, is carried onto 2FA at its next sign-in. `src/auth/twoFactorFlow.js`
drives both branches.

**Tokens** live in `sessionStorage` only, and carry no privileges. Role, tier,
status, `isAdmin`, and `isDev` are re-read server-side on every request, so the
client can never elevate itself by editing what it holds. Signing out clears the
session keys and the lane override, and deliberately leaves `localStorage`
alone, because the cart, warranty queue, and builds queue are the customer's own
work.

**A session can die underneath an open console.** An operator suspending an
account, a password reset, or a sign-out elsewhere all take effect on the very
next request. The account console detects this in one place (the `apiFetch`
chokepoint), tears the console down once, and says why once, rather than letting
each panel render its own failure tile. Only the API's specific
session-invalidating answers trigger it: a wrong password in a step-up flow, or
an ordinary "not for your account" refusal, must never sign anyone out.

**Password reset recovers the password, not the second factor.** It is
OTP-gated, revokes existing sessions, and mints none. Losing the authenticator
still requires a recovery code.

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

PragOptics is actively evolving. Interfaces may expand and tooling may grow;
this repository represents the current state of that evolution.
