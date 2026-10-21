import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Osaka Lunch",
  description: "오늘 점심 영업하는 990엔 이하 가게를 룰렛으로 골라 줘요",
  manifest: "/manifest.json",
  // 아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어서, 홈 화면 아이콘 · 앱 모드 설정
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Osaka Lunch" },
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
