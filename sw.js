// 修改版本号可强制客户端更新缓存
const CACHE = 'faiz-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // 预缓存音频（与仓库文件名一致，使用相对路径）
  'assets/open phone.m4a',
  'assets/ring.m4a',
  'assets/enter.m4a',
  'assets/key1.m4a',
  'assets/key5_2.m4a',
  'assets/key5_3.m4a',
  'assets/stand by.m4a',
  'assets/complete.m4a',
  'assets/103.m4a',
  'assets/106.m4a',
  'assets/3821.m4a'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => k !== CACHE ? caches.delete(k) : Promise.resolve())
    )).then(() => self.clients.claim())
  );
});

// 导航：优先网络，失败回退缓存（便于你更新）
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
  // 其他资源：缓存优先，回退网络
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
