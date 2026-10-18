import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './config.mjs';

// Supports the JSON Schema subset used by the two team-owned contracts.
export function validate(value, schema, location = 'input') {
  const type = schema.type;
  const valid = type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : type === 'array' ? Array.isArray(value)
    : type === 'integer' ? Number.isInteger(value)
    : typeof value === type;
  if (!valid) throw Error(`${location} 类型必须是 ${type}`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${location} 必须从可选项中选择`);
  if (type === 'string') {
    if (schema.maxLength && value.length > schema.maxLength) throw Error(`${location} 内容过长`);
  }
  if (type === 'object') {
    for (const key of schema.required || []) {
      if (value[key] === undefined || value[key] === null || (typeof value[key] === 'string' && !value[key].trim())) throw Error(`${location}.${key} 为必填项`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) validate(value[key], child, `${location}.${key}`);
    }
  }
  if (type === 'array') {
    if (schema.minItems && value.length < schema.minItems) throw Error(`${location} 至少需要 ${schema.minItems} 项`);
    value.forEach((item, i) => validate(item, schema.items, `${location}[${i}]`));
  }
}

export async function runPipeline(input, { retrieve, generate, progress = () => {} }) {
  const started = Date.now();
  const inputSchema = readJson('contracts/input.schema.json');
  const outputSchema = readJson('contracts/output.schema.json');
  validate(input, inputSchema);
  progress('正在查找产品资料与图片');
  const evidence = await retrieve(input, progress);
  const sources = evidence.sources || [];
  if (!sources.some(s => s.kind === 'text' && s.text?.trim())) throw Error('没有取得可读的产品原文，停止生成。请核对型号或在ima客户端查看原文。');
  progress('正在根据原文生成销售内容');
  const system = fs.readFileSync(path.join(ROOT, 'prompts/system.txt'), 'utf8');
  const output = await generate({ input, sources, outputSchema, system });
  validate(output, outputSchema, 'output');
  const allowed = new Set(sources.map(s => s.ref));
  const mentioned = [...JSON.stringify(output).matchAll(/\[(S\d+|I\d+)\]/g)].map(x => x[1]);
  const refs = [...output.source_refs, ...mentioned, ...output.image_plan.map(x => x.source_ref)];
  if (refs.some(ref => !allowed.has(ref))) throw Error('模型输出了不存在的来源引用，请重新生成。');
  if (mentioned.some(ref => !output.source_refs.includes(ref))) throw Error('正文引用未完整列入 source_refs，请重新生成。');
  if (output.image_plan.some(x => !sources.some(s => s.ref === x.source_ref && s.kind === 'image'))) throw Error('配图引用不是图片来源，请重新生成。');
  progress('引用编号与输出结构检查完成');
  return {
    schema_version: inputSchema.schema_version,
    input, output, sources,
    checks: { structure_valid: true, source_refs_valid: true, semantic_review: 'not_performed', note: '仅检查结构与引用编号；事实逐句核验、图片内容核验和完整营销合规审核尚未实现。' },
    meta: { knowledge_base: evidence.knowledgeBase, warnings: evidence.warnings || [], created_at: new Date().toISOString(), duration_ms: Date.now() - started },
  };
}
