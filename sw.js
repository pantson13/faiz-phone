const CACHE = 'faiz-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : 0)))
      .then(() => self.clients.claim())
  );
});

// 导航：优先网络，失败回退缓存（便于你更新后生效）
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(()=>{});
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 其他资源：缓存优先回退网络
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

