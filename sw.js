const APP_CACHE = "faiz-app-v45";
const AUDIO_CACHE = "faiz-audio-v1";
const MUSIC_CACHE = "faiz-music-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/ui.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

/*
 * 只在安装阶段预热最常用的短音效。
 * 后续新增代码版本不会清空 AUDIO_CACHE，
 * 除非显式升级 AUDIO_CACHE 的版本号。
 */
const ESSENTIAL_AUDIO = [
  "./assets/open phone.m4a",
  "./assets/ring.m4a",
  "./assets/enter.m4a",
  "./assets/key1.m4a",
  "./assets/key5_2.m4a",
  "./assets/key5_3.m4a",
  "./assets/stand by.m4a",
  "./assets/complete.m4a",
  "./assets/error.m4a",
  "./assets/ready.m4a",
  "./assets/s-ready.m4a",
  "./assets/exceed charge.m4a",
  "./assets/release.m4a",
  "./assets/3821.m4a",
  "./assets/weaponHit.m4a",
  "./assets/qj.m4a",
  "./assets/seed-end.m4a"
];

const MUSIC_PATHS = new Set([
  "/assets/The people with no name.m4a",
  "/assets/EGO~eyes glazing over.m4a"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_CACHE)
        .then((cache) =>
          Promise.allSettled(
            CORE_ASSETS.map((url) => cache.add(url))
          )
        ),
      caches.open(AUDIO_CACHE)
        .then((cache) =>
          Promise.allSettled(
            ESSENTIAL_AUDIO.map((url) => cache.add(url))
          )
        )
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => {
              if(key.startsWith("faiz-pwa-")) return true;

              if(
                key.startsWith("faiz-app-")
                && key !== APP_CACHE
              ){
                return true;
              }

              if(
                key.startsWith("faiz-audio-")
                && key !== AUDIO_CACHE
              ){
                return true;
              }

              if(
                key.startsWith("faiz-music-")
                && key !== MUSIC_CACHE
              ){
                return true;
              }

              return false;
            })
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isAudioRequest(url){
  return (
    url.pathname.startsWith("/assets/")
    && /\.(m4a|mp3|wav|mp4)$/i.test(url.pathname)
  );
}

function cacheForUrl(url){
  if(MUSIC_PATHS.has(url.pathname)){
    return MUSIC_CACHE;
  }

  if(isAudioRequest(url)){
    return AUDIO_CACHE;
  }

  return APP_CACHE;
}

async function putInCache(
  request,
  response,
  cacheName
){
  if(
    !response
    || !response.ok
    || response.status !== 200
  ){
    return;
  }

  const cache=await caches.open(cacheName);
  await cache.put(request,response.clone());
}

async function cacheFirst(
  request,
  cacheName,
  event
){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);

  if(cached) return cached;

  const response=await fetch(request);

  if(response && response.ok){
    /*
     * 首次网络响应立即交给页面，
     * 缓存写入放在 event.waitUntil 中后台完成。
     */
    event.waitUntil(
      putInCache(request,response,cacheName)
    );
  }

  return response;
}

async function networkFirst(request,event){
  try{
    const response=await fetch(request);

    if(response && response.ok){
      event.waitUntil(
        putInCache(request,response,APP_CACHE)
      );
    }

    return response;
  }catch{
    const cache=await caches.open(APP_CACHE);
    const cached=await cache.match(request);

    if(cached) return cached;

    return cache.match("./index.html");
  }
}

async function createRangeResponse(
  request,
  cachedResponse
){
  const range=request.headers.get("range");
  const match=/bytes=(\d*)-(\d*)/.exec(range || "");

  if(!match) return cachedResponse;

  const buffer=await cachedResponse.arrayBuffer();
  const size=buffer.byteLength;

  let start;
  let end;

  if(match[1]==="" && match[2]!==""){
    const suffixLength=Math.min(
      size,
      Number.parseInt(match[2],10)
    );

    start=Math.max(0,size-suffixLength);
    end=size-1;
  }else{
    start=Number.parseInt(match[1] || "0",10);
    end=match[2]
      ? Number.parseInt(match[2],10)
      : size-1;
  }

  if(
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || start<0
    || start>=size
    || end<start
  ){
    return new Response(null,{
      status:416,
      headers:{
        "Content-Range":`bytes */${size}`
      }
    });
  }

  end=Math.min(end,size-1);

  const sliced=buffer.slice(start,end+1);
  const headers=new Headers(cachedResponse.headers);

  headers.set("Accept-Ranges","bytes");
  headers.set(
    "Content-Range",
    `bytes ${start}-${end}/${size}`
  );
  headers.set(
    "Content-Length",
    String(sliced.byteLength)
  );

  return new Response(sliced,{
    status:206,
    statusText:"Partial Content",
    headers
  });
}

/*
 * 完整歌曲由页面在长按 pointerdown 时发送缓存请求。
 */
self.addEventListener("message", (event) => {
  const data=event.data;

  if(
    !data
    || data.type!=="CACHE_MEDIA"
    || !data.url
  ){
    return;
  }

  event.waitUntil(
    (async()=>{
      const url=new URL(data.url);

      if(url.origin!==self.location.origin) return;

      const request=new Request(
        url.href,
        {method:"GET"}
      );

      const cache=await caches.open(MUSIC_CACHE);
      const cached=await cache.match(request);

      if(cached) return;

      try{
        const response=await fetch(request);
        await putInCache(
          request,
          response,
          MUSIC_CACHE
        );
      }catch{}
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request=event.request;
  const url=new URL(request.url);

  if(url.origin!==self.location.origin) return;
  if(request.method!=="GET") return;

  /*
   * 页面网络优先，确保 index.html 更新及时。
   */
  if(request.mode==="navigate"){
    event.respondWith(
      networkFirst(request,event)
    );
    return;
  }

  /*
   * 已完整缓存的歌曲支持 Range 响应。
   */
  if(request.headers.has("range")){
    event.respondWith(
      (async()=>{
        const fullRequest=new Request(
          request.url,
          {method:"GET"}
        );

        const musicCache=await caches.open(MUSIC_CACHE);
        const audioCache=await caches.open(AUDIO_CACHE);

        const cached=
          await musicCache.match(fullRequest)
          || await audioCache.match(fullRequest);

        if(cached){
          return createRangeResponse(
            request,
            cached
          );
        }

        return fetch(request);
      })()
    );

    return;
  }

  const cacheName=cacheForUrl(url);

  event.respondWith(
    cacheFirst(
      request,
      cacheName,
      event
    ).catch(async()=>{
      const cache=await caches.open(cacheName);
      const cached=await cache.match(request);

      if(cached) return cached;

      return new Response("Offline",{
        status:503,
        headers:{
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      });
    })
  );
});
