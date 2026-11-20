import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {measure,compare} from './budget.mjs';

test('Pages and assets stay within page-budget.json',async()=>{
 const problems=compare(await measure(),JSON.parse(await readFile('page-budget.json','utf8')));
 assert.deepEqual(problems,[],`Over budget or out of date. If the growth is intended, run npm run budget -- --write and review the diff:\n${problems.join('\n')}`);
});
