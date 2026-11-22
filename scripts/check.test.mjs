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
// Pages are files x.html served at /x, the home page at /; links use those addresses (shared/addresses.py).
const addr=name=>name==='index.html'?'':name.replace(/\.html$/,'');
const fileOf=value=>{const p=value.replace(/^\.?\//,'');return !p?'index.html':/\.[a-z0-9]+$/.test(p)?p:`${p}.html`;};
test('Every page has its canonical URL, metadata, one h1 and unique ids',()=>{
 for(const [name,text] of docs){
  assert.equal((text.match(/<h1\b/g)||[]).length,1,name);
  const all=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(all).size,all.length,name);
  const url=`https://${config.domain}/${addr(name)}`;
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
  const [file,hash]=value.split('#');const target=file?fileOf(file):name;
  assert.ok(!target.includes('..'),value);
  assert.ok(!/\.html$/.test(file||''),`${name}: ${value} links an old .html address; link the page without .html`);
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
  if(['glossary.html','help.html','links.html','existing-formats.html'].includes(name))assert.ok(text.includes('Suggest an edit'),name);
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
test('The old standards address points to Existing formats',async()=>{
 if(config.domain!=='irlcommons.org')return;
 const text=await readFile('dist/standards.html','utf8');
 assert.ok(text.includes('http-equiv="refresh" content="0; url=existing-formats"'));
 assert.ok(text.includes('rel="canonical" href="https://irlcommons.org/existing-formats"'));
 assert.ok(docs.has('existing-formats.html')&&!docs.has('standards.html'));
});

test('Search and naming rendering use explicit names, service evidence and see links', async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-c', `
import sys
sys.path.insert(0, 'shared')
import render as r
w = {'id':'sample', 'term':'Sample', 'also_called':['Synonym'], 'search_terms':['Search only'], 'aliases':['Deprecated only'], 'plain':'A sample.', 'naming':{'label':'Sample label','plural':'Sample labels','case':'sentence','status':'draft','scope':'A setting.','why':'A reason.','translation_note':'A note.','alternatives':[{'term':'Other name','status':'ambiguous','why':'Another meaning.','see':'other'}],'evidence':[{'service':'sample-service','label':'Observed label','support':'context-only','note':'A context source.','url':'https://example.org/source','read_on':'2026-11-15'}]}}
names=r.word_names(w)
assert all(x in names for x in ['Synonym','Search only','Other name','Sample labels'])
assert 'Deprecated only' not in names
target={'id':'other','term':'Other name','plain':'Another meaning.'}
out=r.naming_entry(w,[w,target],[{'id':'sample-service','name':'Sample service'}])
assert 'Where seen' in out and 'Context only' in out and 'Observed label' in out
assert 'Sample service' in out and 'makers' not in out
assert 'Other name usually means Another meaning.' in out
assert 'glossary.html#other' in out
`],{stdio:'pipe'});
});

test('Glossary card links use the word target and accessible name', async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-c', `
import sys
sys.path.insert(0, 'shared')
import render as r
body = '<dl><div class="entry" id="sample"><dt data-word="sample">Sample &amp; word</dt><dd>Meaning.</dd></div></dl>'
out = r.add_permalinks(body)
assert 'href="#sample" aria-label="Link to Sample &amp; word"' in out
assert not r.permalink_problems('sample.html', out)
assert r.add_permalinks(out) == out
`],{stdio:'pipe'});
});

test('Support channel types come from the catalogue, with legacy labels as fallback', async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-c', `
import sys
sys.path.insert(0, 'shared')
import render as r
service = {'support': [
    {'label': 'Help with an account', 'url': 'https://example.org/account', 'kind': 'contact'},
    {'label': 'Chat with us', 'url': 'https://example.org/chat', 'kind': 'discord'},
    {'label': 'GitHub issues', 'url': 'https://github.com/example/example/issues', 'kind': 'github'},
], 'links': []}
assert r.channels(service) == service['support']
assert r.help_channels(service) == [('Discord', 'https://example.org/chat'), ('Contact', 'https://example.org/account')]
assert r.channel_type('GitHub discussions', 'https://github.com/example/example/discussions') == 'Forum'
assert r.channel_type('Manual', 'https://example.org/manual', 'docs') == 'Help'
assert not hasattr(r, 'SITE_SUPPORT_EXTRA')
`],{stdio:'pipe'});
});

test('Pages answer at addresses without .html; old .html addresses answer 301 to them, query kept', async()=>{
 const {serve,cleanPath}=await import('./serve.mjs');
 assert.equal(cleanPath('/phone-setup.html'),'/phone-setup');
 assert.equal(cleanPath('/index.html'),'/');
 assert.equal(cleanPath('/index'),'/');
 assert.equal(cleanPath('/phone-setup'),null);
 assert.equal(cleanPath('//evil.example/x.html'),null);
 const server=await serve('dist');
 try{
  const get=p=>fetch(server.origin+p,{redirect:'manual'});
  for(const name of config.pages){
   const r=await get(`/${addr(name)}`);
   assert.equal(r.status,200,name);assert.equal(await r.text(),docs.get(name),name);
   const old=await get(`/${name}?a=1&b=2`);
   assert.equal(old.status,301,name);assert.equal(old.headers.get('location'),`/${addr(name)}?a=1&b=2`,name);
  }
  assert.equal((await get('/index')).headers.get('location'),'/');
  for(const p of ['/assets/style.css','/sitemap.xml','/robots.txt','/schemas/stream-status/v0.json','/schemas/stream-session/v0.json'])assert.equal((await get(p)).status,200,p);
  assert.equal((await get('/standards.html')).headers.get('location'),'/standards');
  assert.equal((await get('/no-such-page')).status,404);
  assert.equal((await get('/initiative/')).status,404);
 }finally{await server.close();}
});

test('Links to pages of either site drop .html; other links stay as written', async()=>{
 const {execFileSync}=await import('node:child_process');
 const out=execFileSync('python3',['-c',`
import sys; sys.path.insert(0, 'shared')
from addresses import clean_links, url
print(url('howtoirl.org', 'index.html'), url('howtoirl.org', 'help.html'))
print(clean_links('<a href="index.html">a</a> <a href="index.html#x">b</a> <a href="glossary.html#srt">c</a> <a href="help.html?tab=1">d</a>'))
print(clean_links('<a href="https://irlcommons.org/standards.html#shared">e</a> <link rel="canonical" href="https://howtoirl.org/index.html">'))
print(clean_links('changes=On%20https%3A%2F%2Fhowtoirl.org%2Fcloud.html%3A%20 data-copy="https://howtoirl.org/cloud.html"'))
print(clean_links('<a href="https://example.com/a.html">f</a> <a href="assets/x.css">g</a> <a href="https://howtoirl.org/assets/share/a.png">h</a>'))
`]).toString().trim().split('\n');
 assert.deepEqual(out,[
  'https://howtoirl.org/ https://howtoirl.org/help',
  '<a href="./">a</a> <a href="./#x">b</a> <a href="glossary#srt">c</a> <a href="help?tab=1">d</a>',
  '<a href="https://irlcommons.org/standards#shared">e</a> <link rel="canonical" href="https://howtoirl.org/">',
  'changes=On%20https%3A%2F%2Fhowtoirl.org%2Fcloud%3A%20 data-copy="https://howtoirl.org/cloud"',
  '<a href="https://example.com/a.html">f</a> <a href="assets/x.css">g</a> <a href="https://howtoirl.org/assets/share/a.png">h</a>']);
});
