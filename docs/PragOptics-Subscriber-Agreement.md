# PragOptics™ Platform Agreement

**Version:** 2026-09.11  
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
- Running a team: inviting people into included and added seats (Section 4.5)
- Publishing builds (templates, plugins, automations) to the builds marketplace from the PragOptics software
- Delivering PragOptics-backed services to third parties
- Defining commercial terms with downstream customers

Partners operate under their own commercial and legal relationships with their customers, subject to this Agreement. A Partner's customers are the Partner's: they are served by what the Partner builds and through its own connected accounts, and they are not given roles on the Platform (Section 2.5).

### 2.4 Delegation & Elevation

Certain roles or capabilities (including administrative or super-user roles) may require explicit delegation, elevated permissions, or additional agreements.

BI may grant, restrict, or revoke elevated privileges to protect platform integrity, security, or compliance.

### 2.5 Teams and Viewers

A subscriber's team is its owner and the people in its seats (Section 4.5). A viewer is read-only access to an environment that the subscriber gives on purpose, for example to show a build to a possible customer, or to a new team member before they take a seat. A viewer takes no seat, changes nothing, and holds no permission on licensing. A viewer is not how a subscriber serves its own customers: those exist only in what the subscriber builds in its environment, through its own connected accounts (Section 4.8), and they hold no role on the Platform.

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
- AI features: an assistant in the Studio, an assistant a Participant may install on a published site, and answers over the API (see Section 4.10)

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
- The account's **Licensing** section, for Microsoft licenses (Sections 4.8 and 4.11)

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
- Partners are financially responsible for usage generated by their team, their viewers, and what they build and publish
- Participants subscribing directly are responsible for their own subscription, add-ons, seats, Microsoft licenses, and any disclosed metered charges

### 4.5 Seats

A **seat** is one named person who signs in to a Participant's environment. Every paid plan includes seats:
- User: 1 seat (the subscriber)
- Partner: 5 seats
- Super: 45 seats

Additional seats may be added to a Partner or Super subscription at the per-seat price shown at checkout or in the Billing section (reference: $7.50 per seat per month), billed with the subscription at the same cadence. Adding a seat takes effect immediately and is charged for the remainder of the current period in the same way as an upgrade (Section 5.3); removing a seat takes effect at the end of the current paid period with no credit (Section 5.4). Seats are managed from the account panel on pragoptics.com: added or removed in the Billing section and filled from the Team section.

### 4.6 Mailboxes and Connected Domains

Each seat includes one hosted mailbox, included in the seat price. Mailboxes are not created automatically. Once the owner turns on mail for the team, the owner, or a team role the owner allows, gives each seat its mailbox from the Licensing section of the account panel on pragoptics.com; the seat holder does not have to ask for it. No domain is needed: a mailbox's address starts on the Participant's own Microsoft tenant name (name.onmicrosoft.com). Once a domain is connected, verified, and its mail switched to Microsoft, new mailboxes use it, and existing ones may move to it. The included mailbox is a basic hosted mailbox, the same on every plan (currently Exchange Online Kiosk); a seat may be upgraded to a larger mailbox as a paid license at the provider's list price. Shared mailboxes and aliases do not consume a seat. A seat's included mailbox ends when the seat ends, when its holder leaves or is removed, or when the holder's role no longer carries a seat. A paid license that includes no mailbox leaves the seat's included mailbox in place. After a mailbox ends, the provider keeps its content for 30 days and then deletes it. The mailbox feature set and included storage track the underlying hosted-mail provider plan and may change with reasonable notice under Section 14.

A Participant may connect a domain they already own in either of two ways. They may prove ownership by publishing a verification record in the domain's DNS themselves, in which case BI never touches the domain's records. Or they may connect the account at the registrar that holds the domain, in which case BI publishes the verification record and the records the Platform needs (for serving, and for mail where a mailbox is provisioned) through that account, on the Participant's instruction, reading the existing records before writing. Unlinking the account leaves every record in place; nothing at the registrar is deleted. Connecting a domain the Participant already owns carries no charge. Domain and mailbox services are not available on the Free tier.

### 4.7 Domains Registered Through BI

A Participant may register a new domain from the Platform. The following terms apply to every such registration.

- **The Participant is the registrant of record.** The name, postal address, email address, and phone number the Participant supplies at purchase are recorded with the registrar and the registry as the domain's contacts, as ICANN and the registry require. That is what makes the domain the Participant's. Where the ending supports it, privacy protection is on, so the public record shows the registrar's proxy details instead of the Participant's.
- **The registration is held in BI's cloud account and managed by the Platform on the Participant's instruction.** The registrar of record is named on the Domains card at purchase. The Participant does not need an account at the registrar, and the registrar may contact the Participant directly at the contact email, for example to verify the registrant's email address as ICANN requires.
- **Price and consent.** The price shown at purchase is the registrar's current price for the ending, passed through with no markup, plus any sales tax due at the Participant's address. At purchase the Participant accepts the registrar's own agreements presented on the card (a domain registration agreement and, where privacy protection applies, a proxy agreement). BI records the acceptance, the time, and the network address it came from, because the registrar and the registry require that record. A domain is registered only after the registry accepts it; if the registry declines, BI refunds the purchase in full. Once the registry has accepted a registration, the registrar's fee is not refundable.
- **Renewal.** A registration lasts one year. Renewal is on by default and is charged, about thirty days before the term ends, at the registrar's renewal price at that time, passed through with no markup, as a line on the Participant's subscription. The Participant may turn renewal off for any domain from the Domains card, in which case the domain expires at the end of its term. BI sends renewal and expiry notices to the Participant's email. A domain that has expired may be recoverable for a limited period at the registrar's redemption fee, where the registry offers one.
- **Leaving with the domain.** The domain is the Participant's. At any time after the registry's initial lock period (sixty days for most endings), the Participant may ask BI to release the domain for transfer to a registrar of their choice, and BI does so without charge. On transfer-out the domain leaves BI's account and this Section no longer applies to it.
- **Cancellation and closure.** Ending a subscription or closing an account does not delete a registered domain; the domain remains registered until the end of its current term. Renewal requires an active subscription to bill; without one, renewal is turned off and the domain expires at term unless the Participant transfers it out first. A Participant who wants to keep a domain after leaving should request transfer-out before closing the account.

### 4.8 Connected Accounts and Provider Terms

The Platform can act on accounts the Participant holds at other providers (for example a payment processor, a messaging provider, a shipping provider, a source-control host, a productivity suite, or a domain registrar). Those accounts are the Participant's, under that provider's own terms, and BI is not a party to the Participant's agreement with the provider.

- **Authorization.** The Participant authorizes the Platform to act on such an account by supplying a credential the provider issued to them, or by completing the provider's own connection flow. BI verifies the credential with the provider once, stores it in a vault that belongs to the Participant's tenant alone, never displays it again, and uses it only for the actions the Participant instructs from the Platform. The Participant may remove a connection at any time; removal deletes the stored credential.
- **Charges.** Charges the provider makes for usage on the Participant's account are the Participant's, billed by the provider under the provider's terms, and are not part of the subscription price unless this Agreement or the checkout says otherwise.
- **Accounts the Platform creates for the Participant.** Where offered, the Platform may create an account for the Participant at a provider through that provider's platform or connect program, so that the Participant does not have to open it themselves. Such an account is the Participant's, opened under the provider's account agreement, which the Participant accepts during the provider's onboarding. The Platform acts on it as the provider's connected platform, on the Participant's instruction, and the Participant may disconnect the Platform from it under the provider's rules. Unless stated at purchase, BI is not in the money path of such an account and receives no part of its transactions. A Microsoft tenant is the exception: the three points below govern it.
- **Microsoft licenses and the Microsoft Customer Agreement.** Microsoft licenses, including the mailbox included with each seat (Section 4.6), are provided through Microsoft's authorized distributor and live in the Participant's own Microsoft tenant. Licenses other than the included mailbox are sold by BI at Microsoft's list price, charged before they are ordered, on a bill of their own beside the subscription; they are not add-ons under Section 4.3. Before anything is ordered, the Participant's business must accept the Microsoft Customer Agreement. It is accepted on the Platform's own screen, in the Licensing section, by a signed-in person whose role holds the permission to accept agreements for the business: the owner always holds it, and the owner may give it to a team role. The Participant confirms that anyone given that permission has authority to accept the agreement for the business. The person's name and email address are taken from their account, never typed, and are recorded with the date they accepted. The acceptance stands while that person remains on the team and their role keeps the permission; after that, someone who holds it accepts again before the next order. BI is not a party to the Microsoft Customer Agreement.
- **A Microsoft tenant BI creates.** Where the Participant has no Microsoft tenant, the first order creates one under the name the owner chose. The tenant is the Participant's own. While the Participant's subscription is paid, BI is its administrator, so that licenses and mailboxes are managed from the Platform, and the Participant never needs the administrator sign-in. The owner may ask BI for an administrator account in the tenant at any time; BI creates it and keeps its own administrator account, so that licensing keeps working. The new account's first password is shown to the owner once, in the Licensing section, and is then deleted; it is never sent by email, and Microsoft asks for a new password at the first sign-in. Changes the Participant makes directly in Microsoft that break what the Platform manages, such as removing BI's administrator account or the licenses it placed, are the Participant's responsibility. When the Participant leaves, because the plan ends or the account closes, BI hands the tenant over: the owner receives the tenant's administrator sign-in before the last license through BI ends, and the tenant and its mail remain the Participant's.
- **A Microsoft tenant the Participant already has.** The owner gives the tenant's ID, and an administrator of that tenant approves the Platform on Microsoft's own approval page. That administrator may remove the approval in Microsoft at any time; licenses and mailboxes in that tenant can then no longer be managed from the Platform.

### 4.9 Suppliers and Drop Shipping

The Platform can connect a supplier's own store or system to the Participant's environment so that the Participant may list the supplier's products in the Participant's store and forward orders to the supplier for fulfillment. The supplier relationship is the Participant's alone: the supplier's account, prices, terms, charges, shipping, returns and refunds are agreed between the Participant and the supplier. BI is not a party to that relationship, does not hold, move or receive funds between them, and does not sell, ship, insure or warrant the supplier's goods. The Platform carries orders and fulfillment information between the two under the Participant's connection and the supplier's authorization, either of which may be withdrawn at any time; withdrawal deletes the stored credential and the copied product data.

### 4.10 AI Features

The Platform offers AI features: an assistant in the Studio that edits and answers about a project, an assistant a Participant may install on a published site to answer visitors from the Participant's own knowledge, and answers over the Platform's API. The following terms apply to every such feature.

- **Generated output.** Answers and edits are generated by a machine learning model and are provided as they are. They may be inaccurate, incomplete or out of date, and they are not legal, medical, financial, engineering or other professional advice. The Participant reviews every answer and edit before relying on it, and remains responsible for what they publish, send or act on.
- **Scope.** An assistant answers from the environment it runs in: the knowledge files the Participant loads there, the data the Participant connects to it, and the actions of the modules installed on that environment's lane. It reads no other environment. The Participant is responsible for the knowledge and data they load, including the right to use it, and for what an installed assistant is allowed to do on their site.
- **Model providers.** A question, the recent conversation the visitor's browser holds, and the excerpts of the Participant's knowledge chosen for it are sent to the model provider that answers: BI's provider when the answer is paid from the plan's AI credit, or the provider of an account the Participant connects under Section 4.8, on that account and under that provider's terms. A provider may decline a request under its own policies, and the Participant does not submit content a provider's policies forbid.
- **What BI keeps.** BI keeps no conversation. It records a count of answers per assistant and their cost for the caps and the bill, and a message the assistant files on a visitor's behalf lands in the Participant's own submissions table like any message sent through a form.
- **Allowances and caps.** Answers paid from the plan's AI credit draw on the monthly allowance in Section 6. A Participant sets caps per assistant and may direct answers to their own connected account, in which case the provider bills them and the credit is not used. BI may limit or pause AI features to protect the Platform and passes a provider's refusal to the Participant in the provider's words.
- **Visitors.** An assistant installed on a Participant's site tells visitors that its answers are generated and may be wrong. The Participant does not remove that notice.

### 4.11 Microsoft Licenses

The owner of a Participant's account may buy Microsoft licenses from the Licensing section of the Platform (Section 4.8). BI sells them at Microsoft's list price, through Microsoft's authorized distributor, and bills each license on its own to the payment method on file. The following terms apply to every license bought this way.

- **Price and charge.** The price per license seat, the plan (billing period and any commitment) and the exact amount charged now, sales tax included, are shown before the owner confirms. That is the authoritative price under Section 4.2. The charge is taken before the license is ordered; a declined charge orders nothing.
- **Term.** Licenses are offered on the term of the Participant's plan: on an annual plan, a one-year term; on a monthly plan, month to month. The mailbox included with each seat (Section 4.6) follows the same term; on an annual plan, what remains of its term when the plan ends or the account closes is charged to the payment method on file, because Microsoft bills it to the end of the term.
- **Who may buy.** A license Microsoft sells only to organizations it has approved, such as education or nonprofit licenses, is sold only once Microsoft has approved the Participant. Government licenses are not sold.
- **Renewal.** A license renews automatically each billing period, on the day it was bought, until it ends, and is charged to the payment method on file.
- **More and fewer license seats.** More license seats take effect immediately and are charged for the remainder of the current period. Fewer license seats take effect on Microsoft's next renewal date for that license, shown on the Licensing section, and every license seat is charged until then, together with the day or so after that date that Microsoft takes to apply the change, which is charged on that license's next bill.
- **Ending and commitments.** An ending takes effect at the end of the period already paid for. A license bought on a commitment runs, and is charged, to the end of its commitment even if it is ended sooner, because Microsoft bills it for the whole commitment.
- **Failed payments.** If a license charge fails and every retry fails, the license ends when Microsoft allows it to end, at the end of its current term or commitment, and the remainder of that term or commitment is charged to the payment method on file. BI never carries it. Until that charge is paid, no license can be added.
- **Closing the account.** Section 13.3 applies.
- **Orders not completed.** If Microsoft does not complete an order, or an increase in license seats, after the charge was taken, BI reviews the charge and contacts the Participant, and may place the order again on that payment or refund it to the payment method it came from.
- **Price changes.** Section 5.7 applies. When Microsoft changes its list price for a license the Participant holds, the new price applies from that license's next renewal after Microsoft's change. BI tells the Participant as soon as it learns of the change, at least 30 days ahead where it can.
- **No refunds or credits.** License charges are not refunded and are not turned into credits, including for license seats removed or a license ended before the end of a period or commitment, except as the Orders not completed point provides or where required by law.

---

## 5. Billing, Renewal & Plan Changes

### 5.1 Automatic Renewal

Paid subscriptions renew **automatically** at the cadence you choose (monthly or annual). The payment method on file is charged at each renewal, for the plan and any active add-ons, until the subscription is canceled. If a renewal charge fails, BI may retry the payment method and may suspend paid capabilities until payment succeeds (see Section 13).

Microsoft licenses bought through BI (Sections 4.8 and 4.11) are each billed on a bill of their own and follow their own rule: if a license charge fails, BI retries it and tells the owner. A license whose charge is still unpaid when the retries run out is not paused: it ends when Microsoft allows it to end, and what remains of its term or commitment, which Microsoft bills to its end, is charged to the payment method on file, as Section 4.11 says. BI never carries it.

### 5.2 Currency and Taxes

All prices are stated and charged in **US dollars (USD)**. Sales tax, VAT, or similar charges may apply depending on your location and are added where required, to subscriptions, seats, add-ons, Microsoft licenses and any final charge.

### 5.3 Upgrades

An upgrade to a higher tier takes effect **immediately**. The prorated difference for the remainder of the current paid period is charged to the payment method on file at the time of the upgrade. The higher tier is granted when that charge is paid; until then, the account keeps its current tier.

When a User subscription is upgraded to Partner or Super, any add-ons on the subscription are removed as part of the upgrade. The upgrade invoice nets any unused add-on time against the upgrade charge.

### 5.4 Downgrades and Add-on Removal

A downgrade to a lower tier, or the removal of an add-on, takes effect at the **end of the current paid period**. The current tier and add-ons remain in effect until then. There is no proration, no credit, and no refund for the remainder of the period.

### 5.5 Cancellation

You may cancel a subscription at any time from the account's Billing section. Cancellation takes effect at the end of the current paid period: service continues through what has already been paid for, then ends and the account returns to the Free tier.

A pending cancellation can be resumed at any time before it takes effect, in which case the subscription continues and renews as before.

### 5.6 No Partial Refunds

Subscription, seat, add-on and Microsoft license charges are non-refundable. No partial refunds or credits are issued for unused time, unused allowances, downgrades, add-on removal, license seats removed, a license ended, or cancellation before the end of a paid period or commitment, except where required by law. Section 4.11 says what happens to a charge for a Microsoft license Microsoft did not deliver.

### 5.7 Price Changes

BI may change subscription, seat or add-on prices. A price change is communicated at least **30 days** before it applies to a renewal. If you do not accept the new price, you may cancel before the renewal on which it takes effect; renewing after that date constitutes acceptance of the new price. Microsoft license prices follow Microsoft's list price, as Section 4.11 says: a change Microsoft makes applies from the license's next renewal after it, told at least 30 days ahead where BI learns of it that early.

### 5.8 Third-Party Costs and Pass-Through

PragOptics operates on top of third-party infrastructure and services, including cloud compute, identity providers, networking, storage, payment processors, and domain registrars.

Domain registrations and renewals under Section 4.7 are passed through at the registrar's price with no markup. Sales tax on them follows Section 5.2.

On the standard tiers, usage beyond an allowance plus its grace margin results in limiting as described in Section 6. Usage beyond included allowances may also result in metered, pass-through, or administrative charges (for example for API execution, storage, workflow execution, identity events, network traffic, or provider-level metered services) where disclosed at checkout, in an Order Form, in a Pricing Schedule, in a written agreement, or at billing time. Such charges may be billed to the Participant directly or allocated to a controlling account depending on role configuration and subscription structure.

---

## 6. Usage Allowances

### 6.1 Included Allowances

Each tier includes monthly usage allowances, for example API calls and storage, and, where the tier enables them, automation runs. Connected domains are not a monthly allowance: each tier allows up to a set number of domains connected at any one time, with no grace margin and no monthly reset. The allowance values and domain limits in effect for a Participant are those shown in the account's **Billing** section; values in documentation or marketing materials are informational. Active add-ons raise the applicable allowance for as long as they remain on the subscription.

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
| **User** | One person's environment | API access with your own keys, a provisioned environment and storage, up to 5 connected domains, a hosted mailbox, consuming partner-built solutions, optional add-ons |
| **Partner** | Builders and resellers, with a team | Custom endpoint namespaces, publishing to the builds marketplace, a team on included seats, delivering PragOptics-backed products |
| **Super** | Enterprise and advanced operators | Large-scale integrations and multi-user orchestration on included seats, with the highest limits |

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
| Connected domains (domains you own) | 0 | 5 | 20 | 50 |
| Domain registration through BI (registrar cost passed through) | ✖️ | ✔️ | ✔️ | ✔️ |
| Hosted mailbox per seat, included | ✖️ | ✔️ | ✔️ | ✔️ |
| Publish builds to the marketplace (from the software, subject to review) | ✖️ | ✔️ | ✔️ | ✔️ |
| Custom endpoint namespace | ✖️ | ✖️ | ✔️ | ✔️ |
| Team members in seats beyond the owner | ✖️ | ✖️ | ✔️ | ✔️ |
| Connected accounts: work in outside systems through accounts you connect (Section 4.8) | ✖️ | ✔️ | ✔️ | ✔️ |

Notes:
- Publishing to the builds marketplace is for paid plans and is done from the PragOptics software after a build is packaged there, subject to review. A Free account installs builds and does not publish them. The public builds page lists verified builds; it is not a publishing surface.
- Seats, domains, mailboxes and Microsoft licenses are managed from the account panel on pragoptics.com, in its Billing, Team, Environment and Licensing sections.
- Marketplace submissions are subject to technical, security, and platform compatibility review.
- BI takes no commission on builds. The builder keeps credit for the build. If a publisher charges for a build, the installer pays the publisher directly, through the publisher's own payment processor account connected to the Platform (Section 4.8); BI is not in that money path and receives no part of it.

### 7.3 Usage & Scaling Characteristics (Illustrative)

| Characteristic | Free | User | Partner | Super |
|---------------|------|------|---------|-------|
| Base subscription model | None | Individual | Platform builder | Enterprise operator |
| Monthly allowances | Limited | Standard | Elevated | Highest platform limits |
| Capacity beyond the base allowance | Upgrade | Add-ons or upgrade | Additional seats or upgrade | Additional seats or written agreement |
| User management | Self | Self (1 seat) | Partner-managed (5 seats included) | Centralized multi-user control (45 seats included) |
| Execution scope | Own environment | Own environment and its connected accounts | Own environment and its connected accounts | Own environment and its connected accounts |

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

## 10. Community Standards and Acceptable Use

### 10.1 Community Standards

These rules are about what a Participant does, not the views they hold. BI does not remove content or close accounts for the opinions they express.

A Participant must not use the Platform, including anything they build, store, send or publish on it, to:
- Break the law, or host or share illegal content
- Infringe copyright, trademarks or other intellectual property, including piracy
- Attack people for who they are (hate speech)
- Threaten or harass anyone, or promote violence or terrorism
- Post, host or share sexual content involving minors
- Spread malware, or carry out phishing, fraud or spam
- Publish another person's private information
- Get around authentication, authorization, allowances or rate limits
- Abuse shared infrastructure, or interfere with other Participants' access
- Introduce malicious code or payloads, including through builds submitted to the marketplace

### 10.2 No Review, No Monitoring

BI does not review content before it is published and does not monitor what Participants build, store, send or publish. The one review BI makes is of a build a Participant chooses to submit to the builds marketplace (Section 7.2): the package submitted is reviewed before it is listed there. That review covers only the package submitted; it is not monitoring of what Participants build, and nothing else is reviewed before it is published. Each Participant is responsible for their own content and for what they publish. BI acts, at its discretion, when it learns of a violation, for example from a report.

### 10.3 What BI May Do

When BI learns of a violation of this Section or of the law, it may, at its discretion:
- Take down one or every site the Participant has published
- Suspend the account (Section 13.1)
- Close the account for cause (Section 13.4)

BI may also suspend or restrict access immediately to protect platform integrity, security, or availability.

### 10.4 Reporting a Violation

Anyone may report a published site, an account, or other content or conduct on the Platform that breaks these rules, with the Report a site form at the foot of pragoptics.com or by writing to support@bridgesindust.com.

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

Your email address is your identity on the Platform. A phone number is an optional channel for receiving verification codes and is never used as an identity; when the Billing section holds no phone number and none is given on the Licensing section, the owner's verified number is also given as the contact number of the business's Microsoft licensing account (Section 4.8). BI may require a phone number to be verified again at any time, for example after a period of inactivity, a change in carrier records, or when the number is verified on another account; until it is verified again, codes are delivered by email only. Verifying a phone number on an account makes it that account's number. Phone number changes are rate limited and may be paused for review.

When a Participant registers a domain through BI (Section 4.7), the contact details they supply for it are shared with the registrar and the registry as the domain's registrant contacts, and the Participant's acceptance of the registrar's agreements is recorded with the time and network address. The Participant is responsible for keeping those contact details current, because the registrar sends verification and renewal notices to them and an unverified registrant email can suspend a domain under ICANN rules.

When a Participant opens Microsoft licensing (Section 4.8), the business's name and contact details are shared with Microsoft's authorized distributor, and the name and email address of the person who accepts the Microsoft Customer Agreement are shared with Microsoft, as the Privacy Policy describes.

---

## 12. Availability, Maintenance & Dependencies

PragOptics is designed for resilience and stateless operation but is **not** provided with a guaranteed availability level unless expressly agreed in writing.

### 12.1 No SLA by Default

BI does not guarantee uninterrupted or error-free service.

### 12.2 Third-Party Dependencies

Platform operation depends on third-party providers (including cloud infrastructure, identity providers, payment processors, domain registrars and registries, AI model providers, and the providers behind connected accounts). Outages or changes in those services may impact PragOptics. A registrar or registry may decline or delay a registration, renewal, or transfer under its own rules; BI passes the provider's answer to the Participant and refunds any registration the registry did not accept.

---

## 13. Suspension & Termination

### 13.1 Suspension

BI may suspend access for:
- Non-payment, including a failed renewal charge
- Security concerns
- A violation of Section 10 or of the law
- Platform protection requirements

Suspension is reversible. A suspension for a violation of Section 10 or of the law ends every session of the account at once, and the account cannot be signed in to until BI lifts it. It also suspends the account's environment for its whole team until then: no team member can use the environment, its API keys are refused, and the forms on its published sites take nothing. The published sites themselves stay up unless BI also takes them down (Section 10.3). Suspension does not pause billing: a paid subscription on a suspended account continues to renew until it is canceled or the account is closed.

### 13.2 Termination

Either party may end participation. A Participant ends a paid subscription by canceling it (Section 5.5); service continues to the end of the paid period and then ends, subject to the billing terms in Section 5.

Termination does not relieve responsibility for accrued charges.

### 13.3 Account Closure

A Participant may close their account at any time from the account's Profile section. Closure is permanent and takes effect immediately: sign-in credentials are deleted, any active subscription ends at once with no refund for the remainder of the paid period (Section 5.6), and access to provisioned resources ends. Every site published from the environment the account owns comes down at every closing, whoever closes the account and for whatever reason, on the live and sandbox lanes: the published files are deleted, a website address of the environment's own is switched off, and nothing can be published again. A Participant who wants service through the end of a paid period should cancel the subscription first (Section 5.5) and close the account after the period ends.

Microsoft licenses bought through BI end on the Platform when the account closes. A license under a commitment (for example a yearly term) is committed at Microsoft to the end of that commitment, so before the owner confirms the closing, the closing screen shows what remains of each commitment, including the term of the mailboxes included with an annual plan, and that amount, with sales tax and anything still owed under Section 4.11, is charged on the Participant's final bill to the payment method on file. BI never absorbs it. If that charge does not go through, the account is not closed, whether the owner or BI is closing it; a closure for cause is the one exception (Section 13.4). Microsoft keeps each such license until the earliest date its rules allow. A Microsoft tenant BI created is handed over as Section 4.8 says.

Participants are responsible for exporting any data they wish to keep before closing, using the download in the account panel's Environment section. BI retains order, billing, and audit records as required for accounting, tax, and legal purposes.

Closing an account does not delete a domain registered through BI; Section 4.7 governs what happens to it, and a Participant who wants to keep the domain should request transfer-out before closing. Closing an account deletes every stored credential for connected accounts (Section 4.8); the accounts themselves remain the Participant's at their providers.

BI may close an account for the reasons listed in Section 13.1, with the same effect. A closure for a violation of Section 10 or of the law is a closure for cause under Section 13.4.

### 13.4 Closure for Cause

BI may close an account for cause: a violation of Section 10 or of the law. Closure for cause carries no refund (Section 5.6). As soon as BI decides on it, the account is suspended and every site it has published is taken down. As in any closure (Section 13.3), sign-in credentials and the stored credentials of connected accounts are deleted, every published site stays down with its files deleted, the remaining commitment of any Microsoft license is charged on the final bill, a domain registered through BI follows Section 4.7, a Microsoft tenant BI created is handed over under Section 4.8, and BI keeps order, billing, and audit records as required. If the final charge does not go through, the account is closed all the same and the amount remains owed to BI.

---

## 14. Changes to Platform & Terms

### 14.1 Platform Evolution

PragOptics is an evolving platform. BI may add, modify, deprecate, or replace features.

### 14.2 Agreement Updates

BI may update this Agreement to reflect platform, security, operational, or regulatory changes.

When BI makes a material change to this Agreement, it emails the owner of every environment on the Platform, whatever their notification settings, naming the new Version. Each owner is emailed once for each such Version. Price changes follow Section 5.7. Continued use after the new Version takes effect constitutes acceptance of the updated Agreement.

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
Website: **[bridgesindust.com](https://bridgesindust.com)**  
Support: **support@bridgesindust.com**
