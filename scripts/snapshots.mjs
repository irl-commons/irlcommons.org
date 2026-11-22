// Full-page screenshots of every page at phone and desktop width, light and dark,
// for looking at a change before and after. Not a test.
//   npm run snapshots -- before        (on main, after npm run build)
//   npm run snapshots -- after before  (on the branch: takes "after", lists what changed since "before")
// Files go to .snapshots/<label>/, which git ignores.
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serve} from './serve.mjs';

const [label='current',compareWith]=process.argv.slice(2);
if(!/^[\w.-]+$/.test(label)||(compareWith&&!/^[\w.-]+$/.test(compareWith)))throw new Error('Labels may only use letters, digits, dot, dash and underscore');
const config=JSON.parse(await readFile('site.json','utf8'));
const out=`.snapshots/${label}`;
await mkdir(out,{recursive:true});
const server=await serve('dist');
const browser=await chromium.launch();
try{
 for(const [view,width,height,phone] of [['phone',390,844,true],['desktop',1280,800,false]])for(const scheme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height},isMobile:phone,hasTouch:phone,colorScheme:scheme,reducedMotion:'reduce'});
  const page=await context.newPage();
  for(const name of config.pages){
   await page.goto(`${server.origin}/${name==='index.html'?'':name.replace(/\.html$/,'')}`,{waitUntil:'load'});
   await page.evaluate(()=>document.fonts.ready.then(()=>true));
   await page.screenshot({path:`${out}/${name.replace(/\.html$/,'')}-${view}-${scheme}.png`,fullPage:true,animations:'disabled',caret:'hide'});
  }
  await context.close();
 }
}finally{await browser.close();await server.close();}
console.log(`Wrote ${out}/`);
if(compareWith){
 const before=`.snapshots/${compareWith}`;
 const changed=[];
 for(const file of (await readdir(out)).sort()){
  const a=await readFile(`${before}/${file}`).catch(()=>null);
  if(!a||!a.equals(await readFile(`${out}/${file}`)))changed.push(file);
 }
 console.log(changed.length?`Changed since ${compareWith}:\n${changed.map(f=>`  ${f}`).join('\n')}`:`No changes since ${compareWith}`);
}
