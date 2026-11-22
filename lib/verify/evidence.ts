// 주장 하나에 대한 근거 자료 모으기 + 같은 보도자료 받아쓰기 묶기.

import { keywordsOf } from "../claims/rules";
import { kosisConfigured, searchKosis } from "./kosis";
import { naverConfigured, searchNews, type NewsItem } from "./naver";
import type { ClaimType, Source } from "./types";

export interface EvidenceRequest {
  claim: string;
  type: ClaimType | null;
  keywords: string; // 검색 핵심어
  statQuery: string | null; // KOSIS 검색어 (통계 주장일 때)
}

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

// Require the topic and the concrete details to occur together in an article
// passage. Search hits without enough context cannot become verdict evidence.
const FACT_DETAIL = /\d[\d,]*(?:\.\d+)?\s*(?:%포인트|퍼센트포인트|%|퍼센트|시간|개월|년|월|일|만\s*원|원|만\s*명|명|배|세|km|kg)/gi;

function normalizedDetail(value: string): string {
  return value.replace(/[\s,]/g, "").replace(/퍼센트/g, "%").toLowerCase();
}

export function articleMatchesClaim(claim: string, article: Pick<NewsItem, "title" | "snippet">): boolean {
  const terms = keywordsOf(claim, 20).filter((term) => !/^(?:\d|실제|이번|관련|결과|연구$|보도$|사실$)/.test(term));
  if (terms.length < 2) return false;
  const details = [...new Set((claim.match(FACT_DETAIL) ?? []).map(normalizedDetail))];
  const minimum = Math.max(Math.min(3, terms.length), Math.ceil(terms.length * 0.55));
  const title = article.title.match(/[\p{L}\p{N}]+/gu) ?? [];
  const matches = (term: string, words: string[]) => words.some((word) =>
    word.toLowerCase() === term.toLowerCase() ||
    (/[가-힣]$/.test(term) && word.startsWith(term))
  );
  if (!terms.some((term) => matches(term, title))) return false;
  return [article.title, ...article.snippet.split(/(?<=[.!?。])\s+|\n+/)].some((passage) => {
    const words = passage.match(/[\p{L}\p{N}]+/gu) ?? [];
    const overlap = terms.filter((term) => matches(term, words)).length;
    if (overlap < minimum) return false;
    const passageDetails = (passage.match(FACT_DETAIL) ?? []).map(normalizedDetail);
    return details.every((detail) => passageDetails.includes(detail));
  });
}

export interface Evidence {
  sources: Source[];
  /** 뉴스 검색을 실제로 했는지 (키 없음·오류면 false) */
  newsSearched: boolean;
}

/** 출처 번호를 매기며 주장별 근거를 모은다. warnings에 실패 이유를 쌓는다 */
export async function gatherEvidence(
  req: EvidenceRequest,
  nextId: () => string,
  warnings: string[],
): Promise<Evidence> {
  const sources: Source[] = [];
  let newsSearched = false;

  if (naverConfigured()) {
    try {
      // 팩트체크 기사 우선 + 일반 보도 (사실 확인용).
      // 검색어가 길면 네이버 정확도 검색이 엉뚱한 기사를 주므로 핵심어 3~4개만 쓴다.
      const words = req.keywords.split(/\s+/).filter(Boolean);
      const [fc, plain] = await Promise.all([
        searchNews(`팩트체크 ${words.slice(0, 3).join(" ")}`, 10),
        searchNews(words.slice(0, 4).join(" "), 10),
      ]);
      newsSearched = true;
      const fcUrls = new Set(fc.map((x) => x.url));
      const relevant = [...fc, ...plain].filter((item) => articleMatchesClaim(req.claim, item));
      for (const { item, duplicates } of groupNews(relevant).slice(0, 8)) {
        sources.push({ id: nextId(), kind: "news", ...item, duplicates, factcheck: fcUrls.has(item.url) });
      }
    } catch (e) {
      warnings.push(`뉴스 검색 실패: ${(e as Error).message}`);
    }
  }

  if (req.type === "statistic" && req.statQuery && kosisConfigured()) {
    try {
      for (const t of await searchKosis(req.statQuery, 2)) {
        sources.push({
          id: nextId(),
          kind: "kosis",
          title: t.title,
          url: t.url,
          publisher: t.org ? `KOSIS · ${t.org}` : "KOSIS",
          date: t.period,
          snippet: t.values.length ? t.values.join("\n") : "(수치를 가져오지 못함 — 링크에서 직접 확인)",
          duplicates: 1,
          factcheck: false,
        });
      }
    } catch (e) {
      warnings.push(`KOSIS 검색 실패: ${(e as Error).message}`);
    }
  }

  return { sources, newsSearched };
}
