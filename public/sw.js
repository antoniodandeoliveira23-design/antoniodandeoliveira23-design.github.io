/**
 * AGORA — Service Worker
 *
 * Estratégias de cache:
 *   /_expo/** e /assets/**  → Cache First  (bundles imutáveis com hash no nome)
 *   Navegação (HTML)        → Network First + fallback offline
 *   Supabase / externos     → Ignorado (passa direto para a rede)
 *
 * Fluxo de atualização:
 *   1. Nova versão deployada → index.html muda (referencia novos hashes de bundle)
 *   2. SW busca index.html pela rede, detecta diferença, notifica o app
 *   3. App exibe "Atualização disponível — toque para recarregar"
 */

const SHELL_CACHE  = 'agora-shell-v1';
const STATIC_CACHE = 'agora-static-v1';
const ALL_CACHES   = [SHELL_CACHE, STATIC_CACHE];

// ── Install: pré-carrega o shell (index.html) ─────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add('/'))
      .then(() => self.skipWaiting())   // ativa imediatamente, sem esperar fechar abas
  );
});

// ── Activate: limpa caches antigos e assume o controle ────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())  // controla abas abertas sem precisar recarregar
  );
});

// ── Fetch: intercepta requisições ────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignora requisições externas (Supabase, Leaflet CDN, CartoDB tiles, etc.)
  if (url.hostname !== self.location.hostname) return;

  // Ignora Edge Functions do Supabase (nunca cacheamos dados dinâmicos)
  if (url.pathname.startsWith('/functions/')) return;

  // ── Bundles e assets imutáveis: Cache First ──────────────────────────────
  // /_expo/static/js/...  →  hash no nome = nunca muda = pode cachear para sempre
  // /assets/images/...    →  idem
  if (
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // ── Navegação (HTML): Network First + fallback offline ───────────────────
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(req));
    return;
  }

  // ── Demais recursos do mesmo domínio: Stale-While-Revalidate ────────────
  // (robots.txt, sitemap.xml, sw.js, og-image.png, etc.)
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

// ── Recebe mensagens do app ───────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Estratégias de cache
// ─────────────────────────────────────────────────────────────────────────────

/** Cache First — retorna cache imediatamente, busca na rede apenas se não encontrar */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    console.warn('[SW] Cache miss e rede falhou:', request.url, err);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network First para navegação.
 * Tenta buscar index.html da rede. Se offline, serve o cache.
 * Notifica o app quando detecta nova versão (ETag diferente).
 */
async function networkFirstNavigate(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request, { cache: 'no-cache' });

    if (response.ok) {
      // Verifica se houve atualização comparando ETag / Last-Modified
      const cached = await cache.match(request);
      if (cached) {
        const oldEtag = cached.headers.get('etag') || cached.headers.get('last-modified');
        const newEtag = response.headers.get('etag') || response.headers.get('last-modified');
        if (oldEtag && newEtag && oldEtag !== newEtag) {
          notificarAtualizacao();
        }
      }

      cache.put(request, response.clone());
    }

    return response;
  } catch {
    // Offline: serve do cache
    const cached = await cache.match(request) || await cache.match('/');
    if (cached) return cached;
    // Último recurso: página offline simples
    return new Response(offlinePage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/** Stale-While-Revalidate — retorna cache imediatamente e atualiza em background */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

/** Notifica todas as abas abertas sobre nova versão disponível */
function notificarAtualizacao() {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage({ tipo: 'ATUALIZACAO_DISPONIVEL' }));
  });
}

/** Página mínima exibida quando não há cache e o usuário está offline */
function offlinePage() {
  return `<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#1A0B2E;color:#fff;font-family:system-ui,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:100vh;text-align:center;padding:24px}
  .logo{width:72px;height:72px;background:#000;border-radius:16px;
    display:flex;align-items:center;justify-content:center;
    font-size:36px;font-weight:700;margin-bottom:16px}
  h1{font-size:28px;letter-spacing:4px;margin-bottom:8px}
  p{color:rgba(255,255,255,.6);font-size:15px;line-height:1.6;max-width:280px;margin-bottom:24px}
  button{background:#7B2FBE;color:#fff;border:none;border-radius:10px;
    padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer}
</style></head>
<body>
  <div class="logo">A</div>
  <h1>AGORA</h1>
  <p>Você está sem conexão. Verifique sua internet e tente novamente.</p>
  <button onclick="location.reload()">Tentar novamente</button>
</body></html>`;
}
