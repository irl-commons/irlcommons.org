// Fails the build when text listed in banned-phrases.txt shows up anywhere in dist/.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';

const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:"'",lsquo:"'",ldquo:'"',rdquo:'"',hellip:'...',mdash:'-',ndash:'-'};
const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):(ENTITIES[e.toLowerCase()]??m));
export const normalize=s=>decode(s).replace(/[‘’ʼ]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'...').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
// Two views of each file: the raw text (attributes, scripts, JSON) and the visible text with tags removed,
// so a phrase split by markup (<a>, <strong>, a line break) is still found.
export const views=text=>[normalize(text),normalize(text.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/ ([.,;:!?])/g,'$1')];
export const findBanned=(text,phrases)=>{const v=views(text);return phrases.filter(p=>v.some(x=>x.includes(normalize(p))));};

const phrases=(await readFile('banned-phrases.txt','utf8')).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));

async function files(dir){
 const out=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name);
  if(e.isDirectory())out.push(...await files(p));
  else if(/\.(html?|js|mjs|json|xml|txt|svg|webmanifest)$/i.test(e.name))out.push(p);
 }
 return out;
}

test('The banned-phrases check finds a phrase through markup, quotes, entities and case',()=>{
 assert.ok(phrases.length>0);
 assert.deepEqual(findBanned('<p>Spot something <a href="x">wrong</a>\n on this site? Say so.</p>',['Spot something wrong on this site?']),['Spot something wrong on this site?']);
 assert.deepEqual(findBanned('<p>Most of what&#8217;s below isn&rsquo;t built yet.</p>',["Most of what's below isn't built yet"]),["Most of what's below isn't built yet"]);
 assert.deepEqual(findBanned('<meta name="description" content="Ideas for CHAT MODS">',['Chat mods']),['Chat mods']);
 assert.deepEqual(findBanned('<h3>Mods</h3><p>Missing your app?</p>',phrases),[]);
});
test('No cut text has come back on any built page or asset',async()=>{
 const found=[];
 for(const f of await files(path.resolve('dist'))){
  for(const p of findBanned(await readFile(f,'utf8'),phrases))found.push(`${path.relative('dist',f)}: "${p}"`);
 }
 assert.deepEqual(found,[],`Cut text is back (see banned-phrases.txt):\n${found.join('\n')}`);
});
