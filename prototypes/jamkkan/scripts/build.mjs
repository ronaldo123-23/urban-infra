import { readFile, mkdir, rm, copyFile, writeFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/share.js': ['share.js', 'text/javascript; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/icon-192.png': ['icon-192.png', 'image/png', true],
  '/icon-512.png': ['icon-512.png', 'image/png', true]
};
const assets = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([route, [file, type, binary]]) => [
  route, {body:await readFile('public/'+file,binary?'base64':'utf8'), type, binary:!!binary}
])));
const verifier = await readFile('worker/verify.js','utf8');
const server = await readFile('worker/handler.js','utf8');
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',`const assets = ${JSON.stringify(assets)};\n${verifier}\n${server}`);
try {
  await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Built Worker and embedded application assets.');
