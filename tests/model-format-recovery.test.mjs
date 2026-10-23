import test from 'node:test';
import assert from 'node:assert/strict';
import {DeepSeekClient} from '../src/deepseek.mjs';
const args={input:{product:'测试',platform:'小红书'},sources:[],outputSchema:{},system:'test'};
function client(responses){let calls=0;return {api:new DeepSeekClient({model:'test',baseUrl:'http://localhost:1234',fetchImpl:async()=>{const entry=responses[calls++];return {ok:entry.ok!==false,status:entry.status||200,json:async()=>({choices:[{finish_reason:entry.finish||'stop',message:{content:entry.content}}]})};}}),calls:()=>calls};}
test('invalid model JSON gets one bounded format retry, not fabricated content',async()=>{
 const c=client([{content:'{"content":'}, {content:'{"content":{"title":"有效标题"}}'}]);
 assert.equal((await c.api.generate(args)).content.title,'有效标题');assert.equal(c.calls(),2);
});
test('repeated malformed JSON and authentication errors remain explicit failures',async()=>{
 const malformed=client([{content:'no json'},{content:'still no json'}]);await assert.rejects(malformed.api.generate(args),/JSON|格式/);assert.equal(malformed.calls(),2);
 const auth=client([{ok:false,status:401}]);await assert.rejects(auth.api.generate(args),/401/);assert.equal(auth.calls(),1);
});
test('truncated output is never silently accepted or blindly retried',async()=>{
 const c=client([{finish:'length',content:'{}'}]);await assert.rejects(c.api.generate(args),/截断/);assert.equal(c.calls(),1);
});
test('incomplete review retries only missing segments without rewriting the article',async()=>{
 const c=client([{content:JSON.stringify({claims:[{segment_id:'C1',status:'not_applicable',reason:'标题',evidence:[]}]})},{content:JSON.stringify({claims:[{segment_id:'C2',status:'not_applicable',reason:'任务',evidence:[]}]})}]);
 const result=await c.api.review({input:{product:'测试'},output:{},sources:[],segments:[{id:'C1',text:'标题'},{id:'C2',text:'整理资料'}]});
 assert.equal(c.calls(),2);assert.deepEqual(result.claims.map(c=>c.segment_id),['C1','C2']);
});
