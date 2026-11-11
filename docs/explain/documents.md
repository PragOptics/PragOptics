# Documents

A scanned page, a photo of a form, a PDF of invoices: upload it to Files, and the document worker turns it into records you can search, sort, mail about and build on. It reads with whichever AI your environment uses, the same choice you made on the AI page.

## What it does with a file

```flow
Reads every page | The full text in reading order, printed or handwritten, stamps and tables included. What it cannot read it marks as illegible, never guesses.
Cuts a batch | When your profile says so, it finds where one document ends and the next begins: a cover sheet, a separator page, a barcode page, a new letterhead.
Classifies | Each document becomes one of the kinds you listed (invoice, application, delivery note), or "other".
Pulls out the fields | The fields you named, with their types: text, a number, a date, an email, a phone number, yes or no, a list.
Checks | A required field missing, a number that is not one, a date out of shape, a duplicate of a record already indexed, a read it is not sure of: the record is marked for a person, with the reason.
Indexes | One row per document in the table you chose, with the fields, the text, the page numbers, and a trace back to the file.
Tells the team | A summary to the roles you tick, from your own mailer. An AI Agent watching the table, and the approvals and mailers of your installs, take it from there.
```

## The profile

A profile is what you expect in a file. Give it a name, the table its records go to, the kinds you expect, and the fields to pull out, each with a type and, when it helps, a hint about where it sits on the page. Tick "Cut a batch into its documents" for a scanner's stack of mixed pages. Name a field to flag duplicates on, such as an invoice number. You can keep several profiles: one for invoices, one for applications, one for delivery notes.

## Searching

Type a word or two and every record whose text, title, kind, file name or fields hold all of them comes back, with the place in the text where the first word appears. The search reads the table itself; there is nothing to set up.

## What it costs and where it runs

Each file is one answer from your AI on the model the profile picks: on platform credit the price of that model's answer, on your own account your provider's rate. A file is read whole, 20 MB at most, 20 files at a time, on the lane you are looking at. The file never leaves your environment except to the provider that reads it, under the choice you made on the AI page.

## What it never does

It never changes a record on its own, never answers anyone, never deletes a file. It reads, checks and indexes; the people on the team decide.
