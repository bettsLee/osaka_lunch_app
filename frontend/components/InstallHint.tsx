"use client";

// 아이폰 홈 화면 추가 안내 (10/21 결정: 홈 아래 작은 배너). 아이폰은 홈 화면에 추가한 앱에서만 알림이 와서
// 아이폰을 브라우저로 연 사람에게만 보이고, 닫으면 이 휴대폰에서는 다시 안 보임
import { useState } from "react";
import { useT } from "./I18n";
import { svg } from "./icons";

export default function InstallHint({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#D6D4CC] bg-[#F4F3EF] px-3.5 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <p className="flex-1 leading-snug">{t("install.title")}</p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-my-1.5 h-11 flex-none px-1.5 font-semibold text-[#1A3F91]"
        >
          {t("install.how")}
        </button>
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={onClose}
          className="-my-1.5 -mr-2 flex h-11 w-11 flex-none items-center justify-center text-[#5F5E58]"
        >
          <svg {...svg} width={18} height={18}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {open && (
        <ol className="mt-1 flex list-decimal flex-col gap-1 pb-1 pl-5 text-[13px] leading-relaxed text-[#5F5E58]">
          <li>{t("install.step1")}</li>
          <li>{t("install.step2")}</li>
          <li>{t("install.step3")}</li>
        </ol>
      )}
    </div>
  );
}
