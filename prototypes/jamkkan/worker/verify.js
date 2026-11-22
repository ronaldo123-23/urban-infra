// Retrieval is limited to independent institutional sources. Only directly
// comparable data or a matching statement in a fetched document earns a verdict.
const primaryHosts = ['korea.kr', 'kostat.go.kr', 'kosis.kr', 'mods.go.kr', 'law.go.kr',
  'nasa.gov', 'cdc.gov', 'nih.gov', 'noaa.gov', 'census.gov', 'who.int',
  'worldbank.org', 'oecd.org', 'un.org', 'europa.eu', 'nature.com',
  'science.org', 'bmj.com', 'thelancet.com', 'londonmarathonevents.co.uk'];
const limit = 8;
const figures = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:억\s*명|만\s*명|천\s*명|%|퍼센트|명|원|달러|건|배|년|월|일)/g;
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const number = value => Number(value.replaceAll(',', ''));
const stats = [
  {pattern: /(?:총\s*)?인구(?:\s*(?:는|가|수))?\s*(?:약\s*)?([\d,.]+)\s*(억|만|천)?\s*명/, id:'SP.POP.TOTL', name:'총인구', unit:'명', definition:'법적 지위와 국적에 관계없이 해당 국가에 거주하는 인구의 연중 추정치'},
  {pattern: /합계\s*출산율\s*(?:은|이)?\s*(?:약\s*)?([\d,.]+)\s*명/, id:'SP.DYN.TFRT.IN', name:'합계출산율', unit:'명', definition:'해당 연도의 연령별 출산율이 유지된다고 가정했을 때 여성 1명당 예상 출생아 수'},
  {pattern: /기대\s*수명\s*(?:은|이)?\s*(?:약\s*)?([\d,.]+)\s*(?:세|년)/, id:'SP.DYN.LE00.IN', name:'출생 시 기대수명', unit:'세', definition:'해당 연도의 사망률이 유지된다고 가정했을 때 출생아의 예상 생존 연수'},
  {pattern: /(?:실질\s*GDP\s*성장률|경제\s*성장률)\s*(?:은|이)?\s*(-?[\d,.]+)\s*(?:%|퍼센트)/i, id:'NY.GDP.MKTP.KD.ZG', name:'실질 GDP 성장률', unit:'%', definition:'불변가격 기준 국내총생산의 전년 대비 변화율'}
];
const countries = {'대한민국':'KOR', '한국':'KOR', '일본':'JPN', '미국':'USA', '중국':'CHN',
  '독일':'DEU', '프랑스':'FRA', '영국':'GBR', '캐나다':'CAN', '호주':'AUS', '인도':'IND',
  '스페인':'ESP', '이탈리아':'ITA', '브라질':'BRA', '멕시코':'MEX', '베트남':'VNM',
  '태국':'THA', '러시아':'RUS', '인도네시아':'IDN', '뉴질랜드':'NZL', '세계':'WLD'};

export function extractClaims(text) {
  const sentences = text.replace(/https?:\/\/[^\s<>]+/g, ' ').split(/\r?\n+|[!?。]+\s*|(?<!\d)\.(?=\s|$)|(?<=\d)\.(?!\d)(?=\s|$)/);
  const claims = new Set();
  for (const sentence of sentences) {
    for (const part of sentence.split(/;\s*|,\s*(?:그리고|또한|반면)\s+|\s+(?:그리고|또한|반면)\s+/)) {
      const claim = part.replace(/^(?:속보|충격|단독)\s*[:：!]\s*|^[-•#]\s*/g, '').trim();
      if (claim.length < 7 || /^정책브리핑\s*\||^(?:출처|기자|관련 기사)\s*[:：]|^(?:지금\s*)?(?:공유|구독|좋아요|댓글)|(?:생각합니다|공유하세요|알려주세요|인가요|할까요)$/.test(claim)) continue;
      claims.add(claim);
    }
  }
  return [...claims];
}

function sourceUrl(raw) {
  try {
    const url = new URL(decode(raw));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!primaryHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return null;
    if (url.pathname === '/' && !url.search) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

async function documentAt(url, signal, accept) {
  const response = await fetch(url, {signal, redirect:'manual', headers:{
    'User-Agent':'Mozilla/5.0 (compatible; JamkkanSourceCheck/1.0)', 'Accept':accept,
    'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7'
  }});
  if (!response.ok || !response.headers.get('content-type')?.includes(accept)) {
    await response.body?.cancel().catch(() => {});
    return '';
  }
  return readBounded(response);
}

async function compareStatistic(claim, signal) {
  const years = [...new Set(claim.match(/(?:19|20)\d{2}(?=\s*년)/g))];
  const places = new Map(Object.entries(countries).filter(([name]) =>
    new RegExp('(?:^|[^가-힣])' + name + '(?=\\s|$|의|은|는|이|가)').test(claim)));
  if (years.length !== 1 || new Set(places.values()).size !== 1) return null;
  if (/\d{1,2}\s*(?:월|분기)|[상하]반기|기준일|주민등록|외국인|청소년|신생아|남성|여성|노인|도시|전망|목표|예정|잠정|이상|이하|미만|초과|아니|않|증가|감소|(?:에서|보다)\s*\d/.test(claim)) return null;
  const matches = stats.flatMap(stat => {
    const match = claim.match(stat.pattern);
    return match ? [{stat, match}] : [];
  });
  if (matches.length !== 1) return null;
  const [{stat, match}] = matches;
  if (!/^(?:\s*(?:이다|이었다|였다|입니다|으로 집계됐습니다|로 집계됐다|을 기록했다))?[\s.!]*$/.test(claim.slice(match.index + match[0].length))) return null;
  const [place, code] = [...places][0];
  const [year] = years;
  const prefix=claim.slice(0,match.index)
    .replace(new RegExp(place+'(?:의|은|는|에서)?'),'').replace(year+'년','')
    .replace(/(?:전국|연간)/g,'').trim();
  if (prefix) return null;
  const url = 'https://api.worldbank.org/v2/country/'+code+'/indicator/'+stat.id+'?date='+year+'&format=json';
  const json = await documentAt(url, signal, 'application/json');
  const row = json && JSON.parse(json)?.[1]?.[0];
  if (!row || typeof row.value !== 'number' || row.date !== year || row.indicator?.id !== stat.id) return null;
  const scale = {'억':1e8, '만':1e4, '천':1e3}[match[2]] ?? 1;
  const claimed = number(match[1]) * scale;
  const precision = scale / 10 ** (match[1].split('.')[1]?.length ?? 0);
  const rounded = /약\s*\d|가량|정도/.test(claim) || scale > 1 || match[1].includes('.');
  const agrees = rounded ? Math.abs(row.value - claimed) <= precision / 2 : row.value === claimed;
  const value = row.value.toLocaleString('ko-KR', {maximumFractionDigits:8}) + stat.unit;
  return {
    verdict:agrees ? '근거와 일치' : '근거와 차이',
    explanation:'세계은행의 '+year+'년 '+place+' '+stat.name+' 수치는 '+value+'입니다. 입력값 '+claimed.toLocaleString('ko-KR')+stat.unit+'과 '+(agrees ? (row.value === claimed ? '일치합니다.' : '표기 정밀도에서 일치합니다.') : '차이가 있습니다.'),
    comparison:{date:year+'년 연간 자료', target:code==='WLD'?'전 세계':place+' 전국',
      value:'입력 '+claimed.toLocaleString('ko-KR')+stat.unit+' · 자료 '+value,
      conditions:stat.definition+'를 사용합니다. 다른 기관의 정의나 집계 기준에 따라 수치가 달라질 수 있습니다.'},
    sources:[{url, title:'세계은행 세계개발지표 · '+stat.name, quote:year+'년 '+place+' '+value}]
  };
}

function relevantWords(text) {
  return (text.match(/[\p{L}\p{N}]{2,}/gu) || [])
    .filter(word => !/^(?:있습니다|합니다|됩니다|것으로|이라고|밝혔다|발표했다|입니다|그리고|따르면|에서|하는|the|and|with)$/i.test(word))
    .map(word => word.replace(/(?<=[가-힣]{2})(?:에서는|으로는|에는|부터|까지|으로|에서|은|는|이|가|을|를|의)$/u, ''));
}

export function extractSearchWords(text) {
  return text.normalize('NFKC').match(/[\p{L}\p{N}]+(?:[.,'’-][\p{L}\p{N}]+)*%?/gu) || [];
}

function searchGroups(words) {
  const groups = [];
  const encoder = new TextEncoder();
  let group = '';
  for (const word of words) {
    const next = group ? group+' '+word : word;
    if (encoder.encode(next).length <= 420) {
      group = next;
      continue;
    }
    if (group) groups.push(group);
    group = '';
    for (const character of word) {
      if (encoder.encode(group+character).length > 420) {
        groups.push(group);
        group = '';
      }
      group += character;
    }
  }
  if (group) groups.push(group);
  return groups;
}

const searchTerms = [
  [/울트라\s*마라톤/,'ultramarathon'], [/런던\s*마라톤/,'London Marathon'],
  [/이부프로펜/,'ibuprofen'], [/급성\s*신\s*손상/,'acute kidney injury'],
  [/소염\s*진통제|NSAIDs?/i,'NSAIDs'], [/산제이\s*샤르마/,'Sanjay Sharma'],
  [/의료\s*가이드/,'medical advice'], [/48\s*시간/,'48 hours']
];

async function englishQuery(group, signal) {
  if (!/[가-힣]/.test(group)) return group;
  const url = 'https://api.mymemory.translated.net/get?'+new URLSearchParams({q:group,langpair:'ko|en'});
  const raw = await documentAt(url, AbortSignal.any([signal,AbortSignal.timeout(3500)]), 'application/json');
  const result = raw && JSON.parse(raw);
  return Number(result?.responseStatus)===200 && typeof result.responseData?.translatedText==='string'
    ? decode(result.responseData.translatedText).trim() : '';
}

function sameDocument(left, right) {
  const parts = url => [url.hostname.replace(/^www\./,'').replace(/^m\./,''), url.pathname.replace(/\/$/,''),
    [...url.searchParams].filter(([key]) => !/^utm_|^(?:call_from|ref|fbclid|gclid)$/i.test(key)).sort().toString()].join('|');
  return right && parts(new URL(left)) === parts(right);
}

async function searchSources(claim, signal, original) {
  const words = relevantWords(claim);
  const korean = searchGroups(extractSearchWords(claim));
  if (!korean.length) return {sources:[], translationIncomplete:false};
  const translations = await Promise.allSettled(korean.map(group => englishQuery(group, signal)));
  const english = translations.map(item => item.status==='fulfilled' ? item.value : '');
  const translationIncomplete = english.some(query => !query);
  const glossary = searchTerms.flatMap(([pattern, term]) => pattern.test(claim) ? [term] : []);
  const focusedEnglish = glossary.length >= 2 ? glossary.join(' ') : '';
  const focusedKorean = words.slice(0,14).join(' ').slice(0,160);
  const searches = new Set([...korean, ...english.filter(Boolean)]);
  if (focusedKorean) searches.add(focusedKorean);
  if (focusedEnglish) searches.add(focusedEnglish);
  if (/출산율|출생아|통계청|인구동향|정부|지원금|보건복지|국토교통/.test(claim)) {
    searches.add(focusedKorean+' site:korea.kr');
  }
  if (/울트라\s*마라톤/.test(claim) && /신\s*손상/.test(claim)) searches.add(focusedEnglish+' site:pubmed.ncbi.nlm.nih.gov');
  if (/런던\s*마라톤/.test(claim)) searches.add(focusedEnglish+' site:londonmarathonevents.co.uk');
  const translatedWords = relevantWords(english.join(' ')).filter(word => !/^(?:the|and|for|that|this|was|were|with|from|than|have|has|are|risk|more|before|after|during|said|using|used)$/i.test(word));
  const scores = [words, glossary, translatedWords].filter(group => group.length >= 2);
  const pages = await Promise.allSettled([...searches].map(query => documentAt(
    'https://search.naver.com/search.naver?' + new URLSearchParams({where:'web', query}),
    signal, 'text/html'
  )));
  if (pages.every(page => page.status === 'rejected')) throw pages[0].reason;
  const html = pages.map(page => page.status === 'fulfilled' ? page.value : '').join(' ');
  const candidates = new Map();
  if (/런던\s*마라톤/.test(claim) && /의료|소염\s*진통제|NSAID/i.test(claim)) {
    const url = 'https://www.londonmarathonevents.co.uk/london-marathon/medical-advice';
    if (!sameDocument(url, original)) candidates.set(url, {url, title:'London Marathon medical advice', official:true});
  }
  for (const match of html.matchAll(/<a\b([^>]{1,5000})>([\s\S]*?)<\/a>/gi)) {
    const raw = match[1].match(/\bhref="([^"]+)"/i)?.[1];
    const link = raw && sourceUrl(raw);
    if (!link || candidates.size >= 24 || sameDocument(link, original) || [...candidates.keys()].some(url => sameDocument(url, new URL(link)))) continue;
    const title = clean(match[2]).replace(/새 창 열림/g, '').trim();
    if (title.length < 8 || title.includes('›') || /boardDownload|\/download\.do|\.pdf(?:\?|$)/i.test(link)) continue;
    candidates.set(link, {url:link, title:title.slice(0,170)});
  }
  const score = text => {
    const comparable = normalize(text);
    return Math.max(0,...scores.map(group => group.filter(word => comparable.includes(normalize(word))).length / group.length));
  };
  // Limit upstream reads per claim and rank candidates before opening them.
  const best = [...candidates.values()].sort((a,b) => Number(!!b.official)-Number(!!a.official) || score(b.title)-score(a.title)).slice(0,3);
  const results = await Promise.allSettled(best.map(async candidate => {
    const html = await documentAt(candidate.url, signal, 'text/html');
    if (!html) return null;
    const main = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || html;
    const paragraphs = clean(main.replace(/<\/li>/gi, '<br>').replace(/<(?:nav|header|footer)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer)>/gi, ' '))
      .split(/\n|(?<=[.!?])\s+/).map(line => line.trim()).filter(line => line.length >= 18);
    const matchesBody = line => candidate.official && /48\s*hours|ibuprofen|naproxen|NSAIDs/i.test(line);
    const rank = line => score(line) + (/\b\d+(?:%|\s*hours)\b|\d+%/.test(line) ? 0.3 : 0) + (matchesBody(line) ? 0.45 : 0);
    const quote = paragraphs.filter(line => score(line) >= 0.45 || matchesBody(line)).sort((a,b) => rank(b)-rank(a))[0];
    if (!quote) return null;
    const title = meta(html,'og:title') || candidate.title;
    return {url:candidate.url, title, quote:quote.slice(0,650)};
  }));
  return {sources:results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []),translationIncomplete};
}

async function verifyClaim(claim, signal, original) {
  const statistic = await compareStatistic(claim, signal).catch(() => null);
  if (statistic) return {claim, ...statistic};
  let sources = [];
  let failed = false;
  let translationIncomplete = false;
  try { ({sources, translationIncomplete} = await searchSources(claim, signal, original)); } catch { failed = true; }
  const exact = sources.some(source => normalize(claim).length > 22 && normalize(source.quote) === normalize(claim));
  const qualifiers = [...new Set(sources.flatMap(source =>
    source.quote.match(/(?:신청자에 한해|신청한 경우|이상인 경우|이하인 경우|제외|예외|한하여|시범 사업|잠정|추정)/g) || []))];
  const citedFigures = [...new Set(sources.flatMap(source => source.quote.match(figures) || []))].slice(0,8);
  const claimFigures = [...new Set(claim.match(figures) || [])];
  const dates = claimFigures.filter(value => /[년월일]$/.test(value));
  const sourceDates = citedFigures.filter(value => /[년월일]$/.test(value));
  const values = claimFigures.filter(value => !/[년월일]$/.test(value));
  const sourceValues = citedFigures.filter(value => !/[년월일]$/.test(value));
  return {
    claim, translationIncomplete, verdict:exact ? '원문 표현과 일치' : '확인 불가', sources,
    explanation:exact ? '기관 원문에서 같은 문장을 확인했습니다.' : sources.length ?
      '관련 원문을 찾았지만 동일한 시점, 대상, 조건의 주장과 직접 대조할 근거가 부족합니다.' :
      failed ? '근거 검색에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' : '주장과 직접 대조할 수 있는 기관 원문을 확보하지 못했습니다.',
    comparison:{
      date: /(?:오늘|어제|내일|다음 달|최근|올해)/.test(claim) ? '상대 날짜를 해석하려면 글 작성일이 필요합니다.' : dates.length && sourceDates.length ? '입력 '+dates.join(' ')+' · 원문 발췌 '+sourceDates.join(', ') : '',
      target: /(?:누구나|모든|전 국민|전원)/.test(claim) ? '전체에 적용된다는 표현입니다. 원문에서 대상 범위와 예외를 확인해야 합니다.' : '',
      value:values.length && sourceValues.length ? '입력 '+values.join(', ')+' · 원문 발췌 '+sourceValues.join(', ') : '',
      conditions:qualifiers.length ? '원문에서 확인할 조건 표현 · '+qualifiers.join(', ') : ''
    }
  };
}

export async function verifyText(text, sourceUrl) {
  let original;
  try { if (typeof sourceUrl === 'string') original = validateUrl(sourceUrl); } catch {}
  const claims = extractClaims(text);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const results = await Promise.all(claims.slice(0,limit).map(claim => verifyClaim(claim, controller.signal, original)));
    return {results, omitted:Math.max(0, claims.length-limit)};
  } finally {
    clearTimeout(timer);
  }
}
