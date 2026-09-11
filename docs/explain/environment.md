# Your environment and storage

Your environment is the private space the platform sets up for your account the moment a paid subscription settles. Nothing to configure, nothing to click. If a team existed before the subscription, the environment is that team, with the same members.

## What is in it

```flow
Data | Tables of values your apps and the software keep for you: settings, form submissions, records. Small things, read and written by key.
Files | Builds, images, exports. Anything too big for a data row lives here, in a container that only your environment can reach.
Keys | Credentials your own programs use to read and write the two above without a person signing in.
```

## Storage, and the bar

Every value and every file counts against your storage allowance. The bar on this page is the real number: it moves the moment something is written or deleted, and a nightly check corrects any drift.

When a write would push you past the allowance plus a small grace margin, it is refused and the message says how much is used and how much the plan carries. Nothing is deleted, ever, to make room; you free space, add the storage add-on on the User plan, or move up a plan.

## Who can reach it

Nobody outside your team. Inside it, a viewer reads and a seat writes. The public site never shows environment data.

## Where it physically lives

On the platform's storage in the region you signed up in, encrypted at rest, in a partition and a container that carry your environment's id and no one else's. A dedicated, separately keyed store is available later as an add-on for anyone who needs the isolation to be physical rather than logical.

## If the environment says PROVISIONING

Something in the setup did not finish, usually a store still being created. It completes on its own within minutes; if it does not, support can finish it from their side, and nothing you have is lost.
