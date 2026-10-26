import type { Metadata, Viewport } from "next";
import "./globals.css";

// 두 손가락 확대를 막지 않음 (10/26 접근성 점검: 최대 배율 1이면 안드로이드에서 글자를 키울 수 없음).
// 대신 입력칸 · 고르기 칸 글자를 16px 이상으로 둬서 아이폰이 입력할 때 화면을 확대하지 않게
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// 카톡 · 라인 · X에 링크를 보냈을 때 뜨는 미리보기 (10/21 결정: 영어 + 일본어. 받는 사람마다 다르게는 못 함)
const PREVIEW_TITLE = "Osaka ¥990 Lunch | 大阪990円ランチ";
const PREVIEW_TEXT =
  "Today's lunch near you for ¥990 or less, picked in one tap. 今日ランチ営業中の990円以下のお店をルーレットで1軒選びます。";
const PREVIEW_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Osaka ¥990 Lunch" };

export const metadata: Metadata = {
  metadataBase: new URL("https://osaka-lunch-app.vercel.app"), // 미리보기 그림 주소를 운영 주소로
  title: "Osaka Lunch",
  description: "오늘 점심 영업하는 990엔 이하 가게를 룰렛으로 골라 줘요",
  manifest: "/manifest.json",
  // 아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어서, 홈 화면 아이콘 · 앱 모드 설정
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" }, // icon: 브라우저 탭 아이콘 (없으면 favicon.ico 404)
  appleWebApp: { capable: true, title: "Osaka Lunch" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Osaka Lunch",
    title: PREVIEW_TITLE,
    description: PREVIEW_TEXT,
    images: [PREVIEW_IMAGE],
  },
  twitter: { card: "summary_large_image", title: PREVIEW_TITLE, description: PREVIEW_TEXT, images: [PREVIEW_IMAGE] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
