# Archive

A copy of your environment's work, in a repository on your own GitHub account. It is yours to keep wherever you keep things, and it is how your work leaves PragOptics whole, on a press or on a schedule.

## What goes

```flow
Projects | Every project and its latest draft, one file each under projects/.
Tables | Every table with its policy and every row, up to 20,000 a table, under tables/.
Files | Every file up to 5 MB, 60 MB in all, under files/, with files-index.json naming every file whether it went or not.
Installs | modules.json: each installed build, its settings, its doors. Never a secret.
Connected accounts | connections.json: which accounts are connected and their state. Never a credential.
```

## How it runs

```flow
Set it | The owner picks the GitHub account (connected under Connected accounts), names the repository, and chooses off, daily or weekly. A repository that is not there yet is created, private, under that account.
On a press | Archive now sends one commit, then and there, for the lane you are looking at. Owners, admins and Live Agents may press it.
On the schedule | Daily runs each night, weekly runs once a week, for the live lane, with no one pressing anything.
```

## What it never does

It never deletes anything in the repository. Each archive is one commit on top of the branch: files are added or replaced, and anything you put there by hand stays.

It never carries a credential. The token that pushes is the one on the connected account, read from the vault at the moment of the push and never written anywhere.

It never reaches a repository that is not yours to write. A missing repository is created only under the connected account; one under another owner has to exist already and be writable by the token.

## If it fails

The card shows the last run with the reason in words: a token GitHub refused, a repository that is not there, GitHub out of reach. Fix the named thing and press Archive now.
