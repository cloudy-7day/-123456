import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function config() {
  if (process.env.SHADOW_ENV_FILE) process.loadEnvFile(process.env.SHADOW_ENV_FILE);
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (fs.existsSync(file)) process.loadEnvFile(file);
  }
  return {
    knowledgeSource: process.env.KNOWLEDGE_SOURCE || 'local',
    knowledgeDir: process.env.LOCAL_KNOWLEDGE_DIR ? path.resolve(process.env.LOCAL_KNOWLEDGE_DIR) : path.join(ROOT, 'knowledge'),
    kbName: process.env.IMA_KB_NAME || '任德耀新建华为PC知识库',
    evidenceCacheFile: process.env.IMA_EVIDENCE_CACHE_FILE ? path.resolve(process.env.IMA_EVIDENCE_CACHE_FILE) : undefined,
    skillPath: path.join(ROOT, 'vendor/ima-skills-1.1.10/ima-skill/ima_api.cjs'),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 8791),
  };
}

export function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/^\uFEFF/, ''));
}

export function safeError(error) {
  let message = String(error?.message || error);
  for (const name of ['IMA_OPENAPI_CLIENTID', 'IMA_OPENAPI_APIKEY', 'IMA_CLIENT_ID', 'IMA_API_KEY', 'DEEPSEEK_API_KEY']) {
    if (process.env[name]) message = message.split(process.env[name]).join('[redacted]');
  }
  return message.replace(/https?:\/\/\S+/g, '[服务地址]').slice(0, 800);
}
