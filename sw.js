const CACHE='btb-v8';
self.addEventListener('install',e=>{
  e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  // Network-first for HTML navigation — always fetch fresh so deployments take effect
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)));
    return;
  }
  // Cache-first for static assets (JS, CSS, images, fonts)
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fresh=fetch(e.request).then(r=>{
        if(r&&r.status===200){
          const rc=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,rc));
        }
        return r;
      }).catch(()=>cached);
      return cached||fresh;
    })
  );
});
