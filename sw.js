// ══════════════════════════════════════════
//  Service Worker — ميزانيتي
//  استراتيجية هجينة:
//    - HTML: Network-First (ديما آخر نسخة، fallback للكاش)
//    - JS/CSS/JSON: Stale-While-Revalidate (سريع + تحديث خلفي)
//    - أصول ثابتة (fonts, libs): Cache-First
// ══════════════════════════════════════════

// ⚠️ بدل هاد الرقم فكل مرة كتنشر نسخة جديدة
const VERSION = '2.0.2';
const CACHE_NAME = `miyzaniyati-${VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './chart.umd.min.js'
];

const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&family=Cairo:wght@300;400;600;700&display=swap',
  'https://fonts.gstatic.com/'
];

// HTML → Network-First
const NETWORK_FIRST_PATTERNS = [
  /\.html?$/i,
  /\/$/           // المسار الجذري (root)
];

// JS / CSS / JSON → Stale-While-Revalidate
const SWR_PATTERNS = [
  /\.(js|css|json)$/i
];

// ─── 1. Install ───
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);

      await Promise.allSettled(
        EXTERNAL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] ⚠️ فشل تخزين:', url, err))
        )
      );

      await self.skipWaiting();
    })()
  );
});

// ─── 2. Activate ───
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] 🗑️ حذف الكاش القديم:', key);
            return caches.delete(key);
          })
      );
      await self.clients.claim();

      // ⚡ تنبيه جميع الصفحات المفتوحة أن نسخة جديدة ولات نشيطة
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATED', version: VERSION });
      });
    })()
  );
});

// ─── 3. Fetch ───
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  const isAllowedExternal = EXTERNAL_ASSETS.some(allowed => {
    try {
      const a = new URL(allowed);
      return a.origin === url.origin;
    } catch { return false; }
  });

  if (!isSameOrigin && !isAllowedExternal) return;

  const path = url.pathname;

  // اختيار الاستراتيجية
  if (isSameOrigin && NETWORK_FIRST_PATTERNS.some(re => re.test(path))) {
    event.respondWith(networkFirst(request));
  } else if (isSameOrigin && SWR_PATTERNS.some(re => re.test(path))) {
    event.respondWith(staleWhileRevalidate(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

// ══════════════════════════════════════════
//  الاستراتيجيات
// ══════════════════════════════════════════

// ─── Network-First: HTML ───
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // فشلت الشبكة → نرجعو للكاش
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.headers.get('accept')?.includes('text/html')) {
      const offline = await cache.match('./index.html');
      if (offline) return offline;
    }

    return new Response('⚠️ أنت غير متصل بالإنترنت', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ─── Stale-While-Revalidate: JS/CSS/JSON ───
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // نجيبو النسخة الجديدة فالخلفية (بلا ما نسنّاو المستخدم)
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  // نرجعو الكاش فوراً إلا كان، وإلا نستناو الشبكة
  return cached || (await fetchPromise) || new Response('', { status: 503 });
}

// ─── Cache-First: fonts / libs ───
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    if (request.headers.get('accept')?.includes('text/html')) {
      const offline = await caches.match('./index.html');
      if (offline) return offline;
    }
    return new Response('⚠️ أنت غير متصل بالإنترنت', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}