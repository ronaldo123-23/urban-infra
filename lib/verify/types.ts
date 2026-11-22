// 판정 단계 데이터 형식 (docs/SPEC.md 7-3, 7-4).

/** confirmed=확인됨, false=거짓으로 밝혀짐, unverified=아직 확인 안 됨, not_target=판단 대상 아님 */
export type Verdict = "confirmed" | "false" | "unverified" | "not_target";

/** statistic=통계 조작·뻥튀기, mixed=사실을 섞은 거짓, fabricated=완전한 거짓·조작 의심 */
export type ClaimType = "statistic" | "mixed" | "fabricated";

export interface Source {
  id: string; // 근거 번호 (E1, E2 …) — 판정 AI는 이 번호만 인용할 수 있다
  kind: "news" | "kosis";
  title: string;
  url: string;
  publisher: string | null;
  date: string | null;
  snippet: string;
  /** 같은 보도자료를 받아쓴 것으로 보이는 기사 수 (자기 포함). 1개 출처로 센다 */
  duplicates: number;
}

export interface ClaimResult {
  claim: string;
  type: ClaimType | null;
  verdict: Verdict;
  reason: string;
  /** 판정 근거로 인용된 출처 (confirmed/false는 최소 1개) */
  sources: Source[];
  /** 검색은 됐지만 근거로 쓰이지 않은 관련 자료 */
  related: Source[];
}

export interface VerifyResponse {
  /** llm=Claude가 주장 추출·판정, search_only=AI 키가 없어 검색 결과만 보여줌 */
  mode: "llm" | "search_only";
  claims: ClaimResult[];
  warnings: string[];
  checked_at: string;
}
