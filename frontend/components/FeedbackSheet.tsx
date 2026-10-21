"use client";

// S5 다녀왔어요?: 다녀왔는지 → 그 시간에 영업했는지 → 점심 가격이 그때 고른 상한 이하였는지 (와이어프레임 검토: 질문 2개로 충분)
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { sendFeedback } from "@/lib/api";
import { canSubmit, chosenLabel, EMPTY_ANSWERS, feedbackBody, type Answers, type PendingVisit } from "@/lib/visits";
import { useT } from "./I18n";

type Props = { visit: PendingVisit; onClose: () => void; onOpenZukan: () => void };

export default function FeedbackSheet({ visit, onClose, onOpenZukan }: Props) {
  const { t } = useT();
  const [a, setA] = useState<Answers>(EMPTY_ANSWERS);
  const [state, setState] = useState<"ask" | "sending" | "done" | "error">("ask");
  const [added, setAdded] = useState(false); // '네, 다녀왔어요' → 도감에 한 곳 추가
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const limit = visit.priceLimit ?? 990;

  const submit = async () => {
    setState("sending");
    try {
      const body = feedbackBody(a);
      await sendFeedback(visit.id, body);
      track("feedback_submit", { visited: body.visited, open_ok: body.openOk, price_ok: body.priceOk, price_limit: limit });
      if (body.visited) track("zukan_add");
      setAdded(body.visited);
      setState("done");
    } catch {
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
            <p className="text-[17px] font-semibold">{visit.shopName}</p>
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
              {t("feedback.title")}
            </h1>
            <Choice
              value={a.visited}
              yes={t("feedback.visitedYes")}
              no={t("feedback.visitedNo")}
              onChange={(visited) => setA({ ...EMPTY_ANSWERS, visited })}
              big
            />
            {a.visited && (
              <div className="flex flex-col gap-3 border-t border-[#ECEAE3] pt-4">
                <p className="text-base font-semibold">{t("feedback.openQ")}</p>
                <Choice value={a.openOk} yes={t("feedback.yesRight")} no={t("feedback.openNo")} onChange={(openOk) => setA({ ...a, openOk })} />
                <p className="pt-1 text-base font-semibold">{t("feedback.priceQ", { limit: limit.toLocaleString("ja-JP") })}</p>
                <Choice value={a.priceOk} yes={t("feedback.yesRight")} no={t("feedback.priceNo")} onChange={(priceOk) => setA({ ...a, priceOk })} />
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
    `${big ? "h-[52px] text-base" : "h-12 text-[15px]"} rounded-xl border ${
      on ? "border-2 border-[#2457C5] bg-[#E8EEFA] font-semibold text-[#1A3F91]" : "border-[#CFCCC2] bg-white"
    }`;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <button type="button" aria-pressed={value === true} onClick={() => onChange(true)} className={cls(value === true)}>
        {yes}
      </button>
      <button type="button" aria-pressed={value === false} onClick={() => onChange(false)} className={cls(value === false)}>
        {no}
      </button>
    </div>
  );
}
