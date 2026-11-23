// 주장에서 연관성 판단용 항목 6가지 뽑기 (docs/IMPROVEMENT_PLAN.md 3-1절 1단계):
// 주제어, 대상, 수치, 시점, 출처, 관계(지금은 주제어에 포함)

import { keywordsOf } from "@/lib/claims/rules";
import { OFFICIAL_SOURCES } from "./lexicon";

export interface NumberSlot {
  value: number;
  unit: string; // UNIT_ALIASES의 키 ("%", "시간", …) 또는 원래 단위
  raw: string;
  /** "-0.2%p"처럼 앞에 마이너스가 붙은 수치 */
  negative?: boolean;
}

export interface ClaimSlots {
  topics: string[];
  subjects: string[];
  numbers: NumberSlot[];
  times: string[];
  sources: string[];
}

const SUBJECT_RE =
  /([가-힣A-Za-z]+)?(참가자|환자|청년|노인|어르신|어린이|아동|청소년|학생|직장인|근로자|고객|국민|시민|소비자|운전자|여성|남성|임산부|선수|러너)/g;
const TIME_RE = /(\d{4}년|\d{1,2}월\s*\d{1,2}일|\d{1,2}월|내년|올해|작년|지난해|이번\s*달|다음\s*달)/g;
// 사람 이름 + 직함 ("샤르마 교수") — "의료 책임자"처럼 직함만 있는 경우는 출처 이름으로 보지 않는다
const SOURCE_BEFORE_TITLE_RE = /([가-힣A-Za-z]{2,})\s*(교수|박사|연구팀|연구진|대변인|장관|청장|위원장)/g;
const ORG_RE = /([가-힣A-Za-z]{2,}(대학교|대학|병원|협회|학회|공단|연구원|위원회|재단|청|처|부))(?=[은는이가의에\s,]|$)/g;
// 숫자 + 단위. 큰 돈·사람 단위(조·억·만·천)는 뒤에 붙는 "원·명"까지 한 단위로 본다 ("6,515조 원" → 6515 조)
const NUM_RE =
  /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(%\s*포인트|퍼센트\s*포인트|percentage\s*points?|%p|%|％|퍼센트|포인트|조\s*원|조|억\s*원|억|만\s*원|만\s*명|만|천\s*명|천|원|명|시간|분|일|주|년|배|세|살|km)/gi;

const UNIT_NORMAL: Record<string, string> = { "％": "%", 퍼센트: "%", "%포인트": "%p", 퍼센트포인트: "%p", percentagepoints: "%p", percentagepoint: "%p", 살: "세", 조원: "조", 억원: "억", 만원: "만", 만명: "만", 천명: "천" };

/**
 * 숫자 표기 맞추기: "2만4794명" → "24794명", "3만 775명" → "30775명", "23만3천708명" → "233708명"
 * (만 + 천·네 자리 이하 숫자 + 명·원). 게시물과 기사가 같은 숫자를 다르게 쓰는 경우를 같은 값으로 읽고,
 * "23만"이 "23만3천708명"의 앞부분과 맞았다고 잘못 보지 않으려고.
 */
export function normalizeNumbers(text: string): string {
  return text
    .replace(/(\d+)\s*만\s*(\d)\s*천\s*(\d{1,3})?(?=\s*(?:명|원))/g, (_, a: string, b: string, c?: string) =>
      String(Number(a) * 10000 + Number(b) * 1000 + Number(c ?? 0)))
    .replace(/(\d+)\s*만\s*(\d{1,4})(?=\s*(?:명|원))/g, (_, a: string, b: string) => String(Number(a) * 10000 + Number(b)));
}

export function extractNumbers(text: string): NumberSlot[] {
  const out: NumberSlot[] = [];
  const src = normalizeNumbers(text);
  for (const m of src.matchAll(NUM_RE)) {
    const u = m[2].replace(/\s+/g, "");
    const unit = UNIT_NORMAL[u] ?? u;
    const value = Number(m[1].replace(/,/g, ""));
    // 앞에 마이너스가 붙었는지 ("-0.2%p", "마이너스 0.2%"). "2~3", "1-2"처럼 숫자 사이의 "-"는 범위라서 제외
    const before = src.slice(Math.max(0, m.index! - 6), m.index!);
    const negative = /(?:-|−|마이너스\s*)$/.test(before) && !/\d\s*[-−]$/.test(before);
    if (Number.isFinite(value)) out.push({ value, unit, raw: `${negative ? "-" : ""}${m[1].replace(/,/g, "")}${unit}`, ...(negative ? { negative } : {}) });
  }
  return out;
}

export function slotsOf(claim: string): ClaimSlots {
  const topics = keywordsOf(claim, 8).filter((w) => !/^\d/.test(w));
  const subjects = [...new Set([...claim.matchAll(SUBJECT_RE)].map((m) => m[2]))];
  const times = [...new Set([...claim.matchAll(TIME_RE)].map((m) => m[1].replace(/\s+/g, "")))];
  const sources = new Set<string>();
  for (const m of claim.matchAll(SOURCE_BEFORE_TITLE_RE)) sources.add(m[1]);
  for (const m of claim.matchAll(ORG_RE)) sources.add(m[1]);
  const lower = claim.toLowerCase();
  for (const o of OFFICIAL_SOURCES) if (o.names.some((n) => lower.includes(n))) sources.add(o.names[0]);
  if (/연구|논문|임상/.test(claim)) sources.add("연구");
  // "9월 7일", "8일 오전 기준"의 "N일"은 기간이 아니라 날짜라서 수치로 세지 않는다 (기간은 "30일간·7일 동안·3일 만에")
  const durationDays = new Set([...claim.matchAll(/(\d+)\s*일\s*(?:간|동안|만|째|이내|넘게)/g)].map((m) => Number(m[1])));
  const numbers = extractNumbers(claim).filter((n) => !(n.unit === "일" && !durationDays.has(n.value)));
  return { topics, subjects, numbers, times, sources: [...sources] };
}
