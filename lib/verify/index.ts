// 판정 파이프라인: 주장 추출 → 주장별 근거 검색(네이버 뉴스, KOSIS) → Claude 판정 → 코드 검사.

import { claudeConfigured, describeClaudeError } from "@/lib/ai/claude";
import { extractClaims, splitSentences, type ExtractedClaim } from "@/lib/claims/extract";
import { gatherEvidence } from "./evidence";
import { judgeClaims } from "./judge";
import { kosisConfigured } from "./kosis";
import { naverConfigured } from "./naver";
import type { ClaimResult, Source, VerifyResponse } from "./types";

export * from "./types";

const UNVERIFIED_NOTE = "관련 보도나 검증을 찾지 못했어요. 최근 속보라면 아직 기사가 없을 수 있어요.";
const SEARCH_ONLY_NOTE = "AI 판정 키가 없어 관련 기사만 모았어요. 직접 읽고 판단해 보세요.";

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function verifyCaption(caption: string): Promise<VerifyResponse> {
  const warnings: string[] = [];
  const today = todayKst();
  if (!naverConfigured()) warnings.push("네이버 검색 키가 없어 뉴스 근거를 찾지 않았어요 (NAVER_CLIENT_ID/SECRET).");
  if (!kosisConfigured()) warnings.push("KOSIS 키가 없어 통계 대조를 하지 않았어요 (KOSIS_API_KEY).");

  // 1) 주장 추출
  let mode: VerifyResponse["mode"] = "llm";
  let claims: ExtractedClaim[];
  if (claudeConfigured()) {
    try {
      claims = await extractClaims(caption, today);
    } catch (e) {
      warnings.push(`AI 주장 추출 실패 — 문장 단위 검색으로 대신했어요 (${describeClaudeError(e)}).`);
      mode = "search_only";
      claims = splitSentences(caption);
    }
  } else {
    warnings.push("Claude API 키가 없어 AI 판정을 하지 않았어요 (ANTHROPIC_API_KEY).");
    mode = "search_only";
    claims = splitSentences(caption);
  }

  // 2) 근거 검색 (주장별 병렬, 출처 번호는 전체에서 겹치지 않게)
  let n = 0;
  const nextId = () => `E${++n}`;
  const checkable = claims.filter((c) => c.checkable);
  const evidence = new Map<ExtractedClaim, Source[]>();
  await Promise.all(
    checkable.map(async (c) => {
      evidence.set(c, await gatherEvidence({ claim: c.text, type: c.type, keywords: c.keywords, statQuery: c.statQuery }, nextId, warnings));
    }),
  );

  // 3) 판정
  let judged: Map<ExtractedClaim, { verdict: ClaimResult["verdict"]; ids: string[]; reason: string }> | null = null;
  if (mode === "llm" && checkable.length > 0) {
    try {
      const out = await judgeClaims(
        checkable.map((c) => ({ claim: c.text, type: c.type, sources: evidence.get(c) ?? [] })),
        today,
      );
      judged = new Map(checkable.map((c, i) => [c, { verdict: out[i].verdict, ids: out[i].evidenceIds, reason: out[i].reason }]));
    } catch (e) {
      warnings.push(`AI 판정 실패 — 관련 기사만 보여줘요 (${describeClaudeError(e)}).`);
    }
  }

  // 4) 결과 조립
  const results: ClaimResult[] = claims.map((c) => {
    if (!c.checkable) {
      return { claim: c.text, type: null, verdict: "not_target", reason: c.notTargetReason || "의견·감상·광고 문구예요.", sources: [], related: [] };
    }
    const all = evidence.get(c) ?? [];
    const j = judged?.get(c);
    if (!j) {
      return { claim: c.text, type: c.type, verdict: "unverified", reason: mode === "llm" ? UNVERIFIED_NOTE : SEARCH_ONLY_NOTE, sources: [], related: all };
    }
    const used = new Set(j.ids);
    return {
      claim: c.text,
      type: c.type,
      verdict: j.verdict,
      reason: j.verdict === "unverified" && !j.reason ? UNVERIFIED_NOTE : j.reason,
      sources: all.filter((s) => used.has(s.id)),
      related: all.filter((s) => !used.has(s.id)),
    };
  });

  return { mode: judged ? "llm" : "search_only", claims: results, warnings, checked_at: new Date().toISOString() };
}
