// 방법 1: Meta 공식 oEmbed API (instagram_oembed).
// Meta 개발자 앱 + oEmbed Read 권한 심사가 필요하다. 토큰이 없으면 건너뛴다.

export type StepOutcome =
  | { ok: true; author: string | null; caption: string }
  | { ok: false; skipped?: boolean; reason: string };

const TIMEOUT_MS = 8000;

export async function tryOembed(canonicalUrl: string): Promise<StepOutcome> {
  const token = process.env.META_OEMBED_TOKEN?.trim();
  if (!token) {
    return { ok: false, skipped: true, reason: "META_OEMBED_TOKEN 미설정 (Meta 앱 oEmbed Read 심사 전)" };
  }
  const version = process.env.META_GRAPH_VERSION?.trim() || "v21.0";
  const endpoint = new URL(`https://graph.facebook.com/${version}/instagram_oembed`);
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("omitscript", "true");
  endpoint.searchParams.set("access_token", token);

  let res: Response;
  try {
    res = await fetch(endpoint, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    return { ok: false, reason: `oEmbed 요청 실패: ${errorText(e)}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: `oEmbed 응답이 JSON이 아님 (HTTP ${res.status})` };
  }

  if (!res.ok) {
    const msg = (body as { error?: { message?: string } })?.error?.message;
    return { ok: false, reason: `oEmbed HTTP ${res.status}${msg ? `: ${msg}` : ""}` };
  }

  const data = body as { title?: string; author_name?: string };
  if (!data.title?.trim()) {
    return { ok: false, reason: "oEmbed 응답에 캡션(title)이 없음" };
  }
  return { ok: true, author: data.author_name?.trim() || null, caption: data.title };
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.name === "TimeoutError" ? "시간 초과" : e.message;
  return String(e);
}
