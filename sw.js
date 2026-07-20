const CACHE_NAME = "faiz-pwa-v7";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/ui.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.allSettled(
          APP_SHELL.map((url) => cache.add(url))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  /*
   * 音频代码使用 HEAD 探测文件扩展名。
   * 离线时，若 GET 文件已经被动态缓存，
   * HEAD 请求仍返回成功。
   */
  if (request.method === "HEAD") {
    event.respondWith(
      caches.match(new Request(request.url, { method: "GET" }))
        .then((cached) => {
          if (cached) {
            return new Response(null, {
              status: 200,
              statusText: "OK",
              headers: cached.headers
            });
          }

          return fetch(request);
        })
    );
    return;
  }

  if (request.method !== "GET") return;

  /*
   * 网络优先，成功后更新缓存。
   * 离线时使用缓存。
   */
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy=response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy));
        }

        return response;
      })
      .catch(async () => {
        const cached=await caches.match(request);

        if (cached) return cached;

        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return new Response("Offline", {
          status:503,
          headers:{
            "Content-Type":"text/plain; charset=utf-8"
          }
        });
      })
  );
});
