# PragOptics™ Shopify Supplier Data Processing and Retention

**Version:** 2026-11.1
**Effective date:** Upon publication

This document supplements the [PragOptics Privacy Policy](PragOptics-Privacy.md) and Section 4.9 of the [Platform Agreement](PragOptics-Subscriber-Agreement.md). It describes processing by Bridges Industrial LLC (BI) for the PragOptics Shopify supplier connector. It does not change the supplier's commercial agreement with a retailer or authorize a new customer relationship.

## 1. Parties, instructions and approval

The Shopify store owner controls the supplier store. The PragOptics customer controls its own retailer environment. Each business is responsible for its lawful instructions, customer notices and commercial obligations. BI processes connector data to perform the operations those businesses authorize; it does not acquire their customer relationships or the right to use their personal data for unrelated purposes.

A supplier authorizes a named customer and environment through the supplier invitation. Approval permits catalog synchronization, explicitly reviewed supplier orders, and status and tracking for those orders. Installation alone does not authorize every PragOptics customer. Approval for one customer does not authorize another customer or environment. The supplier may revoke individual relationships from its portal; the retailer may remove its connection.

The supplier and retailer must have permission to share the products, order instructions and delivery details they supply. They must tell their customers about processing needed for fulfillment and respect applicable consent and deletion decisions. A participant must not send sensitive data that is unnecessary for an order.

## 2. Data, purposes and restrictions

| Data | Authorized purpose |
| --- | --- |
| Shopify store and installation identifiers, authorization credentials and relationship records | Authenticate the store, verify the supplier owner, and enforce the specific approval |
| Product titles, descriptions, images, variants, SKUs, prices and currency | Copy and refresh an approved supplier catalog in the retailer environment |
| Selected variant, quantity and supplied delivery instructions | Create the supplier order the retailer explicitly reviews and confirms |
| Saved supplier order identifiers, status and tracking | Identify the order created through that relationship and retrieve its fulfillment updates |
| Verified privacy-request selectors and limited processing receipts | Fulfill Shopify data-access and deletion requests, prevent unauthorized disclosure, and record completion or a need for operator assistance |

The connector requests the minimum API scopes needed for these operations. Access to Shopify customer names, email, phone and address fields is not included merely by enabling order metadata access. Delivery information deliberately supplied for a new order is sent to the supplier for that order. BI does not need the buyer's payment-card information for this connector.

BI does not sell connector personal data, use it for advertising, or make automated decisions about people with legal or similarly significant effects. Connector data is not used by BI to train general-purpose AI models. Any separately enabled AI or third-party workflow remains governed by the participant's instructions and the Privacy Policy; enabling a supplier relationship does not itself authorize those separate uses.

## 3. Confidentiality, security and service providers

BI limits access to authorized accounts and operational personnel who need it for the stated purpose. Environment permissions and the selected lane apply to retailer operations. Supplier owners authenticate through Shopify. PragOptics account MFA continues to apply to retailer accounts.

Connector requests use encrypted HTTPS transport. Stored platform data and protected credentials use the platform's encrypted cloud storage and secret-management services. Credentials are not displayed to customers or included in public documents or demonstration media.

Shopify, Microsoft's Azure infrastructure and the platform's configured transactional-email service process the information necessary to provide the connector and verified privacy notifications. Applicable provider terms and the Privacy Policy govern those services. BI does not grant other customers access to a supplier's data because they use the same platform.

## 4. Retention schedule

Retention is tied to the authorized purpose and the following events and periods. A retained business record is not permission to continue using a revoked supplier credential.

| Record | Retention and removal |
| --- | --- |
| Supplier authorization and installation credentials | Kept while required for an installed, authorized connection. Revocation ends the named relationship's access. Other approved relationships may continue using the installation. Uninstall and verified store-erasure handling remove applicable authorization and protected credentials. Cloud soft-delete or backup retention does not authorize continued use. |
| Mirrored catalog records | Kept for the approved catalog use. A successful refresh removes obsolete supplier products. Removing the retailer's connection removes its mirrored supplier catalog. A verified store-erasure request also removes the connector-managed records within its proven scope. |
| Supplier order identifiers, fulfillment status and tracking | Kept in the retailer environment for fulfillment, returns and necessary business records under the retailer's instructions. The retailer must delete them when those purposes end, subject to a lawful retention obligation. Verified customer or store deletion requests remove the matching connector-managed data. Merely revoking a supplier relationship does not erase a retailer's independent accounting or order records. |
| Privacy request selectors | Kept while necessary to verify and complete the request or resolve a processing exception. Selectors are cleared on verified completion. An unresolved request remains a restricted operator task; it is not a completed deletion. |
| Privacy report download authorization | Expires after 48 hours and is invalidated when a conflicting deletion request requires it. Expiration ends download access; it is not a claim that all request metadata has been deleted. |
| Privacy response deadline | Requests are tracked against a 30-day response deadline. Processing failures and ownership conflicts require operator resolution; they must not be silently treated as completed. |
| Completion and security receipts | Limited non-payload receipts are kept to establish request handling and prevent replay or reintroduction of deleted data. Personal selectors and the report download authority are removed on completion. |

BI reviews unresolved privacy work and any legal need to retain data. Where lawful retention prevents deletion, BI must identify the applicable obligation, restrict processing to that purpose and remove the data when the obligation ends. A participant's independently exported copies and data it sends to other systems require handling by that participant and the receiving system; the connector must not claim to erase copies outside its authority.

## 5. Customer requests and withdrawal

Customers should normally make requests through the merchant that collected their information. Merchants may contact **support@bridgesindust.com** for connector privacy assistance. BI verifies the requester and scope before disclosing or deleting records. Shopify's signed customer-data, customer-redaction and store-redaction requests are also handled through the connector's privacy process.

Reports are released only to a verified Shopify recipient. Ambiguous ownership, unavailable provider access or a blocked deletion is escalated for review. BI does not release another customer's environment or mark a failed erasure successful.

Ending one supplier relationship ends only that relationship's authority. It does not cancel another retailer's relationship, transfer a store, charge a buyer, or make BI the seller of the supplier's goods. Supplier-retailer product settlement remains separate from the free Shopify connector and from PragOptics platform subscriptions.

## 6. Agreement and contact

These processing obligations describe BI's commitments for the connector. Merchants must receive this document and the Privacy Policy as part of their connector onboarding or a documented agreement. An existing technical approval is not, by itself, proof that a merchant accepted a later version of these terms; BI must keep any required acceptance record separately.

For questions, processing instructions, deletion assistance or security concerns, contact **Bridges Industrial LLC — support@bridgesindust.com**.
