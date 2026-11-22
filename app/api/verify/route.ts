// POST /api/verify
// 요청: { "caption": "caption_clean 본문", "offset"?: 다음 묶음 시작 위치 (기본 0) }
// 응답: VerifyResponse (lib/verify/types.ts)
// 외부 API 키(Claude, 네이버, KOSIS)는 서버에서만 쓴다.

import { NextResponse } from "next/server";
import { verifyCaption } from "@/lib/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CAPTION = 5000;

export async function POST(req: Request) {
  let body: { caption?: unknown; offset?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아님" }, { status: 400 });
  }
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  if (!caption || caption.length > MAX_CAPTION) {
    return NextResponse.json({ error: `확인할 글은 1~${MAX_CAPTION}자여야 해요` }, { status: 400 });
  }
  // 나머지 주장 검증: 이전 응답의 next_offset을 그대로 보낸다
  const offset = Number.isInteger(body.offset) && (body.offset as number) >= 0 ? (body.offset as number) : 0;

  try {
    return NextResponse.json(await verifyCaption(caption, offset));
  } catch (e) {
    console.error("verify failed", e);
    return NextResponse.json({ error: "판정 중 오류가 났어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
