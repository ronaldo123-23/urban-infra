import { imageSize } from "image-size";
import { createWorker } from "tesseract.js";
import { readMetaTags } from "./html";
import { parsePostUrl } from "./url";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class ImageOcrError extends Error {}

export async function readLimited(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new ImageOcrError("읽을 파일이 없어요.");
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(parts, size);
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new ImageOcrError("이미지 한 장은 4MB 이하여야 해요.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function imageHost(url: URL) {
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
    /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname);
}

export async function fetchRepresentativeImage(input: string) {
  const post = parsePostUrl(input);
  if (!post || post.type !== "post") return null;
  const signal = AbortSignal.timeout(7000);
  const headers = { "User-Agent": "urban-infra-factcheck/0.1 (+https://github.com/sten5891-code/urban-infra)" };
  const page = await fetch(post.canonical, { signal, headers, redirect: "manual", cache: "no-store" });
  if (!page.ok || !page.headers.get("content-type")?.includes("text/html")) return null;
  const meta = readMetaTags((await readLimited(page.body, 2_000_000)).toString("utf8"));
  if (!meta["og:image"] || (!meta["og:title"] && !meta["og:description"])) return null;
  const previewUrl = meta["og:url"];
  if (previewUrl && parsePostUrl(previewUrl)?.canonical !== post.canonical) return null;
  let url: URL;
  try {
    url = new URL(meta["og:image"]);
  } catch {
    return null;
  }
  if (!imageHost(url) || /(?:^|[./])(?:static|rsrc)(?:[./]|$)/i.test(url.href)) return null;
  const image = await fetch(url, { signal, headers, redirect: "manual", cache: "no-store" });
  if (!image.ok || !IMAGE_TYPES.has(image.headers.get("content-type")?.split(";")[0] ?? "")) return null;
  return readLimited(image.body, MAX_IMAGE_BYTES);
}

export async function readImageText(image: Buffer): Promise<{ text: string; confidence: number }> {
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(image);
  } catch {
    throw new ImageOcrError("PNG, JPEG 또는 WebP 이미지를 올려 주세요.");
  }
  if (!["png", "jpg", "webp"].includes(dimensions.type ?? "")) {
    throw new ImageOcrError("PNG, JPEG 또는 WebP 이미지를 올려 주세요.");
  }
  if (dimensions.width * dimensions.height > 16_000_000) {
    throw new ImageOcrError("해상도가 너무 높아요. 이미지 크기를 줄여 다시 올려 주세요.");
  }
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    worker = await createWorker(["kor", "eng"], 1, { cachePath: "/tmp" });
    if (expired) return { text: "", confidence: 0 };
    const { data } = await worker.recognize(image);
    return { text: data.text.trim(), confidence: data.confidence };
  })();
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new ImageOcrError("이미지를 읽는 데 시간이 오래 걸려요. 크기를 줄여 다시 시도해 주세요."));
        }, 30_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (worker) await worker.terminate();
    else if (expired) void work.finally(() => worker?.terminate()).catch(() => {});
  }
}
