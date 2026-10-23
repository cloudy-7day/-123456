import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import {randomUUID} from 'node:crypto';
import { createRunDiagnostics, diagnosticSummary, diagnosticPhase } from '../src/run-diagnostics.mjs';
import { createApp } from '../server.mjs';
import { validateUnderstanding } from '../modules/scenario/shared/contract.mjs';

test('diagnostic classification preserves only controlled phases and failure categories',()=>{
  for(const [message,phase] of [['正在取得本轮产品原文','retrieval'],['正在根据原文生成销售内容','generation'],['正在把有据功能融入小红书场景文案','polish'],['正在逐句对照知识库核验 · 第 2 次','evidence_review']])assert.equal(diagnosticPhase(message),phase);
  assert.equal(diagnosticPhase('private text'),'generation');
  for(const [error,category] of [[{code:'MODEL_FORMAT_ERROR'},'FORMAT'],[{message:'DeepSeek HTTP 401，private'},'AUTH'],[{code:'ECONNRESET'},'NETWORK'],[{message:'没有取得可读的产品原文，停止生成。'},'EVIDENCE_BLOCKED'],[{message:'output.title 为必填项'},'STRUCTURE_INVALID']]){
    const row=diagnosticSummary({error,phase:'evidence_review'});
    assert.equal(row.error.category,category);assert.equal(row.phase,'evidence_review');
    assert.doesNotMatch(JSON.stringify(row),/private|output.title/);
  }
  assert.equal(diagnosticSummary({error:{code:'MODEL_FORMAT_ERROR'}}).error.code,'MODEL_FORMAT_ERROR');
});
test('failed review details survive later runs and keep only ten bounded local archives',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'review-archive-'));
 try{
  const diagnostics=createRunDiagnostics({file:path.join(dir,'history.json')});
  for(let i=0;i<12;i++)await diagnostics.record({run_id:randomUUID(),stage:'generate',status:'failed'},[{product:'测试型号',review_trace:[{attempt:1,issues:['C1 缺少依据']}]}]);
  await diagnostics.record({run_id:randomUUID(),stage:'generate',status:'success'});
  const files=await fs.readdir(path.join(dir,'failed-reviews'));assert.equal(files.length,10);
  const saved=JSON.parse(await fs.readFile(path.join(dir,'failed-reviews',files[0]),'utf8'));assert.deepEqual(saved.results[0].review_trace[0].issues,['C1 缺少依据']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('diagnostics serialize concurrent updates, bound history and omit raw private data', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'run-diagnostics-'));
  try {
    const file=path.join(dir,'history.json');
    const a=createRunDiagnostics({file}), b=createRunDiagnostics({file});
    await Promise.all(Array.from({length:25},(_,i)=>(i%2?a:b).record({run_id:`run-${i}`,stage:'generate',status:'failed',error:Error('Bearer secret customer input'),input:'private',attempts:2,review_issues:['private claim text']})));
    const rows=await a.list();
    assert.equal(rows.length,20);
    assert.equal(new Set(rows.map(r=>r.run_id)).size,20);
    assert.equal(rows[0].run_id,'run-24');
    assert.equal(rows[0].attempts,2);
    assert.equal(rows[0].review_issue_count,1);
    assert.doesNotMatch(await fs.readFile(file,'utf8'),/secret|private|Bearer|customer/);
    assert.deepEqual(await fs.readdir(dir),['history.json']);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('stream failures retain diagnostic ids and generation attempts without saving latest', async () => {
  const records=[];
  const sources=[{id:'scenario',type:'scenario',text:'客户想写课堂笔记。'}];
  const analysis={analysisId:'00000000-0000-4000-8000-000000000001',input:{sources},understanding:validateUnderstanding({observations:[{id:'task',category:'task',kind:'fact',value:'客户想写课堂笔记。',evidence:[{sourceId:'scenario',quote:'客户想写课堂笔记。'}],rationale:'原话',critical:false}],questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}},sources),review:{status:'pending'}};
  const server=createApp({settings:{knowledgeSource:'ima',baseUrl:'https://api.deepseek.com'},scenarioDependencies:{analyze:async()=>analysis,batch:async(_handoff,_settings,send)=>{send({type:'platform_error',message:'mock failed'});throw Object.assign(Error('mock failure'),{code:'MODEL_INVALID_JSON'});},diagnostics:{record:async row=>records.push(row),list:async()=>records}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(route,input)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  try {
    await post('/api/analyze',{});
    assert.equal((await post('/api/confirm',{analysisId:analysis.analysisId,edits:[]})).status,200);
    const response=await post('/api/run-scenario',{analysisId:analysis.analysisId,product:'测试电脑',productOrigin:'salesperson_selection',productConfirmed:true,platforms:['小红书']});
    assert.equal(response.status,200);
    const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(events.at(-1).type,'error');
    const row=records.at(-1);
    assert.equal(row.stage,'generate');assert.equal(row.status,'failed');assert.equal(row.attempts,1);
    for(const event of events){assert.equal(event.run_id,row.run_id);assert.ok(event.message.includes(row.run_id));}
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('analysis errors carry a persisted diagnostic id; success survives diagnostic write failure', async () => {
  const records=[];
  let fails=true, broken=false;
  const server=createApp({settings:{knowledgeSource:'ima'},scenarioDependencies:{analyze:async()=>{if(fails)throw Object.assign(Error('private model body'),{code:'MODEL_INVALID_JSON'});return {analysisId:'ok'};},diagnostics:{record:async row=>{if(broken)throw Error('disk failed');records.push(row);},list:async()=>records}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const post=()=>fetch(base+'/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    const failure=await (await post()).json();
    assert.ok(failure.error.run_id);
    assert.match(failure.error.message,new RegExp(failure.error.run_id));
    assert.equal(records[0].run_id,failure.error.run_id);
    assert.equal(records[0].status,'failed');
    assert.equal(records[0].stage,'analyze');
    fails=false;broken=true;
    assert.equal((await post()).status,200);
    const cross=await fetch(base+'/api/run-diagnostics',{headers:{origin:'https://example.com'}});
    assert.equal(cross.status,403);
    broken=false;
    assert.deepEqual((await (await fetch(base+'/api/run-diagnostics')).json()).runs,records);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
