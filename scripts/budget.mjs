// Page weight: bytes of each page's HTML, and of the HTML with the stylesheets,
// scripts and images it loads; plus each stylesheet, script and font in
// dist/assets (images count with the pages that show them). Fingerprints are
// omitted from budget keys so a content edit keeps the existing limit.
// page-budget.json
// holds the limits that scripts/budget.test.mjs enforces.
// `node scripts/budget.mjs` prints the current sizes; `node scripts/budget.mjs --write`
// sets every limit to the current size plus the headroom, after an intended change.
// `node scripts/budget.mjs --raise` only raises limits that the current build is over
// and drops entries for files that are gone; the data update job uses it, so a data
// release that makes data pages bigger shows up as a diff instead of failing.
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const HEADROOM=0.15;
export const assetKey=file=>file.replace(/^(assets\/[^/]+)\.[\w-]{8}(\.(?:css|js))$/,'$1$2');
export const limitFor=bytes=>Math.ceil(bytes*(1+HEADROOM)/1024)*1024;

export async function measure(root='dist'){
 const config=JSON.parse(await readFile('site.json','utf8'));
 const size=async file=>(await stat(path.join(root,file))).size;
 const pages={};
 for(const name of config.pages){
  const html=await readFile(path.join(root,name),'utf8');
  const refs=new Set();
  for(const m of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>|<script\b[^>]*\bsrc="[^"]+"[^>]*>|<img\b[^>]*\bsrc="[^"]+"[^>]*>/g)){
   const url=/(?:href|src)="([^"]+)"/.exec(m[0])[1];
   if(!/^(https?:)?\/\//.test(url))refs.add(url.replace(/^\//,'').split(/[?#]/)[0]);
  }
  let total=Buffer.byteLength(html);
  for(const ref of refs)total+=await size(ref);
  pages[name]={html:Buffer.byteLength(html),total};
 }
 const assets={};
 const walk=async dir=>{
  for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
   const file=`${dir}/${entry.name}`;
   if(entry.isDirectory())await walk(file);
   else if(/\.(css|js|woff2)$/.test(entry.name)){
    const key=assetKey(file);
    if(Object.hasOwn(assets,key))throw new Error(`Multiple files for asset budget ${key}`);
    assets[key]=await size(file);
   }
  }
 };
 await walk('assets');
 return {pages,assets};
}

export function compare(current,budget){
 const problems=[];
 for(const [name,sizes] of Object.entries(current.pages)){
  const limit=budget.pages?.[name];
  if(!limit){problems.push(`${name} has no budget`);continue;}
  for(const kind of ['html','total'])if(sizes[kind]>limit[kind])problems.push(`${name} ${kind}: ${sizes[kind]} bytes, budget ${limit[kind]}`);
 }
 for(const [file,bytes] of Object.entries(current.assets)){
  const limit=budget.assets?.[file];
  if(limit===undefined)problems.push(`${file} has no budget`);
  else if(bytes>limit)problems.push(`${file}: ${bytes} bytes, budget ${limit}`);
 }
 for(const name of Object.keys(budget.pages||{}))if(!current.pages[name])problems.push(`budget for ${name}, which is not a page in site.json`);
 for(const file of Object.keys(budget.assets||{}))if(current.assets[file]===undefined)problems.push(`budget for ${file}, which is not in dist/`);
 return problems;
}

export function raise(current,budget){
 const pages={},assets={};
 for(const [name,s] of Object.entries(current.pages)){
  const limit=budget.pages?.[name]||{};
  pages[name]={html:s.html>(limit.html??-1)?limitFor(s.html):limit.html,total:s.total>(limit.total??-1)?limitFor(s.total):limit.total};
 }
 for(const [file,bytes] of Object.entries(current.assets)){
  const limit=budget.assets?.[file];
  assets[file]=limit===undefined||bytes>limit?limitFor(bytes):limit;
 }
 return {...budget,pages,assets};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const current=await measure();
 const kb=n=>`${(n/1024).toFixed(1)} KB`;
 for(const [name,s] of Object.entries(current.pages))console.log(`${name.padEnd(28)} html ${kb(s.html).padStart(9)}   with css, js, images ${kb(s.total).padStart(9)}`);
 for(const [file,bytes] of Object.entries(current.assets))console.log(`${file.padEnd(60)} ${kb(bytes).padStart(9)}`);
 if(process.argv.includes('--write')){
  const budget={
   about:`Byte limits checked by scripts/budget.test.mjs: the size when last set plus ${HEADROOM*100} percent, rounded up to the next KB. After an intended change, run npm run budget -- --write and review the diff.`,
   pages:Object.fromEntries(Object.entries(current.pages).map(([name,s])=>[name,{html:limitFor(s.html),total:limitFor(s.total)}])),
   assets:Object.fromEntries(Object.entries(current.assets).map(([file,bytes])=>[file,limitFor(bytes)])),
  };
  await writeFile('page-budget.json',JSON.stringify(budget,null,1)+'\n');
  console.log('Wrote page-budget.json');
 }else if(process.argv.includes('--raise')){
  const before=JSON.parse(await readFile('page-budget.json','utf8'));
  const problems=compare(current,before);
  if(problems.length){
   await writeFile('page-budget.json',JSON.stringify(raise(current,before),null,1)+'\n');
   console.log(`Raised page-budget.json:\n${problems.join('\n')}`);
  }else console.log('page-budget.json already fits');
 }
}
