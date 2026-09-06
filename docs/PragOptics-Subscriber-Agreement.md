# PragOptics™ Platform Agreement

**Version:** 2026-09.5  
**Effective Date:** Upon electronic acceptance (“I Agree”)

---

## 1. Purpose & Scope

This Platform Agreement (“Agreement”) governs access to and use of the **PragOptics™ Platform** (“PragOptics” or the “Platform”), operated by **Bridges Industrial LLC** (“BI”).

PragOptics is a programmable control plane and platform: authentication, API routing and custom endpoints, workflow automation, storage, deployment, billing automation, and an API console, across one or more environments, tenants, or execution targets. BI also sells hardware (such as OmniBus and OmniSource) through the PragOptics shop and operates a builds marketplace of downloadable templates, plugins, and automations.

This Agreement applies to **any individual or entity** that creates an account or accesses the Platform, including the Free tier and any paid, restricted, or gated capability, regardless of role, subscription tier, or operating context.

By creating an account, subscribing, using gated platform features, or clicking **“I Agree”**, you accept this Agreement.

---

## 2. Roles, Accounts & Authority (Extensible)

PragOptics supports multiple roles, permission levels, subscription tiers, and operating modes, which may expand over time.

The role descriptions below are illustrative and non-exhaustive.

### 2.1 Platform Operator

**BI** is the owner and operator of the PragOptics Platform and retains authority over platform architecture, security controls, provisioning logic, routing behavior, operational policies, and billing enforcement.

### 2.2 Platform Participant

A **Participant** is any authenticated account, entity, or system granted access to PragOptics capabilities under this Agreement.

Participants may include, without limitation:
- End users
- Developers
- Administrators
- Super users
- Operators
- Partners
- Integrators
- Delegated service accounts
- Programmatic or automated actors

Access is governed by role assignment, permissions, subscription state, and delegation, not by title alone.

### 2.3 Partner Role

A **Partner** is a Participant authorized to build on top of the Platform, including:
- Creating custom endpoints or API surfaces under a custom endpoint namespace
- Onboarding or managing other Participants, including provisioning seats for them (Section 4.5)
- Publishing builds (templates, plugins, automations) to the builds marketplace from the PragOptics software
- Delivering PragOptics-backed services to third parties
- Defining commercial terms with downstream customers

Partners operate under their own commercial and legal relationships with their customers, subject to this Agreement.

### 2.4 Delegation & Elevation

Certain roles or capabilities (including administrative, super-user, or external-tenant execution roles) may require explicit delegation, elevated permissions, or additional agreements.

BI may grant, restrict, or revoke elevated privileges to protect platform integrity, security, or compliance.

---

## 3. Platform Capabilities (High-Level)

PragOptics provides a unified API and runtime layer that may include:

- Authentication and identity resolution
- API routing and custom endpoint namespaces
- An API console for exploring and calling platform and custom endpoints
- Workflow automation and orchestration
- State and metadata management
- Storage provisioning and isolation
- Deployment and traffic routing
- Subscription enforcement and billing automation
- A builds marketplace for publishing and downloading templates, plugins, and automations
- A shop for hardware and related items (see Section 8)

The PragOptics software is free to download and run. An optional, adjustable donation may be offered alongside it. A donation is voluntary, is not a purchase of software or services, and does not create a subscription, allowance, or other entitlement.

Capabilities may vary by role, subscription tier, environment, or delegation status.

No capability is implied unless explicitly enabled for the Participant.

---

## 4. Subscriptions & Commercial Model

### 4.1 Tiers and Subscription-Based Access

PragOptics offers a **Free** tier and three paid tiers: **User**, **Partner**, and **Super**.

The Free tier requires no subscription and carries limited allowances; a new account may continue on the Free tier without entering payment details. Paid tiers are provided on a subscription basis at a monthly or annual cadence. Subscription types, pricing, and included usage are defined at:
- Checkout
- An Order Form
- A published Pricing Schedule
- Or an in-platform billing surface (the account's **Billing** section)

Multiple subscription models may exist concurrently.

### 4.2 Reference Pricing

Pricing amounts, included usage, and limits displayed in documentation or marketing materials, including the tables in Section 7, are informational only.

The authoritative price and included usage for any Participant are those presented at the time of purchase, renewal, or modification.

### 4.3 Add-ons (User Plan Only)

Add-ons are available **only on the User plan**. Current add-ons are:
- Storage: +5 GB
- API calls: +50,000 per month

An active add-on raises the corresponding allowance for as long as it remains on the subscription and is billed with the subscription at the same cadence. Add-ons are not offered on the Partner or Super plans; when a User subscription is upgraded to Partner or Super, its add-ons are removed as part of the upgrade (see Section 5.3).

### 4.4 Responsibility for Charges

Unless otherwise agreed in writing:
- Charges incurred by delegated or downstream Participants roll up to the controlling account
- Partners are financially responsible for usage generated by Participants they onboard
- Participants subscribing directly are responsible for their own subscription, add-ons, seats, and any disclosed metered charges

### 4.5 Seats

A **seat** is one named person who signs in to a Participant's environment. Every paid plan includes seats:
- User: 1 seat (the subscriber)
- Partner: 5 seats
- Super: 45 seats

Additional seats may be added to a Partner or Super subscription at the per-seat price shown at checkout or in the Billing section (reference: $7.50 per seat per month), billed with the subscription at the same cadence. Adding a seat takes effect immediately and is charged for the remainder of the current period in the same way as an upgrade (Section 5.3); removing a seat takes effect at the end of the current paid period with no credit (Section 5.4). Seats are managed from the PragOptics software.

### 4.6 Mailboxes and Domains

Each seat may, at the seat holder's request, be provisioned with one hosted mailbox on a domain the Participant has connected. The mailbox is included in the seat price. It is not provisioned automatically; it is set up from the PragOptics software after the domain is connected. Shared mailboxes and aliases on a connected domain do not consume a seat. The mailbox feature set and included storage track the underlying hosted-mail provider plan and may change with reasonable notice under Section 14.

Where BI registers or renews a domain on a Participant's behalf, the registrar's charge is passed through at cost and is not part of the subscription price. Connecting a domain the Participant already owns carries no charge. Domain and mailbox services are not available on the Free tier.

---

## 5. Billing, Renewal & Plan Changes

### 5.1 Automatic Renewal

Paid subscriptions renew **automatically** at the cadence you choose (monthly or annual). The payment method on file is charged at each renewal, for the plan and any active add-ons, until the subscription is canceled. If a renewal charge fails, BI may retry the payment method and may suspend paid capabilities until payment succeeds (see Section 13).

### 5.2 Currency and Taxes

All prices are stated and charged in **US dollars (USD)**. Sales tax, VAT, or similar charges may apply depending on your location and are added where required.

### 5.3 Upgrades

An upgrade to a higher tier takes effect **immediately**. The prorated difference for the remainder of the current paid period is charged to the payment method on file at the time of the upgrade. The higher tier is granted when that charge is paid; until then, the account keeps its current tier.

When a User subscription is upgraded to Partner or Super, any add-ons on the subscription are removed as part of the upgrade. The upgrade invoice nets any unused add-on time against the upgrade charge.

### 5.4 Downgrades and Add-on Removal

A downgrade to a lower tier, or the removal of an add-on, takes effect at the **end of the current paid period**. The current tier and add-ons remain in effect until then. There is no proration, no credit, and no refund for the remainder of the period.

### 5.5 Cancellation

You may cancel a subscription at any time from the account's Billing section. Cancellation takes effect at the end of the current paid period: service continues through what has already been paid for, then ends and the account returns to the Free tier.

A pending cancellation can be resumed at any time before it takes effect, in which case the subscription continues and renews as before.

### 5.6 No Partial Refunds

Subscription and add-on charges are non-refundable. No partial refunds or credits are issued for unused time, unused allowances, downgrades, add-on removal, or cancellation before the end of a paid period, except where required by law.

### 5.7 Price Changes

BI may change subscription or add-on prices. A price change is communicated at least **30 days** before it applies to a renewal. If you do not accept the new price, you may cancel before the renewal on which it takes effect; renewing after that date constitutes acceptance of the new price.

### 5.8 Third-Party Costs and Pass-Through

PragOptics operates on top of third-party infrastructure and services, including cloud compute, identity providers, networking, storage, and payment processors.

On the standard tiers, usage beyond an allowance plus its grace margin results in limiting as described in Section 6. Usage beyond included allowances may also result in metered, pass-through, or administrative charges (for example for API execution, storage, workflow execution, identity events, network traffic, or provider-level metered services) where disclosed at checkout, in an Order Form, in a Pricing Schedule, in a written agreement, or at billing time. Such charges may be billed to the Participant directly or allocated to a controlling account depending on role configuration and subscription structure.

---

## 6. Usage Allowances

### 6.1 Included Allowances

Each tier includes monthly usage allowances, for example API calls and storage, and, where the tier enables them, automation runs and connected domains. The allowance values in effect for a Participant are those shown in the account's **Billing** section; values in documentation or marketing materials are informational. Active add-ons raise the applicable allowance for as long as they remain on the subscription.

### 6.2 Monthly Reset

Allowances reset on the first day of each calendar month (UTC). Unused allowance does not carry over.

### 6.3 Grace Margin and Limiting

A grace margin above each allowance is also shown in the Billing section. Usage beyond an allowance plus its grace margin may result in metered platform functions being limited until capacity is added (through an add-on or an upgrade) or the month resets.

### 6.4 Functions Never Limited

**Account access, billing management, and warranty services are never limited by usage.**

### 6.5 Adjustments

Allowance and grace values may be adjusted with reasonable notice consistent with Section 14.

---

## 7. Platform Access Tiers (Illustrative, Non-Binding)

PragOptics supports multiple access tiers intended to cover a wide range of use cases, from evaluation and individual developers to enterprise operators.  
The tiers described below are **illustrative only** and do not constitute a promise of specific functionality, limits, or pricing.

Actual capabilities, limits, and commercial terms are defined at purchase, renewal, or in an applicable Pricing Schedule.

### 7.1 Tier Overview

| Tier | Intended Scope | Typical Use Cases |
|-----|----------------|-------------------|
| **Free** | Evaluation and light personal use; no subscription; no domain, mailbox, or automation services | Trying the API console, exploring public APIs within limited allowances, downloading builds, running the PragOptics software, hardware warranty |
| **User** | One person's environment | API access with your own keys, a provisioned environment and storage, a connected domain with a hosted mailbox on request, consuming partner-built solutions, optional add-ons |
| **Partner** | Builders and resellers, with a team | Custom endpoint namespaces, publishing to the builds marketplace, onboarding users on included seats, delivering PragOptics-backed products |
| **Super** | Enterprise and advanced operators | Large-scale integrations, multi-user orchestration on included seats, complex tenant or external-system execution |

### 7.2 Capability Alignment by Tier

| Capability | Free | User | Partner | Super |
|-----------|------|------|---------|-------|
| API console access | ✔️ | ✔️ | ✔️ | ✔️ |
| Access to public PragOptics APIs (within allowances) | ✔️ (limited) | ✔️ | ✔️ | ✔️ |
| Ability to consume partner-built solutions | ✔️ | ✔️ | ✔️ | ✔️ |
| Download builds from the marketplace | ✔️ | ✔️ | ✔️ | ✔️ |
| Run the PragOptics software | ✔️ | ✔️ | ✔️ | ✔️ |
| Add-ons (storage, API calls) | ✖️ | ✔️ | ✖️ | ✖️ |
| Included seats | 1 (self) | 1 | 5 | 45 |
| Additional seats (per-seat price) | ✖️ | ✖️ | ✔️ | ✔️ |
| Connect a domain you own | ✖️ | ✔️ | ✔️ | ✔️ |
| Domain registration through BI (registrar cost passed through) | ✖️ | ✔️ | ✔️ | ✔️ |
| Hosted mailbox per seat, on request | ✖️ | ✔️ | ✔️ | ✔️ |
| Publish builds to the marketplace (from the software, subject to review) | ✖️ | ✖️ | ✔️ | ✔️ |
| Revenue participation for marketplace sales | ✖️ | ✖️ | ✔️ | ✔️ |
| Custom endpoint namespace | ✖️ | ✖️ | ✔️ | ✔️ |
| Ability to onboard additional users | ✖️ | ✖️ | ✔️ | ✔️ |
| Enterprise or external-tenant execution | ✖️ | ✖️ | ✖️ | ✔️ |

Notes:
- Publishing to the builds marketplace is reserved for the Partner and Super tiers and is done from the PragOptics software after a build is packaged there, subject to review. The User tier does not publish. The public builds page lists verified builds; it is not a publishing surface.
- Seats, domains, mailboxes, and custom endpoints are provisioned and managed from the PragOptics software, not from the public site.
- Marketplace submissions are subject to technical, security, and platform compatibility review.
- The marketplace operates on a commission model: the builder keeps credit for the build, and BI retains a commission on sales made through the Platform. Revenue routing and settlement terms are defined outside this Agreement.

### 7.3 Usage & Scaling Characteristics (Illustrative)

| Characteristic | Free | User | Partner | Super |
|---------------|------|------|---------|-------|
| Base subscription model | None | Individual | Platform builder | Enterprise operator |
| Monthly allowances | Limited | Standard | Elevated | Highest platform limits |
| Capacity beyond the base allowance | Upgrade | Add-ons or upgrade | Additional seats or upgrade | Additional seats or written agreement |
| User management | Self | Self (1 seat) | Partner-managed (5 seats included) | Centralized multi-user control (45 seats included) |
| Execution scope | Own account | Own account | Own account and onboarded Participants | Enterprise or external-tenant targets |

Notes:
- No specific throughput, latency, or availability guarantees are implied by this section.
- Support channels and response expectations are published outside this Agreement and may vary by tier.

### 7.4 Important Clarifications

- These tables describe **intent and alignment**, not contractual minimums.
- Capabilities may be enabled, restricted, or expanded per account.
- New tiers, sub-tiers, or role refinements may be introduced without requiring changes to this Agreement.
- Enterprise or custom arrangements may override the examples above via written agreement.

---

## 8. Hardware Purchases

The PragOptics shop sells hardware built by BI (such as OmniBus and OmniSource) and related items. Hardware purchases are governed by the **PragOptics Shipping Policy** and by the product's published warranty and liability terms (**PragOptics Published Hardware, Warranty & Liability**), not by the subscription terms in Sections 4 through 7.

Those documents cover shipping and delivery, preorder deposits, returns (hardware bought from BI may be returned within 30 days of delivery for a refund of the purchase price, the unit complete and in resellable condition, with return shipping paid by the buyer; self-built units are not returnable), and warranty registration, coverage, and service.

A hardware purchase does not create a subscription, and a subscription is not required to buy, register, or service hardware. Warranty services are never limited by usage (Section 6.4).

---

## 9. Provisioning, Tenancy & Isolation

PragOptics provisions resources dynamically using platform metadata rather than fixed infrastructure assumptions.

Key principles include:
- Logical, table-driven tenancy
- Isolated routing and storage boundaries
- Execution targets that may be internal or externally delegated
- No required architectural rewrite when changing execution location

Provisioning behavior may evolve to improve reliability, security, or scalability.

---

## 10. Acceptable Use & Platform Integrity

Participants must not:
- Circumvent authentication, authorization, allowances, or rate limits
- Abuse shared infrastructure
- Introduce malicious code or payloads, including through builds submitted to the marketplace
- Use the Platform for unlawful purposes
- Interfere with other Participants’ access

BI may suspend or restrict access immediately to protect platform integrity, security, or availability.

---

## 11. Data, Security & Privacy

### 11.1 Data Ownership

Participants retain ownership of their data and content, including builds they publish to the marketplace.

BI processes platform metadata required for routing, billing, provisioning, usage metering, auditing, and security enforcement. Personal data is handled as described in the PragOptics Privacy Policy.

### 11.2 Security Controls

PragOptics employs:
- Encryption in transit and at rest
- Secret management systems
- Network and application-level protections
- Role-based access controls

Participants are responsible for safeguarding credentials, API keys, and authorized access.

### 11.3 Contact Details and Verification

Your email address is your identity on the Platform. A phone number is an optional channel for receiving verification codes and is never used as an identity. BI may require a phone number to be verified again at any time, for example after a period of inactivity, a change in carrier records, or when the number is verified on another account; until it is verified again, codes are delivered by email only. Verifying a phone number on an account makes it that account's number. Phone number changes are rate limited and may be paused for review.

---

## 12. Availability, Maintenance & Dependencies

PragOptics is designed for resilience and stateless operation but is **not** provided with a guaranteed availability level unless expressly agreed in writing.

### 12.1 No SLA by Default

BI does not guarantee uninterrupted or error-free service.

### 12.2 Third-Party Dependencies

Platform operation depends on third-party providers (including cloud infrastructure, identity providers, and payment processors). Outages or changes in those services may impact PragOptics.

---

## 13. Suspension & Termination

### 13.1 Suspension

BI may suspend access for:
- Non-payment, including a failed renewal charge
- Security concerns
- Policy violations
- Platform protection requirements

Suspension is reversible. It does not pause billing: a paid subscription on a suspended account continues to renew until it is canceled or the account is closed.

### 13.2 Termination

Either party may end participation. A Participant ends a paid subscription by canceling it (Section 5.5); service continues to the end of the paid period and then ends, subject to the billing terms in Section 5.

Termination does not relieve responsibility for accrued charges.

### 13.3 Account Closure

A Participant may close their account at any time from the account's Profile section. Closure is permanent and takes effect immediately: sign-in credentials are deleted, any active subscription ends at once with no refund for the remainder of the paid period (Section 5.6), and access to provisioned resources ends. A Participant who wants service through the end of a paid period should cancel the subscription first (Section 5.5) and close the account after the period ends.

Participants are responsible for exporting any data they wish to keep, using the PragOptics software, before closing. BI retains order, billing, and audit records as required for accounting, tax, and legal purposes.

BI may close an account for the reasons listed in Section 13.1, with the same effect.

---

## 14. Changes to Platform & Terms

### 14.1 Platform Evolution

PragOptics is an evolving platform. BI may add, modify, deprecate, or replace features.

### 14.2 Agreement Updates

BI may update this Agreement to reflect platform, security, operational, or regulatory changes.

Material changes will be communicated through reasonable notice. Price changes follow Section 5.7. Continued use constitutes acceptance of the updated Agreement.

---

## 15. Electronic Acceptance

By clicking **“I Agree”**, you acknowledge that:
- Acceptance is legally binding
- Electronic acceptance has the same effect as a handwritten signature
- This Agreement governs your use of PragOptics
- The Version shown at the top of this document identifies the terms in effect when you accepted

---

## 16. Governing Law

This Agreement is governed by the laws of the **State of Texas, USA**, without regard to conflict-of-law principles.

---

## 17. Contact

Platform operator: **Bridges Industrial LLC**  
Support: **support@bridgesindust.com**
