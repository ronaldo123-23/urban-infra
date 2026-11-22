import assert from 'node:assert/strict';
import {validateUrl,extract,importUrl} from '../worker/handler.js';
assert.equal(validateUrl('https://www.instagram.com/p/ABC_123/?igsh=abc').href,'https://www.instagram.com/p/ABC_123/');
for(const u of ['http://instagram.com/p/x/','https://127.0.0.1/','https://instagram.com.evil.test/p/x/','https://user:pass@instagram.com/p/x/','https://instagram.com:8443/p/x/','https://instagram.com/accounts/login/','https://instagram.com/stories/abc/'])assert.throws(()=>validateUrl(u));
const ig='<html><title>Test</title><meta content="42 likes - 실제 게시물의 내용입니다. 일부 정보를 확인하기 위한 충분한 길이의 공개 설명입니다." property="og:description"></html>';
assert.equal(extract(ig,'https://www.instagram.com/p/x/').kind,'summary');
assert.throws(()=>extract('<title>Login • Instagram</title><meta name="description" content="Create an account or log in to Instagram">','https://www.instagram.com/p/x/'),e=>e.code==='login_required');
const article='<meta property="og:title" content="기사 &amp; 안내"><script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',articleBody:'검증을 위한 기사 본문입니다. 적용 대상과 일시를 확인할 수 있습니다. '.repeat(10)})+'</script>';
assert.equal(extract(article,'https://www.korea.kr/news/a').kind,'article');
assert.equal(extract(article,'https://www.korea.kr/news/a').title,'기사 & 안내');
assert.equal(extract('<article><p>'+('본문 내용이 충분히 길게 들어갑니다. '.repeat(20))+'</p><script>alert(1)</script></article>','https://www.korea.kr/x').text.includes('alert'),false);
let calls=0;await assert.rejects(()=>importUrl('https://www.instagram.com/p/x/',async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/'}});}),e=>e.code==='unsupported_domain');assert.equal(calls,1);
await assert.rejects(()=>importUrl('https://www.instagram.com/p/x/',async()=>new Response('no',{status:403})),e=>e.code==='upstream_unavailable');
await assert.rejects(()=>importUrl('https://www.korea.kr/x',async()=>new Response('image',{headers:{'content-type':'image/png'}})),e=>e.code==='unsupported_type');
await assert.rejects(()=>importUrl('https://www.korea.kr/x',async()=>new Response('x',{headers:{'content-type':'text/html','content-length':'2000000'}})),e=>e.code==='too_large');
const loaded=await importUrl('https://www.instagram.com/p/x/',async()=>new Response(ig,{headers:{'content-type':'text/html'}}));assert.equal(loaded.kind,'summary');
const {default:worker}=await import('../dist/server/index.js');
assert.equal((await worker.fetch(new Request('https://test.local/'))).status,200);
assert.equal((await worker.fetch(new Request('https://test.local/api/import'))).status,405);
assert.equal((await worker.fetch(new Request('https://test.local/api/import',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'}))).status,403);
assert.equal((await worker.fetch(new Request('https://test.local/api/import',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))).status,400);
assert.equal((await worker.fetch(new Request('https://test.local/api/import',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).status,400);
console.log('Passed: extraction, Instagram login fallback, URL validation, redirect protection, size/type limits, API routing.');

const {sharedInstagramUrl}=await import('../public/share.js');
const {readFile}=await import('node:fs/promises');
const {runInNewContext}=await import('node:vm');
const instagram='https://www.instagram.com/p/ABC_123/';
const shareText='이 게시물 보기 https://www.instagram.com/p/ABC_123/?igsh=abc';
assert.equal(sharedInstagramUrl(new URLSearchParams({text:shareText})),instagram);
assert.equal(sharedInstagramUrl(new URLSearchParams({url:instagram})),instagram);
assert.equal(sharedInstagramUrl(new URLSearchParams({text:'https://instagram.com/share/reel/Abc123/?igsh=q'})),'https://www.instagram.com/share/reel/Abc123/');
assert.equal(sharedInstagramUrl(new URLSearchParams({text:'https://instagram.com.evil.test/p/ABC_123/'})),null);
const caption='첫 줄\n둘째 줄 #확인';
const instagramHtml='<meta property="og:description" content="일부만 보이는 미리보기입니다."><script type="application/ld+json">'+JSON.stringify({'@type':'SocialMediaPosting',caption})+'</script>';
assert.deepEqual([extract(instagramHtml,instagram).kind,extract(instagramHtml,instagram).text],['caption',caption]);
assert.equal(extract('<script type="application/ld+json">{"@type":"ImageObject","caption":"짧은 글"}</script>',instagram).text,'짧은 글');
await assert.rejects(()=>importUrl(instagram,async()=>new Response(null,{status:302,headers:{location:'/accounts/login/?next=/p/ABC_123/'}})),error=>error.code==='login_required');

const sharePath='/share?'+new URLSearchParams({text:shareText});
const page=await worker.fetch(new Request('https://test.local'+sharePath));
assert.equal(page.status,200);
assert.match(await page.text(),/manifest\.webmanifest/);
const manifest=await (await worker.fetch(new Request('https://test.local/manifest.webmanifest'))).json();
assert.equal(manifest.share_target.action,'/share');
for(const icon of manifest.icons){
 const response=await worker.fetch(new Request('https://test.local'+icon.src));
 assert.equal(response.headers.get('content-type'),'image/png');
 const data=new DataView(await response.arrayBuffer());
 assert.equal(data.getUint32(16),Number(icon.sizes.split('x')[0]));
}
const nodes=new Map();
const element=id=>{
 if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,addEventListener(){},focus(){}});
 return nodes.get(id);
};
const client=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
let requestedUrl, cleanPath;
runInNewContext(client,{
 sharedInstagramUrl, URLSearchParams, URL, AbortController, setTimeout, clearTimeout,
 document:{getElementById:element,querySelectorAll:()=>[]},
 navigator:{},location:new URL('https://test.local'+sharePath),
 history:{replaceState(_state,_title,path){cleanPath=path;}},
 fetch:async(path,{body})=>{
  assert.equal(path,'/api/import');
  requestedUrl=JSON.parse(body).url;
  return new Response(JSON.stringify(extract(instagramHtml,instagram)));
 }
});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(cleanPath,'/');
assert.equal(requestedUrl,instagram);
assert.equal(element('post').value,caption);
assert.match(element('sourcePreview').innerHTML,/게시물 캡션/);
console.log('Passed: share manifest, icons, shared link handling, automatic import, caption rendering, and redirect-to-login fallback.');

const {extractSearchWords}=await import('../dist/server/index.js');
assert.deepEqual(extractSearchWords('헉! 또 나, NSAIDs 18% 18% 2.5mg'),['헉','또','나','NSAIDs','18%','18%','2.5mg']);
console.log('Passed: search extraction preserves one-character words, repeated terms, acronyms and numbers.');
