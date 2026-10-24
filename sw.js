/**
 * sw.js — Service Worker de SmartDispatch (CeDis VHSA)
 *
 * Estrategia (deliberadamente simple, sin build step, consistente con
 * el resto del proyecto):
 *
 *  1) SHELL_ASSETS: un puñado de archivos fijos (entrada de la app,
 *     manifest, iconos, librerías vendorizadas) se precachean en
 *     `install`. Es la lista mínima para que la app arranque offline.
 *
 *  2) Todo lo demás del mismo origen (src/**, estilos, etc.) se cachea
 *     "al vuelo" con estrategia stale-while-revalidate: la primera vez
 *     que se pide un archivo se guarda en cache; después, cada visita
 *     sirve la copia cacheada al instante Y dispara en paralelo un
 *     fetch de red para refrescar la cache para la próxima vez.
 *     Ventaja clave: si mañana se agrega un archivo nuevo en src/,
 *     NO hay que tocar este service worker — se auto-registra solo.
 *
 *  3) Llamadas a Supabase (otro origen) NUNCA se tocan — pasan directo
 *     a la red. Los datos de despacho son en vivo, cachearlos sería
 *     mostrar información vieja a quien la necesita fresca.
 *
 * Para forzar que los clientes recojan una versión nueva del shell,
 * subí el número en CACHE_VERSION — los caches viejos se borran solos
 * en `activate`.
 */

const CACHE_VERSION = 'v9'; // oct-2026 (v9: export sin +6 h (ExcelJS/UTC); marca HUB en DETTE; CAJAS '3T'; entregas sin PDF se quitan; modal de modo antes de la app y en cada apertura. v8: processors/desco.js -- las CAJAS del HUB ahora suman las de las tiendas desconsolidadas. v7: modo macro / sin macro -- features/source-mode.js + ui/mode-modal.js; se retira shipment-status.js. v6: se eliminan las macros -- processors/ruteo-status.js y desco.js; fuerza a los clientes a traer los modulos nuevos. v5: processors/unified-routes.js -- asigna bloque->ruta de PDFs unificados segun el Excel. v4: fix de particion por remolque en rutas unificadas con tiendas, processors/pdf.js -- evita que stale-while-revalidate siga sirviendo el parser viejo desde cache). v3: se agrega vendor/exceljs.min.js (export.js ahora escribe el xlsx con ExcelJS) -- fuerza a los clientes ya instalados a traer la librería nueva.
const SHELL_CACHE = `smartdispatch-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `smartdispatch-runtime-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/exceljs.min.js',
  './vendor/supabase-js.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function staleWhileRevalidate(request) {
  return caches.open(RUNTIME_CACHE).then((cache) => {
    const networkFetch = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    return cache.match(request).then((cached) => cached || networkFetch);
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return; // Supabase y cualquier otro origen: directo a red.

  event.respondWith(staleWhileRevalidate(request));
});
