// 네이버 검색 API (뉴스). https://developers.naver.com/docs/serviceapi/search/news/news.md
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

import { decodeEntities } from "@/lib/extract/html";

export interface NewsItem {
  title: string;
  url: string;
  publisher: string | null;
  date: string | null; // YYYY-MM-DD
  snippet: string;
}

const ENDPOINT = "https://openapi.naver.com/v1/search/news.json";
const TIMEOUT_MS = 8000;

export function naverConfigured(): boolean {
  return Boolean(process.env.NAVER_CLIENT_ID?.trim() && process.env.NAVER_CLIENT_SECRET?.trim());
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
  const id = process.env.NAVER_CLIENT_ID?.trim();
  const secret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정");

  const url = new URL(ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`네이버 검색 HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    items?: { title: string; originallink?: string; link: string; description: string; pubDate: string }[];
  };
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
