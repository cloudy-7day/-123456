import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './config.mjs';
import { reviewDraft, blockReviewedOutput, applyReviewPatches } from './claim-review.mjs';

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
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties || {}, key))) throw Error(`${location} 含未支持的字段`);
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) validate(value[key], child, `${location}.${key}`, allowEmpty);
    }
  }
  if (type === 'array') {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw Error(`${location} 最多允许 ${schema.maxItems} 项`);
    if (schema.minItems && value.length < schema.minItems) throw Error(`${location} 至少需要 ${schema.minItems} 项`);
    value.forEach((item, i) => validate(item, schema.items, `${location}[${i}]`, allowEmpty));
  }
}

// Citation markers remain in saved evidence, but do not consume the reader-facing card budget.
export function validateMarketingPackage(output) {
  const pack = output?.marketing_package;
  if (!pack) return;
  const check = (value, limit, field) => {
    const visible = String(value).replace(/\[(?:S|I)\d+\]/g, '').trim();
    if ([...visible].length > limit) throw Error(`${field} 可见文字超过 ${limit} 字，请缩短完整表达，不截断事实或适用条件。`);
    if (!visible) throw Error(`${field} 不能只包含引用编号。`);
  };
  check(pack.cover_title, 18, '封面标题'); check(pack.cover_subtitle, 32, '封面副标题');
  pack.cards.forEach((card, i) => { check(card.heading, 18, `内容卡${i + 1}标题`); check(card.body, 140, `内容卡${i + 1}正文`); });
  pack.consultation_replies.forEach((item, i) => { check(item.question, 40, `咨询${i + 1}问题`); check(item.reply, 120, `咨询${i + 1}答复`); });
}

export async function runPipeline(input, { retrieve, generate, review, repair, progress = () => {} }) {
  const started = Date.now();
  const inputSchema = readJson('contracts/input.schema.json');
  const outputSchema = readJson('contracts/output.schema.json');
  validate(input, inputSchema);
  progress('正在查找产品资料与图片');
  const evidence = await retrieve(input, progress);
  const sources = evidence.sources || [];
  if (!sources.some(s => s.kind === 'text' && s.text?.trim())) throw Error('没有取得可读的产品原文，停止生成。请核对型号及当前知识库中的产品原文。');
  progress('正在根据原文生成销售内容');
  const promptFiles = ['system.txt', 'image-rules.txt', 'occupation-scenes.txt', ...(input.platform === '小红书' ? ['xiaohongshu.txt'] : [])];
  const system = promptFiles.map(file => fs.readFileSync(path.join(ROOT, 'prompts', file), 'utf8')).join('\n\n');
  const generationSystem = system + (evidence.retrieval?.mode==='cached' ? `\n本轮使用此前真实检索保存的缓存原文，保存时间：${evidence.retrieval.source_created_at}。不得宣称实时检索或当期信息已核验；可能过时的内容应列入待确认。` : '');
  const generationArgs = { input, sources, outputSchema, system: generationSystem };
  let generationAttempts = 1, formatRetryReason = null;
  let output = await generate(generationArgs);
  const contentFields = ['title', 'body', 'call_to_action'];
  function checkDraft(value) {
    const stopped = contentFields.every(key => typeof value?.content?.[key] === 'string' && !value.content[key].trim());
    try {
      validate(value, outputSchema, 'output', stopped ? new Set(contentFields.map(key => `output.content.${key}`)) : new Set());
      validateMarketingPackage(value);
    } catch (error) {
      // Only shape and layout errors are eligible for the one bounded generation retry.
      error.code = 'DRAFT_FORMAT_INVALID';
      throw error;
    }
    if (stopped && value.marketing_package) throw Error('暂停成稿必须同时移除封面、内容卡与咨询答复。');
    if (stopped && (!value.pending_confirmation.some(x => x.trim()) || value.image_plan.length)) throw Error('暂停成稿必须说明待确认原因，并停止配图。');
    const allowed = new Set(sources.map(s => s.ref));
    const mentioned = [...JSON.stringify(value).matchAll(/\[(S\d+|I\d+)\]/g)].map(x => x[1]);
    const refs = [...value.source_refs, ...mentioned, ...value.image_plan.map(x => x.source_ref)];
    if (refs.some(ref => !allowed.has(ref))) throw Error('模型输出了不存在的来源引用，请重新生成。');
    const used = new Set([...mentioned, ...value.image_plan.map(x => x.source_ref)]);
    if ([...used].some(ref => !value.source_refs.includes(ref)) || value.source_refs.some(ref => !used.has(ref))) throw Error('引用列表必须准确收齐正文与配图实际使用的来源，不得遗漏或添加未用引用。');
    if (new Set(value.source_refs).size !== value.source_refs.length || new Set(value.image_plan.map(x => x.source_ref)).size !== value.image_plan.length) throw Error('来源引用或配图重复，请重新生成。');
    if (value.image_plan.some(x => !sources.some(s => s.ref === x.source_ref && s.kind === 'image'))) throw Error('配图引用不是图片来源，请重新生成。');
    return stopped;
  }
  let blocked;
  try { blocked = checkDraft(output); }
  catch (error) {
    if (error.code !== 'DRAFT_FORMAT_INVALID') throw error;
    formatRetryReason = error.message;
    progress('图文结构或字数需要调整，正在保留完整条件重写一次');
    generationAttempts = 2;
    output = await generate({ ...generationArgs, formatFeedback: {
      attempt: 1, reason: formatRetryReason, previous_draft: output,
      instruction: '仅修复上次结构或排版问题，重新返回完整JSON。正文卡目标40—80字，上限140字；不要硬截字或删除会改变含义的限定，必要时换用另一项有据事实。不要新增服务、效果或引用。所有新稿仍须完整事实核验。',
    } });
    blocked = checkDraft(output);
  }
  if (review && !blocked) progress('正在逐句核对产品主张与原文依据');
  const reviewSystem = fs.readFileSync(path.join(ROOT, 'prompts/fact-review.txt'), 'utf8');
  let claimReview = await reviewDraft({ input, output, sources, review, system: reviewSystem });
  claimReview.attempts = review && !blocked ? 1 : 0;
  claimReview.repair_attempted = false;
  if (claimReview.status === 'blocked' && typeof repair === 'function') {
    // Preserve each original claim, its exact evidence and conditions so a later
    // repair cannot erase why the first draft was rejected.
    const firstReview = { ...structuredClone(claimReview), rejected_claims: structuredClone(claimReview.claims.filter(claim => claim.status === 'rejected')) };
    progress('正在按核验意见修订一次：保留有据卖点，删除无依据推断');
    try {
      const patch = await repair({ input, sources, outputSchema, output, reviewReport: claimReview, system: generationSystem });
      const { output: revised, actions } = applyReviewPatches(output, claimReview, patch, sources);
      blocked = checkDraft(revised);
      output = revised;
      progress('正在复核修订后的文案与原文依据');
      claimReview = await reviewDraft({ input, output, sources, review, system: reviewSystem });
      claimReview.attempts = blocked ? 1 : 2;
      claimReview.repair_attempted = true;
      claimReview.repair_status = 'completed';
      claimReview.repair_actions = actions;
      claimReview.first_review = firstReview;
    } catch {
      claimReview = { ...claimReview, status: 'error', repair_attempted: true, repair_status: 'failed', first_review: firstReview,
        issues: [{ code: 'repair_unavailable', message: '受约束修订未完成或格式未通过，已暂停交付。' }], note: '最多修订一次，失败不会继续循环或跳过审查。' };
    }
  }
  if (['blocked', 'error'].includes(claimReview.status)) {
    output = blockReviewedOutput(output, claimReview, sources);
    blocked = true;
    validate(output, outputSchema, 'output', new Set(contentFields.map(key => `output.content.${key}`)));
  }
  // The new graphic package has its own three text cards; one verified cover image is enough.
  const minimumImages = input.platform === '小红书' && output.marketing_package ? 1 : ({ '小红书': 3, '公众号': 2, '朋友圈': 1, '门店海报': 1 }[input.platform] || 1);
  const missingImages = blocked ? 0 : Math.max(0, minimumImages - output.image_plan.length);
  const delivery = { status: blocked ? 'blocked' : missingImages ? 'needs_images' : 'draft', missing_images: missingImages,
    reasons: blocked ? [...output.pending_confirmation] : missingImages ? [`${input.platform}配图建议至少${minimumImages}张，本次${output.image_plan.length}张，需补${missingImages}张。`] : [] };
  progress('引用编号与输出结构检查完成');
  return {
    schema_version: inputSchema.schema_version,
    input, output, sources, delivery,
    checks: { structure_valid: true, source_refs_valid: true, semantic_review: claimReview.status === 'not_performed' ? 'not_performed' : claimReview.status === 'error' ? 'failed' : claimReview.status === 'not_applicable' ? 'not_applicable' : 'assisted_review', claim_review: claimReview,
      note: review ? '已执行独立模型辅助审查与逐字证据/覆盖检查；通过不等于实机测试或人工认证，图片画面仍需人工核对。' : '仅检查结构与引用编号；未执行独立语义事实审查。' },
    meta: { knowledge_base: evidence.knowledgeBase, retrieval: evidence.retrieval, warnings: evidence.warnings || [], generation_attempts: generationAttempts, format_retry: formatRetryReason ? { reason: formatRetryReason } : null, created_at: new Date().toISOString(), duration_ms: Date.now() - started },
  };
}
