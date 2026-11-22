# 잠깐! (파트너 시제품)

> 이 폴더는 파트너(ronaldo123-23)가 만든 별도 시제품이에요. 원래 브랜치 `geonhee/bilingual-evidence-search`(맨 처음 커밋에서 시작)를 2026-11-23에 이 폴더로 옮겨 합쳤어요. 서비스 본 앱(저장소 맨 위의 Next.js 앱, https://urban-infra-jet.vercel.app)과는 **따로** 동작하고, 본 앱의 빌드·배포에는 쓰이지 않아요.
> - 명령은 모두 **이 폴더 안에서** 실행해요 (`cd prototypes/jamkkan`).
> - 원래 있던 규칙·진행 문서는 `docs/original-*.md`로 옮겼어요. 저장소 전체 규칙은 맨 위 [AGENTS.md](../../AGENTS.md)가 기준이에요.
> - 확인 필요: `worker/verify.js`는 네이버 **검색 결과 웹페이지**(`search.naver.com`)를 직접 읽어요. 본 앱은 기획서의 "비공식 스크래핑 금지"에 따라 네이버 공식 검색 API만 써요. 본 앱으로 옮길 때는 이 부분을 공식 API로 바꿔야 해요.

## 잠깐!

인스타그램 공개 게시물이나 직접 입력한 글을 검증하는 한국어 웹앱입니다. 검증할 주장에 포함된 단어로 한국어와 영어 자료를 검색합니다.

### 실행

Node.js 22 이상이 필요합니다.

```sh
npm run build
npm run dev
```

브라우저에서 http://localhost:5173 을 열고 글을 입력한 뒤 **사실 검증하기**를 누릅니다. 실제 검색과 링크 가져오기에는 인터넷 연결이 필요합니다.

### 확인

```sh
npm run validate
node scripts/test-import.mjs
```

원래 팀 작업 규칙은 [docs/original-AGENTS.md](docs/original-AGENTS.md), 작업 상태는 [docs/original-PROGRESS.md](docs/original-PROGRESS.md)에 있습니다 (지금 기준은 저장소 맨 위 AGENTS.md·PROGRESS.md).
