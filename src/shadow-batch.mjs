import { runPipeline } from './pipeline.mjs';
import { ImaClient } from './ima.mjs';
import { DeepSeekClient } from './deepseek.mjs';
import { safeError } from './config.mjs';

export async function runShadowBatch(handoff, settings, send, dependencies = {}) {
  const ima = dependencies.ima || new ImaClient(settings);
  const ds = dependencies.ds || new DeepSeekClient(settings);
  send({ type: 'progress', message: '正在取得本轮产品原文；所有平台共用同一批来源。' });
  const evidence = await ima.retrieve(handoff.tasks[0], message => send({ type: 'progress', message }));
  const results = [], errors = [];
  for (const task of handoff.tasks) {
    try {
      const result = await runPipeline(task, {
        retrieve: async () => evidence,
        generate: args => ds.generate({ ...args, customerContext: handoff.customer_context }),
        progress: message => send({ type: 'progress', platform: task.platform, message }),
      });
      result.meta.model = settings.model;
      result.meta.scenario_analysis_id = handoff.analysis_id;
      results.push({ platform: task.platform, result });
      send({ type: 'platform_result', platform: task.platform, result });
    } catch (error) {
      const failure = { platform: task.platform, message: safeError(error) };
      errors.push(failure); send({ type: 'platform_error', ...failure });
    }
  }
  return { schema_version: 'shadow.1', complete: errors.length === 0, analysis_id: handoff.analysis_id,
    customer_context: handoff.customer_context, results, errors, created_at: new Date().toISOString() };
}
