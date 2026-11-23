# AGENTS.md — 도시인프라 (urban-infra)

이 파일이 프로젝트 규칙의 유일한 기준이다. Claude Code와 Codex 모두 이 파일을 따른다.
규칙을 바꿀 때는 이 파일만 수정하고, PR 설명에 변경 사항을 적는다.

## 1. 프로젝트 개요
- 이름: 도시인프라 (urban-infra)
- 목적: 10대가 인스타그램 게시물 링크를 넣으면 글(캡션)을 읽고, 주장이 사실인지 근거 링크와 함께 알려주는 웹 서비스 (서비스 이름 가칭: "진짜일까?")
- 기획서: [docs/SPEC.md](docs/SPEC.md). 1단계(글 읽기)와 2단계(주장 추출·판정, SPEC 7-1~7-4)를 만든다. SPEC 7-5 중 공개 대표 이미지와 사용자가 첨부한 이미지의 OCR을 지원한다. 고령자 전용 화면과 기록 저장·공유는 후속 범위다.
- 금지: 인스타 로그인 우회, 비공식 스크래핑 라이브러리, 계정 쿠키 사용.
- 판정 규칙 (SPEC 7-3, 7-4):
  - 기본은 AI 없는 **규칙 판정**이다 (Claude API는 유료라 쓰지 않기로 함). `lib/claims/rules.ts`가 주장을 고르고 `lib/verify/rules.ts`가 판정한다.
  - (선택) 알리바바 클라우드 Qwen: `DASHSCOPE_API_KEY` + `QWEN_MODEL`이 있으면, 규칙이 "아직 확인 안 됨"으로 둔 주장 중 자료가 있는 것만 Qwen이 다시 본다 (`lib/verify/aiJudge.ts`). 규칙의 "확인됨"/"근거와 다름"은 바꾸지 않는다. AI가 낸 판정은 자료 번호 + 원문에 실제로 있는 인용문이 있어야 인정한다 (코드가 검사).
  - 캡션이 해당 게시물 자체의 내용이 거짓이라고 밝히거나 지어낸 이야기·실제로 일어나지 않은 일이라고 명시하면 추출 단계에서 작성자가 허구임을 밝힌 문장과 그 설명을 표시한다. 인용·질문·외부 주장의 반박은 제외한다. 이 표시는 캡션의 명시에 근거한다.
  - 주장 고르기: 캡션 전체를 훑어 수치·출처·날짜가 있는 문장부터 우선순위를 매긴다. 제목 조각·소개 문장("~소식입니다", "~했는데요")·같은 내용 반복은 "검증에서 뺀 문장"으로, 질문·의견·광고·조언은 "판단 대상 아님"으로 둔다. 검증은 5개씩, 남은 주장은 "나머지 주장 검증"으로 이어서 한다.
  - "아직 확인 안 됨"에는 보류 이유를 붙인다: `search_not_run`(검색 못 함), `no_results`(관련 자료 없음), `insufficient_match`(관련 자료는 있지만 근거 문장 없음).
  - 개선 계획: [docs/IMPROVEMENT_PLAN.md](docs/IMPROVEMENT_PLAN.md)
  - 판정 4단계 이름: **확인됨 / 근거와 다름 / 아직 확인 안 됨 / 판단 대상 아님** ("거짓으로 밝혀짐"은 2026-11-22에 "근거와 다름"으로 바꿈, 코드 값 `false`는 그대로)
  - 근거 찾기 (`lib/verify/evidence.ts`): 네이버 뉴스(팩트체크 + 일반), 공식 안내 페이지 목록(`lexicon.ts`의 `OFFICIAL_SOURCES`), 믿을 만한 도메인의 네이버 웹문서(`TRUSTED_DOMAIN_RE`), 연구 주장은 해외 논문(Europe PMC, 사전으로 영어 검색어 만듦), 통계 주장은 KOSIS.
  - 연관성 (`lib/verify/relevance.ts`, IMPROVEMENT_PLAN 3-1절): 주제어·대상 충돌 관문 → 100점 점수 → 직접 근거(70+)/관련 자료(40~69)/무관(버림). 화면에 "연관도 N점 · 일치: …"를 보여준다.
  - 원문 읽기 (`lib/verify/fetchPage.ts`): 공개 페이지만, 자기 이름을 밝힌 User-Agent로, 로그인·차단·HTML 아님이면 읽지 않고 보류. 화면에는 근거 문장 한두 개만 인용한다 (저작권).
  - 판정 (`lib/verify/rules.ts`, `compare.ts`):
    - "근거와 다름": ① 팩트체크 기사의 제목·요약에 반박 표현(사실 아님, 거짓, 사실무근 등)이 있고, 숫자·날짜를 뺀 주장 핵심어가 기사 제목에 2개 이상, 제목+요약에 절반 이상 있을 때, 또는 ② 공식 안내·논문의 같은 주제 문장(주제어 3개 이상)에 같은 단위의 다른 수치만 있을 때.
    - "확인됨": 직접 근거인 자료의 **본문을 읽고** 같은 내용의 문장을 찾았을 때만. 수치 주장은 같은 수치와 단위가 그 문장에 모두 있어야 하고(상대 변화율과 퍼센트포인트는 따로 대조함), 수치 없는 주장은 공식 안내·논문·공식 웹문서에서만. 반박 표현·물음표가 있는 문장(소문 인용)은 근거로 쓰지 않는다. 게시물의 "○% 더 높다"가 원문에서는 %포인트 차이면 "근거와 다름"이 아니라 **"확인됨 + 표현 주의"**로 안내한다 (수치는 같으므로).
    - 게시물의 대상(참가자·청년 등), 숫자 시점, 조건(방문 포장·만 ○세 등)이 근거 자료와 맞아야 확인한다 (대상은 근거 문장이 아니라 그 자료 안에 있으면 됨).
    - "작년·올해·내년" 같은 상대 시점이 있는 주장은 올해 나온 자료로만 확인·반박한다.
    - 그 외: "아직 확인 안 됨" + 관련 자료.
  - 판정 보완 (PR C):
    - 뉴스 검색어는 3가지: ① 큰 숫자 + 핵심어 2개 ("6515조 국가 부채") ② 핵심어 3개 ③ "팩트체크" + 핵심어 2개.
    - 숫자는 조·억·만·천 단위와 쉼표("6,515조 원" = "6515조원")까지 같은 숫자로 본다.
    - 문장은 따옴표·괄호 안에서 자르지 않는다.
    - 발언 인용 주장("…"이라고 설명했다)은 따옴표 안 핵심어가 원문 한 문장에 모두 있어야 확인. 자료 제목 한 줄·메뉴 경로("> 보도자료 >")로는 확인하지 않는다.
    - 숫자가 같아도 "최저↔최고", "증가↔감소"처럼 반대 말이면 확인하지 않는다.
    - 수치 주장은 "관련 자료" 등급도 대조한다 (한 문장에 수치 전부 + 주제어 3개 이상일 때만 확인).
    - 팩트체크 반박은 ① 본문을 읽은 직접 근거 기사에서 반박 표현 + 주제어 2개가 같은 문장에 있을 때, 또는 ② 본문을 못 읽었어도 기사 **제목**에 팩트체크 표시와 반박 표현이 둘 다 있을 때 인정한다.
    - 게시물이 행사·프로모션 이름을 말하면 그 이름이 들어간 자료만 근거 후보로 쓴다. 공식 행사 페이지는 `lexicon.ts`의 `OFFICIAL_EVENT_PAGES` 목록으로 관리한다 (코드에 특정 행사를 직접 넣지 않는다).
    - 게시물의 직책(CEO·장관 등)이 최신 자료에서 "전 ○○"이면 비교 설명으로 알려 준다 (판정은 바꾸지 않음).
  - 사전(`lib/verify/lexicon.ts`): 같은 말·영어 표현, 단위, 대상 충돌, 믿을 만한 도메인, 공식 안내 페이지. 새 사례에서 놓친 말은 여기에 추가한다.
  - 판정 규칙을 바꾸면 시험 세트를 돌려 성적이 떨어지지 않았는지 확인하고 PR에 적는다: `node scripts/verify-sample.mjs http://localhost:3000` (세트: `docs/test-sets/*.json`).
  - Claude 코드(`lib/ai/`, `lib/claims/extract.ts`, `lib/verify/judge.ts`)는 남겨 두되 `ANTHROPIC_API_KEY`가 있을 때만 켜진다.
  - AI는 우리가 실제로 검색해서 준 출처 번호만 인용한다. 코드에서 다시 검사해, 근거 링크가 없으면 "확인됨"/"근거와 다름"을 "아직 확인 안 됨"으로 바꾼다.
  - "여러 언론사에 나왔다"만으로 확인됨 처리하지 않는다. 제목이 거의 같은 기사(같은 보도자료)는 1개 출처로 묶는다.
  - 게시물 글은 AI에게 데이터로만 넘긴다 (글 안의 지시문을 따르지 않게 프롬프트에 명시).
  - 검증 경로: 통계 주장은 KOSIS + 뉴스, 사실을 섞은 거짓·완전한 거짓은 주장을 문장별로 나눠 각각 네이버 뉴스("팩트체크 + 핵심어"와 일반 검색)로 찾는다. 연구·기관을 인용한 주장은 논문·공식 안내 원문도 찾는다.

## 2. 기술 스택
- Next.js (App Router) + TypeScript (strict), React
- 패키지 매니저: npm (`package-lock.json` 커밋)
- 배포: Vercel
- 인스타 요청과 외부 API(Claude, Qwen, 네이버, KOSIS) 호출은 반드시 서버(`app/api/...`)에서 한다. 브라우저에서 직접 요청하지 않는다 (CORS, 키 노출).
- AI(선택, 기본 꺼짐): Claude API (`@anthropic-ai/sdk`), 모델 기본값 `claude-opus-5-5` (`ANTHROPIC_MODEL`로 변경 가능). 결과는 구조화 출력(zod 스키마)으로 받는다.
- AI(선택, 기본 꺼짐): 알리바바 클라우드 Model Studio Qwen, OpenAI 호환 주소로 `fetch` 직접 호출 (추가 패키지 없음). 무료 토큰을 아끼려고 생각 끄기·답변 길이 제한·주장 묶어 1번 요청. 결과는 JSON으로 받아 zod로 검사한다.
- 키가 없으면 해당 기능만 꺼지고 나머지는 동작해야 한다 (예: Claude 키가 없으면 관련 기사만 보여줌).
- 비밀 값(토큰)은 `.env.local`과 Vercel 환경변수에만 둔다. 이름과 설명은 `.env.example`에 적는다.

## 3. 폴더 구조
```
app/                 화면(page.tsx, layout.tsx), PWA manifest, 전역 스타일
app/api/extract/     POST /api/extract — 링크 → 추출 결과
app/api/verify/      POST /api/verify — caption_clean → 주장별 판정
components/          화면 컴포넌트 (클라이언트 컴포넌트는 "use client")
lib/extract/         1단계: 링크 검사, oEmbed, 메타 태그, 캡션 정리, 결과 형식(types.ts)
lib/ai/              (선택) Claude API(claude.ts)·Qwen(qwen.ts) 공통 설정
lib/claims/          주장 추출 — 규칙(rules.ts, 기본) / Claude(extract.ts, 선택)
lib/verify/          근거 검색(naver.ts, kosis.ts, evidence.ts), 판정 — 규칙(rules.ts, 기본) / Claude(judge.ts, 선택) / Qwen 2차 판정(aiJudge.ts, 선택), 결과 형식(types.ts)
public/icons/        PWA 아이콘
docs/                기획서(SPEC.md), 시험 기록(phase1-test.md), 개선 계획, 시험 세트(test-sets/)
scripts/             시험 세트 실행(verify-sample.mjs)
prototypes/jamkkan/  파트너의 별도 시제품 "잠깐!" (본 앱과 따로 동작, 빌드·배포에 안 쓰임)
```
- `prototypes/` 안의 시제품은 본 앱과 섞지 않는다. 시제품의 기능을 본 앱에 옮길 때는 본 앱 구조(`lib/` 등)로 새로 옮기고 PR을 따로 연다.
- 단계 사이의 데이터는 `lib/extract/types.ts`의 `ExtractionResult`, `lib/verify/types.ts`의 `VerifyResponse` 형식으로 주고받는다. 형식을 바꾸면 PR에 적는다.

## 4. 네이밍 & 코드 스타일
- 컴포넌트 파일·이름: PascalCase (`Checker.tsx`). 그 외 파일: camelCase (`metaTag.ts`).
- 변수·함수: camelCase. API 응답 JSON 필드: snake_case (SPEC 6-2 형식 유지).
- import는 `@/` 경로 별칭을 쓴다 (`@/lib/extract`).
- 들여쓰기 2칸, 큰따옴표, 세미콜론. 포매터·린터는 아직 없음 (추가하면 Decisions에 기록).
- 화면 문구는 10대가 읽기 쉬운 한국어 존댓말(해요체).
- 새 의존성은 PROGRESS.md "Decisions"에 이유와 함께 적는다.

## 5. 디자인 토큰
디자인 시스템: **Dark Minimal UI (Blue Accent)** (2026-11-23 적용). 어두운 바탕 + 회색 면 3단계 + 파란색 하나.
- 정의 위치: `app/globals.css`의 `:root`. 항상 어두운 화면 (기기 설정 무시). 밝은 화면 값은 `:root[data-theme="light"]`에 준비만 해 둠
- 바탕·면: `--bg` #121212, `--surface-1` #1c1c1c (카드), `--surface-2` #242424 (입력칸·판정 카드·보조 버튼), `--surface-3` #2a2a2a (눌림·인용문). 깊이는 그림자·테두리 대신 면 밝기로
- 선: `--border` `--border-strong` (입력칸 테두리) `--border-hover`
- 글자: `--text-primary` #fff, `--text-secondary` #a7a7a7 (설명·메타), `--text-disabled` #6b6b6b
- 강조: `--accent` #3d91ff (주 버튼·링크·포커스에만), `--accent-hover` `--accent-pressed`, `--on-accent` #0a0a0a (파란 바탕 위 글자는 흰색 금지)
- 상태: `--error` `--warning` `--success`. 판정 색은 `--verdict-confirmed`(=success) `--verdict-false`(=error) `--verdict-unverified`(=warning) `--verdict-not-target`(=text-secondary)
- 글꼴: `--font` Pretendard (CDN, `app/layout.tsx`) → 못 불러오면 시스템 글꼴. 굵기는 400·600·700만
- 글자 크기: `--title-lg` 28px, `--title-md` 22px, `--title-sm` 18px, `--body` 16px, `--body-sm` 14px, `--caption` 12px (12px 아래 금지)
- 간격: `--space-1` 4px · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-12` 48 (4px 단위)
- 모서리: `--radius-sm` 4px, `--radius-md` 8px (카드·입력칸), `--radius-lg` 12px, `--radius-full` (버튼·알약)
- 높이: `--tap-min` 44px (터치 최소), `--button-lg` 48px
- 버튼: `.button` = 주 버튼(파란색), `.button button-secondary` = 보조(회색). 한 화면의 주 버튼은 되도록 하나
- 판정 이름은 색 + 점 + 글자로 표시 (색만으로 구분하지 않음). 숫자·메타 정보를 배지로 감싸지 않음. 이모지 아이콘·그라데이션 금지
- 화면 폭: 모바일 우선, 본문 최대 560px
- 색이나 크기 값을 코드에 직접 쓰지 말고 토큰을 쓴다. 토큰을 추가·변경하면 이 절도 고친다.

## 6. 협업 규칙 (Claude Code + Codex)
두 사람이 서로 다른 AI 에이전트로 같은 저장소에서 작업한다. 에이전트는 로컬 또는 새 클라우드 환경에서 실행될 수 있다.
저장소가 유일한 공유 기억이다. 커밋되지 않은 것은 상대에게 존재하지 않는다.

### 작업 시작 전
- 최신 `main`에서 시작한다. 로컬이면 `git pull origin main`, 클라우드면 GitHub의 현재 `main`에서 시작한다.
- 코드를 쓰기 전에 AGENTS.md와 PROGRESS.md를 읽는다.
- PROGRESS.md "In Progress"를 확인한다. 상대가 같은 파일을 건드리는 PR을 열어 두었다면 시작하지 말고 사람에게 알린다.
- 새 브랜치 `<owner>/<short-task>`에서 작업한다 (예: `geonhee/login-page`, `partner/main-feed`). `main`에 직접 커밋하지 않는다.

### 작업 중
- PROGRESS.md "Assignments"에 배정된 영역의 파일만 수정한다. 공용 파일(레이아웃, 전역 스타일, 설정, package.json 등)을 고쳐야 하면 명시하고 최소한으로 바꾼다.
- 요청받지 않은 파일을 포맷/이름 변경/정리하지 않는다.
- 새 의존성은 PROGRESS.md "Decisions"에 기록한 뒤 추가한다.
- 작업 하나 = 브랜치 하나 = PR 하나. PR 하나로 끝낼 수 있는 크기로 나눈다.
- 커밋 메시지: `type: short description` (feat, fix, style, refactor, docs, chore).

### 작업 마무리
- 프로젝트가 오류 없이 빌드/실행되는지 확인한다.
- 같은 PR에서 PROGRESS.md를 갱신한다: 작업을 "Done"으로 옮기고, 남은 일과 상대가 알아야 할 결정을 적는다.
- 브랜치를 푸시하고 PR을 연다. PR 설명은 휴대폰/iPad에서 코드 없이 리뷰할 수 있게 쓴다:
  - 무엇이 바뀌었나 (1~3줄, 쉬운 말)
  - 바뀐 파일
  - 동작 확인 방법
  - 상대가 알아야 하거나 결정할 것
- PR을 스스로 머지하지 않는다. 사람이 GitHub에서 리뷰하고 머지한다.
- 공유 브랜치에 force-push하거나 히스토리를 고쳐 쓰지 않는다.

### 머지 순서
- 겹치는 영역에 대해서는 PR을 한 번에 하나만 연다. 앞 PR이 `main`에 머지된 뒤 다음 작업을 시작한다.
- 브랜치 생성 후 `main`이 바뀌어 충돌이 나면 멈추고, 충돌 파일과 양쪽 버전을 사람에게 보여준다. 한쪽을 임의로 고르거나 상대 코드를 지우지 않는다.

### 공유 문서 (저장소 루트)
- AGENTS.md: 프로젝트 규칙 (스택, 구조, 컨벤션, 디자인 토큰)
- CLAUDE.md: AGENTS.md를 가리키는 한 줄
- PROGRESS.md: 배정 / 진행 중 / 완료 / 결정 / 질문
- README.md: 설치와 실행 방법

### 소통
- 작업이 끝날 때마다 무엇을 바꿨는지 쉬운 말로 설명해서 상대에게 전달할 수 있게 한다.
- 사람의 지시가 AGENTS.md와 충돌하면 그 사실을 알리고 어느 쪽을 따를지 묻는다.
