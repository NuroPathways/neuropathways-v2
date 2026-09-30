// Network-only: never store patient information, API responses, or sessions.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(
        "<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Offline · NeuroPathways</title><body style=\"font:16px system-ui;padding:2rem;color:#24354d\"><h1>You're offline</h1><p>Reconnect to continue using NeuroPathways. Your health information is not stored for offline access.</p></body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      ),
    ),
  );
});