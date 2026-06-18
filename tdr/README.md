# Empire TDR Checklist — Tablet App

A standalone, installable (PWA) version of the Empire TDR Quality Inspection &
Shipping Checklist, intended to run on an Android tablet in Google Chrome and
file finished checklists into OneDrive.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole checklist app (self-contained). |
| `manifest.webmanifest` | Makes Chrome offer **Install app** and run it full-screen. |
| `service-worker.js` | Caches the app so it installs and opens offline. |
| `icon-192.png`, `icon-512.png` | Home-screen / app icons. |

## Hosting (GitHub Pages)

The workflow `.github/workflows/deploy-pages.yml` publishes this `tdr/` folder
to GitHub Pages on every push to the development branch. The Pages site root
serves `index.html`, so the install URL is the repository's `*.github.io`
address.

One-time switch in the GitHub repo: **Settings → Pages → Build and deployment →
Source = GitHub Actions**. After the first successful run, the URL appears at
the top of that page.

## Install on the Android tablet

1. Open the published URL in **Google Chrome** on the tablet.
2. Chrome menu (⋮) → **Install app** (or **Add to Home screen**).
3. Use the Empire icon from the home screen — it now opens full-screen and
   works offline.

## File checklists into OneDrive (Power Automate)

The big green **SEND TO OFFICE** button posts each finished checklist to a
Power Automate flow that writes it into the
`OneDrive - Empire Safe Company Inc\Logistics - Documents` folder.

Build the flow once and paste its HTTP POST URL into the app's
**Setup & Help** screen. Full step-by-step instructions are in that screen.
Until the flow URL is set, **SEND TO OFFICE** falls back to the Android share
sheet (pick OneDrive manually).
