import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {categories} from '../shared/categories.mjs';
import {samples,researchSources} from '../shared/samples.mjs';
import {api,downloadJson} from './api';
import './style.css';
import {Handoff} from './Handoff';

const kindLabel={fact:'明确说过',inference:'合理推断',unknown:'待确认'};
function SamplePicker({onSelect,disabled}){
 return <details className="sample-drawer"><summary>需要试一试？使用模拟场景</summary><p className="fine">仅供测试的改编示例，不作为客户分类，也不代替理解维度。</p><div className="sample-grid">{samples.map(s=><button disabled={disabled} className="sample" key={s.id} onClick={()=>onSelect(s)}><span><small>{s.tag}</small><strong>{s.title}</strong></span><span className="arrow">↗</span></button>)}</div></details>;
}
function ReviewDialog({analysis,edits,onEdit,onLocate,onClose}){
 const dialog=useRef(null);const [filter,setFilter]=useState('all');
 useEffect(()=>{const node=dialog.current;node.showModal();return()=>node.close();},[]);
 const rows=analysis.understanding.observations;
 return <dialog className="review-dialog" ref={dialog} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}><div className="review-dialog-head"><h2>核对客户需求</h2><button className="text-button" onClick={onClose} aria-label="关闭需求核对">关闭 ×</button></div><div className="review-dialog-body"><p className="fine">核对原话与推断。更正后需要重新整理需求，未提供的信息可以留白。</p><div className="filters" role="group" aria-label="筛选洞察">{[['all','全部'],...Object.entries(kindLabel)].map(([key,label])=><button key={key} className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}<small>{key==='all'?rows.length:rows.filter(o=>o.kind===key).length}</small></button>)}</div>{rows.filter(o=>filter==='all'||o.kind===filter).map(item=><InsightRow key={item.id} item={item} value={edits[item.id]} onEdit={onEdit} onLocate={e=>{onClose();onLocate(e);}}/>)}</div><div className="review-dialog-foot"><button className="text-button" onClick={()=>downloadJson(analysis)}>导出需求记录</button><button className="primary" onClick={onClose}>返回工作台</button></div></dialog>;
}
function SourceEvidence({evidence,onLocate}){return evidence.length?<div className="evidence">{evidence.map((e,i)=><button key={i} title="在左侧定位原文" onClick={()=>onLocate(e)}>“{e.quote}” <span>↖ 原文</span></button>)}</div>:<p className="no-evidence">输入未提供 · 保留未知</p>;}
function InsightRow({item,value,onEdit,onLocate}){
 return <article className={`insight ${item.kind}`}><div className="insight-head"><strong>{categories[item.category]}</strong><span className={`badge ${item.kind}`}>{kindLabel[item.kind]}</span>{item.critical?<small>影响适配</small>:null}</div><label className="sr-only" htmlFor={`edit-${item.id}`}>修改{categories[item.category]} {item.id}</label><textarea id={`edit-${item.id}`} rows={Math.max(1,Math.ceil((value??item.value??'').length/35))} value={value??item.value??''} placeholder="未知，可补充客户确认的信息" onChange={e=>onEdit(item.id,e.target.value)}/>{item.rationale?<p className="rationale">{item.rationale}</p>:null}<SourceEvidence evidence={item.evidence} onLocate={onLocate}/></article>;
}
function Questions({analysis,answers,onAnswer,onLocate}){
 const [optional,setOptional]=useState(false);const questions=analysis.understanding.questions;
 return <section className="questions"><div className="section-line"><h3>值得再问一句</h3><span>{questions.filter(q=>q.priority==='blocking').length} 个关键问题</span></div>{analysis.understanding.conflicts.map((c,i)=><div className="conflict" key={i}><strong>记录有冲突</strong><p>{c.description}</p><SourceEvidence evidence={c.evidence} onLocate={onLocate}/>{!questions.length?<label>{c.resolutionQuestion}<input value={answers[`conflict_${i}`]||''} onChange={e=>onAnswer(`conflict_${i}`,e.target.value)} placeholder="写下客户确认，以此为准"/></label>:null}</div>)}{questions.filter(q=>q.priority==='blocking'||optional).map(q=><div className="question" key={q.id}><label htmlFor={`q-${q.id}`}>{q.question}<span>{q.priority==='blocking'?'关键':'可稍后'}</span></label><p>为什么问：{q.why}</p><input id={`q-${q.id}`} value={answers[q.id]||''} onChange={e=>onAnswer(q.id,e.target.value)} placeholder="暂时问不到可以留空；保存后仍暂停适配"/></div>)}{questions.some(q=>q.priority==='optional')?<button className="text-button" onClick={()=>setOptional(!optional)}>{optional?'收起':'查看'}非关键补充</button>:null}{!questions.length&&!analysis.understanding.conflicts.length?<p className="fine">本轮没有必须追问的问题。未提供的信息仍保留未知。</p>:null}</section>;
}
function App(){
 const [text,setText]=useState('');const [product,setProduct]=useState('');const [sample,setSample]=useState(null);const [supplements,setSupplements]=useState([]);
 const [reviewOpen,setReviewOpen]=useState(false);const [analysis,setAnalysis]=useState(null);const [confirmed,setConfirmed]=useState(null);const [edits,setEdits]=useState({});const [answers,setAnswers]=useState({});const [busy,setBusy]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [health,setHealth]=useState(null);const [seconds,setSeconds]=useState(0);const [located,setLocated]=useState(null);const [reviewed,setReviewed]=useState(false);
 const controller=useRef(null);const inputRef=useRef(null);const sourceRef=useRef(null);
 useEffect(()=>{fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({configured:false}));return()=>controller.current?.abort();},[]);
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[busy]);
 const inputSources=[{id:'scenario',type:'scenario',text:text.trim()},...(product.trim()?[{id:'product',type:'product',text:`指定产品：${product.trim()}`}]:[]),...supplements];
 const stale=Boolean(analysis)&&JSON.stringify(analysis.input.sources)!==JSON.stringify(inputSources);
 const dirty=Object.keys(edits).length>0||Object.values(answers).some(v=>v.trim());
 function selectSample(s){setConfirmed(null);setText(s.text);setProduct(s.product);setSample(s);setSupplements([]);setAnalysis(null);setEdits({});setAnswers({});setError('');setNotice('');setReviewed(false);}
 function locate(e){setLocated(e);sourceRef.current?.scrollIntoView({behavior:'smooth',block:'center'});if(e.sourceId==='scenario'){inputRef.current?.focus();inputRef.current?.setSelectionRange(e.start,e.end);}}
 async function analyze(){
  setConfirmed(null);
  setError('');setNotice('');setSeconds(0);setBusy(true);setReviewed(false);controller.current=new AbortController();
  let next=[...supplements];
  const correction=Object.entries(edits).map(([id,value])=>{const o=analysis?.understanding.observations.find(o=>o.id===id);return o?`${categories[o.category]}更正，以此为准：${value.trim()||'此前判断撤回，目前未知'}`:'';}).filter(Boolean);
  Object.entries(answers).filter(([,v])=>v.trim()).forEach(([id,value])=>{const q=analysis?.understanding.questions.find(q=>q.id===id)?.question||analysis?.understanding.conflicts[Number(id.split('_')[1])]?.resolutionQuestion||'确认';correction.push(`针对“${q}”的客户补充，以此为准：${value}`);});
  if(correction.length)next.push({id:`revision_${Date.now()}`,type:'revision',text:correction.join('\n')});
  const sources=[{id:'scenario',type:'scenario',text:text.trim()},...(product.trim()?[{id:'product',type:'product',text:`指定产品：${product.trim()}`}]:[]),...next];
  try{const data=await api('/api/analyze',{sources,sampleId:sample?.id||null,parentAnalysisId:analysis?.analysisId||null},controller.current.signal);setSupplements(next);setAnalysis(data);setEdits({});setAnswers({});setLocated(null);setNotice('需求已整理，请核对后继续。');}catch(e){setError(e.name==='AbortError'?'已取消。本次输入保留，可重新理解。':e.message);}finally{setBusy(false);}
 }
 async function confirm(){
  setSaving(true);setError('');try{const request={analysisId:analysis.analysisId,edits:Object.entries(edits).filter(([,value])=>value.trim()).map(([id,value])=>({id,value}))};const data=await api('/api/confirm',request);setAnalysis(data);setConfirmed(data);setNotice(data.gate.status==='paused'?'洞察已保存，产品适配判断保持暂停。':'洞察已确认保存，可交给后续 ima 核验。');}catch(e){setError(e.message);}finally{setSaving(false);}
 }
 const rows=analysis?.understanding.observations||[];
 const essential=rows.filter(o=>o.kind==='fact'&&['task','pain','constraint','software','os','performance','collaboration','mobility','budget','product'].includes(o.category));
 const summary=[...new Set(essential.map(o=>o.value))].slice(0,4);
 const hasQuestions=Boolean(analysis?.understanding.questions.length||analysis?.understanding.conflicts.length);
 const ready=Boolean(confirmed&&!stale&&!dirty&&reviewed&&confirmed.gate.status==='ready_for_ima');
 return <>
 <header><div className="brand"><span className="brand-symbol">听</span><div>华为 PC 营销助手<small>营销工作台</small></div></div><div className="connection"><i className={health?.configured?'connected':''}/>{health===null?'检查服务':health.configured?'AI 服务已就绪':'AI 服务未配置'}</div></header>
 <main className="console-main">
  <div className="intro"><div><h1>从客户的日常，开始一份方案。</h1><p>描述使用场景，确认关键需求，再生成有资料依据的内容。</p></div></div>
  <div className="workspace console-workspace">
   <section className="input-panel" ref={sourceRef}>
    <div className="panel-title"><h2>客户场景</h2><span>自由输入 / 粘贴场景卡</span></div>
    <label htmlFor="scenario">客户平时做什么，现在有什么困扰？</label>
    <textarea ref={inputRef} id="scenario" className="scenario" maxLength={8000} disabled={busy} value={text} onChange={e=>{setText(e.target.value);setReviewed(false);}} placeholder={'例如：经常出差，要处理很多表格。想轻一点，最好少带充电器，还想和已有平板一起用。'}/>
    <div className="input-bottom"><span>按自然习惯描述即可</span><span>{text.length} / 8000</span></div>
    <label htmlFor="product">想了解的产品 <small>可留空</small></label>
    <input id="product" maxLength={200} disabled={busy} value={product} onChange={e=>{setProduct(e.target.value);setReviewed(false);}} placeholder="客户提及的候选品牌或型号"/>
    {sample?<details className="provenance"><summary>模拟场景 · 改编说明</summary><p>{sample.basis}</p><p>测试改编：{sample.fiction}</p><a href={researchSources.find(s=>s.id===sample.sourceId)?.url} target="_blank" rel="noreferrer">查看源帖 ↗</a></details>:null}
    {supplements.length?<details className="provenance"><summary>已纳入的 {supplements.length} 次补充</summary>{supplements.map(s=><p key={s.id}>{s.text}</p>)}<button className="text-button" disabled={busy} onClick={()=>{setSupplements([]);setReviewed(false);}}>清除补充</button></details>:null}
    {located?<div className="located"><strong>客户原话</strong><p>“{located.quote}”</p></div>:null}
    <div className="analyze-actions"><button className="primary" disabled={!text.trim()||busy||!health?.configured} onClick={analyze}>{busy?<><span className="spinner"/> 正在整理 · {seconds}s</>:analysis?'重新整理需求 ↗':'整理客户需求 ↗'}</button>{busy?<button className="text-button" onClick={()=>controller.current?.abort()}>取消</button>:null}</div>
    <p className="privacy">场景将发送给 DeepSeek。请省略姓名、电话等无关个人信息。</p>
    <div role="status" aria-live="polite">{busy?<div className="status-banner">正在整理客户需求…</div>:null}{notice?<div className="notice">{notice}</div>:null}</div>
    {error?<div role="alert" className="error">{error}</div>:null}
    {stale?<div className="warning">场景已修改，请重新整理后继续。</div>:null}
    {analysis?<div className="input-review">
     <div className="section-line"><h3>本次需求</h3><button className="text-button" onClick={()=>setReviewOpen(true)}>核对需求 ↗</button></div>
     {summary.length?<ul className="brief-needs">{summary.map(item=><li key={item}>{item}</li>)}</ul>:<p className="fine">已整理输入，请核对关键要求。</p>}
     {hasQuestions?<Questions analysis={analysis} answers={answers} onAnswer={(id,v)=>{setAnswers(a=>({...a,[id]:v}));setReviewed(false);}} onLocate={locate}/>:null}
     {dirty?<div className="warning">补充内容尚未纳入，请点击“重新整理需求”。</div>:null}
     <label className="checkbox"><input type="checkbox" checked={reviewed} disabled={dirty||stale||busy} onChange={e=>setReviewed(e.target.checked)}/>我已核对需求，接受保留的待确认项</label>
     <button className="primary" disabled={!reviewed||dirty||stale||busy||saving} onClick={confirm}>{saving?'正在确认…':analysis.gate.reasons.length>1?'保存本次需求':'确认需求，继续'}</button>
     <p className="fine">关键条件暂未确认时，可以保存需求，产品适配保持暂停。</p>
    </div>:<SamplePicker onSelect={selectSample} disabled={busy}/>}
   </section>
   <section className="output-panel console-output">
    {ready?<Handoff key={confirmed.analysisId} analysis={confirmed}/>:<>
     <div className="panel-title"><h2>营销方案</h2><span>{confirmed?'等待补充':'等待客户场景'}</span></div>
     <div className="console-empty"><div className="empty-lines" aria-hidden="true"><i/><i/><i/></div><h3>{confirmed?'先确认关键条件，再继续':'把客户的需求，变成一次到店邀请。'}</h3><p>{confirmed?'需求已保存。补充左侧的关键问题并重新整理后，再检索产品资料。':'确认客户场景后，在这里检索产品资料，生成内容和到店演示建议。'}</p><div className="planned-channels"><span>小红书</span><span>公众号</span><span>朋友圈</span></div></div>
    </>}
   </section>
  </div>
 </main>
 <footer><span>从客户场景，到内容与到店体验</span><span>华为 PC 营销助手</span></footer>
 {reviewOpen&&analysis?<ReviewDialog analysis={analysis} edits={edits} onEdit={(id,v)=>{setEdits(old=>({...old,[id]:v}));setReviewed(false);}} onLocate={locate} onClose={()=>setReviewOpen(false)}/>:null}
 </>;
}
createRoot(document.getElementById('root')).render(<App/>);
