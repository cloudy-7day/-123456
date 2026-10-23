import test from 'node:test';
import assert from 'node:assert/strict';
import {roleExamples,buildRoleExample,supplementExamples} from '../modules/scenario/shared/role-examples.mjs';
import {sceneOptions} from '../modules/scenario/shared/experience.mjs';
import {buildScenarioCard} from '../modules/scenario/shared/scenario-card.mjs';
const fact=(category,value)=>({category,value,kind:'fact',evidence:[{sourceId:'scenario',quote:value}]});
const analysis=observations=>({understanding:{observations},input:{sources:[]}});

test('primary examples retain distinct real selection needs and fictional unknowns',()=>{
 assert.deepEqual(roleExamples.map(r=>r.id),['student','meeting']);
 const student=buildRoleExample('student',['dorm','classroom','library']).text;
 const meeting=buildRoleExample('meeting',['before','during','after']).text;
 for(const term of ['寝室','教室','图书馆','同一份小组汇报','手指触控','轻便'])assert(student.includes(term));
 for(const term of ['Windows','大屏','独立数字键盘','会前','会议中','会后'])assert(meeting.includes(term));
 assert.match(student,/购买阶段均未确定/);
});
test('business catalog covers manual taxonomy and supplementary briefs explicitly set marketing goals',()=>{
 for(const label of ['开学季','职场办公','内容创作','家庭换新','企业采购','门店到访','新品首发','节日营销'])assert(sceneOptions.some(s=>s.label.includes(label)));
 assert.equal(supplementExamples.length,7);
 assert.equal(new Set(supplementExamples.map(e=>e.id)).size,7);
 for(const e of supplementExamples){assert.match(e.text,/假设/);assert.match(e.text,/购买阶段明确设定/);assert.match(e.text,/内容目标/);assert.match(e.text,/未知|未提供|尚未/);assert.doesNotMatch(e.text,/医生|律师/);}
 assert.match(supplementExamples.find(e=>e.id==='business-store').text,/一个.*核心卖点/);
});
test('business labels preserve legacy task template identifiers',()=>{
 const student=buildScenarioCard(analysis([fact('identity','我是一名学生'),fact('task','图书馆写报告')]));
 assert.equal(student.template_id,'student');assert.equal(student.business_scene.value,'开学季');
 const meeting=buildScenarioCard(analysis([fact('task','会前准备会议材料')]));
 assert.equal(meeting.template_id,'meeting');assert.equal(meeting.business_scene.value,'职场办公');
 const store=buildScenarioCard(analysis([fact('situation','本轮场景是门店到访'),fact('content_goal','引导咨询或到店体验')]));
 assert.equal(store.template_id,null);assert.equal(store.business_scene.value,'门店到访');assert.equal(store.goal.id,'consultation');
 assert.equal(store.buying_stage.kind,'unknown');
 const selected=buildScenarioCard(analysis([fact('identity','我是一名学生'),fact('task','图书馆写报告')]),{businessScenario:'store'});
 assert.equal(selected.template_id,'student');assert.equal(selected.business_scene.value,'门店到访');assert.equal(selected.business_scene.kind,'operator');
 const explicitStage=buildScenarioCard(analysis([fact('purchase_stage','采购方案比较，数量和预算尚未确定')]));
 assert.equal(explicitStage.buying_stage.kind,'fact');
 assert.equal(buildScenarioCard(analysis([fact('purchase_stage','采购方案比较')])).buying_stage.kind,'fact');
});
test('unknown goals and stages never become customer facts; operator business scene creates no task facts',()=>{
 const card=buildScenarioCard(analysis([fact('purchase_stage','购买阶段未确定'),fact('content_goal','内容目标未知，不要补造咨询目标')]),{businessScenario:'creation'});
 assert.equal(card.buying_stage.kind,'unknown');assert.equal(card.goal.kind,'suggestion');
 assert.equal(card.business_scene.kind,'operator');assert.equal(card.template_id,null);
 assert(card.tasks.every(t=>t.kind==='suggestion'));
});
