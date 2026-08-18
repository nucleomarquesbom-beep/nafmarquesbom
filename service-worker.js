const CACHE='naf-socio-v1';
const SHELL=['./socio-app.html','./css/socio-app.css','./js/socio-app.js','./js/supabase-config.js','./manifest.webmanifest','./icons/icon-192.svg','./icons/icon-512.svg','./imagens/logo.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin)return;
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.ok&&r.type==='basic')caches.open(CACHE).then(cache=>cache.put(e.request,r.clone()));return r;}).catch(()=>caches.match('./socio-app.html'))));
});
