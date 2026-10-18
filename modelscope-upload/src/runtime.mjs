import { config, safeError } from './config.mjs';
import { ImaClient } from './ima.mjs';
import { DeepSeekClient } from './deepseek.mjs';
import { runPipeline } from './pipeline.mjs';
import { readEvidenceSnapshot, retrieveEvidence } from './evidence-cache.mjs';

export async function execute(input, progress, settings = config()) {
  const ima = new ImaClient(settings);
  const ds = new DeepSeekClient(settings);
  const result = await runPipeline(input, {
    retrieve: (task, onProgress) => retrieveEvidence(ima, task, settings, onProgress),
    generate: args => ds.generate(args), progress,
  });
  result.meta.model = settings.model;
  return result;
}

export async function doctor(settings = config()) {
  const services = [
    ['ima', () => settings.evidenceCacheFile
      ? readEvidenceSnapshot(settings.evidenceCacheFile,settings.kbName).then(x=>({mode:'cached',knowledge_base:x.meta.knowledge_base,source_created_at:x.meta.retrieval.source_created_at}))
      : new ImaClient(settings).resolveBase().then(x => ({ mode:'live', knowledge_base: x.name }))],
    ['deepseek', () => new DeepSeekClient(settings).doctor()],
  ];
  const results = await Promise.all(services.map(async ([name, check]) => {
    try { return [name, { ...await check(), ok: true }]; }
    catch (error) { return [name, { ok: false, error: safeError(error) }]; }
  }));
  return Object.fromEntries(results);
}
