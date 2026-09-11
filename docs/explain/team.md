# Teams, seats and roles

You sign in once. That one login can belong to any number of teams. A team is the account that pays: your own, if you subscribe, and any team that invited you.

## The roles, top to bottom

```ladder
Owner | Pays for the account and has the final say: names the team, assigns every role, and is the only one who can close it. There is exactly one.
Admin | Runs the team day to day: invites people, changes roles, removes members, watches usage. Never touches billing.
Developer | Builds on the platform: publishes routes, builds and automations, reads logs. Everything a member can do, plus that.
Member | A seat. Signs in, uses the team's apps and APIs, and can hold their own API keys.
Viewer | Reads. Sees what the team shares and takes no seat.
```

A person can only give a role below their own. An admin cannot make another admin, and nobody but the owner can hand out owner.

## What a seat is

A seat is one named person who signs in to work in the environment. Member, developer, admin and owner all sit in a seat. Viewers do not.

Every paid plan includes seats: User has one, yours. Partner includes five. Super includes forty-five. On Partner and Super you can add more, one at a time, at the per-seat price shown on the Billing page. Adding a seat takes effect now and is charged for the rest of the current period. Removing one takes effect at the end of the period, with no credit.

The bar on the Team page shows seats in use against what the plan carries. An invite that has not been accepted yet counts as pending, so you always know how many are spoken for.

## How people join

An admin or the owner sends an invite to an email address with a role attached. The invite is a single-use link that lasts seven days. The person opens it, signs in with their own login, or creates one, and lands on the team with that role. Nobody is ever added silently: the address on the invite has to be the one they sign in with.

## Allowances

The team's usage, API calls and storage, bills through the owner's plan. A manager can set a lower ceiling for one person, never a higher one than the plan allows. That is how a Partner keeps one client's build from eating the whole month.

## What stays separate

Team membership is visible to the team. The data in the environment is not visible to anyone outside it, and it is not visible on the public site, ever.
