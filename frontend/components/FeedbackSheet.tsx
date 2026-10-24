"use client";

// S5 다녀왔어요?: 다녀왔는지 → 그 시간에 영업했는지 → 점심 가격이 그때 고른 상한 이하였는지 (와이어프레임 검토: 질문 2개로 충분)
// 도착했어요로 이미 다녀온 기록이면 '점심 어땠어요?'로 남은 것만 (도착할 때 영업 중이라고 답했으면 가격만)
import { useEffect, useRef, useState } from "react";
import { track, trackError } from "@/lib/analytics";
import { sendFeedback } from "@/lib/api";
import { addsToZukan, canSubmit, chosenLabel, EMPTY_ANSWERS, feedbackBody, type Answers, type PendingVisit } from "@/lib/visits";
import { useT } from "./I18n";

type Props = { visit: PendingVisit; onClose: () => void; onOpenZukan: () => void };

export default function FeedbackSheet({ visit, onClose, onOpenZukan }: Props) {
  const { t } = useT();
  const arrived = visit.arrived === true;
  const start: Answers = arrived ? { ...EMPTY_ANSWERS, visited: true, openOk: visit.openOk ?? null } : EMPTY_ANSWERS;
  const [a, setA] = useState<Answers>(start);
  const [state, setState] = useState<"ask" | "sending" | "done" | "error">("ask");
  const [added, setAdded] = useState(false); // '네, 다녀왔어요' (닫혀 있지 않았음) → 도감에 한 곳 추가
  const [again, setAgain] = useState(false); // 또 갈래요 ♥ (답하지 않아도 됨)
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const limit = visit.priceLimit ?? 990;

  const submit = async () => {
    setState("sending");
    try {
      const body = feedbackBody(a, again);
      await sendFeedback(visit.id, body);
      track("feedback_submit", { visited: body.visited, open_ok: body.openOk, price_ok: body.priceOk, again: body.again, price_limit: limit });
      const zukan = addsToZukan(body, arrived);
      if (zukan) track("zukan_add");
      setAdded(zukan);
      setState("done");
    } catch (e) {
      trackError("feedback", e);
      setState("error");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-5 overflow-y-auto rounded-t-[20px] bg-white px-6 pb-7 pt-6 text-[#1F1F1C]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[13px] text-[#5F5E58]">{t("feedback.chosen", { when: chosenLabel(visit.chosenAt, new Date(), t) })}</p>
            <p className="text-[17px] font-semibold">{visit.shopName ?? t("zukan.gone")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("feedback.later")} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center text-[#5F5E58]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {state === "done" ? (
          <>
            <h1 ref={title} id="feedback-title" tabIndex={-1} className="text-2xl font-semibold outline-none">
              {t("feedback.thanks")}
            </h1>
            <p className="text-sm leading-relaxed text-[#5F5E58]">
              {t("feedback.thanksBody")}
              {added && ` ${t("feedback.zukanAdded")}`}
            </p>
            {added && (
              <button type="button" onClick={onOpenZukan} className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white">
                {t("feedback.openZukan")}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={added ? "h-12 rounded-[14px] border border-[#CFCCC2] text-base" : "h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white"}
            >
              {t("common.close")}
            </button>
          </>
        ) : (
          <>
            <h1 ref={title} id="feedback-title" tabIndex={-1} className="text-2xl font-semibold outline-none">
              {t(arrived ? "feedback.titleArrived" : "feedback.title")}
            </h1>
            {!arrived && (
              <Choice
                value={a.visited}
                yes={t("feedback.visitedYes")}
                no={t("feedback.visitedNo")}
                onChange={(visited) => setA({ ...EMPTY_ANSWERS, visited })}
                big
              />
            )}
            {/* 한국어는 낱말 중간에서 줄이 바뀌지 않게 (큰 글자 기기 점검 "다녀왔어/요") */}
            {a.visited && (
              <div className={`flex flex-col gap-3 [&:lang(ko)]:break-keep ${arrived ? "" : "border-t border-[#ECEAE3] pt-4"}`}>
                {!(arrived && start.openOk !== null) && (
                  <>
                    <p className="text-base font-semibold">{t("feedback.openQ")}</p>
                    <Choice value={a.openOk} yes={t("feedback.yesRight")} no={t("feedback.openNo")} onChange={(openOk) => setA({ ...a, openOk })} />
                  </>
                )}
                {a.openOk !== false && ( // 닫혀 있었으면 가격은 알 수 없어서 묻지 않음
                  <>
                    <p className="pt-1 text-base font-semibold">
                      {t(arrived && start.openOk !== null ? "feedback.priceOnlyQ" : "feedback.priceQ", { limit: limit.toLocaleString("ja-JP") })}
                    </p>
                    <Choice value={a.priceOk} yes={t("feedback.yesRight")} no={t("feedback.priceNo")} onChange={(priceOk) => setA({ ...a, priceOk })} />
                    {/* 또 갈래요 (10/22 결정: 다녀온 곳과 좋았던 곳을 구분). 누르지 않아도 보낼 수 있음 */}
                    <button
                      type="button"
                      aria-pressed={again}
                      onClick={() => setAgain((v) => !v)}
                      className={`mt-1 flex h-12 items-center justify-center gap-2 rounded-xl border text-[15px] ${
                        again ? "border-2 border-[#D43F5E] bg-[#FDECEF] font-semibold text-[#A3213D]" : "border-[#CFCCC2] bg-white"
                      }`}
                    >
                      <Heart filled={again} />
                      {t("feedback.again")}
                    </button>
                  </>
                )}
              </div>
            )}
            {state === "error" && <p className="text-sm font-semibold text-[#9A4A00]">{t("feedback.error")}</p>}
            <button
              type="button"
              disabled={!canSubmit(a) || state === "sending"}
              onClick={submit}
              className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white disabled:opacity-50"
            >
              {state === "sending" ? t("feedback.sending") : t("feedback.send")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function Choice(props: { value: boolean | null; yes: string; no: string; onChange: (v: boolean) => void; big?: boolean }) {
  const { value, yes, no, onChange, big = false } = props;
  const cls = (on: boolean) =>
    `${big ? "min-h-[52px] text-base" : "min-h-12 text-[15px]"} rounded-xl border px-2 py-1.5 leading-snug ${
      on ? "border-2 border-[#2457C5] bg-[#E8EEFA] font-semibold text-[#1A3F91]" : "border-[#CFCCC2] bg-white"
    }`;
  return (
    <div className="grid grid-cols-2 gap-2.5 [&:lang(ko)]:break-keep">
      <button type="button" aria-pressed={value === true} onClick={() => onChange(true)} className={cls(value === true)}>
        {yes}
      </button>
      <button type="button" aria-pressed={value === false} onClick={() => onChange(false)} className={cls(value === false)}>
        {no}
      </button>
    </div>
  );
}

export function Heart({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#D43F5E" : "none"} stroke={filled ? "#D43F5E" : "currentColor"} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-9.2-8.6C1.4 8.6 3.1 5 6.6 5c2.1 0 3.5 1.2 5.4 3.2C13.9 6.2 15.3 5 17.4 5c3.5 0 5.2 3.6 3.8 6.4C19 15.6 12 20 12 20z" />
    </svg>
  );
}
