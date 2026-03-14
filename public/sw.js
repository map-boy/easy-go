// Easy GO Service Worker — Push Notifications
// Place this file at: public/sw.js

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', function(event) {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'Easy GO', body: event.data?.text() || '' }; }

  const title = data.title || 'Easy GO';
  const options = {
    body:    data.body    || 'You have a new notification',
    icon:    data.icon    || '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag:     data.tag     || 'easygо-default',
    renotify: true,
    data:    { url: data.url || '/' },
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If app already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});