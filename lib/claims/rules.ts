// AI 없이 규칙으로 주장 고르기 (Claude 키가 없을 때 기본 경로).
// 문장으로 나누고 → 질문·의견·광고는 "판단 대상 아님" → 숫자가 있으면 통계 주장 → 검색 핵심어 뽑기.

import type { ExtractedClaim } from "./extract";

export const MAX_RULE_CLAIMS = 5;

const QUESTION_RE = /[?？]|(인가요|일까요|일까|나요|ㄹ까)\s*[.…]*$/;
// 의견·감상·광고·행동 요청 표현
const OPINION_RE =
  /(대박|최고|미쳤|레전드|강추|추천|좋아요|팔로우|구독|댓글|공유해|저장해|꼭\s*(가|해|사|보)|해\s*보세요|가\s*보세요|드셔\s*보|느낌|생각(해|합니다|이다)|같아요|것\s*같|ㅋㅋ|ㅎㅎ|ㅠㅠ|링크는\s*프로필|프로필\s*링크|할인\s*코드|광고|협찬|DM)/;
// 숫자 + 단위 → 통계·수치 주장
const NUMBER_RE = /\d[\d,.]*\s*(%|퍼센트|명|원|배|만|억|조|건|세|살|년|개|위|kg|km|시간)/;

const PARTICLES = [
  "으로부터", "에서부터", "이라고", "이라는", "에서는", "으로는", "까지", "부터", "에서", "에게", "으로", "이라",
  "처럼", "보다", "라고", "라는", "하고", "이나", "은", "는", "이", "가", "을", "를", "에", "의", "도", "로", "와", "과", "만",
];
// 긴 어미부터 (전해 들은 말투 "~한다고/~한대요" 포함)
const ENDINGS =
  /(한답니다|된답니다|했답니다|한다고요|된다고요|한다고|된다고|했다고|이라고요|이래요|한대요|된대요|했대요|한대|된대|했대|했습니다|합니다|됩니다|입니다|했다|한다|된다|이다|였다|이었다|하는|했던|하며|하고|해서|되어|됐다|다고|된|할|한)$/;
const STOP = new Set([
  "그리고", "하지만", "그러나", "이번", "지금", "정말", "진짜", "너무", "모두", "우리", "여러분", "오늘", "이제", "바로",
  "통해", "대한", "위해", "있는", "없는", "있다", "없다", "것으로", "것이", "등을",
  "합니다", "한다", "했다", "된다", "있습니다", "없습니다", "같습니다", "말했다", "밝혔다", "전했다", "알려졌다",
]);

function stripWord(w: string): string {
  let s = w.replace(/[^\p{L}\p{N}%~.-]/gu, "").replace(/^[.~-]+|[.~-]+$/g, ""); // 소수점·범위(14~34)는 남김
  s = s.replace(ENDINGS, "");
  for (const p of PARTICLES) {
    if (s.length > p.length && s.endsWith(p)) {
      const rest = s.slice(0, -p.length);
      if (p === "만" && /\d$/.test(rest)) break; // "23만"의 만은 숫자 단위
      s = rest;
      break;
    }
  }
  if (s.length > 2 && s.endsWith("들")) s = s.slice(0, -1); // 복수 표시
  return s;
}

/** 검색 핵심어: 조사·어미를 떼고 의미 있는 단어 최대 5개 */
export function keywordsOf(sentence: string, max = 5): string[] {
  const all: string[] = [];
  for (const raw of sentence.split(/\s+/)) {
    const w = stripWord(raw);
    if (w.length < 2 || STOP.has(w) || all.includes(w)) continue;
    all.push(w);
  }
  // 날짜·숫자보다 의미 있는 단어를 먼저 (검색과 관련성 판단에 더 중요함), 숫자는 뒤에 붙인다
  const words = all.filter((w) => !/^\d/.test(w));
  const numbers = all.filter((w) => /^\d/.test(w));
  return [...words.slice(0, max - Math.min(1, numbers.length)), ...numbers].slice(0, max);
}

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((s) => s.replace(/^[\s“"'‘\-•·]+|[\s”"'’]+$/g, "").trim())
    .filter((s) => s.length >= 8);
}

export function extractClaimsByRules(caption: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  const seen = new Set<string>();
  for (const s of splitIntoSentences(caption)) {
    const key = keywordsOf(s).join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (QUESTION_RE.test(s)) {
      claims.push(notTarget(s, "질문이라 사실 여부를 따질 수 없어요."));
    } else if (OPINION_RE.test(s)) {
      claims.push(notTarget(s, "의견·감상이나 광고·행동 요청 문구예요."));
    } else {
      const isStat = NUMBER_RE.test(s);
      const words = keywordsOf(s);
      claims.push({
        text: s,
        checkable: true,
        type: isStat ? "statistic" : "mixed",
        notTargetReason: "",
        keywords: words.join(" "),
        // KOSIS 검색어: 숫자가 없는 앞쪽 핵심어 2개
        statQuery: isStat ? words.filter((w) => !/\d/.test(w)).slice(0, 2).join(" ") || null : null,
      });
    }
    if (claims.filter((c) => c.checkable).length >= MAX_RULE_CLAIMS) break;
  }
  return claims;
}

function notTarget(text: string, reason: string): ExtractedClaim {
  return { text, checkable: false, type: null, notTargetReason: reason, keywords: "", statQuery: null };
}
