// Shell only. Audio is deliberately never cached without explicit download opt-in.
const CACHE='gfv-room-shell-v3';
const SHELL=['./','./index.html','./room.css?v=restricted-2','./app.js?v=restricted-2','./player.mjs','./catalog.json','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gfv-room-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||/\.(mp3|m4a|wav|ogg)$/i.test(url.pathname)||event.request.headers.has('Range'))return;
  const shellURLs=SHELL.map(p=>new URL(p,self.registration.scope).href);
  if(!shellURLs.includes(url.href)&&event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{if(response.ok&&shellURLs.includes(url.href)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;}).catch(async()=>{const cached=await caches.match(event.request);if(cached)return cached;if(event.request.mode==='navigate')return caches.match(new URL('./index.html',self.registration.scope));return new Response('Offline',{status:503});}));
});
