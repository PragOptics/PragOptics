# Connecting a domain

A domain you own can serve what you build here. Connecting it is two short steps at your registrar, and the platform never needs your registrar login.

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

## Serving your site at the name

Once the software is hosted, a verified name gets two more records on the card: a TXT record at asuid.your-name that proves the name to Azure, and a record that points the name at the software: a CNAME for a name like www.example.com, an A record for example.com itself. Add both where you manage the DNS, then press Bind.

Binding puts the name on the software and asks Azure for a certificate. The card reads certificate pending while Azure issues it, usually a few minutes; press Check, or wait, since the platform checks nightly. When it is done the card reads serving, and https://your-name opens your site with a certificate that renews on its own.

If a record is missing, Azure says so and the card shows the sentence. Fix the record, give DNS a few minutes, and press Try again. Unbind takes the name off the software and keeps it connected and verified, so Bind puts it back any time.

A name registered through PragOptics needs none of this by hand: the platform holds its DNS, writes the records itself and binds it within a day, or at once when you press Bind.

## Registering a new one here

If you do not have a domain yet, the card can register one for you. Type the name you want; the card says whether it is free and what it costs for the first year. The price is Azure's own price for a domain, read from Azure's price list at the moment you check, passed through with no markup, and it is an ordinary order on your account with a receipt.

The registry records a contact for every domain: a name, an email, a phone number and a mailing address. That is the same at every registrar. Privacy protection is on, so the public record shows the registrar's proxy instead of your details.

Registration takes a few minutes. The domain then appears on the card as verified, with its DNS living in Azure DNS under your account, so nothing needs pointing anywhere. It renews yearly at the same price unless you turn renewal off. If the registry cannot complete a registration, nothing is registered, you get an email, and support refunds the charge in full.

## What it costs

Connecting your own domain is free on every paid plan. Registering a new domain through PragOptics passes the registrar's price through with no markup, and the domain is yours.
