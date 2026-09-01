/*
 * Service Worker: Web Push UND Offline-Betrieb.
 *
 * Bisher konnte er nur Push-Nachrichten - kein fetch-Handler, kein Cache.
 * Ohne Netz zeigte die App deshalb die Fehlerseite des Browsers, auch vom
 * Startbildschirm aus.
 *
 * Jetzt: die App-Dateien liegen im Cache, damit die App offline startet.
 * API-Antworten werden hier NICHT zwischengespeichert - um die Aufgaben
 * kuemmert sich die App selbst (utils/offlineStore.ts). Sonst haetten wir
 * zwei Speicher mit womoeglich verschiedenen Staenden.
 */

const CACHE = 'eventmanager-app-v1';

// Der Rahmen, ohne den gar nichts geht. Die gehashten Dateien unter
// /assets/ kommen beim ersten Besuch von selbst dazu (siehe fetch).
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => clients.claim())
  );
});

const istApi = (url) => url.pathname.startsWith('/api/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API und SSE laufen immer direkt ins Netz. Ein zwischengespeicherter
  // Aufgabenstand hier wuerde dem widersprechen, was die App selbst
  // gespeichert hat.
  if (istApi(url)) return;

  // Seitenaufrufe: erst Netz, sonst die gespeicherte Startseite. So sieht
  // man ohne Empfang die App statt der Browser-Fehlerseite.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const kopie = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', kopie));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // Dateien mit Inhalts-Hash im Namen aendern sich nie - erst Cache, und
  // was fehlt, wird beim ersten Mal nachgelegt.
  event.respondWith(
    caches.match(req).then((treffer) => {
      if (treffer) return treffer;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const kopie = res.clone();
          caches.open(CACHE).then((c) => c.put(req, kopie));
        }
        return res;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let data = {
    title: 'Benachrichtigung',
    body: 'Sie haben eine neue Benachrichtigung',
    icon: '/icon-192.png',
    tag: 'default',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'default',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Öffnen',
      },
      {
        action: 'close',
        title: 'Schließen',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Öffne die App
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Fokussiere ein existierendes Fenster
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }

      // Öffne ein neues Fenster
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
