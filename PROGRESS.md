# PROGRESS

## Assignments
- geonhee: 1단계 전체 — `app/`, `app/api/`, `components/`, `lib/extract/`, `public/`, `docs/`
- partner (GitHub: `ronaldo123-23`): 1단계 리뷰, 공개 게시물 20개 시험 (`docs/phase1-test.md` 기록)

## In Progress
- [partner] 1단계 시험: 공개 게시물 20개로 추출 결과 기록 (`docs/phase1-test.md`) — 1단계 PR 머지 후 시작

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

## Open Questions
- 파트너의 브랜치 이름 접두어는? (`partner/` 대신 쓸 이름)
- 메타 태그 방식이 실제 공개 게시물에서 캡션을 주는지 아직 확인 못 함 (진짜 게시물 링크로 시험 필요). 잘 안 되면 Meta oEmbed 앱 신청을 할까?
- Vercel 배포는 누구 계정으로 할까? (PWA 공유 기능은 https 배포본에서만 시험 가능)
- 서비스 이름을 "진짜일까?"(가칭)로 계속 쓸까?
