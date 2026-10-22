import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  // 맛집 추천 짧은 링크 (10/22 결정): /r/k7Qx2 → 앱이 코드를 서버에 물어 가게 번호를 받음
  async redirects() {
    return [{ source: "/r/:code", destination: "/?ref=share&c=:code", permanent: false }];
  },
};

export default withPWA({
  dest: "public",
  disable: true,
})(nextConfig);
