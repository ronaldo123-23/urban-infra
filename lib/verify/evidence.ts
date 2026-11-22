// 주장 하나에 대한 근거 자료 모으기 + 같은 보도자료 받아쓰기 묶기.

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
      // 관련 없는 기사 걸러내기: 숫자·날짜가 아닌 핵심어가 2개 이상(그런 핵심어가 1개면 1개) 나오는 기사만 남긴다
      // (의미 있는 핵심어가 1개뿐이면 그 단어가 제목에 있어야 한다)
      const contentWords = words.filter((w) => !/^\d/.test(w));
      const relevant = [...fc, ...plain].filter((it) => {
        if (contentWords.length === 0) return false;
        if (contentWords.length === 1) return it.title.includes(contentWords[0]);
        // 제목에 1개 이상 + 제목·요약에 2개 이상
        return (
          contentWords.some((w) => it.title.includes(w)) &&
          contentWords.filter((w) => `${it.title} ${it.snippet}`.includes(w)).length >= 2
        );
      });
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
