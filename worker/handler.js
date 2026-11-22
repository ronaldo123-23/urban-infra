const allowedDomains = ['instagram.com','news.naver.com','n.news.naver.com','m.news.naver.com','v.daum.net','yna.co.kr','korea.kr','bbc.com','reuters.com','khan.co.kr','hani.co.kr','donga.com','chosun.com','joongang.co.kr','news.sbs.co.kr','imnews.imbc.com','news.kbs.co.kr','ytn.co.kr'];
class ImportError extends Error { constructor(code,message,status=422){super(message);this.code=code;this.status=status;} }
export function validateUrl(raw){
 let u;try{u=new URL(raw);}catch{throw new ImportError('invalid_url','올바른 게시물 링크를 입력해 주십시오.',400);}
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))throw new ImportError('invalid_url','로그인 정보가 없는 HTTPS 링크만 사용할 수 있습니다.',400);
 const host=u.hostname.toLowerCase();
 if(!allowedDomains.some(d=>host===d||host.endsWith('.'+d)))throw new ImportError('unsupported_domain','현재 인스타그램과 주요 언론사·정부 사이트 링크를 지원합니다. 이 사이트는 본문을 복사해 직접 입력해 주십시오.',400);
 if(host==='instagram.com'||host.endsWith('.instagram.com')){
  if(!/^\/(?:(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+|share\/(?:(?:p|reel)\/)?[A-Za-z0-9_-]+)\/?$/.test(u.pathname))throw new ImportError('unsupported_instagram_url','인스타그램 게시물 또는 릴스의 공유 링크를 넣어 주십시오. 프로필·스토리·DM 링크는 지원하지 않습니다.',400);
  u.hostname='www.instagram.com';u.search='';
  if(!u.pathname.endsWith('/'))u.pathname+='/';
 }
 u.hash='';return u;
}
function decode(s){return s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const x=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return x>0&&x<=0x10ffff?String.fromCodePoint(x):'';}).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[m]);}
function clean(s){return decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<(?:br|\/p|\/div|\/h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();}
function meta(html,key){for(const tag of html.match(/<meta\b[^>]{0,10000}>/gi)||[]){const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[m[1].toLowerCase()]=m[2]??m[3]??m[4];if((attrs.property||attrs.name||'').toLowerCase()===key)return decode(attrs.content||'').trim();}return '';}
function instagramCaption(html){
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try {
   const data=JSON.parse(match[1]);
   const nodes=Array.isArray(data)?data:[data,...(Array.isArray(data?.['@graph'])?data['@graph']:[])];
   for(const node of nodes){
    const types=[node?.['@type']].flat();
    if(!types.some(type=>typeof type==='string'&&/(?:^|\/)(?:SocialMediaPosting|ImageObject|VideoObject)$/.test(type)))continue;
    const caption=node.caption??node.articleBody;
    if(typeof caption==='string'&&caption.trim())return caption.trim();
   }
  }catch{}
 }
 return '';
}
export function extract(html,url){
 const title=meta(html,'og:title')||clean((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
 const description=meta(html,'og:description')||meta(html,'description');
 const isInstagram=new URL(url).hostname.endsWith('instagram.com');
 let text=isInstagram?instagramCaption(html):'',kind=text?'caption':'summary';
 if(!isInstagram){
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
   try{const data=JSON.parse(m[1]);const nodes=Array.isArray(data)?data:[data,...(Array.isArray(data['@graph'])?data['@graph']:[])];for(const n of nodes)if(typeof n.articleBody==='string'&&n.articleBody.length>text.length){text=clean(n.articleBody);kind='article';}}catch{}
  }
  if(!text){const article=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);if(article){const ps=[...article[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>clean(m[1])).filter(t=>t.length>15);if(ps.join('\n').length>80){text=ps.join('\n');kind='article';}}}
 }
 if(!text)text=isInstagram?description.replace(/^[\s\S]{0,280}?\blikes?,\s*[\d,.KMB]+\s+comments?\s*[-–—]\s*[^:]{0,180}:\s*/i,'').replace(/^["“]([\s\S]*)["”]$/,'$1').trim():description;
 const generic=/^(?:Instagram|Instagram photos and videos|Login\s*[•|–-]?\s*Instagram|로그인\s*[•|–-]?\s*Instagram)$/i;
 if(!text||(kind!=='caption'&&text.length<20)||generic.test(text)||(isInstagram&&/^(?:Login|Log in|로그인)\s*[•|–-]?\s*Instagram$/i.test(title))||/^(?:Create an account or log in|Welcome back to Instagram|Sign in to check out|Log in to see|Instagram에 로그인|계정을 만들거나 로그인|Join Instagram)/i.test(text)){
  const login=/accounts\/login|loginform|로그인|Log in|Sign in/i.test(html);
  throw new ImportError(login?'login_required':'no_content',login?'이 페이지는 로그인 화면을 제공하여 게시물 내용을 읽을 수 없습니다. 게시물 본문을 복사해 아래에 붙여넣어 주십시오.':'페이지에서 점검할 본문을 찾지 못했습니다. 이미지·영상 속 글은 읽지 못하므로 본문을 직접 입력해 주십시오.');
 }
 return {title:title.slice(0,300),text:text.slice(0,5000),kind,truncated:text.length>5000,sourceUrl:url,fetchedAt:new Date().toISOString(),notice:kind==='article'?'페이지에서 추출한 텍스트입니다. 광고·관련 문구가 섞이거나 일부 내용이 빠질 수 있으므로 원문과 대조해 주십시오.':kind==='caption'?'페이지에서 공개한 게시물 캡션입니다. 이미지·영상 속 글자와 댓글은 포함되지 않습니다.':'공개된 미리보기 설명만 가져왔습니다. 전체 본문·이미지·영상 내용은 확인하지 않았습니다.'};
}
async function readBounded(response){
 const MAX=1500000;if(Number(response.headers.get('content-length'))>MAX)throw new ImportError('too_large','페이지가 너무 커서 읽지 못했습니다. 본문을 직접 입력해 주십시오.');
 const reader=response.body?.getReader();if(!reader)throw new ImportError('no_content','페이지에 읽을 내용이 없습니다.');const parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX)throw new ImportError('too_large','페이지가 너무 커서 읽지 못했습니다. 본문을 직접 입력해 주십시오.');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}const charset=(response.headers.get('content-type')||'').match(/charset=([\w-]+)/i)?.[1]||'utf-8';try{return new TextDecoder(charset).decode(all);}catch{return new TextDecoder().decode(all);}
}
export async function importUrl(raw,fetcher=fetch){
 let url=validateUrl(raw);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
 try{for(let hop=0;hop<4;hop++){
  const response=await fetcher(url.href,{redirect:'manual',signal:controller.signal,headers:{'User-Agent':'Jamkkan-LinkPreview/1.0','Accept':'text/html,application/xhtml+xml','Accept-Language':'ko,en;q=0.8'}});
  if(response.status>=300&&response.status<400){const dest=response.headers.get('location');await response.body?.cancel().catch(()=>{});if(!dest)throw new ImportError('redirect_failed','페이지 이동 주소를 확인하지 못했습니다.');const next=new URL(dest,url);
   if((next.hostname==='instagram.com'||next.hostname.endsWith('.instagram.com'))&&/^\/accounts\/login(?:\/|$)/.test(next.pathname)){
    throw new ImportError('login_required','인스타그램이 로그인 화면을 제공해 게시물 내용을 읽을 수 없습니다. 게시물 캡션을 복사해 아래에 붙여넣어 주세요.');
   }
   url=validateUrl(next.href);continue;}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new ImportError('upstream_unavailable','대상 사이트가 내용 제공을 거부했거나 게시물에 접근할 수 없습니다. 비공개·삭제·로그인 제한 등의 가능성이 있습니다. 본문을 직접 입력해 주십시오.');}
  if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')||'')){await response.body?.cancel().catch(()=>{});throw new ImportError('unsupported_type','웹페이지 링크만 읽을 수 있습니다. 이미지·영상 파일은 지원하지 않습니다.');}
  const html=await readBounded(response);return extract(html,url.href);
 }throw new ImportError('too_many_redirects','페이지 이동이 많아 내용을 가져오지 못했습니다.');
 }catch(e){if(e instanceof ImportError)throw e;throw new ImportError('fetch_failed',controller.signal.aborted?'사이트 응답 시간이 길어 가져오기를 중단했습니다. 본문을 직접 입력해 주십시오.':'대상 사이트에 연결하지 못했습니다. 잠시 후 다시 시도하거나 본문을 직접 입력해 주십시오.');}finally{clearTimeout(timer);}
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export default {async fetch(request){const path=new URL(request.url).pathname;
 if(path==='/api/verify'){
  if(request.method!=='POST')return json({error:'POST 요청이 필요합니다.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'다른 사이트에서는 요청할 수 없습니다.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON 요청이 필요합니다.'},415);
  try {
   const raw=await readBounded(request);
   if(raw.length>32000)return json({error:'입력이 너무 깁니다.'},413);
   const input=JSON.parse(raw);
   if(typeof input?.text!=='string'||input.text.trim().length<10||input.text.length>5000)return json({error:'확인할 내용을 10~5,000자로 입력해 주세요.'},400);
   return json(await verifyText(input.text.trim(), input.sourceUrl));
  } catch(error){
   if(error instanceof SyntaxError)return json({error:'요청 형식이 올바르지 않습니다.'},400);
   if(error instanceof ImportError)return json({error:error.message},error.status);
   return json({error:'검증을 완료하지 못했습니다. 다시 시도해 주세요.'},500);
  }
 }
 if(path==='/api/import'){
  if(request.method!=='POST')return json({error:'POST 요청이 필요합니다.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'다른 사이트에서는 요청할 수 없습니다.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON 요청이 필요합니다.'},415);
  try{if(Number(request.headers.get('content-length'))>4096)return json({error:'입력 링크가 너무 깁니다.'},413);const raw=await request.text();if(raw.length>4096)return json({error:'입력 링크가 너무 깁니다.'},413);const input=JSON.parse(raw);if(typeof input.url!=='string'||input.url.length>2048)return json({error:'올바른 링크를 입력해 주십시오.'},400);return json(await importUrl(input.url.trim()));}catch(e){if(e instanceof ImportError)return json({error:e.message,code:e.code},e.status);if(e instanceof SyntaxError)return json({error:'요청 형식이 올바르지 않습니다.'},400);return json({error:'내용을 가져오지 못했습니다. 본문을 직접 입력해 주십시오.'},500);}
 }
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
 const asset=assets[path==='/share'?'/':path];if(!asset)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:asset.binary?Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0)):asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
}};
