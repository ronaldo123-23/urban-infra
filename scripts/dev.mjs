import http from 'node:http';
import app from '../dist/server/index.js';
const args=process.argv.slice(2);const pi=args.indexOf('--port');const port=Number(pi>=0?args[pi+1]:process.env.PORT||5173);
http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=Buffer.concat(chunks);const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(req.method!=='GET'&&req.method!=='HEAD'?{body:data}: {})});const response=await app.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview server error');}}).listen(port,'0.0.0.0',()=>console.log('Preview listening on '+port));
