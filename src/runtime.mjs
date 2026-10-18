import { config, safeError } from './config.mjs';
import { ImaClient } from './ima.mjs';
import { DeepSeekClient } from './deepseek.mjs';
import { runPipeline } from './pipeline.mjs';

export async function execute(input, progress, settings = config()) {
  const ima = new ImaClient(settings);
  const ds = new DeepSeekClient(settings);
  const result = await runPipeline(input, {
    retrieve: (task, onProgress) => ima.retrieve(task, onProgress),
    generate: args => ds.generate(args), progress,
  });
  result.meta.model = settings.model;
  return result;
}

export async function doctor(settings = config()) {
  const services = [
    ['ima', () => new ImaClient(settings).resolveBase().then(x => ({ knowledge_base: x.name }))],
    ['deepseek', () => new DeepSeekClient(settings).doctor()],
  ];
  const results = await Promise.all(services.map(async ([name, check]) => {
    try { return [name, { ...await check(), ok: true }]; }
    catch (error) { return [name, { ok: false, error: safeError(error) }]; }
  }));
  return Object.fromEntries(results);
}
