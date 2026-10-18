import {readFile,realpath} from 'node:fs/promises';
import {resolve,dirname,extname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assessProduct} from './product.mjs';
import {assertLocalImagePath,IMAGE_POLICY} from '../shared/image-policy.mjs';
import {ServiceError} from './understand.mjs';
const indexPath=process.env.IMA_LOCAL_INDEX||resolve(dirname(fileURLToPath(import.meta.url)),'../.local/knowledge-base-index.json');
import {extractRequirements,evaluateProducts,validateFilterInput,filterInputFromSources,normalizeSystem} from '../shared/hard-requirements.mjs';
import {productIdentity,resolveProduct,retrieveImages} from './retrieval.mjs';
let index;try{index=JSON.parse(await readFile(indexPath,'utf8'));}catch{}
if(index)index.products=await Promise.all(index.products.map(async p=>productIdentity(p,await readFile(p.sources.find(s=>s.title==='产品事实.md').file,'utf8'))));
const catalog=await Promise.all((index?.products||[]).map(async product=>{
 const spec=await readFile(product.sources.find(s=>s.title==='产品事实.md').file,'utf8');
 const section=spec.match(/## 操作系统\s+([\s\S]*?)(?=\n## |$)/)?.[1]||'';
 const systems=[...new Set(section.split('\n').map(normalizeSystem).filter(Boolean))];
 let priceText='',pricePath='';
 for(const name of [product.canonicalName,product.canonicalName+'（鸿蒙版）']){try{pricePath='P1-产品参数库/08-官方公开价格快照/01-消费级PC/'+name+'-价格卡.md';priceText=await readFile(resolve(index.root,pricePath),'utf8');break;}catch{}}
 const priceStatus=priceText.match(/^price_status:\s*(.+)$/m)?.[1]||'知识库未提供可用价格资料';
 const priceDate=priceText.match(/^snapshot_date:\s*(.+)$/m)?.[1]||'';
 return {name:product.canonicalName,aliases:product.aliases,systems,systemSource:product.relativePath+'/产品事实.md',priceStatus:priceDate?priceDate+' 快照：'+priceStatus:priceStatus,priceSource:priceText?pricePath:null};
}));
export function filterProducts(raw){const input=validateFilterInput(raw),parsed=extractRequirements(input.text,input.override);const products=evaluateProducts(catalog,parsed.requirements);return {...parsed,products,counts:{eligible:products.filter(p=>p.status==='eligible').length,pending:products.filter(p=>p.status==='pending').length,excluded:products.filter(p=>p.status==='excluded').length},scope:'仅筛选明确硬要求；通过筛选不等于完整适配认证，价格快照不等于有效报价。'};}
export function enforceProductFilter(analysis){const result=filterProducts(filterInputFromSources(analysis.input.sources));const product=resolveProduct(index?.products||[],analysis.understanding.product.name);const selected=result.products.find(p=>p.name===product?.canonicalName);if(!selected||selected.status!=='eligible')throw new ServiceError('HARD_REQUIREMENTS_UNMET',selected?.status==='excluded'?'当前型号不满足硬性要求，请从筛选后的可选型号中选择。':'没有已确认满足硬性要求的型号。请先核实价格、软件或其他必需条件，客户洞察已保留。',400);return selected;}
const images=new Map((index?.products||[]).flatMap(p=>p.images.map(i=>[i.id,i])));const cache=new Map();
export function assertRegisteredImage(image,productName){
 assertLocalImagePath(image.assetPath);
 const registered=images.get(image.id),product=index&&resolveProduct(index.products,productName);
 if(!registered||image.assetPath!=='/assets/ima/'+image.id||!product?.images.some(i=>i.id===image.id)||registered.product!==product.canonicalName||registered.sourceUrl!==product.sourceUrl||image.sourceProduct!==registered.product||image.sourceUrl!==registered.sourceUrl)throw new ServiceError('IMA_IMAGE_ONLY','图片必须来自当前型号的 ima 本地知识库索引。',400);
 return registered;
}
export function localStatus(){return index?{provider:'ima_local_export',imagePolicy:IMAGE_POLICY,status:'ready',required:true,knowledgeBase:index.knowledgeBase,archiveName:index.archiveName,archiveSha256:index.archiveSha256,importedAt:index.importedAt,products:index.products.map(p=>p.canonicalName),productCount:index.products.length,imageCount:images.size}:{provider:'ima',status:'pending',required:true};}
export async function localImage(id){const image=images.get(id);if(!image)throw new ServiceError('IMAGE_NOT_FOUND','图片不存在。',404);const [root,file]=await Promise.all([realpath(index.root),realpath(image.file)]);const rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel))throw new ServiceError('IMA_IMAGE_ONLY','图片不在 ima 本地知识库目录内。',403);const data=await readFile(file);if(createHash('sha256').update(data).digest('hex')!==image.sha256)throw new ServiceError('IMAGE_CHANGED','图片已变更，请重新导入知识库。',409);return {data,type:{'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[extname(image.file).toLowerCase()]};}
export async function loadLocalBundle(analysis,config,{signal}={}){if(!index)throw new ServiceError('IMA_PENDING','请先导入 ima 知识库本地副本。',503);const key=analysis.analysisId;if(cache.has(key))return cache.get(key);const name=analysis.understanding.product.name;const product=resolveProduct(index.products,name);if(!product)throw new ServiceError('PRODUCT_NOT_FOUND','本地知识库未找到准确型号，请从产品列表选择；不会自动替换相近型号。',400);
 const sources=[];for(const [i,s] of product.sources.entries()){const excerpt=await readFile(s.file,'utf8');sources.push({id:`local-${key}-${i}`,title:product.name+' / '+s.title,excerpt:excerpt.slice(0,24000),readLevel:excerpt.length>24000?'partial_text':'full_text',relativePath:product.relativePath+'/'+s.title,retrievedAt:new Date().toISOString()});}
 const assessment=await assessProduct(analysis,sources,config,{signal});
 const imgSource={id:`local-${key}-images`,title:product.name+' / 图片索引.csv',excerpt:product.images.map(i=>`${i.name} | ${i.product} | ${i.sourceUrl} | ${i.caption}`).join('\n'),relativePath:product.relativePath+'/图片索引.csv',retrievedAt:new Date().toISOString()};if(product.images.length)sources.push(imgSource);
 const {selected:chosen,trace}=retrieveImages(product);
 for(const image of chosen)await localImage(image.id);
 const bundle={provider:'ima_local_export',status:'ready',knowledgeBase:{id:'local-'+index.archiveSha256.slice(0,16),name:index.knowledgeBase},product:name,retrieval:trace,sources,facts:assessment.facts,images:chosen.map(i=>({id:i.id,sourceId:imgSource.id,product:name,assetPath:'/assets/ima/'+i.id,caption:i.caption,sourceUrl:i.sourceUrl,fileName:i.name,sourceProduct:i.product,width:i.width,height:i.height})),snapshot:{archiveName:index.archiveName,archiveSha256:index.archiveSha256,importedAt:index.importedAt},assessment};
 while(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(key,bundle);return bundle;
}
