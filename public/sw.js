const CACHE_NAME = 'ggms-grocery-cache-v2';
const OFFLINE_URL = '/offline.html';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event: pre-cache static layout elements and offline fallback page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline fallback and static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: intercept network requests
self.addEventListener('fetch', (event) => {
  // Skip caching entirely on localhost for development to prevent stale assets
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    return;
  }

  // Only handle GET requests and skip browser extensions or non-HTTP protocols
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle requests for HTML pages (navigation requests)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If response is valid, clone and cache it
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fetch fails, look in cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Fallback to offline.html
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // For other static assets (js, css, images, fonts), use a Cache-First falling back to Network strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached asset, but fetch in the background to update cache (stale-while-revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            /* ignore background fetch errors */
          });
        return cachedResponse;
      }

      // Network fallback
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        });
    })
  );
});

self.addEventListener('push', (event) => {
  let title = 'GGM&S Grocery';
  let body = 'New offers and updates waiting for you!';
  let url = '/';

  if (event.data) {
    try {
      const payload = event.data.json();
      // FCM wraps notification payload in payload.notification or payload.data
      const notification = payload.notification || (payload.data && payload.data.notification ? JSON.parse(payload.data.notification) : payload);
      title = notification.title || payload.title || title;
      body = notification.body || payload.body || body;
      
      const customData = payload.data || payload;
      url = customData.url || url;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png', // Small monochrome image for android notification bar
    vibrate: [100, 50, 100],
    data: {
      url: url
    },
    actions: [
      { action: 'open_url', title: 'Open App' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }

  const targetUrl = event.notification.data ? event.notification.data.url : '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Periodic Background Sync event handler
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-product-catalog') {
    console.log('[Service Worker] Periodic background sync running: updating product catalog');
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch('/').then((response) => {
          if (response.status === 200) {
            return cache.put('/', response);
          }
        });
      })
    );
  }
});

// One-shot Background Sync event handler
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-orders') {
    console.log('[Service Worker] One-shot background sync running: syncing pending orders');
    // Background task implementation for when connection recovers
  }
});
