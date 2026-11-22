"use client";

import { useState } from "react";
import type { ClaimResult, Source, Verdict, VerifyResponse } from "@/lib/verify/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  confirmed: "확인됨",
  false: "거짓으로 밝혀짐",
  unverified: "아직 확인 안 됨",
  not_target: "판단 대상 아님",
};

function SourceLink({ s }: { s: Source }) {
  const meta = [s.publisher, s.date, s.duplicates > 1 ? `비슷한 기사 ${s.duplicates}건` : null].filter(Boolean).join(" · ");
  return (
    <li className="source">
      <a href={s.url} target="_blank" rel="noopener noreferrer">
        {s.kind === "kosis" ? "📊 " : ""}
        {s.title}
      </a>
      {meta && <span className="muted"> — {meta}</span>}
    </li>
  );
}

function ClaimCard({ c }: { c: ClaimResult }) {
  return (
    <li className="claim">
      <span className={`badge badge-${c.verdict}`}>{VERDICT_LABEL[c.verdict]}</span>
      <p className="claim-text">“{c.claim}”</p>
      <p className="claim-reason">{c.reason}</p>
      {c.sources.length > 0 && (
        <div>
          <p className="label-sm">근거</p>
          <ul className="sources">
            {c.sources.map((s) => (
              <SourceLink key={s.id} s={s} />
            ))}
          </ul>
        </div>
      )}
      {c.related.length > 0 && (
        <details className="details">
          <summary>관련 자료 {c.related.length}개 (판정 근거로는 안 씀)</summary>
          <ul className="sources">
            {c.related.map((s) => (
              <SourceLink key={s.id} s={s} />
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export default function VerdictPanel({ caption }: { caption: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VerifyResponse | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "판정에 실패했어요");
      else setData(json as VerifyResponse);
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card" aria-label="판정 결과" aria-live="polite">
      <h2 className="section-title">판정</h2>
      {!data && (
        <>
          <p className="hint">글 속 주장을 하나씩 골라 팩트체크 기사와 공식 통계로 확인해요. 10~30초쯤 걸려요.</p>
          <button className="button" type="button" onClick={run} disabled={loading || !caption.trim()}>
            {loading ? "확인하는 중…" : "판정하기"}
          </button>
        </>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          {data.claims.length === 0 ? (
            <p className="notice">확인할 만한 주장을 찾지 못했어요.</p>
          ) : (
            <ul className="claims">
              {data.claims.map((c, i) => (
                <ClaimCard key={i} c={c} />
              ))}
            </ul>
          )}
          {data.mode === "search_only" && (
            <p className="notice">지금은 AI 판정 없이 관련 기사만 보여주고 있어요. 링크를 직접 읽고 판단해 보세요.</p>
          )}
          <p className="hint">결과가 틀릴 수 있어요. 공유하기 전에 근거 링크를 직접 열어 확인해 보세요.</p>
          {data.warnings.length > 0 && (
            <details className="details">
              <summary>참고 사항 {data.warnings.length}개</summary>
              <ul className="attempts">
                {data.warnings.map((w, i) => (
                  <li key={i} className="muted">
                    {w}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
