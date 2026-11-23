import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  outputFileTracingIncludes: {
    "/api/ocr": ["./node_modules/tesseract.js/src/worker-script/node/**/*", "./node_modules/tesseract.js-core/**/*"],
  },
};

export default nextConfig;
