import path from 'node:path';
export const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const EMBEDDING_REVISION = '2c4055b12046f11709e9df2c122e59ffbdc2f900';
export const EMBEDDING_VERSION = `${EMBEDDING_MODEL}:${EMBEDDING_REVISION}:q8:mean:normalized:v1`;
let pipelines = new Map();
export function createLocalEmbedder({cacheDir}) {
  return {
    id: EMBEDDING_VERSION,
    async embed(texts) {
      if (!Array.isArray(texts) || !texts.length) return [];
      const modelCache = path.join(cacheDir, 'models');
      let pending = pipelines.get(modelCache);
      if (!pending) {
        pending = (async () => {
          const {pipeline} = await import('@huggingface/transformers');
          return pipeline('feature-extraction', EMBEDDING_MODEL, {dtype:'q8', revision:EMBEDDING_REVISION, cache_dir:modelCache, local_files_only:true});
        })();
        pipelines.set(modelCache,pending);
        pending.catch(()=>pipelines.delete(modelCache));
      }
      const extractor = await pending;
      const output = await extractor(texts, {pooling:'mean', normalize:true, truncation:true, max_length:256});
      return output.tolist();
    },
  };
}
