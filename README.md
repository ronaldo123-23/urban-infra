# urban-infra
도시인프라

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

팀 작업 규칙은 [AGENTS.md](AGENTS.md), 작업 상태는 [PROGRESS.md](PROGRESS.md)에 있습니다.
