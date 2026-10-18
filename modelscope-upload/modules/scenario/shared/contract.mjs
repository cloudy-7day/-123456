import { z } from 'zod';
import {categories} from './categories.mjs';
export {categories};
const str = z.string().trim().min(1).max(1000);
export const sourceSchema = z.object({id:z.string().regex(/^[a-z0-9_-]{1,60}$/i),type:z.enum(['scenario','product','supplement','revision']),text:z.string().trim().min(1).max(8000)}).strict();
export const inputSchema = z.object({sources:z.array(sourceSchema).min(1).max(20),sampleId:z.string().max(60).nullable().optional(),parentAnalysisId:z.string().uuid().nullable().optional()}).strict().refine(x => x.sources.reduce((n,s)=>n+s.text.length,0)<=16000,'输入总长度过长').refine(x=>new Set(x.sources.map(s=>s.id)).size===x.sources.length,'来源 ID 重复');
const evidence = z.object({sourceId:str,quote:str}).strict();
const topic = z.enum(Object.keys(categories));
export const modelSchema = z.object({
  observations:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]{1,50}$/i),category:topic,kind:z.enum(['fact','inference','unknown']),value:str.nullable(),evidence:z.array(evidence).max(5),rationale:z.string().max(1000),critical:z.boolean()}).strict()).min(1).max(40),
  questions:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]{1,50}$/i),topic,question:str,why:str,priority:z.enum(['blocking','optional']),evidence:z.array(evidence).max(5)}).strict()).max(4),
  conflicts:z.array(z.object({description:str,evidence:z.array(evidence).min(2).max(5),resolutionQuestion:str}).strict()).max(8),
  product:z.object({status:z.enum(['specified','unspecified','ambiguous']),name:str.nullable(),evidence:z.array(evidence).max(5)}).strict()
}).strict();

export class ValidationError extends Error { constructor(message){super(message);this.code='INVALID_MODEL_OUTPUT';} }
export function validateUnderstanding(raw,sources){
 const parsed=modelSchema.safeParse(raw); if(!parsed.success) throw new ValidationError('模型返回的字段不符合约定');
 const data=parsed.data; const sourceMap=new Map(sources.map(s=>[s.id,s.text]));
 const locate=e=>{const text=sourceMap.get(e.sourceId);const start=text?.indexOf(e.quote)??-1;if(start<0) throw new ValidationError('模型引用了输入中不存在的原文');return {...e,start,end:start+e.quote.length};};
 if(new Set(data.observations.map(o=>o.id)).size!==data.observations.length || new Set(data.questions.map(q=>q.id)).size!==data.questions.length) throw new ValidationError('模型返回了重复条目 ID');
 data.observations=data.observations.map(o=>{
  if(o.kind==='unknown' && o.value!==null) throw new ValidationError('未知信息必须保留 null');
  if(o.kind!=='unknown' && (!o.value || !o.evidence.length)) throw new ValidationError('判断缺少依据');
  if(o.kind==='fact' && !o.evidence.some(e=>e.quote===o.value)) throw new ValidationError('明确事实必须逐字引用输入');
  if(o.kind==='inference' && !o.rationale.trim()) throw new ValidationError('推断缺少解释');
  return {...o,evidence:o.evidence.map(locate)};
 });
 for(const category of Object.keys(categories)) if(!data.observations.some(o=>o.category===category)) data.observations.push({id:`unknown_${category}`,category,kind:'unknown',value:null,evidence:[],rationale:'输入未提供此项信息，保留未知。',critical:false});
 data.questions=data.questions.map(q=>({...q,evidence:q.evidence.map(locate)}));
 data.conflicts=data.conflicts.map(c=>({...c,evidence:c.evidence.map(locate)}));
 data.product.evidence=data.product.evidence.map(locate);
 if(data.product.status==='specified' && (!data.product.name || !data.product.evidence.some(e=>e.quote.includes(data.product.name)))) throw new ValidationError('指定产品缺少原文依据');
 if(data.product.status==='unspecified' && data.product.name!==null) throw new ValidationError('未指定产品应为 null');
 return data;
}
export function deriveGate(data,{reviewed=false,revised=false}={}){
 const reasons=[];
 if(!reviewed) reasons.push('洞察尚未人工确认');
 if(revised) reasons.push('修订内容尚未重新理解');
 data.questions.filter(q=>q.priority==='blocking').forEach(q=>reasons.push(q.question));
 data.observations.filter(o=>o.critical && o.kind!=='fact').forEach(o=>reasons.push(`${categories[o.category]}仍待确认`));
 data.conflicts.forEach(c=>reasons.push(c.resolutionQuestion));
 if(data.product.status==='ambiguous') reasons.push('产品意向存在歧义');
 return {status:reasons.length?'paused':'ready_for_ima',reasons:[...new Set(reasons)],productFactsVerified:false,imaStatus:'not_connected'};
}
