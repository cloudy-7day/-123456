import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, safeError } from './config.mjs';
const exec = promisify(execFile);

export function unwrap(response) {
  if (response.code !== 0) throw Error(`ima ${response.code}: ${response.msg || '接口调用失败'}`);
  return response.data || {};
}
export function normalizeBase(x) { return { id: x.kb_id || x.id, name: x.kb_name || x.name }; }
const title = x => x.title || x.name || '';
const folder = x => x.media_type === 99 || x.media_type === 0 || (!x.media_type && !/\.[a-z0-9]{2,5}$/i.test(title(x)));
const key = s => s.toLowerCase().replace(/huawei|华为|（鸿蒙版）|\(鸿蒙版\)/g, '').replace(/[\s_（）()\-]/g, '');

export function skillCaller(skillPath) {
  return async (endpoint, body) => {
    await fs.mkdir(path.join(ROOT, 'tmp'), { recursive: true });
    let stdout;
    try {
      ({ stdout } = await exec(process.execPath, [skillPath, `openapi/wiki/v1/${endpoint}`, JSON.stringify(body), JSON.stringify({ baseUrl: 'https://ima.qq.com', lastCheckFile: path.join(ROOT, 'tmp/ima-last-check') })], { cwd: ROOT, env: process.env, timeout: 45000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }));
    } catch (error) {
      let detail;
      try { detail = JSON.parse(error.stderr); } catch {}
      throw Error(detail?.msg ? `ima ${detail.code}: ${detail.msg}` : 'ima请求失败或超时，请检查网络与本地凭证。');
    }
    let response;
    try { response = JSON.parse(stdout); } catch { throw Error('ima返回的内容不是有效JSON。'); }
    return unwrap(response);
  };
}

async function download(info, limit) {
  const target = new URL(info.url);
  // The prototype accepts official IMA storage only, never forwards IMA credentials.
  if (target.protocol !== 'https:' || !(target.hostname === 'ima.qq.com' || target.hostname.endsWith('.ima.qq.com') || target.hostname.endsWith('.myqcloud.com'))) throw Error('原文链接不是支持的ima存储地址，请使用ima客户端查看原文。');
  const headers = Object.fromEntries(Object.entries(info.headers || {}).filter(([k]) => !/^ima-openapi-|^cookie$|^host$/i.test(k)));
  const res = await fetch(target, { headers, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!res.ok) throw Error(`原文读取失败 HTTP ${res.status}，请使用ima客户端查看原文。`);
  if (Number(res.headers.get('content-length')) > limit) throw Error('原文文件超过本版本大小限制。');
  const chunks = []; let length = 0;
  for await (const chunk of res.body) {
    length += chunk.length;
    if (length > limit) throw Error('原文文件超过本版本大小限制。');
    chunks.push(chunk);
  }
  return { bytes: Buffer.concat(chunks), mime: (res.headers.get('content-type') || '').split(';')[0] };
}

export class ImaClient {
  constructor({ kbName, skillPath, call, fetchText, saveImage }) {
    this.kbName = kbName;
    this.call = call || skillCaller(skillPath);
    this.fetchText = fetchText || (async info => {
      const { bytes, mime } = await download(info, 2 * 1024 * 1024);
      if (!/text|markdown|csv|octet-stream/.test(mime)) throw Error('本版本仅支持文本原文，请使用ima客户端查看该文件。');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/\x00/.test(text)) throw Error('原文不是可读文本。');
      return text;
    });
    this.saveImage = saveImage || (async info => {
      const { bytes, mime } = await download(info, 8 * 1024 * 1024);
      const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
      if (!extensions[mime]) throw Error('图片格式不支持，已跳过。');
      const filename = `${randomUUID()}.${extensions[mime]}`;
      await fs.mkdir(path.join(ROOT, 'output/media'), { recursive: true });
      await fs.writeFile(path.join(ROOT, 'output/media', filename), bytes);
      return `output/media/${filename}`;
    });
  }
  async pages(endpoint, body, listKey) {
    let cursor = ''; const items = []; let currentPath = [];
    const seen = new Set();
    for (let page = 0; page < 30; page++) {
      const data = await this.call(endpoint, { ...body, cursor });
      items.push(...(data[listKey] || []));
      currentPath = data.current_path || currentPath;
      if (data.is_end !== false && !data.next_cursor) return { items, currentPath };
      if (data.is_end === true) return { items, currentPath };
      if (!data.next_cursor || seen.has(data.next_cursor)) throw Error('ima分页游标异常，停止检索。');
      seen.add(data.next_cursor); cursor = data.next_cursor;
    }
    throw Error('ima目录分页超过本版本上限。');
  }
  async resolveBase() {
    const { items } = await this.pages('search_knowledge_base', { query: this.kbName, limit: 20 }, 'info_list');
    const matches = items.map(normalizeBase).filter(x => x.name === this.kbName && x.id);
    if (matches.length !== 1) throw Error(`无法唯一定位指定库「${this.kbName}」，请确认账号已加入该库。`);
    return matches[0];
  }
  async list(kb, folderId) {
    return this.pages('get_knowledge_list', { knowledge_base_id: kb.id, limit: 50, ...(folderId ? { folder_id: folderId } : {}) }, 'knowledge_list');
  }
  async productFolder(kb, product, progress) {
    const query = product.replace(/（鸿蒙版）|\(鸿蒙版\)/g, '').trim();
    const { items } = await this.pages('search_knowledge', { knowledge_base_id: kb.id, query }, 'info_list');
    const candidates = items.filter(x => folder(x) && key(title(x)) === key(product));
    const good = [];
    const inspect = async (entry, fallbackPath = '') => {
      const listed = await this.list(kb, entry.media_id || entry.folder_id);
      const pathname = listed.currentPath.map(x => x.name).join('/') || `${fallbackPath}/${title(entry)}`;
      const systemFits = !(/鸿蒙|HarmonyOS/i.test(product) && /Windows/i.test(pathname));
      if (systemFits && /P1/.test(pathname) && listed.items.some(x => /^(产品事实|article)\.md$/i.test(title(x)))) good.push({ ...listed, pathname });
      return listed;
    };
    for (const entry of candidates.slice(0, 12)) await inspect(entry);
    if (!good.length) {
      progress('搜索未定位到产品事实，正在按目录查找');
      const queue = [{ id: undefined, path: '' }]; const visited = new Set();
      let count = 0;
      while (queue.length && count++ < 40) {
        const current = queue.shift();
        const listed = await this.list(kb, current.id);
        for (const item of listed.items.filter(folder)) {
          const id = item.media_id || item.folder_id; const name = title(item);
          if (visited.has(id)) continue;
          visited.add(id);
          if (key(name) === key(product)) { await inspect(item, current.path); continue; }
          const isNavigation = name === kb.name || /华为PC.*知识库|^P1-|^0[12]-(鸿蒙|MateBook|Windows)/i.test(name);
          const wrongSystem = /鸿蒙|HarmonyOS/i.test(product) && /Windows/i.test(name);
          if (isNavigation && !wrongSystem) queue.push({ id, path: `${current.path}/${name}` });
        }
      }
      if (queue.length) throw Error('产品目录扫描超过本版本上限，无法确认型号唯一性。');
    }
    if (good.length !== 1) throw Error(good.length ? '产品型号存在多个事实目录，请补充系统或完整版本。' : '没有定位到该型号的产品事实目录，请使用知识库中的完整型号名称。');
    return good[0];
  }
  async retrieve(input, progress = () => {}) {
    const kb = await this.resolveBase();
    progress(`已连接「${kb.name}」，正在定位产品`);
    const selected = await this.productFolder(kb, input.product, progress);
    const documents = selected.items.filter(x => /^(产品事实|卖点与限制|article)\.md$|^图片索引\.csv$/i.test(title(x))).slice(0, 4);
    const sources = [], warnings = [];
    for (const item of documents) {
      const media = await this.call('get_media_info', { media_id: item.media_id });
      if (!media.url_info?.url) throw Error(`「${title(item)}」原文不可访问，请使用ima客户端查看原文。`);
      const text = await this.fetchText(media.url_info);
      sources.push({ ref: `S${sources.length + 1}`, kind: 'text', title: title(item), path: `${selected.pathname}/${title(item)}`, text: text.slice(0, 16000), truncated: text.length > 16000 });
    }
    const imageFolder = selected.items.find(x => folder(x) && title(x) === 'images');
    if (imageFolder) {
      const { items } = await this.list(kb, imageFolder.media_id);
      for (const item of items.filter(x => x.media_type === 9 || /\.(png|jpg|jpeg|webp)$/i.test(title(x))).slice(0, 3)) {
        try {
          const media = await this.call('get_media_info', { media_id: item.media_id });
          if (!media.url_info?.url) { warnings.push(`图片「${title(item)}」不可读取`); continue; }
          const localPath = await this.saveImage(media.url_info);
          sources.push({ ref: `I${sources.filter(x => x.kind === 'image').length + 1}`, kind: 'image', title: title(item), path: `${selected.pathname}/images/${title(item)}`, local_path: localPath });
        } catch (error) { warnings.push(`图片「${title(item)}」已跳过：${safeError(error)}`); }
      }
    }
    if (!sources.some(x => x.kind === 'image')) warnings.push('未取得可用图片，配图待补。');
    return { knowledgeBase: kb.name, sources, warnings };
  }
}
