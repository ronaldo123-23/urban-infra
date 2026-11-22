// 캡션 정리: 해시태그·멘션·이모지를 빼고 본문만 남긴다.

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /(^|[^\p{L}\p{N}_.])@[A-Za-z0-9._]+/gu;
// 이모지 본체 + 피부색 + 이형 선택자 + ZWJ + 국기(지역 표시 문자) + 키캡
const EMOJI_RE =
  /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;

export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) seen.add(m[0].slice(1));
  return [...seen];
}

export function cleanCaption(text: string): string {
  return text
    .replace(HASHTAG_RE, "")
    .replace(MENTION_RE, "$1")
    .replace(EMOJI_RE, "")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
