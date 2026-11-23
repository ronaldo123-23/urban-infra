// 규칙 판정에 쓰는 사전 (docs/IMPROVEMENT_PLAN.md 3-1절).
// - 같은 말: 한국어 표현과 영어 표현을 같은 주제어로 본다 (해외 논문·공식 페이지 대조용)
// - 단위: "48시간" ↔ "48 hours"
// - 대상 충돌: 사람↔동물, 지역, 나라, 나이대
// 사전에 없는 말은 놓친다 → 새 사례가 나오면 여기에 추가한다.

/** 한국어 주제어 → 같은 뜻의 표현들 (영어는 소문자) */
export const SYNONYMS: Record<string, string[]> = {
  // 약·의학
  이부프로펜: ["ibuprofen", "부루펜", "nsaid", "nsaids"],
  나프록센: ["naproxen"],
  디클로페낙: ["diclofenac"],
  소염진통제: ["nsaid", "nsaids", "anti-inflammatory", "비스테로이드성", "소염제"],
  소염제: ["anti-inflammatory", "nsaid", "nsaids", "소염진통제"],
  nsaids: ["nsaid", "anti-inflammatory", "소염진통제", "소염제", "ibuprofen", "이부프로펜"],
  nsaid: ["nsaids", "anti-inflammatory", "소염진통제"],
  진통제: ["painkiller", "painkillers", "analgesic", "analgesics"],
  아세트아미노펜: ["acetaminophen", "paracetamol", "타이레놀"],
  타이레놀: ["acetaminophen", "paracetamol", "아세트아미노펜"],
  신손상: ["kidney injury", "renal injury", "aki", "신장 손상", "콩팥 손상"],
  신부전: ["kidney failure", "renal failure", "콩팥 기능 상실"],
  신장: ["kidney", "kidneys", "renal", "콩팥"],
  탈수: ["dehydration", "dehydrated"],
  염증: ["inflammation", "inflammatory"],
  근육: ["muscle", "muscles"],
  위험: ["risk"],
  복용: ["use", "users", "taking", "dose", "intake"],
  경구: ["oral", "tablets", "tablet", "알약"],
  // 운동·대회
  마라톤: ["marathon"],
  울트라마라톤: ["ultramarathon", "ultramarathons", "ultra-marathon", "ultra marathon"],
  러닝: ["running", "runners", "달리기"],
  참가자: ["participants", "runners", "athletes", "선수"],
  런던: ["london"],
  샤르마: ["sharma"],
  의료: ["medical"],
  가이드: ["guide", "guidance", "advice", "지침", "안내"],
  권고: ["advise", "advice", "recommend", "recommended", "avoid", "권장"],
  책임자: ["director", "lead", "head"],
  대회: ["race", "event", "marathon day"],
  // 연구
  연구: ["study", "trial", "research", "연구진", "연구팀"],
  // 경제·정치
  한국은행: ["한은", "bank of korea"],
  빚: ["부채", "채무", "나랏빚", "나라빚"],
  부채: ["빚", "채무", "나랏빚", "나라빚"],
  금: ["금값", "금 ETF", "금 투자", "gold"],
  무기징역수: ["무기수", "무기징역"],
  인도지원: ["인도적 지원", "대북 지원", "대북지원"],
  가석방: ["가석방"],
  // 기사 제목은 사람 이름을 한 글자로 줄여 쓴다 ("尹 1심 무죄", "李대통령 지지율")
  윤석열: ["尹", "윤 전 대통령"],
  이재명: ["李", "이 대통령"],
  항소심: ["2심"],
  국정운영: ["국정 운영", "국정수행", "국정 수행", "지지율"],
  청원: ["국민청원", "국회청원", "국민동의청원"],
};

/** 단위 → 원문에서 같은 단위로 보는 표현 (숫자 뒤에 붙음) */
export const UNIT_ALIASES: Record<string, string[]> = {
  "%": ["%", "％", "퍼센트", "percent", "per cent"],
  "%p": ["%p", "%포인트", "퍼센트포인트", "포인트", "percentage points"],
  시간: ["시간", "hours", "hour", "hrs", "hr", "h"],
  분: ["분", "minutes", "min"],
  일: ["일", "days", "day"],
  주: ["주", "weeks", "week"],
  년: ["년", "years", "year"],
  명: ["명", "people", "persons", "patients", "participants"],
  배: ["배", "times", "fold"],
  조: ["조원", "조 원", "조"],
  억: ["억원", "억 원", "억"],
  만: ["만원", "만 원", "만명", "만 명", "만"],
  천: ["천명", "천 명", "천"],
  원: ["원"],
  세: ["세", "살", "years old", "aged"],
  km: ["km", "킬로미터", "kilometres", "kilometers"],
};

/** 대상 충돌 그룹: 같은 축 안에서 서로 다른 값이면 충돌 */
export const CONFLICT_AXES: { name: string; groups: string[][] }[] = [
  {
    name: "사람·동물",
    groups: [
      ["강아지", "반려견", "고양이", "반려묘", "반려동물", "동물병원", "수의", "dog", "dogs", "cat", "cats", "pet", "pets", "canine", "feline"],
    ],
  },
  {
    name: "지역",
    groups: [
      ["서울"], ["부산"], ["대구"], ["인천"], ["광주"], ["대전"], ["울산"], ["세종"], ["경기"], ["강원"], ["충북"], ["충남"],
      ["전북"], ["전남"], ["경북"], ["경남"], ["제주"],
    ],
  },
  {
    name: "나라",
    groups: [["한국", "국내"], ["미국"], ["일본"], ["중국"], ["영국"], ["프랑스"], ["독일"], ["북한"], ["대만"], ["베트남"]],
  },
  {
    name: "나이대",
    groups: [["영유아", "유아", "아기"], ["어린이", "아동", "초등학생"], ["청소년", "중학생", "고등학생", "10대"], ["청년", "20대", "30대"], ["노인", "고령자", "어르신", "65세 이상"]],
  },
];

/** 판정에 쓸 만한 공식·학술 도메인 (네이버 웹문서 검색 결과 중 이것만 남긴다) */
export const TRUSTED_DOMAIN_RE =
  /(\.go\.kr|\.or\.kr|\.ac\.kr|\.re\.kr|\.gov(\.[a-z]{2})?|\.edu|\.ac\.uk|who\.int|nhs\.uk|europepmc\.org|ncbi\.nlm\.nih\.gov|doi\.org|kosis\.kr|tcslondonmarathon\.com|londonmarathonevents\.co\.uk)$/i;

/**
 * 게시물이 자주 인용하는 기관의 공식 안내 페이지 목록.
 * 이름이 주장에 나오면 이 페이지들을 직접 읽어 대조한다. (네이버 웹문서 검색으로는 해외 공식 페이지가 잘 안 잡힘)
 */
export const OFFICIAL_SOURCES: { names: string[]; label: string; pages: string[] }[] = [
  {
    names: ["런던 마라톤", "런던마라톤", "london marathon"],
    label: "TCS London Marathon 공식 의료 안내",
    pages: ["https://www.tcslondonmarathon.com/the-event/medical-advice"],
  },
];

/**
 * 행사·프로모션 이름 → 공식 안내 페이지. 게시물이 이 행사를 말하면 페이지를 직접 읽어 대조한다.
 * (PR #14에서 partner가 evidence.ts에 직접 넣었던 도미노피자 사례를 목록으로 옮김)
 */
export const OFFICIAL_EVENT_PAGES: { event: string; label: string; url: string }[] = [
  { event: "1434 피자어택", label: "도미노피자 공식 안내 · 1434 피자어택", url: "https://web.dominos.co.kr/bbs/newsView?idx=3269" },
];

export function expand(word: string): string[] {
  const w = word.toLowerCase();
  return [w, ...(SYNONYMS[word] ?? SYNONYMS[w] ?? [])];
}

/** 한국어 핵심어 → 영어 검색어 (사전에 있는 것만) */
export function englishTerms(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const en = (SYNONYMS[w] ?? SYNONYMS[w.toLowerCase()] ?? []).find((s) => /^[a-z][a-z -]*$/.test(s));
    if (en && !out.includes(en)) out.push(en);
  }
  return out;
}
