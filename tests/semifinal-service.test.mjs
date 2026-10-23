import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {validateUnderstanding,deriveGate} from '../modules/scenario/shared/contract.mjs';

async function setup(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'semifinal-service-'));
 await fs.mkdir(path.join(directory,'assets'));
 const products=[];
 for(const [index,name,weight] of [[1,'轻型测试本','0.95 kg'],[2,'重型测试本','1.70 kg']]){
  const productPath=`测试知识库/P1-产品参数库/${name}`;
  const text=`# ${name} - 产品事实\n\n## 尺寸与重量\n\n重量\n\n${weight}\n\n## 屏幕\n\n尺寸\n\n14 英寸\n\n## 键盘和触控板\n\n全尺寸背光键盘\n`;
  const sha=createHash('sha256').update(text).digest('hex'),file=`assets/${sha}.md`;
  await fs.writeFile(path.join(directory,file),text);
  products.push({id:`pc-${String(index).padStart(16,'0')}`,name,model:name,system:'Windows',path:productPath,documents:[{title:'产品事实.md',path:productPath+'/产品事实.md',file,sha256:sha}],images:[]});
 }
 await fs.writeFile(path.join(directory,'catalog.json'),JSON.stringify({schema_version:1,knowledge_base:'测试知识库',products,files:[]}));
 let batches=0;
 const analyze=async input=>{
  // A controlled model boundary: the service must retain this new snapshot, not an older ID.
  const sources=input.sources;
  const observations=[];
  for(const source of sources){
   for(const [category,quote] of [['task','每天背电脑'],['mobility','电脑重量不能超过1.0kg']]){
    if(source.text.includes(quote))observations.push({id:`o${observations.length}`,category,kind:'fact',value:quote,evidence:[{sourceId:source.id,quote}],rationale:'测试中的逐字回答',critical:false});
   }
  }
  const understanding=validateUnderstanding({observations,questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}},sources);
  return {schemaVersion:'1.0',analysisId:randomUUID(),input:structuredClone(input),understanding,gate:deriveGate(understanding),review:{status:'pending'},provenance:{kind:'synthetic_test'}};
 };
 const server=createApp({settings:{knowledgeSource:'local',knowledgeDir:directory,searchMode:'lexical',searchCacheDir:path.join(directory,'cache'),baseUrl:'https://api.deepseek.com',port:0},scenarioDependencies:{analyze,batch:async()=>{batches++;throw Error('测试不应调用生成');}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(route,input)=>{
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  return {status:response.status,body:await response.json()};
 };
 return {directory,post,products,batches:()=>batches,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}};
}
const original={id:'scenario',type:'scenario',text:'每天背电脑，希望轻便。'};
const request=(a,product)=>({analysisId:a.analysisId,product,productConfirmed:true,productOrigin:'salesperson_selection',platforms:['小红书']});

test('both service handoff and generation reject a manual weight conflict before calling a model',async()=>{
 const app=await setup();
 try{
  const a=(await app.post('/api/analyze',{sources:[{...original,text:original.text+'电脑重量不能超过1.0kg。'}]})).body;
  assert.equal((await app.post('/api/confirm',{analysisId:a.analysisId,edits:[]})).status,200);
  for(const route of ['/api/handoff','/api/run-scenario']){
   const r=await app.post(route,request(a,app.products[1].name));assert.equal(r.status,400);assert.match(r.body.error.message,/重量.*不符合/);
  }
  assert.equal(app.batches(),0);
  const valid=await app.post('/api/handoff',request(a,app.products[0].name));assert.equal(valid.status,200);assert.equal(valid.body.customer_context.product_selection.name,app.products[0].name);
  // User-supplied decision data cannot replace the server's cached understanding.
  const decision=await app.post('/api/decision',{analysisId:a.analysisId,manualProduct:app.products[1].name,understanding:{observations:[]}});
  assert.equal(decision.status,200);assert.equal(decision.body.candidates.length,0);assert(decision.body.exclusions.some(x=>x.name===app.products[1].name&&x.evidence.length&&x.source_evidence.length));
 }finally{await app.close();}
});

test('clarification uses a fresh analysis snapshot and unknown answers do not trigger repeated questions',async()=>{
 const app=await setup();
 try{
  const first=(await app.post('/api/analyze',{sources:[original]})).body;
  await app.post('/api/confirm',{analysisId:first.analysisId,edits:[]});
  const before=(await app.post('/api/decision',{analysisId:first.analysisId})).body;
  assert(before.questions.some(q=>q.id==='weight_limit'));
  const unknown={id:'revision_unknown',type:'revision',text:'关键追问 weight_limit（mobility）的客户补充，以此为准：暂不清楚'};
  const second=(await app.post('/api/analyze',{sources:[original,unknown],parentAnalysisId:first.analysisId})).body;
  assert.notEqual(second.analysisId,first.analysisId);
  // New analysis must still be confirmed; an older confirmed snapshot cannot confirm it.
  assert.equal((await app.post('/api/handoff',request(second,app.products[0].name))).status,400);
  await app.post('/api/confirm',{analysisId:second.analysisId,edits:[]});
  const after=(await app.post('/api/decision',{analysisId:second.analysisId})).body;
  assert(!after.questions.some(q=>q.id==='weight_limit'));
  const unknownHandoff=(await app.post('/api/handoff',request(second,app.products[0].name))).body;
  assert.equal(unknownHandoff.analysis_id,second.analysisId);assert.deepEqual(unknownHandoff.customer_context.original_sources,[original,unknown]);
  assert(!unknownHandoff.customer_context.understanding.observations.some(o=>o.kind==='fact'&&o.value==='暂不清楚'));
  const known={id:'revision_known',type:'revision',text:'关键追问 weight_limit（mobility）的客户补充，以此为准：电脑重量不能超过1.0kg'};
  const third=(await app.post('/api/analyze',{sources:[original,unknown,known],parentAnalysisId:second.analysisId})).body;
  await app.post('/api/confirm',{analysisId:third.analysisId,edits:[]});
  const updated=(await app.post('/api/decision',{analysisId:third.analysisId})).body;
  assert(updated.exclusions.some(x=>x.name===app.products[1].name&&x.evidence.some(e=>e.sourceId==='revision_known')));
  assert.equal((await app.post('/api/handoff',request(third,app.products[1].name))).status,400);
  assert.equal(app.batches(),0);
 }finally{await app.close();}
});

test('missing decision snapshots and unavailable knowledge fail explicitly without trusting client candidates',async()=>{
 const app=await setup();
 try{
  const missing=await app.post('/api/decision',{analysisId:randomUUID(),candidates:[{name:'伪造型号'}]});assert.equal(missing.status,410);
  const a=(await app.post('/api/analyze',{sources:[original]})).body;await app.post('/api/confirm',{analysisId:a.analysisId,edits:[]});
  await fs.unlink(path.join(app.directory,'catalog.json'));
  const decision=await app.post('/api/decision',{analysisId:a.analysisId});assert.notEqual(decision.status,200);assert(decision.body.error);
  const run=await app.post('/api/run-scenario',request(a,app.products[0].name));assert.notEqual(run.status,200);assert.equal(app.batches(),0);
 }finally{await app.close();}
});
