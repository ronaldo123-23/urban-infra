// 공개 웹페이지(기사·공식 안내) 본문 가져오기.
// - 로그인·쿠키 없이, 자기 이름을 밝힌 User-Agent로 요청한다
// - HTML만, 크기·시간 제한, 실패하면 null (→ 판정은 보류)
// - 본문 전체를 화면에 보여주지 않는다. 판정 근거로 한두 문장만 인용한다 (저작권)

import { decodeEntities, readMetaTags } from "@/lib/extract/html";

const USER_AGENT = "Mozilla/5.0 (compatible; urban-infra-factcheck/0.1; +https://github.com/sten5891-code/urban-infra)";
const TIMEOUT_MS = 7000;
const MAX_BYTES = 3_000_000;
const MAX_TEXT = 40_000;

export interface PageText {
  title: string;
  text: string;
}

function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    // 내부망 주소는 읽지 않는다
    return !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1|0\.0\.0\.0)/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** HTML → 읽을 수 있는 본문 텍스트 (스크립트·메뉴 제거, 문단 단위 줄바꿈) */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|header|footer|nav|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 2)
    .join("\n")
    .slice(0, MAX_TEXT);
}

export async function fetchPageText(url: string): Promise<PageText | null> {
  if (!isPublicHttpUrl(url)) return null;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(type)) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return null;
  if (/\/(login|signin|accounts)\b/i.test(new URL(res.url).pathname)) return null; // 로그인 벽

  const html = (await res.text()).slice(0, MAX_BYTES);
  const meta = readMetaTags(html);
  const title = decodeEntities(meta["og:title"] ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "");
  const text = htmlToText(html);
  return text.length >= 200 ? { title, text } : null;
}
