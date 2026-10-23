import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createKnowledgeSearch} from '../src/retrieval/index.mjs';
import {sectionsOf} from '../src/retrieval/corpus.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const round=value=>value===null?null:Math.round(value*10000)/10000;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]:null;
export function matchesGold(hit,target){
 return hit.source_path===target.source_path && hit.source_sha256===target.source_sha256 &&
  (!target.title||hit.title===target.title) && target.section_any.some(part=>hit.section.includes(part)) && hit.text.includes(target.evidence_quote);
}
export async function validateEvaluation(dataset,knowledgeDir){
 if(dataset.schema_version!==1||!Array.isArray(dataset.cases)||dataset.cases.length!==20)throw Error('评测集必须为 schema_version 1 且包含 20 条样例。');
 const catalog=JSON.parse(await fs.readFile(path.join(knowledgeDir,'catalog.json'),'utf8'));
 const files=new Map(catalog.files.map(x=>[x.path,x])),ids=new Set();let checked=0;
 for(const item of dataset.cases){
  if(ids.has(item.id)||!item.id||!item.query||!Array.isArray(item.expected)||item.expect_empty!==!item.expected.length)throw Error(`评测样例结构错误：${item.id}`);ids.add(item.id);
  if(item.product_id&&!catalog.products.some(p=>p.id===item.product_id))throw Error(`评测型号不存在：${item.id}`);
  for(const target of item.expected){
   const asset=files.get(target.source_path);if(!asset||asset.sha256!==target.source_sha256)throw Error(`标注来源缺失或版本变化：${item.id}`);
   if(!/^assets\/[a-f0-9]{64}\.md$/.test(asset.file))throw Error(`标注资料路径无效：${item.id}`);
   const bytes=await fs.readFile(path.join(knowledgeDir,asset.file));if(digest(bytes)!==target.source_sha256)throw Error(`标注资料校验失败：${item.id}`);
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   if(!text.includes(target.evidence_quote))throw Error(`标注逐字证据不存在：${item.id}`);
   if(!Array.isArray(target.section_any)||!sectionsOf(text).some(s=>target.section_any.some(part=>s.section.includes(part))&&s.text.includes(target.evidence_quote)))throw Error(`标注段落与证据不匹配：${item.id}`);
   checked++;
  }
 }
 return {catalog,checked_targets:checked,positive_cases:dataset.cases.filter(c=>!c.expect_empty).length,negative_cases:dataset.cases.filter(c=>c.expect_empty).length};
}
function wrongModel(hit,item,catalog){
 if(!item.product_id)return false;
 const selected=catalog.products.find(p=>p.id===item.product_id);
 return Boolean((hit.product_id&&hit.product_id!==item.product_id)||(hit.product_ids||[]).some(id=>id!==item.product_id)||(hit.mentioned_product_ids||[]).some(id=>id!==item.product_id)||(hit.system&&hit.system!==selected.system));
}
export async function evaluateRetrieval({dataset,knowledgeDir,cacheDir,modes=['lexical','vector','hybrid'],searchClient,onProgress=()=>{}}){
 if(modes.some(mode=>!['lexical','vector','hybrid'].includes(mode)))throw Error('评测模式必须为 lexical、vector、hybrid。');
 const validation=await validateEvaluation(dataset,knowledgeDir);
 const search=searchClient||createKnowledgeSearch({knowledgeDir,cacheDir});
 const initStarted=performance.now();await search.build({mode:'lexical'});const initializationMs=performance.now()-initStarted;
 const records=[];
 for(const mode of modes){
  for(const [caseIndex,item] of dataset.cases.entries()){
   const started=performance.now();let result,error;
   try{result=await search.search(item.query,{productId:item.product_id,types:item.types,limit:5,mode});}catch(e){error=e.message;}
   const elapsed=performance.now()-started,hits=result?.results?.slice(0,5)||[];
   const available=!error&&result.mode===mode;
   const matched=item.expected.map(target=>hits.some(hit=>matchesGold(hit,target)));
   const first=hits.findIndex(hit=>item.expected.some(target=>matchesGold(hit,target)));
   const contamination=hits.filter(hit=>wrongModel(hit,item,validation.catalog));
   const observed={recall_at_5:item.expected.length?matched.filter(Boolean).length/item.expected.length:null,mrr_at_5:item.expected.length?(first<0?0:1/(first+1)):null,abstained:item.expect_empty?hits.length===0:null,wrong_model_hits:item.product_id?contamination.length:null};
   const record={case_id:item.id,category:item.category,query:item.query,product_id:item.product_id||null,requested_mode:mode,actual_mode:result?.mode||'error',eligible_for_requested_mode_metrics:available,
    latency_ms:round(elapsed),first_query_in_mode:caseIndex===0,warnings:result?.warnings||[],error:error||null,expected_target_count:item.expected.length,matched_target_count:matched.filter(Boolean).length,
    observed,metrics:available?observed:null,hits:hits.map((hit,i)=>({rank:i+1,id:hit.id,source_path:hit.source_path,source_sha256:hit.source_sha256,source_type:hit.source_type,section:hit.section,product_id:hit.product_id,system:hit.system,
     matches_gold:item.expected.some(target=>matchesGold(hit,target)),wrong_model:wrongModel(hit,item,validation.catalog),ranks:hit.ranks,scores:hit.scores,matched_terms:hit.matched_terms}))};
   records.push(record);onProgress({mode,completed:caseIndex+1,total:dataset.cases.length,actual_mode:record.actual_mode});
  }
 }
 const summaries=modes.map(mode=>{
  const attempted=records.filter(r=>r.requested_mode===mode),valid=attempted.filter(r=>r.eligible_for_requested_mode_metrics),positive=valid.filter(r=>r.expected_target_count>0),negative=valid.filter(r=>r.expected_target_count===0),scoped=valid.filter(r=>r.product_id);
  const scopedHits=scoped.reduce((sum,r)=>sum+r.hits.length,0),wrong=scoped.reduce((sum,r)=>sum+r.observed.wrong_model_hits,0);
  return {requested_mode:mode,attempted_cases:attempted.length,evaluated_cases:valid.length,unavailable_or_fallback_cases:attempted.length-valid.length,
   actual_modes:Object.fromEntries([...new Set(attempted.map(r=>r.actual_mode))].map(value=>[value,attempted.filter(r=>r.actual_mode===value).length])),
   positive_evaluated_cases:positive.length,negative_evaluated_cases:negative.length,recall_at_5:round(mean(positive.map(r=>r.metrics.recall_at_5))),mrr_at_5:round(mean(positive.map(r=>r.metrics.mrr_at_5))),
   negative_abstention_rate:round(mean(negative.map(r=>Number(r.metrics.abstained)))),wrong_model_hits:scoped.length?wrong:null,scoped_returned_hits:scopedHits,wrong_model_hit_rate:scopedHits?round(wrong/scopedHits):null,
   latency_ms:{mean:round(mean(valid.map(r=>r.latency_ms))),p50:round(percentile(valid.map(r=>r.latency_ms),.5)),p95:round(percentile(valid.map(r=>r.latency_ms),.95)),first_query:valid.find(r=>r.first_query_in_mode)?.latency_ms??null,fallback_mean:round(mean(attempted.filter(r=>!r.eligible_for_requested_mode_metrics).map(r=>r.latency_ms)))}};
 });
 return {schema_version:1,created_at:new Date().toISOString(),dataset_metadata:dataset.metadata,
  evaluation_method:{k:5,mode_order:modes,comparison:'相同查询、类型/产品过滤与Top-5；不同模式共享语料与进程。分块/检索器未依据本评测输出调整。',timing:'语料及缓存初始化单独记录。首次语义查询可能含模型加载；按模式顺序执行的耗时不能直接视作严格公平性能对比。',fallback:'实际模式与请求模式不一致时，metrics=null，observed仅用于诊断；不计入该请求模式汇总。',gold_matching:'原始路径+文件哈希+标题+期望段落关键词+逐字证据；多个chunk命中同一期望目标只计一次。'},
  corpus_initialization_ms:round(initializationMs),validation:{checked_targets:validation.checked_targets,positive_cases:validation.positive_cases,negative_cases:validation.negative_cases},search_status:search.status(),summaries,records};
}
async function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
 const caseFile=path.resolve(arg('--cases',path.join(root,'evaluations/retrieval-cases.json'))),raw=await fs.readFile(caseFile),dataset=JSON.parse(raw.toString('utf8'));
 const knowledgeDir=path.resolve(arg('--knowledge-dir',process.env.LOCAL_KNOWLEDGE_DIR||path.join(root,'knowledge'))),cacheDir=path.resolve(arg('--cache-dir',process.env.SEARCH_CACHE_DIR||path.join(root,'output/search-cache'))),modes=arg('--modes','lexical,vector,hybrid').split(',');
 const report=await evaluateRetrieval({dataset,knowledgeDir,cacheDir,modes,onProgress:({mode,completed,total,actual_mode})=>{if(completed===1||completed===total)process.stdout.write(JSON.stringify({event:'evaluation_progress',mode,completed,total,actual_mode})+'\n');}});
 report.dataset_sha256=digest(raw);report.runtime={node:process.version,platform:process.platform,arch:process.arch};
 const output=path.resolve(arg('--output',path.join(root,'output/evaluations/retrieval-report.json')));await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({event:'evaluation_complete',output,validation:report.validation,corpus_initialization_ms:report.corpus_initialization_ms,summaries:report.summaries})+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(JSON.stringify({event:'evaluation_error',message:error.message})+'\n');process.exitCode=1;});
