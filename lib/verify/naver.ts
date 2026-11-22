// 네이버 검색 API (뉴스). 두 가지 방식을 지원한다 (둘 다 있으면 API HUB를 쓴다).
// 1) NAVER API HUB (네이버 클라우드, 2026년 이관된 새 방식): NAVER_HUB_KEY_ID, NAVER_HUB_KEY
//    https://api.ncloud-docs.com/docs/naver-api-hub-search-news
// 2) 네이버 개발자센터 (기존 방식): NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
//    https://developers.naver.com/docs/serviceapi/search/news/news.md

import { decodeEntities } from "@/lib/extract/html";

export interface NewsItem {
  title: string;
  url: string;
  publisher: string | null;
  date: string | null; // YYYY-MM-DD
  snippet: string;
}

const TIMEOUT_MS = 8000;

interface NaverEndpoint {
  url: string;
  headers: Record<string, string>;
}

/** kind: news=뉴스 검색, webkr=웹문서 검색 */
function endpoint(kind: "news" | "webkr" = "news"): NaverEndpoint | null {
  const hubId = process.env.NAVER_HUB_KEY_ID?.trim();
  const hubKey = process.env.NAVER_HUB_KEY?.trim();
  if (hubId && hubKey) {
    return {
      url: `https://naverapihub.apigw.ntruss.com/search/v1/${kind}`,
      headers: { "X-NCP-APIGW-API-KEY-ID": hubId, "X-NCP-APIGW-API-KEY": hubKey },
    };
  }
  const id = process.env.NAVER_CLIENT_ID?.trim();
  const secret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (id && secret) {
    return {
      url: `https://openapi.naver.com/v1/search/${kind}.json`,
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    };
  }
  return null;
}

export interface WebItem {
  title: string;
  url: string;
  snippet: string;
}

/** 네이버 웹문서 검색 — 공식 기관·학술 페이지 후보 찾기용 (호출하는 쪽에서 믿을 만한 도메인만 남긴다) */
export async function searchWeb(query: string, display = 10): Promise<WebItem[]> {
  const ep = endpoint("webkr");
  if (!ep) throw new Error("네이버 검색 키 미설정");
  const url = new URL(ep.url);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", "1");
  const res = await fetch(url, {
    headers: { ...ep.headers, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`네이버 웹문서 검색 HTTP ${res.status}`);
  const raw = (await res.json()) as { items?: { title: string; link: string; description: string }[] };
  return (raw.items ?? []).map((it) => ({ title: stripTags(it.title), url: it.link, snippet: stripTags(it.description) }));
}

export function naverConfigured(): boolean {
  return endpoint() !== null;
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function toDate(pubDate: string): string | null {
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function searchNews(query: string, display = 10): Promise<NewsItem[]> {
  const ep = endpoint();
  if (!ep) throw new Error("네이버 검색 키 미설정 (NAVER_HUB_KEY_ID/KEY 또는 NAVER_CLIENT_ID/SECRET)");

  const url = new URL(ep.url);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const res = await fetch(url, {
    headers: { ...ep.headers, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`네이버 검색 HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  // API HUB는 응답 형식이 다를 수 있다고 안내함 → items가 최상위 또는 result 안에 있는 경우 모두 처리
  type Item = { title: string; originallink?: string; link: string; description: string; pubDate: string };
  const raw = (await res.json()) as { items?: Item[]; result?: { items?: Item[] } };
  const data = { items: raw.items ?? raw.result?.items };
  return (data.items ?? []).map((it) => {
    const link = it.originallink?.trim() || it.link;
    return {
      title: stripTags(it.title),
      url: link,
      publisher: hostOf(link),
      date: toDate(it.pubDate),
      snippet: stripTags(it.description),
    };
  });
}
