import {sharedInstagramUrl} from '/share.js';
'use strict';
const $=id=>document.getElementById(id);
const examples={context:{text:'속보! 다음 달부터 모든 대학생에게 생활비 100만 원 지급! 대학생이면 누구나 받을 수 있습니다. 놓치지 말고 친구에게 공유하세요!',status:'맥락 확인 필요',theme:'',reason:'가상 원문에는 거주 지역과 소득 조건이 있습니다. 게시물은 이 조건을 빼고 대상을 모든 대학생으로 넓혔습니다.',source:'가상시 대학생 생활지원 공고',original:'2027년 1월부터 가상시에 1년 이상 거주한 대학생 중 소득 기준을 충족한 신청자에게 생활비 100만 원을 1회 지급한다.',findings:[['대상 조건 누락','“모든 대학생”이라는 표현은 거주·소득 조건을 반영하지 않았습니다.'],['시점 불명확','“다음 달”을 해석하려면 게시물 작성 날짜가 필요합니다.']]},match:{text:'가상시립도서관은 2027년 1월 2일부터 1월 31일까지 평일 운영시간을 오후 8시에서 오후 10시로 연장합니다. 주말은 기존 운영시간을 유지합니다. 출처: 가상시립도서관 겨울방학 운영 안내.',status:'근거와 일치',theme:'good',reason:'제공된 가상 원문과 기간, 평일 운영시간, 주말 예외가 일치합니다. 이 비교는 아래 가상 원문에 한정됩니다.',source:'가상시립도서관 겨울방학 운영 안내',original:'2027년 1월 2일~1월 31일 평일 운영 종료시간을 20시에서 22시로 변경한다. 주말 운영시간은 변경하지 않는다.',findings:[['기간과 시간 일치','원문에 있는 적용 기간과 평일 종료시간이 반영되었습니다.'],['예외 조건 포함','주말은 변경하지 않는다는 조건도 함께 전달했습니다.']]},false:{text:'가상시가 발표했습니다! 2027년 1월부터 시내버스 기본요금이 1,500원에서 3,000원으로 인상됩니다. 무려 두 배! 지금 바로 공유하세요.',status:'근거와 불일치',theme:'bad',reason:'가상 원문은 기본요금 동결을 안내합니다. 게시물의 “3,000원으로 인상” 주장은 제공된 원문과 다릅니다.',source:'가상시 2027년 시내버스 요금 안내',original:'2027년 시내버스 일반 기본요금은 현행 1,500원을 유지한다. 1월 요금 인상 계획은 없다.',findings:[['핵심 숫자 불일치','게시물은 3,000원을 주장하지만 원문은 1,500원 유지입니다.'],['확산 유도 표현','“지금 바로 공유”라는 문구가 확인 전 확산을 유도합니다.']]}};
let selected=null,lastReport='',busy=false,importing=false,sourceInfo=null;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function update(){ $('count').textContent=$('post').value.length.toLocaleString()+' / 5,000'; if(selected&&$('post').value!==examples[selected].text)selected=null;document.querySelectorAll('[data-example]').forEach(b=>b.classList.toggle('active',b.dataset.example===selected));$('error').hidden=true; }
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{if(busy||importing)return;clearImport();selected=b.dataset.example;$('post').value=examples[selected].text;update();$('post').focus();}));
$('post').addEventListener('input',()=>{if(sourceInfo){sourceInfo.edited=true;renderSource();}update();});
function inspect(text){const f=[];if(/속보|충격|경악|무조건|100%|절대|누구나|모든|무려/.test(text))f.push(['강한 단정·과장 표현','대상 전체에 적용되는지, 예외는 없는지 원문에서 확인해 보세요.']);if(/공유|퍼뜨|알리세요|놓치지/.test(text))f.push(['공유를 재촉하는 표현','공유 요청 자체는 거짓의 증거가 아닙니다. 먼저 내용을 확인해 보세요.']);if(/다음 달|오늘|어제|내일|최근|올해/.test(text))f.push(['상대적인 날짜','게시물 작성일과 원문 발표일을 비교해 실제 시점을 확인해 보세요.']);if(!/https?:\/\/|출처\s*[:：]|공고|보도자료|연구명/.test(text))f.push(['원문 출처 확인 필요','링크나 구체적인 자료명이 뚜렷하지 않습니다. 원문을 찾아보세요.']);else f.push(['출처의 실제 내용 확인 필요','글에 적힌 출처가 해당 주장과 조건을 뒷받침하는지 확인해 보세요.']);if(!/20\d{2}|\d{1,2}월|\d{1,2}[./-]\d{1,2}/.test(text))f.push(['구체적인 적용 날짜 확인 필요','언제 발표되었고 언제 적용되는 정보인지 확인해 보세요.']);if(!f.length)f.push(['원문 대조 필요','표현만으로 사실 여부를 알 수 없습니다. 핵심 주장과 원문을 비교해 보세요.']);return f;}
function claims(text){return (text.match(/[^.!?。\n]+[.!?。]?/g)||[text]).map(x=>x.trim()).filter(x=>x.length>6).slice(0,3);}
function build(text,ex){const status=ex?ex.status:'판단 보류';const reason=ex?ex.reason:'주장을 뒷받침하거나 반박하는 별도 자료를 조회하지 않아 사실 여부를 판단할 수 없습니다. 아래는 입력 문장의 표현과 누락 정보에 대한 규칙 기반 점검입니다.';const findings=ex?ex.findings:inspect(text);const query=claims(text)[0].slice(0,120);const source=ex?'<div class="block"><h3>비교에 사용한 원문</h3><div class="source"><strong>'+escape(ex.source)+'</strong><p>'+escape(ex.original)+'</p><small>발표용 가상 자료 · 실제 기관의 공고가 아닙니다.</small></div></div>':'';
lastReport='잠깐! 게시물 점검\n'+(ex?'가상 원문 비교 시연':'규칙 기반 텍스트 점검')+'\n결과: '+status+'\n'+reason+(sourceInfo&&!ex?'\n출처: '+sourceInfo.sourceUrl+'\n'+sourceInfo.notice:'')+'\n\n입력: '+text+'\n\n'+findings.map(f=>f[0]+': '+f[1]).join('\n')+(ex?'\n\n가상 원문: '+ex.original:'');
return '<div class="resulttop '+(ex?ex.theme:'neutral')+'"><span class="badge">'+(ex?'가상 원문 비교 · 시연용':'텍스트 표현 점검 · 사실 검증 전')+'</span><h2>'+status+'</h2><p>'+escape(reason)+'</p></div><div class="resultbody">'+(sourceInfo&&!ex?'<div class="block"><h3>입력한 글의 출처</h3><p class="help">'+escape(sourceInfo.notice)+(sourceInfo.edited?' 가져온 뒤 사용자가 수정한 내용입니다.':'')+'</p><a href="'+escape(sourceInfo.sourceUrl)+'" target="_blank" rel="noopener noreferrer">원문 열기</a></div>':'')+'<div class="block"><h3>'+(ex?'확인할 핵심 내용':'확인할 문장 후보')+'</h3>'+claims(text).map(t=>'<p class="claim">'+escape(t)+'</p>').join('')+'</div><div class="block"><h3>'+(ex?'원문과 비교한 내용':'확인이 필요한 부분')+'</h3>'+findings.map(f=>'<div class="signal"><span class="signalmark">'+(ex&&ex.theme==='good'?'✓':'!')+'</span><div><strong>'+escape(f[0])+'</strong><p>'+escape(f[1])+'</p></div></div>').join('')+'</div>'+source+'<div class="block"><h3>직접 근거 찾아보기</h3><p class="help">'+(ex?'가상 예시는 실제 검색으로 검증할 수 없습니다. 직접 입력한 게시물에서 검색을 이용해 보세요.':'원문 발표일·적용 대상·수치를 비교해 보세요. 검색 결과 자체가 사실을 보장하지는 않습니다.')+'</p>'+(ex?'':'<div class="searchlinks"><a href="https://www.google.com/search?q='+encodeURIComponent(query)+'" target="_blank" rel="noopener noreferrer">Google 검색</a><a href="https://search.naver.com/search.naver?query='+encodeURIComponent(query)+'" target="_blank" rel="noopener noreferrer">네이버 검색</a></div>')+'</div><div class="actions"><button class="outline" id="copy">점검 내용 복사</button><button class="outline" id="reset">새 게시물 점검</button></div><p id="copyStatus" class="help" role="status"></p></div>';}
function readHistory(){try{const h=JSON.parse(localStorage.getItem('jamkkan-v1')||'[]');return Array.isArray(h)?h.filter(x=>x&&typeof x.text==='string').slice(0,10):[];}catch{return [];}}
const comparisonLabels={date:'날짜',target:'대상',value:'수치',conditions:'적용 조건'};
function renderVerification(text,data){
 const details=data.results.map(item=>{
  const fields=Object.entries(item.comparison).filter(([,value])=>value);
  const comparison=fields.length?'<dl class="comparison">'+fields.map(([key,value])=>'<dt>'+comparisonLabels[key]+'</dt><dd>'+escape(value)+'</dd>').join('')+'</dl>':'';
  const sources=item.sources.map(source=>'<div class="source evidence"><a href="'+escape(source.url)+'" target="_blank" rel="noopener noreferrer">'+escape(source.title)+'</a><p>'+escape(source.quote)+'</p></div>').join('');
  const theme=item.verdict==='확인 불가'?'unknown':item.verdict==='근거와 차이'?'different':'matched';
  return '<article class="block verification"><span class="verdict '+theme+'">'+escape(item.verdict)+'</span><h3>'+escape(item.claim)+'</h3><p>'+escape(item.explanation)+'</p>'+(item.translationIncomplete?'<p class="help">전체 영어 번역을 받지 못했습니다. 가능한 검색어로 검색했습니다.</p>':'')+comparison+sources+'</article>';
 }).join('');
 const inputSource=sourceInfo?'<div class="block"><h3>검증에 입력한 글</h3><p class="help">'+escape(sourceInfo.notice)+(sourceInfo.edited?' 가져온 뒤 수정한 내용입니다.':'')+'</p><a href="'+escape(sourceInfo.sourceUrl)+'" target="_blank" rel="noopener noreferrer">입력 원문 열기</a></div>':'';
 const findings=inspect(text);
 const summary=data.results.length?'주장 '+data.results.length+'개 · 확인 불가 '+data.results.filter(item=>item.verdict==='확인 불가').length+'개':'검증할 수 있는 주장을 찾지 못했습니다.';
 const omitted=data.omitted?'한 번에 8개까지 검증합니다. 남은 '+data.omitted+'개 주장은 글을 나누어 입력해 주세요.':'';
 lastReport=['잠깐! 사실 검증',summary,omitted,sourceInfo?.sourceUrl,...data.results.map(item=>[
  item.claim,item.verdict,item.explanation,...Object.entries(item.comparison).filter(([,value])=>value)
   .map(([key,value])=>comparisonLabels[key]+' · '+value),...item.sources.map(source=>source.title+'\n'+source.quote+'\n'+source.url)
 ].join('\n')),'표현과 누락 정보 점검',...findings.map(f=>f.join(' · '))].filter(Boolean).join('\n\n');
 return '<div class="resulttop neutral"><h2>사실 검증 결과</h2><p>'+escape(summary)+'</p>'+(omitted?'<p>'+escape(omitted)+'</p>':'')+'</div><div class="resultbody">'+inputSource+details+
 '<div class="block"><h3>표현과 누락 정보 점검</h3>'+findings.map(f=>'<div class="signal"><span class="signalmark">!</span><div><strong>'+escape(f[0])+'</strong><p>'+escape(f[1])+'</p></div></div>').join('')+
 '</div><div class="actions"><button class="outline" id="copy">검증 내용 복사</button><button class="outline" id="reset">새 글 검증</button></div><p id="copyStatus" class="help" role="status"></p></div>';
}

$('analyze').addEventListener('click',async()=>{
 const text=$('post').value.trim();
 if(busy||importing)return;
 if(text.length<10){$('error').textContent='확인할 내용을 10자 이상 입력해 주십시오.';$('error').hidden=false;$('post').focus();return;}
 busy=true;
 $('analyze').disabled=true;
 $('post').disabled=true;
 $('importBtn').disabled=true;
 $('error').hidden=true;
 $('buttonText').textContent='주장을 나누고 근거를 찾는 중';
 $('resultPanel').setAttribute('aria-busy','true');
 const key=selected;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),20000);
 try {
  if(key){
   $('result').innerHTML=build(text,examples[key]);
  }else{
   const response=await fetch('/api/verify',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text, sourceUrl:sourceInfo?.sourceUrl}), signal:controller.signal
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error || '검증을 완료하지 못했습니다.');
   $('result').innerHTML=renderVerification(text,data);
  }
  $('empty').hidden=true;
  $('result').hidden=false;
  try {
   const h=readHistory();
   h.unshift({text,key,date:new Date().toISOString()});
   localStorage.setItem('jamkkan-v1',JSON.stringify(h.slice(0,10)));
  }catch{}
  $('copy').onclick=async()=>{
   try{await navigator.clipboard.writeText(lastReport);$('copyStatus').textContent='결과를 복사했습니다.';}
   catch{$('copyStatus').textContent='화면의 내용을 선택해 복사해 주세요.';}
  };
  $('reset').onclick=()=>{
   $('post').value='';selected=null;clearImport();update();
   $('result').hidden=true;$('empty').hidden=false;$('post').focus();
  };
  if(window.innerWidth<850)$('resultPanel').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(error){
  $('error').textContent=error.name==='AbortError'?'검증 시간이 길어졌습니다. 다시 시도해 주세요.':'검증 요청을 처리하지 못했습니다. 다시 시도해 주세요.';
  $('error').hidden=false;
  $('result').hidden=true;
  $('empty').hidden=false;
 }finally{
  clearTimeout(timer);
  $('resultPanel').setAttribute('aria-busy','false');
  $('analyze').disabled=false; $('post').disabled=false; $('importBtn').disabled=false;
  $('buttonText').textContent='사실 검증하기';
  busy=false;
 }
});
$('aboutBtn').onclick=()=>$('about').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());function showHistory(){const h=readHistory();$('historyList').replaceChildren();if(!h.length)$('historyList').textContent='아직 저장된 기록이 없습니다.';h.forEach(x=>{const b=document.createElement('button');b.className='historyitem';b.textContent=x.text.slice(0,95)+(x.text.length>95?'…':'');const d=document.createElement('small');d.textContent=(x.key&&examples[x.key]?'가상 예시':'직접 입력')+' · '+new Date(x.date).toLocaleString('ko-KR');b.append(d);b.onclick=()=>{if(busy||importing)return;clearImport();$('post').value=x.text;selected=x.key&&examples[x.key]?x.key:null;update();$('history').close();$('post').focus();};$('historyList').append(b);});} $('historyBtn').onclick=()=>{showHistory();$('history').showModal();};$('clearHistory').onclick=()=>{try{localStorage.removeItem('jamkkan-v1');}catch{}showHistory();};

function clearImport(){sourceInfo=null;$('sourcePreview').hidden=true;$('importStatus').hidden=true;$('postUrl').value='';}
function renderSource(){if(!sourceInfo){$('sourcePreview').hidden=true;return;}const d=sourceInfo;$('sourcePreview').hidden=false;$('sourcePreview').innerHTML='<span class="badge">'+(d.kind==='article'?'페이지 본문에서 추출':d.kind==='caption'?'게시물 캡션':'공개 미리보기')+'</span><strong>'+escape(d.title||'제목 없는 페이지')+'</strong><div>'+escape(d.notice)+(d.truncated?' 처음 5,000자만 표시합니다.':'')+(d.edited?' 가져온 뒤 수정한 내용입니다.':'')+'</div><a href="'+escape(d.sourceUrl)+'" target="_blank" rel="noopener noreferrer">원문 열기 · '+escape(new URL(d.sourceUrl).hostname)+'</a>';}
$('linkForm').addEventListener('submit',event=>{
 event.preventDefault();
 loadPost();
});

async function loadPost({shared=false}={}){
 if(importing||busy)return;const raw=$('postUrl').value.trim();let u;try{u=new URL(raw);if(u.protocol!=='https:')throw Error();}catch{$('importStatus').hidden=false;$('importStatus').className='importstatus failed';$('importStatus').textContent='https://로 시작하는 올바른 게시물 링크를 넣어 주십시오.';return;}
 importing=true;sourceInfo=null;selected=null;$('sourcePreview').hidden=true;$('post').value='';update();$('result').hidden=true;$('empty').hidden=false;$('importBtn').disabled=true;$('analyze').disabled=true;$('post').disabled=true;$('postUrl').disabled=true;$('importBtn').textContent='가져오는 중';$('importStatus').hidden=false;$('importStatus').className='importstatus';$('importStatus').textContent=shared?'공유받은 인스타그램 게시물을 읽는 중입니다…':'공개 페이지에서 텍스트를 가져오고 있습니다…';
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),18000);
 try{const response=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:raw}),signal:ctrl.signal});let data;try{data=await response.json();}catch{throw Error('가져오기 서버에 연결하지 못했습니다. 본문을 직접 입력해 주십시오.');}if(!response.ok)throw Error(data.error||'내용을 가져오지 못했습니다.');sourceInfo=data;$('post').value=data.text;update();renderSource();$('importStatus').hidden=false;$('importStatus').className='importstatus';$('importStatus').textContent='텍스트를 가져왔습니다. 아래에서 읽고 필요한 부분을 수정할 수 있습니다.';}
 catch(e){$('importStatus').className='importstatus failed';$('importStatus').textContent=e.name==='AbortError'?'응답 시간이 길어 중단했습니다. 본문을 직접 붙여넣어 이어갈 수 있습니다.':e.message;}
 finally{clearTimeout(timeout);importing=false;$('importBtn').disabled=false;$('analyze').disabled=false;$('post').disabled=false;$('postUrl').disabled=false;$('importBtn').textContent='내용 가져오기';}
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

if (location.pathname === '/share') {
 const url=sharedInstagramUrl(new URLSearchParams(location.search));
 history.replaceState(null,'','/');
 if (url) {
  $('postUrl').value=url;
  loadPost({shared:true});
 } else {
  $('importStatus').hidden=false;
  $('importStatus').className='importstatus failed';
  $('importStatus').textContent='공유에서 인스타그램 게시물 링크를 찾지 못했습니다. 인스타그램에서 링크를 복사해 링크 입력란에 붙여넣어 주세요.';
  $('postUrl').focus();
 }
}
