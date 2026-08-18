const CACHE_NAME='naf-socio-pwa-v2';
const STATIC_ASSETS=['./socio-app.html','./css/socio-app.css','./manifest.webmanifest','./icons/icon-192.svg','./icons/icon-512.svg','./imagens/logo.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  const dynamic=['/js/socio-app.js','/js/supabase-config.js','/service-worker.js'];
  if(dynamic.some(path=>url.pathname.endsWith(path))){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
    return;
  }

  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{
    if(response.ok&&response.type==='basic'){
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));
    }
    return response;
  })));
});
