# Empire Safe — Production Queue: Deployment

The `productionqueue/` folder is the **site root** for
`productionqueue.empiresafe.com`. Upload its contents to the subdomain's web
root over FTP. HTTPS is already enforced at the server (Let's Encrypt). Server
runs PHP 8.2.

```
productionqueue/            → site root (upload everything below)
├── index.html              the checklist app (same-origin fetch to /api)
├── .htaccess               HTTP Basic Auth for the whole site
├── api/
│   ├── _common.php         shared helpers (dir, filename safety, JSON)
│   ├── save.php            POST a record  → writes /records/SO<n>_v<N>.json
│   ├── list.php            GET record metadata for Browse Records
│   └── load.php            GET ?file=<name> → full record JSON
└── records/
    └── .htaccess           deny-all (records are never served directly)
```

`records/` also gets created automatically by `save.php` on first save if it
doesn't exist, and `save.php` re-writes the deny-all `.htaccess` inside it — so
the lockdown holds even on a freshly created directory.

---

## 1. Create the login (you do this — credentials never go in this repo)

Basic Auth is applied site-wide by `.htaccess`. You must create the password
file yourself so real credentials never pass through chat or get committed.

On a machine with Apache tools (or use any online htpasswd generator):

```
htpasswd -c /path/to/.htpasswd inspector
```

- `-c` creates the file (omit `-c` when adding more users later).
- Upload the resulting `.htpasswd` via FTP.
- Then edit `productionqueue/.htaccess` and set `AuthUserFile` to the **absolute
  server path** of that `.htpasswd` (ask your host for the absolute path to your
  web root if unsure — often something like
  `/home/<account>/productionqueue.empiresafe.com/.htpasswd`).

The `.htaccess` already blocks `.ht*` files from being served, so the password
file can live in the web root safely.

## 2. Records directory permissions (FTP-owner gotcha)

FTP-created folders are often owned by a different user than the one PHP runs
as. `save.php` creates and verifies the directory and returns a clear JSON error
if it can't write. If you see "records directory is not writable", set the
`records/` folder permissions to **0775** (or 0777 on strict shared hosts) via
FTP.

## 3. `post_max_size` (photos are base64 in the JSON body)

Records are sent as **raw JSON** (`application/json`) via `php://input` — not
multipart — so `upload_max_filesize`/`$_FILES` are irrelevant. The setting that
matters is **`post_max_size`**.

- **Recommended `post_max_size = 25M`** (and `memory_limit` ≥ `128M`).
- The app enforces its own cap of **20 MB** (`MAX_REQUEST_BYTES` in
  `_common.php`) and returns **HTTP 413** with a JSON error above that. Keeping
  the app cap (20M) below `post_max_size` (25M) means the script returns a clean
  413 instead of PHP silently dropping an oversized body.

If you can't change `php.ini`, most hosts honor a `php_value post_max_size 25M`
line in `.htaccess` (or a `.user.ini` with `post_max_size = 25M`).

## 4. Re-save / versioning behavior

Configured as **auto new version**: saving the same Sales Order writes the next
`_vN` file and keeps every prior one (full history; nothing overwritten). To
change this later, adjust the version logic in `save.php`.

## 5. Smoke test after upload

1. Open `https://productionqueue.empiresafe.com/` → enter the Basic Auth login.
2. Fill a Sales Order #, tap **SAVE TO SERVER** → toast shows `SO…_v1.json`.
3. Tap **Browse Records** → the record appears; tap it to load it back.
4. Confirm `https://productionqueue.empiresafe.com/records/` returns
   **403 Forbidden** (records are locked down).
5. Tap **Run System Check** → "Server connection" line shows reachable + signed
   in.
