import fs from 'node:fs/promises';
import path from 'node:path';
import { understand } from '../modules/scenario/server/understand.mjs';
import { confirmAnalysis } from '../modules/scenario/server/review.mjs';
import { buildHandoff } from './handoff.mjs';
import { runShadowBatch } from './shadow-batch.mjs';
import { ROOT, safeError } from './config.mjs';
import { localCatalog, productPreview } from './local-knowledge.mjs';
import { knowledgeMode } from './evidence-cache.mjs';
import { restrictSystems } from '../modules/scenario/shared/product-suggestion.mjs';
import { createModelFetch } from './model-fetch.mjs';
import { randomUUID } from 'node:crypto';
import { createRunDiagnostics, diagnosticSummary, diagnosticPhase } from './run-diagnostics.mjs';
import {checkCopyQuality} from './editorial.mjs';

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(Error('需要 JSON 输入'), {status:415});
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>100000)throw Object.assign(Error('输入过长'),{status:413}); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(Error('JSON 格式不正确'),{status:400}); }
}
async function savedExamples(){
  const examples=[];
  for(const [id,label] of [['student','学生学习 · 小红书'],['meeting','职场会议 · 小红书'],['student-moments','学生学习 · 朋友圈'],['meeting-moments','职场会议 · 朋友圈']]){
    try{
      const result=JSON.parse(await fs.readFile(path.join(ROOT,`output/semifinal-${id}.json`),'utf8'));
      if(result.complete && result.results?.length && result.results.every(({result:r})=>r?.checks?.semantic_review==='passed'&&r?.copy_quality?.passed===true&&checkCopyQuality({input:r.input,output:r.output}).passed)) examples.push({id,label,created_at:result.created_at,result});
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return examples;
}
export function createScenarioService(settings, {analyze=understand, batch=runShadowBatch, loadLatest=async()=>JSON.parse(await fs.readFile(path.join(ROOT,'output/shadow-latest.json'),'utf8')), loadExamples=savedExamples, diagnostics=createRunDiagnostics()}={}) {
  const modelFetch=createModelFetch(settings.modelHttpTransport);
  const cache=new Map(); let busy=false;
  const get=id=>{const a=cache.get(id); if(!a || Date.now()-a.time>3600000)throw Object.assign(Error('分析已过期，请重新理解。'),{status:410});return a;};
  return async function handle(req,res,route,reply){
    if(req.method==='GET' && route==='/api/run-diagnostics'){
      try {reply(200,{runs:await diagnostics.list()});} catch {reply(503,{error:'诊断历史暂不可读'});}return true;
    }
    if(req.method==='GET' && route==='/api/scenario-examples'){
      try{reply(200,{examples:await loadExamples()});}catch(error){reply(500,{error:safeError(error)});}return true;
    }
    if(req.method==='GET' && route.startsWith('/api/product-image/')){
      try{
        const image=await productPreview(route.slice('/api/product-image/'.length),settings.knowledgeDir);
        if(!image){reply(404,{error:'未找到可用产品图片'});return true;}
        res.writeHead(200,{'Content-Type':`image/${image.extension==='jpg'?'jpeg':image.extension}`,'Content-Length':image.bytes.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
        res.end(image.bytes);
      }catch{reply(404,{error:'未找到可用产品图片'});}return true;
    }
    if(req.method==='GET' && route==='/api/products'){
      try {reply(200,await localCatalog(settings.knowledgeDir));}
      catch(error){reply(503,{error:safeError(error)});}return true;
    }
    if(req.method==='GET' && route==='/api/scenario-latest'){
      try {reply(200,await loadLatest());}
      catch(error){reply(error.code==='ENOENT'?404:500,{error:error.code==='ENOENT'?'还没有保存的多平台结果。':safeError(error)});}
      return true;
    }
    if(req.method==='GET' && route==='/api/health') {
      const mode=knowledgeMode(settings);
      let knowledge;
      try {if(mode==='local'){const catalog=await localCatalog(settings.knowledgeDir);knowledge={ok:true,name:catalog.knowledge_base,productCount:catalog.products.length,...catalog.retrieval};}}
      catch(error){knowledge={ok:false,error:safeError(error)};}
      reply(200,{configured:Boolean(settings.apiKey),provider:'deepseek',model:settings.model,imaConnected:false,imaStatus:mode==='local'?'not_required':'not_checked',retrievalMode:mode==='ima'?'live':mode,...(knowledge?{knowledge}:{})});return true;
    }
    if(req.method==='GET' && (route==='/scenario' || route.startsWith('/scenario/'))){
      const relative=route.replace(/^\/scenario\/?/,'')||'index.html';
      const target=path.resolve(ROOT,'public/scenario',relative), base=path.resolve(ROOT,'public/scenario')+path.sep;
      if(!target.startsWith(base)){reply(404,{error:'未找到文件'});return true;}
      try {const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream'});res.end(data);}
      catch {reply(404,{error:'请先运行构建，再打开场景模块。'});}return true;
    }
    if(req.method!=='POST'||!['/api/analyze','/api/confirm','/api/handoff','/api/run-scenario'].includes(route))return false;
    const runId=randomUUID(), stage=route==='/api/analyze'?'analyze':'generate';
    const tracked=route==='/api/analyze'||route==='/api/run-scenario';
    let attempts=0, reviewIssueCount=0, phase='generation', platformFailure, failureDetails;
    const record=async(status,error)=>{if(tracked)try{await diagnostics.record(diagnosticSummary({run_id:runId,stage,phase,time:new Date().toISOString(),status,attempts,review_issue_count:reviewIssueCount,...(error?{error}: {})}),failureDetails);}catch{/* Diagnostics must not change the run outcome. */}};
    try {
      const input=await body(req);
      if(route==='/api/analyze'){
        if(busy)throw Object.assign(Error('已有任务运行中，请稍后重试。'),{status:409});
        busy=true; const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
        try {
          attempts=1;
          const value=await analyze(input,{apiKey:settings.apiKey,model:settings.model,endpoint:settings.baseUrl+'/chat/completions'},{signal:controller.signal,fetchImpl:modelFetch});
          for(const [id,a] of cache)if(Date.now()-a.time>3600000)cache.delete(id);
          if(cache.size>=100)cache.delete(cache.keys().next().value);
          cache.set(value.analysisId,{analysis:value,time:Date.now()});await record('success');reply(200,value);
        } finally {busy=false;}return true;
      }
      if(route==='/api/confirm'){
        const item=get(input.analysisId);item.analysis=confirmAnalysis(item.analysis,input);reply(200,item.analysis);return true;
      }
      const handoff=buildHandoff(get(input.analysisId).analysis,input);
      if(knowledgeMode(settings)==='local'){
        const {products}=await localCatalog(settings.knowledgeDir);
        const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/^(huawei|华为)\s*/,'').replace(/\s+/g,'');
        const requested=normalize(handoff.tasks[0].product);
        const matches=products.filter(p=>normalize(p.name)===requested||normalize(p.model)===requested);
        if(matches.length!==1)throw Error('请选择知识库中的完整型号与系统版本。');
        if(!restrictSystems(handoff.customer_context.understanding.observations,matches).length)throw Error('所选产品与客户明确的系统要求冲突，请更换型号或修订原始需求后重新理解。');
      }
      if(route==='/api/handoff'){reply(200,handoff);return true;}
      if(busy)throw Object.assign(Error('已有任务运行中，请稍后重试。'),{status:409});
      busy=true;
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','X-Accel-Buffering':'no'});
      const send=event=>{if(event.type==='progress')phase=diagnosticPhase(event.message,phase);if(event.type==='platform_error'){platformFailure=diagnosticSummary({error:{message:event.message,code:event.code}}).error;event={...event,run_id:runId,message:`${event.message}（诊断编号：${runId}）`};}if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
      try {
        attempts=1;
        const result=await batch(handoff,settings,send);
        result.run_id=runId;
        result.errors=(result.errors||[]).map(error=>({...error,run_id:runId,message:`${error.message}（诊断编号：${runId}）`}));
        for(const row of result.results||[])if(row.result?.meta)row.result.meta.run_id=runId;
        failureDetails=(result.results||[]).filter(row=>row.result?.checks?.semantic_review==='blocked').map(row=>({platform:row.platform,product:row.result.input.product,review_trace:row.result.review_trace}));
        const traces=(result.results||[]).flatMap(item=>item.result?.review_trace||[]);
        attempts=Math.max(attempts,...traces.map(trace=>Number(trace.attempt)||0));
        reviewIssueCount=traces.reduce((count,trace)=>count+(trace.issues?.length||0),0);
        await fs.mkdir(path.join(ROOT,'output'),{recursive:true});
        await fs.writeFile(path.join(ROOT,'output/shadow-latest.json'),JSON.stringify(result,null,2));
        await record(result.complete?'success':'failed',result.complete?undefined:platformFailure||{code:'HANDOFF_BLOCKED'});
        send({type:'result',result});
      }catch(error){await record('failed',error);send({type:'error',run_id:runId,message:`${safeError(error)}（诊断编号：${runId}）`});}
      finally{busy=false;res.end();}
    }catch(error){await record('failed',error);reply(error.status||400,{error:{code:error.code||'HANDOFF_BLOCKED',run_id:runId,message:`${error.name==='ZodError'?'请选择完整型号和至少一个有效平台，并确认用于检索。':safeError(error)}（诊断编号：${runId}）`}});}
    return true;
  };
}
