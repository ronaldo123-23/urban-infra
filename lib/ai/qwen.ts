// 알리바바 클라우드 Model Studio(Qwen) 공통 설정. OpenAI 호환 주소로 직접 호출한다 (추가 패키지 없음).
// 환경변수: DASHSCOPE_API_KEY, QWEN_MODEL, QWEN_VISION_MODEL (선택: DASHSCOPE_BASE_URL — 키를 받은 지역 주소)
// 무료 토큰을 아끼려고: 생각(thinking) 끄기, 답변 길이 제한, 요청 1번에 여러 주장을 묶어서 보낸다.

const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const TIMEOUT_MS = 25_000;

export function qwenModel(): string {
  return process.env.QWEN_MODEL?.trim() ?? "";
}

export function qwenConfigured(): boolean {
  return Boolean(process.env.DASHSCOPE_API_KEY?.trim() && qwenModel());
}

export class QwenError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

export interface QwenUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

/** JSON으로만 답하게 해서 받는다. 실패하면 QwenError */
export async function qwenJson(system: string, user: string, maxTokens: number): Promise<{ json: unknown; usage: QwenUsage | null }> {
  return requestJson(qwenModel(), system, user, maxTokens);
}

export function qwenVisionConfigured(): boolean {
  return Boolean(process.env.DASHSCOPE_API_KEY?.trim() && process.env.QWEN_VISION_MODEL?.trim());
}

type ImageMessage = [
  { type: "image_url"; image_url: { url: string } },
  { type: "text"; text: string },
];

export async function qwenVisionJson(system: string, prompt: string, dataUrl: string) {
  const model = process.env.QWEN_VISION_MODEL?.trim();
  if (!model || !qwenVisionConfigured()) throw new QwenError("Qwen 이미지 분석 설정이 필요해요.");
  return requestJson(model, system, [
    { type: "image_url", image_url: { url: dataUrl } },
    { type: "text", text: prompt },
  ], 1800);
}

async function requestJson(model: string, system: string, user: string | ImageMessage, maxTokens: number): Promise<{ json: unknown; usage: QwenUsage | null }> {
  const base = (process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        enable_thinking: false,
        temperature: 0,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new QwenError((e as Error).name === "TimeoutError" ? "Qwen 응답 시간 초과" : `Qwen 연결 실패: ${(e as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: QwenUsage;
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) throw new QwenError(describeQwenStatus(res.status, body?.error?.code ?? null), body?.error?.code ?? null);
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === "length") throw new QwenError("Qwen 답변이 길이 제한에서 잘림");
  const content = choice?.message?.content ?? "";
  try {
    return { json: JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")), usage: body?.usage ?? null };
  } catch {
    throw new QwenError("Qwen 답변이 JSON 형식이 아님");
  }
}

function describeQwenStatus(status: number, code: string | null): string {
  if (code === "AccessDenied.Unpurchased") return "이 계정에서 모델을 쓸 수 없음 (Model Studio에서 모델 사용을 켜야 함)";
  if (code?.startsWith("Arrearage") || code === "AllocationQuota.FreeTierOnly") return "무료 토큰을 다 썼거나 결제가 필요함";
  if (status === 401) return "Qwen API 키가 올바르지 않음 (키를 받은 지역 주소인지도 확인)";
  if (status === 429) return "Qwen 사용량 한도 초과 (잠시 후 다시 시도)";
  return `Qwen API 오류 ${status}${code ? ` (${code})` : ""}`;
}
