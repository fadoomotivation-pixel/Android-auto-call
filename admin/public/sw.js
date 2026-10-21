// Call Pro AI telecaller app (/app) service worker.
// App shell: cache-first for static build assets; network-first for pages; an
// offline page when nothing works.
//
// The Supabase API is NEVER cached. v1 kept every /rest/ answer — customer
// names, phones, budgets — in Cache Storage keyed by URL alone. The Cache API
// ignores the Authorization header, so on a shared phone the next rep to sign
// in and lose signal was shown the previous rep's leads, and the list stayed on
// the phone after sign-out. Bumping VERSION makes "activate" delete v1.
const VERSION = "cpa-app-v2";
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

  // Supabase and every other origin go straight to the network, untouched.
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

// Follow-up reminders (supabase/functions/web-push). The payload is the whole
// message, so nothing is fetched — it shows even with no signal left.
self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: "Call Pro AI", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "Callback due", {
    body: m.body || "",
    tag: m.tag || "fu",
    renotify: true,
    requireInteraction: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: m.url || "/app?tab=follow" },
  }));
});

// Tap → the lead. An app window already open is told which lead to show (no
// reload, nothing typed is lost); otherwise a new one opens on it.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/app", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => new URL(c.url).pathname.startsWith("/app"));
    if (!w) return self.clients.openWindow(url);
    w.postMessage({ type: "cpa-open", url });
    return w.focus();
  }));
});
