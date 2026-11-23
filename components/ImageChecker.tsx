"use client";

import { useEffect, useRef, useState } from "react";
import VerdictPanel from "./VerdictPanel";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SLIDES = 8;

async function recognize(body: BodyInit, signal: AbortSignal, json = false): Promise<{ text: string; needsReview: boolean }> {
  const response = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": json ? "application/json" : "application/octet-stream" },
    body,
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "이미지를 읽지 못했어요.");
  return { text: result.text ?? "", needsReview: result.status === "needs_review" };
}

export default function ImageChecker({ postUrl, caption }: { postUrl?: string; caption?: string | null }) {
  const [first, setFirst] = useState("");
  const [firstStatus, setFirstStatus] = useState("");
  const [slides, setSlides] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmedText, setConfirmedText] = useState("");
  const upload = useRef<AbortController | null>(null);

  useEffect(() => {
    setFirst("");
    setFirstStatus("");
    if (!postUrl) return;
    const request = new AbortController();
    setFirstStatus("Qwen이 게시물의 공개 대표 이미지를 분석하고 있어요.");
    void recognize(JSON.stringify({ url: postUrl }), request.signal, true)
      .then(({ text, needsReview }) => {
        if (request.signal.aborted) return;
        setConfirmedText("");
        setFirst(text);
        setFirstStatus(text ? (needsReview ? "Qwen이 대표 이미지를 분석했어요. 불확실하게 읽힌 부분을 원본과 비교해 주세요." : "Qwen이 공개 대표 이미지 한 장을 분석했어요.") : "대표 이미지를 가져오지 못했거나 읽을 내용을 찾지 못했어요. 스크린샷을 올려 주세요.");
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted) setFirstStatus(error instanceof Error ? error.message : "대표 이미지를 분석하지 못했어요.");
      });
    return () => request.abort();
  }, [postUrl]);

  useEffect(() => () => upload.current?.abort(), []);

  async function readSlides(files: File[]) {
    if (uploading || !files.length) return;
    if (files.length > MAX_SLIDES) {
      setStatus(`한 번에 ${MAX_SLIDES}장까지 선택할 수 있어요.`);
      return;
    }
    setUploading(true);
    setConfirmedText("");
    const request = new AbortController();
    upload.current = request;
    const results: string[] = [];
    const notices: string[] = [];
    for (const [index, file] of files.entries()) {
      if (request.signal.aborted) return;
      setStatus(`${index + 1}/${files.length}번째 이미지 Qwen으로 분석 중…`);
      if (file.size > MAX_BYTES) {
        notices.push(`${index + 1}장: 4MB를 넘어요`);
        continue;
      }
      try {
        const { text, needsReview } = await recognize(file, request.signal);
        if (text) {
          results.push(text);
          if (needsReview) notices.push(`${index + 1}장: 글과 시각 정보를 원본과 비교해 주세요`);
        }
        else notices.push(`${index + 1}장: 읽을 내용을 찾지 못했어요`);
      } catch (error) {
        if (request.signal.aborted) return;
        notices.push(`${index + 1}장: ${error instanceof Error ? error.message : "읽지 못했어요"}`);
      }
    }
    if (request.signal.aborted) return;
    setSlides((previous) => [previous, ...results].filter(Boolean).join("\n\n"));
    setStatus([`${files.length}장 중 ${results.length}장의 내용을 Qwen으로 읽었어요.`, ...notices].join(" · "));
    setUploading(false);
    upload.current = null;
  }

  const imageText = [first, slides].filter((text) => text.trim()).join("\n\n").trim();
  const combined = [caption, imageText].filter((text) => text?.trim()).join("\n\n");
  return (
    <>
      <section className="card">
        <h2 className="section-title">이미지로 확인하기</h2>
        <p className="hint">Qwen이 이미지 속 글, 그래프, 사진을 분석해요. 공개 대표 이미지와 선택한 스크린샷은 분석을 위해 Alibaba Cloud로 전송돼요. 앱에는 이미지를 저장하지 않아요.</p>
        {firstStatus && <p className="hint" role="status">{firstStatus}</p>}
        <label className="label" htmlFor="ocr-slides">스크린샷 선택</label>
        <input
          id="ocr-slides" className="input" type="file" multiple accept="image/png,image/jpeg,image/webp"
          aria-describedby="ocr-file-help" disabled={uploading}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void readSlides(files);
          }}
        />
        <p id="ocr-file-help" className="hint">PNG·JPEG·WebP · 한 번에 최대 8장 · 장당 4MB</p>
        {status && <p className="hint" role="status">{status}</p>}
        {first && <>
          <label className="label" htmlFor="ocr-first">대표 이미지 분석 결과</label>
          <textarea id="ocr-first" className="input textarea" rows={4} value={first}
            onChange={(event) => { setFirst(event.target.value); setConfirmedText(""); }} />
        </>}
        {slides && <>
          <label className="label" htmlFor="ocr-extra">스크린샷 분석 결과</label>
          <textarea id="ocr-extra" className="input textarea" rows={5} value={slides}
            onChange={(event) => { setSlides(event.target.value); setConfirmedText(""); }} />
        </>}
        {imageText && <>
          <p className="hint">원본과 비교해 글자, 숫자, 사진 설명을 확인하고 수정해 주세요. 확인한 내용은 캡션과 함께 검증해요.</p>
          {combined.length > 5000 && <p className="notice">캡션과 이미지 분석 결과를 합쳐 5,000자 이하로 줄여 주세요.</p>}
          <button className="button button-secondary" type="button" disabled={uploading || combined.length > 5000}
            onClick={() => setConfirmedText(combined)}>이 내용으로 검증 준비</button>
        </>}
      </section>
      {confirmedText && <VerdictPanel key={confirmedText} caption={confirmedText} />}
    </>
  );
}
