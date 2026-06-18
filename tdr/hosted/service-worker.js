/* Empire TDR Checklist - service worker (hosted build only).
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
