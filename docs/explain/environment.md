# Your environment and storage

Your environment is the private space the platform sets up for your account the moment you sign in for the first time. Nothing to configure, nothing to click. On Free it lives in a private partition of the platform's shared storage, with the Free allowance. On a paid plan it moves to storage of its own the moment the subscription settles, and if a team existed before the subscription, the environment is that team, with the same members.

## What is in it

```flow
Data | Tables of values your apps and the Studio keep for you: settings, form submissions, records. Small things, read and written by key.
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

## Sandbox and live

A paid environment has two lanes. **Live** is what your programs and your customers use. **Sandbox** is a second environment of your own: its own storage account, its own vault, its own connected accounts. You build and test in the sandbox with test keys, and nothing you do there touches live. When you are ready, the software pushes your work live.

The owner sets the sandbox up from the Environment section with one click; its storage account takes a moment to create and finishes on its own. Once it exists, everyone on the team can switch between Live and Sandbox at the top of the section.

Connected accounts never move between lanes on their own. A test key you connect in the sandbox stays in the sandbox's vault; live gets its own live keys, entered separately. That is the whole point: a test credential can never end up serving your customers.

Domains serve the live site, so they show on the Live lane only.
