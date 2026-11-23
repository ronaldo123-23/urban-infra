// 판정 단계 데이터 형식 (docs/SPEC.md 7-3, 7-4).

/**
 * confirmed=확인됨, false=근거와 다름 (2026-11-22 "거짓으로 밝혀짐"에서 이름 변경, 코드 값은 그대로),
 * unverified=아직 확인 안 됨, not_target=판단 대상 아님
 */
export type Verdict = "confirmed" | "false" | "unverified" | "not_target";

/** statistic=통계 조작·뻥튀기, mixed=사실을 섞은 거짓, fabricated=완전한 거짓·조작 의심 */
export type ClaimType = "statistic" | "mixed" | "fabricated";

export interface SourceRelevance {
  score: number; // 0~100 (docs/IMPROVEMENT_PLAN.md 3-1절)
  grade: "direct" | "related"; // 무관은 결과에 넣지 않는다
  matched: string[]; // "일치: …"로 보여줄 항목
}

export interface Source {
  id: string; // 근거 번호 (E1, E2 …) — 판정 AI는 이 번호만 인용할 수 있다
  /** news=뉴스, paper=논문(Europe PMC), official=공식 안내 페이지, web=믿을 만한 도메인의 웹문서, kosis=통계 */
  kind: "news" | "paper" | "official" | "web" | "kosis";
  title: string;
  url: string;
  publisher: string | null;
  date: string | null;
  snippet: string;
  /** 같은 보도자료를 받아쓴 것으로 보이는 기사 수 (자기 포함). 1개 출처로 센다 */
  duplicates: number;
  /** "팩트체크 + 핵심어" 검색으로 찾은 기사인지 */
  factcheck: boolean;
  relevance: SourceRelevance;
  /** 원문(본문·초록)을 읽어서 대조했는지 */
  full_text_read: boolean;
}

/** 원문에서 찾은 근거 문장 (한두 문장만 인용) */
export interface EvidenceQuote {
  source_id: string;
  quote: string;
  matched: string[];
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
  /** verdict가 unverified일 때 보류 이유. 그 외에는 null */
  hold_reason: HoldReason | null;
  /** 원문에서 찾은 근거 문장 */
  evidence: EvidenceQuote[];
  /** 비교 설명 (예: "원문은 52% 대 34%로 18%포인트 차이예요", 불확실성) */
  comparison: string[];
  /** 누가 판정했나: rules=규칙, ai=AI (Qwen 2차 판정 또는 Claude) */
  judged_by: "rules" | "ai";
}

/**
 * search_not_run=검색을 못 함 (키 없음·오류), no_results=관련 자료 없음,
 * insufficient_match=관련 자료는 있지만 주장을 확인할 근거를 못 찾음
 */
export type HoldReason = "search_not_run" | "no_results" | "insufficient_match";

/** AI 2차 판정 기록 (화면 안내·사용량 확인용) */
export interface AiUsage {
  provider: "qwen";
  model: string;
  /** AI에게 보낸 주장 수 */
  claims: number;
  /** AI 판단으로 "아직 확인 안 됨"에서 바뀐 주장 수 */
  changed: number;
  /** 이번 요청에 쓴 토큰 (입력+출력). 모르면 null */
  tokens: number | null;
}

export interface SkippedSentence {
  text: string;
  reason: string;
}

export interface VerifyResponse {
  /** rules=규칙으로 주장 추출·판정 (기본), llm=Claude가 주장 추출·판정 (ANTHROPIC_API_KEY가 있을 때) */
  mode: "rules" | "llm";
  /** 규칙 판정 뒤 AI(Qwen) 2차 판정을 했으면 그 기록. 안 했으면 null */
  ai: AiUsage | null;
  /** 이번에 검증한 주장 (+ 첫 묶음에는 판단 대상 아님 문장) */
  claims: ClaimResult[];
  /** 검증할 주장 전체 개수 (판단 대상 아님 제외) */
  total_checkable: number;
  /** 이번 묶음이 시작한 위치 */
  offset: number;
  /** 다음 묶음 시작 위치. 남은 주장이 없으면 null */
  next_offset: number | null;
  /** 검증에서 뺀 문장 (제목 조각·소개 문장·반복). 첫 묶음에만 */
  skipped: SkippedSentence[];
  warnings: string[];
  checked_at: string;
}
