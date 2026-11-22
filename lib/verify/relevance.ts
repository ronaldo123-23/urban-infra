// 게시물 주장 ↔ 자료(기사·논문·공식 페이지) 연관성 점수 (docs/IMPROVEMENT_PLAN.md 3-1절).
// 관문 2개(주제어, 대상 충돌) → 100점 점수(주제어 40·수치 20·출처 15·대상 15·시점 10) → 3등급.

import { CONFLICT_AXES, UNIT_ALIASES, expand } from "./lexicon";
import { extractNumbers, type ClaimSlots, type NumberSlot } from "./slots";

export type RelevanceGrade = "direct" | "related" | "irrelevant";

export interface Relevance {
  score: number; // 0~100
  grade: RelevanceGrade;
  /** 화면에 보여줄 "일치: …" 항목 */
  matched: string[];
  /** 무관일 때 이유 */
  rejected: string | null;
}

export interface DocForScoring {
  title: string;
  text: string; // 요약 또는 본문
  /** 공식 출처 목록으로 직접 고른 페이지 (제목에 주제어가 없어도 본문으로 판단) */
  official?: boolean;
}

const DIRECT = 70;
const RELATED = 40;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 한국어는 부분 일치, 영어는 단어 경계로 (대소문자 무시) */
export function hasTerm(text: string, term: string): boolean {
  if (!term) return false;
  if (/^[a-z0-9 .-]+$/i.test(term)) return new RegExp(`(^|[^a-z])${escapeRe(term)}([^a-z]|$)`, "i").test(text);
  // 한 글자 한국어 명사(금, 빚, 돈 …)는 "지금·금액"처럼 다른 단어 속 글자와 헷갈리지 않게 앞뒤를 본다
  if (term.length === 1 && /[가-힣]/.test(term)) {
    return new RegExp(`(^|[^가-힣])${term}(?=$|[^가-힣]|[은는이가을를의에도와과로만값])`).test(text);
  }
  return text.includes(term);
}

export function hasTopic(text: string, topic: string): boolean {
  return expand(topic).some((t) => hasTerm(text, t));
}

function unitPattern(unit: string): string {
  const aliases = UNIT_ALIASES[unit] ?? [unit];
  return `(?:${aliases.map(escapeRe).join("|")})`;
}

/** 같은 숫자·단위가 있는지. %는 두 비율의 차이(%포인트)로 나오는 경우도 인정 */
export function numberIn(rawText: string, n: NumberSlot): { hit: boolean; derived: string | null } {
  const text = rawText.replace(/(\d),(?=\d{3}(?!\d))/g, "$1"); // "6,515조" → "6515조"
  const v = String(n.value).replace(".", "[.,]");
  const exact = new RegExp(`(^|[^\\d.,])${v}\\s*${unitPattern(n.unit)}(?![a-z])`, "i");
  if (exact.test(text)) return { hit: true, derived: null };
  if (n.unit === "%" || n.unit === "%p" || n.unit === "포인트") {
    for (const sentence of splitSentencesLoose(text)) {
      const pcts = extractNumbers(sentence).filter((x) => x.unit === "%").map((x) => x.value);
      for (let i = 0; i < pcts.length; i++)
        for (let j = i + 1; j < pcts.length; j++)
          if (Math.abs(Math.abs(pcts[i] - pcts[j]) - n.value) <= 0.5)
            return { hit: true, derived: `${Math.max(pcts[i], pcts[j])}% 대 ${Math.min(pcts[i], pcts[j])}%` };
    }
  }
  return { hit: false, derived: null };
}

export function splitSentencesLoose(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);
}

function conflictOf(claimText: string, title: string): string | null {
  for (const axis of CONFLICT_AXES) {
    const inClaim = axis.groups.filter((g) => g.some((w) => hasTerm(claimText, w)));
    const inTitle = axis.groups.filter((g) => g.some((w) => hasTerm(title, w)));
    if (axis.groups.length === 1) {
      // 사람·동물: 기사 제목이 동물 이야기인데 주장에는 동물이 없으면 충돌
      if (inTitle.length > 0 && inClaim.length === 0) return axis.name;
    } else if (inClaim.length > 0 && inTitle.length > 0 && !inTitle.some((g) => inClaim.includes(g))) {
      return axis.name;
    }
  }
  return null;
}

export function scoreRelevance(claimText: string, slots: ClaimSlots, doc: DocForScoring): Relevance {
  const full = `${doc.title}\n${doc.text}`;
  const matched: string[] = [];

  // 관문 1: 주제어
  const inTitle = slots.topics.filter((t) => hasTopic(doc.title, t));
  const inAny = slots.topics.filter((t) => hasTopic(full, t));
  const gateTopic =
    inTitle.length >= 2 ||
    (inTitle.length >= 1 && inAny.length >= 2) ||
    (doc.official === true && inAny.length >= 3) ||
    (slots.topics.length === 1 && inTitle.length === 1);
  if (!gateTopic) return { score: 0, grade: "irrelevant", matched: [], rejected: "주제어가 제목에 충분히 없음" };

  // 관문 2: 대상 충돌
  const conflict = conflictOf(claimText, doc.title);
  if (conflict) return { score: 0, grade: "irrelevant", matched: [], rejected: `대상이 다름 (${conflict})` };

  // 점수
  const parts: { weight: number; ratio: number }[] = [];
  const topicRatio =
    slots.topics.length === 0
      ? 0
      : slots.topics.reduce((sum, t) => sum + (inTitle.includes(t) ? 1 : inAny.includes(t) ? 0.5 : 0), 0) / slots.topics.length;
  parts.push({ weight: 40, ratio: doc.official ? Math.max(topicRatio, inAny.length / slots.topics.length) : topicRatio });
  matched.push(...inAny);

  let numberRatio = 1;
  if (slots.numbers.length > 0) {
    const hits = slots.numbers.map((n) => numberIn(full, n));
    numberRatio = hits.filter((h) => h.hit).length / slots.numbers.length;
    slots.numbers.forEach((n, i) => hits[i].hit && matched.push(n.raw));
    parts.push({ weight: 20, ratio: numberRatio });
  }
  let sourceHit = true;
  if (slots.sources.length > 0) {
    const found = slots.sources.filter((s) => s.split(/\s+/).every((w) => hasTopic(full, w)) || hasTerm(full.toLowerCase(), s));
    sourceHit = found.length > 0;
    matched.push(...found.filter((s) => !matched.includes(s)));
    parts.push({ weight: 15, ratio: found.length / slots.sources.length });
  }
  if (slots.subjects.length > 0) {
    const found = slots.subjects.filter((s) => hasTopic(full, s));
    matched.push(...found.filter((s) => !matched.includes(s)));
    parts.push({ weight: 15, ratio: found.length / slots.subjects.length });
  }
  if (slots.times.length > 0) {
    const found = slots.times.filter((t) => full.replace(/\s+/g, "").includes(t));
    matched.push(...found);
    parts.push({ weight: 10, ratio: found.length / slots.times.length });
  }

  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round((parts.reduce((s, p) => s + p.weight * p.ratio, 0) / total) * 100);
  // 직접 근거는 주제어가 3개 이상 겹쳐야 한다 (주제어 2개짜리 막연한 주장에 아무 기사나 붙지 않게).
  // 단, 공식 안내·논문처럼 수치까지 맞는 경우는 예외.
  const enoughTopics = inAny.length >= 3 || (slots.numbers.length > 0 && numberRatio === 1 && inAny.length >= 2);
  const strongEnough = (slots.numbers.length === 0 || numberRatio >= 0.5) && sourceHit && enoughTopics;
  const grade: RelevanceGrade = score >= DIRECT && strongEnough ? "direct" : score >= RELATED ? "related" : "irrelevant";
  return {
    score,
    grade,
    matched: [...new Set(matched)].slice(0, 6),
    rejected: grade === "irrelevant" ? "연관도 점수가 낮음" : null,
  };
}
