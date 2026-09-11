# Connecting a domain

A domain you own can serve what you build here. Connecting it is two short steps at your registrar, and the platform never needs your registrar login.

## How it goes

```flow
Connect | Type the name, e.g. www.example.com. You get one TXT record to add at your registrar: a name and a value.
Prove | Add that record where you manage the domain's DNS, then press Verify. The platform reads the record back. That is the whole proof of ownership.
Point | Once the software is hosted, the card shows one more record, a CNAME, that sends visitors to your site. Until then there is nothing else to do.
```

## Where the record goes

At whoever holds your domain's DNS: your registrar, or a DNS service if you moved it. Look for DNS settings, DNS records, or zone editor. Add a record of type TXT with the name and value the card shows. Some registrars want only the part before your domain in the name field; the card's name is the full record name.

DNS changes usually show within minutes and can take up to an hour. Verify checks the record now, and the platform checks again once a day, so a record you add later is found without pressing anything.

## What can go wrong

The record is not there yet. Wait a little and press Verify again.

A record exists but carries a different value. Compare it with the card; the value must match exactly.

The name is already connected to another environment. One environment holds a name at a time. Remove it there first.

A verified domain whose record later disappears is marked failed after three daily checks. Put the record back and press Verify.

## What it costs

Connecting your own domain is free on every paid plan. Registering a new domain through PragOptics passes the registrar's price through with no markup, and the domain is yours.
