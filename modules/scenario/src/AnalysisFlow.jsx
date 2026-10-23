import React,{useEffect,useState} from 'react';

// Show extracted conclusions and actual retrieval events, not invented reasoning.
export function AnalysisFlow({card,match,retrieval,progress,working,onPresented}){
 const [visible,setVisible]=useState(0);
 useEffect(()=>{
  setVisible(0);if(!card)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setVisible(4);onPresented();return;}
  const timers=[1,2,3,4].map(n=>setTimeout(()=>{setVisible(n);if(n===4)onPresented();},n*550));
  return()=>timers.forEach(clearTimeout);
 },[card?.analysis_id,onPresented]);
 const rows=[
  {title:'识别人群与业务场景',text:card?`${card.identity.value} · ${card.business_scene?.value||card.title}`:'正在从完整描述中提取身份与任务'},
  {title:'整理任务与主要问题',text:card?.problem.value,detail:card?.tasks.map(x=>x.scene_label||x.value).join(' → ')},
  {title:'确定内容切入与发布方式',text:card?`${card.platform.value} · ${card.goal.value}`:'',detail:card?.buying_stage.kind==='unknown'?'购买阶段未说明，保留未知。':card?.buying_stage.value},
  {title:'匹配产品与资料依据',text:match?.product||(working?'正在匹配候选产品':'生成时按需求匹配产品，也可在更多设置中指定型号'),detail:match?.reason},
 ];
 return <section className="analysis-flow" aria-label="分析流程">
  <div className="analysis-flow-heading"><span className={working?'analysis-pulse':'analysis-dot'}/><div><h2>{working?'正在形成这次图文的依据':'这次图文的分析依据'}</h2><p role="status" aria-live="polite">{progress||'先呈现已提取的需求，再生成图文。'}</p></div></div>
  <ol>{rows.map((row,i)=><li key={row.title} className={i<visible?'revealed':'waiting'}><span className="flow-number">{String(i+1).padStart(2,'0')}</span><div><h3>{row.title}</h3>{i<visible?<><p>{row.text}</p>{row.detail?<p className="flow-detail">{row.detail}</p>:null}</>:<p className="flow-detail">{card?'等待展示已整理的结果':'等待需求提取结果'}</p>}</div></li>)}</ol>
  {retrieval?<details className="retrieval-summary"><summary>已检索 {retrieval.documents} 份产品资料、{retrieval.images} 张图片 · {retrieval.context?.results?.length||0} 条场景参考</summary><p>产品能力只使用当前型号原文。场景、问答和表达资料仅供写作参考。</p>{retrieval.context?.results?.map(x=><article key={x.id}><strong>{x.title} · {x.section}</strong><p>{x.content}</p><small>{x.source_path}</small></article>)}<p className="fine">检索方式：{retrieval.context?.mode||'完整产品资料'}；{retrieval.context?.stats?.documents||0} 份文档 / {retrieval.context?.stats?.chunks||0} 个片段。</p></details>:null}
 </section>;
}
