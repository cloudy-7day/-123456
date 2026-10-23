import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './config.mjs';

// A shared queue also covers multiple service instances writing the same file.
const queues=new Map();
const codes=new Set(['MODEL_FORMAT_ERROR','MODEL_INVALID_JSON','INVALID_MODEL_OUTPUT','MODEL_RESPONSE_INVALID','MODEL_TIMEOUT','HANDOFF_BLOCKED','ABORT_ERR','ETIMEDOUT','ECONNRESET','ENOENT']);
const categories=new Set(['FORMAT','AUTH','NETWORK','EVIDENCE_BLOCKED','STRUCTURE_INVALID','OTHER']);
export function diagnosticPhase(message,previous='generation'){
  if(/逐句对照|知识库.*核验|重新核验/.test(message))return 'evidence_review';
  if(/融入小红书|润色|文案修订/.test(message))return 'polish';
  if(/根据原文生成|收窄或改写/.test(message))return 'generation';
  if(/取得本轮产品原文|查找产品资料|匹配场景研究/.test(message))return 'retrieval';
  return previous;
}
function category(error){
  if(categories.has(error.category))return error.category;
  const text=String(error.message||''),code=String(error.code||'');
  if(/FORMAT|INVALID_JSON/.test(code)||/有效JSON|被截断/.test(text))return 'FORMAT';
  if(/HTTP (401|403)\b|缺少 .*API_KEY/.test(text))return 'AUTH';
  if(/TIMEOUT|ETIMEDOUT|ECONN|ENOTFOUND|ABORT_ERR/.test(code)||/fetch failed|超时/.test(text))return 'NETWORK';
  if(code==='HANDOFF_BLOCKED'||/没有取得可读的产品原文|未通过.*核验|不存在的来源引用|引用列表必须/.test(text))return 'EVIDENCE_BLOCKED';
  if(code==='INVALID_MODEL_OUTPUT'||/为必填项|类型必须|必须从可选项|至少需要/.test(text))return 'STRUCTURE_INVALID';
  return 'OTHER';
}
export function diagnosticSummary(value){
  return {
    run_id:value.run_id,stage:value.stage==='analyze'?'analyze':'generate',
    time:value.time||new Date().toISOString(),status:value.status==='success'?'success':'failed',
    phase:['generation','polish','evidence_review','retrieval'].includes(value.phase)?value.phase:'generation',
    attempts:Math.max(0,Math.min(100,Number(value.attempts)||0)),
    review_issue_count:Math.max(0,Math.min(10000,Number(value.review_issue_count)||value.review_issues?.length||0)),
    ...(value.error?{error:{code:codes.has(value.error.code)?value.error.code:'RUN_FAILED',category:category(value.error),message:'本轮处理失败，请凭诊断编号定位。'}}:{}),
  };
}
export function createRunDiagnostics({file=path.join(ROOT,'output/run-diagnostics.json'),limit=20}={}){
  file=path.resolve(file);limit=Math.max(1,Math.min(20,Number(limit)||20));
  const read=async()=>{try{const rows=JSON.parse(await fs.readFile(file,'utf8'));return Array.isArray(rows)?rows:[];}catch(error){if(error.code==='ENOENT')return [];throw error;}};
  return {
    async record(value,failureDetails){
      const previous=queues.get(file)||Promise.resolve();
      const task=previous.catch(()=>{}).then(async()=>{
        const rows=await read();rows.push(diagnosticSummary(value));
        await fs.mkdir(path.dirname(file),{recursive:true});
        const temp=`${file}.${randomUUID()}.tmp`;
        try {await fs.writeFile(temp,JSON.stringify(rows.slice(-limit),null,2));await fs.rename(temp,file);}
        finally {await fs.rm(temp,{force:true}).catch(()=>{});}
        if(value.status==='failed'&&/^[a-f0-9-]{36}$/i.test(value.run_id||'')&&Array.isArray(failureDetails)&&failureDetails.length){
          const dir=path.join(path.dirname(file),'failed-reviews');await fs.mkdir(dir,{recursive:true});
          await fs.writeFile(path.join(dir,value.run_id+'.json'),JSON.stringify({run_id:value.run_id,time:value.time,results:failureDetails},null,2));
          const files=(await fs.readdir(dir)).filter(name=>/^[a-f0-9-]{36}\.json$/i.test(name));
          const ordered=await Promise.all(files.map(async name=>({name,time:(await fs.stat(path.join(dir,name))).mtimeMs})));
          for(const old of ordered.sort((a,b)=>b.time-a.time).slice(10))await fs.unlink(path.join(dir,old.name));
        }
      });
      queues.set(file,task);
      try {await task;} finally {if(queues.get(file)===task)queues.delete(file);}
    },
    async list(){await queues.get(file)?.catch(()=>{});return (await read()).slice(-limit).reverse().map(diagnosticSummary);},
  };
}
