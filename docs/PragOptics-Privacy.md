# PragOptics™ Privacy Policy

**Version:** 2026-09.2  
**Effective Date:** Upon publication

---

## 1. Purpose of This Policy

This Privacy Policy describes how **Bridges Industrial LLC** (“BI”) collects, uses, processes, and protects information in connection with the **PragOptics™ Platform** (“PragOptics” or the “Platform”).

PragOptics is a programmable control plane designed to orchestrate authentication, APIs, automation, workflows, messaging, deployment, billing, and data routing across multiple systems and environments.

This policy applies to all individuals and entities that access or use PragOptics, regardless of role, subscription tier, or operating context.

---

## 2. Information We Process

PragOptics processes information that falls into the following categories.

### 2.1 Account and Identity Information

Depending on configuration and role, this may include:
- Usernames, email addresses, or other identifiers
- Authentication-related metadata
- Role assignments and permission mappings
- Tenant or account identifiers
- A record of each notice of a change to the Platform Agreement sent to the account: the Version, the address it went to, and when

PragOptics does **not** require or process government-issued identification by default.

---

### 2.2 Platform Usage and Technical Data

We collect operational and technical data necessary to operate the Platform, including:
- API request and response metadata
- Timestamps, request identifiers, and routing context
- Execution logs and error traces
- Rate-limiting and abuse-prevention signals
- Deployment and configuration state

This data is used for security, debugging, billing, auditability, and platform reliability.

---

### 2.3 Content and Payload Data

Depending on how the Platform is used, PragOptics may process content or payloads supplied by Participants, including:
- API request payloads
- Messages routed through automation or messaging workflows
- Structured records stored in platform-provisioned storage

PragOptics processes such data **only as instructed by configured workflows and routing rules**.

---

### 2.4 Messaging and Communication Data

If enabled by the Participant, PragOptics may process messaging-related data, such as:
- SMS, voice, or email delivery instructions
- Originator and destination identifiers (e.g., phone numbers or addresses)
- Delivery status, error codes, and timestamps

PragOptics does not operate its own telecommunications network. Messaging delivery relies on third-party communication service providers selected by BI or integrated by Partners.

---

### 2.5 AI Questions and Knowledge

When a Participant or a visitor to a Participant's site uses an AI feature, PragOptics processes:
- The question asked and the recent turns of that conversation, which the asking browser holds and sends with each question
- The excerpts of the Participant's own knowledge files chosen to answer it
- A count of answers per assistant and their cost, kept for caps and billing

PragOptics stores no conversation. The question, the recent turns and the chosen excerpts are sent to the model provider that answers (Section 6) and are not kept by PragOptics after the answer. A message an assistant files on a visitor's behalf is stored in the Participant's own submissions table, like a message sent through a form, and is the Participant's data.

---

### 2.6 Microsoft Licensing

When a subscriber opens Microsoft licensing on the Licensing section, PragOptics sends Microsoft's authorized distributor what it needs to open the business's licensing account: the business's name, billing address, phone number and website, and the name, email address and phone number of the account's contact. The phone number is the one on Billing; when Billing has none, the one given on the Licensing section, or else the mobile number verified on the owner's Profile.

When someone on the team accepts the Microsoft Customer Agreement, their first and last name and email address, taken from their PragOptics account, and the date they accepted are sent with the business's orders so that Microsoft can record the acceptance. Microsoft may email that person to confirm it.

Each order also carries the Microsoft tenant's name or ID and the licenses and quantities ordered. When a team member is given a mailbox, their name and email address are used to create their account in the business's Microsoft tenant. The distributor and Microsoft handle this information under their own terms.

When the owner asks for an administrator account in a Microsoft tenant BI created, the account's first password, which BI's operator types once from Microsoft's page, is kept in the environment's own vault only until the owner sees it once in the Licensing section; it is then deleted. It is never sent by email and never written to a log or an audit record.

---

### 2.7 Connected Accounts

When a Participant connects an account they hold at another provider (Platform Agreement, Section 4.8), its credential or approval is kept in a vault that belongs to their environment alone and is never shown again. Content read through a connected account is read on the Participant's instruction: through the Platform, or, for a file, by the Participant's own browser from a short-lived address the Platform gets from the provider. It is kept only where the Participant saves it in their environment.

---

### 2.8 Reports of a Site or an Account

Anyone may report a published site or an account that breaks the community standards (Platform Agreement, Section 10). A report keeps exactly this:
- Its reference number, and whether a site or an account is reported
- The site address or the account the reporter gave
- The environment, lane and site, or the account, it matched on the Platform, if any
- The kind of breach named, and what the reporter wrote
- The time it was sent
- The reporter's email address, when they give one
- When the reporter is signed in, their PragOptics account
- Once BI closes the report, what was done, when, and which of BI's operators closed it

The network address a report is sent from is used only to limit repeated reports and is not kept with it. BI's operators read the report to decide what to do, and keep it with the record of what was done. The owner of what is reported is not told of the report or of who sent it, only of an action BI takes. A reporter who gives an email address receives a receipt and may be asked about the report.

---

## 3. How We Use Information

We use the information described above to:

- Authenticate and authorize access
- Route, execute, and orchestrate API and automation workflows
- Provision resources and enforce subscription limits
- Monitor platform health and reliability
- Detect abuse, fraud, or security incidents
- Generate usage metrics and billing records
- Provide support and troubleshooting

We do **not** sell personal information.

---

## 4. Data Storage and Retention

### 4.1 Storage Architecture

PragOptics uses logical tenancy and isolated storage models. Data may be stored:
- In platform-managed storage
- In Participant-dedicated storage accounts
- In external systems explicitly delegated by the Participant

Storage location and duration depend on platform configuration and usage patterns.

---

### 4.2 Retention

Operational logs and metadata are retained for reasonable periods necessary to:
- Maintain platform integrity
- Satisfy audit and compliance requirements
- Resolve disputes or technical issues

Participants may implement additional retention or deletion logic through workflows or downstream systems.

---

## 5. Security Practices

PragOptics employs industry-standard security practices, including:
- Encryption in transit and at rest
- Role-based access controls
- Secret management systems
- Network and application-layer protections

No system can guarantee absolute security. Participants are responsible for safeguarding credentials, access tokens, and downstream integrations.

---

## 6. Third-Party Services and Subprocessors

PragOptics relies on third-party services to operate core platform functions, including:
- Cloud infrastructure and hosting
- Identity and access providers
- Payment and billing processors
- Messaging and communication delivery services
- AI model providers: BI's provider for answers paid from a plan's AI credit, or a provider the Participant connects on their own account, which then processes the question under its own terms
- Microsoft licensing: Microsoft's authorized distributor, which opens the business's licensing account and places its orders, and Microsoft, which provides the licenses, the tenant and the mailboxes under the Microsoft Customer Agreement
- The providers behind accounts a Participant connects, which act under their own terms

These providers process data only as necessary to deliver their services and are subject to contractual and security obligations.

PragOptics does **not** control how third-party services process data outside the scope of the Platform.

---

## 7. Partner and Delegated Processing

Partners using PragOptics to deliver services to third parties are responsible for:
- Disclosing their own data practices
- Obtaining required consents
- Ensuring lawful use of messaging, communications, and automation

BI acts as a platform operator, not as the controller for Partner-customer relationships.

---

## 8. Data Subject Rights

Depending on jurisdiction, individuals may have rights to:
- Access personal data
- Request correction or deletion
- Restrict or object to processing

Requests related to PragOptics-managed data may be submitted to BI.  
Requests related to Partner-managed data should be directed to the Partner.

---

## 9. International Use

PragOptics may process data across regions where the Platform or its providers operate.

By using the Platform, Participants acknowledge that data may be transferred and processed outside their country of residence, subject to applicable safeguards.

---

## 10. Changes to This Policy

BI may update this Privacy Policy to reflect platform changes, legal requirements, or operational practices.

Material changes will be communicated through reasonable notice. Continued use of PragOptics constitutes acceptance of the updated policy.

---

## 11. Cookies and Device Storage

PragOptics sets no cookies of its own and runs no analytics, advertising, or tracking. The site keeps a small amount of data in your browser's own storage so that it works. Nothing in this list is used to identify or follow you across other sites.

| What | Where | Why | How long |
|------|-------|-----|----------|
| Sign-in session | Session storage | Keeps you signed in while the tab is open | Until the tab closes or you sign out |
| Cart | Local storage | Remembers what you added to the cart | Until you empty it |
| Theme choice | Local storage | Keeps the light or dark theme you picked | Until you change it |
| Agreement acknowledgement | Local storage | Records that you accepted the Subscriber Agreement before creating an account | Until cleared |
| Step hand-offs | Session and local storage | Carries an order number to link, a prefilled email, a warranty code, or the page to return to between two steps of one flow | Cleared when the step completes |
| Plan prices | Session storage | Caches the public plan prices shown on the landing | Ten minutes |
| Storage notice | Local storage | Remembers that you have seen this notice | Until cleared |
| Operator tools | Local storage | Lane choice, catalog snapshots, and queued items for platform operators and developers only | Until cleared |

Two third parties may set cookies, each only on your own action:

- **Stripe** processes payments. Stripe's script loads only when you reach a payment step, where it sets its own fraud-prevention cookies. See Stripe's privacy policy at stripe.com/privacy.
- **YouTube** hosts the How-To videos. A video loads from youtube-nocookie.com only when you press play.

You can clear everything above at any time through your browser's site data settings. The **Cookies** link in the footer reopens the notice.

---

## 12. Teams

A subscriber can run a team on PragOptics and invite other people to it. When you invite someone, we store the email address you enter, the role you give them, and when the invitation was sent, accepted, withdrawn, or expired. The invitation email goes to that address and carries a one-time link that works for seven days. When a person joins a team, their existing PragOptics account is linked to it. We never create an account for them, and we never copy their password or sign-in factors anywhere.

Each team keeps an activity log of team changes: who invited, joined, left, or was removed, and changes to roles, seats, and limits. The team's owner and admins can read this log. Team information is visible to the members of that team and to PragOptics operators as counts and names for support and billing. It is never shown on the public site to anyone outside the team.

If you leave a team or are removed from it, your membership is closed. The team keeps the record that you were a member and when, as part of its log.

---

## 13. Contact

For privacy-related inquiries or requests, contact:

**Bridges Industrial LLC**  
Website: **[bridgesindust.com](https://bridgesindust.com)**  
Email: **support@bridgesindust.com**