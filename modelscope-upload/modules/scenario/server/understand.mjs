import {randomUUID} from 'node:crypto';
import {inputSchema,modelSchema,validateUnderstanding,deriveGate,ValidationError} from '../shared/contract.mjs';
import {z} from 'zod';
import {SYSTEM_PROMPT} from './prompt.mjs';
import {samples,researchSources} from '../shared/samples.mjs';
const OUTPUT_SCHEMA=JSON.stringify(z.toJSONSchema(modelSchema));
export class ServiceError extends Error{constructor(code,message,status=502){super(message);Object.assign(this,{code,status});}}
export async function understand(input,config,{fetchImpl=fetch,signal,timeoutMs=55000}={}){
 const parsed=inputSchema.safeParse(input); if(!parsed.success) throw new ServiceError('INVALID_INPUT','请检查场景输入，来源不能为空且总长不超过 16000 字。',400);
 if(!config.apiKey) throw new ServiceError('NOT_CONFIGURED','尚未配置 DeepSeek 服务端密钥。',503);
 const start=Date.now();const deadline=AbortSignal.timeout(timeoutMs);const combined=signal?AbortSignal.any([signal,deadline]):deadline;
 let lastError; let attempts=0;
 for(let attempt=0;attempt<2;attempt++){
  attempts++;
  try{
   const response=await fetchImpl(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},signal:combined,body:JSON.stringify({model:config.model,thinking:{type:'disabled'},temperature:0.1,max_tokens:6500,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM_PROMPT+'\n必须遵守完整的 JSON Schema：'+OUTPUT_SCHEMA+(attempt?'\n上次输出校验失败。请尤其检查事实 value 等于 quote、引用确实存在、字段类型正确。':'')},{role:'user',content:JSON.stringify(parsed.data)}]})});
   if(!response.ok){if(response.status===429) throw new ServiceError('RATE_LIMIT','模型服务繁忙，请稍后重试。',429);if([401,403].includes(response.status))throw new ServiceError('AUTH_ERROR','模型服务认证失败，请检查服务端配置。',503);throw new ServiceError('UPSTREAM_ERROR','模型服务暂时不可用，请稍后重试。');}
   const body=await response.json();const choice=body.choices?.[0];
   if(choice?.finish_reason!=='stop'||!choice.message?.content) throw new ValidationError('模型结果为空或未完整生成');
   let raw;try{raw=JSON.parse(choice.message.content);}catch{throw new ValidationError('模型返回的 JSON 无法解析');}
   const understanding=validateUnderstanding(raw,parsed.data.sources);
   const sample=samples.find(s=>s.id===parsed.data.sampleId);
   const modified=sample && (parsed.data.sources.find(s=>s.type==='scenario')?.text!==sample.text || parsed.data.sources.some(s=>s.type==='revision' || s.type==='supplement') || (parsed.data.sources.find(s=>s.type==='product')?.text||'') !== (sample.product?'指定产品：'+sample.product:''));
   const provenance=sample?{kind:'simulated_adaptation',modifiedFromSample:Boolean(modified),sampleId:sample.id,originalSampleText:sample.text,modificationNotice:modified?'本次输入已修改；新增内容不属于源帖依据。':null,label:sample.label,basis:sample.basis,inventedDetails:sample.fiction,source:researchSources.find(s=>s.id===sample.sourceId)}:{kind:'user_input',label:'用户提供的输入，未核验为真实客户记录'};
   return {schemaVersion:'1.0',analysisId:randomUUID(),createdAt:new Date().toISOString(),input:parsed.data,provenance,understanding,review:{status:'pending',edits:[]},gate:deriveGate(understanding),call:{provider:'deepseek',model:config.model,attempts,durationMs:Date.now()-start,requestId:typeof body.id==='string'?body.id:null,usage:body.usage?{promptTokens:body.usage.prompt_tokens,completionTokens:body.usage.completion_tokens}:null}};
  }catch(error){
   if(combined.aborted) throw new ServiceError(signal?.aborted?'CANCELLED':'TIMEOUT',signal?.aborted?'已取消理解。':'理解超过 55 秒，请重试；输入已保留。',504);
   if(error instanceof ServiceError) throw error;
   lastError=error;
   if(!(error instanceof ValidationError)) throw new ServiceError('NETWORK_ERROR','无法连接模型服务，请检查网络后重试。');
  }
 }
 throw new ServiceError('INVALID_MODEL_OUTPUT',`${lastError.message}。已自动重试一次，请调整输入后重试。`);
}
