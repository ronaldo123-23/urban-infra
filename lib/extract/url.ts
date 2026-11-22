// 인스타그램 게시물 링크 검사·정규화.
// 지원: instagram.com/p/<code>, instagram.com/reel/<code> (계정명이 앞에 붙은 형태 포함)

export interface ParsedPostUrl {
  canonical: string; // https://www.instagram.com/p/<code>/
  type: "post" | "reel";
  shortcode: string;
}

const PATH_RE = /^\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/;

export function parsePostUrl(input: string): ParsedPostUrl | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();
  if (host !== "instagram.com" && host !== "www.instagram.com" && host !== "m.instagram.com") {
    return null;
  }

  const m = PATH_RE.exec(u.pathname);
  if (!m) return null;

  const type = m[1] === "p" ? "post" : "reel";
  const shortcode = m[2];
  const segment = type === "post" ? "p" : "reel";
  return { canonical: `https://www.instagram.com/${segment}/${shortcode}/`, type, shortcode };
}

/** 공유 목록에서 넘어온 text/url 안에서 인스타 링크를 찾아낸다 */
export function findInstagramUrl(text: string): string | null {
  const m = /(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/[^\s"'<>]+/i.exec(text);
  return m ? m[0] : null;
}
