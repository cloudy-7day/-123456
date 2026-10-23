import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScenarioCard} from '../modules/scenario/shared/scenario-card.mjs';
import {buildHandoff} from '../src/handoff.mjs';
import {validateUnderstanding} from '../modules/scenario/shared/contract.mjs';
import {retrieveResearchContext} from '../src/research-context.mjs';
const fact=(category,value)=>({category,value,kind:'fact',evidence:[{sourceId:'scenario',quote:value}],rationale:'原文'});
const analysis=observations=>({understanding:{observations,product:{name:null}},input:{sources:[]}});

test('student task card uses extracted tasks and problems without changing them to the example task',()=>{
 const a=analysis([fact('identity','我是一名学生'),fact('task','在图书馆复习考试'),fact('pain','复习资料太分散')]);
 const card=buildScenarioCard(a);
 assert.equal(card.template_id,'student');
 assert.equal(card.tasks[0].value,'在图书馆复习考试');
 assert.equal(card.problem.value,'复习资料太分散');
 assert.equal(card.problem.kind,'fact');
 assert.equal(card.buying_stage.kind,'unknown');
 assert(!JSON.stringify(card.tasks).includes('小组汇报'));
});
test('scene label is recovered from the same source sentence, not assumed from occupation',()=>{
 const a=analysis([fact('identity','我是一名学生'),fact('task','整理照片，搭好汇报初稿')]);
 a.input.sources=[{id:'scenario',text:'我是一名学生。\n在寝室，整理照片，搭好汇报初稿。'}];
 const card=buildScenarioCard(a);
 assert.equal(card.tasks[0].scene_label,'寝室');assert.match(card.title,/汇报/);
 assert(card.tasks[0].evidence.some(e=>e.quote==='在寝室'));
 a.input.sources[0].text='我是一名学生。整理照片，搭好汇报初稿。';
 assert.equal(buildScenarioCard(a).tasks[0].scene_label,undefined);
});
test('occupation-only input gets a clearly marked task candidate and no invented customer facts',()=>{
 const card=buildScenarioCard(analysis([fact('identity','我是一名学生')]));
 assert.equal(card.tasks.length,3);
 assert(card.tasks.every(x=>x.kind==='suggestion'&&x.evidence.length===0));
 assert.equal(card.problem.kind,'suggestion');
 assert.equal(card.goal.kind,'suggestion');
 assert.equal(card.buying_stage.kind,'unknown');
 assert.equal(card.product.kind,'suggestion');
});
test('explicit meeting tasks can be used across occupations without relabeling a doctor as office staff',()=>{
 const card=buildScenarioCard(analysis([fact('identity','我是一名医生'),fact('task','会前整理科室教学会议材料'),fact('purchase_stage','正在比较两款电脑'),fact('content_goal','希望读者咨询具体型号')]),{businessScenario:'student'});
 assert.equal(card.identity.value,'我是一名医生');
 assert.equal(card.template_id,'meeting');
 assert.equal(card.buying_stage.kind,'fact');
 assert.equal(card.goal.value,'引导咨询');
 assert.equal(card.goal.kind,'inference');
 assert(card.goal.evidence.length);
});
test('unrelated occupation is not assigned student tasks by a conflicting preference',()=>{
 const card=buildScenarioCard(analysis([fact('identity','我是一名律师'),fact('task','整理合同批注')]),{businessScenario:'student',contentGoal:'save',product:'指定测试型号'});
 assert.equal(card.template_id,null);
 assert.equal(card.tasks[0].value,'整理合同批注');
 assert.equal(card.goal.kind,'operator');
 assert.equal(card.product.value,'指定测试型号');
});
test('empty input never becomes a real student and inferred problem stays inferred',()=>{
 const card=buildScenarioCard(analysis([{category:'pain',kind:'inference',value:'可能不易找回讨论意见',evidence:[{sourceId:'scenario',quote:'意见很多'}],rationale:'据输入推断'}]),{businessScenario:'meeting'});
 assert.equal(card.identity.kind,'unknown');
 assert.equal(card.problem.kind,'inference');
 assert.equal(card.template_id,'meeting');
 assert(card.tasks.every(t=>t.kind==='suggestion'));
});
test('an inferred or explicitly unknown buying stage cannot become a completed purchase-stage field',()=>{
 for(const o of [{...fact('purchase_stage','可能在比较电脑'),kind:'inference'},fact('purchase_stage','购买阶段尚未确定'),fact('purchase_stage','不是假设客户已经准备购买')])assert.equal(buildScenarioCard(analysis([o])).buying_stage.kind,'unknown');
});
test('confirmed card and extracted goal reach generation research without being inserted into customer input',async()=>{
 const text='我是一名学生。在图书馆复习考试。希望读者咨询具体型号。';
 const sources=[{id:'scenario',type:'scenario',text}];
 const raw={observations:[fact('identity','我是一名学生'),fact('task','在图书馆复习考试'),fact('content_goal','希望读者咨询具体型号')].map((o,i)=>({...o,id:'o'+i,critical:false})),questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}};
 const a={analysisId:'00000000-0000-4000-8000-000000000001',input:{sources},understanding:validateUnderstanding(raw,sources),review:{status:'confirmed'}};
 const h=buildHandoff(a,{analysisId:a.analysisId,product:'测试型号',productConfirmed:true,platforms:['小红书']});
 assert.equal(h.tasks[0].content_goal,'consultation');assert.equal(h.tasks[0].content_goal_origin,'input_extracted');
 assert.equal(h.customer_context.scenario_card.tasks[0].value,'在图书馆复习考试');
 assert.equal(h.customer_context.original_sources[0].text,text);
 const r=await retrieveResearchContext(h.tasks[0],{customerContext:h.customer_context});
 assert.equal(r.content_brief.scenario_card.goal.id,'consultation');
 assert.equal(r.content_brief.buying_stage,'unknown');assert.equal(r.scenario_id,'SC01');
});
