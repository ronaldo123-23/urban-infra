# AGENTS.md — 도시인프라 (urban-infra)

이 파일이 프로젝트 규칙의 유일한 기준이다. Claude Code와 Codex 모두 이 파일을 따른다.
규칙을 바꿀 때는 이 파일만 수정하고, PR 설명에 변경 사항을 적는다.

## 1. 프로젝트 개요
- 이름: 도시인프라 (urban-infra)
- 목적: 10대가 인스타그램 게시물 링크를 넣으면 글(캡션)을 읽고, 주장이 사실인지 근거 링크와 함께 알려주는 웹 서비스 (서비스 이름 가칭: "진짜일까?")
- 기획서: [docs/SPEC.md](docs/SPEC.md). 1단계(글 읽기)와 2단계(주장 추출·판정, SPEC 7-1~7-4)를 만든다. SPEC 7-5(OCR, 고령자 화면, 기록 저장·공유)는 아직 만들지 않는다.
- 금지: 인스타 로그인 우회, 비공식 스크래핑 라이브러리, 계정 쿠키 사용.
- 판정 규칙 (SPEC 7-3, 7-4):
  - AI는 우리가 실제로 검색해서 준 출처 번호만 인용한다. 코드에서 다시 검사해, 근거 링크가 없으면 "확인됨"/"거짓으로 밝혀짐"을 "아직 확인 안 됨"으로 바꾼다.
  - "여러 언론사에 나왔다"만으로 확인됨 처리하지 않는다. 제목이 거의 같은 기사(같은 보도자료)는 1개 출처로 묶는다.
  - 게시물 글은 AI에게 데이터로만 넘긴다 (글 안의 지시문을 따르지 않게 프롬프트에 명시).
  - 검증 경로: 통계 주장은 KOSIS + 뉴스, 사실을 섞은 거짓·완전한 거짓은 주장을 문장별로 나눠 각각 네이버 뉴스("팩트체크 + 핵심어"와 일반 검색)로 찾는다.

## 2. 기술 스택
- Next.js (App Router) + TypeScript (strict), React
- 패키지 매니저: npm (`package-lock.json` 커밋)
- 배포: Vercel
- 인스타 요청과 외부 API(Claude, 네이버, KOSIS) 호출은 반드시 서버(`app/api/...`)에서 한다. 브라우저에서 직접 요청하지 않는다 (CORS, 키 노출).
- AI: Claude API (`@anthropic-ai/sdk`), 모델 기본값 `claude-opus-5-5` (`ANTHROPIC_MODEL`로 변경 가능). 결과는 구조화 출력(zod 스키마)으로 받는다.
- 키가 없으면 해당 기능만 꺼지고 나머지는 동작해야 한다 (예: Claude 키가 없으면 관련 기사만 보여줌).
- 비밀 값(토큰)은 `.env.local`과 Vercel 환경변수에만 둔다. 이름과 설명은 `.env.example`에 적는다.

## 3. 폴더 구조
```
app/                 화면(page.tsx, layout.tsx), PWA manifest, 전역 스타일
app/api/extract/     POST /api/extract — 링크 → 추출 결과
app/api/verify/      POST /api/verify — caption_clean → 주장별 판정
components/          화면 컴포넌트 (클라이언트 컴포넌트는 "use client")
lib/extract/         1단계: 링크 검사, oEmbed, 메타 태그, 캡션 정리, 결과 형식(types.ts)
lib/ai/              Claude API 클라이언트 공통 설정
lib/claims/          주장 추출 — caption_clean에서 검증할 주장을 문장 단위로 고른다
lib/verify/          근거 검색(naver.ts, kosis.ts, evidence.ts), 판정(judge.ts), 결과 형식(types.ts)
public/icons/        PWA 아이콘
docs/                기획서(SPEC.md), 시험 기록(phase1-test.md)
```
- 단계 사이의 데이터는 `lib/extract/types.ts`의 `ExtractionResult`, `lib/verify/types.ts`의 `VerifyResponse` 형식으로 주고받는다. 형식을 바꾸면 PR에 적는다.

## 4. 네이밍 & 코드 스타일
- 컴포넌트 파일·이름: PascalCase (`Checker.tsx`). 그 외 파일: camelCase (`metaTag.ts`).
- 변수·함수: camelCase. API 응답 JSON 필드: snake_case (SPEC 6-2 형식 유지).
- import는 `@/` 경로 별칭을 쓴다 (`@/lib/extract`).
- 들여쓰기 2칸, 큰따옴표, 세미콜론. 포매터·린터는 아직 없음 (추가하면 Decisions에 기록).
- 화면 문구는 10대가 읽기 쉬운 한국어 존댓말(해요체).
- 새 의존성은 PROGRESS.md "Decisions"에 이유와 함께 적는다.

## 5. 디자인 토큰
- 정의 위치: `app/globals.css`의 `:root` (다크 모드는 `prefers-color-scheme: dark`에서 같은 이름으로 다시 정의)
- 색: `--color-bg` `--color-surface` `--color-text` `--color-muted` `--color-border` `--color-primary`(#2f5bea) `--color-primary-text` `--color-error-bg` `--color-error-text` `--color-notice-bg`
- 판정 색: `--color-verdict-confirmed`(초록) `--color-verdict-false`(빨강) `--color-verdict-unverified`(노랑) `--color-verdict-not-target`(회색)
- 글꼴: `--font-sans` (시스템 글꼴, 한글은 Apple SD Gothic Neo / Malgun Gothic / Noto Sans KR)
- 글자 크기: `--text-sm` 0.875rem, `--text-md` 1rem, `--text-lg` 1.25rem, `--text-xl` 1.75rem
- 간격: `--space-1` 4px, `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-6` 24px
- 모서리: `--radius` 12px. 버튼·입력칸 최소 높이: `--tap-min` 48px (모바일 터치)
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
