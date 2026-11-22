// 주장에서 연관성 판단용 항목 6가지 뽑기 (docs/IMPROVEMENT_PLAN.md 3-1절 1단계):
// 주제어, 대상, 수치, 시점, 출처, 관계(지금은 주제어에 포함)

import { keywordsOf } from "@/lib/claims/rules";
import { OFFICIAL_SOURCES } from "./lexicon";

export interface NumberSlot {
  value: number;
  unit: string; // UNIT_ALIASES의 키 ("%", "시간", …) 또는 원래 단위
  raw: string;
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
  /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(%p|%|％|퍼센트|포인트|조\s*원|조|억\s*원|억|만\s*원|만\s*명|만|천\s*명|천|원|명|시간|분|일|주|년|배|세|살|km)/g;

const UNIT_NORMAL: Record<string, string> = { "％": "%", 퍼센트: "%", 살: "세", 조원: "조", 억원: "억", 만원: "만", 만명: "만", 천명: "천" };

export function extractNumbers(text: string): NumberSlot[] {
  const out: NumberSlot[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const u = m[2].replace(/\s+/g, "");
    const unit = UNIT_NORMAL[u] ?? u;
    const value = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(value)) out.push({ value, unit, raw: `${m[1].replace(/,/g, "")}${unit}` });
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
  return { topics, subjects, numbers: extractNumbers(claim), times, sources: [...sources] };
}
