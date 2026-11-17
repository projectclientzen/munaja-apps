/* Munajaa service worker. Caches the app shell and static files only. */
// Bump VERSION to drop old caches on the next activate. shortcut: manual bump, automate with the build id later.
const VERSION = "v3";
const STATIC = `tahajud-static-${VERSION}`;
const PAGES = `tahajud-pages-${VERSION}`;
// Qur'an text files (public/quran/*.json) are static and versioned with the app: bump QURAN_VERSION if they change.
const QURAN_VERSION = "v1";
const QURAN = `tahajud-quran-${QURAN_VERSION}`;
const KEEP = [STATIC, PAGES, QURAN];
const PRECACHE = ["/offline.html", "/icons/favicon-64.png", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)));
});

// A new version waits until the page asks for it, so an update never swaps code under an open counter.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("tahajud-") && !KEEP.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // PRD §21: API responses are never cached, and the worker does not touch them at all.
  if (url.pathname.startsWith("/api/")) return;
  // Next.js RSC payloads for client navigation always go to the network.
  if (url.searchParams.has("_rsc") || req.headers.get("RSC")) return;

  if (req.mode === "navigate") {
    event.respondWith(navigate(req, url));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req, STATIC));
  } else if (url.pathname.startsWith("/quran/") && url.pathname.endsWith(".json")) {
    event.respondWith(cacheFirst(req, QURAN));
  }
});

async function navigate(req, url) {
  const key = url.origin + url.pathname;
  try {
    const res = await fetch(req);
    if (res.ok && cacheable(res)) {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(key, copy));
    } else if (res.status >= 500) {
      const hit = await caches.match(key);
      if (hit) return hit;
    }
    return res;
  } catch {
    return (await caches.match(key)) || (await caches.match("/offline.html")) || Response.error();
  }
}

// Pages marked private or no-store may hold one person's data. Never keep a copy.
function cacheable(res) {
  return !/no-store|private/i.test(res.headers.get("cache-control") || "");
}

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(req, copy));
  }
  return res;
}

// ---- Web Push ----
// Payload from src/server/push/payload.ts: {type, title, body, url, tag}. Anything missing falls back to a safe default.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Munajaa";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-64.png",
    // Same tag replaces the earlier notification instead of stacking.
    tag: typeof data.tag === "string" && data.tag ? data.tag : "munajaa",
    data: { url: safePath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const target = new URL(path, self.location.origin).href;
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const mine = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (mine) {
        if (mine.navigate && new URL(mine.url).pathname !== path) await mine.navigate(target).catch(() => {});
        return mine.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// Only a same-origin relative path may be opened. Anything else falls back to the dashboard.
function safePath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  return value;
}
