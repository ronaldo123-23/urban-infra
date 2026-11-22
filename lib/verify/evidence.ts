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

/** 출처 번호를 매기며 주장별 근거를 모은다. warnings에 실패 이유를 쌓는다 */
export async function gatherEvidence(
  req: EvidenceRequest,
  nextId: () => string,
  warnings: string[],
): Promise<Source[]> {
  const sources: Source[] = [];

  if (naverConfigured()) {
    try {
      // 팩트체크 기사 우선 + 일반 보도 (사실 확인용)
      const [fc, plain] = await Promise.all([
        searchNews(`팩트체크 ${req.keywords}`, 10),
        searchNews(req.keywords, 10),
      ]);
      const fcUrls = new Set(fc.map((x) => x.url));
      for (const { item, duplicates } of groupNews([...fc, ...plain]).slice(0, 8)) {
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

  return sources;
}
