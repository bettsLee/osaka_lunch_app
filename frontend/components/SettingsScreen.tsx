"use client";

// S8 설정 (와이어프레임 v1 + 10/21 추가): 언어 · 알림 · 가격 상한 안내 · 개인정보 안내 · 이용 안내 · 의견 보내기 · 출처 · 버전
// 알림은 '여기 갈래요' 뒤에서만 켤 수 있었어서(10/21 밤 테스트) 여기서도 켜고, 거절했으면 다시 켜는 방법을 알려 줌
import { useEffect, useState } from "react";
import pkg from "../package.json";
import { currentPushState, deviceNumber, enablePush, sendOpinion } from "@/lib/api";
import { track, trackError } from "@/lib/analytics";
import { isIOS, type PushState } from "@/lib/push";
import { ALLERGENS, hasDiet, loadDiet, saveDiet, STYLES, type Allergen, type Diet } from "@/lib/diet";
import { useT } from "./I18n";
import { svg } from "./icons";

type View = "main" | "privacy" | "terms" | "opinion" | "diet";

const SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7); // Vercel이 넣어 주는 커밋 (내 컴퓨터에는 없음)
const VERSION = SHA ? `${pkg.version} (${SHA})` : pkg.version;
const MAX_OPINION = 1000; // 서버와 같음 (OpinionController.MAX_LENGTH)

// 개인정보 안내 · 이용 안내 (초안: 10/25 체크인에서 상권 검토)
const PRIVACY = [
  "privacy.intro", "privacy.location", "privacy.diet", "privacy.visits", "privacy.answers", "privacy.push", "privacy.opinions", "privacy.share",
  "privacy.events", "privacy.vendors", "privacy.delete", "privacy.keep", "privacy.updated",
];
const TERMS = ["terms.free", "terms.data", "terms.liability", "terms.change", "terms.updated"];

export default function SettingsScreen({ limit }: { limit: number }) {
  const { t } = useT();
  const [view, setView] = useState<View>("main");
  const [diet, setDiet] = useState<Diet>(() => loadDiet()); // 이 휴대폰에만 저장
  const [device, setDevice] = useState<string | null>(null); // 기기 번호 (문의 · 베타 지표에서 상권 기기 빼기용)
  useEffect(() => {
    deviceNumber().then(setDevice);
  }, []);
  const back = () => setView("main");

  if (view === "privacy") return <Doc title={t("settings.privacy")} keys={PRIVACY} onBack={back} />;
  if (view === "terms") return <Doc title={t("settings.terms")} keys={TERMS} onBack={back} />;
  if (view === "opinion") return <OpinionForm onBack={back} />;
  if (view === "diet") {
    return (
      <DietForm
        diet={diet}
        onChange={(next) => {
          setDiet(next);
          saveDiet(next);
        }}
        onBack={back}
      />
    );
  }

  return (
    <>
      <header className="border-b border-[#E2E0D8] px-5 pb-3.5 pt-5">
        <h1 className="text-[22px] font-semibold">{t("settings.title")}</h1>
      </header>
      {/* 카드는 줄어들지 않게 (flex-none): 화면이 낮으면 카드가 찌그러져 '의견 보내기'가 안 보이던 문제 (10/22) → 대신 이 칸이 스크롤 */}
      <section className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F4F3EF] px-4 pb-6 pt-4">
        <div className="flex-none overflow-hidden rounded-[14px] border border-[#E2E0D8] bg-white">
          <LanguageRow />
          <PushRow />
        </div>

        <p className="rounded-[14px] bg-[#E8EEFA] px-4 py-3.5 text-sm leading-relaxed text-[#1A3F91]">
          {t("settings.limit", { limit: limit.toLocaleString("ja-JP") })}
        </p>

        <div className="flex-none overflow-hidden rounded-[14px] border border-[#E2E0D8] bg-white">
          <LinkRow
            label={t("settings.diet")}
            value={hasDiet(diet) ? t("settings.dietOn") : t("settings.dietOff")}
            onClick={() => setView("diet")}
          />
          <LinkRow label={t("settings.privacy")} onClick={() => setView("privacy")} />
          <LinkRow label={t("settings.terms")} onClick={() => setView("terms")} />
          <LinkRow label={t("settings.opinion")} onClick={() => setView("opinion")} last />
        </div>

        <div className="flex flex-col gap-1 px-1 text-xs leading-relaxed text-[#5F5E58]">
          <p>
            {t("credit.shop")}:{" "}
            <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
              Powered by ホットペッパー グルメ Webサービス
            </a>
          </p>
          <p>{t("credit.ai")}</p>
          <p>
            {t("settings.sourceMap")}:{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
              © OpenStreetMap
            </a>
          </p>
          <p>{t("settings.check")}</p>
          <p>{t("settings.version", { version: VERSION })}</p>
          {device && <p>{t("settings.device", { id: device })}</p>}
        </div>
      </section>
    </>
  );
}

function LanguageRow() {
  const { t, lang, machine } = useT();
  let name = lang;
  try {
    name = new Intl.DisplayNames([lang], { type: "language" }).of(lang) ?? lang; // 그 언어로 쓴 이름 (한국어 · English · Tiếng Việt)
  } catch {
    // 모르는 언어 코드면 코드 그대로
  }
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[#ECEAE3] px-4 py-3">
      <span className="flex-1 text-base">{t("settings.language")}</span>
      <span className="text-right text-sm text-[#5F5E58]">
        {t("settings.languageValue", { name })}
        {machine && <span className="block text-xs">{t("i18n.ai")}</span>}
      </span>
    </div>
  );
}

function PushRow() {
  const { t } = useT();
  const [push, setPush] = useState<PushState | "working" | "error">(() => currentPushState());
  const turnOn = () => {
    setPush("working");
    enablePush()
      .then((result) => {
        setPush(result);
        track("push_permission", { result, from: "settings" });
      })
      .catch((e: unknown) => {
        trackError("push", e);
        setPush("error");
        track("push_permission", { result: "error", from: "settings" });
      });
  };
  const ios = isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-base">{t("settings.push")}</span>
          <span className="text-[13px] text-[#5F5E58]">{t("settings.pushNote")}</span>
        </span>
        {push === "on" && <span className="text-sm font-semibold text-[#1A3F91]">{t("settings.pushOn")}</span>}
      </div>
      <div aria-live="polite" className="flex flex-col gap-2 text-[13px] leading-relaxed text-[#5F5E58]">
        {push === "install" && <p>{t("go.install")}</p>}
        {push === "unsupported" && <p>{t("settings.pushUnsupported")}</p>}
        {push === "blocked" && (
          <p>
            {t("settings.pushBlocked")} {ios ? t("settings.pushBlockedIOS") : t("settings.pushBlockedOther")}
          </p>
        )}
        {push === "error" && <p className="font-semibold text-[#9A4A00]">{t("go.pushError")}</p>}
        {(push === "ask" || push === "working" || push === "error") && (
          <button
            type="button"
            onClick={turnOn}
            disabled={push === "working"}
            className="h-11 rounded-xl border border-[#2457C5] text-[15px] font-semibold text-[#1A3F91] disabled:opacity-60"
          >
            {push === "working" ? t("go.pushWorking") : t("go.pushButton")}
          </button>
        )}
      </div>
    </div>
  );
}

function LinkRow(props: { label: string; value?: string; onClick: () => void; last?: boolean }) {
  const { label, value, onClick, last = false } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] w-full items-center px-4 text-left text-[15px] ${last ? "" : "border-b border-[#ECEAE3]"}`}
    >
      <span className="flex-1">{label}</span>
      {value && <span className="mr-1.5 text-sm text-[#5F5E58]">{value}</span>}
      <svg {...svg} width={18} height={18} className="text-[#8D8B84]">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useT();
  return (
    <header className="flex items-center gap-1 border-b border-[#E2E0D8] px-2 pb-2.5 pt-3">
      <button type="button" onClick={onBack} aria-label={t("common.back")} className="flex h-11 w-11 items-center justify-center">
        <svg {...svg} width={20} height={20}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}

function Doc({ title, keys, onBack }: { title: string; keys: string[]; onBack: () => void }) {
  const { t } = useT();
  return (
    <>
      <SubHeader title={title} onBack={onBack} />
      <section className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-6 pt-4 text-[15px] leading-relaxed">
        {keys.map((key, i) => (
          <p key={key} className={i === keys.length - 1 ? "text-[13px] text-[#5F5E58]" : ""}>
            {t(key)}
          </p>
        ))}
      </section>
    </>
  );
}

function OpinionForm({ onBack }: { onBack: () => void }) {
  const { t, lang } = useT();
  const [text, setText] = useState("");
  const [state, setState] = useState<"write" | "sending" | "sent" | "limit" | "error">("write");
  const message = text.trim();

  const send = () => {
    setState("sending");
    sendOpinion(message, lang)
      .then((result) => {
        setState(result);
        if (result === "sent") {
          track("opinion_submit", { length: message.length });
          setText("");
        }
      })
      .catch((e: unknown) => {
        trackError("opinion", e);
        setState("error");
      });
  };

  return (
    <>
      <SubHeader title={t("opinion.title")} onBack={onBack} />
      <section className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-6 pt-4">
        {state === "sent" ? (
          <>
            <p className="text-xl font-semibold" aria-live="polite">{t("opinion.sent")}</p>
            <p className="text-[15px] leading-relaxed text-[#5F5E58]">{t("opinion.sentBody")}</p>
            <button type="button" onClick={() => setState("write")} className="h-12 rounded-[14px] border border-[#CFCCC2] text-base">
              {t("opinion.another")}
            </button>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-[#5F5E58]">{t("opinion.intro")}</p>
            <label htmlFor="opinion" className="sr-only">{t("opinion.title")}</label>
            <textarea
              id="opinion"
              value={text}
              maxLength={MAX_OPINION}
              rows={7}
              onChange={(e) => {
                setText(e.target.value);
                if (state !== "write" && state !== "sending") setState("write");
              }}
              placeholder={t("opinion.placeholder")}
              className="resize-none rounded-xl border border-[#CFCCC2] p-3 text-base leading-relaxed outline-none focus:border-[#2457C5]"
            />
            <div className="flex justify-between gap-3 text-xs text-[#5F5E58]">
              <span>{t("opinion.privacy")}</span>
              <span className="flex-none">{t("opinion.count", { n: text.length, max: MAX_OPINION })}</span>
            </div>
            {state === "limit" && <p className="text-sm font-semibold text-[#9A4A00]">{t("opinion.limit")}</p>}
            {state === "error" && <p className="text-sm font-semibold text-[#9A4A00]">{t("opinion.error")}</p>}
            <button
              type="button"
              disabled={!message || state === "sending" || state === "limit"}
              onClick={send}
              className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white disabled:opacity-50"
            >
              {state === "sending" ? t("opinion.sending") : t("opinion.send")}
            </button>
          </>
        )}
      </section>
    </>
  );
}

// 알레르기 · 식사 제한 (10/22 결정). 건강 정보라 이 휴대폰에만 저장하고 서버 · 사용 기록으로 보내지 않음
function DietForm({ diet, onChange, onBack }: { diet: Diet; onChange: (d: Diet) => void; onBack: () => void }) {
  const { t } = useT();
  const toggle = (a: Allergen) =>
    onChange({ ...diet, allergens: diet.allergens.includes(a) ? diet.allergens.filter((x) => x !== a) : [...diet.allergens, a] });
  return (
    <>
      <SubHeader title={t("diet.title")} onBack={onBack} />
      <section className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-4">
        <p className="text-[15px] leading-relaxed text-[#5F5E58]">{t("diet.intro")}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-base font-semibold">{t("diet.allergyLabel")}</legend>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = diet.allergens.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(a)}
                  className={`h-10 rounded-full border px-3.5 text-[15px] ${
                    on ? "border-2 border-[#2457C5] bg-[#E8EEFA] font-semibold text-[#1A3F91]" : "border-[#CFCCC2] bg-white"
                  }`}
                >
                  {t(`diet.a.${a}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-base font-semibold">{t("diet.styleLabel")}</legend>
          {STYLES.map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#D6D4CC] px-4 text-[15px]">
              <input
                type="radio"
                name="diet-style"
                checked={diet.style === s}
                onChange={() => onChange({ ...diet, style: s })}
                className="h-5 w-5 accent-[#2457C5]"
              />
              {t(`diet.s.${s}`)}
            </label>
          ))}
        </fieldset>
        <p className="text-[13px] leading-relaxed text-[#5F5E58]">{t("diet.privacy")}</p>
        <p className="text-[13px] font-semibold leading-relaxed text-[#9A4A00]">{t("diet.warning")}</p>
      </section>
    </>
  );
}
