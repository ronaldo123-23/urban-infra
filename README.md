# urban-infra
도시인프라 — 인스타그램 게시물 사실 확인 서비스 "진짜일까?" (기획: [docs/SPEC.md](docs/SPEC.md))

지금은 1단계: 인스타 게시물 링크를 넣으면 글(캡션)을 읽어서 보여준다. 판정 기능은 아직 없다.

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

## 시험
1단계 통과 기준과 기록 표: [docs/phase1-test.md](docs/phase1-test.md)

## 협업
작업 규칙은 [AGENTS.md](AGENTS.md), 진행 상황은 [PROGRESS.md](PROGRESS.md)를 본다.
