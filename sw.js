const CACHE='m-chem-v3-theme-1';
const FILES=['./','./index.html','./style.css','./app.js','./questions.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('chem-pocket-')||k.startsWith('m-chem-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='CACHE_STATUS')e.waitUntil(caches.open(CACHE).then(async c=>{const entries=await Promise.all(FILES.map(f=>c.match(new URL(f,self.registration.scope).href)));e.ports[0]?.postMessage({ok:entries.every(Boolean)})}))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const cached=await c.match(e.request);if(cached)return cached;if(e.request.mode==='navigate'){const home=await c.match(new URL('./index.html',self.registration.scope).href);if(home)return home}return fetch(e.request)}))});

