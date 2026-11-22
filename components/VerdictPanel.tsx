"use client";

import { useState } from "react";
import type { ClaimResult, Source, Verdict, VerifyResponse } from "@/lib/verify/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  confirmed: "확인됨",
  false: "근거와 다름",
  unverified: "아직 확인 안 됨",
  not_target: "판단 대상 아님",
};

const KIND_LABEL: Record<Source["kind"], string> = {
  news: "기사",
  paper: "논문",
  official: "공식 안내",
  web: "웹문서",
  kosis: "통계",
};

function SourceLink({ s }: { s: Source }) {
  const meta = [
    KIND_LABEL[s.kind],
    s.publisher,
    s.date,
    s.duplicates > 1 ? `비슷한 기사 ${s.duplicates}건을 1개로 셈` : null,
    s.full_text_read ? "원문 대조함" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="source">
      <a href={s.url} target="_blank" rel="noopener noreferrer">
        {s.title}
      </a>
      {meta && <span className="muted"> — {meta}</span>}
      {s.relevance.matched.length > 0 && (
        <span className="match">
          연관도 {s.relevance.score}점 · 일치: {s.relevance.matched.join(" · ")}
        </span>
      )}
    </li>
  );
}

function ClaimCard({ c }: { c: ClaimResult }) {
  const byId = new Map([...c.sources, ...c.related].map((s) => [s.id, s]));
  return (
    <li className="claim">
      <span className={`badge badge-${c.verdict}`}>{VERDICT_LABEL[c.verdict]}</span>
      <p className="claim-text">“{c.claim}”</p>
      <p className="claim-reason">{c.reason}</p>
      {c.comparison.length > 0 && (
        <ul className="comparison">
          {c.comparison.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {c.evidence.map((e) => (
        <blockquote key={e.source_id} className="quote">
          <p>{e.quote}</p>
          <footer className="muted">
            {byId.get(e.source_id) ? `${KIND_LABEL[byId.get(e.source_id)!.kind]} · ${byId.get(e.source_id)!.publisher ?? ""}` : ""}
          </footer>
        </blockquote>
      ))}
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
  // 첫 묶음 응답 (뺀 문장·참고 사항·모드) + 지금까지 모은 판정
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [claims, setClaims] = useState<ClaimResult[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  async function run(offset = 0) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, offset }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "판정에 실패했어요");
        return;
      }
      const v = json as VerifyResponse;
      if (offset === 0) {
        setData(v);
        setClaims(v.claims);
      } else {
        // 판단 대상 아님 카드는 맨 뒤에 두고, 새로 검증한 주장을 그 앞에 붙인다
        setClaims((prev) => {
          const checked = prev.filter((c) => c.verdict !== "not_target");
          const notTarget = prev.filter((c) => c.verdict === "not_target");
          return [...checked, ...v.claims, ...notTarget];
        });
        setData((d) => (d ? { ...d, warnings: [...new Set([...d.warnings, ...v.warnings])] } : v));
      }
      setNextOffset(v.next_offset);
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  const checkedCount = claims.filter((c) => c.verdict !== "not_target").length;
  const remaining = data && nextOffset !== null ? data.total_checkable - nextOffset : 0;

  return (
    <section className="card" aria-label="판정 결과" aria-live="polite">
      <h2 className="section-title">판정</h2>
      {!data && (
        <>
          <p className="hint">글 속 주장을 하나씩 골라 팩트체크 기사와 공식 통계로 확인해요. 10~30초쯤 걸려요.</p>
          <button className="button" type="button" onClick={() => run(0)} disabled={loading || !caption.trim()}>
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
          {data.total_checkable > 0 && (
            <p className="hint">
              검증할 주장 {data.total_checkable}개 중 {checkedCount}개를 확인했어요. 수치·날짜·출처가 있는 주장부터 확인해요.
            </p>
          )}
          {claims.length === 0 ? (
            <p className="notice">확인할 만한 주장을 찾지 못했어요.</p>
          ) : (
            <ul className="claims">
              {claims.map((c, i) => (
                <ClaimCard key={i} c={c} />
              ))}
            </ul>
          )}
          {remaining > 0 && (
            <button className="button" type="button" onClick={() => run(nextOffset ?? 0)} disabled={loading}>
              {loading ? "확인하는 중…" : `나머지 주장 검증 (${remaining}개 남음)`}
            </button>
          )}
          {data.skipped.length > 0 && (
            <details className="details">
              <summary>검증에서 뺀 문장 {data.skipped.length}개</summary>
              <ul className="attempts">
                {data.skipped.map((s, i) => (
                  <li key={i}>
                    “{s.text}” <span className="muted">— {s.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.mode === "rules" && (
            <p className="notice">
              자동 규칙으로 판정했어요. 원문(공식 안내·논문·기사)에서 같은 수치나 문장을 찾았을 때만 &quot;확인됨&quot;, 팩트체크 기사가 반박했거나 원문 수치가 다르면 &quot;근거와 다름&quot;으로 표시해요.
            </p>
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
