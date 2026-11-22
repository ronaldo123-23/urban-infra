// 1단계 추출 결과 형식 (docs/SPEC.md 6-2). 나중 단계(주장 추출, 판정)는 이 결과를 입력으로 받는다.

export type ExtractMethod = "oembed" | "meta_tag" | "manual";

export interface ExtractionResult {
  url: string;
  method: ExtractMethod | null; // 모든 자동 방법이 실패하면 null
  author: string | null;
  caption_raw: string | null;
  caption_clean: string | null;
  hashtags: string[];
  fetched_at: string; // ISO 시간
  error: string | null; // 실패 시 이유, 성공 시 null
}

/** 시도한 방법마다 하나씩 남기는 기록 */
export interface ExtractAttempt {
  method: ExtractMethod;
  status: "success" | "failed" | "skipped";
  reason: string | null;
}

export interface ExtractResponse {
  result: ExtractionResult;
  attempts: ExtractAttempt[];
  /** true면 화면에서 "캡션을 복사해서 붙여넣어 주세요" 입력칸을 띄운다 */
  needs_manual: boolean;
  post_type: "post" | "reel" | null;
}
