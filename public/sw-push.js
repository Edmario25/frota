/**
 * sw-push.js — Push event handler importado pelo service worker gerado pelo VitePWA.
 * Cuida de notificações push recebidas quando o app está em background.
 */

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'Frota App', body: event.data.text() }; }

  var title   = data.title || 'Frota App';
  var options = {
    body:   data.body  || '',
    icon:   '/pwa-192x192.png',
    badge:  '/pwa-192x192.png',
    tag:    data.tag   || 'escala-notif',
    renotify: true,
    data:   { url: data.url || '/app' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf('/app') !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
