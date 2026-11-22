// 주장 하나에 대한 근거 자료 모으기 (docs/IMPROVEMENT_PLAN.md 3절 PR B, 3-1절).
// 1) 후보 찾기: 네이버 뉴스(팩트체크 + 일반), 공식 안내 페이지(목록), 믿을 만한 웹문서, 해외 논문(Europe PMC), KOSIS
// 2) 연관성 점수로 거르기: 무관은 버리고, 직접 근거/관련 자료만 남긴다
// 3) 원문 읽기: 점수가 높은 기사·공식 페이지 본문을 가져와 다시 점수를 매긴다 (논문은 초록)
// 같은 보도자료를 받아쓴 기사는 하나로 묶어 1개 출처로 센다.

import { kosisConfigured, searchKosis } from "./kosis";
import { fetchPageText } from "./fetchPage";
import { OFFICIAL_SOURCES, TRUSTED_DOMAIN_RE, englishTerms } from "./lexicon";
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
}

export interface Evidence {
  sources: Source[];
  /** 대조에 쓸 원문 (출처 번호 → 본문·초록). 화면에는 보내지 않는다 */
  texts: Map<string, string>;
  /** 뉴스 검색을 실제로 했는지 (키 없음·오류면 false) */
  newsSearched: boolean;
}

const MAX_SOURCES = 8;
const FULLTEXT_PER_CLAIM = 2; // 뉴스·웹문서 중 본문까지 읽을 개수 (시간 제한 때문에)
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

async function newsCandidates(words: string[]): Promise<Candidate[]> {
  const [fc, plain] = await Promise.all([
    searchNews(`팩트체크 ${words.slice(0, 3).join(" ")}`, 10),
    searchNews(words.slice(0, 4).join(" "), 10),
  ]);
  const fcUrls = new Set(fc.map((x) => x.url));
  return groupNews([...fc, ...plain]).map(({ item, duplicates }) => ({
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
  const texts = new Map<string, string>();
  let newsSearched = false;
  const candidates: Candidate[] = [...officialCandidates(req.claim)];

  const jobs: Promise<void>[] = [];
  if (naverConfigured()) {
    jobs.push(
      newsCandidates(words)
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
    if (r.grade === "irrelevant" || sources.length >= MAX_SOURCES) continue;
    const id = nextId();
    if (c.text) texts.set(id, c.text);
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
      relevance: { score: r.score, grade: r.grade, matched: r.matched },
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
