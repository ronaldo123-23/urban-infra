// 해외 연구 검색: Europe PMC (무료, 키 없음). https://europepmc.org/RestfulWebService
// 한국어 주장의 핵심어를 사전(lexicon.ts)으로 영어로 바꿔 검색하고, 초록(abstract)을 대조에 쓴다.

import { decodeEntities } from "@/lib/extract/html";

export interface Paper {
  title: string;
  url: string;
  journal: string | null;
  year: string | null;
  abstract: string;
}

const ENDPOINT = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const TIMEOUT_MS = 8000;

function clean(s: string): string {
  return decodeEntities(decodeEntities(s.replace(/<[^>]+>/g, " "))).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchPapers(terms: string[], limit = 3): Promise<Paper[]> {
  if (terms.length < 2) return []; // 영어 검색어가 너무 적으면 엉뚱한 논문이 나온다
  const query = terms.map((t) => (t.includes(" ") ? `"${t}"` : t)).join(" ");
  const url = new URL(ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("resultType", "core");
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("sort", "CITED desc"); // 많이 인용된 원 연구가 먼저 오게

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`Europe PMC HTTP ${res.status}`);
  const data = (await res.json()) as {
    resultList?: {
      result?: {
        title?: string;
        doi?: string;
        pmid?: string;
        id?: string;
        source?: string;
        pubYear?: string;
        journalTitle?: string;
        journalInfo?: { journal?: { title?: string } };
        abstractText?: string;
      }[];
    };
  };
  return (data.resultList?.result ?? [])
    .filter((r) => r.title && r.abstractText)
    .map((r) => ({
      title: clean(r.title!),
      url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source ?? "MED"}/${r.pmid ?? r.id}`,
      journal: r.journalTitle ?? r.journalInfo?.journal?.title ?? null,
      year: r.pubYear ?? null,
      abstract: clean(r.abstractText!),
    }));
}
