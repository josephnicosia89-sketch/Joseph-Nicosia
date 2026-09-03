# Morning-brief crawler: QuickBooks Desktop + Sales Order Inwork Report

This folder pulls the two sources behind the Empire Safe morning brief into
files Claude can read every morning:

| Source | Where it lives | How the crawler reads it |
|---|---|---|
| **Sales Order Inwork Report** (`Sales Order Inwork Report.xlsm`) | The original on the **Q: drive** network share (copies also sit in your OneDrive `Documents/Desktop/` and `Documents/`) | Straight from the Q: path (or its UNC path when the drive letter is not mounted). OneDrive copies are only used if you set `inworkFallbackSource` |
| **QuickBooks Desktop** company file | The Windows PC that runs QuickBooks | `quickbooks-export.ps1` talks to QuickBooks through its built-in qbXML request processor and writes `quickbooks-export.json` |

Every run writes to `data/brief/` **and** copies the same files into
`OneDrive/MorningBrief/`:

| File | What it is |
|---|---|
| `brief.md` | Human-readable brief: headlines, pipeline table, new / overdue / due-soon orders, payments, balances, Inwork-vs-QuickBooks mismatches |
| `latest.json` | Full structured brief (same content plus every merged order) |
| `brief-YYYY-MM-DD.json` | Dated snapshot (last 60 kept, local only) |
| `orders.csv` | Flat order list |
| `orders.json` | `{ orders: [...] }` in the shape the SafeTech dispatch app's *Pull New Orders* import accepts |

Why the copy to OneDrive matters: Claude's Microsoft 365 connector can read
`.md`, `.json` and `.csv` files but **refuses macro-enabled `.xlsm`
workbooks**, so it cannot read the Inwork report directly. Once the crawler
has published to `OneDrive/MorningBrief/`, Claude can pull `brief.md` and
`latest.json` into the morning brief with no extra access.

## One-time setup on the QuickBooks PC (short version)

1. Open QuickBooks Desktop with the company file, logged in as Admin.
2. Open **PowerShell** (Start menu, type PowerShell) and paste this one line:

   ```powershell
   irm https://raw.githubusercontent.com/josephnicosia89-sketch/Joseph-Nicosia/claude/quickbooks-inwork-crawler-t5f46e/crawler/bootstrap.ps1 | iex
   ```

   `bootstrap.ps1` downloads the code into `%USERPROFILE%\SafeTech`, runs
   `crawler\setup.ps1`, prints a status summary and waits for Enter. No admin
   rights are needed: Node.js is unpacked as a portable copy inside the folder.
3. Or do it by hand: download the branch ZIP from GitHub, unzip it anywhere, then

   ```powershell
   cd <that folder>
   powershell -ExecutionPolicy Bypass -File crawler\setup.ps1
   ```

   When QuickBooks shows the authorisation dialog, choose **"Yes, always; allow
   access even if QuickBooks is not running"**.

`setup.ps1` installs Node.js if needed, writes `crawler\config.json` for
`Q:\Sales Order Inwork Report.xlsm` (recording the network path behind Q:),
runs the QuickBooks export and the crawler once, and registers the 05:45 task.
The manual steps below do the same thing one piece at a time.

## One-time setup on the QuickBooks PC (manual)

1. Install [Node.js](https://nodejs.org) (LTS) if it is not already there.
2. Clone or copy this repository, then in its folder run `npm install`.
3. Copy `crawler/config.example.json` to `crawler/config.json` and set
   `inworkSource` to the report's path on the Q: drive. The report sits at the
   root of the share, so the default `Q:\\Sales Order Inwork Report.xlsm`
   (backslashes doubled inside JSON) is already correct. Also fill in
   `driveMap` with the UNC path behind Q: (find it with
   `net use` in a command prompt, e.g. `\\\\EMPIRE-SERVER\\Sales`). Scheduled
   tasks often cannot see mapped drive letters, so the UNC path is what keeps
   the 05:45 run working when nobody is logged in. Leave
   `inworkFallbackSource` empty unless you want the OneDrive copy used when
   the share is unreachable; when that happens the brief says so in its
   headlines.
4. Open QuickBooks Desktop with the company file as **Admin**, then run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File crawler\quickbooks-export.ps1
   ```

   QuickBooks pops up an authorisation dialog for *SafeTech Morning Brief
   Crawler*. Pick **"Yes, always; allow access even if QuickBooks is not
   running"** so the scheduled task can run unattended. If PowerShell reports
   that `QBXMLRP2.RequestProcessor` cannot be created, your QuickBooks is
   32-bit: run the same command with
   `C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe`.
5. Run the crawler once by hand and read the output:

   ```powershell
   node crawler\index.js
   ```

6. Schedule it (default 05:45 daily, before the brief):

   ```powershell
   powershell -ExecutionPolicy Bypass -File crawler\install-task.ps1 -Time 05:45
   ```

   The task runs `crawler\run-morning.cmd`, which does the QuickBooks export
   and then the crawler, logging to `data\brief\crawler.log`.

## Where the report is read from

`inworkSource` accepts, in order of preference:

1. A drive-letter path (`Q:\\...`) or UNC path (`\\\\server\\share\\...`) — the original.
2. If the drive letter is not mounted, the UNC path from `driveMap`.
3. `inworkFallbackSource`, if set (a OneDrive copy or sharing link).

The brief records which file it actually read in `sources.inwork.file`, and
`brief.md` prints it in the first line.

## Switching QuickBooks off

Create an empty file `crawler\quickbooks.off`. The daily task then skips the
QuickBooks export, `setup.ps1` writes an empty `quickbooksSource`, and the brief
says "QuickBooks: off". Delete the file (and re-run setup) to turn it back on.

```powershell
New-Item C:\Users\JoeN\SafeTech\crawler\quickbooks.off -ItemType File
```

## Running somewhere without the OneDrive sync client

Set `graph.clientId` in `crawler/config.json` to an Entra ID app registration
(platform *Mobile and desktop applications*, redirect
`https://login.microsoftonline.com/common/oauth2/nativeclient`, *Allow public
client flows* = Yes, delegated permission `Files.ReadWrite`). Then run
`npm run brief:login`: it prints a device code, you sign in once in a browser,
and the token is cached in `~/.safetech-crawler/`. From then on `node
crawler/index.js` downloads the report and uploads the brief via Graph.
`inworkSource` may also be a OneDrive/SharePoint sharing link or a
`graph:drives/{driveId}/items/{itemId}` id (the ids of both known copies of
the report are in `config.example.json` under `knownItems`).

Without QuickBooks on the same machine you can still feed the crawler a
QuickBooks report export: run *Reports → Sales → Open Sales Orders by
Customer*, export to Excel into `OneDrive/MorningBrief/`, and point
`quickbooksSource` at that `.xlsx`. The parser understands the
Type / Date / Num / Item / Memo / Amount / Open Balance layout.

## Wiring into the Claude morning brief

Already done: the scheduled Routine **"Morning brief"** (weekdays, 09:45 UTC)
reads `MorningBrief/brief.md` and `MorningBrief/latest.json` from OneDrive as
its source 2 and renders an "Inwork pipeline and QuickBooks" section, feeds
the COO scorecard, and reports the crawler's status in Feed status. Until the
crawler is installed and has published once, the brief says "Inwork/QuickBooks
crawler: not yet publishing" and continues from the existing 5:00 AM
"Morning Brief - New Sales Orders.csv" export. The full prompt is versioned in
`docs/morning-brief-routine-prompt.md`.

Timing: the scheduled task here runs at 05:45 local so the files are in
OneDrive well before the 09:45 UTC brief (05:45 Eastern).

## What the crawler computes

- **New orders**: SO date within `lookbackDays`, or an SO number that was not in
  yesterday's snapshot.
- **Overdue / due soon**: from the *Deliver By Date* column when it parses as a
  date (`8/27/24`, `1-01-26`, Excel dates). Values like `TBD` or `Mid-June` are
  kept as text and counted under *No deliver-by*.
- **Payments posted, status moves, completions**: by diffing against
  `data/brief/latest.json` from the previous run.
- **Inwork vs QuickBooks**: open SOs in one source but not the other, and order
  totals or paid-to-date that disagree by more than a dollar. QuickBooks
  paid-to-date is derived from invoices linked to each sales order.
- Status sections (`In Production`, `Service`, `Hold for Confirm`,
  `In Transit`, `In Storage/On Rental`, `Vault`) are detected from the section
  label rows in the report, and a truthy *Complete* column marks an order done.

## Development

```
npm test          # unit tests (parsers, brief builder, renderers)
npm run brief -- --inwork path\to\report.xlsm --qb path\to\quickbooks-export.json --out data\brief --no-publish
```

Files: `inwork.js` (report parser), `quickbooks.js` (qbXML JSON + report
export parser), `onedrive.js` (local sync folder / Graph), `brief.js`
(merge, diff, render), `index.js` (CLI), `quickbooks-export.ps1`,
`install-task.ps1`, `run-morning.cmd`.
