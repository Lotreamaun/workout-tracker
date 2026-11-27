/* global self, URL */

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTIFICATION_TAG = 'rest-ended';

function isUuid(value) {
  return typeof value === 'string' && SESSION_ID_RE.test(value);
}

function readPayload(event) {
  try {
    return event.data?.json();
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  if (payload?.type !== NOTIFICATION_TAG) return;

  event.waitUntil(self.registration.showNotification('Отдых окончен', {
    body: 'Нажмите, чтобы вернуться к тренировке',
    icon: '/pwa-192x192.png',
    tag: NOTIFICATION_TAG,
    data: isUuid(payload.sessionId) ? { sessionId: payload.sessionId } : undefined,
  }));
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== NOTIFICATION_TAG) return;
  event.notification.close();
  const sessionId = event.notification.data?.sessionId;
  event.waitUntil(openApp(isUuid(sessionId) ? '/sessions/' + sessionId : '/'));
});

async function openApp(path) {
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window' });
  const matchingWindow = windows.find((client) => client.url === url);

  for (const client of matchingWindow ? [matchingWindow, ...windows.filter((item) => item !== matchingWindow)] : windows) {
    try {
      if (client.url === url) {
        await client.focus();
        return;
      }
      const focused = await client.focus();
      if (await focused.navigate(url)) return;
    } catch {
      // Вкладка могла закрыться после matchAll. Попробуем следующее окно.
    }
  }
  await self.clients.openWindow(url);
}
