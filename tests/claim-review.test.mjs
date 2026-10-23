import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSegments, factSource, validateClaimReview, reviewDraft, auditSurface, applyReviewPatches, evidenceSelectionPatches } from '../src/claim-review.mjs';
import { runPipeline } from '../src/pipeline.mjs';
import { DeepSeekClient } from '../src/deepseek.mjs';

const input = { product: 'HUAWEI MateBook 14（鸿蒙版）', audience: '移动办公者', scenario: '经常携带电脑处理文件', platform: '朋友圈' };
const sources = [{ ref: 'S1', kind: 'text', title: '产品事实.md', source_type: 'product_fact', supports_product_fact: true, text: 'HUAWEI MateBook 14（鸿蒙版）支持触控。整机重量约1.33 kg。文件传送仅限支持的设备，需同一账号。', path: 'P1/14/产品事实.md' }];
const draft = body => ({ customer_insight: '经常携带电脑', strategy: '围绕文件处理展开', content: { title: '路上的一份文件', body, call_to_action: '你常在哪里整理资料？' }, image_plan: [], source_refs: ['S1'], pending_confirmation: [] });
const verdict = (segments, overrides = {}) => ({ segments: segments.map(segment => ({ id: segment.id, classification: segment.field === 'body' ? 'product_claim' : 'non_product', verdict: segment.field === 'body' ? 'supported' : 'not_applicable', reason: segment.field === 'body' ? '原文明确支持触控' : '任务场景，无产品承诺', evidence: segment.field === 'body' ? [{source_ref:'S1',quote:'HUAWEI MateBook 14（鸿蒙版）支持触控。'}] : [], conditions: [], ...(segment.field === 'body' ? overrides : {}) })) });
const marketingPackage = () => ({cover_title:'通勤前先列清单',cover_subtitle:'看看每天带什么',cards:[{heading:'先看行李',body:'把电脑和配件分别列出来。'},{heading:'先看任务',body:'记下每天最常处理的工作。'},{heading:'先看取舍',body:'把最不能妥协的一项说清楚。'}],consultation_replies:[{question:'我该先说什么？',reply:'先说最常处理的任务。'},{question:'预算还没确定怎么办？',reply:'可以先整理选购条件。'}]});
const packageDraft = () => ({...draft('这台电脑支持触控 [S1]。'),marketing_package:marketingPackage()});

test('review accounts for title, every body sentence, CTA and image captions', () => {
  const output = draft('支持触控。[S1]\n第二句话！'); output.image_plan.push({source_ref:'I1',caption:'产品外观图',position:'首图'});
  const segments = reviewSegments(output);
  assert.equal(segments.length, 5);
  assert.equal(segments[1].text, '支持触控。[S1]');
  assert.equal(segments.at(-1).field, 'image_plan.0.caption');
});

test('exact fact evidence passes with complete segment coverage', () => {
  const output = draft('这台电脑支持触控 [S1]。'), segments=reviewSegments(output);
  const report = validateClaimReview(verdict(segments), {input,output,sources,segments});
  assert.equal(report.status,'passed');
  assert.equal(report.coverage.reviewed_segments,3);
  assert.equal(report.claims[0].quote,'HUAWEI MateBook 14（鸿蒙版）支持触控。');
});

test('real reference with invented quotation is rejected', () => {
  const output=draft('这台电脑支持所有软件 [S1]。'),segments=reviewSegments(output);
  const report=validateClaimReview(verdict(segments,{evidence:[{source_ref:'S1',quote:'这台电脑支持所有软件。'}]}),{input,output,sources,segments});
  assert.equal(report.status,'blocked');
  assert.ok(report.issues.some(issue=>issue.message.includes('逐字')));
});

test('real quotation cannot overrule an unsupported semantic verdict', async () => {
  const output=draft('这台电脑能流畅运行所有编程软件 [S1]。');
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>output,
    review:async({segments})=>verdict(segments,{verdict:'unsupported',reason:'触控事实不能证明编程软件兼容性。'})});
  assert.equal(result.delivery.status,'blocked');
  assert.equal(result.output.content.body,'');
  assert.equal(result.output.image_plan.length,0);
  assert.equal(result.checks.claim_review.status,'blocked');
  assert.match(result.output.pending_confirmation.join(' '),/不能证明/);
});

test('images, image indexes and scenario or style material cannot support product facts', () => {
  for (const source of [{...sources[0],kind:'image'},{...sources[0],title:'图片索引.csv'},{...sources[0],source_type:'style'},{...sources[0],source_type:'scenario'},{...sources[0],source_type:'faq'},{...sources[0],source_type:'product_guidance'}]) {
    assert.equal(factSource(source),false);
    const output=draft('这台电脑支持触控 [S1]。'),segments=reviewSegments(output);
    assert.equal(validateClaimReview(verdict(segments),{input,output,sources:[source],segments}).status,'blocked');
  }
});

test('a reviewer cannot omit a segment or label cited product claims as ordinary prose', () => {
  const output=draft('这台电脑支持触控 [S1]。'),segments=reviewSegments(output);
  const omitted=verdict(segments);omitted.segments.pop();
  assert.equal(validateClaimReview(omitted,{input,output,sources,segments}).status,'blocked');
  const skipped=verdict(segments,{classification:'non_product',verdict:'not_applicable',evidence:[]});
  assert.ok(validateClaimReview(skipped,{input,output,sources,segments}).issues.some(issue=>issue.message.includes('不能跳过')));
});

test('numeric mismatch is blocked even when a model returns supported', () => {
  const output=draft('整机重量约1.03 kg [S1]。'),segments=reviewSegments(output);
  const report=validateClaimReview(verdict(segments,{evidence:[{source_ref:'S1',quote:'整机重量约1.33 kg。'}]}),{input,output,sources,segments});
  assert.equal(report.status,'blocked');assert.match(report.issues.map(issue=>issue.message).join(' '),/1.03kg/);
});

test('metric unit prefixes cannot make GB, GHz and grams appear equivalent', () => {
  const output=draft('处理器主频为16 GHz [S1]。'),segments=reviewSegments(output);
  const metricSources=[{...sources[0],text:'内存为16 GB。'}];
  const report=validateClaimReview(verdict(segments,{evidence:[{source_ref:'S1',quote:'内存为16 GB。'}]}),{input,output,sources:metricSources,segments});
  assert.equal(report.status,'blocked');
  assert.match(report.issues.map(issue=>issue.message).join(' '),/16ghz/);
});

test('relevant conditions must survive in the actual claim, not just folded notes', () => {
  const output=draft('手机与电脑之间可以传文件 [S1]。');output.pending_confirmation=['仅限支持的设备，需同一账号'];
  const segments=reviewSegments(output);
  const missing=verdict(segments,{evidence:[{source_ref:'S1',quote:'文件传送仅限支持的设备，需同一账号。'}]});
  assert.equal(validateClaimReview(missing,{input,output,sources,segments}).status,'blocked');
  const hidden=verdict(segments,{evidence:[{source_ref:'S1',quote:'文件传送仅限支持的设备，需同一账号。'}],conditions:[{source_ref:'S1',quote:'仅限支持的设备，需同一账号',rendered_quote:'仅限支持的设备，需同一账号'}]});
  assert.equal(validateClaimReview(hidden,{input,output,sources,segments}).status,'blocked');
  output.content.body='搭配支持的设备、登录同一账号后，可以传文件 [S1]。';
  const fixed=reviewSegments(output);
  const passed=verdict(fixed,{evidence:[{source_ref:'S1',quote:'文件传送仅限支持的设备，需同一账号。'}],conditions:[{source_ref:'S1',quote:'仅限支持的设备，需同一账号',rendered_quote:'搭配支持的设备、登录同一账号后'}]});
  assert.equal(validateClaimReview(passed,{input,output,sources,segments:fixed}).status,'passed');
});

test('wrong models and fabricated personal experience are caught without trusting model verdict', () => {
  assert.ok(auditSurface({input,output:draft('我亲测 MateBook D 16 绝不卡顿 [S1]。')}).length>=2);
  assert.equal(auditSurface({input,output:draft('不能宣称全网最低，也不要写我亲测。')}).length,0);
});

test('review timeout blocks copyable content and masks provider errors', async () => {
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft('这台电脑支持触控 [S1]。'),review:async()=>{throw Error('private-provider-response');}});
  assert.equal(result.delivery.status,'blocked');assert.equal(result.output.content.body,'');
  assert.equal(result.checks.claim_review.status,'error');
  assert.ok(!JSON.stringify(result).includes('private-provider-response'));
});

test('blocked review diagnostics cannot introduce fabricated source identifiers', async () => {
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft('这台电脑支持触控 [S1]。'),
    review:async({segments})=>verdict(segments,{verdict:'unsupported',reason:'主张没有证据 [S999]'})});
  assert.equal(result.delivery.status,'blocked');
  assert.ok(result.output.source_refs.every(ref=>ref==='S1'));
  assert.ok(!JSON.stringify(result.output).includes('[S999]'));
});

test('missing injected review remains transparently not performed',async()=>{
  const report=await reviewDraft({input,output:draft('正文 [S1]。'),sources});
  assert.equal(report.status,'not_performed');assert.equal(report.coverage.reviewed_segments,0);
});

test('DeepSeek review is a separate JSON request preserving source types and rejecting truncation',async()=>{
  let request;
  const client=new DeepSeekClient({baseUrl:'http://localhost:1',model:'test',fetchImpl:async(url,options)=>{
    request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})};
  }});
  await assert.rejects(client.review({input,output:draft('正文'),sources,segments:[],system:'review rules'}),/截断/);
  assert.equal(request.messages[0].content,'review rules');
  assert.equal(JSON.parse(request.messages[1].content).evidence[0].source_type,'product_fact');
  assert.equal(request.response_format.type,'json_object');
  assert.equal(request.temperature,0);
});

test('not_applicable is the single discriminator even if old model response copied a claim label', () => {
  const output=draft('这台电脑支持触控 [S1]。'),segments=reviewSegments(output);
  const response=verdict(segments);
  for(const row of response.segments)row.classification='product_claim';
  const report=validateClaimReview(response,{input,output,sources,segments});
  assert.equal(report.status,'passed');
  assert.equal(report.coverage.product_claims,1);
  assert.equal(report.claims[0].field,'body');
});

test('visible adjacent conditions qualify the claim without forcing a long single sentence', () => {
  const output=draft('手机与电脑之间可以传文件 [S1]。仅限支持的设备，需同一账号 [S1]。');
  const segments=reviewSegments(output);
  const response=verdict(segments,{evidence:[{source_ref:'S1',quote:'文件传送仅限支持的设备，需同一账号。'}],conditions:[{source_ref:'S1',quote:'仅限支持的设备，需同一账号',rendered_quote:'仅限支持的设备，需同一账号'}]});
  assert.equal(validateClaimReview(response,{input,output,sources,segments}).status,'passed');
});

test('one constrained repair is independently reviewed and preserves first review evidence', async () => {
  let repairs=0,reviews=0;
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft('所有软件都能用 [S1]。'),
    review:async({segments})=>{reviews++;return verdict(segments,reviews===1?{verdict:'unsupported',reason:'触控原文不能证明软件兼容。'}:{});},
    repair:async({input:task,output,reviewReport})=>{repairs++;assert.equal(task.product,input.product);assert.match(output.content.body,/所有软件/);assert.equal(reviewReport.status,'blocked');return {replacements:[{id:'C2',replacement:'HUAWEI MateBook 14（鸿蒙版）支持触控。[S1]'}]};}});
  assert.equal(repairs,1);assert.equal(reviews,2);
  assert.equal(result.checks.claim_review.status,'passed');
  assert.equal(result.checks.claim_review.attempts,2);
  assert.equal(result.checks.claim_review.first_review.status,'blocked');
  assert.equal(result.checks.claim_review.first_review.claims[0].evidence[0].quote,'HUAWEI MateBook 14（鸿蒙版）支持触控。');
  assert.equal(result.checks.claim_review.first_review.rejected_claims[0].evidence[0].quote,'HUAWEI MateBook 14（鸿蒙版）支持触控。');
  assert.deepEqual(result.checks.claim_review.first_review.claims[0].conditions,[]);
  assert.equal(result.checks.claim_review.repair_attempted,true);
  assert.match(result.output.content.body,/支持触控/);
});

test('failed second review stops after one repair and never exposes the revised draft', async () => {
  let repairs=0,reviews=0;
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft('所有软件都能用 [S1]。'),
    review:async({segments})=>{reviews++;return verdict(segments,{verdict:'unsupported',reason:'没有兼容性依据。'});},
    repair:async()=>{repairs++;return {replacements:[{id:'C2',replacement:'HUAWEI MateBook 14（鸿蒙版）支持触控。[S1]'}]};}});
  assert.equal(repairs,1);assert.equal(reviews,2);assert.equal(result.delivery.status,'blocked');
  assert.equal(result.output.content.body,'');assert.equal(result.checks.claim_review.attempts,2);
});

test('repair output must pass the same reference validation and provider errors stay private', async () => {
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft('所有软件都能用 [S1]。'),
    review:async({segments})=>verdict(segments,{verdict:'unsupported',reason:'没有兼容性依据。'}),
    repair:async()=>({replacements:[{id:'C2',replacement:'改后正文 [S999]。'}]})});
  assert.equal(result.delivery.status,'blocked');assert.equal(result.output.content.body,'');
  assert.equal(result.checks.claim_review.repair_status,'failed');
  assert.equal(result.checks.claim_review.first_review.status,'blocked');
});

test('a review connection error does not trigger a blind rewrite', async () => {
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>draft('支持触控 [S1]。'),
    review:async()=>{throw Error('timeout');},repair:async()=>assert.fail('unknown review failure must not rewrite')});
  assert.equal(result.delivery.status,'blocked');assert.equal(result.checks.claim_review.repair_attempted,false);
});

test('DeepSeek repair only selects verified quote indices and returns locally assembled patches', async () => {
  let request;
  const client=new DeepSeekClient({baseUrl:'http://localhost:1',model:'test',fetchImpl:async(url,options)=>{
    request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({selections:[{id:'C2',quote_indices:[0]}]})}}]})};
  }});
  const patch=await client.repair({input,output:draft('错误文案 [S1]。'),sources,outputSchema:{},system:'original rules',reviewReport:{claims:[{id:'C2',field:'body',status:'rejected',text:'错误文案',reason:'缺证据',evidence:[{source_ref:'S1',quote:'这台电脑配备全尺寸背光键盘。'}]}],issues:[{message:'缺证据'}]}});
  const payload=JSON.parse(request.messages[1].content);
  assert.equal(payload.task.product,input.product);
  assert.equal(payload.rejected_claims.length,1);
  assert.match(payload.original_draft.content.body,/错误文案/);
  assert.match(request.messages[0].content,/一次局部证据修订/);
  assert.equal(payload.rejected_claims[0].evidence[0].quote,'这台电脑配备全尺寸背光键盘。');
  assert.equal(payload.rejected_claims[0].evidence[0].quote_index,0);
  assert.match(request.messages[0].content,/quote_indices/);
  assert.equal(request.temperature,0);
  assert.deepEqual(patch,{replacements:[{id:'C2',replacement:'这台电脑配备全尺寸背光键盘。[S1]'}]});
  assert.equal(payload.evidence,undefined);
});

test('index selection copies complete evidence exactly without changing supported sentences',()=>{
  const output=draft('这台电脑支持触控 [S1]。内存让所有软件更流畅 [S1]。'),segments=reviewSegments(output);
  const report={claims:[
    {id:segments[1].id,field:'body',status:'supported',evidence:[{source_ref:'S1',quote:'支持触控。'}]},
    {id:segments[2].id,field:'body',status:'rejected',evidence:[{source_ref:'S1',quote:'这台电脑配备\n16 GB内存。'},{source_ref:'S1',quote:'这台电脑配备全尺寸背光键盘。'}]},
  ],issues:[]};
  const patch=evidenceSelectionPatches(report,{selections:[{id:segments[2].id,quote_indices:[0,1,0]}]});
  assert.deepEqual(patch,{replacements:[{id:segments[2].id,replacement:'这台电脑配备 16 GB内存。[S1]\n这台电脑配备全尺寸背光键盘。[S1]'}]});
  const revised=applyReviewPatches(output,report,patch,sources);
  assert.ok(revised.output.content.body.startsWith('这台电脑支持触控 [S1]。'));
  assert.ok(revised.output.content.body.includes('这台电脑配备 16 GB内存。[S1]'));
  assert.ok(!revised.output.content.body.includes('更流畅'));
  assert.equal(revised.actions[0].action,'replace_with_evidence');
});

test('out-of-range, fractional, missing and evidence-free selections safely delete the entire rejected sentence',()=>{
  const report={claims:[{id:'C2',field:'body',status:'rejected',evidence:[{source_ref:'S1',quote:'支持触控。'}]},{id:'C3',field:'body',status:'rejected',evidence:[]}]};
  for(const quote_indices of [[1],[0,1],[-1],[0.5],['0'],null,[]]) {
    const patch=evidenceSelectionPatches(report,{selections:[{id:'C2',quote_indices},{id:'C3',quote_indices:[0]}]});
    assert.deepEqual(patch.replacements,[{id:'C2',replacement:''},{id:'C3',replacement:''}]);
  }
  assert.deepEqual(evidenceSelectionPatches(report,{selections:[]}).replacements,[{id:'C2',replacement:''},{id:'C3',replacement:''}]);
});

test('selection protocol rejects invented prose, supported IDs and repeated IDs',()=>{
  const report={claims:[{id:'C1',status:'supported',field:'body',evidence:[]},{id:'C2',status:'rejected',field:'body',evidence:[]}]};
  assert.throws(()=>evidenceSelectionPatches(report,{replacements:[{id:'C2',replacement:'新功能'}]}),/selections/);
  assert.throws(()=>evidenceSelectionPatches(report,{selections:[{id:'C2',quote_indices:[],replacement:'新功能'}]}),/句段/);
  assert.throws(()=>evidenceSelectionPatches(report,{selections:[{id:'C1',quote_indices:[]}]}),/句段/);
  assert.throws(()=>evidenceSelectionPatches(report,{selections:[{id:'C2',quote_indices:[]},{id:'C2',quote_indices:[]}]}),/句段/);
});

test('local patches preserve supported sentences exactly and recalculate source references', () => {
  const output=draft('这台电脑支持触控 [S1]。按一下即可锁屏 [S2]。');output.source_refs=['S1','S2'];
  const segments=reviewSegments(output);
  const report={claims:[{id:segments[2].id,field:'body',status:'rejected',evidence:[{source_ref:'S1',quote:'HUAWEI MateBook 14（鸿蒙版）支持触控。'}]}],issues:[]};
  const repaired=applyReviewPatches(output,report,{replacements:[{id:segments[2].id,replacement:''}]},sources);
  assert.equal(repaired.output.content.body,'这台电脑支持触控 [S1]。');
  assert.equal(repaired.output.content.title,output.content.title);
  assert.equal(repaired.output.content.call_to_action,output.content.call_to_action);
  assert.deepEqual(repaired.output.source_refs,['S1']);
});

test('new features or causal explanations in a proposed repair are deleted instead of expanding the article', () => {
  const output=draft('这台电脑支持触控 [S1]。按一下即可锁屏 [S1]。');
  const segments=reviewSegments(output);
  const report={claims:[{id:segments[2].id,field:'body',status:'rejected',evidence:[{source_ref:'S1',quote:'HUAWEI MateBook 14（鸿蒙版）支持触控。'}]}],issues:[]};
  const repaired=applyReviewPatches(output,report,{replacements:[{id:segments[2].id,replacement:'HUAWEI MateBook 14（鸿蒙版）支持触控。[S1] 因此任何软件都能流畅运行。'}]},sources);
  assert.equal(repaired.output.content.body,'这台电脑支持触控 [S1]。');
  assert.equal(repaired.actions[0].action,'delete');
  assert.match(repaired.actions[0].reason,/新增/);
  assert.throws(()=>applyReviewPatches(output,report,{replacements:[{id:segments[1].id,replacement:''}]},sources),/未获准/);
  assert.throws(()=>applyReviewPatches(output,report,draft('整篇重写'),sources),/局部补丁/);
});

test('image captions are rebuilt from source names without feature extrapolation during repair', () => {
  const output=draft('这台电脑支持触控 [S1]。');output.image_plan=[{source_ref:'I1',caption:'按一下即可锁屏',position:'第一段'}];output.source_refs.push('I1');
  const images=[...sources,{ref:'I1',kind:'image',title:'产品键盘俯视图'}];
  const report={claims:[{id:reviewSegments(output).at(-1).id,field:'image_plan.0.caption',status:'rejected',evidence:[]}],issues:[]};
  const repaired=applyReviewPatches(output,report,{replacements:[]},images);
  assert.equal(repaired.output.content.body,output.content.body);
  assert.match(repaired.output.image_plan[0].caption,/产品键盘俯视图/);
  assert.ok(!repaired.output.image_plan[0].caption.includes('锁屏'));
});

test('only retaining a supported disclaimer does not count as a useful product claim', () => {
  const output=draft('键盘款式以实际销售配置为准 [S1]。'),segments=reviewSegments(output);
  const limited=[{...sources[0],text:'键盘款式以实际销售配置为准。'}];
  const response=verdict(segments,{evidence:[{source_ref:'S1',quote:'键盘款式以实际销售配置为准。'}]});
  const report=validateClaimReview(response,{input,output,sources:limited,segments});
  assert.equal(report.status,'blocked');
  assert.equal(report.coverage.core_product_claims,0);
  assert.ok(report.issues.some(issue=>issue.code==='no_core_product_claim'));
});

test('accurate specs cannot support appended reading, typing or attention benefits', () => {
  const cases = [
    { text: '14.2 英寸 3:2 OLED 抗反射触控屏 [S1]，纵向能多看到几行正文，翻页不用一直拖滚动条；屏幕支持 10 点触控 [S1]。', quote: '14.2 英寸 3:2 OLED 抗反射触控屏，支持 10 点触控。' },
    { text: '全尺寸背光键盘 [S1]，键位铺得开，连续打字时手指不用缩着找键；触控板支持 5 点触控 [S1]。', quote: '全尺寸背光键盘。触控板支持 5 点触控。' },
    { text: 'OLED 抗反射屏 [S1]在灯下看文档，屏幕反光少一些，注意力更容易留在正文；3:2 的比例 [S1]让一页里能放下更多行，读报告时滚动次数少一点，读到最后也不容易串行。', quote: 'OLED 抗反射屏，屏幕比例 3:2。' },
  ];
  for (const {text,quote} of cases) {
    const output=draft(text),segments=reviewSegments(output),factSources=[{...sources[0],text:quote}];
    const report=validateClaimReview(verdict(segments,{reason:'属于对规格的合理阅读描述，没有量化承诺。',evidence:[{source_ref:'S1',quote}]}),{input,output,sources:factSources,segments});
    assert.equal(report.status,'blocked');
    assert.ok(report.claims.some(claim=>claim.effect_checks.some(check=>check.status==='missing_explicit_effect_evidence')));
    assert.match(report.issues.map(issue=>issue.message).join(' '),/合理推断也不等于知识库支持/);
    assert.equal(report.claims[0].evidence[0].quote,quote,'spec evidence stays available for local repair');
  }
});

test('benefit protection applies beyond the reported screen and keyboard wording', () => {
  const cases = [
    ['电池容量为70 Wh [S1]，全天不用充电。','电池容量为70 Wh。'],
    ['内存为16 GB [S1]，同时开多个设计软件更流畅。','内存为16 GB。'],
    ['整机重量约1.33 kg [S1]，通勤时减轻肩膀负担。','整机重量约1.33 kg。'],
    ['搭载新款处理器 [S1]，使工作效率提高。','搭载新款处理器。'],
    ['屏幕支持触控 [S1]，只需轻轻一点即可完成复杂报表。','屏幕支持触控。'],
  ];
  for(const [body,quote] of cases) {
    const output=draft(body),segments=reviewSegments(output);
    const report=validateClaimReview(verdict(segments,{evidence:[{source_ref:'S1',quote}]}),{input,output,sources:[{...sources[0],text:quote}],segments});
    assert.equal(report.status,'blocked',body);
    assert.ok(report.claims[0].effect_checks.some(check=>check.status==='missing_explicit_effect_evidence'),body);
  }
});

test('an adjacent effect cannot hide as ordinary scene prose without a citation', () => {
  const output=draft('这台电脑支持触控 [S1]。桌面摊开资料，手上动作能少一点。'),segments=reviewSegments(output);
  const response=verdict(segments);response.segments[2]={id:segments[2].id,verdict:'not_applicable',reason:'普通场景文字',evidence:[],conditions:[]};
  const report=validateClaimReview(response,{input,output,sources,segments});
  assert.equal(report.status,'blocked');
  assert.equal(report.claims.find(claim=>claim.id===segments[2].id).status,'rejected');
});

test('effects explicitly present in verified source wording are retained', () => {
  const quote='屏幕支持触控，可减少菜单切换步骤。';
  const output=draft('屏幕支持触控 [S1]，可减少菜单切换步骤 [S1]。'),segments=reviewSegments(output);
  const report=validateClaimReview(verdict(segments,{evidence:[{source_ref:'S1',quote}]}),{input,output,sources:[{...sources[0],text:quote}],segments});
  assert.equal(report.status,'passed');
  assert.equal(report.claims[0].effect_checks[0].status,'source_wording_present');
});

test('open observation questions and explicit non-guarantees do not invent effects', () => {
  for (const followup of ['打开你的文档，观察是否更容易阅读。','可以试试是否更方便操作。','不能保证工作效率提高。','参数不代表操作更流畅。']) {
    const output=draft(`这台电脑支持触控 [S1]。${followup}`),segments=reviewSegments(output);
    const response=verdict(segments);response.segments[2]={id:segments[2].id,verdict:'not_applicable',reason:'开放体验问题或未承诺效果',evidence:[],conditions:[]};
    assert.equal(validateClaimReview(response,{input,output,sources,segments}).status,'passed',followup);
  }
});

test('generation instructions prioritize sourced facts over a forced pain-to-benefit story',async()=>{
  let request;
  const client=new DeepSeekClient({baseUrl:'http://localhost:1',model:'test',fetchImpl:async(url,options)=>{
    request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})};
  }});
  await client.generate({input:{...input,platform:'小红书'},sources,outputSchema:{},system:'base rules'});
  assert.match(request.messages[0].content,/不能由它们自行推导用户收益/);
  assert.equal(request.temperature,0.3);
  const rules=JSON.parse(request.messages[1].content).writing_requirements.join(' ');
  assert.match(rules,/允许写清必要的准确参数/);
  assert.match(rules,/不能预设效率、舒适、注意力已改善/);
  assert.doesNotMatch(rules,/不写尺寸、重量、分辨率等数字/);
});

test('review covers every public package leaf including consultation questions and replies',()=>{
  const output=packageDraft(),segments=reviewSegments(output);
  const fields=segments.filter(segment=>segment.field.startsWith('marketing_package.')).map(segment=>segment.field);
  assert.equal(fields.length,12);
  assert.ok(fields.includes('marketing_package.cover_subtitle'));
  assert.ok(fields.includes('marketing_package.cards.2.body'));
  assert.ok(fields.includes('marketing_package.consultation_replies.1.reply'));
  assert.equal(validateClaimReview(verdict(segments),{input,output,sources,segments}).status,'passed');
});

test('invented benefits in any public package field block delivery despite a positive reviewer',()=>{
  const paths=reviewSegments(packageDraft()).filter(segment=>segment.field.startsWith('marketing_package.')).map(segment=>segment.field);
  for(const field of paths){
    const output=packageDraft(),parts=field.split('.');let owner=output;
    for(const part of parts.slice(0,-1))owner=owner[part];
    owner[parts.at(-1)]='这台电脑支持触控 [S1]，工作更轻松。';
    const segments=reviewSegments(output),response=verdict(segments);
    const row=response.segments.find(row=>segments.find(segment=>segment.id===row.id).field===field);
    Object.assign(row,{verdict:'supported',reason:'参数正确，因此合理推断',evidence:[{source_ref:'S1',quote:sources[0].text.split('。')[0]+'。'}]});
    const report=validateClaimReview(response,{input,output,sources,segments});
    assert.equal(report.status,'blocked',field);
    assert.ok(report.claims.some(claim=>claim.field===field && claim.status==='rejected'),field);
  }
});

test('blocked review removes all publishable package contents',async()=>{
  const output=packageDraft();output.marketing_package.cards[0].body='这台电脑支持触控 [S1]，工作更轻松。';
  const result=await runPipeline(input,{retrieve:async()=>({sources}),generate:async()=>output,review:async({segments})=>verdict(segments)});
  assert.equal(result.delivery.status,'blocked');
  assert.equal(result.output.content.body,'');
  assert.equal(Object.hasOwn(result.output,'marketing_package'),false);
  assert.equal(output.marketing_package.cards[0].body,'这台电脑支持触控 [S1]，工作更轻松。');
});

test('local package repair changes only the rejected nested field',()=>{
  const output=packageDraft();output.marketing_package.cards[1].body='所有软件都流畅 [S1]。';
  const segment=reviewSegments(output).find(item=>item.field==='marketing_package.cards.1.body');
  const report={claims:[{id:segment.id,field:segment.field,status:'rejected',evidence:[{source_ref:'S1',quote:'HUAWEI MateBook 14（鸿蒙版）支持触控。'}]}],issues:[]};
  const patch=evidenceSelectionPatches(report,{selections:[{id:segment.id,quote_indices:[0]}]});
  const result=applyReviewPatches(output,report,patch,sources);
  assert.equal(result.output.marketing_package.cards[1].body,'HUAWEI MateBook 14（鸿蒙版）支持触控。[S1]');
  assert.equal(result.output.marketing_package.cards[1].heading,output.marketing_package.cards[1].heading);
  assert.deepEqual(result.output.marketing_package.cards[0],output.marketing_package.cards[0]);
  assert.deepEqual(result.output.content,output.content);
});

test('repair refuses half-empty covers, cards and consultation pairs',()=>{
  for(const field of ['marketing_package.cover_title','marketing_package.cards.0.heading','marketing_package.cards.0.body','marketing_package.consultation_replies.0.reply']){
    const output=packageDraft(),segment=reviewSegments(output).find(item=>item.field===field);
    const report={claims:[{id:segment.id,field,status:'rejected',evidence:[]}],issues:[]};
    assert.throws(()=>applyReviewPatches(output,report,{replacements:[{id:segment.id,replacement:''}]},sources),/半空卡片/,field);
  }
});

test('empty or unknown package fields cannot disappear from semantic coverage',()=>{
  for(const change of [pack=>{pack.cards[0].body='';},pack=>{pack.cards.pop();},pack=>{pack.extra_public_claim='所有软件流畅';},pack=>{pack.consultation_replies[0].reply='';}]){
    const output=packageDraft();change(output.marketing_package);const segments=reviewSegments(output);
    const report=validateClaimReview(verdict(segments),{input,output,sources,segments});
    assert.ok(report.issues.some(issue=>issue.code==='incomplete_marketing_package'));
  }
});

test('a card must show its own conditions and cannot borrow them from another card',()=>{
  const output=packageDraft();output.marketing_package.cards[0]={heading:'可以传文件 [S1]',body:'仅限支持的设备，需同一账号 [S1]。'};
  const make=()=>{
    const segments=reviewSegments(output),response=verdict(segments);
    for(const row of response.segments){const field=segments.find(segment=>segment.id===row.id).field;
      if(field.startsWith('marketing_package.cards.') && /传文件|同一账号/.test(segments.find(segment=>segment.id===row.id).text))Object.assign(row,{verdict:'supported',reason:'有条件的功能',evidence:[{source_ref:'S1',quote:'文件传送仅限支持的设备，需同一账号。'}],conditions:[{source_ref:'S1',quote:'仅限支持的设备，需同一账号',rendered_quote:'仅限支持的设备，需同一账号'}]});
    }
    return validateClaimReview(response,{input,output,sources,segments});
  };
  assert.equal(make().status,'passed');
  output.marketing_package.cards[1].body=output.marketing_package.cards[0].body;
  output.marketing_package.cards[0].body='打开文件前先确认你的需求。';
  const report=make();assert.equal(report.status,'blocked');
  assert.ok(report.claims.some(claim=>claim.field==='marketing_package.cards.0.heading' && claim.status==='rejected'));
});

test('store support is separate from customer wishes and protects every public surface',()=>{
  const output=packageDraft();output.marketing_package.consultation_replies[0].reply='欢迎到店体验。';
  const wishes={...input,scenario:'客户希望到店试机',goal:'引导到店'};
  assert.ok(auditSurface({input:wishes,output}).some(issue=>issue.code==='store_support_unconfirmed'));
  assert.equal(auditSurface({input:{...wishes,store_support:'in_store_demo'},output}).length,0);
  output.marketing_package.consultation_replies[0]={question:'可以到店体验吗？',reply:'目前先帮你整理选购条件。'};
  assert.equal(auditSurface({input:wishes,output}).length,0);
});

test('only software_check authorizes checking public software information, never actual tests',()=>{
  const output=packageDraft();output.marketing_package.consultation_replies[0].reply='我可以帮你核对软件的公开适配资料。';
  assert.ok(auditSurface({input,output}).some(issue=>issue.code==='store_support_unconfirmed'));
  assert.equal(auditSurface({input:{...input,store_support:'software_check'},output}).length,0);
  output.marketing_package.consultation_replies[0].reply='先确认必用软件的系统要求。';
  assert.equal(auditSurface({input,output}).length,0);
  for(const store_support of ['selection_guidance','software_check','in_store_demo']){
    output.marketing_package.consultation_replies[0].reply='我们可以帮你实测软件。';
    assert.ok(auditSurface({input:{...input,store_support},output}).some(issue=>issue.code==='unconfirmed_store_promise'));
  }
});

test('compatibility questions and authorized public-document checks are not mistaken for capability claims',()=>{
  const output=packageDraft();output.marketing_package.consultation_replies[0]={question:'这个软件是否兼容？',reply:'我可以帮你核对软件公开兼容资料。'};
  const segments=reviewSegments(output),response=verdict(segments);
  assert.equal(validateClaimReview(response,{input:{...input,store_support:'software_check'},output,sources,segments}).status,'passed');
  assert.equal(validateClaimReview(response,{input,output,sources,segments}).status,'blocked');
  output.marketing_package.consultation_replies[0].reply='我可以帮你核对软件公开兼容资料，保证所有软件都能用。';
  const changed=reviewSegments(output);
  assert.equal(validateClaimReview(verdict(changed),{input:{...input,store_support:'software_check'},output,sources,segments:changed}).status,'blocked');
});

test('demo permission does not invent a reservation, time slot, inventory or free test',()=>{
  for(const promise of ['预约已成功。','明天到店试机。','门店备有展示机。','可以免费测试。','这款有现货。','实测通过。']){
    const output=packageDraft();output.marketing_package.consultation_replies[0].reply=promise;
    assert.ok(auditSurface({input:{...input,store_support:'in_store_demo'},output}).some(issue=>issue.code==='unconfirmed_store_promise'),promise);
  }
});

test('live commute failure: counting the charger in total carrying weight is a method, not a benefit claim',()=>{
  const output=draft('HUAWEI MateBook 14 酷睿 Ultra 资料标注重量1.31 kg[S1]，实际尺寸和重量依配置、制造工艺、测量方法不同可能有所差异[S1]；包装含一体式USB-C电源适配器[S1]，所以通勤总重要把充电器一起算进去。');
  const task={...input,product:'MateBook 14 酷睿 Ultra（Windows 系列）'};
  const quotes=['重量\n\n1.31 kg\n\n*实际尺寸和重量依配置、制造工艺、测量方法的不同可能有所差异。','USB-C 电源适配器(适配器和充电线一体式连接) × 1'];
  const factSources=[{...sources[0],text:quotes.join('\n\n')}],segments=reviewSegments(output);
  const response=verdict(segments,{evidence:quotes.map(quote=>({source_ref:'S1',quote})),conditions:[{source_ref:'S1',quote:'*实际尺寸和重量依配置、制造工艺、测量方法的不同可能有所差异。',rendered_quote:'实际尺寸和重量依配置、制造工艺、测量方法不同可能有所差异'}]});
  assert.equal(validateClaimReview(response,{input:task,output,sources:factSources,segments}).status,'passed');
  output.content.body='这台电脑支持触控 [S1]，所以先核对软件就能提高效率。';
  const changed=reviewSegments(output);
  assert.equal(validateClaimReview(verdict(changed),{input,output,sources,segments:changed}).status,'blocked');
});

test('live caption failure: a precise image-evidence disclaimer does not assert compatibility',()=>{
  const output=draft('这台电脑支持触控 [S1]。');
  output.image_plan=[{source_ref:'I1',caption:'HUAWEI MateBook 14 官方主视觉图，用于封面展示；画面不能证明重量或软件兼容性。',position:'封面'}];
  const segments=reviewSegments(output),response=verdict(segments);
  assert.equal(validateClaimReview(response,{input,output,sources,segments}).status,'passed');
  for(const caption of ['画面不能证明重量或软件兼容性，但产品支持任何软件。','画面不能证明重量但实际支持所有软件。','官方主视觉图，产品支持十点触控。']){
    output.image_plan[0].caption=caption;
    const changed=reviewSegments(output);
    assert.equal(validateClaimReview(verdict(changed),{input,output,sources,segments:changed}).status,'blocked',caption);
  }
});

test('repair never publishes table fragments or bare values, even with a valid evidence index',()=>{
  for(const quote of ['重量\n\n1.31 kg\n\n*实际尺寸和重量依配置、制造工艺、测量方法的不同可能有所差异。','1.31 kg','全尺寸背光键盘','USB-C 电源适配器(适配器和充电线一体式连接) × 1']){
    const report={claims:[{id:'C2',field:'body',status:'rejected',evidence:[{source_ref:'S1',quote}]}]};
    assert.equal(evidenceSelectionPatches(report,{selections:[{id:'C2',quote_indices:[0]}]}).replacements[0].replacement,'',quote);
  }
});

test('verified numeric weight is a core fact regardless of common wording',()=>{
 for(const wording of ['重量1.31 kg','重量约1.31 kg','重量为1.31 kg','重量：1.31 kg']){
  const fact=`这款电脑${wording}。`,source={...sources[0],text:fact},output=draft(fact+'[S1]'),segments=reviewSegments(output);
  const report=validateClaimReview(verdict(segments,{evidence:[{source_ref:'S1',quote:fact}]}),{input,output,sources:[source],segments});
  assert.equal(report.status,'passed',JSON.stringify(report.issues));assert.equal(report.coverage.core_product_claims,1);
 }
});

test('FAQ may ask about a number only when its paired answer verifies that number',()=>{
 const fact='整机重量约1.33 kg。',source={...sources[0],text:fact};
 for(const number of ['1.33','99']){
  const output=packageDraft();output.content.body=fact+'[S1]';output.marketing_package.consultation_replies[0]={question:`想轻一点，${number} kg是带充电器的重量吗？`,reply:fact+'[S1]'};
  const segments=reviewSegments(output),raw={segments:segments.map(s=>({id:s.id,verdict:s.text.includes('[S1]')?'supported':'not_applicable',reason:'核验',evidence:s.text.includes('[S1]')?[{source_ref:'S1',quote:fact}]:[],conditions:[]}))};
  const report=validateClaimReview(raw,{input,output,sources:[source],segments});
  assert.equal(report.status,number==='1.33'?'passed':'blocked',JSON.stringify(report.issues));
 }
});

test('negative buying advice and genuine comparison questions do not assert product benefits',()=>{
 const output=packageDraft();output.content.body='别让一个参数替你做决定。\n这台电脑支持触控[S1]。';output.marketing_package.consultation_replies[0].question='我每天背电脑通勤，怎么判断哪台更轻？';
 const segments=reviewSegments(output),raw={segments:segments.map(s=>({id:s.id,verdict:s.text.includes('[S1]')?'supported':'not_applicable',reason:'核验',evidence:s.text.includes('[S1]')?[{source_ref:'S1',quote:'HUAWEI MateBook 14（鸿蒙版）支持触控。'}]:[],conditions:[]}))};
 const report=validateClaimReview(raw,{input,output,sources,segments});assert.equal(report.status,'passed',JSON.stringify(report.issues));
 output.marketing_package.consultation_replies[0].question='这台更轻，怎么判断？';
 const harmful=reviewSegments(output),badRaw={segments:harmful.map(s=>({id:s.id,verdict:s.text.includes('[S1]')?'supported':'not_applicable',reason:'核验',evidence:s.text.includes('[S1]')?[{source_ref:'S1',quote:'HUAWEI MateBook 14（鸿蒙版）支持触控。'}]:[],conditions:[]}))};
 assert.equal(validateClaimReview(badRaw,{input,output,sources,segments:harmful}).status,'blocked');
});
