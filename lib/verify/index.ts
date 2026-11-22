// 판정 파이프라인: 주장 추출 → 주장별 근거 검색(네이버 뉴스, KOSIS) → 판정 → 코드 검사.
// 기본은 규칙(rules). ANTHROPIC_API_KEY가 있으면 Claude(llm)로 주장 추출·판정을 하고, 실패하면 규칙으로 돌아간다.

import { claudeConfigured, describeClaudeError } from "@/lib/ai/claude";
import { extractClaims, type ExtractedClaim } from "@/lib/claims/extract";
import { extractClaimsByRules } from "@/lib/claims/rules";
import { gatherEvidence } from "./evidence";
import { judgeClaims } from "./judge";
import { kosisConfigured } from "./kosis";
import { naverConfigured } from "./naver";
import { judgeByRules } from "./rules";
import type { ClaimResult, Source, Verdict, VerifyResponse } from "./types";

export * from "./types";

interface Judgement {
  verdict: Exclude<Verdict, "not_target">;
  evidenceIds: string[];
  reason: string;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function verifyCaption(caption: string): Promise<VerifyResponse> {
  const warnings: string[] = [];
  const today = todayKst();
  if (!naverConfigured()) warnings.push("네이버 검색 키가 없어 뉴스 근거를 찾지 않았어요 (NAVER_CLIENT_ID/SECRET).");
  if (!kosisConfigured()) warnings.push("KOSIS 키가 없어 통계 대조를 하지 않았어요 (KOSIS_API_KEY).");

  // 1) 주장 추출
  let mode: VerifyResponse["mode"] = claudeConfigured() ? "llm" : "rules";
  let claims: ExtractedClaim[];
  if (mode === "llm") {
    try {
      claims = await extractClaims(caption, today);
    } catch (e) {
      warnings.push(`AI 주장 추출 실패 — 규칙으로 대신했어요 (${describeClaudeError(e)}).`);
      mode = "rules";
      claims = extractClaimsByRules(caption);
    }
  } else {
    claims = extractClaimsByRules(caption);
  }

  // 2) 근거 검색 (주장별 병렬, 출처 번호는 전체에서 겹치지 않게)
  let n = 0;
  const nextId = () => `E${++n}`;
  const checkable = claims.filter((c) => c.checkable);
  const evidence = new Map<ExtractedClaim, Source[]>();
  await Promise.all(
    checkable.map(async (c) => {
      evidence.set(
        c,
        await gatherEvidence({ claim: c.text, type: c.type, keywords: c.keywords, statQuery: c.statQuery }, nextId, warnings),
      );
    }),
  );

  // 3) 판정
  const judged = new Map<ExtractedClaim, Judgement>();
  if (mode === "llm" && checkable.length > 0) {
    try {
      const out = await judgeClaims(
        checkable.map((c) => ({ claim: c.text, type: c.type, sources: evidence.get(c) ?? [] })),
        today,
      );
      checkable.forEach((c, i) => judged.set(c, out[i]));
    } catch (e) {
      warnings.push(`AI 판정 실패 — 규칙으로 대신했어요 (${describeClaudeError(e)}).`);
      mode = "rules";
    }
  }
  if (mode === "rules") {
    for (const c of checkable) judged.set(c, judgeByRules(c.text, evidence.get(c) ?? []));
  }

  // 4) 결과 조립 + 최종 검사: 근거 링크 없는 확인됨/거짓은 허용하지 않는다
  const results: ClaimResult[] = claims.map((c) => {
    if (!c.checkable) {
      return { claim: c.text, type: null, verdict: "not_target", reason: c.notTargetReason || "의견·감상·광고 문구예요.", sources: [], related: [] };
    }
    const all = evidence.get(c) ?? [];
    const j = judged.get(c) ?? { verdict: "unverified", evidenceIds: [], reason: "" };
    const used = new Set(j.evidenceIds.filter((id) => all.some((s) => s.id === id)));
    const verdict = j.verdict !== "unverified" && used.size === 0 ? "unverified" : j.verdict;
    return {
      claim: c.text,
      type: c.type,
      verdict,
      reason: verdict !== j.verdict || !j.reason ? "근거 링크가 없어 판정을 보류했어요." : j.reason,
      sources: all.filter((s) => used.has(s.id)),
      related: all.filter((s) => !used.has(s.id)),
    };
  });

  return { mode, claims: results, warnings, checked_at: new Date().toISOString() };
}
