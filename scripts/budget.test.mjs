import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {measure,compare,raise,limitFor} from './budget.mjs';

test('Pages and assets stay within page-budget.json',async()=>{
 const problems=compare(await measure(),JSON.parse(await readFile('page-budget.json','utf8')));
 assert.deepEqual(problems,[],`Over budget or out of date. If the growth is intended, run npm run budget -- --write and review the diff:\n${problems.join('\n')}`);
});

test('raise only lifts limits the build is over and drops files that are gone',()=>{
 const budget={about:'x',pages:{'a.html':{html:2048,total:10240}},assets:{'assets/old.css':1024,'assets/site.js':4096}};
 const current={pages:{'a.html':{html:3000,total:5000},'b.html':{html:100,total:200}},assets:{'assets/site.js':1000,'assets/new.css':500}};
 const raised=raise(current,budget);
 assert.deepEqual(raised.pages,{'a.html':{html:limitFor(3000),total:10240},'b.html':{html:limitFor(100),total:limitFor(200)}});
 assert.deepEqual(raised.assets,{'assets/site.js':4096,'assets/new.css':limitFor(500)});
 assert.equal(raised.about,'x');
 assert.deepEqual(compare(current,raised),[]);
});
