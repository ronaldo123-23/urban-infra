// AI 없이 규칙으로 판정 (Claude 키가 없을 때 기본 경로).
// 순서:
// 1) "근거와 다름" (팩트체크): 팩트체크 기사의 제목·요약에 반박 표현이 있고, 주장 핵심어(숫자·날짜 제외)가 기사 제목에 2개 이상
// 2) "확인됨": 연관성 "직접 근거"인 자료의 원문에서 같은 내용을 말하는 문장을 찾았을 때
//    - 수치가 있는 주장: 주장의 수치가 그 문장에 모두 있어야 함 (상대 변화율과 퍼센트포인트는 구분)
//    - 수치가 없는 주장: 공식 안내·논문·공식 웹문서에서만, 주제어 대부분이 한 문장에 있어야 함
//    - 반박 표현이나 물음표가 있는 문장(소문을 인용한 문장)은 근거로 쓰지 않음
// 3) "근거와 다름" (수치): 공식 안내·논문의 같은 주제 문장에 같은 단위의 다른 수치만 있을 때
// 4) 나머지: "아직 확인 안 됨" (보류 이유는 lib/verify/index.ts가 붙인다)

import { keywordsOf } from "@/lib/claims/rules";
import { bestSentence, comparisonNotes, quoteOf, rankedSentences, type SentenceMatch } from "./compare";
import { hasTopic, numberIn, splitSentencesLoose } from "./relevance";
import type { ClaimSlots } from "./slots";
import type { EvidenceQuote, Source, Verdict } from "./types";

// 팩트체크 기사에서 주장을 반박할 때 쓰는 표현
const DEBUNK_RE =
  /(사실\s*아님|사실이\s*아니|사실과\s*달라|사실과\s*다르|거짓|허위|사실무근|가짜\s*뉴스|가짜뉴스|근거\s*없|근거가\s*없|오해|과장|왜곡|조작|대체로\s*틀림|틀렸|틀린\s*주장|루머|괴담|낭설)/;
// 팩트체크 기사임을 나타내는 표현 (검색어로 찾았더라도 실제 팩트체크 기사인지 한 번 더 본다)
const FACTCHECK_RE = /(팩트\s*체크|팩트체크|사실\s*확인|사실은|따져\s*보니|검증|진위)/;

/**
 * 게시물 주장 자체에 들어 있는 반박 표현 단어("조작기소 특검법"의 "조작기소" 등).
 * 이런 단어는 관련 기사에도 그대로 나오므로 반박으로 세지 않는다 (2026-11-23 특검법 게시물 오판).
 */
function claimDebunkWords(claim: string): string[] {
  const out: string[] = [];
  const compact = claim.replace(/\s+/g, "");
  for (const m of compact.matchAll(new RegExp(DEBUNK_RE.source.replace(/\\s\*/g, ""), "g"))) {
    // 반박 표현 + 바로 뒤 두 글자까지, 띄어쓰기 무시 ("조작기소 특검법"·"조작 기소" → "조작기소", "조작된 통계" → "조작된")
    const word = /^[\p{L}\p{N}]*/u.exec(compact.slice(m.index!, m.index! + m[0].length + 2))![0];
    if (word && !out.includes(word)) out.push(word);
  }
  return out;
}

/** 주장에 이미 있는 반박 표현 단어(띄어쓰기 무시)를 지운 뒤에도 반박 표현이 남는지 */
function debunkIn(text: string, own: string[]): boolean {
  let t = text;
  for (const w of own) t = t.replace(new RegExp([...w].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "g"), " ");
  return DEBUNK_RE.test(t);
}

const MIN_TITLE_MATCHED = 2;
const MIN_OVERLAP = 0.5;

const KIND_LABEL: Record<Source["kind"], string> = {
  news: "기사",
  paper: "논문 초록",
  official: "공식 안내",
  web: "공식 웹문서",
  kosis: "KOSIS 통계",
};

export interface RuleJudgement {
  verdict: Exclude<Verdict, "not_target">;
  evidenceIds: string[];
  reason: string;
  evidence: EvidenceQuote[];
  comparison: string[];
}

// "작년·올해·내년"처럼 오늘 기준으로 뜻이 바뀌는 시점 표현
const RELATIVE_TIME_RE = /(작년|지난해|올해|금년|내년|이번\s*달|지난달|다음\s*달|어제|오늘|이번\s*주|지난주|최근)/;

function currentYearKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 4);
}

/**
 * 상대 시점이 있는 주장은 올해 나온 자료로만 확인·반박한다.
 * (2024년 기사의 "작년"은 2023년이라, 2026년 게시물의 "작년"과 다르다)
 */
function sameTimeFrame(claim: string, s: Source): boolean {
  if (!RELATIVE_TIME_RE.test(claim)) return true;
  return Boolean(s.date && s.date.startsWith(currentYearKst()));
}

function overlap(claimWords: string[], text: string): { ratio: number; matched: number } {
  if (claimWords.length === 0) return { ratio: 0, matched: 0 };
  const matched = claimWords.filter((w) => text.includes(w)).length;
  return { ratio: matched / claimWords.length, matched };
}

function debunkQuote(slots: ClaimSlots, s: Source, text: string | undefined, own: string[]): string {
  if (text) {
    const hit = splitSentencesLoose(text).find(
      (x) => x.length <= 600 && debunkIn(x, own) && slots.topics.filter((t) => hasTopic(x, t)).length >= 2,
    );
    if (hit) return quoteOf(hit);
  }
  return quoteOf(s.snippet || s.title);
}

export function judgeByRules(claim: string, slots: ClaimSlots, sources: Source[], texts: Map<string, string>): RuleJudgement {
  // 1) 팩트체크 기사가 반박
  const words = keywordsOf(claim, 6).filter((w) => !/^\d/.test(w));
  // 팩트체크 반박으로 인정하는 경우:
  // ① 본문을 읽었고(직접 근거), 본문에 주장 핵심어 2개 + 반박 표현이 같은 문장에 있음 (PR #14, partner)
  // ② 본문을 못 읽었어도 기사 "제목"에 팩트체크 표시와 반박 표현이 둘 다 있음 (예: "…팩트체크 해보니 사실과 달라")
  const own = claimDebunkWords(claim);
  const titleDebunk = (s: Source) => FACTCHECK_RE.test(s.title) && debunkIn(s.title, own);
  const debunks = sources
    .filter((s) => s.kind === "news" && ((s.full_text_read && s.relevance.grade === "direct") || titleDebunk(s)))
    .map((s) => {
      const text = `${s.title} ${s.snippet}`;
      // 요약에 반박 표현이 없어도, 본문을 읽었으면 본문에서 주장 핵심어와 반박 표현이 같이 있는 문장을 찾는다
      // (네이버 요약은 검색어에 따라 기사 앞부분만 보여줄 때가 있다)
      const full = s.full_text_read ? texts.get(s.id) ?? "" : "";
      const debunkInBody =
        full !== "" &&
        splitSentencesLoose(full).some(
          (x) => x.length <= 600 && debunkIn(x, own) && slots.topics.filter((t) => hasTopic(x, t)).length >= 2,
        );
      return { s, text, debunk: debunkInBody || titleDebunk(s), isFc: FACTCHECK_RE.test(text) || FACTCHECK_RE.test(full.slice(0, 3000)), title: overlap(words, s.title).matched, ...overlap(words, text) };
    })
    .filter((x) => x.isFc && x.debunk && x.title >= MIN_TITLE_MATCHED && x.ratio >= MIN_OVERLAP)
    .sort((a, b) => b.title - a.title || b.ratio - a.ratio);
  if (debunks.length > 0) {
    const top = debunks.slice(0, 2);
    return {
      verdict: "false",
      evidenceIds: top.map((x) => x.s.id),
      reason: `팩트체크 기사(「${top[0].s.title}」)가 비슷한 주장을 사실이 아니라고 했어요. 자동 판정이라 틀릴 수 있으니 기사를 꼭 열어 확인하세요.`,
      evidence: top.map((x) => ({ source_id: x.s.id, quote: debunkQuote(slots, x.s, texts.get(x.s.id), own), matched: x.s.relevance.matched })),
      comparison: [],
    };
  }

  // 2) 원문에서 같은 내용 확인
  const roles = roleNotes(claim, sources, texts);
  // 직접 근거 자료 + (수치 주장일 때) 관련 자료도 본다. 관련 자료는 한 문장에 수치 전부 + 주제어 2개 이상이 같이 있어야 확인으로 인정
  const direct = sources.filter(
    (s) =>
      (s.relevance.grade === "direct" || (slots.numbers.length > 0 && s.relevance.grade === "related")) &&
      s.full_text_read && texts.has(s.id) &&
      !s.factcheck &&
      sameTimeFrame(claim, s),
  );
  const trusted = (s: Source) => s.kind === "official" || s.kind === "paper" || s.kind === "web";
  const quoted = attributedQuote(claim);
  // 수치 없는 주장을 기사로 확인할 때: 서로 다른 기사 2곳 이상에서 같은 내용 문장을 찾아야 한다 (PR D, 2026-11-23)
  const newsAgree: { s: Source; m: SentenceMatch }[] = [];
  const relativeIncrease = slots.numbers.some((n) => n.unit === "%") &&
    /(?:%|퍼센트)\s*(?:더\s*(?:높|낮|많|적)|증가|감소|상승|하락)/.test(claim);
  for (const s of direct) {
    // 대상(참가자·청년 등)은 근거 문장이 아니라 그 자료 안에 있으면 된다 (논문 초록은 대상을 다른 문장에서 밝힘)
    const wholeText = texts.get(s.id)!;
    if (slots.subjects.length > 0 && !slots.subjects.every((subject) => hasTopic(wholeText, subject))) continue;
    let newsHit: SentenceMatch | null = null;
    // 가장 잘 맞는 문장이 근거로 못 쓰는 문장이면 다음 문장을 본다 (위쪽 몇 개만)
    for (const m of rankedSentences(slots, wholeText).slice(0, 8)) {
    if (debunkIn(m.sentence, own) || /[?？]/.test(m.sentence)) continue;
    if (/\s>\s/.test(m.sentence)) continue; // 웹페이지 메뉴 경로 ("보도자료 > 통일부소식")
    const titleLine = isTitleLine(m.sentence, s.title);
    if (m.joined && titleLine) continue; // 제목 + 첫 문장을 이어 붙인 것은 근거로 쓰지 않는다
    // 발언 인용 주장("…"이라고 설명했다)은 따옴표 안 내용이 원문 문장에 거의 다 있어야 한다. 제목 한 줄로는 안 됨
    if (quoted && (titleLine || !quoteCovered(quoted, m.sentence))) continue;
    if (opposite(claim, m.sentence)) continue;
    // 게시물은 "18% 더 높다"(상대 변화율처럼 읽힘)인데 원문은 "52% 대 34%, 18% 차이"(%포인트)인 경우:
    // 수치 자체는 원문과 같으므로 "근거와 다름"이 아니라 "확인됨 + 표현 주의"로 안내한다 (2026-11-23 geonhee 결정)
    const wordingCaution = Boolean(m.derived && relativeIncrease);
    const allNumbers = slots.numbers.length > 0 && m.numberHits.length === slots.numbers.length;
    const enoughTopics = m.topicHits.length >= Math.max(3, Math.ceil(slots.topics.length * 0.6));
    if (s.relevance.grade === "related" && !(allNumbers && m.topicHits.length >= 3)) continue;
    if (slots.times.some((time) => /^\d/.test(time) && !timeInSentence(time, m.sentence, s.date))) continue;
    const conditions = (claim.match(/본인\s*인증|방문\s*포장|회원\s*가입|포장\s*주문|배달\s*주문|비회원|만\s*\d+\s*세/g) ?? []);
    const normalizedSentence = m.sentence.replace(/\s+/g, "");
    if (conditions.some((condition) => !normalizedSentence.includes(condition.replace(/\s+/g, "")))) continue;
    if (allNumbers || (slots.numbers.length === 0 && trusted(s) && enoughTopics && !titleLine)) {
      return {
        verdict: "confirmed",
        evidenceIds: [s.id],
        reason: wordingCaution
          ? `${KIND_LABEL[s.kind]}에서 같은 수치를 찾았어요. 다만 원문은 %포인트 차이라서, 게시물의 "○% 더 높다" 표현은 오해를 줄 수 있어요. 아래 비교를 확인해 보세요.`
          : `${KIND_LABEL[s.kind]}에서 같은 내용을 찾았어요. 자동 대조라 틀릴 수 있으니 근거 문장과 링크를 확인해 보세요.`,
        evidence: [{ source_id: s.id, quote: quoteOf(m.sentence), matched: [...m.topicHits, ...m.numberHits] }],
        comparison: [...comparisonNotes(claim, slots, m), ...roles],
      };
    }
    // 수치 없는 주장 + 기사: 주제어 대부분(70% 이상, 최소 3개)이 제목이 아닌 본문 한 문장에 있어야 후보로 센다
    const mostTopics = m.topicHits.length >= Math.max(3, Math.ceil(slots.topics.length * 0.7));
    if (!newsHit && !m.joined && slots.numbers.length === 0 && s.kind === "news" && s.relevance.grade === "direct" && !titleLine && mostTopics) {
      newsHit = m;
    }
    }
    if (newsHit && !newsAgree.some((x) => x.s.publisher && x.s.publisher === s.publisher)) newsAgree.push({ s, m: newsHit });
  }
  if (newsAgree.length >= 2) {
    const top = newsAgree.slice(0, 2);
    return {
      verdict: "confirmed",
      evidenceIds: top.map((x) => x.s.id),
      reason: "서로 다른 기사 2곳에서 같은 내용을 찾았어요. 수치가 없는 주장이라 기사 문장끼리만 대조했으니, 근거 문장과 링크를 꼭 확인해 보세요.",
      evidence: top.map((x) => ({ source_id: x.s.id, quote: quoteOf(x.m.sentence), matched: x.m.topicHits })),
      comparison: roles,
    };
  }

  // 3) 공식 안내·논문의 수치가 다름
  if (slots.numbers.length > 0) {
    for (const s of direct.filter((x) => trusted(x) && x.relevance.grade === "direct")) {
      const text = texts.get(s.id)!;
      if (slots.numbers.some((n) => numberIn(text, n).hit)) continue; // 다른 문장에 같은 수치가 있으면 보류
      const m = bestSentence(slots, text);
      if (!m || m.topicHits.length < 3 || m.numberHits.length > 0 || m.otherNumbers.length === 0) continue;
      return {
        verdict: "false",
        evidenceIds: [s.id],
        reason: `${KIND_LABEL[s.kind]}의 수치가 게시물과 달라요. 자동 대조라 틀릴 수 있으니 근거 문장을 확인해 보세요.`,
        evidence: [{ source_id: s.id, quote: quoteOf(m.sentence), matched: m.topicHits }],
        comparison: [`게시물: ${slots.numbers.map((n) => n.raw).join(", ")} / 원문: ${m.otherNumbers.join(", ")}`],
      };
    }
  }

  // 4) 보류
  const hasFactcheck = sources.some((s) => s.factcheck && FACTCHECK_RE.test(`${s.title} ${s.snippet}`));
  const timeHint =
    RELATIVE_TIME_RE.test(claim) && sources.some((s) => s.relevance.grade === "direct" && !sameTimeFrame(claim, s))
      ? `"${RELATIVE_TIME_RE.exec(claim)![1]}" 같은 시점 표현이 있어서 올해 나온 자료로만 확인해요. 비슷한 내용의 예전 기사는 있어요.`
      : "";
  return {
    verdict: "unverified",
    evidenceIds: [],
    reason: [hasFactcheck ? "관련 팩트체크 기사가 있어요. 아래 자료에서 직접 읽어 보세요." : "", timeHint].filter(Boolean).join(" "),
    evidence: [],
    comparison: roles,
  };
}

// 반대 말 짝: 주장에 한쪽이 있고 원문 문장에 다른 쪽만 있으면 같은 내용이 아니다
const OPPOSITES: [RegExp, RegExp][] = [
  [/최저|최소|가장 낮/, /최고|최대|가장 높/],
  [/증가|늘었|늘어|상승|올랐|인상/, /감소|줄었|줄어|하락|내렸|인하/],
  [/흑자/, /적자/],
  [/무죄/, /유죄|징역|벌금형|집행유예/],
  [/가결|통과/, /부결|폐기/],
  [/합헌/, /위헌/],
];

/**
 * 날짜 확인: 원문 문장에 "9월7일"이 그대로 있거나, 그날 나온 기사가 "7일"이라고만 쓴 경우도 같은 날로 본다.
 */
function timeInSentence(time: string, sentence: string, date: string | null): boolean {
  const compact = sentence.replace(/\s+/g, "");
  if (compact.includes(time)) return true;
  const md = /^(\d{1,2})월(\d{1,2})일$/.exec(time);
  if (!md || !date) return false;
  const [, , mm, dd] = /^(\d{4})-(\d{2})-(\d{2})/.exec(date) ?? [];
  if (Number(mm) !== Number(md[1])) return false;
  // 그날 나온 기사(날짜를 안 쓰거나 "7일"이라고만 씀), 또는 하루 뒤 기사가 "7일"이라고 쓴 경우
  const dayDiff = Number(dd) - Number(md[2]);
  if (dayDiff === 0) return true;
  return dayDiff === 1 && new RegExp(`(^|[^\\d])${md[2]}일`).test(compact);
}

function opposite(claim: string, sentence: string): boolean {
  return OPPOSITES.some(
    ([a, b]) => (a.test(claim) && !a.test(sentence) && b.test(sentence)) || (b.test(claim) && !b.test(sentence) && a.test(sentence)),
  );
}

/** 발언 인용 주장: 통일부는 "…"이라고 설명했다 → 따옴표 안 내용 */
function attributedQuote(claim: string): string | null {
  const m = /[“"‘']([^”"’']{6,})[”"’']\s*(?:이?라고|며|고)?\s*(?:설명|밝|말|주장|강조|전했|덧붙|지적|해명|반박|일축)/.exec(claim);
  return m ? m[1] : null;
}

/** 따옴표 안 핵심어가 원문 문장에 모두 있어야 한다 (7개 이상이면 하나까지 빠져도 됨) */
function quoteCovered(quote: string, sentence: string): boolean {
  const words = keywordsOf(quote, 8).filter((w) => !/^\d/.test(w));
  if (words.length === 0) return false;
  const covered = words.filter((w) => hasTopic(sentence, w)).length;
  return covered === words.length || (words.length >= 7 && covered >= words.length - 1);
}

function normalizeLine(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, "");
}

/** 원문 문장이 사실상 그 자료의 제목인지 */
function isTitleLine(sentence: string, title: string): boolean {
  const a = normalizeLine(sentence);
  const b = normalizeLine(title);
  if (a.length < 8 || b.length < 8) return false;
  return a.includes(b.slice(0, Math.min(b.length, 30))) || b.includes(a.slice(0, Math.min(a.length, 30)));
}

const ROLE_RE = /(CEO|최고경영자|대표이사|대표|회장|사장|장관|총리|의장|위원장|감독|총재|청장)/g;
const ROLE_ALIASES: Record<string, string> = { CEO: "(?:CEO|최고경영자)", 최고경영자: "(?:CEO|최고경영자)" };

/**
 * 직책이 바뀐 경우 안내: 게시물은 "엔비디아 CEO 젠슨 황"인데 최신 기사가 "전 CEO"라고 하면 알려 준다.
 * (판정을 바꾸지는 않고 비교 설명만 붙인다)
 */
function roleNotes(claim: string, sources: Source[], texts: Map<string, string>): string[] {
  const notes: string[] = [];
  for (const m of claim.matchAll(ROLE_RE)) {
    const role = m[1];
    const before = claim.slice(Math.max(0, m.index! - 3), m.index!);
    if (/전\s*$/.test(before)) continue; // 게시물도 이미 "전 CEO"
    // "전 CEO", "전 엔비디아 CEO", "전 엔비디아 최고경영자(CEO)"
    const re = new RegExp(`(^|[^가-힣])전\\s+(?:[가-힣A-Za-z]{1,12}\\s+){0,2}\\(?${ROLE_ALIASES[role] ?? role}`);
    const hit = sources.find((s) => re.test(`${s.title} ${s.snippet} ${(texts.get(s.id) ?? "").slice(0, 2000)}`));
    if (hit && !notes.some((n) => n.includes(role))) {
      notes.push(`최신 자료(「${hit.title.slice(0, 40)}」 등)에서는 "전 ${role}"로 나와요. 게시물이 쓰인 뒤 직책이 바뀌었을 수 있어요.`);
    }
  }
  return notes;
}
