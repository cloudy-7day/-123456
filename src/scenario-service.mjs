import fs from 'node:fs/promises';
import path from 'node:path';
import { understand } from '../modules/scenario/server/understand.mjs';
import { confirmAnalysis } from '../modules/scenario/server/review.mjs';
import { buildHandoff } from './handoff.mjs';
import { runShadowBatch } from './shadow-batch.mjs';
import { ROOT, safeError } from './config.mjs';
import { localCatalog, productPreview } from './local-knowledge.mjs';
import { knowledgeMode } from './evidence-cache.mjs';

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(Error('需要 JSON 输入'), {status:415});
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>100000)throw Object.assign(Error('输入过长'),{status:413}); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(Error('JSON 格式不正确'),{status:400}); }
}
export function createScenarioService(settings, {analyze=understand, batch=runShadowBatch, loadLatest=async()=>JSON.parse(await fs.readFile(path.join(ROOT,'output/shadow-latest.json'),'utf8'))}={}) {
  const cache=new Map(); let busy=false;
  const get=id=>{const a=cache.get(id); if(!a || Date.now()-a.time>3600000)throw Object.assign(Error('分析已过期，请重新理解。'),{status:410});return a;};
  return async function handle(req,res,route,reply){
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
    try {
      const input=await body(req);
      if(route==='/api/analyze'){
        if(busy)throw Object.assign(Error('已有任务运行中，请稍后重试。'),{status:409});
        busy=true; const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
        try {
          const value=await analyze(input,{apiKey:settings.apiKey,model:settings.model,endpoint:settings.baseUrl+'/chat/completions'},{signal:controller.signal});
          for(const [id,a] of cache)if(Date.now()-a.time>3600000)cache.delete(id);
          if(cache.size>=100)cache.delete(cache.keys().next().value);
          cache.set(value.analysisId,{analysis:value,time:Date.now()});reply(200,value);
        } finally {busy=false;}return true;
      }
      if(route==='/api/confirm'){
        const item=get(input.analysisId);item.analysis=confirmAnalysis(item.analysis,input);reply(200,item.analysis);return true;
      }
      const handoff=buildHandoff(get(input.analysisId).analysis,input);
      if(route==='/api/handoff'){reply(200,handoff);return true;}
      if(busy)throw Object.assign(Error('已有任务运行中，请稍后重试。'),{status:409});
      busy=true;
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','X-Accel-Buffering':'no'});
      const send=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
      try {
        const result=await batch(handoff,settings,send);
        await fs.mkdir(path.join(ROOT,'output'),{recursive:true});
        await fs.writeFile(path.join(ROOT,'output/shadow-latest.json'),JSON.stringify(result,null,2));
        send({type:'result',result});
      }catch(error){send({type:'error',message:safeError(error)});}
      finally{busy=false;res.end();}
    }catch(error){reply(error.status||400,{error:{code:error.code||'HANDOFF_BLOCKED',message:error.name==='ZodError'?'请选择完整型号和至少一个有效平台，并确认用于检索。':safeError(error)}});}
    return true;
  };
}
