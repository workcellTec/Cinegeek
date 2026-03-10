const CACHE = "cinegeek-v2";

// Arquivos base para funcionar offline
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.json"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  // Faz o cache dos arquivos essenciais na instalação
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return c.addAll(ASSETS).catch(err => console.warn("Aviso: Alguns arquivos não foram cacheados", err));
    })
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Ignora chamadas de API (Firebase, TMDB, Groq)
  if (e.request.url.includes("api.") || e.request.url.includes("tmdb") || e.request.url.includes("groq") || e.request.url.includes("firebase")) return;
  
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        // Guarda novos arquivos no cache dinamicamente
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    }).catch(() => {
      // Fallback básico caso esteja offline e não tenha no cache
      return caches.match("./index.html");
    })
  );
});
