"use client";

// 불러오는 중: 도는 표시 + 5초가 지나면 '서버를 깨우는 중' 안내 (10/22 화면 점검 07: 무료 서버가 잠들면 처음 열 때 최대 1분)
import { useEffect, useState } from "react";
import { useT } from "./I18n";
import Shokken from "./Shokken";

export default function Waiting({ text }: { text: string }) {
  const { t } = useT();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-[#5F5E58]" role="status" aria-live="polite">
      {/* 11/23: 빙글 도는 원 대신 제자리에서 통통 뛰는 식권이 */}
      <Shokken size={64} className="shokken-bob" />
      <p>{text}</p>
      {slow && <p className="max-w-[280px] text-[13px] leading-relaxed">{t("common.waking")}</p>}
    </div>
  );
}
