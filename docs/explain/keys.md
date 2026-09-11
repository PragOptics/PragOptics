# API keys

A key lets a program use your environment without a person signing in. A script, a build server, a device, or your own published site cannot open a password and a second step; a key is the credential those things can hold.

## What a key can do

```flow
Make one | From this card, with a label so you remember what holds it. The key is shown once. Copy it then; we keep only a fingerprint.
Use it | Send it with a request as the x-api-key header. The platform treats the request as you, in this environment, reading and writing data and files.
Revoke it | The moment you suspect a leak. Every call with it stops on the next request.
```

## What a key cannot do

It never manages the team, the plan, the card, or other keys. So a leaked key cannot invite anyone, change a plan, or make more keys.

It acts as the person who made it, never above them. If you are a viewer, your key reads. If you leave the team or are suspended, every key you made stops with you.

It belongs to one environment. Naming another team with it is refused.

## What it costs

Every call with a key counts against the environment's API allowance, and every byte it writes against the storage allowance, the same as if you had done it signed in. That is what the API add-on and the higher plans carry.

## Keeping it safe

Treat a key like a password: environment variables, secret stores, never source code. Make one key per thing that uses it, so revoking one does not break the others. The list on this card shows when each key was last used, which is the quickest way to spot one that should not be.
