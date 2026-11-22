// 국가통계포털(KOSIS) 오픈API. https://kosis.kr/openapi/
// 환경변수: KOSIS_API_KEY
// 1) 통합검색으로 관련 통계표를 찾고 2) 상위 통계표의 최신 수치를 일부 가져온다.

export interface KosisTable {
  title: string; // 통계표 이름
  org: string | null; // 작성기관
  url: string; // KOSIS 통계표 화면 링크
  period: string | null; // 수록 기간
  values: string[]; // "항목 · 분류 (시점): 값 단위" 형식의 최신 수치 일부
}

const BASE = "https://kosis.kr/openapi";
const TIMEOUT_MS = 10000;
const MAX_VALUES = 40;

export function kosisConfigured(): boolean {
  return Boolean(process.env.KOSIS_API_KEY?.trim());
}

async function getJson(url: URL): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`KOSIS HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`KOSIS 응답이 JSON이 아님: ${text.slice(0, 120)}`);
  }
}

/** KOSIS는 오류일 때 {err, errMsg} 객체를 200으로 돌려준다 */
function asRows(data: unknown): Record<string, string>[] {
  if (Array.isArray(data)) return data as Record<string, string>[];
  const err = data as { err?: string; errMsg?: string } | null;
  if (err?.err && err.err !== "30") throw new Error(`KOSIS 오류 ${err.err}: ${err.errMsg ?? ""}`);
  return []; // 30 = 결과 없음
}

export async function searchKosis(query: string, limit = 3): Promise<KosisTable[]> {
  const key = process.env.KOSIS_API_KEY?.trim();
  if (!key) throw new Error("KOSIS_API_KEY 미설정");

  const search = new URL(`${BASE}/statisticsSearch.do`);
  search.searchParams.set("method", "getList");
  search.searchParams.set("apiKey", key);
  search.searchParams.set("searchNm", query);
  search.searchParams.set("sort", "RANK");
  search.searchParams.set("startCount", "1");
  search.searchParams.set("resultCount", String(limit));
  search.searchParams.set("format", "json");
  search.searchParams.set("jsonVD", "Y");

  const rows = asRows(await getJson(search)).slice(0, limit);
  const tables: KosisTable[] = [];
  for (const r of rows) {
    const orgId = r.ORG_ID;
    const tblId = r.TBL_ID;
    const url =
      r.TBL_VIEW_URL || r.LINK_URL || `https://kosis.kr/statHtml/statHtml.do?orgId=${orgId}&tblId=${tblId}`;
    const table: KosisTable = {
      title: r.TBL_NM ?? "(이름 없음)",
      org: r.ORG_NM ?? null,
      url,
      period: r.STRT_PRD_DE && r.END_PRD_DE ? `${r.STRT_PRD_DE}~${r.END_PRD_DE}` : null,
      values: [],
    };
    if (orgId && tblId) {
      try {
        table.values = await latestValues(key, orgId, tblId);
      } catch {
        // 수치를 못 가져와도 통계표 링크는 남긴다
      }
    }
    tables.push(table);
  }
  return tables;
}

async function latestValues(key: string, orgId: string, tblId: string): Promise<string[]> {
  const url = new URL(`${BASE}/Param/statisticsParameterData.do`);
  url.searchParams.set("method", "getList");
  url.searchParams.set("apiKey", key);
  url.searchParams.set("orgId", orgId);
  url.searchParams.set("tblId", tblId);
  url.searchParams.set("itmId", "ALL");
  url.searchParams.set("objL1", "ALL");
  url.searchParams.set("newEstPrdCnt", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("jsonVD", "Y");

  const rows = asRows(await getJson(url));
  return rows.slice(0, MAX_VALUES).map((r) => {
    const label = [r.ITM_NM, r.C1_NM, r.C2_NM].filter(Boolean).join(" · ");
    return `${label} (${r.PRD_DE ?? "?"}): ${r.DT ?? "?"}${r.UNIT_NM ? ` ${r.UNIT_NM}` : ""}`;
  });
}
