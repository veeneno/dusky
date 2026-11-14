// Sem cache de páginas privadas. Este worker existe apenas para notificações.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    if (!event.data) return;
    const payload = event.data.json();
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return;
    const response = await fetch(`/api/push/message/${Number(payload.messageId)}?endpoint=${encodeURIComponent(sub.endpoint)}`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (data.userId !== payload.userId) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some(w => w.focused && new URL(w.url).pathname === '/app.html')) return;
    await self.registration.showNotification(data.title, { body: data.body, tag: `dusky-${data.channelId}`, data });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const d = event.notification.data;
  const url = `/app.html?pushChannel=${Number(d.channelId)}&pushServer=${d.serverId == null ? '' : Number(d.serverId)}&pushMessage=${Number(d.messageId)}`;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(w => new URL(w.url).pathname === '/app.html');
    if (existing) { existing.postMessage({ type: 'push_open', data: d }); await existing.focus(); }
    else await self.clients.openWindow(url);
  })());
});
