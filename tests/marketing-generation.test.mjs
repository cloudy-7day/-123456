import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readJson } from '../src/config.mjs';
import { buildHandoff } from '../src/handoff.mjs';
import { runPipeline, validate } from '../src/pipeline.mjs';
import { DeepSeekClient } from '../src/deepseek.mjs';
import { validateUnderstanding } from '../modules/scenario/shared/contract.mjs';

const input={product:'测试电脑（Windows 系列）',audience:'每天携带电脑的人',scenario:'每天背电脑办公，想比较重量',platform:'小红书'};
const sources=[{ref:'S1',kind:'text',source_type:'product_fact',supports_product_fact:true,title:'产品事实.md',text:'这款电脑重量约1.2kg（不含充电器）。',product_name:input.product,system:'Windows'}];
const packageDraft=()=>({
 customer_insight:'客户每天携带电脑，希望比较重量。',strategy:'先明确计重范围，再对照产品重量；提供选择要点。',
 content:{title:'每天背电脑，重量怎么看',body:'先明确你要比较的是电脑本体，还是加上充电器的总重。\n这款电脑重量约1.2kg（不含充电器）。[S1]',call_to_action:'说说你每天的使用任务，我们一起梳理选择要点。'},
 image_plan:[],source_refs:['S1'],pending_confirmation:['本轮未取得图片。'],
 marketing_package:{cover_title:'每天背电脑，重量怎么看',cover_subtitle:'先分清计重范围，再比较候选',cards:[
  {heading:'先统一比较口径',body:'电脑本体和加上充电器的总重，回答的是两个不同问题。先说清你在意哪一种。'},
  {heading:'再看产品资料',body:'这款电脑重量约1.2kg（不含充电器）。[S1]'},
  {heading:'说清最难取舍的一点',body:'你更在意携带重量，还是显示区域？结合每天要做的任务，一起梳理选择要点。'},
 ],consultation_replies:[
  {question:'比较重量要注意什么？',reply:'先统一计重范围，区分电脑本体、充电器和其他随身配件，再比较候选。'},
  {question:'只看重量就可以选吗？',reply:'还要先列出每天必须完成的任务与必用软件；确认系统要求后，再比较重量等偏好。'},
 ]},
});
const run=(output,task=input)=>runPipeline(task,{retrieve:async()=>({sources}),generate:async()=>structuredClone(output)});
function analysis(){
 const original=[{id:'scenario',type:'scenario',text:'每天背电脑办公，希望到店体验。'}];
 const understanding=validateUnderstanding({observations:[{id:'o1',category:'task',kind:'fact',value:'每天背电脑办公',evidence:[{sourceId:'scenario',quote:'每天背电脑办公'}],rationale:'原话',critical:false}],questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}},original);
 return {analysisId:randomUUID(),input:{sources:original},understanding,review:{status:'confirmed'},provenance:{kind:'user_input'}};
}
const request=a=>({analysisId:a.analysisId,product:input.product,productConfirmed:true,platforms:['小红书'],goal:'引导到店体验'});

test('store support is a separate operational selection, never inferred from customer wishes or goal',()=>{
 const a=analysis(),before=structuredClone(a),basic=buildHandoff(a,request(a));
 assert.equal(basic.tasks[0].store_support,'selection_guidance');assert.deepEqual(basic.store_context,{store_support:'selection_guidance',explicitly_selected:false});
 for(const support of ['selection_guidance','software_check','in_store_demo']){
  const handoff=buildHandoff(a,{...request(a),store_support:support});
  assert.equal(handoff.tasks[0].store_support,support);assert.equal(handoff.store_context.explicitly_selected,true);
  assert.deepEqual(handoff.customer_context.understanding,basic.customer_context.understanding);
  assert.deepEqual(handoff.customer_context.original_sources,basic.customer_context.original_sources);
 }
 assert.deepEqual(a,before);assert.throws(()=>buildHandoff(a,{...request(a),store_support:'guaranteed_compatibility'}));
});

test('invalid operational service is rejected before retrieval',async()=>{
 await assert.rejects(runPipeline({...input,store_support:'free_installation'},{retrieve:()=>assert.fail('no retrieval')}),/store_support/);
});

test('new marketing package survives the pipeline without losing fact references; legacy outputs remain accepted',async()=>{
 const draft=packageDraft(),result=await run(draft);
 assert.deepEqual(result.output.marketing_package,draft.marketing_package);assert.deepEqual(result.output.source_refs,['S1']);
 const legacy=packageDraft();delete legacy.marketing_package;
 const old=await run(legacy);assert.equal(old.output.marketing_package,undefined);
});

test('package references cannot bypass source existence or source_refs consistency',async()=>{
 const invented=packageDraft();invented.marketing_package.cards[1].body='重量约1.2kg。[S999]';
 await assert.rejects(run(invented),/不存在的来源|引用/);
 const missing=packageDraft();missing.marketing_package.consultation_replies[1].reply+='[S2]';
 const evidence=[...sources,{...sources[0],ref:'S2'}];
 await assert.rejects(runPipeline(input,{retrieve:async()=>({sources:evidence}),generate:async()=>missing}),/引用列表/);
});

test('card layout limits reject overflow and incomplete cards rather than truncating meaning',async()=>{
 for(const change of [d=>d.marketing_package.cards.push({heading:'多余',body:'多余'}),d=>d.marketing_package.cards.pop(),d=>d.marketing_package.consultation_replies.pop(),d=>d.marketing_package.cards[1].body='',d=>d.marketing_package.cards[1].body='字'.repeat(141)]){
  const draft=packageDraft();change(draft);await assert.rejects(run(draft),/最多允许|至少需要|必填|超过 140 字/);
 }
 const refsOnly=packageDraft();refsOnly.marketing_package.cards[1].body='[S1]';await assert.rejects(run(refsOnly),/不能只包含引用/);
 const shortWithRef=packageDraft();shortWithRef.marketing_package.cover_title='字'.repeat(18)+'[S1]';
 assert.equal((await run(shortWithRef)).output.marketing_package.cover_title,shortWithRef.marketing_package.cover_title);
 const unknown=packageDraft();unknown.marketing_package.slogan='未审核额外文案';assert.throws(()=>validate(unknown,readJson('contracts/output.schema.json')),/未支持的字段/);
});

test('a stopped draft cannot leave a marketing package available for delivery',async()=>{
 const stopped=packageDraft();stopped.content={title:'',body:'',call_to_action:''};
 await assert.rejects(run(stopped),/暂停成稿必须同时移除/);
});

test('actual model payload requests one buying tension, bounded deliverable and explicit service authorization',async()=>{
 let packet;
 const client=new DeepSeekClient({baseUrl:'http://localhost:1',model:'test',fetchImpl:async(_url,options)=>{packet=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})};}});
 await client.generate({input:{...input,store_support:'selection_guidance'},sources,outputSchema:readJson('contracts/output.schema.json'),system:'系统边界',formatFeedback:{reason:'内容卡2正文超过140字',previous_draft:{example:'上一稿'}}});
 const sent=JSON.parse(packet.messages[1].content),rules=sent.writing_requirements.join('\n');
 assert.equal(sent.format_feedback.reason,'内容卡2正文超过140字');assert.equal(sent.format_feedback.previous_draft.example,'上一稿');
 assert.equal(sent.task.store_support,'selection_guidance');assert.match(rules,/一个真实购机矛盾/);assert.match(rules,/marketing_package/);assert.match(rules,/仅in_store_demo可邀到店体验/);
 assert.match(rules,/必要适用条件留在对应句段/);assert.doesNotMatch(rules,/取2—3个不同场景|不写尺寸、重量/);
 assert.match(rules,/不做自行数值换算/);assert.match(rules,/选购建议与参数事实用独立完整句/);assert.match(rules,/不说系统路线/);
});


test('a new package needs one verified cover image, while old plain-note delivery retains its image requirement',async()=>{
 const original={ref:'I1',kind:'image',title:'官方产品外观图',description:'本型号外观'};
 const draft=packageDraft();draft.image_plan=[{source_ref:'I1',position:'封面',caption:'官方产品外观图。'}];draft.source_refs.push('I1');draft.pending_confirmation=[];
 const runWithImage=output=>runPipeline(input,{retrieve:async()=>({sources:[...sources,original]}),generate:async()=>structuredClone(output)});
 const packaged=await runWithImage(draft);assert.equal(packaged.delivery.status,'draft');assert.equal(packaged.delivery.missing_images,0);
 const legacy=structuredClone(draft);delete legacy.marketing_package;
 const old=await runWithImage(legacy);assert.equal(old.delivery.status,'needs_images');assert.equal(old.delivery.missing_images,2);
 const none=await run(packageDraft());assert.equal(none.delivery.status,'needs_images');assert.equal(none.delivery.missing_images,1);
});


test('combined generation instructions no longer authorize arithmetic or water-weight analogies',async()=>{
 let injected='';
 await runPipeline(input,{retrieve:async()=>({sources}),generate:async({system})=>{injected=system;return packageDraft();}});
 assert.match(injected,/本轮不做自行数值换算、估算或生活物品类比/);
 assert.doesNotMatch(injected,/允许对有来源数值作透明算术|水密度约|1\.33×1000|例如有证据证明某版本约1\.33/);
 assert.match(injected,/通用选购建议与产品事实分成独立句/);
});

test('card bodies above the writing target may retain complete conditions up to 140 visible characters',async()=>{
 const draft=packageDraft();draft.marketing_package.cards[1].body='字'.repeat(140)+'[S1]';
 const result=await run(draft);assert.equal(result.output.marketing_package.cards[1].body,draft.marketing_package.cards[1].body);assert.equal(result.meta.generation_attempts,1);
});

test('one layout regeneration receives the concrete error, keeps the draft intact and reviews the complete new result',async()=>{
 const initial=packageDraft();initial.marketing_package.cards[1].body='字'.repeat(141)+'[S1]';
 let generated=0,reviewed=0;
 const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async args=>{
  generated++;
  if(generated===1)return structuredClone(initial);
  assert.match(args.formatFeedback.reason,/内容卡2正文.*140/);assert.equal(args.formatFeedback.previous_draft.marketing_package.cards[1].body,initial.marketing_package.cards[1].body);
  assert.match(args.formatFeedback.instruction,/不要硬截字/);return packageDraft();
 },review:async({segments})=>{
  reviewed++;assert(segments.some(s=>s.field==='marketing_package.cards.1.body'));
  return {segments:segments.map(s=>({id:s.id,verdict:s.text.includes('[S1]')?'supported':'not_applicable',reason:'测试审查判断',evidence:s.text.includes('[S1]')?[{source_ref:'S1',quote:sources[0].text}]:[],conditions:[]}))};
 }});
 assert.equal(generated,2);assert.equal(reviewed,1);assert.equal(result.meta.generation_attempts,2);assert.match(result.meta.format_retry.reason,/140/);assert.equal(result.checks.claim_review.status,'passed',JSON.stringify(result.checks.claim_review.issues));
});

test('format regeneration is bounded and invalid citations never trigger it',async()=>{
 let attempts=0;
 const oversized=packageDraft();oversized.marketing_package.cards[1].body='字'.repeat(141);
 await assert.rejects(runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>{attempts++;return oversized;},review:()=>assert.fail('invalid layout must not reach review')}),/超过 140/);
 assert.equal(attempts,2);
 attempts=0;const invented=packageDraft();invented.marketing_package.cards[1].body='重1.2kg。[S999]';
 await assert.rejects(runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>{attempts++;return invented;}}),/不存在的来源/);assert.equal(attempts,1);
});
