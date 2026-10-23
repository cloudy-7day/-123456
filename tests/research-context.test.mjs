import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { retrieveResearchContext } from '../src/research-context.mjs';
test('Moments retains scenario research without importing Xiaohongshu writing patterns',async()=>{
 const result=await retrieveResearchContext({platform:'朋友圈',audience:'大学生',scenario:'小组汇报'});
 assert.equal(result.scenario_id,'SC01');
 assert(result.research_context.length>0);
 assert.deepEqual(result.writing_patterns,[]);
});

test('student retrieves attributed scenario, marketing context and usable writing patterns', async () => {
  const result = await retrieveResearchContext({ audience: '大学生', scenario: '入学后课程资料整理，小组汇报', product: 'HUAWEI MateBook 14（鸿蒙版）' });
  assert.equal(result.scenario_id, 'SC01');
  assert.ok(result.research_context.some(r => r.record_id === 'SC01'));
  assert.ok(result.research_context.some(r => r.record_id.startsWith('MC')));
  assert.ok(result.writing_patterns.some(r => r.material.recommendation));
  assert.ok(result.research_context.every(r => r.is_customer_fact === false && r.sources.length));
  assert.deepEqual(result.customer_facts, []);
  assert.equal(result.content_brief.buying_stage, 'unknown');
  assert.equal(result.product_classification.catalog_name, 'HUAWEI MateBook 14（鸿蒙版）');
  assert.equal(result.product_classification.candidate_only, true);
});

test('explicit meeting task selects SC02 and preserves operator goal without a buying stage', async () => {
  const result = await retrieveResearchContext({ scenario: '会议结束后整理行动项，改客户方案', business_scenario: 'student', content_goal: 'consultation' });
  assert.equal(result.scenario_id, 'SC02');
  assert.equal(result.content_brief.goal, 'consultation');
  assert.equal(result.content_brief.goal_origin, 'operator_selected');
  assert.equal(result.content_brief.buying_stage, 'unknown');
  assert.ok(result.research_context.some(r => r.record_id === 'SC02'));
  assert.ok(!result.research_context.some(r => r.record_id.startsWith('MC')));
});

test('unknown identity stays unknown; explicit identity overrides conflicting scenario card', async () => {
  assert.equal((await retrieveResearchContext({ product: 'MateBook' })).scenario_id, null);
  assert.equal((await retrieveResearchContext({ audience: '我是大学生', business_scenario: 'meeting' })).scenario_id, 'SC01');
  assert.equal((await retrieveResearchContext({ audience: '我是律师', business_scenario: 'student' })).scenario_id, null);
  assert.equal((await retrieveResearchContext({ audience: '大学生', scenario: '我是律师，需要阅读公开资料', business_scenario: 'student' })).scenario_id, null);
  assert.equal((await retrieveResearchContext({ scenario: '我不是学生，我在公司负责项目会议', business_scenario: 'student' })).scenario_id, 'SC02');
});

test('original customer text overrides audience card and supports task-only meeting entry', async () => {
  const result = await retrieveResearchContext({ audience: '大学生', business_scenario: 'student' }, { customerContext: { original_sources: [{ type: 'text', text: '我是项目经理，会议结束需要整理行动项。' }] } });
  assert.equal(result.scenario_id, 'SC02');
});

test('product classification accepts only exact full catalog or verified name', async () => {
  for (const product of ['MateBook 14', 'HUAWEI MateBook Pro S（鸿蒙版） 高配', 'HUAWEI MateBook Pro']) {
    const result = await retrieveResearchContext({ product });
    if (product === 'HUAWEI MateBook Pro') assert.equal(result.product_classification.catalog_name, 'HUAWEI MateBook Pro（鸿蒙版）');
    else assert.equal(result.product_classification, null);
  }
});

test('every returned record is eligible in real database and excluded sources never enter', async () => {
  const result = await retrieveResearchContext({ audience: '大学生', scenario: '毕业项目资料整理', product: 'HUAWEI MateBook 14（鸿蒙版）' });
  const db = new DatabaseSync(new URL('../research/semifinal-2026-10-22/research.sqlite', import.meta.url), { readOnly: true });
  try {
    const records = [...result.research_context, ...result.writing_patterns, result.product_classification].filter(Boolean);
    for (const record of records) {
      assert.equal(db.prepare('SELECT eligible_for_generation FROM records WHERE dataset=? AND id=?').get(record.dataset, record.record_id).eligible_for_generation, 1);
      assert.ok(record.sources.every(s => !/excluded|public_mirror|award_case_pdf_search_index/.test(s.source_type || '')));
    }
    assert.ok(result.provenance.record_ids.length > 0);
    assert.equal(result.provenance.as_of, '2026-10-22');
    assert.equal(result.provenance.database, 'research.sqlite');
    assert.ok(result.research_context.length <= 5);
    assert.ok(result.writing_patterns.length <= 4);
  } finally { db.close(); }
});

test('student group meetings retain student context and negated identities cannot select it', async () => {
  assert.equal((await retrieveResearchContext({ audience: '大学生', scenario: '课程小组会议后整理汇报', business_scenario: 'meeting' })).scenario_id, 'SC01');
  assert.equal((await retrieveResearchContext({ scenario: '我是大学生，需要开小组会议', business_scenario: 'meeting' })).scenario_id, 'SC01');
  assert.equal((await retrieveResearchContext({ scenario: '我不是学生', audience: '大学生', business_scenario: 'student' })).scenario_id, null);
});

test('marketing triggers are explicit and inherited default goal remains a suggestion', async () => {
  const student = await retrieveResearchContext({ audience: '大学生', scenario: '整理课程资料', content_goal: 'save', content_goal_origin: 'default_suggestion' });
  assert.ok(!student.research_context.some(r => r.record_id.startsWith('MC')));
  assert.equal(student.content_brief.goal_origin, 'default_suggestion');
  const meeting = await retrieveResearchContext({ scenario: '正在比较电脑，需要整理会议行动项', content_goal: 'consultation' });
  assert.ok(meeting.research_context.some(r => r.record_id === 'MC04'));
  assert.ok(meeting.writing_patterns.some(r => r.record_id === 'XP05'));
});

test('invalid operator enums fail explicitly', async () => {
  await assert.rejects(retrieveResearchContext({ business_scenario: 'doctor' }), /business_scenario/);
  await assert.rejects(retrieveResearchContext({ content_goal: 'buy_now' }), /content_goal/);
});
