# PROGRESS

## Assignments
- geonhee: 1·2단계 코드 전체 — `app/`, `app/api/`, `components/`, `lib/`, `public/`, `docs/SPEC.md`
- partner (GitHub: `ronaldo123-23`): 리뷰, 공개 게시물 20개 시험 (`docs/phase1-test.md` 기록)

## In Progress
- [partner] 1단계 시험: 공개 게시물 20개로 추출 결과 기록 (`docs/phase1-test.md`) — 1/20 기록됨 (geonhee가 1개 시험)
- [geonhee] 2단계 판정 기능, `geonhee/phase2-verdict`

## Done
- [geonhee] 초기 구성 파일 추가 (AGENTS.md, CLAUDE.md, PROGRESS.md, README.md), 2026-11-22, https://github.com/sten5891-code/urban-infra/pull/1
- [geonhee] 1단계 글 읽기 프로토타입 (링크 입력 → oEmbed/메타 태그/직접 붙여넣기, PWA 공유 대상), 2026-11-22, https://github.com/sten5891-code/urban-infra/pull/3

## Decisions
- 2026-11-22: 저장소 이름은 `urban-infra`(Public)로 정함. GitHub 저장소 이름에 한글을 쓸 수 없어서, 한글 이름 "도시인프라"는 설명과 README에 씀.
- 2026-11-22: 프로젝트 규칙은 AGENTS.md 한 곳에서만 관리함. CLAUDE.md는 AGENTS.md를 가리키기만 함.
- 2026-11-22: 파트너 `ronaldo123-23`을 저장소 공동 작업자(write 권한)로 추가함.
- 2026-11-22: PR #1은 geonhee의 직접 지시로 Claude가 머지함 ("스스로 머지하지 않는다" 규칙의 1회 예외).
- 2026-11-22: 기술 스택은 기획서대로 Next.js(App Router) + TypeScript + Vercel, 패키지 매니저는 npm. 자세한 건 AGENTS.md 2~5절.
- 2026-11-22: 의존성 — `next`, `react`, `react-dom` (앱), `typescript@5`, `@types/node`, `@types/react`, `@types/react-dom` (개발용). TypeScript 7은 Next.js 빌드와 호환이 확실하지 않아 5로 고정. HTML 파싱·스타일 라이브러리는 쓰지 않음 (메타 태그만 읽으면 돼서 직접 구현).
- 2026-11-22: Meta oEmbed 앱·토큰은 아직 없음. 코드는 넣어 두고 `META_OEMBED_TOKEN`이 없으면 건너뛰고 이유만 기록함.
- 2026-11-22: 메타 태그 요청은 자기 이름을 밝힌 User-Agent(`urban-infra-factcheck/0.1`)로 보냄. 브라우저인 척하지 않음. 인스타가 이 요청에 캡션을 안 주면 직접 붙여넣기로 넘어감.
- 2026-11-22: API 응답은 SPEC 6-2 형식(`result`)에 시도 기록(`attempts`), 수동 입력 필요 여부(`needs_manual`), 게시물 종류(`post_type`)를 덧붙임.
- 2026-11-22: PR #3도 geonhee의 직접 지시로 Claude가 머지함 (같은 예외).
- 2026-11-22: 1단계 20개 시험이 끝나기 전에 2단계(판정)를 시작함 (geonhee 결정). 메타 태그 방식은 공개 게시물 1개에서 캡션 전체를 읽는 것을 확인함.
- 2026-11-22: 판정에 Claude API 사용 (모델 `claude-opus-5-5`). 주장 추출은 effort low, 판정은 effort medium. 안전 분류기가 거절하면 서버가 다른 모델로 재시도하는 server-side fallback(`fallbacks: "default"`)을 켜 둠.
- 2026-11-22: "사실을 섞은 거짓"도 문장별로 나눈 뒤 각각 언론사 팩트체크 기사 검색으로 확인함 (SPEC 7-2 표에 반영).
- 2026-11-22: 의존성 추가 — `@anthropic-ai/sdk` (Claude API 공식 SDK), `zod` (AI 응답 형식을 스키마로 강제·검사).
- 2026-11-22: 판정은 사용자가 "판정하기"를 눌러야 실행함 (Claude 요금이 나오므로 자동 실행 안 함).
- 2026-11-22: 같은 보도자료 받아쓰기는 제목 단어가 60% 이상 겹치면 같은 기사로 묶어 1개 출처로 셈.

## Open Questions
- 파트너의 브랜치 이름 접두어는? (`partner/` 대신 쓸 이름)
- Anthropic API 키(요금 결제)는 누구 계정으로 만들까? 키가 없으면 판정 없이 관련 기사만 보여줌.
- KOSIS는 통계표 검색 + 최신 수치 일부만 가져옴. 실제 키로 시험 전이라 응답 형식이 맞는지 확인 필요.
- 메타 태그 방식이 잘 안 되는 게시물이 많으면 Meta oEmbed 앱 신청을 할까?
- Vercel 배포는 누구 계정으로 할까? (PWA 공유 기능은 https 배포본에서만 시험 가능)
- 서비스 이름을 "진짜일까?"(가칭)로 계속 쓸까?
