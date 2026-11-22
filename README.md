# urban-infra
도시인프라 — 인스타그램 게시물 사실 확인 서비스 "진짜일까?" (기획: [docs/SPEC.md](docs/SPEC.md))

배포 주소: https://urban-infra-jet.vercel.app (`main`에 머지하면 자동 배포)

인스타 게시물 링크를 넣으면 글(캡션)을 읽고(1단계), 글 속 주장을 골라 팩트체크 기사·공식 통계로 판정한다(2단계).

## 설치
Node.js 20 이상이 필요하다.

```bash
npm install
cp .env.example .env.local   # 필요한 값만 채운다 (비워 둬도 동작함)
```

## 실행
```bash
npm run dev        # 개발 서버: http://localhost:3000
npm run build      # 배포용 빌드 (타입 검사 포함)
npm run start      # 빌드한 결과 실행
```

## 동작 방식
1. 링크를 넣으면 서버(`POST /api/extract`)가 Meta oEmbed → 게시물 페이지 메타 태그 순서로 캡션을 읽는다.
   - `META_OEMBED_TOKEN`이 없으면 oEmbed는 건너뛰고 이유만 기록한다.
2. 둘 다 실패하면 화면에 "캡션을 붙여넣어 주세요" 입력칸이 뜬다.
3. 안드로이드에서 PWA로 설치하면 인스타 공유 목록에 뜬다 (iOS는 링크 붙여넣기만 가능).
4. "판정하기"를 누르면 서버(`POST /api/verify`)가:
   1. 규칙으로 주장을 고르고 (수치·출처·날짜가 있는 문장 먼저, 5개씩)
   2. 주장마다 네이버 뉴스("팩트체크 + 핵심어", 일반 검색), 공식 안내 페이지, 해외 논문(Europe PMC, 키 없음), 통계 주장은 KOSIS를 찾고
   3. 연관성 점수로 엉뚱한 자료를 거른 뒤, 원문(본문·초록)에서 같은 수치·문장을 찾으면 "확인됨", 팩트체크 기사가 반박하거나 원문 수치가 다르면 "근거와 다름", 아니면 "아직 확인 안 됨"(이유 포함)으로 보여준다.
   - `ANTHROPIC_API_KEY`를 넣으면 1·3단계를 Claude가 한다 (유료, 기본 꺼짐).

## 환경변수 (`.env.local`, Vercel)
| 이름 | 용도 | 없으면 |
|---|---|---|
| `NAVER_HUB_KEY_ID`, `NAVER_HUB_KEY` (네이버 클라우드 API HUB) 또는 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (개발자센터) | 뉴스·팩트체크 기사 검색 | 뉴스 근거 없음 (모든 주장이 "아직 확인 안 됨") |
| `KOSIS_API_KEY` | 통계 대조 | 통계 근거 없음 |
| `META_OEMBED_TOKEN` | 인스타 글 읽기 1순위 | 메타 태그로 읽음 |
| `ANTHROPIC_API_KEY` | (선택, 유료) Claude로 주장 추출·판정 | 규칙 판정 (기본) |

논문 검색(Europe PMC)과 공식 안내 페이지 읽기는 키가 필요 없다.

## 시험
1단계 통과 기준과 기록 표: [docs/phase1-test.md](docs/phase1-test.md)

판정 시험 세트 (실제 인스타 게시물 + 기대 결과): [docs/test-sets/](docs/test-sets/)
```bash
node scripts/verify-sample.mjs                         # 배포본으로
node scripts/verify-sample.mjs http://localhost:3000   # 로컬 서버로 (npm run build && npm run start)
```
각 게시물의 핵심 주장 판정이 기대값과 맞는지 ✅/❌와 "핵심 주장 맞힘: N / 6"을 보여준다.

## 협업
작업 규칙은 [AGENTS.md](AGENTS.md), 진행 상황은 [PROGRESS.md](PROGRESS.md)를 본다.
