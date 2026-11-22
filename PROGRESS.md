# PROGRESS

## Assignments
- geonhee: 1·2단계 코드 전체 — `app/`, `app/api/`, `components/`, `lib/`, `public/`, `docs/SPEC.md`
- partner (GitHub: `ronaldo123-23`): 리뷰, 공개 게시물 20개 시험 (`docs/phase1-test.md` 기록)

## In Progress
- [partner] 1단계 시험: 공개 게시물 20개로 추출 결과 기록 (`docs/phase1-test.md`) — 1/20 기록됨 (geonhee가 1개 시험)
- [geonhee] KOSIS 키 받아서 통계 대조 시험 (코드는 2단계 PR에 들어 있음, 실제 키로 응답 형식 확인 전)
- [geonhee] 개선 PR A: 주장 고르기와 보류 이유 (`docs/IMPROVEMENT_PLAN.md` 3절), `geonhee/claim-selection`, https://github.com/sten5891-code/urban-infra/pull/6 — PR #5 위에 쌓은 브랜치 (#5 먼저 머지)
- [geonhee] 개선 PR B: 원문 찾기와 대조 — PR A 머지 후 시작

## Done
- [geonhee] 초기 구성 파일 추가 (AGENTS.md, CLAUDE.md, PROGRESS.md, README.md), 2026-11-22, https://github.com/sten5891-code/urban-infra/pull/1
- [geonhee] 1단계 글 읽기 프로토타입 (링크 입력 → oEmbed/메타 태그/직접 붙여넣기, PWA 공유 대상), 2026-11-22, https://github.com/sten5891-code/urban-infra/pull/3
- [geonhee] 2단계 판정 기능 (규칙으로 주장 추출·판정, 네이버 뉴스 팩트체크 검색, KOSIS 연동 코드, Claude 경로는 꺼 둠), 2026-11-22, https://github.com/sten5891-code/urban-infra/pull/4
- [geonhee] Vercel 배포 — 공개 주소 https://urban-infra-jet.vercel.app (로그인 없이 열림). 배포본에서 인스타 글 읽기(메타 태그, 캡션 전체)와 판정(네이버 검색) 동작 확인, 2026-11-22

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
- 2026-11-22: PR #3, PR #4도 geonhee의 직접 지시로 Claude가 머지함 (같은 예외).
- 2026-11-22: 1단계 20개 시험이 끝나기 전에 2단계(판정)를 시작함 (geonhee 결정). 메타 태그 방식은 공개 게시물 1개에서 캡션 전체를 읽는 것을 확인함.
- 2026-11-22: Claude API는 유료라 쓰지 않기로 함 (geonhee 결정). 기본은 규칙 판정: 팩트체크 기사가 반박 표현 + 핵심어 절반 이상 일치일 때만 "거짓으로 밝혀짐", "확인됨"은 규칙으로 내지 않음.
- 2026-11-22: 먼저 만든 Claude 판정 코드는 꺼 둔 채로 남김 (`ANTHROPIC_API_KEY`가 있을 때만 켜짐, 모델 `claude-opus-5-5`, 거절 시 server-side fallback). 지금은 요금이 나오지 않음.
- 2026-11-22: "사실을 섞은 거짓"도 문장별로 나눈 뒤 각각 언론사 팩트체크 기사 검색으로 확인함 (SPEC 7-2 표에 반영).
- 2026-11-22: 의존성 추가 — `@anthropic-ai/sdk` (Claude API 공식 SDK), `zod` (AI 응답 형식을 스키마로 강제·검사). 둘 다 꺼 둔 Claude 경로에서만 쓰임.
- 2026-11-22: 판정은 사용자가 "판정하기"를 눌러야 실행함 (검색 API 호출 횟수를 아끼려고 자동 실행 안 함).
- 2026-11-22: 같은 보도자료 받아쓰기는 제목 단어가 60% 이상 겹치면 같은 기사로 묶어 1개 출처로 셈.
- 2026-11-22: 네이버 API HUB 키로 실제 판정 시험함. 팩트체크된 소문 3개(동물카페 전부 폐업, 정부 해외주식 강제매각, 스타벅스 박근혜·전두환 이벤트)가 해당 팩트체크 기사를 근거로 "거짓으로 밝혀짐", 일반 사실 문장은 "아직 확인 안 됨" + 관련 기사. 시험 중 엉뚱한 기사로 "거짓"이 나온 경우가 있어, 거짓 판정은 기사 제목에 주장 핵심어(숫자·날짜 제외) 2개 이상일 때만 내도록 엄격하게 바꿈.
- 2026-11-22: 네이버 검색 API가 네이버 클라우드 "NAVER API HUB"로 이관됨 (종량제, 현재 한시적 무료, 검색 전체 월 최대 775,000건, 유료 전환 시 사전 공지). 주소·키 방식이 바뀌어 코드가 두 방식을 모두 지원하게 함: API HUB(`NAVER_HUB_KEY_ID`/`NAVER_HUB_KEY`, 우선) 또는 개발자센터(`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`).
- 2026-11-22: Vercel 배포는 geonhee 계정(Hobby, 무료)으로 함. `main`에 머지하면 자동으로 다시 배포됨. 환경변수(네이버 키)는 Vercel 프로젝트 Settings → Environment Variables에 있음.
- 2026-11-22: 공유할 주소는 고정 주소 `urban-infra-jet.vercel.app`만 씀. 배포마다 바뀌는 주소(`urban-infra-xxxx-geonhee.vercel.app`)는 Vercel 기본 보호 때문에 팀원 로그인이 필요함. `urban-infra.vercel.app`은 다른 사람의 사이트이니 쓰지 않음.

- 2026-11-22: 파트너(Codex) 계획서와 geonhee(Claude) 분석을 합쳐 `docs/IMPROVEMENT_PLAN.md`로 정리함. "여러 언론사 보도 = 보도로 확인됨" 단계는 SPEC 7-3과 충돌해 하지 않기로 함 (원문 대조 방식으로 대신).
- 2026-11-22: 주장 고르기를 "앞에서 5개"에서 "캡션 전체를 우선순위(수치 +3, 출처 +3, 날짜 +1, '~할 수 있습니다' -1)로 정렬해 5개씩"으로 바꿈. 마라톤 게시물에서 48시간·18% 주장이 1·2순위로 들어옴.
- 2026-11-22: 검증 API에 `offset`(요청), `total_checkable`·`next_offset`·`skipped`·`hold_reason`(응답)을 추가함. Claude 경로는 묶음 나누기 없이 최대 5개 그대로.

## Open Questions
- 판정 이름 "거짓으로 밝혀짐"을 Codex 계획서처럼 "근거와 다름"으로 바꿀까? (PR B에서 정하기)
- 원문 가져오기는 공개 페이지만, 막히면 보류로 할까? (PR B)
- 파트너의 브랜치 이름 접두어는? (`partner/` 대신 쓸 이름)
- 규칙 판정은 "확인됨"을 못 내고 "거짓"도 팩트체크 기사 제목·요약에만 의존함. 나중에 무료 AI나 다른 방법을 쓸까?
- 네이버 API HUB 유료 전환 후 단가와 카드 등록 필요 여부는 공식 문서에서 확인 못 함. 유료가 되면 계속 쓸까?
- KOSIS는 통계표 검색 + 최신 수치 일부만 가져옴. 실제 키로 시험 전이라 응답 형식이 맞는지 확인 필요.
- 메타 태그 방식이 잘 안 되는 게시물이 많으면 Meta oEmbed 앱 신청을 할까?
- 공개 주소라 누구나 쓰면 네이버 검색 한도를 같이 씀. 널리 알리기 전에 사용 횟수 제한을 넣을까?
- 안드로이드 PWA 공유 목록은 이제 배포 주소로 시험 가능. 누가 안드로이드 폰으로 시험할까?
- 서비스 이름을 "진짜일까?"(가칭)로 계속 쓸까?
