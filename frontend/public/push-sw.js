// '다녀왔어요?' 알림만 받는 서비스 워커 (화면 캐시는 하지 않음)
// 서버가 보낸 알림을 띄우고, 누르면 앱을 열어 질문 카드를 보여 줌
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // 내용을 못 읽어도 알림은 띄움 (아이폰은 알림 없이 끝나면 구독을 끊음)
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "다녀왔어요?", {
      body: data.body || "",
      tag: data.tag || "visit",
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const win of windows) {
        if (new URL(win.url).origin !== self.location.origin) continue;
        await win.focus();
        try {
          await win.navigate(url); // 열려 있던 앱을 새로 열어 질문 카드를 다시 불러옴
          return;
        } catch {
          break; // 이 창을 못 옮기면 새로 엶
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
