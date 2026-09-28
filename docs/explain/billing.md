# Plans, seats and add-ons

Four plans. Free costs nothing and needs no card. User, Partner and Super are subscriptions, monthly or annual.

| Plan | Who it is for | Seats included |
|---|---|---|
| Free | Looking around, or you own the hardware | 1, you |
| User | One person's environment | 1 |
| Partner | You build for other people, with a team | 5 |
| Super | You run it at scale | 45 |

## What changes when, and what it costs

```flow
Upgrade | Takes effect now. You pay the difference for the rest of the current period.
Add seats | Now. Charged for the rest of the period, per seat.
Add an add-on | Now. Same rule as an upgrade.
Downgrade | At the end of the period. You keep what you paid for until then.
Remove seats or add-ons | At the end of the period. No credit.
Cancel | At the end of the period. Nothing refunds.
```

That last line is the whole policy: what you paid for, you keep until the period ends, and nothing refunds. It is in the Subscriber Agreement, section 5.

## Seats

Partner and Super can add seats beyond what the plan includes, at the per-seat price shown next to the stepper. A seat you add is billed with the subscription at the same cadence, and the annual price carries the same discount as the plan.

You cannot drop below the people already sitting in seats. If your team has seven in seats and the plan you are moving to carries five, Billing refuses the change and tells you exactly how many have to leave seat roles first. Move them to viewer on the Team page, then come back.

## Add-ons

Add-ons are for the User plan only: more storage, or more API calls. Partner and Super include their capacity, so when a User plan upgrades, its add-ons come off as part of the upgrade.

## The card on file

One payment method per account. Swap it any time; the next invoice uses the new one. If a payment fails, the plan stays active while the card is sorted, and the Billing page says so.

## Billing details

The name, business name, phone and address PragOptics bills. They start as what you gave when you subscribed; change them on the Billing details card. A business name is optional. When you give one, your invoices are made out to your business, and the Licensing tab fills it in as the name of your Microsoft licensing account, which the owner checks and confirms there. Invoices already issued keep the details they were issued with. Sales tax follows the billing address, so an address that cannot be placed for sales tax is not saved.

These are your details with PragOptics. The name your own customers see when they pay you comes from your own Stripe account, connected on Environment.

## What you see here

The allowance numbers on this page are the ones that apply to you, add-ons included. The bars show this month's API calls and storage against them. Connected domains are counted differently: the bar shows how many domains are connected now against your plan's number (none on Free, 5 on User, 20 on Partner, 50 on Super), and that number does not reset each month or have a grace margin. A number in documentation or on a plan card is informational; this page is the record.
