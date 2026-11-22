// 시험 세트를 실제 서비스에 돌려 보는 스크립트 (의존성 없음, Node 20+).
// 사용법:
//   node scripts/verify-sample.mjs                                  (배포본, 기본 시험 세트)
//   node scripts/verify-sample.mjs http://localhost:3000            (로컬 서버)
//   node scripts/verify-sample.mjs <주소> docs/test-sets/xxx.json   (다른 시험 세트)
// 모든 묶음("나머지 주장 검증")까지 돌리고, 핵심 주장(key_claim_contains)의 판정을 기대값과 비교한다.

import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "https://urban-infra-jet.vercel.app").replace(/\/$/, "");
const setFile = process.argv[3] ?? "docs/test-sets/politics-economy.json";
const set = JSON.parse(readFileSync(setFile, "utf8"));

const LABEL = { confirmed: "확인됨", false: "근거와 다름", unverified: "아직 확인 안 됨", not_target: "판단 대상 아님" };
const post = (path, body) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

let hit = 0;
console.log(`# ${set.name} — ${base}\n`);
for (const p of set.posts) {
  const ex = await post("/api/extract", { url: p.url });
  const caption = ex.result?.caption_clean;
  if (!caption) {
    console.log(`- ${p.url}  글 읽기 실패: ${ex.result?.error ?? ex.error}\n`);
    continue;
  }
  const claims = [];
  let offset = 0;
  for (let guard = 0; guard < 5 && offset !== null; guard++) {
    const v = await post("/api/verify", { caption, offset });
    if (v.error) {
      console.log(`  판정 오류: ${v.error}`);
      break;
    }
    claims.push(...v.claims);
    offset = v.next_offset;
  }
  const key = claims.find((c) => c.claim.includes(p.key_claim_contains));
  const got = key ? key.verdict : "(핵심 주장을 못 고름)";
  const ok =
    key &&
    ((p.expected === "confirmed" && key.verdict === "confirmed") ||
      (p.expected === "confirmed_outdated" && key.verdict === "confirmed") ||
      (p.expected === "misleading" && key.verdict !== "confirmed"));
  if (ok) hit++;
  console.log(`- ${ok ? "✅" : "❌"} ${p.url}  (${p.topic}) 기대: ${p.expected} / 결과: ${LABEL[got] ?? got}`);
  console.log(`    ${p.summary}`);
  if (key) {
    console.log(`    주장: ${key.claim.slice(0, 90)}`);
    console.log(`    이유: ${key.reason}`);
    for (const n of key.comparison ?? []) console.log(`    비교: ${n}`);
    for (const e of key.evidence ?? []) console.log(`    인용: ${e.quote.slice(0, 160)}`);
  }
  const wrongConfirms = claims.filter((c) => c.verdict === "confirmed" && c !== key);
  for (const c of wrongConfirms) console.log(`    (다른 확인됨) ${c.claim.slice(0, 60)} ← ${c.evidence?.[0]?.quote?.slice(0, 80) ?? ""}`);
  console.log();
}
console.log(`핵심 주장 맞힘: ${hit} / ${set.posts.length}`);
