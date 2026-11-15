import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {HtmlValidate} from 'html-validate';
const root=path.resolve('dist');
const config=JSON.parse(await readFile('site.json','utf8'));
const docs=new Map(await Promise.all(config.pages.map(async name=>[name,await readFile(path.join(root,name),'utf8')])));
const ids=text=>new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const decode=s=>s.replaceAll('&amp;','&');
test('Every page has its canonical URL, metadata, one h1 and unique ids',()=>{
 for(const [name,text] of docs){
  assert.equal((text.match(/<h1\b/g)||[]).length,1,name);
  const all=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(all).size,all.length,name);
  const url=`https://${config.domain}/${name==='index.html'?'':name}`;
  assert.ok(text.includes(`rel="canonical" href="${url}"`),name);
  assert.ok(text.includes(`property="og:url" content="${url}"`),name);
  assert.ok(!text.includes('name="robots"'),name);
  assert.ok(!text.includes('OpenStreamBox Initiative'),name);
  assert.ok(!text.includes('>Data and standards</a>'),name);
 }
});
test('Local links and fragments resolve',async()=>{
 for(const [name,text] of docs)for(const match of text.matchAll(/(?:href|src)="([^\"]+)"/g)){
  const value=decode(match[1]);if(/^(https?:|mailto:|tel:)/.test(value))continue;
  const [file,hash]=value.split('#');const target=file?file.replace(/^\//,''):name;
  assert.ok(!target.includes('..'),value);
  await stat(path.join(root,target));
  if(hash&&docs.has(target))assert.ok(ids(docs.get(target)).has(hash),`${name}: ${value}`);
 }
});
test('Strict CSP: one first-party script, no inline executable code or third-party resources',async()=>{
 const scripts=new Set();
 for(const [name,text] of docs){
  assert.ok(!/<style\b|\sstyle=|\son\w+=/i.test(text),name);
  for(const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
   assert.equal(m[2].trim(),'');const src=/src="([^"]+)"/.exec(m[1]);assert.ok(src);assert.ok(src[1].startsWith('/assets/'));scripts.add(src[1]);
  }
  assert.ok(!/<(?:img|script|iframe|video|audio)[^>]+src="(?:https?:|\/\/)|<link[^>]+href="(?:https?:|\/\/)(?![^>]*rel="canonical")/i.test(text.replace(/<link rel="(?:canonical|alternate)"[^>]*>/g,'')),name);
 }
 assert.equal(scripts.size,1);
 assert.ok((await readFile('public/_headers','utf8')).includes("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"));
});
test('Data entries offer text-field-only edit forms',()=>{
 for(const [name,text] of docs){
  if(['glossary.html','help.html','links.html','standards.html'].includes(name))assert.ok(text.includes('Suggest an edit'),name);
  for(const m of text.matchAll(/href="([^\"]*template=edit-entry.yml[^\"]*)"/g)){
   const url=new URL(decode(m[1]));for(const key of url.searchParams.keys())assert.ok(['template','title','entry','source','changes'].includes(key),key);
  }
 }
});
test('HTML validates',async()=>{
 const validator=new HtmlValidate({extends:['html-validate:recommended'],rules:{'aria-label-misuse':'off','void-style':'off','no-trailing-whitespace':'off','wcag/h32':'off','svg-focusable':'off','long-title':'off','prefer-native-element':'off','no-inline-style':'error','attr-quotes':'off'}});
 for(const [name,text] of docs){const result=await validator.validateString(text,name);assert.ok(result.valid,JSON.stringify(result.results.flatMap(r=>r.messages).slice(0,15)));}
});
test('Sitemap covers the complete page list and schemas retain canonical ids',async()=>{
 const map=await readFile('dist/sitemap.xml','utf8');assert.equal((map.match(/<loc>/g)||[]).length,config.pages.length);
 if(config.domain==='irlcommons.org')for(const repo of ['stream-status','stream-session']){const s=JSON.parse(await readFile(`dist/schemas/${repo}/v0.json`,'utf8'));assert.equal(s.$id,`https://irlcommons.org/schemas/${repo}/v0.json`);}
});
