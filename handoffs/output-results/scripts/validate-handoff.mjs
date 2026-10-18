import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// 独立交接检查，不是仓库原校验器，也不调用模型或网络。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const schema = read('contracts/output.schema.json');
const cases = read('examples/cases.json');
const fields = ['customer_insight', 'strategy', 'content', 'image_plan', 'sales_plan', 'follow_up', 'source_refs', 'pending_confirmation'];
const counts = {'小红书':[3,6], '公众号':[2,4], '朋友圈':[1,3], '门店海报':[1,1]};

function validate(rule, value, at = '$', errors = []) {
  const good = rule.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : rule.type === 'array' ? Array.isArray(value)
    : rule.type === 'integer' ? Number.isInteger(value)
    : typeof value === rule.type;
  if (!good) { errors.push(at + ': type ' + rule.type); return errors; }
  if (rule.enum && !rule.enum.includes(value)) errors.push(at + ': enum');
  if (typeof value === 'string' && rule.maxLength !== undefined && [...value].length > rule.maxLength) errors.push(at + ': maxLength');
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(at + ': minItems');
    value.forEach((v, i) => validate(rule.items, v, at + '[' + i + ']', errors));
  }
  if (rule.type === 'object') {
    for (const k of rule.required || []) if (!Object.hasOwn(value, k)) errors.push(at + '.' + k + ': required');
    for (const [k, r] of Object.entries(rule.properties || {})) if (Object.hasOwn(value, k)) validate(r, value[k], at + '.' + k, errors);
  }
  return errors;
}
function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}
function semantic(output, sources) {
  const errors = [], known = new Map(sources.map(s => [s.id, s]));
  const found = new Set(strings(output).flatMap(s => [...s.matchAll(/\[((?:S|I)\d+)\]/g)].map(m => m[1])));
  for (const item of output.image_plan || []) {
    found.add(item.source_ref);
    if (known.get(item.source_ref)?.type !== 'image') errors.push('image source type: ' + item.source_ref);
  }
  for (const id of found) if (!known.has(id)) errors.push('unknown reference: ' + id);
  if (JSON.stringify([...found].sort()) !== JSON.stringify([...new Set(output.source_refs)].sort())) errors.push('source_refs does not match used references');
  if (new Set(output.source_refs).size !== output.source_refs.length) errors.push('duplicate source_refs');
  if (JSON.stringify(output.follow_up.map(x => x.day)) !== '[1,3,7]') errors.push('follow_up days must be 1,3,7 exactly');
  if (JSON.stringify(Object.keys(output).sort()) !== JSON.stringify([...fields].sort())) errors.push('top-level field mismatch');
  if (new Set(output.image_plan.map(x => x.source_ref)).size !== output.image_plan.length) errors.push('duplicate image');
  return errors;
}
const rows = [];
assert.deepEqual([...schema.required].sort(), [...fields].sort());
for (const c of cases) {
  const output = read('examples/' + c.output), input = read('examples/' + c.input);
  const fixture = read('examples/' + c.fixture);
  const sources = fixture.sources.filter(s => c.source_ids.includes(s.id));
  const structural = validate(schema, output);
  assert.equal(structural.length === 0, c.expected_schema_valid, c.case_id + ': schema expectation: ' + structural.join('; '));
  assert.deepEqual(semantic(output, sources), [], c.case_id + ': references/days');
  if (c.expected_schema_valid && !c.delivery_state) {
    const [min, max] = counts[input.platform];
    assert.ok(output.image_plan.length >= min && output.image_plan.length <= max, c.case_id + ': image count');
    assert.ok(output.content.title && output.content.body && output.content.call_to_action, c.case_id + ': publishable fields missing');
  }
  if (c.delivery_state === 'text_draft_missing_images') {
    assert.equal(output.image_plan.length, 0);
    assert.ok(output.pending_confirmation.some(x => x.includes('缺图')));
  }
  if (c.delivery_state === 'blocked_conflict' || c.delivery_state === 'upstream_error_required') {
    assert.ok(Object.values(output.content).every(x => x === ''));
    assert.equal(output.image_plan.length, 0);
  }
  if (!c.expected_schema_valid) assert.deepEqual(structural, ['$.source_refs: minItems']);
  rows.push({case:c.case_id, structural_expected:c.expected_schema_valid ? 'valid' : 'invalid by design', checks:'passed', body_characters:[...output.content.body].length});
}
for (const name of ['source-fixture.json','conflict-source-fixture.json']) {
  for (const s of read('examples/' + name).sources) if (s.file) assert.ok(fs.existsSync(path.join(root, 'examples', s.file)), 'missing fixture ' + s.file);
}
const primary = read('examples/expected-output.json');
const sourceFixture = read('examples/source-fixture.json').sources;
// 反例确保检查不是只接受当前样例。
const mutations = [
  ['missing content', o => { delete o.content; }, o => validate(schema, o).length > 0],
  ['day string', o => { o.follow_up[0].day = '1'; }, o => validate(schema, o).length > 0],
  ['unknown source', o => { o.content.body += '[S999]'; }, o => semantic(o, sourceFixture).length > 0],
  ['text used as image', o => { o.image_plan[0].source_ref = 'S1'; }, o => semantic(o, sourceFixture).length > 0],
  ['orphan source', o => { o.source_refs.push('S999'); }, o => semantic(o, sourceFixture).length > 0],
  ['duplicate day', o => { o.follow_up[1].day = 1; }, o => semantic(o, sourceFixture).length > 0],
  ['invented wrapper', o => { o.checks = {passed:true}; }, o => semantic(o, sourceFixture).length > 0]
];
for (const [name, change, check] of mutations) { const o = structuredClone(primary); change(o); assert.ok(check(o), name + ': not detected'); }
assert.equal((1.33 * 1000 / 500).toFixed(1), '2.7');
const prompt = fs.readFileSync(path.join(root, 'prompts/system.txt'), 'utf8');
for (const f of fields) assert.ok(prompt.includes(f), 'prompt missing ' + f);
const report = {scope:'独立的离线交接文件检查；本脚本不调用原仓库校验器或ima/DeepSeek，不证明生成质量、事实正确或真实联调成功。原仓库检查另见repository-compatibility-report.json。',cases:rows,negative_checks:mutations.map(x => x[0]),result:'PASS'};
fs.writeFileSync(path.join(root, 'validation-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
