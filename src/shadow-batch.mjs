import { runPipeline } from './pipeline.mjs';
import { ImaClient } from './ima.mjs';
import { DeepSeekClient } from './deepseek.mjs';
import { safeError } from './config.mjs';
import { retrieveEvidence } from './evidence-cache.mjs';
import { retrieveResearchContext } from './research-context.mjs';
import {checkCopyQuality} from './editorial.mjs';

export async function runShadowBatch(handoff, settings, send, dependencies = {}) {
  const ima = dependencies.ima || new ImaClient(settings);
  const ds = dependencies.ds || new DeepSeekClient(settings);
  send({ type: 'progress', message: '正在取得本轮产品原文；所有平台共用同一批来源。' });
  const evidence = await retrieveEvidence(ima, handoff.tasks[0], settings, message => send({ type: 'progress', message }));
  send({type:'evidence',retrieval:{documents:evidence.sources.filter(s=>s.kind==='text').length,images:evidence.sources.filter(s=>s.kind==='image').length,context:evidence.context_retrieval}});
  const results = [], errors = [], blocked = [];
  for (const task of handoff.tasks) {
    try {
      const result = await runPipeline(task, {
        retrieve: async () => evidence,
        retrieveResearch: task => (dependencies.retrieveResearch || retrieveResearchContext)(task,{customerContext:handoff.customer_context}),
        ...(typeof ds.review==='function'?{review:args=>ds.review(args)}:{}),
        ...(typeof ds.repair==='function'?{repair:args=>ds.repair(args)}:{}),
        ...(typeof ds.polish==='function'?{polish:args=>ds.polish(args)}:{}),
        ...(typeof ds.polish==='function'?{checkCopy:checkCopyQuality}:{}),
        generate: args => ds.generate({ ...args, customerContext: handoff.customer_context }),
        progress: message => send({ type: 'progress', platform: task.platform, message }),
      });
      result.meta.model = settings.model;
      result.meta.scenario_analysis_id = handoff.analysis_id;
      results.push({ platform: task.platform, result });
      if (result.delivery.status === 'blocked') blocked.push({ platform: task.platform, reasons: result.delivery.reasons });
      send({ type: 'platform_result', platform: task.platform, result });
    } catch (error) {
      const failure = { platform: task.platform, message: safeError(error) };
      errors.push(failure); send({ type: 'platform_error', ...failure });
    }
  }
  return { schema_version: 'shadow.1', complete: errors.length === 0 && blocked.length === 0, analysis_id: handoff.analysis_id,
    customer_context: handoff.customer_context, results, errors, blocked, created_at: new Date().toISOString() };
}
