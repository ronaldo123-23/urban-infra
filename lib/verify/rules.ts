// AI 없이 규칙으로 판정 (Claude 키가 없을 때 기본 경로).
// 순서:
// 1) "근거와 다름" (팩트체크): 팩트체크 기사의 제목·요약에 반박 표현이 있고, 주장 핵심어(숫자·날짜 제외)가 기사 제목에 2개 이상
// 2) "확인됨": 연관성 "직접 근거"인 자료의 원문에서 같은 내용을 말하는 문장을 찾았을 때
//    - 수치가 있는 주장: 주장의 수치가 그 문장에 모두 있어야 함 (%포인트 차이로 맞는 경우 포함, 설명을 붙임)
//    - 수치가 없는 주장: 공식 안내·논문·공식 웹문서에서만, 주제어 대부분이 한 문장에 있어야 함
//    - 반박 표현이나 물음표가 있는 문장(소문을 인용한 문장)은 근거로 쓰지 않음
// 3) "근거와 다름" (수치): 공식 안내·논문의 같은 주제 문장에 같은 단위의 다른 수치만 있을 때
// 4) 나머지: "아직 확인 안 됨" (보류 이유는 lib/verify/index.ts가 붙인다)

import { keywordsOf } from "@/lib/claims/rules";
import { bestSentence, comparisonNotes, quoteOf } from "./compare";
import { hasTopic, numberIn, splitSentencesLoose } from "./relevance";
import type { ClaimSlots } from "./slots";
import type { EvidenceQuote, Source, Verdict } from "./types";

// 팩트체크 기사에서 주장을 반박할 때 쓰는 표현
const DEBUNK_RE =
  /(사실\s*아님|사실이\s*아니|사실과\s*달라|사실과\s*다르|거짓|허위|사실무근|가짜\s*뉴스|가짜뉴스|근거\s*없|근거가\s*없|오해|과장|왜곡|조작|대체로\s*틀림|틀렸|틀린\s*주장|루머|괴담|낭설)/;
// 팩트체크 기사임을 나타내는 표현 (검색어로 찾았더라도 실제 팩트체크 기사인지 한 번 더 본다)
const FACTCHECK_RE = /(팩트\s*체크|팩트체크|사실\s*확인|사실은|따져\s*보니|검증|진위)/;

const MIN_TITLE_MATCHED = 2;
const MIN_OVERLAP = 0.5;

const KIND_LABEL: Record<Source["kind"], string> = {
  news: "기사",
  paper: "논문 초록",
  official: "공식 안내",
  web: "공식 웹문서",
  kosis: "KOSIS 통계",
};

export interface RuleJudgement {
  verdict: Exclude<Verdict, "not_target">;
  evidenceIds: string[];
  reason: string;
  evidence: EvidenceQuote[];
  comparison: string[];
}

// "작년·올해·내년"처럼 오늘 기준으로 뜻이 바뀌는 시점 표현
const RELATIVE_TIME_RE = /(작년|지난해|올해|금년|내년|이번\s*달|지난달|다음\s*달|어제|오늘|이번\s*주|지난주|최근)/;

function currentYearKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 4);
}

/**
 * 상대 시점이 있는 주장은 올해 나온 자료로만 확인·반박한다.
 * (2024년 기사의 "작년"은 2023년이라, 2026년 게시물의 "작년"과 다르다)
 */
function sameTimeFrame(claim: string, s: Source): boolean {
  if (!RELATIVE_TIME_RE.test(claim)) return true;
  return Boolean(s.date && s.date.startsWith(currentYearKst()));
}

function overlap(claimWords: string[], text: string): { ratio: number; matched: number } {
  if (claimWords.length === 0) return { ratio: 0, matched: 0 };
  const matched = claimWords.filter((w) => text.includes(w)).length;
  return { ratio: matched / claimWords.length, matched };
}

function debunkQuote(slots: ClaimSlots, s: Source, text: string | undefined): string {
  if (text) {
    const hit = splitSentencesLoose(text).find(
      (x) => x.length <= 600 && DEBUNK_RE.test(x) && slots.topics.filter((t) => hasTopic(x, t)).length >= 2,
    );
    if (hit) return quoteOf(hit);
  }
  return quoteOf(s.snippet || s.title);
}

export function judgeByRules(claim: string, slots: ClaimSlots, sources: Source[], texts: Map<string, string>): RuleJudgement {
  // 1) 팩트체크 기사가 반박
  const words = keywordsOf(claim, 6).filter((w) => !/^\d/.test(w));
  const debunks = sources
    .filter((s) => s.kind === "news")
    .map((s) => {
      const text = `${s.title} ${s.snippet}`;
      return { s, text, title: overlap(words, s.title).matched, ...overlap(words, text) };
    })
    .filter((x) => FACTCHECK_RE.test(x.text) && DEBUNK_RE.test(x.text) && x.title >= MIN_TITLE_MATCHED && x.ratio >= MIN_OVERLAP)
    .sort((a, b) => b.title - a.title || b.ratio - a.ratio);
  if (debunks.length > 0) {
    const top = debunks.slice(0, 2);
    return {
      verdict: "false",
      evidenceIds: top.map((x) => x.s.id),
      reason: `팩트체크 기사(「${top[0].s.title}」)가 비슷한 주장을 사실이 아니라고 했어요. 자동 판정이라 틀릴 수 있으니 기사를 꼭 열어 확인하세요.`,
      evidence: top.map((x) => ({ source_id: x.s.id, quote: debunkQuote(slots, x.s, texts.get(x.s.id)), matched: x.s.relevance.matched })),
      comparison: [],
    };
  }

  // 2) 원문에서 같은 내용 확인
  const direct = sources.filter(
    (s) => s.relevance.grade === "direct" && texts.has(s.id) && !s.factcheck && sameTimeFrame(claim, s),
  );
  const trusted = (s: Source) => s.kind === "official" || s.kind === "paper" || s.kind === "web";
  for (const s of direct) {
    const m = bestSentence(slots, texts.get(s.id)!);
    if (!m || DEBUNK_RE.test(m.sentence) || /[?？]/.test(m.sentence)) continue;
    const allNumbers = slots.numbers.length > 0 && m.numberHits.length === slots.numbers.length;
    const enoughTopics = m.topicHits.length >= Math.max(3, Math.ceil(slots.topics.length * 0.6));
    if (allNumbers || (slots.numbers.length === 0 && trusted(s) && enoughTopics)) {
      return {
        verdict: "confirmed",
        evidenceIds: [s.id],
        reason: `${KIND_LABEL[s.kind]}에서 같은 내용을 찾았어요. 자동 대조라 틀릴 수 있으니 근거 문장과 링크를 확인해 보세요.`,
        evidence: [{ source_id: s.id, quote: quoteOf(m.sentence), matched: [...m.topicHits, ...m.numberHits] }],
        comparison: comparisonNotes(claim, slots, m),
      };
    }
  }

  // 3) 공식 안내·논문의 수치가 다름
  if (slots.numbers.length > 0) {
    for (const s of direct.filter(trusted)) {
      const text = texts.get(s.id)!;
      if (slots.numbers.some((n) => numberIn(text, n).hit)) continue; // 다른 문장에 같은 수치가 있으면 보류
      const m = bestSentence(slots, text);
      if (!m || m.topicHits.length < 3 || m.numberHits.length > 0 || m.otherNumbers.length === 0) continue;
      return {
        verdict: "false",
        evidenceIds: [s.id],
        reason: `${KIND_LABEL[s.kind]}의 수치가 게시물과 달라요. 자동 대조라 틀릴 수 있으니 근거 문장을 확인해 보세요.`,
        evidence: [{ source_id: s.id, quote: quoteOf(m.sentence), matched: m.topicHits }],
        comparison: [`게시물: ${slots.numbers.map((n) => n.raw).join(", ")} / 원문: ${m.otherNumbers.join(", ")}`],
      };
    }
  }

  // 4) 보류
  const hasFactcheck = sources.some((s) => s.factcheck && FACTCHECK_RE.test(`${s.title} ${s.snippet}`));
  const timeHint =
    RELATIVE_TIME_RE.test(claim) && sources.some((s) => s.relevance.grade === "direct" && !sameTimeFrame(claim, s))
      ? `"${RELATIVE_TIME_RE.exec(claim)![1]}" 같은 시점 표현이 있어서 올해 나온 자료로만 확인해요. 비슷한 내용의 예전 기사는 있어요.`
      : "";
  return {
    verdict: "unverified",
    evidenceIds: [],
    reason: [hasFactcheck ? "관련 팩트체크 기사가 있어요. 아래 자료에서 직접 읽어 보세요." : "", timeHint].filter(Boolean).join(" "),
    evidence: [],
    comparison: [],
  };
}
