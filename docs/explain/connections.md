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

If you do not have a Stripe account, the card opens one for you. Press Set up Stripe through PragOptics, add your business name if you like, and you are handed to Stripe's own setup pages: your details, your bank account, Stripe's terms. When you come back, the card reads the account's state from Stripe: setup incomplete, in review, or active.

The account is yours. You sign in to it at dashboard.stripe.com like any Stripe account, you pay Stripe's fees, Stripe collects your details and bears the risk on payments, and the platform is never in your money. No credential is stored for it: the platform acts on it through Stripe's platform program with the account's id, and only for what you ask from the software. Remove takes the connection off this environment and leaves the account with you.

Continue setup opens a fresh Stripe setup page whenever Stripe still needs something from you; the link it uses is single use and expires in minutes, so it is never emailed. Check status asks Stripe for the account's state again.

## What is not here yet

A database of your own (a Postgres connection string) arrives with the database adapter, once the platform can prove such a string works before storing it. Every provider on the card today is checked for real before it is saved.
