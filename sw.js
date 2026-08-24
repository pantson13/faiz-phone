/*
 * FAIZ v72：网络直通、无持久缓存 Service Worker
 * 不创建程序、短音效或歌曲缓存。
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) =>
              key.startsWith("faiz-pwa-")
              || key.startsWith("faiz-app-")
              || key.startsWith("faiz-audio-")
              || key.startsWith("faiz-music-")
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", () => {
  /* v48 不处理 CACHE_MEDIA，不写入 Cache Storage。 */
});

self.addEventListener("fetch", (event) => {
  const request=event.request;
  const url=new URL(request.url);

  if(url.origin!==self.location.origin) return;
  if(request.method!=="GET") return;
  if(request.cache==="only-if-cached") return;

  event.respondWith(
    fetch(new Request(request,{cache:"no-store"}))
  );
});
