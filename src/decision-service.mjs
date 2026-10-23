import { explainDecision } from '../modules/scenario/shared/decision-support.mjs';
import { createKnowledgeSearch } from './retrieval/index.mjs';

const searchInstances = new Map();
function searchFor(settings) {
  const key = JSON.stringify([settings.knowledgeDir, settings.searchCacheDir]);
  if (!searchInstances.has(key)) {
    if (searchInstances.size >= 4) searchInstances.delete(searchInstances.keys().next().value);
    searchInstances.set(key, createKnowledgeSearch({ knowledgeDir: settings.knowledgeDir, cacheDir: settings.searchCacheDir }));
  }
  return searchInstances.get(key);
}

// Guidance is useful for asking questions, never evidence of a product capability.
export async function prepareDecision(analysis, catalog, settings, { manualProduct = '' } = {}) {
  const decision = explainDecision(analysis, catalog, { manualProduct });
  const query = analysis.understanding.observations
    .filter(item => item.kind === 'fact' && ['task', 'pain', 'devices', 'software', 'collaboration', 'mobility'].includes(item.category))
    .map(item => item.value).join(' ').slice(0, 1200);
  if (!query) return { ...decision, guidance: [], retrieval: { mode: 'not_needed' } };
  try {
    const search = searchFor(settings);
    const found = await search.search(query, { types: ['scenario', 'faq'], limit: 3, mode: settings.searchMode || 'lexical' });
    return { ...decision, guidance: found.results.map(item => ({
      title: item.section, path: item.source_path, text: item.text, type: item.source_type,
    })), retrieval: { mode: found.mode, warnings: found.warnings, stats: found.stats } };
  } catch {
    return { ...decision, guidance: [], retrieval: { mode: 'unavailable', warnings: ['场景资料检索暂不可用，候选仍依据已校验的产品资料。'] } };
  }
}
