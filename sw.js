// ══════════════════════════════════════════
//  Service Worker — ميزانيتي
//  استراتيجية: Cache First + Network Fallback
// ══════════════════════════════════════════

const CACHE_NAME = 'miyzaniyati-v1';

// الملفات الأساسية اللي كيتخزنو فور التثبيت
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];

// ملفات خارجية (CDN) — نخزنها بشكل منفصل باش ما نفشلوش التثبيت
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&family=Cairo:wght@300;400;600;700&display=swap'
];

// ─── 1. تثبيت الـ SW: تخزين الملفات ───
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 1. تخزين الملفات المحلية (إلزامية)
      await cache.addAll(CORE_ASSETS);

      // 2. محاولة تخزين الملفات الخارجية (بدون فشل التثبيت)
      await Promise.allSettled(
        EXTERNAL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] ⚠️ فشل تخزين:', url, err))
        )
      );

      // تفعيل SW الجديد فوراً بدون انتظار
      await self.skipWaiting();
    })()
  );
});

// ─── 2. تفعيل الـ SW: تنظيف الكاش القديم ───
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
    })()
  );
});

// ─── 3. اعتراض الطلبات ───
self.addEventListener('fetch', event => {
  const { request } = event;

  // نتجاهل الطلبات غير GET (مثل POST)
  if (request.method !== 'GET') return;

  // نتجاهل الطلبات لمواقع أخرى خارج نطاقنا (إلا لو كانت ضمن القائمة المسموحة)
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isAllowedExternal = EXTERNAL_ASSETS.some(allowed =>
    request.url.startsWith(allowed.split('?')[0])
  );

  if (!isSameOrigin && !isAllowedExternal) return;

  event.respondWith(
    (async () => {
      // 1. نحاول نلقاو النسخة في الكاش أولاً
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;

      // 2. ماشي في الكاش → نطلبو من الشبكة
      try {
        const networkResponse = await fetch(request);

        // 3. إذا الاستجابة ناجحة، نخزنوها للاستخدام المستقبلي
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch (err) {
        // 4. فشلت الشبكة وما كاينة نسخة في الكاش
        // إذا كان طلب HTML، نرجعو index.html المحفوظ
        if (request.headers.get('accept')?.includes('text/html')) {
          const offlinePage = await caches.match('./index.html');
          if (offlinePage) return offlinePage;
        }

        return new Response('⚠️ أنت غير متصل بالإنترنت', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});