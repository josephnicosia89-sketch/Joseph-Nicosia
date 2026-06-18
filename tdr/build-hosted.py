#!/usr/bin/env python3
"""Generate the hosted PWA bundle from the single-file checklist.

Keeps one source of truth (Empire_TDR_Checklist.html). The hosted build adds
the two things a true installable app needs that a local file cannot have:
a linked manifest file and a registered service worker.

Run:  python3 build-hosted.py
"""
import base64
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'Empire_TDR_Checklist.html')
OUT = os.path.join(HERE, 'hosted')

MANIFEST_LINK = '<link rel="manifest" href="manifest.webmanifest">'

SW_REGISTRATION = '''/* Hosted build: link a real manifest (in <head>) and register a service
   worker so Chrome offers a true full-screen "Install app" and the checklist
   opens offline. This block replaces the single-file inline manifest. */
(function(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('service-worker.js').catch(function(){});
  });
})();'''


def build_html(src: str) -> str:
    # 1) Link the external manifest in <head>.
    marker = '<meta name="apple-mobile-web-app-title" content="Empire TDR">'
    if marker not in src:
        sys.exit('ERROR: head marker not found; cannot inject manifest link.')
    if MANIFEST_LINK not in src:
        src = src.replace(marker, marker + '\n' + MANIFEST_LINK, 1)

    # 2) Replace the single-file inline-manifest IIFE with SW registration.
    start = src.find('/* Build the app manifest in-line')
    if start == -1:
        sys.exit('ERROR: inline manifest block start not found.')
    anchor = src.find('})();', start)
    if anchor == -1:
        sys.exit('ERROR: inline manifest block end not found.')
    end = anchor + len('})();')
    src = src[:start] + SW_REGISTRATION + src[end:]
    return src


def extract_icons(src: str):
    os.makedirs(OUT, exist_ok=True)
    for name, var in [('icon-192.png', 'EMPIRE_ICON_192'),
                      ('icon-512.png', 'EMPIRE_ICON_512')]:
        m = re.search(var + r"\s*=\s*'data:image/png;base64,([A-Za-z0-9+/=]+)'", src)
        if not m:
            sys.exit(f'ERROR: {var} not found.')
        with open(os.path.join(OUT, name), 'wb') as fh:
            fh.write(base64.b64decode(m.group(1)))


MANIFEST = '''{
  "name": "Empire TDR Checklist",
  "short_name": "Empire TDR",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#14213d",
  "theme_color": "#14213d",
  "description": "Empire Safe TDR Quality Inspection & Shipping Checklist for tablets.",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
'''

SERVICE_WORKER = '''/* Empire TDR Checklist - service worker (hosted build only).
   Makes the checklist installable and openable offline. Bump CACHE_VERSION
   when index.html changes so tablets pick up the new version. */
var CACHE_VERSION = 'empire-tdr-v4';
var APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(APP_SHELL); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE_VERSION) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;                       // never touch the SEND TO OFFICE POST
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // never touch cross-origin (OneDrive flow)
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_VERSION).then(function (c) { c.put('./index.html', copy); });
      return res;
    }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  event.respondWith(caches.match(req).then(function (cached) {
    return cached || fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return cached; });
  }));
});
'''


def main():
    with open(SRC, encoding='utf-8') as fh:
        src = fh.read()
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as fh:
        fh.write(build_html(src))
    with open(os.path.join(OUT, 'manifest.webmanifest'), 'w', encoding='utf-8') as fh:
        fh.write(MANIFEST)
    with open(os.path.join(OUT, 'service-worker.js'), 'w', encoding='utf-8') as fh:
        fh.write(SERVICE_WORKER)
    extract_icons(src)
    print('Hosted bundle written to', OUT)


if __name__ == '__main__':
    main()
