// ═══════════════════════════════════════════════════
//  CINEGeek — app.js
// ═══════════════════════════════════════════════════

const TMDB_BASE   = "https://api.themoviedb.org/3";
const TMDB_IMG    = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_LG = "https://image.tmdb.org/t/p/w780";
const FB_URL      = "https://cinemateca-c5202-default-rtdb.firebaseio.com";

const GENRES_PT = {
  28:"Ação",12:"Aventura",16:"Animação",35:"Comédia",80:"Crime",
  99:"Documentário",18:"Drama",10751:"Família",14:"Fantasia",
  27:"Terror",10402:"Música",9648:"Mistério",10749:"Romance",
  878:"Ficção Científica",53:"Thriller",10752:"Guerra",37:"Western"
};
const TV_GENRES_PT = {
  10759:"Ação & Aventura",16:"Animação",35:"Comédia",80:"Crime",
  99:"Documentário",18:"Drama",10751:"Família",10762:"Infantil",
  9648:"Mistério",10763:"Notícias",10764:"Reality",10765:"Ficção Científica",
  10766:"Novela",10767:"Talk Show",10768:"Guerra",37:"Western"
};

// ── State ──────────────────────────────────────────
let deviceId    = null;
let ratings     = {};   // loved | disliked | meh | skip | watchlist
let movies      = {};
let queue       = [];
let page        = 1;
let activeGenre = null;
let isAnimating = false;
let mediaType   = "movie";

// List pagination
const LIST_PAGE_SIZE = 20;
let listPage = 1;

// Quiz state
let quizState = { theme: null, questions: [], currentQ: 0, answers: [] };

// Track recent IA recommendations to avoid repeating
let recentIARecs = [];

// ── Boot ───────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  deviceId = await getDeviceId();
  const savedRecs = await _idbGet("recentIARecs");
  if (savedRecs) try { recentIARecs = JSON.parse(savedRecs); } catch {}
  setupNav();
  setupMediaToggle();
  setupGenreBar();
  setupAI();
  setupListFilters();
  setupQuiz();
  setupTutorial();
  setupLogin();
  if (!deviceId) {
    showLoginScreen();
    return;
  }
  await bootApp();
});

async function bootApp() {
  await loadFromFirebase();
  await loadContent();
  showNextCard();
  updateUserInfoBar();
  setTimeout(() => {
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  }, 600);
}

function showLoginScreen() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  setTimeout(() => document.getElementById("splash").classList.add("hidden"), 400);
}

// ── ID persistente — IndexedDB (sobrevive limpeza de cache) ──────────────
// IndexedDB NÃO é apagado ao limpar cache/histórico comum do navegador
// Só é apagado com "limpar dados do site" (muito mais raro)

const _IDB_NAME  = "cine_persist";
const _IDB_STORE = "kv";

function _idbOpen() {
  return new Promise((ok, err) => {
    const req = indexedDB.open(_IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(_IDB_STORE);
    req.onsuccess = e => ok(e.target.result);
    req.onerror   = () => err(req.error);
  });
}
async function _idbGet(key) {
  try {
    const db = await _idbOpen();
    return new Promise(ok => {
      const req = db.transaction(_IDB_STORE).objectStore(_IDB_STORE).get(key);
      req.onsuccess = () => ok(req.result ?? null);
      req.onerror   = () => ok(null);
    });
  } catch { return null; }
}
async function _idbSet(key, val) {
  try {
    const db = await _idbOpen();
    return new Promise(ok => {
      const tx = db.transaction(_IDB_STORE, "readwrite");
      tx.objectStore(_IDB_STORE).put(val, key);
      tx.oncomplete = () => ok(true);
      tx.onerror    = () => ok(false);
    });
  } catch { return false; }
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}
function setCookie(name, val, days = 730) {
  const exp = new Date(Date.now() + days*864e5).toUTCString();
  document.cookie = name+"="+val+";expires="+exp+";path=/;SameSite=Lax";
}

async function getDeviceId() {
  // Usa username como ID — salvo em todas as camadas
  let id = await _idbGet("uid")
        || getCookie("cine_uid")
        || localStorage.getItem("cine_uid")
        || sessionStorage.getItem("cine_uid");
  return id || null;
}

let loginMode = "criar"; // "criar" | "entrar"

function switchLoginMode(mode) {
  loginMode = mode;
  document.getElementById("tab-criar").classList.toggle("active", mode === "criar");
  document.getElementById("tab-entrar").classList.toggle("active", mode === "entrar");
  document.getElementById("login-btn").textContent = mode === "criar" ? "Criar conta" : "Entrar";
  document.getElementById("login-error").classList.add("hidden");
}

function usernameToKey(name) {
  return "u_" + name.toLowerCase().trim().replace(/\s+/g, "_");
}

async function userExists(key) {
  try {
    const res = await fetch(`${FB_URL}/users/${key}.json`);
    if (!res.ok) return false;
    const data = await res.json();
    return data !== null;
  } catch { return false; }
}

function persistUserId(key) {
  _idbSet("uid", key);
  setCookie("cine_uid", key);
  localStorage.setItem("cine_uid", key);
  sessionStorage.setItem("cine_uid", key);
}

function clearUserId() {
  _idbSet("uid", null);
  setCookie("cine_uid", "");
  localStorage.removeItem("cine_uid");
  sessionStorage.removeItem("cine_uid");
}

function updateUserInfoBar() {
  // Update nav label
  const navLabel = document.getElementById("nav-perfil-label");
  if (navLabel && deviceId) {
    const display = deviceId.replace(/^u_/, "").replace(/_/g, " ");
    navLabel.textContent = display.split(" ")[0]; // first word only in nav
  }
}

function renderPerfil() {
  const el = document.getElementById("perfil-username-display");
  if (!el || !deviceId) return;
  const display = deviceId.replace(/^u_/, "").replace(/_/g, " ");
  el.textContent = display;
  // count stats
  const loved    = Object.values(ratings).filter(v => v === "loved").length;
  const watchlist= Object.values(ratings).filter(v => v === "watchlist").length;
  const total    = Object.values(ratings).filter(v => ["loved","meh","disliked"].includes(v)).length;
  const existing = document.querySelector(".perfil-stats-mini");
  if (!existing) {
    const statsEl = document.createElement("div");
    statsEl.className = "perfil-stats-mini";
    statsEl.innerHTML = `<span>🎬 ${total} avaliados</span><span>❤️ ${loved} amados</span><span>👁️ ${watchlist} pra ver</span>`;
    el.parentNode.insertBefore(statsEl, el.nextSibling);
  } else {
    existing.innerHTML = `<span>🎬 ${total} avaliados</span><span>❤️ ${loved} amados</span><span>👁️ ${watchlist} pra ver</span>`;
  }
}

function setupLogin() {
  const input = document.getElementById("login-username");
  const btn   = document.getElementById("login-btn");
  const err   = document.getElementById("login-error");

  function showError(msg) {
    err.textContent = msg;
    err.classList.remove("hidden");
  }

  async function trySubmit() {
    const name = input.value.trim();
    if (name.length < 3) { showError("Nome precisa ter pelo menos 3 letras"); return; }
    const key = usernameToKey(name);
    btn.disabled = true;
    btn.textContent = "Verificando...";

    const exists = await userExists(key);

    if (loginMode === "criar") {
      if (exists) {
        showError("Esse usuário já existe. Escolha outro nome ou clique em Entrar.");
        btn.disabled = false;
        btn.textContent = "Criar conta";
        return;
      }
      // Create new user
      deviceId = key;
      persistUserId(key);
    } else {
      if (!exists) {
        showError("Usuário não encontrado. Verifique o nome ou crie uma conta.");
        btn.disabled = false;
        btn.textContent = "Entrar";
        return;
      }
      // Login existing user — reset local data first
      ratings = {}; movies = {};
      deviceId = key;
      persistUserId(key);
    }

    err.classList.add("hidden");
    document.getElementById("login-screen").classList.add("hidden");
    btn.disabled = false;
    btn.textContent = loginMode === "criar" ? "Criar conta" : "Entrar";
    input.value = "";
    await bootApp();
  }

  btn.onclick = trySubmit;
  input.addEventListener("keydown", e => { if (e.key === "Enter") trySubmit(); });
}

// ── Firebase — salva ratings + filmes avaliados ────────────────────────────
async function loadFromFirebase() {
  if (!deviceId) return;
  try {
    const res  = await fetch(`${FB_URL}/users/${deviceId}.json`);
    if (!res.ok) return;
    const data = await res.json();
    if (data) {
      // IDB tem prioridade — pode ter dados mais recentes que o Firebase
      const idbRatings = await _idbGet("ratings").then(r => r ? JSON.parse(r) : {}).catch(() => ({}));
      const idbMovies  = await _idbGet("movies").then(r => r ? JSON.parse(r) : {}).catch(() => ({}));
      // Merge: Firebase base + IDB local por cima (IDB é sempre mais recente)
      ratings = { ...(data.ratings || {}), ...idbRatings };
      movies  = { ...(data.movies  || {}), ...idbMovies, ...movies };
      // Persiste merged de volta no IDB
      await _idbSet("ratings", JSON.stringify(ratings));
      await _idbSet("movies",  JSON.stringify({ ...(data.movies || {}), ...idbMovies }));
    }
  } catch(e) {
    // Firebase falhou → tenta recuperar do IndexedDB local
    try {
      const r = await _idbGet("ratings");
      const m = await _idbGet("movies");
      if (r) ratings = JSON.parse(r);
      if (m) movies  = { ...movies, ...JSON.parse(m) };
    } catch {}
    console.warn("Firebase load error, using local cache:", e.message);
  }
}

let _saveTimer = null;

function saveToFirebase() {
  if (!deviceId) return;
  // Salva IDB IMEDIATAMENTE (fonte de verdade local)
  const ratedMovies = {};
  Object.keys(ratings).forEach(id => { if (movies[id]) ratedMovies[id] = movies[id]; });
  _idbSet("ratings", JSON.stringify(ratings));
  _idbSet("movies",  JSON.stringify(ratedMovies));

  // Debounce Firebase — espera 800ms de inatividade antes de enviar
  // Evita race condition quando usuário adiciona vários filmes em sequência
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => _pushToFirebase(ratedMovies), 800);
}

async function _pushToFirebase(ratedMovies) {
  if (!deviceId) return;
  try {
    // Merge IDB com o que está em memória para garantir consistência total
    const cached = await _idbGet("ratings").then(r => r ? JSON.parse(r) : {}).catch(() => ({}));
    const mergedRatings = { ...cached, ...ratings };
    const cachedMovies  = await _idbGet("movies").then(r => r ? JSON.parse(r) : {}).catch(() => ({}));
    const mergedMovies  = { ...cachedMovies, ...ratedMovies };
    // Remove filmes que não têm mais rating
    Object.keys(mergedMovies).forEach(id => { if (!mergedRatings[id]) delete mergedMovies[id]; });

    await fetch(`${FB_URL}/users/${deviceId}/ratings.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mergedRatings)
    });
    await fetch(`${FB_URL}/users/${deviceId}/movies.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mergedMovies)
    });
  } catch(e) { console.warn("Firebase sync error (dados salvos localmente):", e.message); }
}

// ── Media Toggle ───────────────────────────────────
function setupMediaToggle() {
  const btnMovies = document.getElementById("seg-movies");
  const btnSeries = document.getElementById("seg-series");

  function switchTo(type) {
    mediaType = type;
    btnMovies.classList.toggle("active", type === "movie");
    btnSeries.classList.toggle("active", type === "tv");
    page = 1;
    const rated = new Set(Object.keys(ratings));
    queue = queue.filter(id => rated.has(id));
    setupGenreBar();
    loadContent().then(rebuildStack);
  }

  btnMovies.addEventListener("click", () => switchTo("movie"));
  btnSeries.addEventListener("click", () => switchTo("tv"));
}

// ── TMDB ───────────────────────────────────────────
function buildGenreProfile() {
  const scores = {};
  Object.entries(ratings).forEach(([id, val]) => {
    const m = movies[id]; if (!m) return;
    const pts = { loved:3, meh:1, disliked:-2, skip:0, watchlist:1 }[val] ?? 0;
    (m.genreIds || []).forEach(g => { scores[g] = (scores[g] || 0) + pts; });
  });
  return scores;
}

let _loadingContent = false;

// Estratégias de busca para não esgotar filmes
const SORT_STRATEGIES = [
  "popularity.desc",
  "vote_average.desc",
  "revenue.desc",
  "primary_release_date.desc",
  "vote_count.desc",
];
let _strategyIndex = 0;

async function loadContent() {
  if (_loadingContent) return;
  _loadingContent = true;
  try {
    const genre     = activeGenre ? `&with_genres=${activeGenre}` : "";
    const endpoint  = mediaType === "tv" ? "discover/tv" : "discover/movie";
    const sort      = SORT_STRATEGIES[_strategyIndex % SORT_STRATEGIES.length];
    const voteField = mediaType === "tv"
      ? "&vote_count.gte=100&vote_average.gte=5"
      : "&vote_count.gte=100";
    const url = `${TMDB_BASE}/${endpoint}?api_key=${CONFIG.TMDB_KEY}&language=pt-BR&sort_by=${sort}&page=${page}${voteField}${genre}`;
    const data = await fetch(url).then(r => r.json());

    const rated        = new Set(Object.keys(ratings));
    const genreProfile = buildGenreProfile();
    const badGenres    = new Set(
      Object.entries(genreProfile).filter(([,s]) => s <= -4).map(([id]) => Number(id))
    );
    const GENRES = mediaType === "tv" ? TV_GENRES_PT : GENRES_PT;

    (data.results || []).forEach(m => {
      const id    = String(m.id);
      const title = mediaType === "tv" ? m.name : m.title;
      const year  = ((mediaType === "tv" ? m.first_air_date : m.release_date) || "").slice(0, 4);
      if (rated.has(id)) return;
      const gids = m.genre_ids || [];
      if (gids.length > 0 && gids.every(g => badGenres.has(g))) return;

      movies[id] = {
        id, title, year,
        overview: m.overview || "",
        poster:   m.poster_path   ? TMDB_IMG    + m.poster_path : null,
        posterLg: m.poster_path   ? TMDB_IMG_LG + m.poster_path : null,
        rating:   m.vote_average  ? m.vote_average.toFixed(1)   : null,
        genre:    GENRES[gids[0]] || (mediaType === "tv" ? "Série" : "Filme"),
        genreIds: gids,
        type:     mediaType,
      };

      let affinity = 0;
      gids.forEach(g => { affinity += genreProfile[g] || 0; });
      movies[id]._affinity = affinity;
      queue.push(id);
    });

    queue.sort((a, b) => {
      const ma = movies[a], mb = movies[b];
      if (!ma || !mb) return 0;
      return (mb._affinity || 0) - (ma._affinity || 0) + (Math.random() - 0.5) * 1.5;
    });
    page++;
    // Após 5 páginas da mesma estratégia, avança pra próxima
    if (page > 5 && page % 5 === 1) _strategyIndex++;
  } catch(e) { console.error("TMDB error", e); }
  finally { _loadingContent = false; }
}

// ── Card Stack ─────────────────────────────────────
function showNextCard() { rebuildStack(); }

function rebuildStack() {
  const stack = document.getElementById("card-stack");
  stack.innerHTML = "";
  if (queue.length === 0) {
    // Busca mais antes de mostrar erro
    stack.innerHTML = `<div class="empty-deck loading-deck"><div class="deck-spinner"></div><p>Buscando filmes...</p></div>`;
    loadContent().then(() => {
      if (queue.length > 0) { rebuildStack(); return; }
      // Esgotou essa estratégia — tenta a próxima
      _strategyIndex++;
      page = 1;
      loadContent().then(() => {
        if (queue.length > 0) { rebuildStack(); return; }
        // Tenta mais uma estratégia
        _strategyIndex++;
        page = 1;
        loadContent().then(() => {
          if (queue.length > 0) rebuildStack();
          else stack.innerHTML = `<div class="empty-deck"><p>Você viu muita coisa! 🎬</p><button onclick="refill()">Buscar mais</button></div>`;
        });
      });
    });
    return;
  }
  const count = Math.min(3, queue.length);
  for (let i = count - 1; i >= 0; i--) {
    const m = movies[queue[i]];
    if (!m) { queue.splice(i, 1); rebuildStack(); return; }
    stack.appendChild(buildCard(m, i));
  }
  const top = stack.lastChild;
  if (top?.dataset.pos === "0") attachSwipe(top);
  updateStats();
  // Pré-carrega mais quando resta pouco
  if (queue.length < 8) loadContent().then(() => {});
  if (queue.length > 0 && movies[queue[0]]?.poster) updateAmbilight(movies[queue[0]].poster);
  else updateAmbilight(null);
}

function buildCard(movie, pos) {
  const div = document.createElement("div");
  div.className = "movie-card";
  div.dataset.id  = movie.id;
  div.dataset.pos = pos;
  if      (pos === 2) div.style.cssText = "transform:scale(0.88) translateY(28px);z-index:1;pointer-events:none;";
  else if (pos === 1) div.style.cssText = "transform:scale(0.94) translateY(14px);z-index:2;pointer-events:none;";
  else                div.style.cssText = "transform:scale(1) translateY(0);z-index:3;";

  div.innerHTML = `
    ${movie.poster
      ? `<img class="card-poster" src="${movie.poster}" alt="${movie.title}" draggable="false"/>`
      : `<div class="card-poster-ph">🎬</div>`}
    <div class="card-overlay"></div>
    <div class="card-info">
      <div class="card-top-badges">
        <span class="card-genre-badge">${movie.genre || ""}</span>
        ${movie.type === "tv" ? `<span class="card-tv-badge">📺</span>` : ""}
      </div>
      <div class="card-title">${movie.title}</div>
      <div class="card-meta">
        ${movie.year ? `<span>${movie.year}</span>` : ""}
        ${movie.rating ? `<span class="card-rating-pill">⭐ ${movie.rating}</span>` : ""}
      </div>
      <div class="card-tap-hint">toque = detalhes · 2 toques = quero ver</div>
    </div>
    <div class="stamp stamp-love">❤️ AMEI</div>
    <div class="stamp stamp-nope">👎 NÃO</div>
    <div class="stamp stamp-meh">😐 OK</div>
    <div class="stamp stamp-seen">⏭️ PULAR</div>
  `;
  return div;
}

// ── Swipe ──────────────────────────────────────────
function attachSwipe(card) {
  let x0 = 0, y0 = 0, active = false, lastTap = 0, singleTapTimer = null;
  let longPressTimer = null;

  const sLove = card.querySelector(".stamp-love");
  const sNope = card.querySelector(".stamp-nope");
  const sMeh  = card.querySelector(".stamp-meh");
  const sSeen = card.querySelector(".stamp-seen");

  function resetStamps() {
    [sLove, sNope, sMeh, sSeen].forEach(s => { s.style.opacity = "0"; s.style.transform = ""; });
    card.style.boxShadow = "";
  }

  function start(x, y) {
    if (isAnimating) return;
    
     
// --- LÓGICA DO DOUBLE TAP (Estilo Instagram) ---
    const now = Date.now();
    if (now - lastTap < 300) {
      clearTimeout(longPressTimer);
      lastTap = 0;

      // 1. Cria o ícone "Pop" no centro
      const pop = document.createElement("div");
      pop.innerHTML = "👁️"; // Mantém a identidade visual do app
      pop.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(0); font-size:90px; z-index:20; pointer-events:none; transition:transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); filter: drop-shadow(0 10px 20px rgba(0,0,0,0.6));";
      card.appendChild(pop);

      // 2. Dispara a animação de crescer e vibra o celular
      requestAnimationFrame(() => {
        pop.style.transform = "translate(-50%, -50%) scale(1.1)";
        if (navigator.vibrate) navigator.vibrate([40, 30, 40]); // Vibração dupla
      });

      // 3. Espera o ícone aparecer e faz o card "afundar"
      setTimeout(() => {
        doSwipe(card, "watchlist", "fly-watchlist"); // Chama a nova animação
      }, 400);

      return;
    }
    lastTap = now;
    // -----------------------------------------------
    
    x0 = x; y0 = y; active = true;
    card.style.transition = "none";
    longPressTimer = setTimeout(() => {
      if (active) {
        if (navigator.vibrate) navigator.vibrate([30, 20, 50]);
        active = false;
        card.style.transform = "";
        card.style.boxShadow = "";
        resetStamps();
        openDetailSheet(card.dataset.id);
      }
    }, 500);
  }

  let _raf = null;
  let _lastX = 0, _lastY = 0;
  function move(x, y) {
    if (!active) return;
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    _lastX = x; _lastY = y;
    if (_raf) return; // já tem um frame pendente
    _raf = requestAnimationFrame(() => {
      _raf = null;
      const dx = _lastX - x0, dy = _lastY - y0;
      card.style.transform = `translate3d(${dx}px,${dy}px,0) rotate(${dx * 0.055}deg)`;

      const goUp   = dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.3;
      const goDown = dy >  50 && Math.abs(dy) > Math.abs(dx) * 1.3;
      const goRight= !goUp && !goDown && dx >  30;
      const goLeft = !goUp && !goDown && dx < -30;

      sLove.style.opacity = goRight ? Math.min(1, dx / 80)   : 0;
      sNope.style.opacity = goLeft  ? Math.min(1, -dx / 80)  : 0;
      sMeh.style.opacity  = goDown  ? Math.min(1, dy / 80)   : 0;
      sSeen.style.opacity = goUp    ? Math.min(1, -dy / 80)  : 0;

      if      (goRight) card.style.boxShadow = `0 0 55px rgba(74,222,128,${Math.min(0.85, dx/80)*0.7})`;
      else if (goLeft)  card.style.boxShadow = `0 0 55px rgba(248,113,113,${Math.min(0.85,-dx/80)*0.7})`;
      else if (goDown)  card.style.boxShadow = `0 0 55px rgba(251,191,36,${Math.min(0.85, dy/80)*0.7})`;
      else if (goUp)    card.style.boxShadow = `0 0 55px rgba(148,163,184,${Math.min(0.85,-dy/80)*0.7})`;
      else              card.style.boxShadow = "";
    });
  }

  function end(x, y) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!active) return;
    active = false;
    card.style.transition = "";
    const dx = x - x0, dy = y - y0;
    const goUp   = dy < -80 && Math.abs(dy) > Math.abs(dx) * 1.3;
    const goDown = dy >  80 && Math.abs(dy) > Math.abs(dx) * 1.3;
    resetStamps();

    const moved = Math.abs(dx) > 12 || Math.abs(dy) > 12;
    if (!moved) {
      openDetailSheet(card.dataset.id);
      return;
    }

    if      (goUp)        doSwipe(card, "skip",     "fly-up");
    else if (goDown)      doSwipe(card, "meh",      "fly-down");
    else if (dx >  85)    doSwipe(card, "loved",    "fly-right");
    else if (dx < -85)    doSwipe(card, "disliked", "fly-left");
    else {
      card.style.transform = "scale(1) translateY(0)";
      card.style.boxShadow = "";
    }
  }

  card.addEventListener("touchstart", e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  card.addEventListener("touchmove",  e => { if (!active) return; e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  card.addEventListener("touchend",   e => end(e.changedTouches[0].clientX, e.changedTouches[0].clientY), { passive: true });
  card.addEventListener("mousedown",  e => start(e.clientX, e.clientY));
  window.addEventListener("mousemove", e => { if (active) move(e.clientX, e.clientY); });
  window.addEventListener("mouseup",   e => { if (active) end(e.clientX, e.clientY); });
}

function addToWatchlist(card) {
  if (isAnimating) return;
  const id = card.dataset.id;
  const hint = card.querySelector(`#wl-hint-${id}`);
  if (hint) {
    hint.classList.remove("hidden");
    setTimeout(() => hint.classList.add("hidden"), 1400);
  }
  if (ratings[id] !== "watchlist") {
    ratings[id] = "watchlist";
    saveToFirebase();
    updateStats();
    queue = queue.filter(q => q !== id);
    toast("👁️ Quero ver · " + (movies[id]?.title || ""));
  }
}

function doSwipe(card, rating, flyClass) {
  if (isAnimating) return;
  isAnimating = true;
  const id = card.dataset.id;

  const flyTo = {
    "fly-right": "translateX(140%) rotate(22deg)",
    "fly-left":  "translateX(-140%) rotate(-22deg)",
    "fly-up":    "translateY(-120%) scale(0.8)",
    "fly-down":  "translateY(120%) scale(0.8)",
        "fly-watchlist": "scale(0.3) translateY(40px)" // O card encolhe e desce suavemente
  };

  const stampMap = { "fly-right":"stamp-love","fly-left":"stamp-nope","fly-down":"stamp-meh","fly-up":"stamp-seen" };
  const stamp = card.querySelector("." + stampMap[flyClass]);
  if (stamp) { stamp.style.opacity = "1"; stamp.style.transform = "scale(1.3)"; }

  card.style.transition = "transform 0.28s cubic-bezier(.4,0,.6,1), opacity 0.28s ease";
  card.style.transform  = flyTo[flyClass];
  card.style.opacity    = "0";

  setTimeout(() => {
    rate(id, rating);
    queue.shift();
    card.remove();

    const stack = document.getElementById("card-stack");
    const cards = [...stack.children].reverse();
    cards.forEach((c, i) => {
      c.dataset.pos = String(i);
      c.style.transition = "transform 0.2s cubic-bezier(.34,1.4,.64,1)";
      if      (i === 0) { c.style.transform = "scale(1) translateY(0)";      c.style.zIndex = "3"; c.style.pointerEvents = "auto"; }
      else if (i === 1) { c.style.transform = "scale(0.94) translateY(14px)"; c.style.zIndex = "2"; }
      else              { c.style.transform = "scale(0.88) translateY(28px)"; c.style.zIndex = "1"; }
    });

    if (queue.length >= 3) {
      const m = movies[queue[2]];
      if (m) {
        const newCard = buildCard(m, 2);
        newCard.style.opacity = "0";
        stack.insertBefore(newCard, stack.firstChild);
        requestAnimationFrame(() => { newCard.style.transition = "opacity 0.25s"; newCard.style.opacity = "1"; });
      }
    }

    setTimeout(() => {
      const newTop = stack.lastChild;
      if (newTop) attachSwipe(newTop);
      if (queue.length === 0) rebuildStack();
      isAnimating = false;
      if (queue.length > 0 && movies[queue[0]]?.poster) updateAmbilight(movies[queue[0]].poster);
    }, 160);

    if (queue.length < 5) loadContent();
  }, 300);
}

// ── Rate ───────────────────────────────────────────
function rate(id, val) {
  ratings[String(id)] = val;
  saveToFirebase();
  updateStats();
  const labels = { loved:"❤️ Amei", disliked:"👎 Não curti", meh:"😐 Mais ou menos", skip:"⏭️ Pulado" };
  if (labels[val]) toast(labels[val] + (movies[id] ? " · " + movies[id].title : ""));

  // Refilter queue after rating
  const genreProfile = buildGenreProfile();
  const badGenres = new Set(
    Object.entries(genreProfile).filter(([,s]) => s <= -4).map(([gid]) => Number(gid))
  );
  const ratedIds = new Set(Object.keys(ratings));
  queue = queue.filter(qid => {
    if (ratedIds.has(qid)) return false;
    const m = movies[qid]; if (!m) return false;
    if ((m.genreIds||[]).length > 0 && m.genreIds.every(g => badGenres.has(g))) return false;
    return true;
  });
}

// ── Genre Bar ──────────────────────────────────────
function setupGenreBar() {
  const bar = document.getElementById("genre-bar");
  bar.innerHTML = "";
  const GENRES = mediaType === "tv" ? TV_GENRES_PT : GENRES_PT;
  [{ id:null, name:"Todos"}, ...Object.entries(GENRES).map(([id,n])=>({ id:+id, name:n }))].forEach(g => {
    const btn = document.createElement("button");
    btn.className = "genre-chip" + (g.id === null ? " active" : "");
    btn.textContent = g.name;
    btn.onclick = () => {
      bar.querySelectorAll(".genre-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeGenre = g.id;
      page = 1;
      const rated = new Set(Object.keys(ratings));
      queue = queue.filter(id => rated.has(id));
      loadContent().then(rebuildStack);
    };
    bar.appendChild(btn);
  });
}

// ── Nav ────────────────────────────────────────────
function setupNav() {
  const tabs = { "nav-discover":"tab-swipe", "nav-stats":"tab-stats", "nav-list":"tab-list", "nav-perfil":"tab-perfil" };
  Object.entries(tabs).forEach(([btnId, tabId]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.onclick = () => {
      Object.values(tabs).forEach(t => document.getElementById(t)?.classList.remove("active"));
      Object.keys(tabs).forEach(b => document.getElementById(b)?.classList.remove("active"));
      document.getElementById(tabId)?.classList.add("active");
      btn.classList.add("active");
      if (tabId === "tab-stats")  renderStats();
      if (tabId === "tab-list")   { listPage = 1; renderList(document.querySelector(".list-filter-btn.active")?.dataset.filter || "loved"); }
      if (tabId === "tab-perfil") renderPerfil();
    };
  });
}

// ── Detail Sheet ───────────────────────────────────
function openDetailSheet(id) {
  if (isAnimating) return;
  const m = movies[id];
  if (!m) return;

  const content = document.getElementById("detail-content");
  content.innerHTML = `
    <div class="ds-poster-wrap">
      ${(m.posterLg || m.poster)
        ? `<img src="${m.posterLg || m.poster}" class="ds-poster" alt="${m.title}" onload="this.style.opacity=1" style="opacity:0;transition:opacity .4s"/>`
        : `<div class="ds-poster-ph">🎬</div>`}
      <div class="ds-poster-grad"></div>
      <button class="ds-close-btn" onclick="closeDetailSheet()">×</button>
    </div>
    <div class="ds-info">
      <div class="ds-badges">
        <span class="ds-genre-badge">${m.genre || ""}</span>
        ${m.type === "tv" ? `<span class="ds-tv-badge">📺 Série</span>` : ""}
        ${m.rating ? `<span class="ds-rating-badge">⭐ ${m.rating}</span>` : ""}
      </div>
      <div class="ds-title">${m.title}</div>
      ${m.year ? `<div class="ds-year">${m.year}</div>` : ""}
      ${m.overview ? `<p class="ds-synopsis">${m.overview}</p>` : ""}

      <div class="ds-actions">
        <button class="da-btn da-love"     onclick="rateFromDetail('${id}','loved')">
          <span>❤️</span><span>Amei</span>
        </button>
        <button class="da-btn da-meh"      onclick="rateFromDetail('${id}','meh')">
          <span>😐</span><span>Ok</span>
        </button>
        <button class="da-btn da-dislike"  onclick="rateFromDetail('${id}','disliked')">
          <span>👎</span><span>Não curti</span>
        </button>
        <button class="da-btn da-skip"     onclick="rateFromDetail('${id}','skip')">
          <span>⏭️</span><span>Pular</span>
        </button>
        <button class="da-btn da-watchlist" onclick="rateFromDetail('${id}','watchlist')">
          <span>👁️</span><span>Ver mais tarde</span>
        </button>
      </div>
    </div>`;

  document.getElementById("detail-modal").classList.remove("hidden");
}

function closeDetailSheet() {
  document.getElementById("detail-modal").classList.add("hidden");
}

function rateFromDetail(id, val) {
  closeDetailSheet();
  
  // Adicionamos o watchlist no mapa de voo (voando para cima igual o 'skip')
  // Na função rateFromDetail, mude o flyMap para:
const flyMap = { loved:"fly-right", disliked:"fly-left", meh:"fly-down", skip:"fly-up", watchlist:"fly-watchlist" };

  const card = document.querySelector(`.movie-card[data-id="${id}"]`);
  
  if (card && queue[0] === id) {
    // Se for o card do topo, faz a animação normal de swipe e resolve o filme
    doSwipe(card, val, flyMap[val]);
  } else {
    // Se não for o card do topo, apenas avalia e remove da fila silenciosamente
    rate(id, val);
    queue = queue.filter(q => q !== id);
    rebuildStack();
  }
}



function setupAI() {
  document.getElementById("ai-btn").onclick = () => openFlipCard();
  document.getElementById("flip-close").onclick = () => document.getElementById("flip-modal").classList.add("hidden");
  document.getElementById("flip-modal").onclick = e => { if (e.target === document.getElementById("flip-modal")) document.getElementById("flip-modal").classList.add("hidden"); };
}

async function openFlipCard() {
  const modal = document.getElementById("flip-modal");
  const scene = document.getElementById("flip-scene");
  modal.classList.remove("hidden");
  scene.classList.remove("flipped");
  document.getElementById("flip-back-content").innerHTML = `
    <div class="flip-loading"><div class="dot-loader"><span></span><span></span><span></span></div><p>IA analisando seu perfil...</p></div>`;
  const rec = await fetchGroqRec();
  if (!rec || rec._quotaError) { renderFlipBack(rec); setTimeout(() => scene.classList.add("flipped"), 200); return; }
  document.getElementById("flip-back-content").innerHTML = `
    <div class="flip-loading"><div class="dot-loader"><span></span><span></span><span></span></div><p>Buscando pôster...</p></div>`;
  const tmdbData = await searchTMDB(rec.title, rec.year);
  if (tmdbData) {
    rec._poster   = tmdbData.poster_path  ? TMDB_IMG_LG + tmdbData.poster_path : null;
    rec._synopsis = tmdbData.overview     || rec.synopsis;
    rec._tmdbId   = String(tmdbData.id);
    rec._rating   = tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : null;
    rec._genres   = tmdbData.genre_ids    || [];
    if (!movies[tmdbData.id]) {
      movies[tmdbData.id] = { id: tmdbData.id, title: rec.title, year: rec.year, genre: rec.genre, genreIds: rec._genres, poster: tmdbData.poster_path ? TMDB_IMG + tmdbData.poster_path : null, posterLg: rec._poster, rating: rec._rating, overview: rec._synopsis, type: mediaType };
    }
  }
  renderFlipBack(rec);
  setTimeout(() => scene.classList.add("flipped"), 200);
}

async function searchTMDB(title, year) {
  try {
    const q  = encodeURIComponent(title);
    const y  = year ? `&year=${year}` : "";
    const ep = mediaType === "tv" ? "search/tv" : "search/movie";
    const data = await fetch(`${TMDB_BASE}/${ep}?api_key=${CONFIG.TMDB_KEY}&language=pt-BR&query=${q}${y}`).then(r => r.json());
    return data.results?.[0] || null;
  } catch(e) { return null; }
}

async function fetchGroqRec() {
  // IA só exclui filmes JÁ VISTOS (loved, meh, disliked)
  // skip e watchlist = ainda não assistiu, pode recomendar
  const seen     = Object.entries(ratings)
    .filter(([,v]) => ["loved","meh","disliked"].includes(v))
    .map(([id]) => movies[id]?.title).filter(Boolean);
  const loved    = Object.entries(ratings).filter(([,v]) => v==="loved").map(([id]) => movies[id]?.title).filter(Boolean);
  const disliked = Object.entries(ratings).filter(([,v]) => v==="disliked").map(([id]) => movies[id]?.title).filter(Boolean);

  const genPts = {};
  Object.entries(ratings).forEach(([id, v]) => {
    const m = movies[id]; if (!m) return;
    const pts = { loved:3, meh:1, disliked:-1, skip:0, watchlist:0 }[v] ?? 0;
    (m.genreIds||[]).forEach(g => { const name = (GENRES_PT[g]||TV_GENRES_PT[g]); if(name) genPts[name] = (genPts[name]||0)+pts; });
  });
  const topGenres = Object.entries(genPts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(g=>g[0]);
  const isTV = mediaType === "tv";

  const prompt = `Você é um crítico especialista em ${isTV ? "séries de TV" : "cinema"}. Indique 1 ${isTV ? "série" : "filme"} perfeito para este usuário.

AMOU: ${loved.slice(0,8).join(", ") || "ainda mapeando"}
NÃO CURTIU: ${disliked.slice(0,5).join(", ") || "nenhum"}
GÊNEROS FAVORITOS: ${topGenres.join(", ") || "variado"}
⛔ PROIBIDO REPETIR (não pode sugerir nenhum destes jamais):
${[...new Set([...seen.slice(0,30), ...recentIARecs])].join(", ") || "nenhum ainda"}

[variação aleatória: ${Math.floor(Math.random()*99999)}]
Surpreenda com algo diferente. Varie décadas, países, subgêneros a cada vez.

Responda APENAS JSON sem markdown:
{"title":"Título em PT-BR","year":2020,"genre":"Drama","director":"Nome","cast":"Ator1, Ator2","synopsis":"Sinopse instigante em 2-3 frases sem spoiler.","reason":"Por que este usuário vai adorar — 1 frase curta e específica"}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.GROQ_KEY}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role:"user", content: prompt }], temperature: 1.1, max_tokens: 500 })
    });
    if (res.status === 429) return { _quotaError: true };
    const data = await res.json();
    if (!res.ok) { console.error("[Groq]", data); return null; }
    let text = (data?.choices?.[0]?.message?.content || "").trim().replace(/```json|```/g,"").trim();
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch(e) { console.error("[Groq] exception:", e.message); return null; }
}

function renderFlipBack(rec) {
  // Register this rec so next call won't repeat it
  if (rec && rec.title && !rec._quotaError) {
    recentIARecs.unshift(rec.title);
    if (recentIARecs.length > 20) recentIARecs.pop();
    // Persiste lista entre sessões
    _idbSet("recentIARecs", JSON.stringify(recentIARecs));
  }
  const el = document.getElementById("flip-back-content");
  if (!rec) {
    el.innerHTML = `<div style="padding:30px 20px;text-align:center;color:#f87171;display:flex;flex-direction:column;align-items:center;gap:12px"><div style="font-size:40px">⚠️</div><p>Erro ao buscar. Tente de novo!</p><button onclick="openFlipCard()" style="padding:8px 20px;background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.3);color:#f87171;border-radius:20px;cursor:pointer;font-size:13px">Tentar de novo</button></div>`;
    return;
    
  }
  if (rec._quotaError) {
    el.innerHTML = `<div style="padding:30px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px"><div style="font-size:40px">⏳</div><p style="color:#94a3b8">Muitas requisições.</p><p style="font-size:12px;color:#475569">Aguarde 1 minutinho e tente de novo!</p><button onclick="openFlipCard()" style="padding:8px 20px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:#fbbf24;border-radius:20px;cursor:pointer;font-size:13px">Tentar de novo</button></div>`;
    return;
  }
  const recId    = rec._tmdbId || "rec_" + Date.now();
  const poster   = rec._poster || null;
  const synopsis = rec._synopsis || rec.synopsis || "";
  const stars    = rec._rating ? `⭐ ${rec._rating}` : "";

  // Registra filme no dicionário local para garantir persistência ao salvar
  if (!movies[recId]) {
    movies[recId] = {
      id: recId,
      title: rec.title,
      year: rec.year,
      genre: rec.genre,
      genreIds: [],
      poster: poster ? poster.replace("w780","w500") : null,
      posterLg: poster,
      rating: rec._rating,
      overview: synopsis,
      type: mediaType
    };
  }

  el.innerHTML = `
    <div class="rec-poster-wrap">
      ${poster ? `<img src="${poster}" class="rec-poster" alt="${rec.title}" onload="this.style.opacity=1" style="opacity:0;transition:opacity .5s"/>` : `<div class="rec-poster-ph">🎬</div>`}
      <div class="rec-poster-glow"></div>
    </div>
    <div class="rec-info">
      <div class="rec-genre-badge">${rec.genre || "Filme"}</div>
      <div class="rec-title">${rec.title}</div>
      <div class="rec-meta">${rec.year || ""} ${stars}${rec.director ? " · Dir. "+rec.director : ""}</div>
      ${rec.cast ? `<div class="rec-cast">🎭 ${rec.cast}</div>` : ""}
      <div class="rec-synopsis">${synopsis}</div>
      ${rec.reason ? `<div class="rec-reason">✨ ${rec.reason}</div>` : ""}
      <div class="rec-btns">
        <button class="rec-btn rec-btn-love"   onclick="rateRec('${recId}','loved',this)">❤️ Já vi e amei</button>
        <button class="rec-btn rec-btn-unseen" onclick="rateRec('${recId}','watchlist',this)">👁️ Quero ver</button>
        <button class="rec-btn rec-btn-nope"   onclick="rateRec('${recId}','disliked',this)">👎 Não curti</button>
        <button class="rec-btn rec-btn-next"   onclick="openFlipCard()">✨ Outra indicação</button>
      </div>
    </div>`;
}

function rateRec(id, val, triggerEl) {
  // Animate card before rating
  const card = document.querySelector(".flip-card");
  if (card && triggerEl) {
    animateRecCard(card, val, triggerEl, () => {
      rate(id, val);
      document.getElementById("flip-modal").classList.add("hidden");
    });
  } else {
    rate(id, val);
    document.getElementById("flip-modal").classList.add("hidden");
  }
}

function animateRecCard(flipCard, val, triggerEl, onDone) {
  const overlay = document.getElementById("rec-anim-overlay");
  const animCard = document.getElementById("rec-anim-card");
  const animTarget = document.getElementById("rec-anim-target");

  // Get positions
  const cardRect = flipCard.getBoundingClientRect();
  const btnRect  = triggerEl.getBoundingClientRect();

  const startX = cardRect.left + cardRect.width / 2;
  const startY = cardRect.top  + cardRect.height / 2;
  const endX   = btnRect.left  + btnRect.width / 2;
  const endY   = btnRect.top   + btnRect.height / 2;

  const tx = endX - startX;
  const ty = endY - startY;

  const config = {
    loved:    { emoji: "❤️", rot: "15deg",  anim: "flyToHeart", targetEmoji: "❤️" },
    disliked: { emoji: "👎", rot: "-20deg", anim: "flyToTrash",  targetEmoji: "🗑️" },
    watchlist:{ emoji: "👁️", rot: "5deg",   anim: "flyToEye",   targetEmoji: "👁️" },
  }[val] || { emoji: "✨", rot: "0deg", anim: "flyToHeart", targetEmoji: "✨" };

  // Get poster from rec card if available
  const poster = document.querySelector(".rec-poster");
  animCard.style.backgroundImage = poster ? `url(${poster.src})` : "";
  animCard.style.backgroundSize = "cover";
  animCard.style.backgroundPosition = "center top";
  animCard.innerHTML = poster ? "" : config.emoji;

  animCard.style.left = startX + "px";
  animCard.style.top  = startY + "px";
  animCard.style.transform = "translate(-50%,-50%) scale(1)";
  animCard.style.setProperty("--tx", tx + "px");
  animCard.style.setProperty("--ty", ty + "px");
  animCard.style.setProperty("--rot", config.rot);
  animCard.style.animation = "none";

  animTarget.style.left = endX + "px";
  animTarget.style.top  = endY + "px";
  animTarget.innerHTML  = config.targetEmoji;
  animTarget.style.transform = "translate(-50%,-50%) scale(0)";

  overlay.classList.remove("hidden");

  // Trigger animation
  requestAnimationFrame(() => {
    animCard.style.animation = `${config.anim} 0.65s cubic-bezier(.4,0,.2,1) forwards`;
    setTimeout(() => {
      animTarget.classList.add("pop");
      if (navigator.vibrate) navigator.vibrate([30, 20, 60]);
    }, 400);
    setTimeout(() => {
      overlay.classList.add("hidden");
      animTarget.classList.remove("pop");
      animCard.style.animation = "none";
      onDone();
    }, 750);
  });
}

// ── Stats ──────────────────────────────────────────
function updateStats() {
  const all   = Object.values(ratings).filter(v => ["loved","meh","disliked"].includes(v)).length;
  const loved = Object.values(ratings).filter(v => v === "loved").length;
  const el1 = document.getElementById("stat-total"); if(el1) el1.textContent = all;
  const el2 = document.getElementById("stat-loved"); if(el2) el2.textContent = loved;
}

function renderStats() {
  const c = document.getElementById("stats-container");
  const all = Object.entries(ratings).filter(([,v]) => ["loved","meh","disliked"].includes(v));
  if (all.length < 3) { c.innerHTML = '<div class="empty-state">Avalie 3+ filmes para ver seus stats!</div>'; return; }

  const loved     = all.filter(([,v]) => v==="loved").length;
  const disliked  = all.filter(([,v]) => v==="disliked").length;
  const meh       = all.filter(([,v]) => v==="meh").length;
  const watchlist = Object.values(ratings).filter(v => v==="watchlist").length;

  const genC = {};
  all.forEach(([id, v]) => {
    const m = movies[id]; if (!m) return;
    const pts = { loved:3, meh:1, disliked:-1 }[v] ?? 0;
    (m.genreIds||[]).forEach(g => { const n = GENRES_PT[g]||TV_GENRES_PT[g]; if(n) genC[n]=(genC[n]||0)+pts; });
  });
  const top = Object.entries(genC).sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>0);

  const byCount = {};
  all.forEach(([id]) => { const m = movies[id]; if(!m) return; (m.genreIds||[]).forEach(g => { const n = GENRES_PT[g]||TV_GENRES_PT[g]; if(n) byCount[n]=(byCount[n]||0)+1; }); });
  const bars = Object.entries(byCount).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const maxB = bars[0]?.[1] || 1;

  c.innerHTML = `
    ${top[0] ? `<div class="top-genre-card"><div class="top-genre-label">SEU GÊNERO FAVORITO</div><div class="top-genre-value">${top[0][0].toUpperCase()}</div><div style="font-size:11px;color:#475569;margin-top:4px">Também curte: ${top.slice(1,4).map(g=>g[0]).join(", ")}</div></div>` : ""}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value" style="color:#fff">${all.length}</div><div class="stat-label">Avaliados</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#4ade80">${loved}</div><div class="stat-label">❤️ Amei</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#fbbf24">${meh}</div><div class="stat-label">😐 Mais ou menos</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#f87171">${disliked}</div><div class="stat-label">👎 Não curti</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#60a5fa">${watchlist}</div><div class="stat-label">👁️ Quero ver</div></div>
    </div>
    <div class="stats-section"><div class="stats-title">POR GÊNERO</div>
      ${bars.map(([g,n])=>`<div class="bar-row"><div class="bar-labels"><span>${g}</span><span>${n}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(n/maxB*100).toFixed(0)}%"></div></div></div>`).join("")}
    </div>`;
}

// ── List (with pagination) ─────────────────────────
function setupListFilters() {
  document.querySelectorAll(".list-filter-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".list-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      listPage = 1;
      renderList(btn.dataset.filter);
    };
  });
}

function renderList(filter) {
  const c = document.getElementById("list-content");
  // Inclui TODOS os ids com esse rating, mesmo sem dados de filme em memória
  const ids = Object.entries(ratings)
    .filter(([,v]) => v === filter)
    .map(([id]) => id);

  if (!ids.length) { c.innerHTML = '<div class="empty-state">Nada aqui ainda!</div>'; return; }

  const total   = ids.length;
  const visible = ids.slice(0, listPage * LIST_PAGE_SIZE);
  const hasMore = total > visible.length;

  c.innerHTML = visible.map(id => {
    const m = movies[id];
    const swipeAttr = filter === "watchlist" ? `data-swipeable="1" data-id="${id}"` : "";
    if (!m) return `
    <div class="list-item-wrap" ${swipeAttr}>
      ${filter === "watchlist" ? `<div class="list-swipe-hint list-swipe-love">❤️ Amei</div><div class="list-swipe-hint list-swipe-nope">👎 Odiei</div>` : ""}
      <div class="list-item">
        <div class="list-thumb-ph">🎬</div>
        <div class="list-info">
          <div class="list-title" style="color:#475569">Filme #${id}</div>
          <div class="list-meta" style="font-size:11px;color:#334155">dados offline</div>
        </div>
        <button class="list-remove" onclick="removeRating('${id}','${filter}')">×</button>
      </div>
    </div>`;
    return `
    <div class="list-item-wrap" ${swipeAttr}>
      ${filter === "watchlist" ? `<div class="list-swipe-hint list-swipe-love">❤️ Amei</div><div class="list-swipe-hint list-swipe-nope">👎 Odiei</div>` : ""}
      <div class="list-item">
        ${m.poster ? `<img class="list-thumb" src="${m.poster}" alt="${m.title}"/>` : `<div class="list-thumb-ph">🎬</div>`}
        <div class="list-info">
          <div class="list-title">${m.title}</div>
          <div class="list-meta">${m.year || ""}${m.genre ? " · "+m.genre : ""}${m.rating ? " · ⭐"+m.rating : ""}${m.type==="tv" ? " · 📺" : ""}</div>
        </div>
        <button class="list-remove" onclick="removeRating('${m.id}','${filter}')">×</button>
      </div>
    </div>`;
  }).join("")
    + (hasMore
        ? `<button class="load-more-btn" onclick="loadMoreList('${filter}')">Ver mais (${total - visible.length} restantes)</button>`
        : `<div class="list-total">${total} ${total === 1 ? "item" : "itens"}</div>`);

  if (filter === "watchlist") setupListSwipe(filter);
}

function loadMoreList(filter) {
  listPage++;
  renderList(filter);
}

function removeRating(id, filter) {
  delete ratings[String(id)];
  saveToFirebase();
  updateStats();
  renderList(filter);

}

function setupListSwipe(filter) {
  document.querySelectorAll(".list-item-wrap[data-swipeable]").forEach(wrap => {
    const id   = wrap.dataset.id;
    const item = wrap.querySelector(".list-item");
    const hintLove = wrap.querySelector(".list-swipe-love");
    const hintNope = wrap.querySelector(".list-swipe-nope");
    let startX = 0, startY = 0, dx = 0, dragging = false, decided = false;

    function onStart(x, y) {
      startX = x; startY = y; dx = 0; dragging = true; decided = false;
      item.style.transition = "none";
    }
    function onMove(x, y) {
      if (!dragging) return;
      dx = x - startX;
      const dy = Math.abs(y - startY);
      // Se moveu mais vertical que horizontal, cancela
      if (dy > Math.abs(dx) && Math.abs(dx) < 10) { dragging = false; reset(); return; }
      item.style.transform = `translateX(${dx}px)`;
      const ratio = Math.min(Math.abs(dx) / 100, 1);
      if (dx > 0) {
        hintLove.style.opacity = ratio;
        hintNope.style.opacity = 0;
        wrap.style.background = `rgba(74,222,128,${ratio * 0.15})`;
      } else {
        hintNope.style.opacity = ratio;
        hintLove.style.opacity = 0;
        wrap.style.background = `rgba(248,113,113,${ratio * 0.15})`;
      }
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      if (Math.abs(dx) > 90) {
        const val = dx > 0 ? "loved" : "disliked";
        const dir = dx > 0 ? "120%" : "-120%";
        item.style.transition = "transform 0.3s ease, opacity 0.3s ease";
        item.style.transform  = `translateX(${dir})`;
        item.style.opacity    = "0";
        if (navigator.vibrate) navigator.vibrate([30, 15, 50]);
        setTimeout(() => {
          ratings[String(id)] = val;
          saveToFirebase(); updateStats();
          renderList(filter);
          toast(val === "loved" ? "❤️ Amei · " + (movies[id]?.title || "") : "👎 Não curti · " + (movies[id]?.title || ""));
        }, 280);
      } else {
        reset();
      }
    }
    function reset() {
      item.style.transition = "transform 0.3s cubic-bezier(.34,1.56,.64,1)";
      item.style.transform  = "translateX(0)";
      item.style.opacity    = "1";
      hintLove.style.opacity = 0;
      hintNope.style.opacity = 0;
      wrap.style.background  = "";
    }

    wrap.addEventListener("touchstart", e => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    wrap.addEventListener("touchmove",  e => {
      const curDx = e.touches[0].clientX - startX;
      const curDy = Math.abs(e.touches[0].clientY - startY);
      // Só previne scroll se for swipe horizontal
      if (Math.abs(curDx) > curDy) e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    wrap.addEventListener("touchend",   () => onEnd());
    wrap.addEventListener("mousedown",  e => onStart(e.clientX, e.clientY));
    wrap.addEventListener("mousemove",  e => { if (dragging) onMove(e.clientX, e.clientY); });
    wrap.addEventListener("mouseup",    () => onEnd());
    wrap.addEventListener("mouseleave", () => { if (dragging) { dragging = false; reset(); } });
  });
}

// ── QUIZ ───────────────────────────────────────────
const QUIZ_THEMES = [
  { id:"terror",   emoji:"👻", label:"Terror" },
  { id:"comedia",  emoji:"😂", label:"Comédia" },
  { id:"drama",    emoji:"😢", label:"Drama" },
  { id:"acao",     emoji:"💥", label:"Ação" },
  { id:"romance",  emoji:"💕", label:"Romance" },
  { id:"ficcao",   emoji:"🚀", label:"Ficção Científica" },
  { id:"suspense", emoji:"🔍", label:"Suspense" },
  { id:"aventura", emoji:"🗺️", label:"Aventura" },
  { id:"anime",    emoji:"⛩️", label:"Anime" },
  { id:"crime",    emoji:"🔫", label:"Crime" },
];

function setupQuiz() {
  document.getElementById("quiz-btn").onclick    = () => openQuizModal();
  document.getElementById("quiz-close").onclick  = () => closeQuizModal();
  document.getElementById("quiz-modal").onclick  = e => { if (e.target === document.getElementById("quiz-modal")) closeQuizModal(); };
}

function openQuizModal() {
  document.getElementById("quiz-modal").classList.remove("hidden");
  quizState = { theme: null, questions: [], currentQ: 0, answers: [] };
  renderQuizThemeSelect();
}

function closeQuizModal() {
  document.getElementById("quiz-modal").classList.add("hidden");
}

function renderQuizThemeSelect() {
  document.getElementById("quiz-body").innerHTML = `
    <div class="quiz-intro">
      <div class="quiz-intro-emoji">🎯</div>
      <div class="quiz-intro-title">Quiz de Gosto</div>
      <div class="quiz-intro-sub">4 perguntas · 1 ${mediaType === "tv" ? "série" : "filme"} perfeito pra você</div>
    </div>
    <div class="quiz-themes">
      ${QUIZ_THEMES.map(t => `
        <button class="quiz-theme-btn" onclick="startQuiz('${t.label}')">
          <span class="qt-emoji">${t.emoji}</span>
          <span class="qt-label">${t.label}</span>
        </button>`).join("")}
    </div>`;
}

async function startQuiz(themeLabel) {
  quizState.theme = themeLabel;
  quizState.answers = [];
  quizState.currentQ = 0;

  document.getElementById("quiz-body").innerHTML =
    `<div class="quiz-loading"><div class="dot-loader"><span></span><span></span><span></span></div><p>Gerando perguntas de ${themeLabel}...</p></div>`;

  const isTV   = mediaType === "tv";
  const prompt = `Você é curador de ${isTV ? "séries" : "filmes"} especialista em ${themeLabel}.
Crie 4 perguntas criativas e divertidas para revelar o gosto específico do usuário dentro de ${themeLabel}.
As perguntas devem ser situacionais ou de preferência (tom, ritmo, cenário, protagonista, atmosfera).

Responda APENAS JSON array, sem markdown:
[
  {"pergunta":"texto","opcoes":["A) texto","B) texto","C) texto","D) texto"]},
  {"pergunta":"texto","opcoes":["A) texto","B) texto","C) texto","D) texto"]},
  {"pergunta":"texto","opcoes":["A) texto","B) texto","C) texto","D) texto"]},
  {"pergunta":"texto","opcoes":["A) texto","B) texto","C) texto","D) texto"]}
]`;

  try {
    const res  = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.GROQ_KEY}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role:"user", content: prompt }], temperature: 0.9, max_tokens: 800 })
    });
    if (res.status === 429) { renderQuizError("rate_limit"); return; }
    const data = await res.json();
    let text = (data?.choices?.[0]?.message?.content || "").trim().replace(/```json|```/g,"").trim();
    const match = text.match(/\[[\s\S]*\]/);
    quizState.questions = JSON.parse(match ? match[0] : text);
    renderQuizQuestion();
  } catch(e) { console.error("[Quiz]", e); renderQuizError("generic"); }
}

function renderQuizQuestion() {
  const q     = quizState.questions[quizState.currentQ];
  const total = quizState.questions.length;
  const curr  = quizState.currentQ + 1;

  document.getElementById("quiz-body").innerHTML = `
    <div class="quiz-progress-wrap">
      <div class="quiz-progress-track">
        <div class="quiz-progress-fill" style="width:${(curr/total)*100}%"></div>
      </div>
      <div class="quiz-progress-label">${quizState.theme} · ${curr}/${total}</div>
    </div>
    <div class="quiz-question">${q.pergunta}</div>
    <div class="quiz-options">
      ${q.opcoes.map((opt, i) => `
        <button class="quiz-option-btn" onclick="answerQuiz(${i}, this)">${opt}</button>
      `).join("")}
    </div>`;
}

function answerQuiz(optIndex, btn) {
  btn.classList.add("selected");
  document.querySelectorAll(".quiz-option-btn").forEach(b => b.disabled = true);

  const q = quizState.questions[quizState.currentQ];
  quizState.answers.push({ pergunta: q.pergunta, resposta: q.opcoes[optIndex] });

  setTimeout(() => {
    quizState.currentQ++;
    if (quizState.currentQ < quizState.questions.length) renderQuizQuestion();
    else getQuizRecommendation();
  }, 500);
}

async function getQuizRecommendation() {
  document.getElementById("quiz-body").innerHTML =
    `<div class="quiz-loading"><div class="dot-loader"><span></span><span></span><span></span></div><p>IA escolhendo o ${mediaType === "tv" ? "série" : "filme"} perfeito...</p></div>`;

  const isTV       = mediaType === "tv";
  const answersText = quizState.answers.map((a,i) => `${i+1}. ${a.pergunta}\nResposta: ${a.resposta}`).join("\n\n");
  const seen        = Object.entries(ratings)
    .filter(([,v]) => ["loved","meh","disliked"].includes(v))
    .map(([id]) => movies[id]?.title).filter(Boolean).slice(0, 20);

  const prompt = `Você é curador de ${isTV ? "séries" : "filmes"} especialista em ${quizState.theme}.
Com base nas respostas do quiz, recomende 1 ${isTV ? "série" : "filme"} PERFEITO.

RESPOSTAS:
${answersText}

JÁ ASSISTIU (não repetir): ${seen.join(", ") || "nenhum"}

Responda APENAS JSON:
{"title":"Título em PT-BR","year":2020,"genre":"${quizState.theme}","director":"Nome","cast":"Ator1, Ator2","synopsis":"2-3 frases sem spoiler.","reason":"Por que estas respostas levam exatamente a este título — 1 frase específica"}`;

  try {
    const res  = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.GROQ_KEY}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role:"user", content: prompt }], temperature: 0.75, max_tokens: 500 })
    });
    if (res.status === 429) { renderQuizError("rate_limit"); return; }
    const data = await res.json();
    let text = (data?.choices?.[0]?.message?.content || "").trim().replace(/```json|```/g,"").trim();
    const match = text.match(/\{[\s\S]*\}/);
    const rec = JSON.parse(match ? match[0] : text);

    document.getElementById("quiz-body").innerHTML =
      `<div class="quiz-loading"><div class="dot-loader"><span></span><span></span><span></span></div><p>Buscando pôster...</p></div>`;
    const tmdbData = await searchTMDB(rec.title, rec.year);
    if (tmdbData) {
      rec._poster   = tmdbData.poster_path  ? TMDB_IMG_LG + tmdbData.poster_path : null;
      rec._synopsis = tmdbData.overview     || rec.synopsis;
      rec._tmdbId   = String(tmdbData.id);
      rec._rating   = tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : null;
    }
    renderQuizResult(rec);
  } catch(e) { console.error("[Quiz rec]", e); renderQuizError("generic"); }
}

function renderQuizResult(rec) {
  const recId    = rec._tmdbId || "qrec_" + Date.now();
  const poster   = rec._poster || null;
  const synopsis = rec._synopsis || rec.synopsis || "";
  const stars    = rec._rating ? `⭐ ${rec._rating}` : "";

  if (!movies[recId]) {
    movies[recId] = { id: recId, title: rec.title, year: rec.year, genre: rec.genre, genreIds: [], poster: poster ? poster.replace("w780","w500") : null, posterLg: poster, rating: rec._rating, overview: synopsis, type: mediaType };
  }

  document.getElementById("quiz-body").innerHTML = `
    <div class="quiz-result-badge">🎯 ${quizState.theme}</div>
    <div class="quiz-result-card">
      ${poster ? `<img src="${poster}" class="quiz-result-poster" onload="this.style.opacity=1" style="opacity:0;transition:opacity .4s" alt="${rec.title}"/>` : `<div class="quiz-result-poster-ph">🎬</div>`}
      <div class="quiz-result-info">
        <div class="rec-genre-badge">${rec.genre || quizState.theme}</div>
        <div class="rec-title">${rec.title}</div>
        <div class="rec-meta">${rec.year || ""} ${stars}${rec.director ? " · Dir. "+rec.director : ""}</div>
        ${rec.cast ? `<div class="rec-cast">🎭 ${rec.cast}</div>` : ""}
        <div class="rec-synopsis">${synopsis}</div>
        ${rec.reason ? `<div class="rec-reason">✨ ${rec.reason}</div>` : ""}
      </div>
    </div>
    <div class="quiz-result-btns">
      <button class="rec-btn rec-btn-love"   onclick="rateRec('${recId}','loved',this)">❤️ Já vi e amei</button>
      <button class="rec-btn rec-btn-unseen" onclick="rateRec('${recId}','watchlist',this)">👁️ Quero ver</button>
      <button class="rec-btn rec-btn-nope"   onclick="rateRec('${recId}','disliked',this)">👎 Não curti</button>
      <button class="rec-btn rec-btn-next"   onclick="renderQuizThemeSelect()">🔄 Novo quiz</button>
    </div>`;
}

function renderQuizError(type) {
  const msg = type === "rate_limit" ? "⏳ Aguarde 1 minuto e tente de novo." : "⚠️ Erro ao gerar quiz.";
  document.getElementById("quiz-body").innerHTML = `
    <div style="padding:40px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px">
      <div style="font-size:48px">${type === "rate_limit" ? "⏳" : "⚠️"}</div>
      <p style="color:#94a3b8">${msg}</p>
      <button onclick="renderQuizThemeSelect()" class="load-more-btn">Voltar</button>
    </div>`;
}


// ── Ambilight — CSS background-image (sem CORS, funciona sempre) ──────────
function updateAmbilight(posterUrl) { /* ambilight desativado */ }
// ── Helpers ────────────────────────────────────────
async function refill() { await loadContent(); rebuildStack(); }

let _toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 2400);
}

// ── PWA Setup ──────────────────────────────────────
function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('✅ Service Worker registrado com sucesso!', reg.scope))
        .catch(err => console.warn('❌ Falha ao registrar Service Worker:', err));
    });
  }
}
setupPWA();

// (Opcional) Capturar o evento de instalação para criar um botão personalizado no futuro
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('💡 PWA pronto para instalar! (O navegador mostrará o ícone na barra de endereços)');
});

// ── Tutorial ───────────────────────────────────────
let tutSlide = 0;
const TUT_TOTAL = 6;

function setupTutorial() {
  document.getElementById("how-to-btn").onclick = openTutorial;
  document.getElementById("tut-close").onclick  = closeTutorial;
  document.getElementById("tut-modal").onclick  = e => { if (e.target === document.getElementById("tut-modal")) closeTutorial(); };
  document.getElementById("tut-next").onclick   = nextTutSlide;
}

function openTutorial() {
  tutSlide = 0;
  updateTutSlide();
  document.getElementById("tut-modal").classList.remove("hidden");
}

function closeTutorial() {
  document.getElementById("tut-modal").classList.add("hidden");
}

function nextTutSlide() {
  if (tutSlide < TUT_TOTAL - 1) {
    tutSlide++;
    updateTutSlide();
  } else {
    closeTutorial();
  }
}

function updateTutSlide() {
  document.querySelectorAll(".tut-slide").forEach((s, i) => {
    s.classList.toggle("active", i === tutSlide);
    s.classList.toggle("prev",   i < tutSlide);
  });
  document.querySelectorAll(".tut-dot").forEach((d, i) => {
    d.classList.toggle("active", i === tutSlide);
  });
  const btn = document.getElementById("tut-next");
  btn.textContent = tutSlide === TUT_TOTAL - 1 ? "Entendi! 🎬" : "Próximo";
}



