import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/pipeline.mjs';
const input={product:'测试完整型号',audience:'学生',scenario:'图书馆准备小组汇报',platform:'小红书'};
const sources=[{ref:'S1',kind:'text',title:'产品事实.md',text:'支持触控。'}];
import {applyClaimRepairs} from '../src/targeted-repair.mjs';
const draft=()=>({customer_insight:'学生准备汇报',strategy:'按明确任务展开',content:{title:'准备小组汇报',body:'支持触控。[S1]',call_to_action:'你怎样整理资料？'},image_plan:[],source_refs:['S1'],pending_confirmation:[]});
const review=async({segments})=>({claims:segments.map(s=>({segment_id:s.id,status:s.location==='content.body'?'supported':'not_applicable',reason:'对照原文',evidence:s.location==='content.body'?[{source_ref:'S1',quote:'支持触控。'}]:[]}))});

test('editorial failures trigger whole-copy editing and the replacement is independently reviewed',async()=>{
 let edits=0;const examined=[];
 const result=await runPipeline({...input,platform:'朋友圈'},{retrieve:async()=>({sources}),generate:async()=>draft(),
  checkCopy:({output})=>({passed:output.content.body.includes('讨论稿'),issues:output.content.body.includes('讨论稿')?[]:['Q：多个卖点，需重新组织全文']}),
  polish:async({output,revisionFeedback})=>{edits++;return revisionFeedback?{...output,content:{...output.content,body:'讨论稿，支持触控。[S1]'}}:output;},
  review:async args=>{examined.push(args.output.content.body);return review(args);}
 });
 assert.equal(edits,2);assert.deepEqual(examined,['支持触控。[S1]','讨论稿，支持触控。[S1]']);assert.equal(result.copy_quality.passed,true);
});
test('passing fact review cannot bypass a persistent editorial failure',async()=>{
 const r=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft(),review,
  polish:async({output})=>output,checkCopy:()=>({passed:false,issues:['Q：正文存在重复']})});
 assert.equal(r.delivery.status,'blocked');assert.equal(r.copy_quality.passed,false);assert.equal(r.output.content.body,'');
 assert.equal(r.review_trace.length,4);
});
test('research is injected separately from facts and final text is actually reviewed',async()=>{
 const context={scenario_id:'SC01',customer_facts:[],research_context:[],writing_patterns:[],provenance:{record_ids:['SC01']}};
 let seen;let reviews=0;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),retrieveResearch:async()=>context,generate:async args=>{seen=args.researchContext;return draft();},review:async args=>{reviews++;return review(args);}});
 assert.deepEqual(seen,context);assert.equal(reviews,1);assert.equal(result.checks.semantic_review,'passed');assert.equal(result.meta.research.scenario_id,'SC01');
});
test('failed review rewrites once and reviews the changed final copy again',async()=>{
 let generations=0,reviews=0,feedback;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async args=>{generations++;feedback=args.revisionFeedback;return draft();},review:async args=>{reviews++;if(reviews===1)return {claims:[]};return review(args);}});
 assert.equal(generations,2);assert.equal(reviews,2);assert(feedback.issues.length);assert.equal(result.checks.semantic_review,'passed');assert.equal(result.review_trace.length,2);
});
test('repeated missing evidence blocks delivery and removes publishable content',async()=>{
 let calls=0;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>{calls++;return draft();},review:async()=>({claims:[]})});
 assert.equal(calls,2);assert.equal(result.delivery.status,'blocked');assert.equal(result.checks.semantic_review,'blocked');assert.equal(result.output.content.body,'');assert.deepEqual(result.output.image_plan,[]);
});
test('review diagnostics never inject fake citations or overlong fields into blocked output',async()=>{
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft(),review:async({segments})=>({claims:segments.map(s=>({segment_id:s.id,status:'unsupported',reason:'缺少[S999]原文'+'字'.repeat(1000),evidence:[]}))})});
 assert.equal(result.delivery.status,'blocked');assert(!result.output.source_refs.includes('S999'));assert(result.output.pending_confirmation.every(s=>s.length<=900));
});
test('XHS revision removes specification lists even when the facts themselves are supported',async()=>{
 let generations=0,feedback;
 const result=await runPipeline(input,{retrieve:async()=>({sources:[{ref:'S1',kind:'text',text:'屏幕尺寸14.2英寸。支持触控。'}]}),generate:async args=>{feedback=args.revisionFeedback;generations++;const d=draft();if(generations===1)d.content.body='屏幕尺寸14.2英寸。[S1]';return d;},review:async({segments})=>({claims:segments.map(s=>({segment_id:s.id,status:s.location==='content.body'?'supported':'not_applicable',reason:'对照原文',evidence:s.location==='content.body'?[{source_ref:'S1',quote:generations===1?'屏幕尺寸14.2英寸。':'支持触控。'}]:[]}))})});
 assert.equal(generations,2);assert(feedback.issues.some(s=>/^C\d+\s/.test(s)&&s.includes('参数')),'style feedback identifies the actual rejected segment so repair can remove it');assert.equal(result.checks.semantic_review,'passed');
});
test('evidence review examines the polished final copy instead of an earlier draft',async()=>{
 let reviewed;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft(),polish:async({output})=>({...output,content:{...output.content,body:'整理汇报时，支持触控。[S1]'}}),review:async args=>{reviewed=args.output.content.body;return review(args);}});
 assert.equal(reviewed,'整理汇报时，支持触控。[S1]');assert.equal(result.output.content.body,reviewed);
});

test('revision fixes the reviewed final draft without an extra free-form polish that can restore rejected claims',async()=>{
 let polishes=0,reviews=0,revision;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async args=>{revision=args.revisionFeedback;return draft();},polish:async({output})=>{polishes++;return output;},review:async args=>{reviews++;return reviews===1?{claims:[]}:review(args);}});
 assert.equal(polishes,1);assert.equal(reviews,2);assert(revision.previous_output.content.body);assert.equal(result.checks.semantic_review,'passed');
});

test('XHS presentation omits screen size and ratio prefixes before final factual review',async()=>{
 let seen;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft(),polish:async({output})=>({...output,content:{...output.content,body:'这块14.2英寸3:2比例的屏幕支持触控。[S1]'}}),review:async args=>{seen=args.output.content.body;return review(args);}});
 assert.equal(seen,'这块屏幕支持触控。[S1]');assert.equal(result.output.content.body,seen);assert.equal(result.checks.semantic_review,'passed');
});

test('screen ratio cleanup recognizes anti-reflection modifiers without dropping the feature for review',async()=>{
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>({...draft(),content:{...draft().content,body:'这块3:2 OLED抗反射触控屏支持触控。[S1]'}}),review});
 assert.equal(result.output.content.body,'这块OLED抗反射触控屏支持触控。[S1]');
 assert.equal(result.checks.semantic_review,'passed');
});

test('image plan excludes similar angles before caption review and fills from other angles',async()=>{
 const imgs=['绿色正面','粉色正面','键盘俯视','机身侧面'].map((title,i)=>({ref:`I${i+1}`,kind:'image',title,path:`product/${i}.png`,sha256:String(i+1).repeat(64)}));
 const d=draft();d.image_plan=imgs.slice(0,3).map(x=>({source_ref:x.ref,position:'配图',caption:'产品外观图'}));d.source_refs=['S1','I1','I2','I3'];
 let reviewed;
 const result=await runPipeline(input,{retrieve:async()=>({sources:[...sources,...imgs],retrieval:{product_path:'product'}}),generate:async()=>d,review:async args=>{reviewed=args.output.image_plan;return review(args);}});
 assert.deepEqual(reviewed.map(x=>x.source_ref),['I1','I3','I4']);
 assert.equal(result.checks.semantic_review,'passed');assert(result.image_review.rejected.some(x=>x.ref==='I2'&&x.reason==='same-angle'));
 assert.deepEqual(result.output.source_refs,['S1','I1','I3','I4']);
});
test('local repair reuses only unchanged validated sentences, while every replacement is reviewed',async()=>{
 const calls=[];let generated=0;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>{generated++;const d=draft();d.content.body='支持触控。[S1]键盘保证久用不累。';return d;},repair:async({revisionFeedback})=>applyClaimRepairs(revisionFeedback.previous_output,revisionFeedback,{repairs:revisionFeedback.segments.filter(s=>s.text.includes('保证')).map(s=>({segment_id:s.id,replacement:'你可以先整理要写的提纲。'}))}),review:async({segments})=>{calls.push(segments.map(s=>s.text));return {claims:segments.map(s=>({segment_id:s.id,status:s.text.includes('保证')?'unsupported':s.text.includes('支持触控')?'supported':'not_applicable',reason:'原文对照',evidence:s.text.includes('支持触控')?[{source_ref:'S1',quote:'支持触控。'}]:[]}))};}});
 assert.equal(generated,1);assert.equal(calls.length,2);
 assert.deepEqual(calls[1],['你可以先整理要写的提纲。']);
 assert.equal(result.checks.semantic_review,'passed');assert.ok(result.review_trace[1].reused_segments.length);
});
test('unsupported replacements stay blocked and general pending conditions are not listed as blocking errors',async()=>{
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>{const d=draft();d.pending_confirmation=['软件未知但可先写草稿'];return d;},repair:async({revisionFeedback})=>revisionFeedback.previous_output,review:async({segments})=>({claims:segments.map(s=>({segment_id:s.id,status:'unsupported',reason:'缺少依据',evidence:[]}))})});
 assert.equal(result.delivery.status,'blocked');assert.equal(result.review_trace.length,3);
 assert(!result.delivery.reasons.includes('软件未知但可先写草稿'));assert(result.output.pending_confirmation.includes('软件未知但可先写草稿'));assert.equal(result.output.content.body,'');
});
test('changing the conditions invalidates previously accepted model judgments',async()=>{
 let calls=0;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft(),repair:async({revisionFeedback})=>({...revisionFeedback.previous_output,pending_confirmation:['使用条件已改变']}),review:async({segments})=>{calls++;if(calls===2)assert(segments.some(s=>s.text==='准备小组汇报'),'the title is reviewed again under changed conditions');return {claims:segments.map(s=>({segment_id:s.id,status:s.location==='content.body'?'unsupported':'not_applicable',reason:'没有足够证据',evidence:[]}))};}});
 assert.equal(result.delivery.status,'blocked');assert.equal(calls,3);
 assert.deepEqual(result.review_trace[1].reused_segments,[]);
});
test('lowercase citation ids are normalized, not interpreted as unsupported product numbers',async()=>{
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>{const d=draft();d.content.body='支持触控。[s1]';d.source_refs=['s1'];return d;},review});
 assert.equal(result.checks.semantic_review,'passed');assert.equal(result.output.content.body,'支持触控。[S1]');
 await assert.rejects(runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>{const d=draft();d.content.body='支持触控。[s999]';d.source_refs=['s999'];return d;},review}),/不存在的来源/);
});
