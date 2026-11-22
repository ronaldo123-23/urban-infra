// Only an explicit statement about the information in this very post qualifies.
const declaration = /^(?:(?:정정|공지)\s*[:：]\s*)?(?:(?:이|본)\s*게시(?:글|물)(?:에서\s*(?:전달|안내|소개)(?:한|하는)\s*(?:정보|내용)|(?:에\s*담긴|의)\s*(?:정보|내용))?|(?:이|위)\s*(?:게시글|게시물)의\s*주장)(?:은|는|이|가)\s*(?:모두\s*)?(?:(?:거짓|허위)(?:\s*정보)?|가짜(?:\s*뉴스)?)(?:입니다|이에요|예요|이다|임을\s*밝힙니다)[.!。]?$/u;
const correction = /^(?:(?:정정|공지)\s*[:：]\s*)?(?:이|본)\s*게시(?:글|물)(?:에서\s*(?:전달|안내|소개)(?:한|하는)\s*(?:정보|내용)|(?:에\s*담긴|의)\s*(?:정보|내용))(?:은|는|이|가)\s*사실이\s*(?:아닙니다|아니에요|아니다)[.!。]?$/u;

export function findFalseDisclosure(caption: string | null): string | null {
  if (!caption) return null;
  // Keep original punctuation so quoted, hypothetical, and negated wording
  // cannot become a declaration after normalization.
  const visible = caption.replace(/“[^”]*”|‘[^’]*’|"[^"]*"|'[^']*'|「[^」]*」|『[^』]*』/g, " ");
  for (const part of visible.split(/(?<=[.!。])\s+|\r?\n/)) {
    const sentence = part.trim();
    if (declaration.test(sentence) || correction.test(sentence)) return sentence;
  }
  return null;
}
