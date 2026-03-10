const CACHE = "cinegeek-v4";
const CORE  = ["./index.html", "./style.css", "./app.js", "./config.js", "./manifest.json"];
const API   = ["api.", "tmdb", "groq", "firebase", "googleapis"];

self.addEventListener("install", e => {
  self.skipWaiting(); // força ativação imediata sem esperar fechar abas
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // assume controle de todas as abas imediatamente
  );
});

self.addEventListener("fetch", e => {
  const url = e.request.url;

  // APIs externas: nunca intercepta
  if (API.some(a => url.includes(a))) return;

  const isCore = CORE.some(f => url.includes(f.replace("./", "")));

  if (isCore) {
    // Arquivos principais: SEMPRE rede primeiro, cache só se offline
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Resto: cache primeiro
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
