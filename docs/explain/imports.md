# Import

An import reads a whole folder, or a whole repository, into records: every scanned page, photo and PDF in it goes through the document worker under a profile you chose, and comes out as rows of a table with the text, the fields, and a trace back to the file. It is how an archive room, a shared drive's worth of forms, or a repository of scans moves into your environment on one press.

## Before the press

```flow
Size it | Press See what will happen. Every entry is counted: the files that will be read, the ones left out and why (not an image or a PDF, or over 20 MB), the bytes, and about how many pages.
A first estimate | How long it should take and what it should cost, as a range, said as what it is: a first estimate from the file sizes. On platform credit the cost is the model's price a page; on your own account it is your provider's bill.
One press | Import starts the job. Nothing is read before it.
```

## While it runs

The platform works the job in slices, a few files at a time, minute after minute, with no one watching. After every batch it saves where it is, so a slice that dies loses nothing but the files in flight, and it recounts the timeline from what it has measured: seconds a file, cents a file, files a minute as they actually move. The card shows the files read, failed and skipped, the records made and how many wait for a person, the credit used, and the time left as a range that narrows as more is measured, with the basis it stands on: the sizes until a few files are read, then the files read. It is recounted every batch and never promises a finish it cannot measure.

You can pause, resume and cancel. A refusal that would meet every file the same way, such as empty credit, stops the job instead of burning the hours on it; the reason is on the card. When it ends, the roles your profile names get the summary by mail.

## Where it reads from

```flow
Files | A folder of this environment's files, uploaded on the Files card: a prefix of the names, or everything.
GitHub | A repository on a GitHub account connected under Connected accounts, a branch, a folder in it.
```

Data is data: these are the first two places. The reader behind the import is one interface, and more places plug into it.

## Where it goes

The lane you are looking at: a sandboxed import lands in the sandbox's tables and files, and nothing on live moves until you say so. The records are rows of the profile's table in the Data card; the archive takes them out again to your own GitHub, and the data API serves them to your programs.

## What it costs

Each file is one answer from your AI, as the Documents card charges it, nothing more for the import itself. The platform's own work per file is a few storage operations.
