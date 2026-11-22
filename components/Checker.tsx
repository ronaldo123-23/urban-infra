"use client";

import { useEffect, useRef, useState } from "react";
import type { ExtractAttempt, ExtractResponse } from "@/lib/extract/types";
import VerdictPanel from "./VerdictPanel";

const METHOD_LABEL: Record<string, string> = {
  oembed: "Meta 공식 oEmbed",
  meta_tag: "게시물 페이지 메타 태그",
  manual: "직접 붙여넣기",
};
const STATUS_LABEL: Record<ExtractAttempt["status"], string> = {
  success: "성공",
  failed: "실패",
  skipped: "건너뜀",
};

export default function Checker({ initialUrl, autoStart }: { initialUrl: string; autoStart: boolean }) {
  const [url, setUrl] = useState(initialUrl);
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExtractResponse | null>(null);
  const started = useRef(false);

  async function send(payload: { url: string; manual_caption?: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "요청에 실패했어요");
        return;
      }
      setData(json as ExtractResponse);
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void send({ url: initialUrl });
    }
  }, [autoStart, initialUrl]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setManual("");
    void send({ url: url.trim() });
  }

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.trim()) return;
    void send({ url: url.trim(), manual_caption: manual });
  }

  const r = data?.result;

  return (
    <div className="stack">
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="post-url" className="label">
          인스타그램 게시물 링크
        </label>
        <input
          id="post-url"
          className="input"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://www.instagram.com/p/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="button" type="submit" disabled={loading || !url.trim()}>
          {loading ? "읽는 중…" : "확인하기"}
        </button>
        <p className="hint">게시물 오른쪽 위 ··· 또는 공유 버튼 → 링크 복사 후 붙여넣어요. 릴스는 글(캡션)만 읽어요.</p>
      </form>

      {error && (
        <p className="card notice notice-error" role="alert">
          {error}
        </p>
      )}

      {data && r && (
        <section className="card" aria-live="polite">
          <h2 className="section-title">읽은 글</h2>

          {data.false_disclosure && (
            <div className="notice notice-error">
              <strong>이 게시글은 거짓</strong>
              <p>{r.method === "manual" ? "붙여넣은 글" : "캡션"}에 이 게시글의 내용이 거짓이라고 명시돼 있어요. 기사 검색 없이 이 문구를 근거로 표시했어요.</p>
              <blockquote>{data.false_disclosure}</blockquote>
            </div>
          )}

          {r.caption_clean !== null ? (
            <>
              <dl className="meta">
                <dt>읽은 방법</dt>
                <dd>{r.method ? METHOD_LABEL[r.method] : "-"}</dd>
                <dt>계정</dt>
                <dd>{r.author ? `@${r.author}` : "알 수 없음"}</dd>
              </dl>
              <p className="caption">{r.caption_clean || "(해시태그·이모지를 빼니 남은 글이 없어요)"}</p>
              {r.hashtags.length > 0 && (
                <ul className="tags">
                  {r.hashtags.map((h) => (
                    <li key={h}>#{h}</li>
                  ))}
                </ul>
              )}
              <details className="details">
                <summary>원문 전체 보기</summary>
                <p className="caption caption-raw">{r.caption_raw}</p>
              </details>
            </>
          ) : (
            <p className="notice">
              {data.needs_manual ? "링크에서 글을 자동으로 읽지 못했어요. 자세한 이유는 아래 '시도 기록'에 있어요." : r.error}
            </p>
          )}

          {data.attempts.length > 0 && (
            <details className="details">
              <summary>시도 기록</summary>
              <ul className="attempts">
                {data.attempts.map((a) => (
                  <li key={a.method}>
                    <strong>{METHOD_LABEL[a.method]}</strong> — {STATUS_LABEL[a.status]}
                    {a.reason && <span className="muted"> ({a.reason})</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {data?.needs_manual && (
        <form className="card" onSubmit={onManualSubmit}>
          <h2 className="section-title">글을 자동으로 읽지 못했어요</h2>
          <p className="hint">인스타 앱에서 게시물 글(캡션)을 길게 눌러 복사한 뒤 여기에 붙여넣어 주세요.</p>
          <textarea
            className="input textarea"
            rows={6}
            maxLength={5000}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="캡션을 붙여넣어 주세요"
          />
          <button className="button" type="submit" disabled={loading || !manual.trim()}>
            {loading ? "정리 중…" : "이 글로 확인하기"}
          </button>
        </form>
      )}

      {r?.caption_clean && !data?.false_disclosure ? <VerdictPanel key={r.fetched_at} caption={r.caption_clean} /> : null}
    </div>
  );
}
