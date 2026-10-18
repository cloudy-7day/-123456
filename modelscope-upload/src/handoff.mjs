import { z } from 'zod';
import { deriveGate, validateUnderstanding } from '../modules/scenario/shared/contract.mjs';
import { validate } from './pipeline.mjs';
import { readJson } from './config.mjs';

export const handoffSchema = z.object({
  analysisId: z.string().uuid(),
  product: z.string().trim().min(1).max(120),
  productConfirmed: z.literal(true),
  platforms: z.array(z.enum(['小红书', '公众号', '朋友圈', '门店海报'])).min(1).max(4),
  audience: z.string().trim().max(500).default(''),
  goal: z.string().trim().max(500).default('引导咨询和到店体验'),
}).strict();

export function buildHandoff(analysis, request) {
  const options = handoffSchema.parse(request);
  if (options.analysisId !== analysis.analysisId) throw Error('分析版本不一致，请重新确认。');
  if (analysis.review?.status !== 'confirmed') throw Error('请先核对并确认本轮洞察。');
  const raw = structuredClone(analysis.understanding);
  const strip = item => ({ ...item, evidence: item.evidence.map(({sourceId, quote}) => ({sourceId, quote})) });
  raw.observations = raw.observations.map(strip); raw.questions = raw.questions.map(strip);
  raw.conflicts = raw.conflicts.map(strip); raw.product = strip(raw.product);
  const understanding = validateUnderstanding(raw, analysis.input.sources);
  const gate = deriveGate(understanding, { reviewed: true });
  if (gate.status !== 'ready_for_ima') throw Error('关键条件尚未确认：' + gate.reasons.join('；'));
  // The original product intent stays intact; this is a separately confirmed retrieval target.
  const scenario = analysis.input.sources.filter(s => s.type !== 'product')
    .map(s => `${s.type === 'revision' ? '客户后续更正（优先于旧记录）' : '客户输入'}：${s.text}`).join('\n\n');
  if (scenario.length > 2000) throw Error('完整场景与修订超过队友接口的 2000 字限制，请精简原文后重新理解；不会自动截断。');
  const audience = options.audience || '以客户原话和已确认洞察中的身份为准；不推断未提供的背景';
  const tasks = [...new Set(options.platforms)].map(platform => ({
    product: options.product, audience, scenario, platform, goal: options.goal,
    notes: '先核验指定型号与客户硬要求是否适配。未验证的软件兼容、价格与优惠不得承诺。客户洞察中的推断不得升级为事实。',
  }));
  for (const task of tasks) validate(task, readJson('contracts/input.schema.json'));
  return { schema_version: 'handoff.1', analysis_id: analysis.analysisId, tasks,
    customer_context: { understanding, provenance: analysis.provenance, review: analysis.review,
      original_sources: analysis.input.sources, product_selection: { name: options.product, confirmed: true, origin: 'salesperson_selection', original_intent: understanding.product } } };
}
