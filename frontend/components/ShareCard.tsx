"use client";

// S7 공유 카드: 동네 · 모은 가게 수 · 최근 6곳의 장르 · 가격 · 평균 가격 · 앱 주소 (10/21 결정: 사진 없이 장르 · 가격 칸)
// 가게 이름은 넣지 않음 (어디서 먹는지는 보여 주지 않게). 이미지는 화면에서 그려 저장 · 공유
import { useEffect, useMemo, useRef, useState } from "react";
import { genreLabel } from "@/lib/lunch";
import { track } from "@/lib/analytics";
import { averagePrice, cardTiles, type ZukanItem } from "@/lib/zukan";
import { useT } from "./I18n";
import { svg } from "./icons";

type Props = { items: ZukanItem[]; area: string | null; onClose: () => void };
type Tile = { genre: string; price: string } | null;
type Card = { brand: string; headline: string; tiles: Tile[]; avg: string | null; link: string };

const W = 1080;
const H = 1350;
const FONT = `-apple-system, "Apple SD Gothic Neo", "Hiragino Sans", "Noto Sans KR", "Noto Sans", sans-serif`;
const yen = (n: number) => n.toLocaleString("ja-JP");

export default function ShareCard({ items, area, onClose }: Props) {
  const { t } = useT();
  const [note, setNote] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);

  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/?ref=share`;
  const card = useMemo<Card>(() => {
    const avg = averagePrice(items);
    return {
      brand: t("share.brand"),
      headline: area ? t("share.headline", { area: t(`area.${area}`), n: items.length }) : t("share.headlineNoArea", { n: items.length }),
      tiles: cardTiles(items).map((tile) =>
        tile ? { genre: tile.genre ? genreLabel(tile.genre, t) : "—", price: tile.price !== null ? t("price.yen", { n: yen(tile.price) }) : "" } : null,
      ),
      avg: avg !== null ? t("share.avg", { avg: yen(avg) }) : null,
      link: shareUrl.replace(/^https?:\/\//, "").replace(/\/\?ref=share$/, ""),
    };
  }, [items, area, t, shareUrl]);

  const save = async () => {
    const blob = await drawCard(card);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "osaka-lunch-map.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    track("share_card_create", { method: "save", count: items.length });
  };

  const share = async () => {
    const text = t("share.text", { n: items.length });
    try {
      const file = new File([await drawCard(card)], "osaka-lunch-map.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text} ${shareUrl}` });
      } else if (navigator.share) {
        await navigator.share({ text, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${text} ${shareUrl}`);
        setNote(t("share.copied"));
      }
      track("share_card_create", { method: "share", count: items.length });
    } catch {
      // 공유 창을 닫으면 여기로 옴. 아무것도 하지 않음
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="fixed inset-0 z-[1000] mx-auto flex max-w-[480px] flex-col bg-[#F4F3EF] text-[#1F1F1C]">
      <div className="flex items-center gap-1 border-b border-[#E2E0D8] bg-white px-3 pb-1 pt-3">
        <button type="button" onClick={onClose} aria-label={t("share.back")} className="flex h-11 w-11 items-center justify-center">
          <svg {...svg} width={20} height={20}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 ref={title} id="share-title" tabIndex={-1} className="text-lg font-semibold outline-none">
          {t("share.title")}
        </h1>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-8 py-7">
        {/* 저장 · 공유되는 이미지와 같은 짜임새의 미리보기 */}
        <div className="flex aspect-[4/5] w-full flex-col gap-3.5 rounded-[20px] border border-[#D6D4CC] bg-white p-6">
          <p className="text-[13px] font-semibold text-[#1A3F91]">{card.brand}</p>
          <p className="text-[22px] font-semibold leading-snug">{card.headline}</p>
          <div className="grid flex-1 grid-cols-3 gap-2">
            {card.tiles.map((tile, i) =>
              tile ? (
                <div key={i} className="flex flex-col justify-end gap-0.5 rounded-[10px] bg-[#ECEAE3] p-2">
                  <span className="text-[11px] leading-tight text-[#5F5E58]">{tile.genre}</span>
                  <span className="text-sm font-semibold">{tile.price}</span>
                </div>
              ) : (
                <div key={i} className="rounded-[10px] border-2 border-dashed border-[#CFCCC2]" />
              ),
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-[#5F5E58]">
            <span>{card.avg}</span>
            <span>{card.link}</span>
          </div>
          <p className="text-[9px] text-[#5F5E58]">Powered by ホットペッパー グルメ Webサービス</p>
        </div>
      </div>

      {note && (
        <p className="pb-2 text-center text-sm font-semibold text-[#1A3F91]" aria-live="polite">
          {note}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5 px-5 pb-7">
        <button type="button" onClick={save} className="h-[52px] rounded-[14px] border border-[#CFCCC2] bg-white text-base">
          {t("share.save")}
        </button>
        <button type="button" onClick={share} className="h-[52px] rounded-[14px] bg-[#2457C5] text-base font-semibold text-white">
          {t("share.share")}
        </button>
      </div>
    </div>
  );
}

// 미리보기와 같은 카드를 1080×1350 이미지로 그림 (인스타그램 세로 비율)
async function drawCard(card: Card): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("이미지를 만들 수 없어요");
  const pad = 88;

  c.fillStyle = "#FFFFFF";
  c.fillRect(0, 0, W, H);
  c.textBaseline = "top";

  c.fillStyle = "#1A3F91";
  c.font = `600 40px ${FONT}`;
  c.fillText(card.brand, pad, pad);

  c.fillStyle = "#1F1F1C";
  c.font = `600 76px ${FONT}`;
  let y = pad + 84;
  for (const line of wrap(c, card.headline, W - pad * 2).slice(0, 3)) {
    c.fillText(line, pad, y);
    y += 100;
  }

  const gap = 24;
  const top = y + 40;
  const bottom = H - pad - 140;
  const cw = (W - pad * 2 - gap * 2) / 3;
  const ch = (bottom - top - gap) / 2;
  card.tiles.forEach((tile, i) => {
    const x = pad + (i % 3) * (cw + gap);
    const ty = top + Math.floor(i / 3) * (ch + gap);
    roundRect(c, x, ty, cw, ch, 28);
    if (tile) {
      c.fillStyle = "#ECEAE3";
      c.fill();
      c.textBaseline = "bottom";
      c.fillStyle = "#1F1F1C";
      c.font = `600 48px ${FONT}`;
      c.fillText(tile.price, x + 28, ty + ch - 28, cw - 56);
      c.fillStyle = "#5F5E58";
      c.font = `400 32px ${FONT}`;
      wrap(c, tile.genre, cw - 56)
        .slice(0, 2)
        .reverse()
        .forEach((line, n) => c.fillText(line, x + 28, ty + ch - 92 - n * 42, cw - 56));
      c.textBaseline = "top";
    } else {
      c.setLineDash([16, 12]);
      c.lineWidth = 5;
      c.strokeStyle = "#CFCCC2";
      c.stroke();
      c.setLineDash([]);
    }
  });

  c.fillStyle = "#5F5E58";
  c.font = `400 34px ${FONT}`;
  if (card.avg) c.fillText(card.avg, pad, H - pad - 100);
  c.textAlign = "right";
  c.fillText(card.link, W - pad, H - pad - 100);
  c.textAlign = "left";
  c.font = `400 24px ${FONT}`;
  c.fillText("Powered by ホットペッパー グルメ Webサービス", pad, H - pad - 30);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 만들 수 없어요"))), "image/png"));
}

// 폭에 맞춰 줄 나눔: 띄어쓰기가 있으면 단어로, 없으면(일본어 · 중국어 등) 글자로
function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const units = text.includes(" ") ? text.split(/(?<= )/) : [...text];
  const lines: string[] = [];
  let line = "";
  for (const u of units) {
    if (line && c.measureText(line + u).width > width) {
      lines.push(line.trimEnd());
      line = u.trimStart();
    } else line += u;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
