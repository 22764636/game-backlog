const CACHE='btb-v6';
self.addEventListener('install',e=>{
  e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim()).then(()=>
      // Force all open pages to reload so they get fresh HTML (not stale cached version)
      self.clients.matchAll({type:'window'}).then(clients=>
        Promise.all(clients.map(c=>c.navigate(c.url)))
      )
    )
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Never cache HTML — always fetch fresh so deployments take effect immediately
  if(url.pathname.endsWith('/')||url.pathname.endsWith('.html')){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
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
