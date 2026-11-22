import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "진짜일까? — 인스타 게시물 사실 확인",
  description: "인스타그램 게시물 링크를 넣으면 글을 읽고, 주장이 사실인지 근거와 함께 확인해 줘요.",
  applicationName: "진짜일까?",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f5bea",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
