import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './config.mjs';

// Supports the JSON Schema subset used by the two team-owned contracts.
export function validate(value, schema, location = 'input', allowEmpty = new Set()) {
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
      if (value[key] === undefined || value[key] === null || (typeof value[key] === 'string' && !value[key].trim() && !allowEmpty.has(`${location}.${key}`))) throw Error(`${location}.${key} 为必填项`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) validate(value[key], child, `${location}.${key}`, allowEmpty);
    }
  }
  if (type === 'array') {
    if (schema.minItems && value.length < schema.minItems) throw Error(`${location} 至少需要 ${schema.minItems} 项`);
    value.forEach((item, i) => validate(item, schema.items, `${location}[${i}]`, allowEmpty));
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
  if (!sources.some(s => s.kind === 'text' && s.text?.trim())) throw Error('没有取得可读的产品原文，停止生成。请核对型号及当前知识库中的产品原文。');
  progress('正在根据原文生成销售内容');
  const system = fs.readFileSync(path.join(ROOT, 'prompts/system.txt'), 'utf8');
  const output = await generate({ input, sources, outputSchema, system: system + (evidence.retrieval?.mode==='cached' ? `\n本轮使用此前真实检索保存的缓存原文，保存时间：${evidence.retrieval.source_created_at}。不得宣称实时检索或当期信息已核验；可能过时的内容应列入待确认。` : '') });
  const contentFields = ['title', 'body', 'call_to_action'];
  const blocked = contentFields.every(key => typeof output?.content?.[key] === 'string' && !output.content[key].trim());
  validate(output, outputSchema, 'output', blocked ? new Set(contentFields.map(key => `output.content.${key}`)) : new Set());
  if (blocked && (!output.pending_confirmation.some(x => x.trim()) || output.image_plan.length)) throw Error('暂停成稿必须说明待确认原因，并停止配图。');
  if (JSON.stringify(output.follow_up.map(x => x.day)) !== '[1,3,7]') throw Error('跟进必须按第1、3、7天各提供一项。');
  const allowed = new Set(sources.map(s => s.ref));
  const mentioned = [...JSON.stringify(output).matchAll(/\[(S\d+|I\d+)\]/g)].map(x => x[1]);
  const refs = [...output.source_refs, ...mentioned, ...output.image_plan.map(x => x.source_ref)];
  if (refs.some(ref => !allowed.has(ref))) throw Error('模型输出了不存在的来源引用，请重新生成。');
  const used = new Set([...mentioned, ...output.image_plan.map(x => x.source_ref)]);
  if ([...used].some(ref => !output.source_refs.includes(ref)) || output.source_refs.some(ref => !used.has(ref))) throw Error('引用列表必须准确收齐正文与配图实际使用的来源，不得遗漏或添加未用引用。');
  if (new Set(output.source_refs).size !== output.source_refs.length || new Set(output.image_plan.map(x => x.source_ref)).size !== output.image_plan.length) throw Error('来源引用或配图重复，请重新生成。');
  if (output.image_plan.some(x => !sources.some(s => s.ref === x.source_ref && s.kind === 'image'))) throw Error('配图引用不是图片来源，请重新生成。');
  const minimumImages = { '小红书': 3, '公众号': 2, '朋友圈': 1, '门店海报': 1 }[input.platform] || 1;
  const missingImages = blocked ? 0 : Math.max(0, minimumImages - output.image_plan.length);
  const delivery = { status: blocked ? 'blocked' : missingImages ? 'needs_images' : 'draft', missing_images: missingImages,
    reasons: blocked ? [...output.pending_confirmation] : missingImages ? [`${input.platform}配图建议至少${minimumImages}张，本次${output.image_plan.length}张，需补${missingImages}张。`] : [] };
  progress('引用编号与输出结构检查完成');
  return {
    schema_version: inputSchema.schema_version,
    input, output, sources, delivery,
    checks: { structure_valid: true, source_refs_valid: true, semantic_review: 'not_performed', note: '仅检查结构与引用编号；事实逐句核验、图片内容核验和完整营销合规审核尚未实现。' },
    meta: { knowledge_base: evidence.knowledgeBase, retrieval: evidence.retrieval, warnings: evidence.warnings || [], created_at: new Date().toISOString(), duration_ms: Date.now() - started },
  };
}
