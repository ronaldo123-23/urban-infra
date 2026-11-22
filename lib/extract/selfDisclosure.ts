// Only an explicit statement about the information in this very post qualifies.
const declaration = /^(?:(?:정정|공지)\s*[:：]\s*)?(?:(?:이|본)\s*게시(?:글|물)(?:에서\s*(?:전달|안내|소개)(?:한|하는)\s*(?:정보|내용)|(?:에\s*담긴|의)\s*(?:정보|내용))?|(?:이|위)\s*(?:게시글|게시물)의\s*주장)(?:은|는|이|가)\s*(?:모두\s*)?(?:(?:거짓|허위)(?:\s*정보)?|가짜(?:\s*뉴스)?)(?:입니다|이에요|예요|이다|임을\s*밝힙니다)[.!。]?$/u;
const correction = /^(?:(?:정정|공지)\s*[:：]\s*)?(?:이|본)\s*게시(?:글|물)(?:에서\s*(?:전달|안내|소개)(?:한|하는)\s*(?:정보|내용)|(?:에\s*담긴|의)\s*(?:정보|내용))(?:은|는|이|가)\s*사실이\s*(?:아닙니다|아니에요|아니다)[.!。]?$/u;

// These predicates disclose invention, even without a word like "거짓".
// A scoped subject or a first-person admission ties them to this caption.
const selfReference = /(?:(?:이|본)\s*게시(?:글|물)(?:(?:의|에\s*담긴|에서\s*(?:전달|소개|안내)(?:한|하는))\s*(?:내용|정보|이야기|주장))?|(?:이|위)\s*(?:글|내용|이야기)|앞서\s*(?:제가|저희가|우리가)\s*(?:전달한|올린|쓴)\s*(?:내용|정보|이야기))/u.source;
const disclaimerPrefix = /(?:(?:정정|공지)\s*[:：]\s*)?/u.source;
const invented = /(?:모두\s*)?(?:(?:(?:제가|저희가|우리가|직접)\s*)*(?:지어낸|꾸며낸|만들어낸|상상해서\s*만든)\s*(?:이야기|내용|정보)(?:입니다|예요|이에요|이다)|(?:(?:제가|저희가|우리가|직접)\s*)*(?:지어냈|꾸며냈|만들어냈)(?:습니다|어요|다)|(?:실제로\s*)?(?:일어나지|있지)\s*않은\s*(?:일|이야기|내용|사건)(?:입니다|예요|이에요|이다)|실제로\s*(?:일어나지|있지)\s*않(?:았습니다|았어요|았다)|(?:가상의\s*(?:이야기|내용|설정|상황)|허구)(?:입니다|예요|이에요|이다))/u.source;
const contextualDisclosure = new RegExp(`^${disclaimerPrefix}${selfReference}(?:은|는|이|가|을|를)\\s*${invented}[.!。]?$`, "u");

export function findFalseDisclosure(caption: string | null): string | null {
  if (!caption) return null;
  // Keep original punctuation so quoted, hypothetical, and negated wording
  // cannot become a declaration after normalization.
  const visible = caption.replace(/“[^”]*”|‘[^’]*’|"[^"]*"|'[^']*'|「[^」]*」|『[^』]*』/g, " ");
  for (const part of visible.split(/(?<=[.!。])\s+|\r?\n/)) {
    const sentence = part.trim();
    if (declaration.test(sentence) || correction.test(sentence) || contextualDisclosure.test(sentence)) return sentence;
  }
  return null;
}
