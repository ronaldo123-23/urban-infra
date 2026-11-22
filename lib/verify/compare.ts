// 원문에서 주장과 같은 내용을 말하는 문장 찾기 + 수치 비교 설명 만들기.
// "확인됨"/"근거와 다름"은 같은 대상·조건의 수치나 명시적인 문장을 원문에서 찾았을 때만 낸다.

import { hasTopic, numberIn, splitSentencesLoose } from "./relevance";
import { extractNumbers, type ClaimSlots } from "./slots";

export interface SentenceMatch {
  sentence: string;
  topicHits: string[];
  /** 주장의 수치 중 이 문장에 있는 것 (raw) */
  numberHits: string[];
  /** 같은 단위 수치는 있는데 주장 수치와 다른 경우의 원문 수치 */
  otherNumbers: string[];
  /** %포인트 차이로 맞춘 경우 "52% 대 34%" */
  derived: string | null;
}

const MAX_QUOTE = 300;

/** 문장 안의 두 비율 차이가 n이면 "a% 대 b%" (원문에 18%가 그대로 있어도 52%·34%가 함께 있으면 %포인트 설명을 붙이려고) */
function pairDifference(sentence: string, n: number): string | null {
  const pcts = extractNumbers(sentence).filter((x) => x.unit === "%").map((x) => x.value);
  for (let i = 0; i < pcts.length; i++)
    for (let j = i + 1; j < pcts.length; j++)
      if (pcts[i] !== n && pcts[j] !== n && Math.abs(Math.abs(pcts[i] - pcts[j]) - n) <= 0.5)
        return `${Math.max(pcts[i], pcts[j])}% 대 ${Math.min(pcts[i], pcts[j])}%`;
  return null;
}

export function quoteOf(sentence: string): string {
  const s = sentence.replace(/\s+/g, " ").trim();
  return s.length > MAX_QUOTE ? `${s.slice(0, MAX_QUOTE - 1)}…` : s;
}

/** 원문에서 주장과 가장 많이 겹치는 문장 (주제어 2개 이상인 문장만) */
export function bestSentence(slots: ClaimSlots, text: string): SentenceMatch | null {
  let best: SentenceMatch | null = null;
  let bestScore = 0;
  for (const sentence of splitSentencesLoose(text)) {
    if (sentence.length > 600) continue; // 메뉴·목록이 한 줄로 붙은 것
    const topicHits = slots.topics.filter((t) => hasTopic(sentence, t));
    if (topicHits.length < 2) continue;
    const numberHits: string[] = [];
    let derived: string | null = null;
    for (const n of slots.numbers) {
      const r = numberIn(sentence, n);
      if (r.hit) {
        numberHits.push(n.raw);
        derived ??= r.derived ?? pairDifference(sentence, n.value);
      }
    }
    const pct = slots.numbers.find((n) => n.unit === "%" || n.unit === "%p");
    if (pct && /difference|차이|대비|versus|placebo/i.test(sentence)) {
      derived ??= pairDifference(sentence, pct.value);
    }
    const claimUnits = new Set(slots.numbers.map((n) => n.unit));
    const otherNumbers = extractNumbers(sentence)
      .filter((x) => claimUnits.has(x.unit) && !slots.numbers.some((n) => n.value === x.value))
      .map((x) => x.raw);
    const score = topicHits.length + numberHits.length * 3 + (derived ? 3 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { sentence, topicHits, numberHits, otherNumbers, derived };
    }
  }
  return best;
}

/** 비교 설명: %포인트 차이, 신뢰구간(불확실성), 전·중·후 조건 */
export function comparisonNotes(claim: string, slots: ClaimSlots, m: SentenceMatch): string[] {
  const notes: string[] = [];
  const pct = slots.numbers.find((n) => n.unit === "%" || n.unit === "%p");
  if (m.derived && pct) {
    const [a, b] = m.derived.split(" 대 ").map((x) => parseFloat(x));
    const rel = b > 0 ? Math.round((a / b - 1) * 100) : null;
    notes.push(
      `원문 수치는 ${m.derived}로, 차이는 ${pct.value}%포인트예요.` +
        (rel !== null && pct.unit === "%" ? ` 게시물의 "${pct.value}% 더 높다"는 비율이 아니라 %포인트 차이예요 (비율로 따지면 약 ${rel}% 높음).` : ""),
    );
  }
  const ci =
    /95\s*%\s*(?:CI|confidence interval|신뢰\s*구간)[\s:,]*([−-]?\d+(?:\.\d+)?)\s*%?\s*(?:to|–|—|~|-)\s*([−-]?\d+(?:\.\d+)?)\s*%?/i.exec(m.sentence);
  if (ci) {
    const lo = parseFloat(ci[1].replace("−", "-"));
    const hi = parseFloat(ci[2].replace("−", "-"));
    notes.push(
      lo <= 0 && hi >= 0
        ? `다만 95% 신뢰구간이 ${lo}%~${hi}%로 0을 포함해서, 통계적으로 확실한 차이라고 보기는 어려워요 (연구 1건 결과).`
        : `95% 신뢰구간은 ${lo}%~${hi}%예요 (연구 1건 결과).`,
    );
  }
  const hours = slots.numbers.find((n) => n.unit === "시간");
  if (hours && /before,?\s*during,?\s*(?:and|&)\s*after|전·중·후|전,\s*중,\s*후/i.test(m.sentence)) {
    const what = /대회|마라톤|경기/.test(claim) ? "대회" : "";
    notes.push(
      `원문 기준으로는 ${what} 전 ${hours.value}시간 · ${what} 중 · ${what} 후 ${hours.value}시간 동안이에요.`.replace(/\s+/g, " ") +
        (/후/.test(claim) ? "" : ` 게시물은 "${hours.value}시간 전부터"만 말해요.`),
    );
  }
  return notes;
}
