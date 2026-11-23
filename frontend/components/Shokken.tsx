// 마스코트 식권이 (11/23 결정): 첫 화면 식권 발매기에서 나온 식권 한 장. 이름은 나라별로 (식권이 · しょっけん · 小食券 · Shokken)
// 표정: base 기본 · hungry 배고파(빈 화면 · 오류) · found 찾았다(도착 · 고마워요. 머리띠에 불이 들어옴) · run 달리기(룰렛 · 대표 메뉴 찾는 중, 11/23 추가)
// 몸에는 가게 가격이 아니라 점심 한도(¥990)를 적음 (가게 가격으로 오해하지 않게). 장식이라 화면 읽기 프로그램에서는 숨김
import { DEFAULT_LIMIT } from "@/lib/lunch";

export type Mood = "base" | "hungry" | "found" | "run";

const INK = "#1F1F1C";
const LED = "#FF6A3D";
const PEACH = "rgba(255,106,61,0.28)";
const line = { stroke: INK, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

// 식권 몸: 위 두 모서리는 둥글고, 아래 끝은 뜯은 자국(반원 구멍 n개)
function ticketPath(x0: number, y0: number, x1: number, y1: number, n = 6, br = 5, rc = 8): string {
  const w = (x1 - x0) / n;
  let d = `M${x0 + rc} ${y0} H${x1 - rc} Q${x1} ${y0} ${x1} ${y0 + rc} V${y1}`;
  for (let i = 0; i < n; i++) {
    const cx = x1 - i * w - w / 2;
    d += ` L${cx + br} ${y1} A${br} ${br} 0 0 0 ${cx - br} ${y1} L${x1 - (i + 1) * w} ${y1}`;
  }
  return `${d} V${y0 + rc} Q${x0} ${y0} ${x0 + rc} ${y0}Z`;
}
const BODY = ticketPath(54, 34, 146, 180);

const ARMS: Record<Exclude<Mood, "run">, string> = {
  base: "M54 108 q-22 -4 -28 -28 M146 116 q18 8 20 28",
  hungry: "M54 118 q-16 10 -8 30 M146 118 q16 10 8 30",
  found: "M54 104 q-20 -10 -24 -36 M146 104 q20 -10 24 -36",
};
const HANDS: Record<Exclude<Mood, "run">, [number, number][]> = {
  base: [[26, 78], [166, 146]],
  hungry: [[47, 150], [153, 150]],
  found: [[30, 66], [170, 66]],
};

// 반짝이 (찾았다)
const sparkle = (x: number, y: number, s: number) =>
  `M${x} ${y - s} q1.2 ${s - 1.2} ${s} ${s} q${-s + 1.2} 1.2 ${-s} ${s} q-1.2 ${-s + 1.2} ${-s} ${-s} q${s - 1.2} -1.2 ${s} ${-s}z`;

// 얼굴만 (첫 화면 식권처럼 작은 곳에도 씀). 가운데 (100, 100) 기준
export function Face({ mood }: { mood: Mood }) {
  const cx = 100, cy = 100, L = 85, R = 115;
  return (
    <>
      <ellipse cx={L - 8} cy={cy + 13} rx={7} ry={4.5} fill={PEACH} />
      <ellipse cx={R + 8} cy={cy + 13} rx={7} ry={4.5} fill={PEACH} />
      {mood === "hungry" && (
        <path d={`M${L - 6} ${cy + 1} h12 M${R - 6} ${cy + 1} h12 M${cx - 10} ${cy + 18} q2.5 -5 5 0 t5 0 t5 0 t5 0`} {...line} strokeWidth={4.5} />
      )}
      {mood === "found" && (
        <>
          <path d={`M${L - 6} ${cy + 3} q6 -10 12 0 M${R - 6} ${cy + 3} q6 -10 12 0`} {...line} strokeWidth={4.5} />
          <path d={`M${cx - 10} ${cy + 12} h20 q0 13 -10 13 q-10 0 -10 -13z`} fill={INK} />
          <path d={`M${cx - 5} ${cy + 21} q5 -4 10 0 q-5 5 -10 0z`} fill={LED} />
        </>
      )}
      {(mood === "base" || mood === "run") && (
        <>
          <ellipse cx={L} cy={cy} rx={4.8} ry={6.5} fill={INK} />
          <ellipse cx={R} cy={cy} rx={4.8} ry={6.5} fill={INK} />
          <circle cx={L + 1.6} cy={cy - 2.4} r={1.6} fill="#fff" />
          <circle cx={R + 1.6} cy={cy - 2.4} r={1.6} fill="#fff" />
          <path d={`M${cx - 7} ${cy + 14} q7 7 14 0`} {...line} strokeWidth={4} />
        </>
      )}
    </>
  );
}

type Props = { mood?: Mood; size?: number; className?: string };

// 달리기: 팔다리를 엉덩이 · 어깨 기준으로 번갈아 흔들고 몸은 통통 (오른쪽으로 달림). 움직임은 globals.css의 .shokken-run
function RunLimbs() {
  const hand = (x: number, y: number) => <circle cx={x} cy={y} r={7.5} fill="#fff" stroke={INK} strokeWidth={4} />;
  return (
    <>
      <g className="shokken-leg-a">
        <path d="M82 176 v20 h10" {...line} strokeWidth={6} />
      </g>
      <g className="shokken-leg-b">
        <path d="M118 176 v20 h10" {...line} strokeWidth={6} />
      </g>
      <g className="shokken-arm-a">
        <path d="M54 112 q-18 6 -18 24" {...line} strokeWidth={6} />
        {hand(36, 138)}
      </g>
      <g className="shokken-arm-b">
        <path d="M146 112 q18 6 18 24" {...line} strokeWidth={6} />
        {hand(164, 138)}
      </g>
    </>
  );
}

export default function Shokken({ mood = "base", size = 96, className }: Props) {
  const found = mood === "found";
  const run = mood === "run";
  return (
    <svg viewBox="0 0 200 210" width={size} height={size * 1.05} className={`${run ? "shokken-run" : ""} ${className ?? ""}`} aria-hidden="true">
      {run ? (
        <RunLimbs />
      ) : (
        <>
          <path d="M82 178 v18 h-11 M118 178 v18 h11" {...line} strokeWidth={6} />
          <path d={ARMS[mood]} {...line} strokeWidth={6} />
          {HANDS[mood].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r={7.5} fill="#fff" stroke={INK} strokeWidth={4} />
          ))}
        </>
      )}
      {/* 통통 움직임(CSS)과 기울기(transform)는 다른 g에 (한 g에 같이 두면 브라우저가 몸을 안 그리는 일이 있었음) */}
      <g className={run ? "shokken-hop" : undefined}>
        <g transform={found ? undefined : run ? "rotate(6 100 110)" : "rotate(-4 100 110)"}>
          <path d={BODY} fill="#fff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <path d="M54 62 V42 Q54 34 62 34 H138 Q146 34 146 42 V62Z" fill={found ? "#FFD84A" : "#2457C5"} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <text x="100" y="55" textAnchor="middle" fontSize="15" fontWeight="900" fill={found ? INK : "#fff"}>
            食券
          </text>
          <path d="M62 70 H138" stroke="#C6CDDC" strokeWidth={2.5} strokeDasharray="4 5" strokeLinecap="round" />
          <Face mood={mood} />
          <text x="100" y="160" textAnchor="middle" fontSize="19" fontWeight="900" fill={INK} letterSpacing="-0.5">
            ¥{DEFAULT_LIMIT}
          </text>
        </g>
      </g>
      {found && (
        <path d={[sparkle(22, 30, 8), sparkle(178, 28, 7), sparkle(186, 96, 5)].join(" ")} fill="#FFD84A" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      )}
      {mood === "hungry" && <path d="M160 48 q-7 10 0 13 q7 -3 0 -13z" fill="#BFD3FF" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />}
    </svg>
  );
}
