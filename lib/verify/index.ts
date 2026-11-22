// 판정 파이프라인: 주장 고르기 → (BATCH_SIZE개씩) 주장별 근거 검색(네이버 뉴스, KOSIS) → 판정 → 코드 검사.
// 기본은 규칙(rules). ANTHROPIC_API_KEY가 있으면 Claude(llm)로 주장 추출·판정을 하고, 실패하면 규칙으로 돌아간다.

import { claudeConfigured, describeClaudeError } from "@/lib/ai/claude";
import { extractClaims, type ExtractedClaim } from "@/lib/claims/extract";
import { BATCH_SIZE, extractClaimsByRules } from "@/lib/claims/rules";
import { eventOf, gatherEvidence, type Evidence } from "./evidence";
import { judgeClaims } from "./judge";
import { kosisConfigured } from "./kosis";
import { naverConfigured } from "./naver";
import { judgeByRules } from "./rules";
import { slotsOf } from "./slots";
import type { ClaimResult, EvidenceQuote, HoldReason, SkippedSentence, Verdict, VerifyResponse } from "./types";

export * from "./types";

interface Judgement {
  verdict: Exclude<Verdict, "not_target">;
  evidenceIds: string[];
  reason: string;
  evidence?: EvidenceQuote[];
  comparison?: string[];
}

const HOLD_MESSAGE: Record<HoldReason, string> = {
  search_not_run: "뉴스 검색이 실행되지 않았어요.",
  no_results: "관련 자료를 찾지 못했어요. 최근 소식이라면 아직 기사가 없을 수 있어요.",
  insufficient_match: "관련 기사는 찾았지만 이 주장을 확인할 근거 문장을 찾지 못했어요.",
};

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function holdReasonOf(ev: Evidence | undefined): HoldReason {
  if (!ev || (!ev.newsSearched && ev.sources.length === 0)) return "search_not_run";
  if (ev.sources.length === 0) return "no_results";
  return "insufficient_match";
}

export async function verifyCaption(caption: string, offset = 0): Promise<VerifyResponse> {
  const warnings: string[] = [];
  const today = todayKst();
  if (!naverConfigured()) warnings.push("네이버 검색 키가 없어 뉴스 근거를 찾지 않았어요 (NAVER_HUB_KEY_ID/KEY).");
  if (!kosisConfigured()) warnings.push("KOSIS 키가 없어 통계 대조를 하지 않았어요 (KOSIS_API_KEY).");

  // 1) 주장 고르기 — 규칙은 캡션 전체를 우선순위로 정렬해 돌려준다
  let mode: VerifyResponse["mode"] = claudeConfigured() ? "llm" : "rules";
  let checkableAll: ExtractedClaim[];
  let notTargets: ExtractedClaim[];
  let skipped: SkippedSentence[] = [];
  const useRules = () => {
    const r = extractClaimsByRules(caption);
    checkableAll = r.claims;
    notTargets = r.notTargets;
    skipped = r.skipped;
  };
  if (mode === "llm") {
    try {
      // Claude 경로는 한 번에 최대 5개만 고른다 (묶음 나누기 없음)
      const all = await extractClaims(caption, today);
      checkableAll = all.filter((c) => c.checkable);
      notTargets = all.filter((c) => !c.checkable);
      offset = 0;
    } catch (e) {
      warnings.push(`AI 주장 추출 실패 — 규칙으로 대신했어요 (${describeClaudeError(e)}).`);
      mode = "rules";
      useRules();
    }
  } else {
    useRules();
  }
  // TypeScript가 위 분기에서 값이 정해진 것을 알도록
  checkableAll = checkableAll!;
  notTargets = notTargets!;

  const start = Math.min(Math.max(0, offset), checkableAll.length);
  const batch = mode === "llm" ? checkableAll : checkableAll.slice(start, start + BATCH_SIZE);
  const end = start + batch.length;
  const nextOffset = mode === "rules" && end < checkableAll.length ? end : null;

  // 2) 근거 검색 (주장별 병렬, 출처 번호는 전체에서 겹치지 않게)
  let n = 0;
  const nextId = () => `E${++n}`;
  const evidence = new Map<ExtractedClaim, Evidence>();
  const slots = new Map(batch.map((c) => [c, slotsOf(c.text)]));
  await Promise.all(
    batch.map(async (c) => {
      evidence.set(
        c,
        await gatherEvidence(
          { claim: c.text, type: c.type, keywords: c.keywords, statQuery: c.statQuery, slots: slots.get(c)!, event: eventOf(c.text, caption) },
          nextId,
          warnings,
        ),
      );
    }),
  );

  // 3) 판정
  const judged = new Map<ExtractedClaim, Judgement>();
  if (mode === "llm" && batch.length > 0) {
    try {
      const out = await judgeClaims(
        batch.map((c) => ({ claim: c.text, type: c.type, sources: evidence.get(c)?.sources ?? [] })),
        today,
      );
      batch.forEach((c, i) => judged.set(c, out[i]));
    } catch (e) {
      warnings.push(`AI 판정 실패 — 규칙으로 대신했어요 (${describeClaudeError(e)}).`);
      mode = "rules";
    }
  }
  if (judged.size === 0) {
    for (const c of batch) {
      const ev = evidence.get(c);
      judged.set(c, judgeByRules(c.text, slots.get(c)!, ev?.sources ?? [], ev?.texts ?? new Map()));
    }
  }

  // 4) 결과 조립 + 최종 검사: 근거 링크 없는 확인됨/거짓은 허용하지 않는다
  const checked: ClaimResult[] = batch.map((c) => {
    const ev = evidence.get(c);
    const all = ev?.sources ?? [];
    const j = judged.get(c) ?? { verdict: "unverified", evidenceIds: [], reason: "" };
    const used = new Set(j.evidenceIds.filter((id) => all.some((s) => s.id === id)));
    const verdict = j.verdict !== "unverified" && used.size === 0 ? "unverified" : j.verdict;
    const hold = verdict === "unverified" ? holdReasonOf(ev) : null;
    const reason = hold ? [HOLD_MESSAGE[hold], verdict === j.verdict ? j.reason : ""].filter(Boolean).join(" ") : j.reason;
    return {
      claim: c.text,
      type: c.type,
      verdict,
      reason,
      sources: all.filter((s) => used.has(s.id)),
      related: all.filter((s) => !used.has(s.id)),
      hold_reason: hold,
      evidence: verdict === j.verdict ? (j.evidence ?? []).filter((e) => used.has(e.source_id)) : [],
      comparison: verdict === j.verdict ? (j.comparison ?? []) : [],
    };
  });

  // 판단 대상 아님 문장과 뺀 문장은 첫 묶음에만 붙인다
  const first = start === 0;
  const notTargetResults: ClaimResult[] = first
    ? notTargets.map((c) => ({
        claim: c.text,
        type: null,
        verdict: "not_target",
        reason: c.notTargetReason || "의견·감상·광고 문구예요.",
        sources: [],
        related: [],
        hold_reason: null,
        evidence: [],
        comparison: [],
      }))
    : [];

  return {
    mode,
    claims: [...checked, ...notTargetResults],
    total_checkable: checkableAll.length,
    offset: start,
    next_offset: nextOffset,
    skipped: first ? skipped : [],
    warnings,
    checked_at: new Date().toISOString(),
  };
}
