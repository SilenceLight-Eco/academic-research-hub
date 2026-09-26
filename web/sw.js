self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
    for (var i = 0; i < clients.length; i++) {
      if ('focus' in clients[i]) return clients[i].focus();
    }
    return self.clients.openWindow('./workbench.html');
  }));
});
