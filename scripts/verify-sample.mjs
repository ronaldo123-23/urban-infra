// 시험 세트를 실제 서비스에 돌려 보는 스크립트 (의존성 없음, Node 20+).
// 사용법:
//   node scripts/verify-sample.mjs                                  (배포본, docs/test-sets/ 의 모든 세트)
//   node scripts/verify-sample.mjs http://localhost:3000            (로컬 서버)
//   node scripts/verify-sample.mjs <주소> docs/test-sets/xxx.json   (세트 하나만)
// 모든 묶음("나머지 주장 검증")까지 돌리고, 핵심 주장(key_claim_contains)의 판정을 기대값과 비교한다.
// 항목에 url이 있으면 인스타 게시물을 읽고, caption이 있으면 그 글을 바로 판정한다.
//
// expected:
//   confirmed          → "확인됨"이어야 통과
//   confirmed_outdated → "확인됨"이어야 통과 (최신 정보 안내가 붙으면 좋음)
//   false              → "근거와 다름"이어야 통과
//   misleading, not_confirmed → "확인됨"만 아니면 통과 (오해를 부르는 글·확인되면 안 되는 글)

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const base = (process.argv[2] ?? "https://urban-infra-jet.vercel.app").replace(/\/$/, "");
const dir = "docs/test-sets";
const files = process.argv[3] ? [process.argv[3]] : readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));

const LABEL = { confirmed: "확인됨", false: "근거와 다름", unverified: "아직 확인 안 됨", not_target: "판단 대상 아님" };
const post = async (p, body) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) {
      if (attempt === 1) return { error: String(e) };
    }
  }
};

function passed(expected, verdict) {
  if (!verdict) return false;
  if (expected === "confirmed" || expected === "confirmed_outdated") return verdict === "confirmed";
  if (expected === "false") return verdict === "false";
  return verdict !== "confirmed"; // misleading, not_confirmed
}

let total = 0;
let hit = 0;
const byExpected = {};
for (const file of files) {
  const set = JSON.parse(readFileSync(file, "utf8"));
  console.log(`\n# ${set.name} — ${base}\n`);
  for (const p of set.posts) {
    total++;
    let caption = p.caption;
    if (!caption) {
      const ex = await post("/api/extract", { url: p.url });
      caption = ex.result?.caption_clean;
      if (!caption) {
        console.log(`- ❌ ${p.url}  글 읽기 실패: ${ex.result?.error ?? ex.error}\n`);
        (byExpected[p.expected] ??= [0, 0])[1]++;
        continue;
      }
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
    const ok = passed(p.expected, key?.verdict);
    if (ok) hit++;
    const e = (byExpected[p.expected] ??= [0, 0]);
    if (ok) e[0]++;
    e[1]++;
    const name = p.url ?? `(글) ${p.caption.slice(0, 30)}…`;
    console.log(`- ${ok ? "✅" : "❌"} ${name}  (${p.topic}) 기대: ${p.expected} / 결과: ${key ? LABEL[key.verdict] : "(핵심 주장을 못 고름)"}`);
    console.log(`    ${p.summary}`);
    if (key && !ok) {
      console.log(`    주장: ${key.claim.slice(0, 90)}`);
      console.log(`    이유: ${key.reason}`);
    }
    if (key) {
      for (const n of key.comparison ?? []) console.log(`    비교: ${n}`);
      for (const ev of key.evidence ?? []) console.log(`    인용: ${ev.quote.slice(0, 140)}`);
    }
    for (const c of claims.filter((x) => x.verdict === "confirmed" && x !== key))
      console.log(`    (다른 확인됨) ${c.claim.slice(0, 60)} ← ${c.evidence?.[0]?.quote?.slice(0, 80) ?? ""}`);
    console.log();
  }
}
console.log(`핵심 주장 맞힘: ${hit} / ${total}`);
for (const [k, [a, b]] of Object.entries(byExpected)) console.log(`  ${k}: ${a} / ${b}`);
