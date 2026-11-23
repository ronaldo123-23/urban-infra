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
    setFirstStatus("게시물의 공개 대표 이미지에서 글자를 읽고 있어요.");
    void recognize(JSON.stringify({ url: postUrl }), request.signal, true)
      .then(({ text, needsReview }) => {
        if (request.signal.aborted) return;
        setConfirmedText("");
        setFirst(text);
        setFirstStatus(text ? (needsReview ? "대표 이미지 글자가 불확실해요. 원본을 보며 숫자와 문장을 고쳐 주세요." : "공개 대표 이미지 한 장을 읽었어요.") : "대표 이미지를 읽지 못했거나 글자가 없어요. 스크린샷을 올려 주세요.");
      })
      .catch(() => {
        if (!request.signal.aborted) setFirstStatus("대표 이미지를 읽지 못했어요. 스크린샷을 올려 주세요.");
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
      setStatus(`${index + 1}/${files.length}번째 이미지 읽는 중…`);
      if (file.size > MAX_BYTES) {
        notices.push(`${index + 1}장: 4MB를 넘어요`);
        continue;
      }
      try {
        const { text, needsReview } = await recognize(file, request.signal);
        if (text) {
          results.push(text);
          if (needsReview) notices.push(`${index + 1}장: 읽힌 글자를 확인해 주세요`);
        }
        else notices.push(`${index + 1}장: 글자를 찾지 못했어요`);
      } catch (error) {
        if (request.signal.aborted) return;
        notices.push(`${index + 1}장: ${error instanceof Error ? error.message : "읽지 못했어요"}`);
      }
    }
    if (request.signal.aborted) return;
    setSlides((previous) => [previous, ...results].filter(Boolean).join("\n\n"));
    setStatus([`${files.length}장 중 ${results.length}장에서 글자를 읽었어요.`, ...notices].join(" · "));
    setUploading(false);
    upload.current = null;
  }

  const imageText = [first, slides].filter((text) => text.trim()).join("\n\n").trim();
  const combined = [caption, imageText].filter((text) => text?.trim()).join("\n\n");
  return (
    <>
      <section className="card">
        <h2 className="section-title">이미지로 확인하기</h2>
        <p className="hint">카드뉴스를 캡처해 올리면 선택한 순서대로 글자를 읽어요. 이미지는 글자 인식을 위해 서버로 보내며 앱에 저장하지 않아요.</p>
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
          <label className="label" htmlFor="ocr-first">대표 이미지에서 읽은 글</label>
          <textarea id="ocr-first" className="input textarea" rows={4} value={first}
            onChange={(event) => { setFirst(event.target.value); setConfirmedText(""); }} />
        </>}
        {slides && <>
          <label className="label" htmlFor="ocr-extra">스크린샷에서 읽은 글</label>
          <textarea id="ocr-extra" className="input textarea" rows={5} value={slides}
            onChange={(event) => { setSlides(event.target.value); setConfirmedText(""); }} />
        </>}
        {imageText && <>
          <p className="hint">틀리게 읽힌 글자와 숫자를 수정해 주세요. 캡션을 읽은 경우 함께 검증해요.</p>
          {combined.length > 5000 && <p className="notice">캡션과 이미지 글을 합쳐 5,000자 이하로 줄여 주세요.</p>}
          <button className="button button-secondary" type="button" disabled={uploading || combined.length > 5000}
            onClick={() => setConfirmedText(combined)}>이 글로 검증 준비</button>
        </>}
      </section>
      {confirmedText && <VerdictPanel key={confirmedText} caption={confirmedText} />}
    </>
  );
}
