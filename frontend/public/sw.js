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

const CACHE = 'eventmanager-app-v2';

// Der Rahmen, ohne den gar nichts geht.
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

/*
 * Die gebauten Dateien unter /assets/ tragen einen Hash im Namen, der sich
 * mit jedem Build aendert - eine fest eingetragene Liste waere nach dem
 * naechsten Build falsch. Deshalb wird beim Installieren die index.html
 * gelesen und daraus geholt, was sie tatsaechlich laedt.
 *
 * Sie erst beim Abruf einzusammeln reicht nicht: der Service Worker
 * uebernimmt die Kontrolle erst NACH dem ersten Laden der Seite. Die
 * Dateien des ersten Besuchs laufen also nie durch den fetch-Handler und
 * landen nie im Cache. Beim naechsten Aufruf ohne Empfang kaeme dann zwar
 * die index.html aus dem Cache - die Seite bliebe aber leer, weil das
 * Skript dazu fehlt.
 */
const appDateien = async () => {
  try {
    const res = await fetch('/index.html', { cache: 'reload' });
    const html = await res.text();
    return [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((pfad) => pfad.startsWith('/assets/'));
  } catch {
    return [];
  }
};

// Einzeln statt addAll: sonst faellt die ganze Liste aus, wenn eine
// Datei fehlt - und die App startet ohne Netz gar nicht mehr.
const cacheEinzeln = (cache, urls) =>
  Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cacheEinzeln(cache, SHELL);
      await cacheEinzeln(cache, await appDateien());
      await self.skipWaiting();
    })()
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
