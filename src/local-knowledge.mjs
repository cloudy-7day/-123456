import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ROOT } from './config.mjs';
import { productFeatures } from './product-profile.mjs';
import { selectDiverseImages, imageDiversityMetadata } from './image-selection.mjs';
import { createKnowledgeSearch } from './retrieval/index.mjs';

const defaultDir = path.join(ROOT, 'knowledge');
const searches = new Map();
function knowledgeSearch(directory,cacheDir) {
  const key=path.resolve(directory)+'\n'+path.resolve(cacheDir);
  if(!searches.has(key))searches.set(key,createKnowledgeSearch({knowledgeDir:directory,cacheDir}));
  return searches.get(key);
}
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
    const metadata = asset.visual_review?.sha256===asset.sha256?asset.visual_review.label:`${asset.title || ''} ${asset.description || ''}`;
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
const provenance = data => ({mode:'local',archive_name:data.archive_name,archive_version:data.archive_version,archive_sha256:data.archive_sha256,supplements:data.supplements||[]});
export async function localCatalog(directory=defaultDir) {
  const data=await loadLocalKnowledge(directory);
  const client=new LocalKnowledge({knowledgeDir:directory});
  const products=await Promise.all(data.products.map(async product=>{
    const {id,name,model,category,system}=product;
    let features=[];
    try{
      const document=product.documents.find(d=>d.title==='产品事实.md');
      if(document){const bytes=await client.read(document,product);features=productFeatures(new TextDecoder('utf-8',{fatal:true}).decode(bytes),document.path);}
    }catch{/* Unverified facts cannot support a recommendation. */}
    const image=await selectPreview(product,client);
    return {id,name,model,category,system,features,preview:image?{url:`/api/product-image/${id}?v=${image.asset.sha256.slice(0,12)}`,title:image.asset.visual_review.label,path:image.asset.path,source_page:image.asset.source_page}:null};
  }));
  return {knowledge_base:data.knowledge_base,retrieval:provenance(data),products};
}
async function selectPreview(product,client){
  // The filename may describe a chip or a person as "product appearance".
  // Only a SHA-bound, visually checked product image can be a catalogue preview.
  const candidates=(product.images||[]).filter(asset=>asset.visual_review?.sha256===asset.sha256&&asset.visual_review.role==='product'&&asset.visual_review.allowed&&asset.visual_review.preview)
    .sort((a,b)=>Number(b.sha256===product.preview_sha256)-Number(a.sha256===product.preview_sha256)).map(asset=>({asset}));
  for(const {asset} of candidates){
    try{const bytes=await client.read(asset,product),extension=imageExtension(bytes);
      if(extension&&extension===asset.extension)return {asset,bytes,extension};
    }catch{/* A corrupt image must not break the catalog or other product images. */}
  }
  return null;
}
export async function productPreview(id,directory=defaultDir){
  if(!/^pc-[a-f0-9]{16}$/.test(id))return null;
  const data=await loadLocalKnowledge(directory),product=data.products.find(p=>p.id===id);
  return product?selectPreview(product,new LocalKnowledge({knowledgeDir:directory})):null;
}
export class LocalKnowledge {
  constructor({knowledgeDir=defaultDir,localOutputRoot=ROOT,searchMode=process.env.SEARCH_MODE||'lexical',searchCacheDir=process.env.SEARCH_CACHE_DIR||path.join(ROOT,'output/search-cache'),searchClient}={}) {
    this.directory=knowledgeDir;this.outputRoot=localOutputRoot;this.searchMode=searchMode;this.searchCacheDir=searchCacheDir;this.searchClient=searchClient;
  }
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
    let context_retrieval={mode:'not_requested',requested_mode:this.searchMode,results:[],stats:{returned:0},warnings:[]};
    const taskQuery=[input.scenario,input.audience,input.goal,input.platform].filter(Boolean).join(' ');
    if(taskQuery.trim()){
      try {
        const search=this.searchClient||knowledgeSearch(this.directory,this.searchCacheDir);
        const result=await search.search(taskQuery,{productId:product.id,types:['product_guidance','scenario','faq','style'],limit:4,mode:this.searchMode,platform:input.platform,diversifyTypes:true});
        context_retrieval={...context_retrieval,...result,requested_mode:this.searchMode};
        warnings.push(...context_retrieval.warnings);
        progress(`已检索本次场景辅助资料：${context_retrieval.results.length} 条（${context_retrieval.mode}）。`);
      } catch(error){
        const message=`辅助资料检索未完成，保留完整产品原文：${error.message}`;
        context_retrieval={...context_retrieval,mode:'unavailable',warnings:[message]};warnings.push(message);
      }
    }
    const eligible=product.images.filter(a=>!data.image_review_required||(a.visual_review?.sha256===a.sha256&&a.visual_review.allowed));
    const images=rankKnowledgeImages(eligible,input),acceptedImages=[],imageRejected=product.images.filter(a=>!eligible.includes(a)).map(a=>({title:a.title,reason:'visual-content-not-approved'}));
    for(const asset of images){
      if(sources.filter(s=>s.kind==='image').length>=6)break;
      const selection=selectDiverseImages([...acceptedImages,asset],{productPath:product.path,minimum:0,limit:6});
      if(!selection.images.includes(asset)){imageRejected.push({title:asset.title,reason:selection.rejected.find(x=>x.image===asset)?.reason||'duplicate'});continue;}
      try {
        const bytes=await this.read(asset,product),extension=imageExtension(bytes);
        if(!extension||extension!==asset.extension)throw Error('图片内容格式与索引不符');
        const name=randomUUID()+'.'+extension,localPath='output/media/'+name;
        await fs.mkdir(path.join(this.outputRoot,'output/media'),{recursive:true});
        await fs.writeFile(path.join(this.outputRoot,localPath),bytes);
        const label=asset.visual_review?.sha256===asset.sha256?asset.visual_review.label:null;
        sources.push({ref:`I${sources.filter(s=>s.kind==='image').length+1}`,kind:'image',title:label||asset.title,path:asset.path,local_path:localPath,sha256:asset.sha256,description:label||asset.description,width:asset.width,height:asset.height,index_path:asset.index_path,source_page:asset.source_page,source_url:asset.source_url,origin:asset.origin||'user-archive',visual_review:asset.visual_review,...imageDiversityMetadata(asset)});
        acceptedImages.push(asset);
      } catch(error){warnings.push(`图片「${asset.title}」已跳过：${error.message}`);}
    }
    if(!sources.some(s=>s.kind==='image'))warnings.push('本地库未取得可用图片，配图待补。');
    warnings.push(...selectDiverseImages(acceptedImages,{productPath:product.path,minimum:input.platform==='小红书'?3:1}).warnings);
    return {knowledgeBase:data.knowledge_base,kb_name:data.knowledge_base,sources,warnings,context_retrieval,retrieval:{...provenance(data),product_id:product.id,product_path:product.path,source_created_at:product.source_created_at,image_review:{method:'offline-fingerprint-and-index',rejected:imageRejected}}};
  }
}
