const CACHE_NAME = "bridgn-v1";
const PRECACHE = [
  "/",
  "/index.html",
  "/assets/logo-white.svg",
  "/assets/logo-dark.svg",
  "/assets/logo-auth.svg",
  "/assets/logo-icon-white.svg",
  "/assets/logo-icon-dark.svg",
];

// Install — cache core assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener("fetch", (e) => {
  // Skip non-GET and API/Stripe/Supabase requests
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/") || url.hostname !== location.hostname) return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        // Cache successful responses
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
