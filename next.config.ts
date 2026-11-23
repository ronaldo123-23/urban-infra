import type { NextConfig } from "next";

// OCR(tesseract.js)은 별도 작업자 스레드(worker-script/node/index.js)에서 돈다.
// Next.js의 배포 파일 추적은 이 스레드가 불러오는 패키지를 따라가지 못해서, Vercel 서버에서
// 작업자가 시작하자마자 "패키지를 찾을 수 없음"으로 죽고 OCR 요청이 30초 제한까지 멈춰 있었다 (2026-11-23).
// 그래서 작업자가 쓰는 패키지를 직접 포함시킨다. tesseract.js를 올리면 이 목록이 맞는지 다시 확인할 것:
//   grep -rhoE "require\(['\"][^'\"]+['\"]\)" node_modules/tesseract.js/src/worker-script/ | sort -u
const OCR_WORKER_FILES = [
  "./node_modules/tesseract.js/package.json",
  "./node_modules/tesseract.js/src/**/*",
  "./node_modules/tesseract.js-core/**/*",
  "./node_modules/wasm-feature-detect/**/*",
  "./node_modules/zlibjs/**/*",
  "./node_modules/bmp-js/**/*",
  "./node_modules/is-url/**/*",
  "./node_modules/idb-keyval/**/*",
  "./node_modules/regenerator-runtime/**/*",
  "./node_modules/node-fetch/**/*",
  "./node_modules/whatwg-url/**/*",
  "./node_modules/tr46/**/*",
  "./node_modules/webidl-conversions/**/*",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  outputFileTracingIncludes: {
    "/api/ocr": OCR_WORKER_FILES,
  },
};

export default nextConfig;
