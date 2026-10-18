import { test } from 'node:test';
import assert from 'node:assert/strict';

let api;
try { api = await import('../src/pipeline.mjs'); } catch {}
const input = { product: 'HUAWEI MateBook 14（鸿蒙版）', audience: '大学新生', scenario: '上课做笔记', platform: '小红书' };
const sources = [{ ref: 'S1', title: '产品事实.md', text: '这是测试原文。', kind: 'text' }];
const draft = { customer_insight: '需要课堂笔记', strategy: '围绕课堂', content: { title: '课堂笔记', body: '到店验证笔记工作流 [S1]', call_to_action: '带常用文件体验' }, image_plan: [], sales_plan: { quote: '待确认价格规则', demo_script: '验证工作流' }, follow_up: [], source_refs: ['S1'], pending_confirmation: ['软件兼容性'] };

test('pipeline module exists', () => assert.ok(api?.runPipeline));
test('missing input fails before connecting services', async () => {
  assert.ok(api);
  await assert.rejects(api.runPipeline({ ...input, product: '' }, { retrieve: () => assert.fail('must not retrieve') }), /product|产品/);
});
test('ima failure stops before generation', async () => {
  assert.ok(api);
  await assert.rejects(api.runPipeline(input, { retrieve: async () => { throw Error('skill auth failed'); }, generate: () => assert.fail('must not generate') }), /skill auth failed/);
});
test('no readable originals stops instead of generating unsupported facts', async () => {
  assert.ok(api);
  await assert.rejects(api.runPipeline(input, { retrieve: async () => ({ sources: [], warnings: [] }), generate: () => assert.fail('must not generate') }), /原文/);
});
test('successful run keeps evidence and labels semantic review as pending', async () => {
  assert.ok(api);
  const result = await api.runPipeline(input, { retrieve: async () => ({ sources, warnings: [] }), generate: async () => draft });
  assert.equal(result.output.content.title, draft.content.title);
  assert.equal(result.sources[0].ref, 'S1');
  assert.equal(result.checks.semantic_review, 'not_performed');
  assert.equal(result.checks.source_refs_valid, true);
});
test('invented source references fail validation', async () => {
  assert.ok(api);
  await assert.rejects(api.runPipeline(input, { retrieve: async () => ({ sources }), generate: async () => ({ ...draft, source_refs: ['S999'] }) }), /引用/);
});
