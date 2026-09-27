// Service Worker：ネットワーク優先（最新データを取得）、オフライン時はキャッシュを使う。
// ユニットを追加したら CACHE の番号を上げ、PRECACHE に data/unitNN.json を足すこと。
// GitHub Pages は max-age=600 を返すので、ブラウザのHTTPキャッシュを通さず必ずサーバーに確認する。
const CACHE = 'esp4-v6';
const PRECACHE = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'data/units.json',
  'data/glossary.json',
  'data/verbs.json',
  'data/unit01.json',
  'data/unit02.json',
  'data/unit03.json',
  'data/unit04.json',
  'data/unit05.json',
  'data/unit06.json',
  'data/unit07.json',
  'data/unit08.json',
  'data/unit09.json',
  'data/unit10.json',
  'data/unit11.json',
  'data/unit12.json',
  'data/unit13.json',
  'data/unit14.json',
  'data/unit15.json',
  'data/unit16.json',
  'data/unit17.json',
  'data/unit18.json',
  'data/unit19.json',
  'data/unit20.json',
  'data/unit21.json',
  'data/unit22.json',
  'data/unit23.json',
  'data/unit24.json',
  'data/unit25.json',
];
const TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        fetch(req.url, { cache: 'no-cache' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
