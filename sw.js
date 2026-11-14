/* TF2 Voice Emulator — service worker.
 * The app shell is precached so the tool still loads offline / as an installed
 * PWA. Cache strategy is split by request type:
 *
 *   - Code & markup (document / script / style, and the scripts workers and
 *     audio worklets load): NETWORK-FIRST, cache fallback.
 *     These change on every edit, so a normal reload always fetches the latest
 *     when online — no hard refresh needed. The cache is used only when the
 *     network fails (offline), and each successful fetch refreshes that copy.
 *     The network is asked with cache: 'no-cache': the browser's own HTTP
 *     cache may hold a copy that is still fresh by its headers (GitHub Pages
 *     sends index.html with max-age=600, measured on the live site on
 *     2026-11-12, and the other files so too, inferred), and 'no-cache' has
 *     the browser check that copy with the server before using it. Without
 *     it a visit after an update could get the old page, or a page whose
 *     markup and scripts are of two versions, which cannot start.
 *     What this branch hands the page for anything but a navigation, from
 *     the network or the cache, says Cache-Control: no-cache, so the page's
 *     own memory cache asks this worker again instead of reusing a script.
 *
 *   - Everything else (icons, manifest, favicon): CACHE-FIRST for speed. These
 *     rarely change; when they do, bump CACHE below to evict the old generation.
 *
 * The install fetches every file with cache: 'reload', past the browser's HTTP
 * cache, so a new generation never stores a copy left from the one before.
 */

const CACHE_PREFIX = 'tf2ve-';
const CACHE = `${CACHE_PREFIX}v49`;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './constants.js',
  './steam-sender.js',
  './voice-channel.js',
  './vendor/swresample/swresample.js',
  './vendor/swresample/COPYING.LGPLv2.1',
  './room-presets.js',
  './room-dsp.js',
  './engine/dsp.js',
  './engine/gain.js',
  './engine/mix.js',
  './engine/network.js',
  './engine/codec.js',
  './engine/room.js',
  './engine/steam.js',
  './engine/render.js',
  './engine/render-stream.js',
  './engine/live-chain.js',
  './audio.js',
  './audio-worker.js',
  './opus-codec.mjs',
  './vendor/libopus/index.mjs',
  './vendor/libopus/generated/libopus.generated.mjs',
  './vendor/libopus-1.1/index.mjs',
  './vendor/libopus-1.1/libopus-1.1.5.wasm.mjs',
  './vendor/celt-0.11/index.mjs',
  './vendor/celt-0.11/celt-0.11.wasm.mjs',
  './vendor/speex-1.0.2/index.mjs',
  './vendor/speex-1.0.2/speex-1.0.2.wasm.mjs',
  './vendor/voxware-vr12/index.mjs',
  './vendor/voxware-vr12/voxware-vr12.wasm.mjs',
  './vendor/lame/index.mjs',
  './vendor/lame/lame-3.100.wasm.mjs',
  './flac.js',
  './formats.js',
  './zip.js',
  './meter.js',
  './reference.js',
  './video.js',
  './filerate.js',
  './demo.js',
  './live.js',
  './live-worker.js',
  './live-worklet.js',
  './mic-capture.js',
  './app/core.js',
  './app/rooms.js',
  './app/console.js',
  './app/source.js',
  './app/render.js',
  './app/meter.js',
  './app/realtake.js',
  './app/visualizer.js',
  './app/netgraph.js',
  './app/boot.js',
  './batch.js',
  './favicon.ico',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Best-effort: stash a fresh same-origin response so the offline copy stays current.
function cachePut(request, response) {
  try {
    if (response && response.ok && new URL(request.url).origin === location.origin) {
      const copy = response.clone();
      return caches.open(CACHE).then((c) => c.put(request, copy));
    }
  } catch (err) { /* opaque / cross-origin — skip caching */ }
  return Promise.resolve();
}

// A copy of a response for the page that says Cache-Control: no-cache (the
// network's or the cache's; the cache keeps the server's headers). Only a
// whole same-origin response with a body is copied; a navigation's, an opaque
// redirect, an error, a 204 or 205 (no body), or one reached through a
// redirect (whose address the copy, with no URL of its own, would lose; such
// a script can still be reused from the tab's memory cache, and no file of
// the site is reached through one) goes out as it is. If making the copy
// throws, the response goes out as it is: nothing has read its body by then.
function askAgain(request, response) {
  if (request.mode === 'navigate' || !response || !response.ok || response.type !== 'basic' || response.redirected ||
      response.status === 204 || response.status === 205) return response;
  try {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (err) {
    return response;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Code & markup: try the network first so plain reloads reflect the latest
  // edit; fall back to the cached copy (or the app shell) only when offline.
  // Workers and audio worklets load their scripts with their own
  // destinations; they must stay in step with the page's code.
  const isLive = req.mode === 'navigate' ||
                 ['document', 'script', 'style', 'worker', 'sharedworker', 'audioworklet'].includes(req.destination);

  // The response goes out whether or not the cache takes a copy of it.
  const keep = (resp) => {
    try { e.waitUntil(cachePut(req, resp).catch(() => {})); } catch (err) { /* event already settled */ }
    return resp;
  };

  // A navigation given options becomes a same-origin request (Fetch, the
  // Request constructor) and keeps its redirect mode, manual, so a redirect
  // still goes back to the browser to follow.
  if (isLive) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(keep)
        .then((resp) => askAgain(req, resp))
        .catch(() => caches.match(req).then((hit) => {
          if (hit) return askAgain(req, hit);
          return req.mode === 'navigate' ? caches.match('./index.html') : Response.error();
        }))
    );
    return;
  }

  // Static assets: cache-first for speed, populate the cache on first miss.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then(keep))
  );
});
