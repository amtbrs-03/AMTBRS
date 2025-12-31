/**
 * ERN Çiçek - Service Worker
 * PWA offline desteği ve cache yönetimi
 */

const CACHE_NAME = 'ern-cicek-v1';
const STATIC_ASSETS = [
  '/',
  '/anasayfa.html',
  '/products.json',
  '/site-settings.json',
  '/manifest.json',
  '/lib/cache.js',
  '/lib/mojibake.js',
  '/lib/index.js'
];

// Dinamik cache için URL pattern'leri
const CACHE_PATTERNS = {
  images: /\.(jpg|jpeg|png|gif|webp|svg)$/i,
  fonts: /\.(woff|woff2|ttf|otf|eot)$/i,
  styles: /\.css$/i
};

// Install - statik dosyaları cache'le
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Cache failed:', err))
  );
});

// Activate - eski cache'leri temizle
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - network first, cache fallback stratejisi
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // API istekleri için cache kullanma (güncel veri önemli)
  if (url.pathname.includes('/users/') || 
      url.pathname.includes('/carts/') || 
      url.pathname.includes('/orders/') ||
      url.hostname.includes('workers.dev') ||
      url.hostname.includes('api.github.com')) {
    return; // Network-only
  }

  // Statik dosyalar için stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networked = fetch(event.request)
        .then(response => {
          // Başarılı response'ları cache'le
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline ise ve cache'te varsa, onu döndür
          if (cached) return cached;
          
          // HTML istekleri için offline sayfası
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/anasayfa.html');
          }
          
          return new Response('Offline', { status: 503 });
        });
      
      // Cache varsa hemen döndür, arka planda güncelle
      return cached || networked;
    })
  );
});

// Push notifications
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Yeni bildirim',
    icon: '/images/icons/icon-192x192.png',
    badge: '/images/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/anasayfa.html'
    },
    actions: [
      { action: 'open', title: 'Aç' },
      { action: 'close', title: 'Kapat' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'ERN Çiçek', options)
  );
});

// Bildirime tıklama
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // Açık pencere varsa odaklan
      for (const client of windowClients) {
        if (client.url.includes('ern-cicek') && 'focus' in client) {
          return client.focus();
        }
      }
      // Yoksa yeni pencere aç
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

// Background sync (sepet senkronizasyonu için)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-cart') {
    event.waitUntil(syncCart());
  }
});

async function syncCart() {
  // Offline'dayken yapılan sepet değişikliklerini senkronize et
  console.log('[SW] Syncing cart...');
  // Bu fonksiyon frontend'den tetiklenecek
}
