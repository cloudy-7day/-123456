import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHandoff} from '../src/handoff.mjs';
import {roleExamples,buildRoleExample} from '../modules/scenario/shared/role-examples.mjs';
import {sceneOptions} from '../modules/scenario/shared/experience.mjs';
const analysis={analysisId:'00000000-0000-4000-8000-000000000001',input:{sources:[{id:'scenario',type:'scenario',text:'我是一名律师，整理公开材料。'}]},understanding:{observations:[{id:"o1",category:"task",kind:"unknown",value:null,evidence:[],rationale:"未提供",critical:false}],questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}},review:{status:'confirmed'}};
const request={analysisId:analysis.analysisId,product:'测试产品',productConfirmed:true,platforms:['小红书']};
test('operator preferences retain original customer source and explicit origins',()=>{
 const h=buildHandoff(analysis,{...request,businessScenario:'student',contentGoal:'save'});
 assert.equal(h.tasks[0].business_scenario,'student');assert.equal(h.tasks[0].content_goal,'save');
 assert.equal(h.tasks[0].business_scenario_origin,'operator_selected');assert.equal(h.tasks[0].content_goal_origin,'operator_selected');
 assert.match(h.tasks[0].scenario,/律师/);assert.equal(h.customer_context.original_sources[0].text,analysis.input.sources[0].text);
});
test('defaults prefer conversation without fabricated customer intent',()=>{
 const t=buildHandoff(analysis,request).tasks[0];assert.equal(t.business_scenario,'auto');assert.equal(t.content_goal,'conversation');assert.equal(t.content_goal_origin,'default_suggestion');assert.doesNotMatch(t.goal,/到店/);
});
test('student and meeting examples each connect one deliverable across stages',()=>{
 const student=roleExamples.find(r=>r.id==='student');assert(student.scenes.filter(s=>student.defaults.includes(s.id)).every(s=>s.text.includes('同一份小组汇报')));
 const meeting=roleExamples.find(r=>r.id==='meeting');assert(meeting);const text=buildRoleExample('meeting',meeting.defaults).text;assert.match(text,/行动项/);assert.match(text,/方案/);assert.match(text,/虚构/);
 assert.equal(sceneOptions.find(s=>s.id==='campus').businessScenario,'student');assert.equal(sceneOptions.find(s=>s.id==='mobile').businessScenario,'meeting');
});
