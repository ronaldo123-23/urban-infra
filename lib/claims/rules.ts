// AI 없이 규칙으로 주장 고르기 (Claude 키가 없을 때 기본 경로).
// 1) 캡션 전체를 문장으로 나눈다
// 2) 제목 조각·소개 문장·같은 내용 반복은 "검증에서 뺀 문장"으로 따로 둔다
// 3) 질문·의견·광고·조언은 "판단 대상 아님"
// 4) 나머지는 검증할 주장 — 수치·날짜·출처가 있는 문장부터 우선순위를 매긴다
// 검증은 BATCH_SIZE개씩 나눠서 한다 (lib/verify/index.ts).

import type { ExtractedClaim } from "./extract";

export const BATCH_SIZE = 5;

export interface SkippedSentence {
  text: string;
  reason: string;
}

export interface RuleClaims {
  /** 검증할 주장 (우선순위 높은 순) */
  claims: ExtractedClaim[];
  /** 판단 대상 아님 (질문·의견·광고·조언) — 원문 순서 */
  notTargets: ExtractedClaim[];
  /** 검증에서 뺀 문장 (제목 조각·소개 문장·반복) — 원문 순서 */
  skipped: SkippedSentence[];
}

const QUESTION_RE = /[?？]|(인가요|일까요|일까|나요|ㄹ까)\s*[.…]*$/;
// 의견·감상·광고·행동 요청 표현
const OPINION_RE =
  /(대박|최고|미쳤|레전드|강추|추천|좋아요|팔로우|구독|댓글|공유해|저장해|꼭\s*(가|해|사|보)|해\s*보세요|가\s*보세요|드셔\s*보|느낌|생각(해|합니다|이다)|같아요|것\s*같|ㅋㅋ|ㅎㅎ|ㅠㅠ|링크는\s*프로필|프로필\s*링크|할인\s*코드|광고|협찬|DM)/;
// 조언·권유 ("~하는 것이 더 안전합니다", "~하세요")
const ADVICE_RE = /(것이\s*(더\s*)?(좋|안전|바람직|현명|낫)|하시길|하세요|드세요|피하세요|주의하세요|챙기세요|권해\s*드|추천드)/;
// 소개·연결 문장 ("~소식입니다", "~했는데요", "~알아볼게요")
const INTRO_RE =
  /(소식입니다|소식이에요|소식이 있습니다|알아볼게요|알아보겠습니다|살펴볼게요|살펴보겠습니다|정리했습니다|정리해\s*봤|정리해\s*드|궁금하시죠|함께\s*보시죠|해\s*볼까요|했는데요|하는데요|인데요|이라는데요|라는데요)\s*[.!…]*$/;
// 서술어로 끝나는 완결된 문장인지 (아니면 제목 조각으로 본다)
const SENTENCE_END_RE = /(다|요|죠|니다|음|함|됨|임|까|네|군|지)\s*[.!…"”'’)]*$/;

// 우선순위 신호
const NUMBER_RE = /\d[\d,.]*\s*(%|％|퍼센트|%p|포인트|명|원|배|만|억|조|건|세|살|년|월|일|개|위|kg|km|시간|분|초|회|번|달|주)/;
const DATE_RE = /(\d{4}년|\d{1,2}월|\d{1,2}일|\d+\s*시간|내년|올해|작년|지난해|이번\s*달|오는\s*\d)/;
const SOURCE_RE =
  /(연구|논문|조사|통계|발표|보고서|가이드|지침|권고|교수|박사|의사|전문가|책임자|기관|정부|부처|공단|협회|학회|대학|청은|처는|부는|에\s*따르면|밝혔|발표했|보고됐|나타났|확인됐)/;
// 통계 대조(KOSIS)에 맞는 단위
const STAT_RE = /\d[\d,.]*\s*(%|％|퍼센트|명|원|배|만|억|조|건|세|가구|곳)/;

const PARTICLES = [
  "으로부터", "에서부터", "에서도", "이라고", "이라는", "에서는", "으로는", "에게는", "에는", "에도", "까지", "부터", "에서", "에게", "으로", "이라",
  "처럼", "보다", "라고", "라는", "하고", "이나", "은", "는", "이", "가", "을", "를", "에", "의", "도", "로", "와", "과", "만",
];
// 긴 어미부터 (전해 들은 말투 "~한다고/~한대요" 포함)
const ENDINGS =
  /(았는데요|었는데요|했는데요|는데요|한답니다|된답니다|했답니다|한다고요|된다고요|한다고|된다고|했다고|이라고요|이래요|한대요|된대요|했대요|한대|된대|했대|했습니다|합니다|됩니다|입니다|습니다|됐으며|했으며|됐다는|했다는|됐고|했고|되고|했다|한다|된다|이다|였다|이었다|하는|했던|하며|하고|해서|되어|됐다|다고|된|할|한)$/;
const STOP = new Set([
  "그리고", "하지만", "그러나", "그런데", "또한", "특히", "실제로", "이미", "이번", "지금", "정말", "진짜", "너무", "모두",
  "우리", "여러분", "오늘", "이제", "바로", "통해", "대한", "위해", "있는", "없는", "있다", "없다", "것으로", "것이", "등을",
  "합니다", "한다", "했다", "된다", "있습니다", "없습니다", "같습니다", "말했다", "밝혔다", "전했다", "알려졌다",
  "경우", "대상", "그룹", "사례", "결과", "정도", "이상", "이하", "그렇지", "않은", "같은", "어떤", "모든", "가장",
  "실제", "나타났", "이어지", "보고", "진행되며", "추가적인", "통해", "때문", "자체", "하면", "되면", "이면", "있어",
  "관련해", "이른바", "해당", "공개된", "기준", "나타나", "무려", "고작", "공교롭게도", "결국", "고스란히", "도대체", "최근", "관련", "따르", "따르면", "우리나라", "가운데", "전망",
  "늘린", "늘어난", "기록", "경신", "돌파", "발표된", "자료", "공교롭게", "다시", "나타났다", "더욱", "불과", "하지",
]);

// 한 글자지만 핵심인 명사 (조사를 떼고 남으면 핵심어로 쓴다)
const ONE_CHAR_KEEP = new Set(["금", "빚", "돈", "쌀", "집", "땅", "술", "약", "물", "불"]);

// 받침 있는 글자 뒤에만 오는 조사 / 받침 없는 글자 뒤에만 오는 조사 ("책이·책은" vs "회사가·회사는")
const AFTER_BATCHIM = new Set(["이", "은", "을", "과", "으로", "이라", "이나", "이라고", "이라는", "으로는", "으로부터"]);
const AFTER_VOWEL = new Set(["가", "는", "를", "와", "라고", "라는"]);

function particleFits(rest: string, particle: string): boolean {
  const code = rest.charCodeAt(rest.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return true; // 한글이 아니면(숫자·영문) 따지지 않는다
  const batchim = (code - 0xac00) % 28;
  if (AFTER_BATCHIM.has(particle)) return batchim !== 0;
  if (AFTER_VOWEL.has(particle)) return batchim === 0;
  if (particle === "로") return batchim === 0 || batchim === 8; // 받침 없음 또는 ㄹ ("서울로")
  return true;
}

function stripWord(w: string): string {
  let s = w.replace(/[^\p{L}\p{N}%~.-]/gu, "").replace(/^[.~-]+|[.~-]+$/g, ""); // 소수점·범위(14~34)는 남김
  s = s.replace(ENDINGS, "");
  for (const p of PARTICLES) {
    if (s.length > p.length && s.endsWith(p)) {
      const rest = s.slice(0, -p.length);
      if (p === "만" && /\d$/.test(rest)) break; // "23만"의 만은 숫자 단위
      if (!particleFits(rest, p)) continue; // "조원씨앤아이"의 "이"는 조사가 아님
      s = rest;
      break;
    }
  }
  if (s.length > 2 && s.endsWith("들")) s = s.slice(0, -1); // 복수 표시
  return s;
}

/**
 * 검색 핵심어: 조사·어미를 떼고 의미 있는 단어 최대 max개.
 * 긴 단어·영문(약 이름, 기관명)을 우선하고, 숫자는 뒤에 하나 붙인다.
 */
export function keywordsOf(sentence: string, max = 5): string[] {
  const all: string[] = [];
  // "살인·강도살인" 처럼 가운뎃점·쉼표로 이어진 단어도 나눈다 (숫자 속 쉼표 "6,515"는 남김)
  for (const raw of sentence.split(/\s+|[·ㆍ・/()（）[\]「」『』]|,(?!\d{3})/)) {
    const w = stripWord(raw);
    if ((w.length < 2 && !ONE_CHAR_KEEP.has(w)) || STOP.has(w) || all.includes(w)) continue;
    all.push(w);
  }
  const words = all.filter((w) => !/^\d/.test(w));
  const numbers = all.filter((w) => /^\d/.test(w));
  const score = (w: string) => (w.length >= 3 ? 2 : 1) + (/[A-Za-z]/.test(w) ? 2 : 0);
  const ranked = words
    .map((w, i) => ({ w, i, s: score(w) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max - Math.min(1, numbers.length))
    .sort((a, b) => a.i - b.i) // 고른 뒤에는 문장 순서대로
    .map((x) => x.w);
  return [...ranked, ...numbers].slice(0, max);
}

// 따옴표·괄호 짝 (여는 기호 → 닫는 기호)
const PAIRS: Record<string, string> = { "“": "”", "‘": "’", '"': '"', "'": "'", "(": ")", "「": "」", "『": "』", "《": "》", "<": ">" };

const BULLET_RE = /^[•·▶►✔✅📌\-*]|^\d+[.)]\s/u;

/**
 * 줄바꿈 정리: 한 문단(빈 줄 없이 이어진 줄들) 안에 "~습니다." 같은 완결 문장이 있으면
 * 화면 폭에 맞춰 줄을 바꾼 글로 보고, 문장 중간에서 끊긴 줄을 다음 줄과 이어 붙인다
 * ("원천징수율을 기존 3.3%에서 2.2%로 / 낮추기로 했습니다.").
 * 이어 붙이지 않는 경우: 완결 문장이 하나도 없는 문단(카드뉴스 요약 줄), 서술어·문장부호로 끝난 줄("돌았죠,"),
 * 글머리표 줄("• …"), 짧은 소제목 줄("청원 내용은").
 */
function joinWrappedLines(text: string): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const rows = para.split("\n").map((l) => l.trim()).filter(Boolean);
    const wrapped = rows.some((l) => /(다|요|죠)[.!]["”'’)]*$/.test(l));
    let buf = "";
    for (const row of rows) {
      if (buf && wrapped && !BULLET_RE.test(row) && !BULLET_RE.test(buf) && buf.length >= 15 &&
          !/[.!?…。"”'’)]$/.test(buf) && !SENTENCE_END_RE.test(buf.replace(/[,，]$/, ""))) {
        buf = `${buf} ${row}`;
        continue;
      }
      if (buf) lines.push(buf);
      buf = row;
    }
    if (buf) lines.push(buf);
  }
  return lines;
}

/**
 * 문장 나누기. 따옴표·괄호 안의 마침표·물음표·말줄임표에서는 자르지 않는다
 * ("도대체 그 많은 돈이 다 어디로 간 거냐", "결국…" 같은 인용이 조각나지 않게).
 */
export function splitIntoSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of joinWrappedLines(text)) {
    let buf = "";
    let open: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      buf += ch;
      if (open) {
        if (ch === PAIRS[open]) open = null;
        continue;
      }
      // 영어 따옴표(' ")는 단어 안의 아포스트로피와 헷갈리므로 앞이 공백·문장 시작일 때만 여는 기호로 본다
      if (ch in PAIRS && (!/['"]/.test(ch) || i === 0 || /\s/.test(line[i - 1]))) {
        // 닫는 기호가 뒤에 실제로 있을 때만 (짝이 없는 따옴표 때문에 문장 전체가 붙지 않게)
        if (line.indexOf(PAIRS[ch], i + 1) !== -1) open = ch;
        continue;
      }
      const end = /[.!?。]/.test(ch) || (ch === "…" && line[i + 1] !== "…");
      if (end && (i + 1 >= line.length || /\s/.test(line[i + 1]))) {
        out.push(buf);
        buf = "";
      }
    }
    if (buf.trim()) out.push(buf);
  }
  return out.map((s) => s.replace(/^[\s“"'‘\-•·▶►✔✅📌]+|[\s”"'’]+$/gu, "").trim()).filter((s) => s.length >= 6);
}

/** 검증 우선순위 점수: 수치 > 출처 > 날짜, 짧은 일반 문장은 낮게 */
export function priorityOf(s: string): number {
  let p = 0;
  if (NUMBER_RE.test(s)) p += 3;
  if (SOURCE_RE.test(s)) p += 3;
  if (DATE_RE.test(s)) p += 1;
  if (/수\s*있(습니다|어요|다)/.test(s)) p -= 1; // "~할 수 있습니다" 같은 가능성 문장
  return p;
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sb = new Set(b);
  return a.filter((w) => sb.has(w)).length / Math.min(a.length, b.length);
}

export function extractClaimsByRules(caption: string): RuleClaims {
  const candidates: { claim: ExtractedClaim; order: number; priority: number; words: string[] }[] = [];
  const notTargets: ExtractedClaim[] = [];
  const skipped: SkippedSentence[] = [];

  splitIntoSentences(caption).forEach((s, order) => {
    const words = keywordsOf(s);
    if (words.length === 0) return;

    if (QUESTION_RE.test(s)) {
      notTargets.push(notTarget(s, "질문이라 사실 여부를 따질 수 없어요."));
      return;
    }
    if (INTRO_RE.test(s)) {
      skipped.push({ text: s, reason: "소개·연결 문장" });
      return;
    }
    if (OPINION_RE.test(s)) {
      notTargets.push(notTarget(s, "의견·감상이나 광고·행동 요청 문구예요."));
      return;
    }
    // 카드뉴스 요약 줄("가계 주식 손실 약 563조 원 (추정)")은 서술어가 없어도 수치 주장으로 본다
    const statLine = STAT_RE.test(s) && words.length >= 3 && order > 0;
    if ((!SENTENCE_END_RE.test(s) && !statLine) || /[,，]\s*$/.test(s)) {
      skipped.push({ text: s, reason: "제목 조각 (완결된 문장이 아님)" });
      return;
    }
    if (ADVICE_RE.test(s)) {
      notTargets.push(notTarget(s, "조언·권유 문장이라 사실 여부를 따지지 않아요."));
      return;
    }
    const dup = candidates.find((c) => overlapRatio(c.words, words) >= 0.7);
    if (dup) {
      // 제목·요약 줄과 본문 문장이 겹치면 더 자세한(긴) 본문 문장을 남긴다
      if (s.length > dup.claim.text.length * 1.5 && priorityOf(s) >= dup.priority) {
        skipped.push({ text: dup.claim.text, reason: "뒤 문장과 같은 내용 반복" });
        candidates.splice(candidates.indexOf(dup), 1);
      } else {
        skipped.push({ text: s, reason: "앞 문장과 같은 내용 반복" });
        return;
      }
    }

    const isStat = STAT_RE.test(s);
    candidates.push({
      order,
      priority: priorityOf(s),
      words,
      claim: {
        text: s,
        checkable: true,
        type: isStat ? "statistic" : "mixed",
        notTargetReason: "",
        keywords: words.join(" "),
        // KOSIS 검색어: 숫자가 없는 앞쪽 핵심어 2개
        statQuery: isStat ? words.filter((w) => !/\d/.test(w)).slice(0, 2).join(" ") || null : null,
      },
    });
  });

  const claims = candidates.sort((a, b) => b.priority - a.priority || a.order - b.order).map((c) => c.claim);
  return { claims, notTargets, skipped };
}

function notTarget(text: string, reason: string): ExtractedClaim {
  return { text, checkable: false, type: null, notTargetReason: reason, keywords: "", statQuery: null };
}
