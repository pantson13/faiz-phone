const APP_CACHE = "faiz-app-v47";
const AUDIO_CACHE = "faiz-audio-v3";
const MUSIC_CACHE = "faiz-music-v2";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/ui.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  /*
   * 安装阶段不再预缓存音频。
   * 避免 GitHub Pages 部署尚未完全传播时抢先缓存旧声音。
   */
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) =>
        Promise.allSettled(
          CORE_ASSETS.map((url) => cache.add(url))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) =>
              (
                key.startsWith("faiz-pwa-")
                || key.startsWith("faiz-app-")
                || key.startsWith("faiz-audio-")
                || key.startsWith("faiz-music-")
              )
              && ![
                APP_CACHE,
                AUDIO_CACHE,
                MUSIC_CACHE
              ].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isAudioRequest(url){
  /*
   * GitHub Pages 项目站点通常是：
   * /仓库名/assets/xxx.m4a
   *
   * 旧版要求路径从根目录 assets 开头，因此会判断失败。
   */
  return /\.(m4a|mp3|wav|mp4)$/i.test(url.pathname);
}

function decodedPathname(url){
  try{
    return decodeURIComponent(url.pathname);
  }catch{
    return url.pathname;
  }
}

function isMusicRequest(url){
  const pathname=decodedPathname(url);

  return (
    pathname.endsWith(
      "/assets/The people with no name.m4a"
    )
    || pathname.endsWith(
      "/assets/EGO~eyes glazing over.m4a"
    )
  );
}

function cacheForAudio(url){
  return isMusicRequest(url)
    ? MUSIC_CACHE
    : AUDIO_CACHE;
}

async function putInCache(request,response,cacheName){
  if(
    !response
    || !response.ok
    || response.status!==200
  ){
    return;
  }

  const cache=await caches.open(cacheName);
  await cache.put(request,response.clone());
}

async function appCacheFirst(request,event){
  const cache=await caches.open(APP_CACHE);
  const cached=await cache.match(request);

  if(cached) return cached;

  const response=await fetch(request);

  if(response && response.ok){
    event.waitUntil(
      putInCache(request,response,APP_CACHE)
    );
  }

  return response;
}

async function navigationNetworkFirst(request,event){
  try{
    const response=await fetch(
      new Request(request,{cache:"reload"})
    );

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

async function audioNetworkRefresh(request,event){
  const url=new URL(request.url);
  const cacheName=cacheForAudio(url);
  const cache=await caches.open(cacheName);

  /*
   * 音频优先从网络强制重新验证，成功后覆盖当前缓存。
   * 只有网络失败才回退本地音频缓存。
   */
  try{
    const freshRequest=new Request(
      request,
      {cache:"reload"}
    );

    const response=await fetch(freshRequest);

    if(response && response.ok){
      event.waitUntil(
        putInCache(request,response,cacheName)
      );

      return response;
    }
  }catch{}

  const cached=await cache.match(request);

  if(cached) return cached;

  return new Response("Audio unavailable",{
    status:503,
    headers:{
      "Content-Type":"text/plain; charset=utf-8"
    }
  });
}

async function createRangeResponse(request,cachedResponse){
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

      const fetchRequest=new Request(
        url.href,
        {method:"GET",cache:"reload"}
      );

      try{
        const response=await fetch(fetchRequest);

        await putInCache(
          new Request(url.href,{method:"GET"}),
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

  if(request.mode==="navigate"){
    event.respondWith(
      navigationNetworkFirst(request,event)
    );
    return;
  }

  if(
    request.headers.has("range")
    && isAudioRequest(url)
  ){
    event.respondWith(
      (async()=>{
        const fullRequest=new Request(
          request.url,
          {method:"GET"}
        );

        const cacheName=cacheForAudio(url);
        const cache=await caches.open(cacheName);
        const cached=await cache.match(fullRequest);

        if(cached){
          return createRangeResponse(request,cached);
        }

        return fetch(
          new Request(request,{cache:"reload"})
        );
      })()
    );
    return;
  }

  /*
   * 所有音频都进入独立音频缓存，不再误入 APP_CACHE。
   */
  if(isAudioRequest(url)){
    event.respondWith(
      audioNetworkRefresh(request,event)
    );
    return;
  }

  event.respondWith(
    appCacheFirst(request,event).catch(async()=>{
      const cache=await caches.open(APP_CACHE);
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
