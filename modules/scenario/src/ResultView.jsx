import {ScenarioCard} from './ScenarioCard';
import React from 'react';
import {downloadText} from './api';
import {cleanReferences,plainCopy,publishText,publicationBlocks,publicationContent} from '../shared/publish-copy.mjs';
import './copy-style.css';

function EmojiText({text}){
 const parts=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)];
 return parts.map(({segment},i)=>/\p{Extended_Pictographic}/u.test(segment)?<span className="copy-emoji" key={i}>{segment}</span>:segment);
}
function Emphasis({text}){
 return String(text||'').split(/(\*\*[^*\n]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i}><EmojiText text={part.slice(2,-2)}/></strong>:<EmojiText text={part} key={i}/>);
}
const originLabels={extracted_task_card:'本轮输入的任务卡',input_extracted:'从原文目标提取',operator_selected:'运营手动选择',default_suggestion:'系统默认建议',explicit_identity:'来自原文身份',explicit_identity_or_task:'来自原文身份与任务',explicit_task:'来自原文任务',unknown:'原文未确定',unsupported_explicit_identity:'按本轮原文身份，未套用研究场景'};
const fieldLabels={task:'核心任务',place:'候选地点',scene:'候选情境',purchase_trigger:'购机触发候选',narrative_hook:'叙事切入',finding:'研究发现',applicability:'适用范围',purchase_evidence:'购机证据边界',task_difference:'任务推进',recommendation:'表达建议',example:'表达示例',guardrail:'表达边界',counterexample:'避免的表达',domain_transfer_limit:'迁移范围',evidence_scope:'证据范围',limitations:'资料局限',not_supported:'不能支持的结论',value:'内容',note:'说明',avoid_inference:'不能据此推断',pain_or_concern:'候选关注点',content_goal:'候选内容方向',task_frequency_evidence:'任务频率证据'};
function ReadableValue({value}){if(value==null)return null;if(Array.isArray(value))return <ul>{value.map((item,i)=><li key={i}><ReadableValue value={item}/></li>)}</ul>;if(typeof value==='object')return <dl>{Object.entries(value).filter(([key])=>fieldLabels[key]).map(([key,item])=><React.Fragment key={key}><dt>{fieldLabels[key]}</dt><dd><ReadableValue value={item}/></dd></React.Fragment>)}</dl>;return <span>{String(value)}</span>;}
function ResearchSource({source}){let href;try{const url=new URL(source.url);if(['http:','https:'].includes(url.protocol))href=url.href;}catch{}return <li>{href?<a href={href} target="_blank" rel="noopener noreferrer">{source.title||'研究原始来源'}</a>:<span>{source.title||source.id||'研究来源'}</span>}{source.publisher?<p className="fine">{source.publisher}{source.published_at?' · '+source.published_at:''}</p>:null}{source.evidence_scope?<p>适用范围：{source.evidence_scope}</p>:null}{source.limitations?<ReadableValue value={source.limitations}/>:null}</li>;}
function ResearchRecord({record}){let material=record.material||{};if(typeof material==='string'){try{material=JSON.parse(material);}catch{material={note:material};}}const status=({research_informed_hypothesis:'研究启发的候选假设',researcher_design_recommendation:'研究整理的表达建议',reported:'来源报道，保留样本限制',observed:'资料观察',public_agency_self_report:'机构自报资料',commercial_article_expression_reference:'商业案例表达参考'})[material.evidence_status]||'研究参考，需结合原始资料核对';return <details><summary>{record.title||material.name||record.record_id}</summary><p className="fine">证据性质：{status}。用于内容选择，不能证明客户经历或产品功能。</p><ReadableValue value={material}/>{record.sources?.length?<><h4>参考来源</h4><ul>{record.sources.map((source,i)=><ResearchSource source={source} key={source.id||i}/>)}</ul></>:null}</details>;}
function ResearchDetails({research}){return <details className="supporting-details"><summary>查看研究依据与内容选择理由</summary><p className="fine">以下为检索资料和内容组织依据，属于候选角度，不是客户事实。</p><p>业务场景：{({SC01:'学生学习',SC02:'职场会议'})[research.scenario_id]||'按原始需求'}；选择依据：{originLabels[research.provenance?.scenario_origin]||'结合原始输入选择'}。</p><p>内容目标：{({conversation:'话题互动',save:'收藏参考',consultation:'引导咨询'})[research.content_brief?.goal]||'话题互动'}（{originLabels[research.content_brief?.goal_origin]||'系统默认建议'}）；客户购买阶段：{research.content_brief?.buying_stage==='unknown'?'未知':research.content_brief?.buying_stage||'未知'}。</p>{research.content_brief?.scenario_card?<ScenarioCard card={research.content_brief.scenario_card}/>:null}<h3>情境与任务依据</h3>{(research.research_context||[]).map(record=><ResearchRecord key={record.record_id} record={record}/>)}<h3>表达模式</h3>{(research.writing_patterns||[]).map(record=><ResearchRecord key={record.record_id} record={record}/>)}<p className="fine">资料版本：{research.provenance?.as_of||'未提供'}。群体研究与营销假设只供选择角度；群体统计不代表本轮客户，也不能证明具体型号功能。</p></details>;}
function segmentLocation(location){return String(location||'文案片段').replace(/^image_plan\.(\d+)\.caption/,(_,n)=>`配图 ${Number(n)+1} 说明`).replace(/^image_plan\.(\d+)\.position/,(_,n)=>`配图 ${Number(n)+1} 位置`).replace(/^content\.title/,'标题').replace(/^content\.body/,'正文').replace(/^content\.call_to_action/,'互动引导').replace(/^image_plan\[(\d+)\]\.caption/ ,(_,n)=>`配图 ${Number(n)+1} 说明`).replace(/^image_plan\[(\d+)\]\.position/,(_,n)=>`配图 ${Number(n)+1} 位置`);}

export function ResultView({result,onCopy}) {
 const {delivery}=result;
 const sources=result.sources||[];
 const output=result.output||{content:{},image_plan:[],pending_confirmation:[],source_refs:[]};
 const visibleContent=publicationContent(output.content);
 const blocked=delivery?.status==='blocked'||result.checks?.semantic_review==='blocked';
 const images=new Map(sources.filter(s=>s.kind==='image').map(s=>[s.ref,s]));
 const copy=publishText(output.content);const platform=result.input?.platform||'小红书';
 const retrieval=result.meta?.retrieval;
 const reviewStatus=result.checks?.semantic_review||'not_performed';
 const research=result.meta?.research;
 return <div className="result-view">
  {retrieval?.mode==='cached'?<div className="warning">使用此前保存的资料，未执行新检索。原始资料日期：{retrieval.source_created_at}。</div>:null}
  {retrieval?.mode==='local'?<p className="source-label">资料来源：{retrieval.archive_name||'本地知识库资料包'}{retrieval.supplements?.length?' + 华为官网补充图片':''} · 图片取自对应产品目录</p>:null}
  <p className={reviewStatus==='blocked'?'warning':'source-label'} role="status">模型辅助知识库复核：{({passed:'已通过本轮复核',blocked:'未通过，暂停交付',not_performed:'尚未执行'})[reviewStatus]||'状态未知'}。这是模型辅助检查，不代表人工审核或事实保证。</p>
  {blocked?<div className="error" role="alert">以下表达未通过核验，已暂停交付。普通待确认信息收在下方，不需要逐项补填。{result.meta?.run_id?<p>诊断编号：{result.meta.run_id}</p>:null}{(delivery?.reasons||[]).map((s,i)=><p key={i}>{s}</p>)}</div>:null}
  {!blocked?<>
   <section className="deliverable" aria-label="完整文案"><div className="deliverable-heading"><h3>完整文案</h3><button onClick={()=>onCopy(copy)}>复制文案</button></div>
    <article className={`publication-copy ${platform==='朋友圈'?'moments-copy':''}`}>
     <h4 className="copy-title">{plainCopy(output.content.title)}</h4>
     <div className="copy-story">{publicationBlocks(visibleContent.body,output.image_plan,sources).map((block,i)=>block.type==='image'?<figure className="inline-product-image" key={i}><img src={'/media/'+block.source.local_path.split('/').pop()} alt={plainCopy(block.item.caption)||block.source.title} loading="lazy"/><figcaption>{plainCopy(block.item.caption)}<small>产品资料配图 · {block.source.title}</small></figcaption></figure>:block.type==='topics'
      ?<div className="copy-topics" key={i}>{block.tags.map((tag,j)=><span key={j}>{tag}</span>)}</div>
      :block.type==='scene'?<section className="copy-scene" key={i}><h5><Emphasis text={block.heading}/></h5>{block.text?<p><Emphasis text={block.text}/></p>:null}</section>
      :<p className={i===0?'copy-intro':'copy-paragraph'} key={i}><Emphasis text={block.text}/></p>)}</div>
     {cleanReferences(visibleContent.call_to_action)?<p className="copy-invitation"><Emphasis text={cleanReferences(visibleContent.call_to_action)}/></p>:null}
    </article>

    {delivery?.status==='needs_images'?<p className="warning">{(delivery.reasons||['配图不足，请补充后使用。']).join('；')}</p>:null}
   </section>
   <button className="primary" onClick={()=>downloadText(copy,platform+'文案.txt')}>导出{platform}文案</button>
  </>:null}
  {result.image_review?<details className="supporting-details"><summary>查看配图筛选记录</summary><p>已检查文件重复、相似画面和索引角度；同角度不同配色只保留一张。</p><p>本轮选择 {result.image_review.selected?.length||0} 张，排除 {result.image_review.rejected?.length||0} 张候选。</p>{(result.image_review.warnings||[]).map((s,i)=><p className="fine" key={i}>{s}</p>)}<ul>{(result.image_review.rejected||[]).map((x,i)=><li key={i}>{x.title||x.ref}：{({'same-angle':'相同角度','visual-near-duplicate':'画面近似','exact-duplicate':'同一文件','wrong-product':'不属于当前型号'})[x.reason]||'重复候选'}</li>)}</ul><p className="fine">角度依据图片索引，近似判断依据离线图像指纹，不代表图片中的功能已经验证。</p></details>:null}
  <details className="supporting-details"><summary>查看逐段复核与证据</summary>
   {(result.review_trace||[]).length?(result.review_trace||[]).map((review,i)=><section key={i}><h3>第 {review.attempt} 轮 · {review.passed?'通过':'未通过'}</h3>{review.reused_segments?.length?<p className="fine">本轮新核验 {review.reviewed_segments?.length||0} 句；另有 {review.reused_segments.length} 句文字与使用条件未变，沿用同次生成已通过的结论，并重新检查引用原文与覆盖。</p>:null}{(review.issues||[]).map((issue,j)=><p className="warning" key={j}>{issue}</p>)}{(review.segments||[]).map(segment=><details key={segment.id}><summary>{segmentLocation(segment.location)} · {segment.text}</summary>{(review.claims||[]).filter(c=>c.segment_id===segment.id).map((claim,j)=><div key={j}><p>判定：{({supported:'有原文支持',qualified:'附条件支持',unsupported:'缺少支持',contradicted:'与原文冲突',unverified:'尚未验证',not_applicable:'无可验证产品主张'})[claim.status]||claim.status} · {claim.reason}</p>{(claim.evidence||[]).map((e,k)=><blockquote key={k}>{e.source_ref}：“{e.quote}”</blockquote>)}</div>)}</details>)}</section>):<p>本轮没有可展示的审阅记录，不能据此认定已完成知识库复核。</p>}
  </details>
  {research?<ResearchDetails research={research}/>:null}
  <details className="supporting-details"><summary>查看使用条件与资料依据{output.pending_confirmation.length?` · ${output.pending_confirmation.length} 项说明`:''}</summary>
   <h3>需求画像</h3><p className="copy-body">{output.customer_insight}</p>
   <h3>使用条件与待确认事项</h3><ul>{output.pending_confirmation.map((s,i)=><li key={i}>{s}</li>)}</ul>
   <p className="fine">{result.checks?.note}</p>
   {sources.filter(s=>output.source_refs.includes(s.ref)).map(s=><details key={s.ref}><summary>{s.ref} · {s.title}</summary><p className="copy-body">{s.text||s.path}</p></details>)}
  </details>
 </div>;
}
