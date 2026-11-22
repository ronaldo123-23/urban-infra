// Claude API 공통 설정. 환경변수: ANTHROPIC_API_KEY (선택: ANTHROPIC_MODEL)

import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

// 안전 분류기가 요청을 거절하면 서버가 다른 모델로 다시 시도한다 (server-side fallback).
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
export function getClaude(): Anthropic {
  client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

export function describeClaudeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Claude API 키가 올바르지 않음";
  if (e instanceof Anthropic.RateLimitError) return "Claude API 사용량 한도 초과 (잠시 후 다시 시도)";
  if (e instanceof Anthropic.APIError) return `Claude API 오류 ${e.status ?? ""}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
