// 주장 하나에 대한 근거 자료 모으기 (docs/IMPROVEMENT_PLAN.md 3절 PR B, 3-1절).
// 1) 후보 찾기: 네이버 뉴스(팩트체크 + 일반), 공식 안내 페이지(목록), 믿을 만한 웹문서, 해외 논문(Europe PMC), KOSIS
// 2) 연관성 점수로 거르기: 무관은 버리고, 직접 근거/관련 자료만 남긴다
// 3) 원문 읽기: 점수가 높은 기사·공식 페이지 본문을 가져와 다시 점수를 매긴다 (논문은 초록)
// 같은 보도자료를 받아쓴 기사는 하나로 묶어 1개 출처로 센다.

import { kosisConfigured, searchKosis } from "./kosis";
import { fetchPageText } from "./fetchPage";
import { OFFICIAL_EVENT_PAGES, OFFICIAL_SOURCES, TRUSTED_DOMAIN_RE, englishTerms } from "./lexicon";
import { naverConfigured, searchNews, searchWeb, type NewsItem } from "./naver";
import { scoreRelevance } from "./relevance";
import { searchPapers } from "./scholar";
import type { ClaimSlots } from "./slots";
import type { ClaimType, Source } from "./types";

export interface EvidenceRequest {
  claim: string;
  type: ClaimType | null;
  keywords: string; // 검색 핵심어
  statQuery: string | null; // KOSIS 검색어 (통계 주장일 때)
  slots: ClaimSlots;
  event?: string;
}

export interface Evidence {
  sources: Source[];
  /** 대조에 쓸 원문 (출처 번호 → 본문·초록). 화면에는 보내지 않는다 */
  texts: Map<string, string>;
  /** 뉴스 검색을 실제로 했는지 (키 없음·오류면 false) */
  newsSearched: boolean;
}

const MAX_SOURCES = 8;
const FULLTEXT_PER_CLAIM = 3; // 뉴스·웹문서 중 본문까지 읽을 개수 (시간 제한 때문에)
const RESEARCH_RE = /연구|논문|임상|실험|학술|저널/;

function normalizeTitle(t: string): string[] {
  return t
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function similar(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const sa = new Set(a);
  const inter = b.filter((w) => sa.has(w)).length;
  return inter / Math.min(sa.size, new Set(b).size) >= 0.6;
}

/** 제목이 거의 같은 기사(같은 보도자료 받아쓰기)를 하나로 묶는다 */
export function groupNews(items: NewsItem[]): { item: NewsItem; duplicates: number }[] {
  const groups: { item: NewsItem; words: string[]; duplicates: number }[] = [];
  const seenUrl = new Set<string>();
  for (const it of items) {
    if (seenUrl.has(it.url)) continue;
    seenUrl.add(it.url);
    const words = normalizeTitle(it.title);
    const g = groups.find((x) => similar(x.words, words));
    if (g) g.duplicates += 1;
    else groups.push({ item: it, words, duplicates: 1 });
  }
  return groups.map(({ item, duplicates }) => ({ item, duplicates }));
}

interface Candidate {
  kind: Source["kind"];
  title: string;
  url: string;
  publisher: string | null;
  date: string | null;
  snippet: string;
  duplicates: number;
  factcheck: boolean;
  /** 이미 가진 원문 (논문 초록 등) */
  text?: string;
  official?: boolean;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// 큰 숫자일수록 기사 제목에 그대로 나올 가능성이 높아 검색어로 쓸 가치가 크다 (날짜·기간보다 먼저)
const SEARCH_UNIT_ORDER = ["조", "억", "만", "천", "%", "%p", "명", "원", "배", "세"];

/**
 * 뉴스 검색어 3가지 (docs/IMPROVEMENT_PLAN.md PR C):
 * ① 숫자 + 핵심어 2개 ("6515조 국가 부채") — 기사 제목에 숫자가 그대로 나오는 경우가 많다
 * ② 핵심어 3개 (숫자 없이)
 * ③ "팩트체크" + 핵심어 2개
 */
export function newsQueries(words: string[], slots: ClaimSlots): { query: string; factcheck: boolean }[] {
  const core = words.filter((w) => !/^\d/.test(w));
  const num = [...slots.numbers]
    .filter((n) => SEARCH_UNIT_ORDER.includes(n.unit) && n.value !== 0)
    .sort((a, b) => SEARCH_UNIT_ORDER.indexOf(a.unit) - SEARCH_UNIT_ORDER.indexOf(b.unit))[0];
  const qs: { query: string; factcheck: boolean }[] = [];
  if (num && core.length > 0) qs.push({ query: [num.raw, ...core.slice(0, 2)].join(" "), factcheck: false });
  if (core.length > 0) qs.push({ query: core.slice(0, 3).join(" "), factcheck: false });
  if (core.length > 0) qs.push({ query: `팩트체크 ${core.slice(0, 2).join(" ")}`, factcheck: true });
  const seen = new Set<string>();
  return qs.filter((q) => (seen.has(q.query) ? false : (seen.add(q.query), true)));
}

async function newsCandidates(words: string[], slots: ClaimSlots): Promise<Candidate[]> {
  const queries = newsQueries(words, slots);
  const results = await Promise.all(queries.map((q) => searchNews(q.query, 10)));
  const fcUrls = new Set(results.flatMap((r, i) => (queries[i].factcheck ? r.map((x) => x.url) : [])));
  // 받아쓰기 묶음의 대표 기사는 팩트체크 기사가 되도록 팩트체크 검색 결과를 먼저 넣는다
  const ordered = [...results.filter((_, i) => queries[i].factcheck), ...results.filter((_, i) => !queries[i].factcheck)];
  return groupNews(ordered.flat()).map(({ item, duplicates }) => ({
    kind: "news",
    ...item,
    duplicates,
    factcheck: fcUrls.has(item.url),
  }));
}

async function webCandidates(words: string[]): Promise<Candidate[]> {
  const items = await searchWeb(words.slice(0, 4).join(" "), 10);
  return items
    .filter((it) => TRUSTED_DOMAIN_RE.test(new URL(it.url).hostname))
    .map((it) => ({ kind: "web", title: it.title, url: it.url, publisher: hostOf(it.url), date: null, snippet: it.snippet, duplicates: 1, factcheck: false }));
}

// 행사 이름: 따옴표로 감싼 이름, 또는 따옴표 없이 "숫자+이름+어택/데이/위크/페스타/세일" (예: 1434 피자어택, 1111 빼빼로데이)
const eventName =
  /(?:[“‘"'「]([^”’"'」\n]{3,50})[”’"'」]|(\d{2,4}\s*[가-힣A-Za-z]{1,8}\s*(?:어택|데이|위크|페스타|페스티벌|세일)))\s*(?:프로모션|행사|이벤트|을\s*통해|을\s*진행|를\s*통해|를\s*진행)/u;
const eventDetail = /(?:이번\s*행사|행사\s*기간|할인\s*(?:기간|혜택|적용|조건)|방문\s*포장|할인(?:된|됩니다)|프로모션|이벤트)/;

export function eventOf(claim: string, caption: string): string | undefined {
  const own = eventName.exec(claim);
  if (own) return own[1] ?? own[2];
  if (!eventDetail.test(claim)) return undefined;
  const names = new Set(caption.split(/\n|(?<=[.!?])\s+/).flatMap((line) => {
    const match = eventName.exec(line);
    return match ? [match[1] ?? match[2]] : [];
  }));
  return names.size === 1 ? [...names][0] : undefined;
}

function containsEvent(text: string, event: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return normalize(text).includes(normalize(event));
}

function officialCandidates(claim: string): Candidate[] {
  const lower = claim.toLowerCase();
  return OFFICIAL_SOURCES.filter((o) => o.names.some((n) => lower.includes(n))).flatMap((o) =>
    o.pages.map((url) => ({
      kind: "official" as const,
      title: o.label,
      url,
      publisher: hostOf(url),
      date: null,
      snippet: "",
      duplicates: 1,
      factcheck: false,
      official: true,
    })),
  );
}

async function paperCandidates(slots: ClaimSlots): Promise<Candidate[]> {
  const terms = englishTerms(slots.topics.filter((t) => !["연구", "복용", "위험", "참가자"].includes(t))).slice(0, 4);
  const papers = await searchPapers(terms, 3);
  return papers.map((p) => ({
    kind: "paper",
    title: p.title,
    url: p.url,
    publisher: [p.journal, "Europe PMC"].filter(Boolean).join(" · "),
    date: p.year,
    snippet: p.abstract.slice(0, 200),
    duplicates: 1,
    factcheck: false,
    text: p.abstract,
  }));
}

/** 출처 번호를 매기며 주장별 근거를 모은다. warnings에 실패 이유를 쌓는다 */
export async function gatherEvidence(
  req: EvidenceRequest,
  nextId: () => string,
  warnings: string[],
): Promise<Evidence> {
  const words = req.keywords.split(/\s+/).filter(Boolean);
  if (req.event) words.unshift(req.event);
  const texts = new Map<string, string>();
  let newsSearched = false;
  const candidates: Candidate[] = [...officialCandidates(req.claim)];

  // 행사 이름이 공식 안내 목록(lexicon.ts의 OFFICIAL_EVENT_PAGES)에 있으면 그 공식 페이지를 직접 읽는다
  if (req.event) {
    for (const e of OFFICIAL_EVENT_PAGES.filter((x) => containsEvent(req.event!, x.event))) {
      candidates.push({
        kind: "official", title: e.label, url: e.url,
        publisher: new URL(e.url).hostname.replace(/^www\./, ""), date: null, snippet: "", duplicates: 1, factcheck: false, official: true,
      });
    }
  }
  const jobs: Promise<void>[] = [];
  if (naverConfigured()) {
    jobs.push(
      newsCandidates(words, req.slots)
        .then((c) => {
          newsSearched = true;
          candidates.push(...c);
        })
        .catch((e) => void warnings.push(`뉴스 검색 실패: ${(e as Error).message}`)),
    );
    if (req.slots.sources.length > 0) {
      jobs.push(
        webCandidates(words)
          .then((c) => void candidates.push(...c))
          .catch((e) => void warnings.push(`웹문서 검색 실패: ${(e as Error).message}`)),
      );
    }
  }
  if (RESEARCH_RE.test(req.claim)) {
    jobs.push(
      paperCandidates(req.slots)
        .then((c) => void candidates.push(...c))
        .catch((e) => void warnings.push(`논문 검색 실패: ${(e as Error).message}`)),
    );
  }
  await Promise.all(jobs);

  // 1차 점수: 제목 + 요약(또는 초록)
  const scored = candidates
    .filter((c) => !req.event || c.official || containsEvent(`${c.title} ${c.snippet}`, req.event))
    .map((c) => ({ c, r: scoreRelevance(req.claim, req.slots, { title: c.title, text: c.text ?? c.snippet, official: c.official }) }))
    .filter((x) => x.c.official || x.r.grade !== "irrelevant")
    .sort((a, b) => Number(b.c.official ?? false) - Number(a.c.official ?? false) || b.r.score - a.r.score);

  // 원문 읽기: 공식 페이지는 항상, 뉴스·웹문서는 점수 높은 것부터 몇 개만
  let fetchBudget = FULLTEXT_PER_CLAIM;
  await Promise.all(
    scored.map(async (x) => {
      if (x.c.text) return; // 논문은 초록이 이미 있음
      if (!x.c.official) {
        if (fetchBudget <= 0) return;
        fetchBudget -= 1;
      }
      const page = await fetchPageText(x.c.url);
      if (!page) return;
      x.c.text = page.text;
      if (x.c.official && page.title) x.c.title = `${x.c.title} — ${page.title}`;
      x.r = scoreRelevance(req.claim, req.slots, { title: x.c.title, text: page.text, official: x.c.official });
    }),
  );

  const sources: Source[] = [];
  for (const { c, r } of scored.sort((a, b) => b.r.score - a.r.score)) {
    if (sources.length >= MAX_SOURCES) break;
    if (req.event && !containsEvent(c.text ?? `${c.title} ${c.snippet}`, req.event)) continue;
    const verifiedEventPage = Boolean(c.official && c.text && req.event && containsEvent(c.text, req.event));
    if (r.grade === "irrelevant" && !verifiedEventPage) continue;
    const relevance = r.grade === "irrelevant"
      ? { score: 40, grade: "related" as const, matched: [req.event!] }
      : { score: r.score, grade: r.grade, matched: r.matched };
    const id = nextId();
    // 본문을 못 읽은 기사는 추천 자료로만 남긴다.
    if (c.text) texts.set(id, c.text);
    else if (c.snippet) texts.set(id, `${c.title}.\n${c.snippet}`);
    sources.push({
      id,
      kind: c.kind,
      title: c.title,
      url: c.url,
      publisher: c.publisher,
      date: c.date,
      snippet: c.snippet,
      duplicates: c.duplicates,
      factcheck: c.factcheck,
      relevance,
      full_text_read: Boolean(c.text),
    });
  }

  if (req.type === "statistic" && req.statQuery && kosisConfigured()) {
    try {
      for (const t of await searchKosis(req.statQuery, 2)) {
        const id = nextId();
        const snippet = t.values.length ? t.values.join("\n") : "(수치를 가져오지 못함 — 링크에서 직접 확인)";
        texts.set(id, snippet);
        sources.push({
          id,
          kind: "kosis",
          title: t.title,
          url: t.url,
          publisher: t.org ? `KOSIS · ${t.org}` : "KOSIS",
          date: t.period,
          snippet,
          duplicates: 1,
          factcheck: false,
          relevance: { score: 50, grade: "related", matched: [] },
          full_text_read: t.values.length > 0,
        });
      }
    } catch (e) {
      warnings.push(`KOSIS 검색 실패: ${(e as Error).message}`);
    }
  }

  return { sources, texts, newsSearched };
}
