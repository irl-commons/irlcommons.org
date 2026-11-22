// Serves dist/ on 127.0.0.1 with the response headers from _headers, so the
// strict CSP applies locally the way it does on the host. Pages are served at
// addresses without ".html" like on the host: /phone-setup from phone-setup.html,
// and an old address (/phone-setup.html, /index.html, /index) answers 301 to the
// clean one, query kept.
// Run `node scripts/serve.mjs [port]` to preview a build; the browser checks import it.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml'};

// Only the catch-all "/*" block is used; that is the only block both sites have.
export function parseHeaders(text){
 const headers={};let all=false;
 for(const line of text.split('\n')){
  if(/^\S/.test(line)){all=line.trim()==='/*';continue;}
  const m=/^\s+([\w-]+):\s*(.+)$/.exec(line);
  if(all&&m)headers[m[1]]=m[2].trim();
 }
 return headers;
}

// Simple "from to status" lines, as in _redirects.
export function parseRedirects(text){
 return new Map(text.split('\n').map(l=>l.trim().split(/\s+/)).filter(p=>p.length>=2&&p[0].startsWith('/')).map(([from,to,code])=>[from,{to,code:Number(code)||301}]));
}

// The clean address of an old ".html" one (path only), or null when it is already clean.
export function cleanPath(name){
 const m=/^((?:\/[\w-][\w.~-]*)*\/)index(?:\.html)?$/.exec(name)||/^((?:\/[\w-][\w.~-]*)+)\.html$/.exec(name);
 return m?m[1]:null;
}

export async function serve(root='dist',port=0){
 root=path.resolve(root);
 const read=name=>{try{return readFileSync(path.join(root,name),'utf8');}catch{return '';}};
 const headers=parseHeaders(read('_headers'));
 const redirects=parseRedirects(read('_redirects'));
 const server=http.createServer(async(req,res)=>{
  let name,url;
  try{url=new URL(req.url,'http://localhost');name=decodeURIComponent(url.pathname);}catch{res.writeHead(400,headers);return res.end();}
  const redirect=redirects.get(name);
  if(redirect){res.writeHead(redirect.code,{...headers,Location:redirect.to});return res.end();}
  const clean=cleanPath(url.pathname);
  if(clean){res.writeHead(301,{...headers,Location:clean+url.search});return res.end();}
  if(name.endsWith('/'))name+='index.html';
  let file=path.join(root,name);
  if(!file.startsWith(root+path.sep)||path.basename(file).startsWith('_')){res.writeHead(404,headers);return res.end();}
  try{
   if(!(await stat(file).catch(()=>null))?.isFile())file+='.html';
   if(!(await stat(file)).isFile())throw new Error('not a file');
   const body=await readFile(file);
   res.writeHead(200,{...headers,'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store'});
   res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 return {server,origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {origin}=await serve('dist',Number(process.argv[2])||4321);
 console.log(`Serving dist/ with the _headers CSP at ${origin}/`);
}
