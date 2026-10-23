import test from 'node:test';
import assert from 'node:assert/strict';
import {DeepSeekClient} from '../src/deepseek.mjs';
const input={product:'测试机型',scenario:'图书馆写报告',platform:'小红书'};
test('polish retains feature evidence and its conditions alongside specifications, never image captions as capability proof',async()=>{
 let sent;const client=new DeepSeekClient({model:'test',baseUrl:'http://localhost:1234',fetchImpl:async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({title:'标题',body:'正文',call_to_action:'聊聊'})},finish_reason:'stop'}]})};}});
 const sources=[{ref:'S1',kind:'text',title:'产品事实.md',text:'支持触控。'},{ref:'S2',kind:'text',title:'卖点与限制.md',text:'碰一碰传送需支持设备登录同一华为账号。'},{ref:'S3',kind:'text',title:'图片索引.csv',text:'手机展示'},{ref:'I1',kind:'image',text:'多屏示意'}];
 await client.polish({input,output:{pending_confirmation:[],image_plan:[]},sources});
 const payload=JSON.parse(sent.messages[1].content);
 assert.deepEqual(payload.evidence.map(s=>s.ref),['S1','S2']);
 assert.equal(payload.evidence[1].text,sources[1].text);
 assert.match(sent.messages[0].content,/不同需求/);
 assert.match(sent.messages[0].content,/缩短/);
});
test('generation rebuilds citation bookkeeping from actual text and image references',async()=>{
 const draft={content:{title:'标题',body:'功能[S1]。',call_to_action:'聊聊？'},image_plan:[{source_ref:'I1',caption:'外观'}],source_refs:['S2']};
 const client=new DeepSeekClient({model:'test',baseUrl:'http://localhost:1234',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(draft)},finish_reason:'stop'}]})})});
 const result=await client.generate({input,sources:[],outputSchema:{},system:'test'});
 assert.deepEqual(result.source_refs,['S1','I1']);
 assert.deepEqual(result.content,draft.content);
});
test('generation transmits research separately and forwards bounded revision feedback',async()=>{
 let sent;const client=new DeepSeekClient({model:'test',baseUrl:'http://localhost:1234',fetchImpl:async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'{}'},finish_reason:'stop'}]})};}});
 const researchContext={customer_facts:[],scenario_id:'SC01'},revisionFeedback={issues:['删除没有证据的兼容承诺']};
 await client.generate({input,sources:[],outputSchema:{},system:'test',researchContext,revisionFeedback});
 const payload=JSON.parse(sent.messages[1].content);assert.deepEqual(payload.research_context,researchContext);assert.deepEqual(payload.revision_feedback,revisionFeedback);
});
test('review sends original text and current final segments, never research as product evidence',async()=>{
 let sent;const client=new DeepSeekClient({model:'test',baseUrl:'http://localhost:1234',fetchImpl:async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"claims":[]}'},finish_reason:'stop'}]})};}});
 assert.equal(typeof client.review,'function');
 await client.review({input,output:{pending_confirmation:[]},segments:[{id:'C1',text:'支持触控'}],sources:[{ref:'S1',kind:'text',text:'支持触控'},{ref:'I1',kind:'image',description:'手机协同'}],researchContext:{invented:'不应成为产品证据'}});
 const payload=JSON.parse(sent.messages[1].content);assert.equal(payload.evidence.length,1);assert.equal(payload.evidence[0].ref,'S1');assert(!JSON.stringify(payload).includes('不应成为产品证据'));
});

test('revision removes rejected product claims from the editable draft before asking for a coherent repair',async()=>{
 let sent;const draft={content:{title:'整理汇报',body:'先收好照片。触控能自动批注所有文档。再整理反馈。',call_to_action:'你怎么做？'},image_plan:[],source_refs:[]};
 const client=new DeepSeekClient({model:'test',baseUrl:'http://localhost:1234',fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(draft)},finish_reason:'stop'}]})};}});
 await client.generate({input,sources:[],outputSchema:{},system:'test',revisionFeedback:{previous_output:draft,issues:['C2 触控能自动批注所有文档。：缺少证据'],segments:[{id:'C2',location:'content.body',text:'触控能自动批注所有文档。'}]}});
 const payload=JSON.parse(sent.messages[1].content);
 assert.equal(payload.draft.content.body,'先收好照片。再整理反馈。');
 assert.equal(draft.content.body,'先收好照片。触控能自动批注所有文档。再整理反馈。');
});
