/*
 * Web Push for the intranet: shows a notification when one arrives while no
 * intranet tab is visible (a visible tab already shows it in the bell), and
 * opens its link on click. Registered by PushSubscriptionSync only for people
 * who switched on browser notifications.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Advantis Intranet" };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => client.visibilityState === "visible")) return;
      await self.registration.showNotification(data.title || "Advantis Intranet", {
        body: data.body || undefined,
        tag: data.id,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { link: data.link || "/notifications" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(link, self.location.origin);
  // Only ever open intranet pages.
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url.href);
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
