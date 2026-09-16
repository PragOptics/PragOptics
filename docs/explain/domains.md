# Connecting a domain

A domain you own can serve what you build here. There are three ways in, and the same proof of ownership stands behind each.

## Three ways in

Connect a domain you already own, wherever it is. You add one TXT record at your registrar and the platform reads it back. The platform never needs your registrar login, and you keep managing the domain's records yourself.

Link the registrar account that holds the domain. If your domain is at GoDaddy, connect that account once under Connected accounts, then link the name on the Domains card. The platform checks the name is really in that account, writes the proof record itself, and from then on writes every record the name needs: the ones that serve your site, and later the ones that carry your mail. Nothing to paste.

Register a new name here. If you do not have a domain yet, the card registers one for you at the registrar's own price, with its records kept by the platform.

## How it goes

```flow
Connect | Type the name, e.g. www.example.com. You get one TXT record to add at your registrar: a name and a value.
Prove | Add that record where you manage the domain's DNS, then press Verify. The platform reads the record back. That is the whole proof of ownership.
Point | Once the software is hosted, the card shows two more records that send visitors to your site, and a Bind button. Press it and the platform issues a certificate and serves your site at the name. Until then there is nothing else to do.
```

## Where the record goes

At whoever holds your domain's DNS: your registrar, or a DNS service if you moved it. Look for DNS settings, DNS records, or zone editor. Add a record of type TXT with the name and value the card shows. Some registrars want only the part before your domain in the name field; the card's name is the full record name.

DNS changes usually show within minutes and can take up to an hour. Verify checks the record now, and the platform checks again once a day, so a record you add later is found without pressing anything.

## What can go wrong

The record is not there yet. Wait a little and press Verify again.

A record exists but carries a different value. Compare it with the card; the value must match exactly.

The name is already connected to another environment. One environment holds a name at a time. Remove it there first.

A verified domain whose record later disappears is marked failed after three daily checks. Put the record back and press Verify.

## Letting PragOptics manage the domain's settings

The fourth way in, for a domain you already own anywhere. Type it and press Manage its DNS here. The platform looks the domain up, copies every record it can find (its own lookups, the DNS host's scan, a zone file you paste, names you add), and shows you the copy as plain rows: Website, Email, Verification, Other. Nothing has changed for the domain at this point.

When you press Switch, the platform points the domain at its own DNS. For a name registered through PragOptics at Spaceship, or held in a Spaceship account you connected, it does that itself. Otherwise it shows you two lines to paste where your registrar says nameservers, and you press I did it. The card reads Checking until the internet answers from PragOptics, usually minutes, sometimes up to a day, and everything keeps working while you wait. Then it reads DNS managed here, and email, your website and the software's address are set from the card from then on. The domain itself stays where you bought it; nothing is transferred and nothing is charged.

A domain bought through Microsoft 365 cannot be moved: Microsoft does not allow its nameservers to change. The card says so, and the platform keeps giving you the records to add there.

Hand DNS back any time. The platform refuses while the domain still answers from it, so nothing breaks: set the old nameservers again first (the card shows them), wait for the change, then hand it back. The copy at the platform's DNS host is removed.

## Serving your site at the name

Once the software is hosted, a verified name gets two more records on the card: a TXT record at asuid.your-name that proves the name to Azure, and a record that points the name at the software: a CNAME for a name like www.example.com, an A record for example.com itself. Add both where you manage the DNS, then press Bind.

Binding puts the name on the software and asks Azure for a certificate. The card reads certificate pending while Azure issues it, usually a few minutes; press Check, or wait, since the platform checks nightly. When it is done the card reads serving, and https://your-name opens your site with a certificate that renews on its own.

If a record is missing, Azure says so and the card shows the sentence. Fix the record, give DNS a few minutes, and press Try again. Unbind takes the name off the software and keeps it connected and verified, so Bind puts it back any time.

A name registered through PragOptics, or linked through your registrar account, needs none of this by hand: the platform writes the records itself and binds the name within a day, or at once when you press Bind.

## Linking your registrar

Linking is for a domain you hold at a registrar the platform can manage: GoDaddy today. Connect the GoDaddy account under Connected accounts with an API key and secret from GoDaddy's Personal Access Tokens page. The key is checked with GoDaddy and kept in your own vault; it is never shown again.

On the Domains card, pick that account, type the name and press Link. The platform asks GoDaddy whether the name is in the account and whether GoDaddy serves its DNS. A name that points at nameservers elsewhere cannot take records from GoDaddy; the card names them, and you either point the name back at GoDaddy's own nameservers or connect it with a TXT record instead.

The platform then writes the proof record itself and reads it back. Usually the name reads verified at once; if DNS needs a moment, press Verify in a minute or leave it, the platform checks daily. A name you connected earlier by TXT can be linked the same way and keeps its place.

Unlink hands the records back to you. The name stays connected and verified, and nothing at GoDaddy is changed. If the connected account is removed, the card says so; link the name through another account or unlink it and manage its records yourself.

## Registering a new one here

If you do not have a domain yet, the card registers one for you. Type the name you want; the card says whether it is free, what the registrar charges for the first year and what it renews at. That price is passed through with no markup: you pay what the registrar charges, plus any sales tax, as an ordinary order on your account with a receipt. Your name and address go to the registry as the domain's contact; that is what makes the domain yours.

The registry records a contact for every domain: a name, an email, a phone number and a mailing address. The card takes those from the billing details you already gave, and you can edit them if the domain should be registered to someone else. The domain is registered in your name, not ours. Privacy protection is on, so the public record shows the registrar's proxy instead of your details.

Registration takes a few minutes. The domain then appears on the card as verified, with its DNS held by the platform at the registrar under your account, so nothing needs pointing anywhere. It renews yearly at the same price unless you turn renewal off. If the registry cannot complete a registration, nothing is registered, you get an email, and support refunds the charge in full.

## What it costs

Connecting your own domain is free on every paid plan. Registering a new domain through PragOptics passes the registrar's price through with no markup, and the domain is yours.
