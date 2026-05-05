const CACHE_NAME = 'band-planning-v10';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/css/calendar.css',
  '/css/sidebar.css',
  '/css/settings_modal.css',
  '/css/statistics.css',
  '/js/config.js',
  '/js/logger.js',
  '/js/proxy-service.js',
  '/js/supabase.js',
  '/js/storage.js',
  '/js/auth.js',
  '/js/email-service.js',
  '/js/bands.js',
  '/js/pdf-generator.js',
  '/js/events.js',
  '/js/rehearsals.js',
  '/js/statistics.js',
  '/js/calendar.js',
  '/js/personal-calendar.js',
  '/js/churchtools-api.js',
  '/js/musikpool.js',
  '/js/ui.js',
  '/js/feedback-service.js',
  '/js/chordpro-converter.js',
  '/js/notifications.js',
  '/js/app.js',
  '/images/branding/bandmate-logo-only.svg',
  '/images/branding/bandmate-logo-only-dark.svg'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  Logger.info('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        Logger.info('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        Logger.error('[SW] Cache installation failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  Logger.info('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            Logger.info('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Strategy: Network First, fallback to Cache
self.addEventListener('fetch', (event) => {
  // Skip for external resources
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              Logger.info('[SW] Serving from cache:', event.request.url);
              return response;
            }
            // If not in cache, return offline page or error
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Background Sync (optional for future)
self.addEventListener('sync', (event) => {
  Logger.info('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Implement background sync logic here
  Logger.info('[SW] Syncing data...');
}

// Push Notifications (optional for future)
self.addEventListener('push', (event) => {
  Logger.info('[SW] Push notification received');
  const options = {
    body: event.data ? event.data.text() : 'Neue Benachrichtigung',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('Bandmate', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  Logger.info('[SW] Notification clicked');
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
