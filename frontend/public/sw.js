// Service worker minimo: cachea el "cascaron" de la app para abrir rapido y
// tolerar microcortes de red. Los datos clinicos NO se cachean (siempre frescos).
const CACHE = "cdss-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Nunca cachear llamadas a la API ni a fuentes oficiales: datos siempre frescos.
  if (url.pathname.startsWith("/api/") || url.hostname.includes("fda.gov") || url.hostname.includes("nlm.nih.gov") || url.hostname.includes("aemps.es") || url.hostname.includes("googleapis.com")) {
    return; // deja pasar a la red
  }
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("/index.html")))
  );
});
