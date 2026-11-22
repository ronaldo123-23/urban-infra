// 글 읽기 순서: oEmbed → 메타 태그 → (둘 다 실패) 수동 입력 요청.

import { cleanCaption, extractHashtags } from "./caption";
import { tryMetaTag } from "./metaTag";
import { tryOembed, type StepOutcome } from "./oembed";
import type { ExtractAttempt, ExtractMethod, ExtractResponse, ExtractionResult } from "./types";
import { parsePostUrl } from "./url";

export * from "./types";

function build(
  url: string,
  method: ExtractMethod | null,
  author: string | null,
  caption: string | null,
  error: string | null,
): ExtractionResult {
  return {
    url,
    method,
    author,
    caption_raw: caption,
    caption_clean: caption === null ? null : cleanCaption(caption),
    hashtags: caption === null ? [] : extractHashtags(caption),
    fetched_at: new Date().toISOString(),
    error,
  };
}

export async function extractFromUrl(inputUrl: string): Promise<ExtractResponse> {
  const parsed = parsePostUrl(inputUrl);
  if (!parsed) {
    return {
      result: build(inputUrl, null, null, null, "지원하지 않는 링크 (instagram.com/p/… 또는 /reel/… 만 가능)"),
      attempts: [],
      needs_manual: false,
      post_type: null,
    };
  }

  const steps: [ExtractMethod, (u: string) => Promise<StepOutcome>][] = [
    ["oembed", tryOembed],
    ["meta_tag", tryMetaTag],
  ];
  const attempts: ExtractAttempt[] = [];

  for (const [method, run] of steps) {
    const out = await run(parsed.canonical);
    if (out.ok) {
      attempts.push({ method, status: "success", reason: null });
      return {
        result: build(inputUrl, method, out.author, out.caption, null),
        attempts,
        needs_manual: false,
        post_type: parsed.type,
      };
    }
    attempts.push({ method, status: out.skipped ? "skipped" : "failed", reason: out.reason });
  }

  const reasons = attempts.map((a) => `${a.method}: ${a.reason}`).join(" / ");
  return {
    result: build(inputUrl, null, null, null, `자동 추출 실패 — ${reasons}`),
    attempts,
    needs_manual: true,
    post_type: parsed.type,
  };
}

export function extractFromManual(inputUrl: string, caption: string): ExtractResponse {
  const parsed = parsePostUrl(inputUrl);
  return {
    result: build(inputUrl, "manual", null, caption, null),
    attempts: [{ method: "manual", status: "success", reason: null }],
    needs_manual: false,
    post_type: parsed?.type ?? null,
  };
}
