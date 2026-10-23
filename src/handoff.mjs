import { z } from 'zod';
import { deriveGate, validateUnderstanding } from '../modules/scenario/shared/contract.mjs';
import { validate } from './pipeline.mjs';
import { readJson } from './config.mjs';

export const handoffSchema = z.object({
  analysisId: z.string().uuid(),
  product: z.string().trim().min(1).max(120),
  productConfirmed: z.literal(true),
  productOrigin: z.enum(['system_candidate','input_match','salesperson_selection']).default('salesperson_selection'),
  platforms: z.array(z.enum(['小红书', '公众号', '朋友圈', '门店海报'])).min(1).max(4),
  audience: z.string().trim().max(500).default(''),
  goal: z.string().trim().max(500).default('帮助读者做出选购判断并引导有效咨询'),
  store_support: z.enum(['selection_guidance','software_check','in_store_demo']).default('selection_guidance'),
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
  const unresolved = gate.reasons.filter(reason => !(reason === '产品意向存在歧义' && options.productOrigin === 'salesperson_selection'));
  if (unresolved.length) throw Error('关键条件尚未确认：' + unresolved.join('；'));
  // Keep original customer intent separate from an automatically prepared retrieval candidate.
  const scenario = analysis.input.sources.filter(s => s.type !== 'product')
    .map(s => `${s.type === 'revision' ? '客户后续更正（优先于旧记录）' : '客户输入'}：${s.text}`).join('\n\n');
  if (scenario.length > 2000) throw Error('完整场景与修订超过队友接口的 2000 字限制，请精简原文后重新理解；不会自动截断。');
  const audience = options.audience || '以客户原话和已确认洞察中的身份为准；不推断未提供的背景';
  const tasks = [...new Set(options.platforms)].map(platform => ({
    product: options.product, audience, scenario, platform, goal: options.goal, store_support: options.store_support,
    notes: '信息不完整时先生成有依据的有限草稿：不承诺未知的课程软件、本地AI算力、预算适配；相关缺口作为必要的简短条件说明或待确认事项，不生成演示脚本。未验证的软件兼容、价格与优惠不得承诺。客户洞察中的推断不得升级为事实。',
  }));
  for (const task of tasks) validate(task, readJson('contracts/input.schema.json'));
  return { schema_version: 'handoff.1', analysis_id: analysis.analysisId, tasks,
    store_context: { store_support: options.store_support, explicitly_selected: Object.hasOwn(request, 'store_support') },
    customer_context: { draft_limitations:gate.warnings, understanding, provenance: analysis.provenance, review: analysis.review,
      original_sources: analysis.input.sources, product_selection: { name: options.product, confirmed: options.productOrigin !== 'system_candidate', approved_for_draft:true, origin: options.productOrigin, original_intent: understanding.product } } };
}
