/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// Precache all assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Runtime caching for Supabase
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  })
);

// Cache puzzles longer
registerRoute(
  ({ url }) => url.pathname.includes('/puzzles/') && url.pathname.endsWith('.json'),
  new CacheFirst({
    cacheName: 'puzzle-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
      }),
    ],
  })
);

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options: NotificationOptions & { vibrate?: number[]; requireInteraction?: boolean } = {
    body: data.body || "Don't lose your streak! Complete today's puzzle.",
    icon: '/robozzle/icon-192.png',
    badge: '/robozzle/icon-192.png',
    tag: 'streak-reminder',
    data: { url: data.url || '/robozzle/daily' },
    vibrate: [100, 50, 100],
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'RoboZZle', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/robozzle/daily';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Check if a window is already open
      for (const client of clients) {
        if (client.url.includes('/robozzle') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open a new window if none found
      return self.clients.openWindow(url);
    })
  );
});
