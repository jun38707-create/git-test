/* Minimal Service Worker for PWA Installability */
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
    // Network-only strategy to avoid cache issues
    e.respondWith(fetch(e.request));
});
