export function rejectedSegmentIds(feedback){return new Set((feedback.issues||[]).map(s=>s.match(/^(C\d+)(?:\s|：)/)?.[1]).filter(Boolean));}
// Locate plain review text inside the original field without dropping its other citations.
function plainWithOffsets(raw){
 let text='',offsets=[];const citation=/\[(?:S|I)\d+\]/gy;
 for(let i=0;i<raw.length;){citation.lastIndex=i;const found=citation.exec(raw);if(found){i+=found[0].length;continue;}offsets.push(i);text+=raw[i++];}
 return {text,offsets};
}
export function applyClaimRepairs(output,feedback,response){
 const ids=rejectedSegmentIds(feedback),repairs=response?.repairs;
 if(!ids.size||!Array.isArray(repairs)||repairs.length!==ids.size||new Set(repairs.map(x=>x.segment_id)).size!==ids.size)throw Error('局部修订必须覆盖每个问题句且不能重复。');
 if(repairs.some(x=>!ids.has(x.segment_id)||typeof x.replacement!=='string'||x.replacement.length>1200))throw Error('局部修订包含未授权的句子或无效文本。');
 // Rejected image copy must not introduce another feature inference from a photo.
 // Only the rejected segment becomes a neutral label; keep the image and its source.
 const changes=new Map(repairs.map(x=>{
   const location=feedback.segments.find(s=>s.id===x.segment_id)?.location;
   return [x.segment_id,/^image_plan\.\d+\.caption$/.test(location)?'产品外观图':/^image_plan\.\d+\.position$/.test(location)?'配图':x.replacement];
 }));
 const next=structuredClone(output),locations=[...new Set(feedback.segments.filter(s=>ids.has(s.id)).map(s=>s.location))];
 for(const location of locations){
   const keys=location.split('.');let target=next;for(const key of keys.slice(0,-1))target=target?.[key];const key=keys.at(-1);
   if(typeof target?.[key]!=='string')throw Error('局部修订目标不存在。');
   const original=target[key],{text,offsets}=plainWithOffsets(original),edits=[];let cursor=0;
   for(const s of feedback.segments.filter(s=>s.location===location)){
     const at=text.indexOf(s.text,cursor);if(at<0)throw Error('修订依据与当前文本不一致。');cursor=at+s.text.length;
     if(!changes.has(s.id))continue;
     const start=offsets[at];let end=offsets[cursor-1]+1;
     const trailing=original.slice(end).match(/^(?:\[(?:S|I)\d+\])+/);if(trailing)end+=trailing[0].length;
     edits.push({start,end,replacement:changes.get(s.id)});
   }
   for(const edit of edits.reverse())target[key]=target[key].slice(0,edit.start)+edit.replacement+target[key].slice(edit.end);
 }
 if(!next.content.title.trim())throw Error('标题不能在局部修订后为空。');
 if(!next.content.body.trim()||!next.content.call_to_action.trim())throw Error('局部修订后正文和行动引导必须完整。');
 const refs=[...JSON.stringify({...next,source_refs:[]}).matchAll(/\[(S\d+|I\d+)\]/g)].map(x=>x[1]);
 next.source_refs=[...new Set([...refs,...next.image_plan.map(x=>x.source_ref)])];
 return next;
}
