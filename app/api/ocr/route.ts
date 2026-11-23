import { NextResponse } from "next/server";
import { QwenError, qwenVisionConfigured } from "@/lib/ai/qwen";
import { analyzeImage, fetchRepresentativeImage, ImageAnalysisError, MAX_IMAGE_BYTES, readLimited } from "@/lib/extract/imageAnalysis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!qwenVisionConfigured()) {
    return NextResponse.json({ error: "Qwen 이미지 분석이 아직 설정되지 않았어요." }, { status: 503 });
  }
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let image: Buffer | null;
    if (contentType.startsWith("application/json")) {
      const data = JSON.parse((await readLimited(request.body, 2048)).toString("utf8"));
      if (typeof data?.url !== "string" || data.url.length > 500) {
        return NextResponse.json({ error: "인스타그램 게시물 주소를 입력해 주세요." }, { status: 400 });
      }
      image = await fetchRepresentativeImage(data.url);
    } else {
      image = await readLimited(request.body, MAX_IMAGE_BYTES);
    }
    if (!image) return NextResponse.json({ text: "", status: "image_unavailable" });
    const { transcript, observations, needs_review } = await analyzeImage(image);
    const text = [transcript, observations && `이미지에 보이는 내용\n${observations}`].filter(Boolean).join("\n\n");
    return NextResponse.json({ text, provider: "qwen", status: !text ? "no_text" : needs_review ? "needs_review" : "read" });
  } catch (error) {
    if (error instanceof ImageAnalysisError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error instanceof ImageAnalysisError ? error.message : "요청 형식을 확인해 주세요." }, { status: 422 });
    }
    if (error instanceof QwenError) {
      return NextResponse.json({ error: "Qwen으로 이미지를 분석하지 못했어요. 모델 사용 권한과 사용량을 확인하거나 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }
    return NextResponse.json({ error: "이미지를 읽지 못했어요. 스크린샷을 올리거나 다시 시도해 주세요." }, { status: 502 });
  }
}
