// The production build substitutes the version and exact static asset list.
const cacheName = 'ai-life-shell-__VERSION__';
const shellFiles = __SHELL_FILES__;
const pages = ['/', '/wardrobe', '/diet', '/home', '/travel', '/spending', '/settings'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shellFiles)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('ai-life-shell-') && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate' && pages.includes(url.pathname);
  const path = navigation ? '/index.html' : url.pathname;
  if (!shellFiles.includes(path)) return;
  event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(path)) ?? fetch(event.request)));
});
