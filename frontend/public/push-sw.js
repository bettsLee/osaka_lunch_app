// '다녀왔어요?' 알림만 받는 서비스 워커 (화면 캐시는 하지 않음)
// 서버가 보낸 알림을 띄우고, 누르면 앱을 열어 질문 카드를 보여 줌
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// 휴대폰 언어 문구는 앱이 열릴 때 저장해 둔 것(/push-text.json)을 씀. 없으면 서버가 보낸 한국어
async function pushText(data) {
  try {
    const saved = await caches.match("/push-text.json");
    const t = saved ? await saved.json() : null;
    if (t && t.title && t.body && data.shop) {
      const body = t.body.replace("{shop}", () => data.shop).replace("{limit}", () => data.limit || ""); // 가게 이름의 $ 같은 글자를 그대로
      return { title: t.title, body };
    }
  } catch {
    // 저장해 둔 문구를 못 읽으면 서버 문구
  }
  return { title: data.title || "다녀왔어요?", body: data.body || "" };
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // 내용을 못 읽어도 알림은 띄움 (아이폰은 알림 없이 끝나면 구독을 끊음)
  }
  event.waitUntil(
    pushText(data).then((text) =>
      self.registration.showNotification(text.title, {
        body: text.body,
        tag: data.tag || "visit",
        icon: "/icons/icon-192.png",
        data: { url: data.url || "/" },
      }),
    ),
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
