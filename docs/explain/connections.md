# Connected accounts

Your environment acts through accounts you already hold: Twilio for text messages, Shippo for shipping labels, Stripe for taking payments, GitHub for your code, Microsoft 365 for mail and your directory. Connecting one means handing the platform that account's credential exactly once. From then on the platform uses it on your behalf, and you never see or type it again.

## How a connection is made

```flow
Pick the account | Choose the provider and give the connection a name you will recognise, like "Shop SMS" or "Live payments".
Paste the credential | The fields come from the provider: an Account SID and auth token for Twilio, a secret key for Stripe, a token for GitHub. Secret fields are typed hidden.
It is proven first | Before anything is stored, the platform makes one read-only call to the provider with that credential. If the provider rejects it, nothing is saved and you are told why.
It is locked away | An accepted credential goes into a vault that belongs to your environment alone. Only a four-character hint stays on the card so you can tell connections apart.
```

## Where the credential lives

Each paid environment gets its own Azure Key Vault, made the first time you connect something. Your credentials sit behind their own boundary: nothing shared with any other customer, and closing your environment removes the vault whole.

The credential is never in a page, a response, a log, or the audit trail. Your browser never holds it. When the platform needs to send a text or buy a label as you, it reads the vault itself and calls the provider; that is the whole point of a vault.

## Test and remove

**Test** asks the provider again with the stored credential. If you rotated a key at the provider, the card reads rejected with the provider's own reason, and you reconnect with the new one.

**Remove** deletes the credential from the vault, then the connection. Anything that was using it stops on the next call.

## Who can connect

The owner and admins connect, test and remove. Everyone on the team can see what is connected, by name and hint only. Connected accounts are part of a paid plan: Free has no environment and no vault.

## A Stripe account set up through PragOptics

If you do not have a Stripe account, the card opens one for you. Press Set up Stripe through PragOptics, add your business name if you like, and you are handed to Stripe's own setup pages: your details, your bank account, Stripe's terms. When you come back, the card reads the account's state from Stripe and says it in plain words: setup incomplete (Stripe has not received your details yet), action needed (Stripe wants something, and the row names it, with the deadline when Stripe gives one), in review (Stripe is verifying what you gave, nothing to do until it answers), payments on (you can take payments while payouts wait on one more thing), or active (payments and payouts both on). Active means Stripe has verified you; the card never says it before Stripe does.

The account is yours. You sign in to it at dashboard.stripe.com like any Stripe account, you pay Stripe's fees, Stripe collects your details and bears the risk on payments, and the platform is never in your money. No credential is stored for it: the platform acts on it through Stripe's platform program with the account's id, and only for what you ask from the software. Remove takes the connection off this environment and leaves the account with you.

## Twilio: your own account, authorized to the platform

Twilio works the other way round from Stripe: the platform does not open a Twilio account for you. Twilio's rule is that you connect an account you already have, and it must be an upgraded one. Press Connect your Twilio account, sign in at Twilio, and approve PragOptics on Twilio's own authorization page. Twilio then creates a subaccount for the platform inside your account and sends you back here. The platform sends messages and buys numbers on that subaccount with its own credentials, never yours, and Twilio bills you directly for what it does. Your token is never handed over.

The row reads connected, not authorized, declined, suspended or disconnected, in Twilio's words. Check status asks Twilio again. Revoke the authorization in your Twilio Console at any time; Twilio tells the platform, the row reads disconnected, and Remove clears it. Connect again reopens Twilio's page.

## Shippo: your own account, created or signed into at Shippo

Shippo works like Stripe. Press Connect your Shippo account and Shippo's own page signs you in, or creates your Shippo account right there if you have none, takes your billing details, and asks you to approve PragOptics. You come back with the account connected. The platform holds an access token Shippo issued for PragOptics, in this environment's vault, never shown, and buys labels on your account with it. Shippo bills you directly for every label, and the account is yours in Shippo's dashboard. Check status asks Shippo again; if Shippo no longer accepts the platform's access, the row reads disconnected, and Remove clears it.

Continue setup shows only while Stripe still needs something from you and opens a fresh Stripe setup page for exactly that; the link it uses is single use and expires in minutes, so it is never emailed. Check status asks Stripe for the account's state again, and Stripe also tells the platform on its own whenever the account changes, so a review that takes days shows up on the row when Stripe decides, without you pressing anything. If you disconnect PragOptics from inside your Stripe Dashboard, the row says so; Remove clears it, and the account stays yours. Stripe's own messages come through as Stripe wrote them when a verification fails, so you see the same reason Stripe would show you in its Dashboard.

## A Shopify supplier: their store, connected to your environment

Drop shipping without a middleman. Your store is here on PragOptics; your supplier already runs a Shopify store. Type their store address on the card and press Make the link for your supplier. Send them the link. They open it, see what PragOptics asks for on their own store (read products, write orders, read fulfillment), and approve. The row reads connected, and Sync products copies their catalog into this environment as plain rows, ready to put on your site.

The supplier's store stays theirs and your relationship with them stays yours: their prices, their charges, their shipping and returns, agreed between you and them the way they always were. The platform is never in the money. What the platform holds is the access the supplier granted, in this environment's vault, and it uses it only to read their products and, later, to hand them your orders and bring tracking back. Remove deletes that access and the copied products. Two customers of the same supplier hold two separate approvals.

Nobody needs a Shopify account on your side: not you, not PragOptics. Only the supplier is on Shopify.

## What is not here yet

A database of your own (a Postgres connection string) arrives with the database adapter, once the platform can prove such a string works before storing it. Every provider on the card today is checked for real before it is saved.
