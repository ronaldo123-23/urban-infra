import { NextResponse } from "next/server";
import { fetchRepresentativeImage, ImageOcrError, MAX_IMAGE_BYTES, readImageText, readLimited } from "@/lib/extract/imageOcr";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
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
    const { text, confidence } = await readImageText(image);
    return NextResponse.json({ text, status: !text ? "no_text" : confidence < 75 ? "needs_review" : "read" });
  } catch (error) {
    if (error instanceof ImageOcrError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error instanceof ImageOcrError ? error.message : "요청 형식을 확인해 주세요." }, { status: 422 });
    }
    return NextResponse.json({ error: "이미지를 읽지 못했어요. 스크린샷을 올리거나 다시 시도해 주세요." }, { status: 502 });
  }
}
