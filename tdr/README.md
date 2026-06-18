# Empire TDR Checklist — Tablet App

Two ways to run the same checklist. The checklist body is identical; the only
difference is how it's delivered.

| Artifact | Use when |
| --- | --- |
| `Empire_TDR_Checklist.html` | A single self-contained file. No hosting, no setup. Open it in Chrome on the desktop or tablet. |
| `hosted/` bundle | A true installable, full-screen app. Drop it on any **https** web address. |

`hosted/` is generated from the single file — run `python3 build-hosted.py`
after any change so the two stay in sync. Do not hand-edit `hosted/index.html`.

## Sending finished checklists to OneDrive (Power Automate)

The big green **SEND TO OFFICE** button posts each checklist to a Power
Automate flow that writes it into
`OneDrive - Empire Safe Company Inc\Logistics - Documents`. This works from
**both** the single file and the hosted version, on desktop and tablet.

Set it up once (exact steps are in the app's **Setup & Help** screen):

1. make.powerautomate.com → **Create → Instant cloud flow** → trigger
   **When an HTTP request is received**.
2. Add **OneDrive for Business → Create file**:
   - **Folder Path:** `/Logistics - Documents`
   - **File Name:** expression `json(triggerBody())?['fileName']`
   - **File Content:** the trigger **Body** (`triggerBody()`)
3. Save, copy the **HTTP POST URL**, and paste it into the app's
   **Setup & Help** screen.

Until that URL is saved, **SEND TO OFFICE** opens Setup & Help and prompts you
to paste it (and holds the checklist in **Retry Unsent** so nothing is lost).

On the **Windows desktop**, **Save to Folder** also writes straight into your
synced OneDrive folder with no flow at all.

## Standalone app — the hosting decision

A true full-screen app (its own icon, no browser address bar) and the Android
**share sheet** both require the app to be served from an **https** address.
A plain local file cannot do this — Chrome only makes a shortcut that opens in
a browser tab. This is a browser security rule, not a bug.

Recommended hosting (neither is GitHub):

- **Company intranet / IT web server** (IIS, Apache, etc.) — simplest if you
  have IT. Copy the contents of `hosted/` to a folder served over https.
- **Azure Storage static website** in your own Microsoft 365 tenant — same
  vendor as your OneDrive. Enable "Static website" on a storage account and
  upload the `hosted/` files in the Azure portal. No dev tools, no GitHub.

After hosting, open the address in Chrome on the tablet → menu (⋮) →
**Install app**.

### If you don't host

Use `Empire_TDR_Checklist.html` as a single file. Everything works except the
full-screen app look:
- Desktop: double-click → opens in Chrome/Edge; **Save to Folder** files to
  OneDrive; **SEND TO OFFICE** files via the flow.
- Tablet: open in Chrome; **Add to Home screen** makes a shortcut;
  **SEND TO OFFICE** (Power Automate) files to OneDrive in one tap.
