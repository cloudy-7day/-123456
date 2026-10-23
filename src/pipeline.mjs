import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './config.mjs';
import { reviewSegments, validateClaimReview } from './claim-review.mjs';
import { reviewImagePlan, imageDiversityMetadata } from './image-selection.mjs';
import {canonicalizeCitations} from './citation-format.mjs';
import {omitScreenSpecs,preparePublicationStyle} from './copy-style.mjs';

// Supports the JSON Schema subset used by the two team-owned contracts.
export function validate(value, schema, location = 'input', allowEmpty = new Set()) {
  const type = schema.type;
  const valid = type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : type === 'array' ? Array.isArray(value)
    : type === 'integer' ? Number.isInteger(value)
    : typeof value === type;
  if (!valid) throw Error(`${location} 类型必须是 ${type}`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${location} 必须从可选项中选择`);
  if (type === 'string') {
    if (schema.maxLength && value.length > schema.maxLength) throw Error(`${location} 内容过长`);
  }
  if (type === 'object') {
    for (const key of schema.required || []) {
      if (value[key] === undefined || value[key] === null || (typeof value[key] === 'string' && !value[key].trim() && !allowEmpty.has(`${location}.${key}`))) throw Error(`${location}.${key} 为必填项`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) validate(value[key], child, `${location}.${key}`, allowEmpty);
    }
  }
  if (type === 'array') {
    if (schema.minItems && value.length < schema.minItems) throw Error(`${location} 至少需要 ${schema.minItems} 项`);
    value.forEach((item, i) => validate(item, schema.items, `${location}[${i}]`, allowEmpty));
  }
}

export async function runPipeline(input, { retrieve, generate, repair, polish, checkCopy, retrieveResearch, review, progress = () => {} }) {
  const started = Date.now();
  const inputSchema = readJson('contracts/input.schema.json');
  const outputSchema = readJson('contracts/output.schema.json');
  validate(input, inputSchema);
  progress('正在查找产品资料与图片');
  const evidence = await retrieve(input, progress);
  const sources = evidence.sources || [];
  if (!sources.some(s => s.kind === 'text' && s.text?.trim())) throw Error('没有取得可读的产品原文，停止生成。请核对型号及当前知识库中的产品原文。');
  const researchContext = retrieveResearch ? await retrieveResearch(input) : undefined;
  if(researchContext)progress('已匹配场景研究与渠道表达素材，产品事实仍以本轮原文为准');
  progress('正在根据原文生成销售内容');
  const promptFiles = ['system.txt', 'image-rules.txt', 'occupation-scenes.txt', ...(input.platform === '小红书' ? ['xiaohongshu.txt'] : input.platform === '朋友圈' ? ['moments.txt'] : [])];
  const system = promptFiles.map(file => fs.readFileSync(path.join(ROOT, 'prompts', file), 'utf8')).join('\n\n');
  const generationArgs = { input, sources, outputSchema, researchContext, knowledgeContext:evidence.context_retrieval, system: system + '\ncontext_retrieval中的场景、问答、风格片段只作任务与表达参考，不是本轮客户事实或产品能力依据。不能为它们编造S或I编号；产品能力必须回到evidence的所选型号原文。' + (evidence.retrieval?.mode==='cached' ? `\n本轮使用此前真实检索保存的缓存原文，保存时间：${evidence.retrieval.source_created_at}。不得宣称实时检索或当期信息已核验；可能过时的内容应列入待确认。` : '') };
  let output, blocked, revisionFeedback;
  let imageReview;
  const reviewTrace=[];
  const accepted=new Map();
  const maxAttempts=review?(checkCopy&&polish?4:repair?3:2):1;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    output=revisionFeedback?.quality_issues?.length&&polish
      ?await polish({input,output:revisionFeedback.previous_output,sources,researchContext,revisionFeedback})
      :revisionFeedback&&repair?await repair({...generationArgs,revisionFeedback}):await generate({...generationArgs,revisionFeedback});
    output=canonicalizeCitations(output);
    blocked=validateOutput(output,outputSchema,sources);
    if(!blocked&&polish&&['小红书','朋友圈'].includes(input.platform)&&!revisionFeedback){
      progress(input.platform==='朋友圈'?'正在收拢为一个核心卖点与一个具体任务':'正在把有据功能融入小红书场景文案');
      output=await polish({input,output,sources,researchContext,revisionFeedback});
      output=canonicalizeCitations(output);
      blocked=validateOutput(output,outputSchema,sources);
    }
    if(!blocked&&checkCopy)output=preparePublicationStyle(input,output);
    if(!blocked&&input.platform==='小红书'){
      // Screen-size/ratio prefixes add specs, not a new task benefit. Omit only
      // these noun modifiers; the remaining full claim is still reviewed below.
      output={...output,content:Object.fromEntries(Object.entries(output.content).map(([key,text])=>[key,omitScreenSpecs(text)]))};
    }
    if(!blocked){
      const selection=reviewImagePlan(output.image_plan,sources,{productPath:evidence.retrieval?.product_path,minimum:({'小红书':3,'公众号':2,'朋友圈':1,'门店海报':1})[input.platform]||1});
      // Product photos are illustrations, never feature evidence. Keep model-made
      // capability claims out of captions; original indexed titles remain visible.
      if(checkCopy)selection.image_plan=selection.image_plan.map((item,i)=>({...item,caption:'产品资料配图',position:`第${i+1}处配图`}));
      output={...output,image_plan:selection.image_plan};
      const used=[...JSON.stringify({...output,source_refs:[]}).matchAll(/\[(S\d+|I\d+)\]/g)].map(x=>x[1]);
      output.source_refs=[...new Set([...used,...output.image_plan.map(x=>x.source_ref)])];
      imageReview={method:'offline-fingerprint-and-index',selected:selection.images.map(x=>({ref:x.ref,title:x.title,angle_group:imageDiversityMetadata(x).angle_group})),rejected:[...(evidence.retrieval?.image_review?.rejected||[]),...selection.rejected.filter(x=>x.reason!=='limit').map(x=>({ref:x.image.ref,title:x.image.title,reason:x.reason}))],missing:selection.missing,warnings:selection.warnings};
      blocked=validateOutput(output,outputSchema,sources);
    }
    if(blocked||!review)break;
    progress(`正在逐句对照知识库核验 · 第 ${attempt} 次`);
    const segments=reviewSegments(output);
    // Cache exists only inside this request with the same input and source batch.
    // Conditions, location and exact sentence must match. Revalidate evidence and
    // full coverage every time; only the model judgment on untouched text is reused.
    const key=s=>JSON.stringify([s.location,s.text,output.pending_confirmation]);
    const reused=repair?segments.filter(s=>accepted.has(key(s))):[];
    const pending=segments.filter(s=>!reused.includes(s));
    const raw=pending.length?await review({input,output,sources,segments:pending}):{claims:[]};
    const combined={claims:[...(Array.isArray(raw?.claims)?raw.claims:[]),...reused.map(s=>({...accepted.get(key(s)),segment_id:s.id}))]};
    const checked=validateClaimReview(combined,segments,sources,{product:input.product});
    const copyCheck=checkCopy?checkCopy({input,output}):null;
    if(input.platform==='小红书'){
      for(const segment of segments.filter(s=>s.location.startsWith('content.'))){
        const publicCopy=segment.text.replaceAll(input.product,'');
        if(/\d+(?:\.\d+)?\s*(?:英寸|kg|mm|GB|TB|GHz|Hz|PPI)|\d+:\d+|HDMI\s*\d|DisplayPort\s*\d/i.test(publicCopy))checked.issues.push(`${segment.id} ${segment.text}：正文不要罗列参数数字或接口版本；改为具体任务中的动作和帮助，参数留在资料依据。`);
        if(/需要提醒的是|到店核验|以实际体验为准|续航.{0,8}(?:亮度|网络|负载)/.test(publicCopy))checked.issues.push(`${segment.id} ${segment.text}：正文不要出现核验须知和续航影响说明；条件保留在折叠区，正文收窄功能表达。`);
      }
      checked.passed=checked.issues.length===0;
    }
    if(copyCheck){checked.issues.push(...copyCheck.issues);checked.passed=checked.issues.length===0;}
    if(repair&&!checked.issues.some(issue=>!/^C\d+(?:\s|：)/.test(issue))){
      for(const segment of segments){
        if(checked.issues.some(issue=>new RegExp('^'+segment.id+'(?:\\s|：)').test(issue)))continue;
        const claim=checked.claims.find(c=>c.segment_id===segment.id);
        if(claim)accepted.set(key(segment),structuredClone(claim));
      }
    }
    reviewTrace.push({attempt,...checked,copy_check:copyCheck,reviewed_segments:pending.map(s=>s.id),reused_segments:reused.map(s=>s.id)});
    if(checked.passed)break;
    revisionFeedback={issues:checked.issues,quality_issues:copyCheck?.issues||[],claims:checked.claims,segments,previous_output:output,attempt};
    if(attempt<maxAttempts)progress(copyCheck?.issues.length?'正在修订重复、篇幅与渠道表达；修改后的文案将重新核验':repair?'正在局部修订问题句；保留未改动句子的核验记录，再核验修改内容':'发现证据不足的表达，正在收窄或改写，随后重新核验');
  }
  const failedReview=reviewTrace.length>0&&!reviewTrace.at(-1).passed;
  if(failedReview){
    blocked=true;
    // Failed text remains in the audit trail, never in a publish/export field.
    output={...output,content:{title:'',body:'',call_to_action:''},image_plan:[],pending_confirmation:[...output.pending_confirmation,'知识库核验未通过，已暂停成稿。请展开逐段复核查看证据缺口。']};
    const used=[...JSON.stringify({...output,source_refs:[]}).matchAll(/\[(S\d+|I\d+)\]/g)].map(x=>x[1]);
    output.source_refs=[...new Set(used)];
    if(!output.source_refs.length){output.strategy+=` 核验依据：[${sources.find(s=>s.kind==='text').ref}]`;output.source_refs=[sources.find(s=>s.kind==='text').ref];}
  }
  validateOutput(output,outputSchema,sources);
  const minimumImages = { '小红书': 3, '公众号': 2, '朋友圈': 1, '门店海报': 1 }[input.platform] || 1;
  const missingImages = blocked ? 0 : Math.max(0, minimumImages - output.image_plan.length);
  const delivery = { status: blocked ? 'blocked' : missingImages ? 'needs_images' : 'draft', missing_images: missingImages,
    reasons: blocked ? failedReview?[...reviewTrace.at(-1).issues]:[...output.pending_confirmation] : missingImages ? [`${input.platform}配图建议至少${minimumImages}张，本次${output.image_plan.length}张，需补${missingImages}张。`] : [] };
  const semanticReview=failedReview?'blocked':reviewTrace.at(-1)?.passed?'passed':'not_performed';
  progress(semanticReview==='passed'?'知识库辅助核验、引用与结构检查完成':blocked?'本次未通过成稿条件，已保留核验原因':'引用编号与输出结构检查完成');
  return {
    schema_version: inputSchema.schema_version,
    copy_quality:reviewTrace.at(-1)?.copy_check||{passed:null,issues:[],note:'未执行渠道成稿检查'},
    input, output, sources, delivery, review_trace:reviewTrace,image_review:imageReview,
    checks: { structure_valid: true, source_refs_valid: true, semantic_review: semanticReview, note: semanticReview==='passed'?'已对最终正文、标题、行动引导和配图说明进行模型辅助原文核验，并检查覆盖与摘录。不是人工认证；未检查图片像素，也不代表完整营销合规审核。':semanticReview==='blocked'?'产品表达未通过知识库核验，成稿已暂停。':'仅检查结构与引用编号；尚未执行成稿事实核验。' },
    meta: { knowledge_base: evidence.knowledgeBase, retrieval: evidence.retrieval, context_retrieval:evidence.context_retrieval, ...(researchContext?{research:researchContext}:{}), warnings: evidence.warnings || [], created_at: new Date().toISOString(), duration_ms: Date.now() - started },
  };
}

function validateOutput(output,outputSchema,sources){
  const contentFields = ['title', 'body', 'call_to_action'];
  const blocked = contentFields.every(key => typeof output?.content?.[key] === 'string' && !output.content[key].trim());
  validate(output, outputSchema, 'output', blocked ? new Set(contentFields.map(key => `output.content.${key}`)) : new Set());
  if (blocked && (!output.pending_confirmation.some(x => x.trim()) || output.image_plan.length)) throw Error('暂停成稿必须说明待确认原因，并停止配图。');
  const allowed = new Set(sources.map(s => s.ref));
  const mentioned = [...JSON.stringify(output).matchAll(/\[(S\d+|I\d+)\]/g)].map(x => x[1]);
  const refs = [...output.source_refs, ...mentioned, ...output.image_plan.map(x => x.source_ref)];
  if (refs.some(ref => !allowed.has(ref))) throw Error('模型输出了不存在的来源引用，请重新生成。');
  const used = new Set([...mentioned, ...output.image_plan.map(x => x.source_ref)]);
  if ([...used].some(ref => !output.source_refs.includes(ref)) || output.source_refs.some(ref => !used.has(ref))) throw Error('引用列表必须准确收齐正文与配图实际使用的来源，不得遗漏或添加未用引用。');
  if (new Set(output.source_refs).size !== output.source_refs.length || new Set(output.image_plan.map(x => x.source_ref)).size !== output.image_plan.length) throw Error('来源引用或配图重复，请重新生成。');
  if (output.image_plan.some(x => !sources.some(s => s.ref === x.source_ref && s.kind === 'image'))) throw Error('配图引用不是图片来源，请重新生成。');
  return blocked;
}
