import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/pipeline.mjs';
test('retrieved scene material reaches generation separately, never becomes review evidence',async()=>{
 const sources=[{ref:'S1',kind:'text',title:'产品事实.md',text:'产品资料原文。'},{ref:'I1',kind:'image',title:'产品外观图',path:'产品/a.jpg',sha256:'a'.repeat(64)}];
 const context={mode:'lexical',results:[{id:'context1',source_type:'scenario',text:'虚构场景，仅供参考',supports_product_fact:false}],stats:{returned:1},warnings:[]};
 let generationSeen=false,reviewSeen=false;
 const result=await runPipeline({product:'测试产品',audience:'职场人员',scenario:'整理会议材料',platform:'朋友圈'},{
  retrieve:async()=>({sources,context_retrieval:context}),
  generate:async args=>{assert.deepEqual(args.knowledgeContext,context);assert.deepEqual(args.sources,sources);generationSeen=true;return {customer_insight:'整理会议材料',strategy:'按原文组织[S1]',content:{title:'准备下一次会议',body:'先把这次要讨论的问题列出来。',call_to_action:'可以带着常用资料来体验。'},image_plan:[{source_ref:'I1',caption:'产品外观图',position:'文末'}],source_refs:['S1','I1'],pending_confirmation:[]};},
  review:async args=>{assert.deepEqual(args.sources,sources);reviewSeen=true;return {claims:args.segments.map(s=>({segment_id:s.id,status:'not_applicable',reason:'任务或素材标签',evidence:[]}))};}
 });
 assert(generationSeen&&reviewSeen);assert.equal(result.checks.semantic_review,'passed');assert.deepEqual(result.meta.context_retrieval,context);
});
