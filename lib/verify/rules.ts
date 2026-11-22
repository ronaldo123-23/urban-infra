// AI 없이 규칙으로 판정 (Claude 키가 없을 때 기본 경로).
// - "거짓으로 밝혀짐": 팩트체크 기사의 제목·요약에 반박 표현이 있고, 주장 핵심어와 충분히 겹칠 때만.
// - "확인됨": 규칙으로는 기사 내용이 주장과 일치하는지 믿고 판단할 수 없어 내지 않는다.
// - 나머지: "아직 확인 안 됨" + 관련 자료.

import { keywordsOf } from "@/lib/claims/rules";
import type { Source, Verdict } from "./types";

// 팩트체크 기사에서 주장을 반박할 때 쓰는 표현
const DEBUNK_RE =
  /(사실\s*아님|사실이\s*아니|사실과\s*달라|사실과\s*다르|거짓|허위|사실무근|가짜\s*뉴스|가짜뉴스|근거\s*없|근거가\s*없|오해|과장|왜곡|조작|대체로\s*틀림|틀렸|틀린\s*주장|루머|괴담|낭설)/;
// 팩트체크 기사임을 나타내는 표현 (검색어로 찾았더라도 실제 팩트체크 기사인지 한 번 더 본다)
const FACTCHECK_RE = /(팩트\s*체크|팩트체크|사실\s*확인|사실은|따져\s*보니|검증|진위)/;

const MIN_OVERLAP = 0.5; // 주장 핵심어의 절반 이상이 기사에 나와야 같은 주장으로 본다
const MIN_MATCHED = 2;

export interface RuleJudgement {
  verdict: Exclude<Verdict, "not_target">;
  evidenceIds: string[];
  reason: string;
}

function overlap(claimWords: string[], text: string): { ratio: number; matched: number } {
  if (claimWords.length === 0) return { ratio: 0, matched: 0 };
  const matched = claimWords.filter((w) => text.includes(w)).length;
  return { ratio: matched / claimWords.length, matched };
}

export function judgeByRules(claim: string, sources: Source[]): RuleJudgement {
  const words = keywordsOf(claim, 6);
  const debunks = sources
    .filter((s) => s.kind === "news")
    .map((s) => {
      const text = `${s.title} ${s.snippet}`;
      return { s, text, ...overlap(words, text) };
    })
    .filter(
      (x) =>
        FACTCHECK_RE.test(x.text) &&
        DEBUNK_RE.test(x.text) &&
        x.ratio >= MIN_OVERLAP &&
        x.matched >= MIN_MATCHED,
    )
    .sort((a, b) => b.ratio - a.ratio);

  if (debunks.length > 0) {
    const top = debunks.slice(0, 2);
    return {
      verdict: "false",
      evidenceIds: top.map((x) => x.s.id),
      reason: `팩트체크 기사(「${top[0].s.title}」)가 비슷한 주장을 사실이 아니라고 했어요. 자동 판정이라 틀릴 수 있으니 기사를 꼭 열어 확인하세요.`,
    };
  }

  const hasFactcheck = sources.some((s) => s.factcheck && FACTCHECK_RE.test(`${s.title} ${s.snippet}`));
  return {
    verdict: "unverified",
    evidenceIds: [],
    reason: hasFactcheck
      ? "관련 팩트체크 기사는 있지만 이 주장을 직접 반박하는지는 자동으로 판단하지 못했어요. 아래 자료를 읽어 보세요."
      : sources.length > 0
        ? "이 주장을 검증한 팩트체크 기사를 찾지 못했어요. 아래 관련 자료를 직접 읽고 판단해 보세요."
        : "관련 보도나 검증을 찾지 못했어요. 최근 속보라면 아직 기사가 없을 수 있어요.",
  };
}
