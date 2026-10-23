import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const SOURCE_TYPES = ['product_fact', 'product_guidance', 'scenario', 'faq', 'style'];
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const groups = new Map([
  ['P1-产品参数库', 'product_guidance'], ['P2-卖点话术库', 'product_guidance'],
  ['P7-常见问题库', 'faq'], ['P8-客户场景库', 'scenario'], ['P6-营销素材库', 'style'],
]);
const boundaryHeading = /限制|边界|条件|注意|不适用|不得|须知|事实.*来源|使用说明|案例性质|待.*核验|适用范围|合规/;

// A section is the retrieval unit. Its qualifier sections travel with every hit.
// Long sections split only at paragraph boundaries; individual paragraphs stay intact.
export function sectionsOf(markdown) {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const sections = []; let heading = '正文', body = [], trail = [];
  const flush = () => { if (body.join('\n').trim()) sections.push({section: heading, text: body.join('\n').trim()}); body = []; };
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) { flush(); trail = trail.slice(0, match[1].length - 1); trail[match[1].length - 1] = match[2].trim(); heading = trail.filter(Boolean).join(' / '); }
    else body.push(line);
  }
  flush();
  return sections;
}
function paragraphChunks(text, target = 1000) {
  const result = []; let current = '';
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (current && current.length + paragraph.length > target) { result.push(current); current = ''; }
    current += (current ? '\n\n' : '') + paragraph;
  }
  if (current) result.push(current);
  return result;
}
function owningProducts(asset, products) {
  const direct = products.filter(p => asset.path.startsWith(p.path + '/'));
  if (direct.length) return direct;
  const segments = asset.path.split('/').map(normalize);
  return products.filter(p => segments.includes(normalize(p.model)) || segments.includes(normalize(p.name)));
}
function mentionedProducts(text, products, owners) {
  let remaining = normalize(text); const found = [];
  // Longest model first prevents Pro S from being mislabeled as Pro.
  for (const product of [...products].sort((a,b) => b.model.length - a.model.length)) {
    const name = normalize(product.model);
    if (name && remaining.includes(name)) {
      const identities=products.filter(p=>normalize(p.model)===name);
      // A bare model label shared by Windows and HarmonyOS is ambiguous. Only
      // the source's explicit single-product directory can resolve that label.
      const scoped=owners.length===1&&identities.some(p=>p.id===owners[0].id)?owners:identities;
      found.push(...scoped.map(p=>p.id));remaining=remaining.split(name).join(' ');
    }
  }
  return found;
}
export async function loadSearchCorpus(knowledgeDir) {
  const catalogBytes = await fs.readFile(path.join(knowledgeDir, 'catalog.json'));
  const catalog = JSON.parse(catalogBytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (catalog.schema_version !== 1 || !Array.isArray(catalog.products) || !Array.isArray(catalog.files)) throw Error('检索目录格式无效。');
  const chunks = [], sourceCounts = {}, seen = new Set(); let documentCount = 0;
  for (const asset of catalog.files) {
    const parts = String(asset.path || '').split('/');
    const group = parts.find(x => groups.has(x));
    if (!group || !/\.md$/i.test(asset.path)) continue;
    if (!asset.path.startsWith(catalog.knowledge_base + '/') || parts.includes('..') || !/^assets\/[a-f0-9]{64}\.md$/.test(asset.file || '') || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) throw Error('检索资料的目录归属或路径无效。');
    if (seen.has(asset.path)) throw Error('检索资料存在重复来源路径。');
    seen.add(asset.path);
    const bytes = await fs.readFile(path.join(knowledgeDir, asset.file));
    if (sha256(bytes) !== asset.sha256) throw Error('检索资料完整性校验失败，请重新导入资料包。');
    const markdown = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    const owners = owningProducts(asset, catalog.products), sections = sectionsOf(markdown);
    const isFact = group === 'P1-产品参数库' && owners.length === 1 && ['产品事实.md', '卖点与限制.md'].includes(asset.title);
    const type = isFact ? 'product_fact' : groups.get(group);
    const allBoundaries = sections.filter(s => boundaryHeading.test(s.section));
    const fictional = type === 'scenario' || /虚构(?:参考|情景|案例)|不对应任何真实客户|教学填充示例/.test(markdown);
    documentCount++; sourceCounts[type] = (sourceCounts[type] || 0) + 1;
    for (const [sectionIndex, section] of sections.entries()) {
      for (const [partIndex, body] of paragraphChunks(section.text).entries()) {
        const qualifiers = allBoundaries.filter(s => s !== section);
        const qualifiedText = [body, ...qualifiers.map(q => `【原文限定：${q.section}】\n${q.text}`)].join('\n\n');
        const scopedIds = owners.map(p => p.id);
        const title = asset.title.replace(/\.md$/i, '');
        chunks.push({
          id: sha256(`${asset.path}\n${asset.sha256}\n${sectionIndex}\n${partIndex}`),
          source_path: asset.path, source_sha256: asset.sha256, source_type: type,
          title, section: section.section, text: qualifiedText, content: body,
          qualifiers: qualifiers.map(q => ({section:q.section, text:q.text})),
          product_id: owners.length === 1 ? owners[0].id : null,
          product_ids: scopedIds, model: owners.length === 1 ? owners[0].model : null,
          system: owners.length === 1 ? owners[0].system : (/鸿蒙/.test(asset.path) && !/Windows/i.test(asset.path) ? 'HarmonyOS' : /Windows/i.test(asset.path) && !/鸿蒙/.test(asset.path) ? 'Windows' : null),
          mentioned_product_ids: mentionedProducts(qualifiedText, catalog.products, owners),
          source_created_at: owners.length === 1 ? owners[0].source_created_at || null : null,
          knowledge_base: catalog.knowledge_base, directory: group,
          archive_version: catalog.archive_version || null,
          fictional, supports_product_fact: isFact && !fictional,
          usage: isFact && !fictional ? '所选型号的事实与限制；保留配置及条件。' : '仅辅助追问、场景或表达；不得作为产品能力、真实客户体验或成交证明。',
          // Embedding input excludes repeated boilerplate, while returned evidence keeps it intact.
          embedding_text: `${title}\n${section.section}\n${body}`,
        });
      }
    }
  }
  return {catalog, chunks, fingerprint: sha256(catalogBytes), documentCount, sourceCounts};
}
