import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,extname} from 'node:path';
import {loadConfig} from './config.mjs';
import {understand,ServiceError} from './understand.mjs';
import {confirmAnalysis} from './review.mjs';
import {generateDraft} from './marketing.mjs';
import {loadImaBundle,validateImaBundle,packageImaDraft,packagePreview,pendingIma} from './pipeline.mjs';
import {LOCAL_IMAGE_PATH} from '../shared/image-policy.mjs';
import {localStatus,localImage,filterProducts,enforceProductFilter} from './local-kb.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=loadConfig(); const analyses=new Map();let active=0;
function withIma(analysis){return {...analysis,gate:{...analysis.gate,imaStatus:localStatus().status},mode:'local_knowledge_base'};}
const production=existsSync(resolve(root,'dist/index.html'));
const vite=production?null:await (await import('vite')).createServer({root,server:{middlewareMode:true},appType:'spa'});
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function readBody(req){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>100000)throw new ServiceError('TOO_LARGE','输入内容过长。',413);}try{return JSON.parse(body);}catch{throw new ServiceError('INVALID_JSON','请求格式不正确。',400);}}
const server=http.createServer(async(req,res)=>{
 const localHost=`127.0.0.1:${config.port}`;const allowedHosts=[localHost,`localhost:${config.port}`];
 if(!allowedHosts.includes(req.headers.host))return send(res,403,{error:{code:'FORBIDDEN_HOST',message:'仅接受本机访问。'}});
 const origin=req.headers.origin;
 if(origin&&!allowedHosts.some(h=>origin===`http://${h}`))return send(res,403,{error:{code:'FORBIDDEN_ORIGIN',message:'请求来源不匹配。'}});
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const pathname=new URL(req.url,`http://${localHost}`).pathname;
 try{
  if(pathname.startsWith('/assets/ima/')&&req.method==='GET'){if(!LOCAL_IMAGE_PATH.test(pathname))throw new ServiceError('IMA_IMAGE_ONLY','仅允许读取 ima 本地知识库索引中的图片。',400);const image=await localImage(pathname.split('/').at(-1));res.writeHead(200,{'Content-Type':image.type,'Cache-Control':'no-store'});return res.end(image.data);}
  if(pathname==='/api/health'&&req.method==='GET')return send(res,200,{configured:Boolean(config.apiKey),provider:'deepseek',model:config.model,mode:'local_knowledge_base',ima:localStatus()});
  if(pathname==='/api/ima/status'&&req.method==='GET')return send(res,200,localStatus());
  if(pathname==='/api/products/filter'&&req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))throw new ServiceError('INVALID_CONTENT_TYPE','请使用 JSON 请求。',415);
   const input=await readBody(req);try{return send(res,200,filterProducts(input));}catch(e){throw new ServiceError('INVALID_FILTER',e.message,400);}
  }
  if(pathname==='/api/analyze'&&req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))throw new ServiceError('INVALID_CONTENT_TYPE','请使用 JSON 请求。',415);
   if(active>=2)throw new ServiceError('BUSY','已有理解任务在运行，请稍后重试。',429);
   const input=await readBody(req);const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});active++;
   try{const analysis=withIma(await understand(input,config,{signal:controller.signal}));
    for(const [id,item] of analyses)if(Date.now()-item.time>3600000)analyses.delete(id);
    if(analyses.size>=100)analyses.delete(analyses.keys().next().value);
    analyses.set(analysis.analysisId,{analysis,time:Date.now()});return send(res,200,analysis);
   }finally{active--;}
  }
  if((pathname==='/api/draft'||pathname==='/api/preview')&&req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))throw new ServiceError('INVALID_CONTENT_TYPE','请使用 JSON 请求。',415);
   const input=await readBody(req);const item=analyses.get(input.analysisId);
   if(!item||Date.now()-item.time>3600000)throw new ServiceError('EXPIRED','洞察已过期，请重新生成。',410);
   if(active>=2)throw new ServiceError('BUSY','已有任务在运行，请稍后重试。',429);
   const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});active++;
   try{
    if(pathname==='/api/draft')enforceProductFilter(item.analysis);
    const bundle=pathname==='/api/draft'?validateImaBundle(await loadImaBundle(item.analysis,config,{signal:controller.signal})):null;
    const draft=await generateDraft(input,item.analysis,config,{signal:controller.signal,reviewedFacts:bundle?.facts||[],assessment:bundle?.assessment||null});
    return send(res,200,bundle?packageImaDraft(draft,item.analysis,bundle):packagePreview(draft,item.analysis));
   }finally{active--;}
  }
  if(pathname==='/api/confirm'&&req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))throw new ServiceError('INVALID_CONTENT_TYPE','请使用 JSON 请求。',415);
   const input=await readBody(req); const item=analyses.get(input.analysisId);
   if(!item||Date.now()-item.time>3600000)throw new ServiceError('EXPIRED','分析已过期，请重新理解后确认。',410);
   return send(res,200,withIma(confirmAnalysis(item.analysis,input)));
  }
  if(pathname.startsWith('/api/'))return send(res,404,{error:{code:'NOT_FOUND',message:'接口不存在。'}});
  if(vite)return vite.middlewares(req,res);
  let path=resolve(root,'dist','.'+decodeURIComponent(pathname));
  if(!path.startsWith(resolve(root,'dist')+'/'))path=resolve(root,'dist/index.html');
  if(!existsSync(path)||pathname==='/')path=resolve(root,'dist/index.html');
  const content=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(path)]||'application/octet-stream'});res.end(content);
 }catch(error){if(!res.destroyed)send(res,error.status||500,{error:{code:error.code||'INTERNAL_ERROR',message:error instanceof ServiceError?error.message:'处理失败，请重试。'}});}
});
server.listen(config.port,'127.0.0.1',()=>console.log(`Scenario module: http://127.0.0.1:${config.port} (DeepSeek ${config.apiKey?'configured':'not configured'})`));
