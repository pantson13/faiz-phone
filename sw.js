const CACHE_NAME = "faiz-pwa-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/ui.jpg",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 单个文件缺失时不让整个 PWA 安装失败。
      await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url))
      );
    }).then(() => self.skipWaiting())
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
   * 原页面会用 HEAD 探测 m4a/mp3/wav/mp4。
   * 离线时，如果对应 GET 文件已缓存，就返回一个成功的 HEAD 响应。
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
   * 网络优先：
   * 你替换 ui.jpg 或更新代码后，会优先取得新版；
   * 断网时再回退到手机本地缓存。
   */
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
  );
});
