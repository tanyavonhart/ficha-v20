/**
 * Service worker da Ficha V20
 * - Guarda os arquivos da ficha para abrir sem internet (iPhone, iPad, Android, desktop).
 * - Arquivos da ficha: rede primeiro (atualizações chegam na hora), cache se estiver offline.
 * - Fontes do Google: cache primeiro (a folha de estilo se atualiza sozinha).
 * - Discord, hospedagem de imagens e qualquer POST passam direto, sem cache.
 * Ao publicar uma versão nova, troque CACHE_VERSION.
 */
const CACHE_VERSION = 'ficha-v20-2.1';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const FONT_CACHE = 'ficha-v20-fonts';

const CORE_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './v20-automacoes.js',
  './audio-lareira.m4a',
  './audio-lareira.ogg',

  './qualidades-defeitos-data.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png'
];

const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    // Um arquivo ausente não impede a instalação dos demais
    await Promise.all(CORE_FILES.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* segue sem este arquivo */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('ficha-v20-') && k !== CORE_CACHE && k !== FONT_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// A página pede para ativar a versão nova (botão "Atualizar")
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

async function networkFirst(request) {
  const cache = await caches.open(CORE_CACHE);
  // Links de rolagem (?rolar=...) usam a mesma página guardada, sem multiplicar o cache
  const url = new URL(request.url);
  url.search = '';
  const key = request.mode === 'navigate' ? url.href : request;
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(key, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const fast = await Promise.race([network, timeout]);
    if (fast) return fast;
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || await network;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw e;
  }
}

/**
 * Fontes do Google:
 * - arquivos de fonte (gstatic) nunca mudam: cache primeiro;
 * - a folha de estilo (googleapis): usa o cache e atualiza em segundo plano.
 * Só respostas bem-sucedidas são guardadas, para uma falha de rede não ficar presa no cache.
 */
async function fontStrategy(event) {
  const { request } = event;
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    if (new URL(request.url).hostname === 'fonts.googleapis.com') event.waitUntil(refresh);
    return cached;
  }
  const res = await refresh;
  return res || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isFontRequest(url)) {
    event.respondWith(fontStrategy(event));
    return;
  }
  // Só os arquivos deste site; o resto (Discord, imagens externas, compêndios) passa direto
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;

  event.respondWith(networkFirst(request));
});
