import {z} from 'zod';
import {deriveGate} from '../shared/contract.mjs';
import {ServiceError} from './understand.mjs';
export const reviewSchema=z.object({analysisId:z.string().uuid(),edits:z.array(z.object({id:z.string().max(50),value:z.string().trim().min(1).max(1000)}).strict()).max(40)}).strict();
export function confirmAnalysis(analysis,request){
 if(analysis.review?.status==='revised_pending_analysis')throw new ServiceError('REANALYSIS_REQUIRED','已保存的修订必须重新理解，不能重新确认旧分析。',409);
 const parsed=reviewSchema.safeParse(request);if(!parsed.success) throw new ServiceError('INVALID_REVIEW','修订数据格式不正确。',400);
 const data=parsed.data; if(analysis.analysisId!==data.analysisId)throw new ServiceError('INVALID_REVIEW','分析版本不一致。',409);
 const ids=new Set(analysis.understanding.observations.map(o=>o.id));
 if(data.edits.some(e=>!ids.has(e.id))||new Set(data.edits.map(e=>e.id)).size!==data.edits.length)throw new ServiceError('INVALID_REVIEW','修订条目不存在或重复。',400);
 const edits=data.edits.filter(e=>e.value!==analysis.understanding.observations.find(o=>o.id===e.id).value).map(e=>({...e,original:analysis.understanding.observations.find(o=>o.id===e.id),source:'salesperson_revision'}));
 return {...analysis,review:{status:edits.length?'revised_pending_analysis':'confirmed',confirmedAt:new Date().toISOString(),edits},gate:deriveGate(analysis.understanding,{reviewed:true,revised:edits.length>0})};
}
