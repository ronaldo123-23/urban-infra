// 방법 2: 공개 게시물 페이지의 메타 태그(og:description, og:title)에서 캡션 추출.
// 로그인·쿠키·비공식 스크래핑 라이브러리는 쓰지 않는다. 공개 HTML의 메타 태그만 읽는다.

import { readMetaTags } from "./html";
import { errorText, type StepOutcome } from "./oembed";

const TIMEOUT_MS = 8000;
const USER_AGENT = "Mozilla/5.0 (compatible; urban-infra-factcheck/0.1; +https://github.com/sten5891-code/urban-infra)";

// "1,234 likes, 5 comments - handle on March 3, 2024: "caption"."
const DESC_RE = /^[\s\S]*? - ([A-Za-z0-9._]+) on [^:]+:\s*["“]([\s\S]*)["”]\.?\s*$/;
// "Name (@handle) on Instagram: "caption"" 또는 "handle on Instagram: "caption""
const TITLE_RE = /^(?:[\s\S]*?\(@([A-Za-z0-9._]+)\)|([A-Za-z0-9._]+)) on Instagram:\s*["“]([\s\S]*)["”]\s*$/;

export async function tryMetaTag(canonicalUrl: string): Promise<StepOutcome> {
  let res: Response;
  try {
    res = await fetch(canonicalUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, reason: `게시물 페이지 요청 실패: ${errorText(e)}` };
  }

  if (!res.ok) return { ok: false, reason: `게시물 페이지 HTTP ${res.status}` };
  if (/\/accounts\/login/.test(res.url)) {
    return { ok: false, reason: "로그인 화면으로 이동됨 (비공개 게시물이거나 접근 제한)" };
  }

  const html = await res.text();
  return parseMeta(readMetaTags(html));
}

export function parseMeta(meta: Record<string, string>): StepOutcome {
  const candidates: { author: string | null; caption: string }[] = [];

  const desc = meta["og:description"] ?? meta["description"];
  const d = desc ? DESC_RE.exec(desc) : null;
  if (d) candidates.push({ author: d[1], caption: d[2] });

  const title = meta["og:title"] ?? meta["twitter:title"];
  const t = title ? TITLE_RE.exec(title) : null;
  if (t) candidates.push({ author: t[1] ?? t[2] ?? null, caption: t[3] });

  const best = candidates
    .filter((c) => c.caption.trim())
    .sort((a, b) => b.caption.length - a.caption.length)[0];

  if (!best) {
    return {
      ok: false,
      reason: desc || title
        ? "메타 태그에 캡션 형식이 없음 (로그인 안내 화면이거나 캡션이 없는 게시물)"
        : "메타 태그(og:description, og:title)가 없음",
    };
  }
  const author = best.author ?? candidates.find((c) => c.author)?.author ?? null;
  return { ok: true, author, caption: best.caption };
}
