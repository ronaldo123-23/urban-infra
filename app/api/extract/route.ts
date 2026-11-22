// POST /api/extract
// 요청: { "url": "인스타 링크", "manual_caption"?: "사용자가 붙여넣은 캡션" }
// 응답: ExtractResponse (lib/extract/types.ts)
// 인스타 요청은 반드시 서버에서 한다 (브라우저에서 직접 하면 CORS로 막힘).

import { NextResponse } from "next/server";
import { extractFromManual, extractFromUrl } from "@/lib/extract";
import { findFalseDisclosure } from "@/lib/extract/selfDisclosure";
import type { ExtractResponse } from "@/lib/extract/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URL = 500;
const MAX_CAPTION = 5000; // 인스타 캡션 최대 2,200자 + 여유

function extractionResponse(data: ExtractResponse) {
  const falseDisclosure = findFalseDisclosure(data.result.caption_raw);
  return NextResponse.json(falseDisclosure ? { ...data, false_disclosure: falseDisclosure } : data);
}

export async function POST(req: Request) {
  let body: { url?: unknown; manual_caption?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아님" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url || url.length > MAX_URL) {
    return NextResponse.json({ error: "링크를 입력해 주세요" }, { status: 400 });
  }

  if (body.manual_caption !== undefined) {
    const caption = typeof body.manual_caption === "string" ? body.manual_caption.trim() : "";
    if (!caption || caption.length > MAX_CAPTION) {
      return NextResponse.json({ error: `캡션은 1~${MAX_CAPTION}자로 입력해 주세요` }, { status: 400 });
    }
    return extractionResponse(extractFromManual(url, caption));
  }

  return extractionResponse(await extractFromUrl(url));
}
