import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {buildHandoff} from '../src/handoff.mjs';
import {runShadowBatch} from '../src/shadow-batch.mjs';
import {validateUnderstanding,deriveGate} from '../modules/scenario/shared/contract.mjs';
import {understand} from '../modules/scenario/server/understand.mjs';
import {samples} from '../modules/scenario/shared/samples.mjs';
import {createApp} from '../server.mjs';

export function sampleAnalysis(){
 const sources=[{id:'scenario',type:'scenario',text:'我每天带电脑出差，只用浏览器看文档。'}];
 const understanding=validateUnderstanding({observations:[{id:'o1',category:'task',kind:'fact',value:'只用浏览器看文档',evidence:[{sourceId:'scenario',quote:'只用浏览器看文档'}],rationale:'客户原话',critical:false}],questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}},sources);
 return {schemaVersion:'1.0',analysisId:randomUUID(),createdAt:new Date().toISOString(),input:{sources},understanding,review:{status:'confirmed',edits:[]},gate:deriveGate(understanding,{reviewed:true}),provenance:{kind:'user_input'},call:{model:'test-fixture',durationMs:1,attempts:1}};
}
const opts=a=>({analysisId:a.analysisId,product:'MateBook 14 酷睿 Ultra',productConfirmed:true,platforms:['小红书','公众号','朋友圈']});
const draft={customer_insight:'客户经常出差',strategy:'带原有任务到店体验',content:{title:'测试标题',body:'测试原文[S1]',call_to_action:'到店体验'},image_plan:[],sales_plan:{quote:'暂不报价',demo_script:'测试演示'},follow_up:[],source_refs:['S1'],pending_confirmation:[]};

test('confirmed rich understanding converts to three unchanged legacy input contracts without inventing audience',()=>{
 const a=sampleAnalysis(),h=buildHandoff(a,opts(a));assert.equal(h.tasks.length,3);assert.deepEqual(Object.keys(h.tasks[0]),['product','audience','scenario','platform','goal','notes']);assert.match(h.tasks[0].audience,/不推断/);assert.equal(h.customer_context.understanding.product.status,'unspecified');assert.equal(h.customer_context.product_selection.origin,'salesperson_selection');
});
test('unselected model, unreviewed output, critical unknowns and forged gate cannot enter generation',()=>{
 const a=sampleAnalysis();assert.throws(()=>buildHandoff(a,{...opts(a),product:''}));assert.throws(()=>buildHandoff(a,{...opts(a),productConfirmed:false}));a.review.status='pending';assert.throws(()=>buildHandoff(a,opts(a)),/确认/);a.review.status='confirmed';a.understanding.questions=[{id:'q',topic:'software',priority:'blocking',question:'软件是什么？',why:'决定适用性',evidence:[]}];a.gate.status='ready_for_ima';assert.throws(()=>buildHandoff(a,opts(a)),/软件/);
});
test('long input is rejected instead of truncated; original and revisions retained',()=>{
 const a=sampleAnalysis();a.input.sources.push({id:'revision',type:'revision',text:'更正，以此为准：只用浏览器，不用其他软件。'});assert.match(buildHandoff(a,opts(a)).tasks[0].scenario,/后续更正/);a.input.sources.push({id:'long',type:'supplement',text:'字'.repeat(2001)});assert.throws(()=>buildHandoff(a,opts(a)),/2000/);
});
test('batch retrieves once, preserves legacy output wrapper and reports partial failure explicitly',async()=>{
 const a=sampleAnalysis(),h=buildHandoff(a,opts(a));let reads=0;const events=[];
 const result=await runShadowBatch(h,{model:'test-model'},e=>events.push(e),{ima:{retrieve:async()=>{reads++;return {sources:[{ref:'S1',kind:'text',title:'fixture',text:'仅用于测试'}]};}},ds:{generate:async args=>{assert.equal(args.customerContext.understanding.product.status,'unspecified');if(args.input.platform==='公众号')throw Error('测试失败');return draft;}}});
 assert.equal(reads,1);assert.equal(result.complete,false);assert.equal(result.results.length,2);assert.equal(result.errors[0].platform,'公众号');assert.equal(result.results[0].result.checks.semantic_review,'not_performed');assert(events.some(e=>e.type==='platform_error'));
});
test('modified sample never presents added details as the original post',async()=>{
 const sources=[{id:'scenario',type:'scenario',text:'仅阅读文档，这是修改后的输入。'}];const raw={observations:[{id:'o',category:'task',kind:'fact',value:'仅阅读文档',evidence:[{sourceId:'scenario',quote:'仅阅读文档'}],rationale:'原话',critical:false}],questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}};
 const a=await understand({sources,sampleId:samples[0].id},{apiKey:'test',endpoint:'https://api.deepseek.com/chat/completions',model:'test'},{fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]})})});assert.equal(a.provenance.modifiedFromSample,true);assert.match(a.provenance.modificationNotice,/新增内容不属于源帖/);
});
test('same-origin service enforces server confirmation, serves both UIs and emits final stream error after HTTP 200',async()=>{
 const a=sampleAnalysis();a.review.status='pending';const server=createApp({settings:{port:0,model:'test',baseUrl:'https://api.deepseek.com',apiKey:'test'},scenarioDependencies:{analyze:async()=>structuredClone(a),batch:async()=>{throw Error('ima 未配置测试');}}});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const post=(route,data)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(base+'/scenario/')).status,200);assert.match(await (await fetch(base+'/')).text(),/门店增长/);
  await post('/api/analyze',{});assert.equal((await post('/api/handoff',opts(a))).status,400);
  assert.equal((await post('/api/confirm',{analysisId:a.analysisId,edits:[]})).status,200);
  assert.equal((await post('/api/handoff',opts(a))).status,200);
  const run=await post('/api/run-scenario',opts(a));assert.equal(run.status,200);const events=(await run.text()).trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).type,'error');assert.match(events.at(-1).message,/ima/);
  await post('/api/confirm',{analysisId:a.analysisId,edits:[{id:'o1',value:'改用大型软件'}]});assert.equal((await post('/api/handoff',opts(a))).status,400);
  assert.equal((await post('/api/confirm',{analysisId:a.analysisId,edits:[]})).status,409);
  const foreign=await fetch(base+'/api/handoff',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(opts(a))});assert.equal(foreign.status,403);
  assert.equal((await fetch(base+'/.env.local')).status,404);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('expanded task load and collaboration survive evidence validation and legacy handoff',()=>{
 const a=sampleAnalysis();a.input.sources[0].text='同时开20个网页。五万行表格。用平板作扩展屏。';
 a.understanding=validateUnderstanding({observations:[
  {id:'load',category:'performance',kind:'fact',value:'五万行表格',evidence:[{sourceId:'scenario',quote:'五万行表格'}],rationale:'负载陈述，不推算硬件档位',critical:false},
  {id:'sync',category:'collaboration',kind:'fact',value:'用平板作扩展屏',evidence:[{sourceId:'scenario',quote:'用平板作扩展屏'}],rationale:'目标动作，支持情况待资料核验',critical:false}
 ],questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}},a.input.sources);
 a.understandingStandard={version:'0.2',dimensionIds:['performance','collaboration'],researchSourceCount:12};
 const h=buildHandoff(a,opts(a));assert.equal(h.customer_context.understanding.observations.find(o=>o.category==='performance').value,'五万行表格');
 assert.equal(h.customer_context.understanding.observations.find(o=>o.category==='collaboration').evidence[0].quote,'用平板作扩展屏');
 for(const key of ['mobility','storage','experience','lifecycle'])assert.equal(h.customer_context.understanding.observations.find(o=>o.category===key).value,null);
 assert.equal(h.customer_context.understanding_standard.version,'0.2');assert.equal(h.tasks[0].platform,'小红书');
});
test('one round rejects more than three critical clarification questions',()=>{
 const a=sampleAnalysis();const raw={observations:[{id:'o',category:'task',kind:'unknown',value:null,evidence:[],rationale:'未提供',critical:false}],questions:Array.from({length:4},(_,i)=>({id:'q'+i,topic:'task',priority:'blocking',question:'问题'+i,why:'用于核验',evidence:[]})),conflicts:[],product:{status:'unspecified',name:null,evidence:[]}};
 assert.throws(()=>validateUnderstanding(raw,a.input.sources),/三项/);
});
