const CACHE_NAME = "faiz-pwa-v41";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/ui.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

/*
 * OPEN PHONE 后会同步使用的常用短音效。
 * 安装后尽量在后台提前保存，后续启动直接从本地读取。
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
  "./assets/qj.m4a"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.allSettled(
          [...CORE_ASSETS, ...ESSENTIAL_AUDIO]
            .map((url) => cache.add(url))
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

async function putInCache(request, response) {
  if(!response || !response.ok || response.status !== 200) return;

  const cache=await caches.open(CACHE_NAME);
  await cache.put(request,response.clone());
}

async function cacheFirst(request) {
  const cached=await caches.match(request);

  if(cached) return cached;

  const response=await fetch(request);
  await putInCache(request,response);

  return response;
}

async function networkFirst(request) {
  try{
    const response=await fetch(request);
    await putInCache(request,response);
    return response;
  }catch{
    const cached=await caches.match(request);

    if(cached) return cached;

    return caches.match("./index.html");
  }
}

async function createRangeResponse(request,cachedResponse) {
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
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start<0 ||
    start>=size ||
    end<start
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
  headers.set("Content-Range",`bytes ${start}-${end}/${size}`);
  headers.set("Content-Length",String(sliced.byteLength));

  return new Response(sliced,{
    status:206,
    statusText:"Partial Content",
    headers
  });
}

/*
 * 页面在首次播放完整音乐时发送消息，
 * Service Worker 在后台保存完整文件。
 */
self.addEventListener("message", (event) => {
  const data=event.data;

  if(!data || data.type!=="CACHE_MEDIA" || !data.url) return;

  event.waitUntil(
    (async()=>{
      const url=new URL(data.url);

      if(url.origin!==self.location.origin) return;

      const request=new Request(url.href,{method:"GET"});
      const cached=await caches.match(request);

      if(cached) return;

      try{
        const response=await fetch(request);
        await putInCache(request,response);
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
   * 页面文档网络优先，确保代码更新不会长期卡在旧版本。
   */
  if(request.mode==="navigate"){
    event.respondWith(networkFirst(request));
    return;
  }

  /*
   * 音乐可能发出 Range 请求。
   * 若完整文件已缓存，直接从本地生成分段响应。
   */
  if(request.headers.has("range")){
    event.respondWith(
      (async()=>{
        const fullRequest=new Request(request.url,{method:"GET"});
        const cached=await caches.match(fullRequest);

        if(cached){
          return createRangeResponse(request,cached);
        }

        return fetch(request);
      })()
    );
    return;
  }

  /*
   * 图片、图标、音频、脚本等静态资源缓存优先。
   */
  event.respondWith(
    cacheFirst(request).catch(async()=>{
      const cached=await caches.match(request);

      if(cached) return cached;

      return new Response("Offline",{
        status:503,
        headers:{
          "Content-Type":"text/plain; charset=utf-8"
        }
      });
    })
  );
});
