// Call Pro AI telecaller app (/app) service worker.
// App shell: cache-first for static build assets; network-first for pages and
// the Supabase API (data must be fresh); an offline page when nothing works.
const VERSION = "cpa-app-v1";
const SHELL = ["/app", "/app/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // writes always go straight to the network
  const url = new URL(req.url);

  // Supabase API / auth: network-first, fall back to the last good copy.
  if (url.hostname.endsWith(".supabase.co")) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && url.pathname.startsWith("/rest/")) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((r) => r || Response.error())),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  // /app pages: network-first, then cached shell, then the offline page.
  if (req.mode === "navigate" && url.pathname.startsWith("/app")) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("/app")).then((r) => r || caches.match("/app/offline.html"))),
    );
  }
});
