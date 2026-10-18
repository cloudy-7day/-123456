import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ROOT } from './config.mjs';

const defaultDir = path.join(ROOT, 'knowledge');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = value => String(value).normalize('NFKC').toLowerCase().replace(/^(huawei|华为)\s*/,'').replace(/\s+/g,'');
// Rank only the already resolved product's images, using index descriptions, not pixels.
const imageTopics = [
  [/背电脑|携带|通勤|轻便|轻薄|图书馆|出差/, /轻薄|机身|便携|重量/],
  [/代码|编程|写作|打字|键盘/, /键盘|触控板/],
  [/阅读|文档|屏幕|看书|护眼/, /屏幕|显示|护眼|OLED/i],
  [/笔记|手写|画画|绘图/, /手写|触控|画笔/],
  [/协作|传文件|手机|多屏/, /协同|互联|多屏|分享/],
  [/接口|外接|投影/, /接口|扩展|连接/],
];
export function rankKnowledgeImages(images, input) {
  const query = [input.scenario, input.audience, input.goal].filter(Boolean).join(' ');
  const seen = new Set();
  return images.map((asset, order) => {
    const metadata = `${asset.title || ''} ${asset.description || ''}`;
    return { asset, order, blurred: Number(/blur|模糊/i.test(`${metadata} ${asset.source_url || ''}`)),
      score: imageTopics.filter(([task, image]) => task.test(query) && image.test(metadata)).length };
  }).sort((a,b) => a.blurred-b.blurred || b.score-a.score || a.order-b.order)
    .filter(({asset}) => {
      const identity = asset.sha256 || asset.file || asset.path;
      if (!identity) return true;
      if (seen.has(identity)) return false;
      seen.add(identity); return true;
    }).map(({asset}) => asset);
}
export function assetPath(directory, file) {
  if (!/^assets\/[a-f0-9]{64}\.(md|csv|txt|json|png|jpg|webp)$/.test(file || '')) throw Error('本地知识库资产路径无效。');
  return path.join(directory, ...file.split('/'));
}
export function imageExtension(bytes) {
  if(bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16)==='IHDR')return 'png';
  if(bytes.length>=4 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'jpg';
  if(bytes.length>=16 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return 'webp';
  return null;
}
export async function loadLocalKnowledge(directory=defaultDir) {
  const data=JSON.parse(await fs.readFile(path.join(directory,'catalog.json'),'utf8'));
  if(data.schema_version!==1 || !data.knowledge_base || !Array.isArray(data.products) || !data.products.length)throw Error('本地知识库目录格式无效，请重新导入。');
  if(new Set(data.products.map(p=>p.id)).size!==data.products.length)throw Error('本地知识库型号编号重复。');
  return data;
}
const provenance = data => ({mode:'local',archive_name:data.archive_name,archive_version:data.archive_version,archive_sha256:data.archive_sha256});
export async function localCatalog(directory=defaultDir) {
  const data=await loadLocalKnowledge(directory);
  return {knowledge_base:data.knowledge_base,retrieval:provenance(data),products:data.products.map(({id,name,model,category,system})=>({id,name,model,category,system}))};
}
export class LocalKnowledge {
  constructor({knowledgeDir=defaultDir,localOutputRoot=ROOT}={}) {this.directory=knowledgeDir;this.outputRoot=localOutputRoot;}
  async read(asset,product) {
    if(!asset.path?.startsWith(product.path+'/'))throw Error('本地知识库来源不属于所选完整型号。');
    const bytes=await fs.readFile(assetPath(this.directory,asset.file));
    if(hash(bytes)!==asset.sha256)throw Error('本地知识库资产校验失败，请重新导入。');
    return bytes;
  }
  async retrieve(input,progress=()=>{}) {
    const data=await loadLocalKnowledge(this.directory);
    const query=normalized(input.product);
    // Never strip system qualifiers or use substring matching: similar models differ in facts.
    let candidates=data.products.filter(p=>p.id===input.product||normalized(p.name)===query);
    if(!candidates.length){
      // Bare exact model names are accepted only when no other model extends that name.
      const exact=data.products.filter(p=>normalized(p.model)===query);
      const related=data.products.filter(p=>normalized(p.model).startsWith(query));
      if(exact.length===1&&related.length===1)candidates=exact;
    }
    if(candidates.length!==1)throw Error('无法唯一定位完整型号或系统；请从产品目录选择带系统版本的完整型号。');
    const product=candidates[0],sources=[],warnings=[];
    progress(`已读取本地知识库「${data.knowledge_base}」：${product.name}`);
    for(const document of product.documents){
      const bytes=await this.read(document,product);
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
      // Keep complete qualifiers; local source files are bounded by the importer.
      sources.push({ref:`S${sources.length+1}`,kind:'text',title:document.title,path:document.path,text,truncated:false,sha256:document.sha256});
    }
    const images=rankKnowledgeImages(product.images,input);
    for(const asset of images){
      if(sources.filter(s=>s.kind==='image').length>=6)break;
      try {
        const bytes=await this.read(asset,product),extension=imageExtension(bytes);
        if(!extension||extension!==asset.extension)throw Error('图片内容格式与索引不符');
        const name=randomUUID()+'.'+extension,localPath='output/media/'+name;
        await fs.mkdir(path.join(this.outputRoot,'output/media'),{recursive:true});
        await fs.writeFile(path.join(this.outputRoot,localPath),bytes);
        sources.push({ref:`I${sources.filter(s=>s.kind==='image').length+1}`,kind:'image',title:asset.title,path:asset.path,local_path:localPath,sha256:asset.sha256,description:asset.description,width:asset.width,height:asset.height,index_path:asset.index_path});
      } catch(error){warnings.push(`图片「${asset.title}」已跳过：${error.message}`);}
    }
    if(!sources.some(s=>s.kind==='image'))warnings.push('本地库未取得可用图片，配图待补。');
    return {knowledgeBase:data.knowledge_base,kb_name:data.knowledge_base,sources,warnings,retrieval:{...provenance(data),product_id:product.id,product_path:product.path,source_created_at:product.source_created_at}};
  }
}
