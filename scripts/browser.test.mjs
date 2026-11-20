// Browser checks on the built site: every page in site.json at phone and desktop
// width, light and dark, with and without script, in headless Chromium against
// dist/ served with the _headers CSP. Run `npm run build`, then `npm run check:browser`.
// Settings and known problems that are not fixed yet live in browser-checks.json;
// CONTRIBUTING.md explains how to use it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
import {serve} from './serve.mjs';

const require=createRequire(import.meta.url);
const axeSource=await readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const config=JSON.parse(await readFile('site.json','utf8'));
const settings=JSON.parse(await readFile('browser-checks.json','utf8'));

const phone={width:390,height:844,phone:true};
const desktop={width:1280,height:800,phone:false};
// "stored" is the theme a visitor picked with the theme button, kept in localStorage.
// Those variants only compare colours with the matching system theme.
const variants=[
 {name:'phone-light',...phone,scheme:'light',js:true},
 {name:'phone-dark',...phone,scheme:'dark',js:true},
 {name:'desktop-light',...desktop,scheme:'light',js:true,colours:true},
 {name:'desktop-dark',...desktop,scheme:'dark',js:true,colours:true},
 {name:'phone-light-nojs',...phone,scheme:'light',js:false},
 {name:'phone-dark-nojs',...phone,scheme:'dark',js:false},
 {name:'desktop-light-nojs',...desktop,scheme:'light',js:false},
 {name:'desktop-dark-nojs',...desktop,scheme:'dark',js:false},
 // WCAG 1.4.10 Reflow: no sideways scroll at 320 CSS pixels.
 {name:'reflow-320',width:320,height:640,phone:true,scheme:'light',js:true},
 {name:'desktop-stored-dark',...desktop,scheme:'light',stored:'dark',js:true,colours:true,only:'colours',same:'desktop-dark'},
 {name:'desktop-stored-light',...desktop,scheme:'dark',stored:'light',js:true,colours:true,only:'colours',same:'desktop-light'},
];
const axeTags=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'];

// Runs in the page, so it only uses DOM APIs.
function inspect({js,colours}){
 const describe=el=>{
  const parts=[];
  for(let e=el;e&&e!==document.documentElement&&parts.length<4;e=e.parentElement){
   if(e.id){parts.unshift(`#${e.id}`);break;}
   parts.unshift(e.tagName.toLowerCase()+[...e.classList].slice(0,2).map(c=>`.${c}`).join(''));
  }
  return parts.join(' > ');
 };
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';};
 const out=[];
 const width=document.documentElement.clientWidth;
 // Sideways scroll: name the outermost elements that stick out on the right and
 // are not inside a box that scrolls or clips them.
 if(document.documentElement.scrollWidth>width+1){
  const clipped=el=>{for(let e=el.parentElement;e&&e!==document.documentElement;e=e.parentElement)if(getComputedStyle(e).overflowX!=='visible')return true;return false;};
  const wide=[...document.body.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>width+1&&!clipped(el);});
  const outer=wide.filter(el=>!wide.some(o=>o!==el&&o.contains(el)));
  const detail=`page is ${document.documentElement.scrollWidth}px wide in a ${width}px viewport`;
  for(const el of outer.slice(0,5))out.push({check:'overflow',target:describe(el),detail:`${detail}; this element ends at ${Math.round(el.getBoundingClientRect().right)}px`});
  if(!outer.length)out.push({check:'overflow',target:'html',detail});
 }
 for(const img of document.images){
  const src=img.getAttribute('src');
  if(!img.hasAttribute('alt'))out.push({check:'image/alt',target:src,detail:`${describe(img)} has no alt attribute`});
  if(!img.hasAttribute('width')||!img.hasAttribute('height'))out.push({check:'image/size',target:src,detail:`${describe(img)} has no width and height attributes, so the layout shifts when it loads`});
  if(img.complete&&img.naturalWidth===0&&img.loading!=='lazy')out.push({check:'image/broken',target:src,detail:`${describe(img)} did not load`});
 }
 // Without script, a visible control must still do something.
 if(!js)for(const el of document.querySelectorAll('button,input:not([type=hidden]),select,textarea')){
  if(!visible(el)||el.matches('button[popovertarget],button[commandfor]'))continue;
  if(el.form&&el.form.getAttribute('action'))continue;
  const label=(el.getAttribute('aria-label')||el.textContent||el.placeholder||el.name||'').trim().replace(/\s+/g,' ').slice(0,60);
  out.push({check:'nojs/dead-control',target:describe(el),detail:`visible ${el.tagName.toLowerCase()} "${label}" does nothing without script`});
 }
 const props=['color','background-color','background-image','border-top-color','border-bottom-color','outline-color','text-decoration-color','box-shadow','fill','stroke','fill-opacity','opacity','color-scheme'];
 const palette=colours?[document.documentElement,...document.body.querySelectorAll('*')].map(el=>{const s=getComputedStyle(el);return [describe(el),Object.fromEntries(props.map(p=>[p,s.getPropertyValue(p)]))];}):null;
 return {
  findings:out,
  links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.href,from:describe(a)})),
  ids:[...document.querySelectorAll('[id]')].map(e=>e.id).concat([...document.querySelectorAll('a[name]')].map(a=>a.name)),
  palette,
 };
}

async function checkPage(browser,origin,path,variant){
 const findings=[];
 const add=(check,target,detail,impact)=>findings.push({page:path,variant:variant.name,check,target,detail,...(impact?{impact}:{})});
 const context=await browser.newContext({viewport:{width:variant.width,height:variant.height},isMobile:variant.phone,hasTouch:variant.phone,deviceScaleFactor:1,colorScheme:variant.scheme,serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const url=route.request().url();
  // Without script the site's own scripts load as empty files. Neither site uses
  // <noscript> or @media (scripting), so the page is the same as with script
  // switched off, and axe-core can still run (it needs timers).
  if(!variant.js&&url.startsWith(origin+'/')&&new URL(url).pathname.endsWith('.js'))return route.fulfill({status:200,contentType:'text/javascript',body:''});
  if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();
  add('third-party',url,'request to another origin; only first-party resources may load');
  return route.abort();
 });
 if(variant.stored)await context.addInitScript(([key,theme])=>{try{localStorage.setItem(key,theme);}catch{}},[settings.themeStorageKey,variant.stored]);
 const page=await context.newPage();
 const local=text=>text.replaceAll(origin,'');
 // Chrome reports CSP violations (inline handlers, inline styles, other origins) as
 // console errors. Failed loads are reported once, by the response listener.
 page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().startsWith('Failed to load resource'))add('console',local(msg.text()).slice(0,200),local(msg.location().url||''));});
 page.on('pageerror',error=>add('console',local(String(error.message)).slice(0,200),'uncaught exception'));
 page.on('response',response=>{if(response.status()>=400)add('request',local(response.url()),`HTTP ${response.status()}`);});
 page.on('requestfailed',request=>{if(request.url().startsWith(origin))add('request',local(request.url()),request.failure()?.errorText||'failed');});
 await page.goto(`${origin}/${path}`,{waitUntil:'load'});
 await page.evaluate(()=>document.fonts.ready.then(()=>true));
 // Open every fold so that what is inside them is checked too.
 await page.evaluate(()=>{for(const d of document.querySelectorAll('details'))d.open=true;});
 const result=await page.evaluate(inspect,{js:variant.js,colours:!!variant.colours});
 if(variant.only!=='colours'){
  for(const f of result.findings)add(f.check,f.target,f.detail);
  await page.evaluate(axeSource);
  const axe=await page.evaluate(tags=>window.axe.run(document,{runOnly:{type:'tag',values:tags},resultTypes:['violations']}),axeTags);
  for(const v of axe.violations)for(const node of v.nodes)add(`axe/${v.id}`,node.target.join(' '),`${v.help}: ${(node.failureSummary||'').split('\n').slice(1).join(' ').trim().slice(0,200)}`,v.impact);
 }
 await context.close();
 return {findings,links:variant.only?[]:result.links,ids:result.ids,palette:result.palette};
}

// Pages, plus fragment states from browser-checks.json "states": on each listed
// page, every element that matches the selector is also visited as page#id. This
// covers content that only shows when it is the :target.
async function pagesToCheck(){
 const list=[...config.pages];
 for(const [page,selector] of Object.entries(settings.states||{})){
  const html=await readFile(`dist/${page}`,'utf8');
  for(const tag of html.match(/<[a-z]+\b[^>]*>/g)||[])if(matchesSimple(tag,selector))list.push(`${page}#${/\bid="([^"]+)"/.exec(tag)[1]}`);
 }
 return list;
}
// Enough of CSS for "states": tag, classes, [id] and :not(#id), e.g. section.step[id]:not(#start).
function matchesSimple(tag,selector){
 const m=/^([a-z]+)?((?:\.[\w-]+)*)\[id\]((?::not\(#[\w-]+\))*)$/.exec(selector);
 if(!m)throw new Error(`Unsupported state selector (use tag.class[id]:not(#id)): ${selector}`);
 const id=/\bid="([^"]+)"/.exec(tag)?.[1];
 if(!id||(m[1]&&m[1]!==/^<([a-z]+)/.exec(tag)[1]))return false;
 const classes=(/\bclass="([^"]*)"/.exec(tag)?.[1]||'').split(/\s+/);
 if(!m[2].split('.').filter(Boolean).every(c=>classes.includes(c)))return false;
 return ![...m[3].matchAll(/:not\(#([\w-]+)\)/g)].some(n=>n[1]===id);
}

async function pool(items,size,run){
 const results=[];let next=0;
 await Promise.all(Array.from({length:size},async()=>{while(next<items.length){const i=next++;results[i]=await run(items[i]);}}));
 return results;
}

// A baseline entry covers findings with the same page and check, and, when given,
// the same target and one of the listed variants.
function applyBaseline(findings,entries){
 const used=new Set();
 const fresh=findings.filter(f=>{
  const i=entries.findIndex(e=>e.page===f.page&&e.check===f.check&&(e.target===undefined||e.target===f.target)&&(!e.variants||e.variants.includes(f.variant)));
  if(i>=0)used.add(i);
  return i<0;
 });
 return {fresh,stale:entries.filter((_,i)=>!used.has(i))};
}
function group(findings){
 const map=new Map();
 for(const f of findings){
  const k=`${f.page}\n${f.check}\n${f.target}`;
  const {variant,...rest}=f;
  const g=map.get(k)||{...rest,variants:[]};
  if(!g.variants.includes(variant))g.variants.push(variant);
  map.set(k,g);
 }
 return [...map.values()];
}
const show=list=>group(list).map(g=>`${g.page} [${g.variants.join(', ')}] ${g.check}${g.impact?` (${g.impact})`:''}\n  ${g.target}\n  ${g.detail}`).join('\n');

const all=[];
test.before(async()=>{
 const started=Date.now();
 const server=await serve('dist');
 const browser=await chromium.launch();
 let jobs;
 try{
  jobs=(await pagesToCheck()).flatMap(path=>variants.map(variant=>({path,variant})));
  const results=await pool(jobs,Number(process.env.BROWSER_JOBS)||4,({path,variant})=>checkPage(browser,server.origin,path,variant));
  const ids=new Map();const links=[];const palettes=new Map();
  results.forEach((r,i)=>{
   const {path,variant}=jobs[i];
   all.push(...r.findings);
   links.push(...r.links.map(l=>({...l,page:path,variant:variant.name})));
   const file=path.split('#')[0];
   ids.set(file,new Set([...(ids.get(file)||[]),...r.ids]));
   if(r.palette)palettes.set(`${path} ${variant.name}`,r.palette);
  });
  // A theme picked with the theme button must look the same as that system theme.
  for(const {path,variant} of jobs.filter(j=>j.variant.same)){
   const want=palettes.get(`${path} ${variant.same}`),got=palettes.get(`${path} ${variant.name}`);
   if(want.length!==got.length||got.some(([el],i)=>want[i][0]!==el)){all.push({page:path,variant:variant.name,check:'theme/stored',target:'html',detail:`the page has different elements than with ${variant.same}`});continue;}
   const diffs=got.map(([el,style],i)=>[el,Object.keys(style).filter(p=>style[p]!==want[i][1][p]).map(p=>`${p} ${style[p]} instead of ${want[i][1][p]}`)]).filter(([,d])=>d.length);
   for(const [el,d] of diffs.slice(0,5))all.push({page:path,variant:variant.name,check:'theme/stored',target:el,detail:`looks different from ${variant.same}: ${d.join('; ')}`.slice(0,300)});
  }
  // Links and fragments, including those that script adds.
  const status=new Map();
  for(const l of links){
   const url=new URL(l.href);if(url.origin!==server.origin)continue;
   const file=url.pathname.replace(/^\//,'')||'index.html';
   if(!status.has(file))status.set(file,(await fetch(server.origin+url.pathname,{method:'HEAD',redirect:'manual'})).status);
   if(status.get(file)>=400)all.push({page:l.page,variant:l.variant,check:'link',target:l.from,detail:`${url.pathname} answers HTTP ${status.get(file)}`});
   const hash=decodeURIComponent(url.hash.slice(1));
   if(hash&&ids.has(file)&&!ids.get(file).has(hash))all.push({page:l.page,variant:l.variant,check:'anchor',target:l.from,detail:`${url.pathname}#${hash} has no element with that id`});
  }
 }finally{await browser.close();await server.close();}
 if(process.env.BROWSER_REPORT)await writeFile(process.env.BROWSER_REPORT,JSON.stringify(group(all),null,1)+'\n');
 console.log(`# ${jobs.length} page loads, ${all.length} findings before the baseline, ${((Date.now()-started)/1000).toFixed(1)} s`);
});

const categories=[
 ['Accessibility: no axe-core violations (WCAG 2.2 A and AA plus best practice: contrast, names, target size, heading order, landmarks)',f=>f.check.startsWith('axe/')],
 ['Layout: no sideways scroll at 320, 390 and 1280 pixels',f=>f.check==='overflow'],
 ['Console: no errors, uncaught exceptions or CSP violations',f=>f.check==='console'],
 ['Requests: every request succeeds and stays first-party',f=>f.check==='request'||f.check==='third-party'],
 ['Links and fragments in the rendered page resolve',f=>f.check==='link'||f.check==='anchor'],
 ['Images have alt text, width and height, and load',f=>f.check.startsWith('image/')],
 ['Without script, no visible control depends on script',f=>f.check.startsWith('nojs/')],
 ['A theme picked with the theme button matches the system theme',f=>f.check.startsWith('theme/')],
];
for(const [name,match] of categories)test(name,()=>{
 const {fresh}=applyBaseline(all.filter(match),settings.baseline||[]);
 assert.equal(fresh.length,0,`New findings. Fix them, or list them in browser-checks.json "baseline" with a reason:\n${show(fresh)}`);
});
test('Every baseline entry in browser-checks.json still matches a finding',()=>{
 const {stale}=applyBaseline(all,settings.baseline||[]);
 assert.equal(stale.length,0,`These look fixed; remove them from browser-checks.json "baseline":\n${JSON.stringify(stale,null,1)}`);
});
