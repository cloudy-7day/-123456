import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {categories} from '../shared/categories.mjs';
import {dimensions,standardVersion} from '../shared/standards.mjs';
import {samples,researchSources} from '../shared/samples.mjs';
import {api,downloadJson} from './api';
import './style.css';
import {Handoff} from './Handoff';

const kindLabel={fact:'明确说过',inference:'合理推断',unknown:'待确认'};
function SamplePicker({onSelect,disabled}){
 return <details className="sample-drawer"><summary>需要试一试？使用模拟场景</summary><p className="fine">仅供测试的改编示例，不作为客户分类，也不代替理解维度。</p><div className="sample-grid">{samples.map(s=><button disabled={disabled} className="sample" key={s.id} onClick={()=>onSelect(s)}><span><small>{s.tag}</small><strong>{s.title}</strong></span><span className="arrow">↗</span></button>)}</div></details>;
}
function Research(){
 return <details className="research-drawer"><summary>查看理解标准与帖子依据</summary><p className="fine">标准 v{standardVersion} · 从 {researchSources.length} 篇需求帖归纳。帖子仅用于理解需求，不能证明产品性能或兼容性。</p><div className="research-list">{researchSources.map(s=><article key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><p>{s.visible}</p><small>{s.level} · {s.limits}</small></article>)}</div></details>;
}
function DimensionBasis({dimension}){
 return <details className="dimension-basis"><summary>理解重点与来源</summary><p>{dimension.hint}</p><p>有相关需求时可问：{dimension.ask}</p>{dimension.sources.map(id=>{const source=researchSources.find(s=>s.id===id);return source?<a key={id} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>:null;})}</details>;
}
function DimensionOverview(){
 return <><p className="dimension-intro">输入客户的一段话，大模型会按这些维度整理需求。无需逐项填写，未提及的内容保留未知。</p><div className="dimension-overview">{dimensions.map(d=><article key={d.id}><h3>{d.name}</h3><p>{d.hint}</p><span>等待理解</span></article>)}</div></>;
}
function DimensionResults({rows,filter,edits,onEdit,onLocate}){
 return <div className="dimension-results">{dimensions.map(d=>{
  const all=rows.filter(o=>d.keys.includes(o.category));
  const items=all.filter(o=>filter==='all'||o.kind===filter);
  if(!items.length)return null;
  const known=all.filter(o=>o.kind==='fact').length,inferred=all.filter(o=>o.kind==='inference').length;
  const blocking=all.some(o=>o.critical&&o.kind!=='fact');
  return <details className={`dimension-group ${blocking?'needs-clarification':''}`} key={d.id} open={Boolean(known||inferred||blocking)}><summary><h3>{d.name}</h3><span>{blocking?'关键待确认':known||inferred?[known?`${known} 条明确`:null,inferred?`${inferred} 条推断`:null].filter(Boolean).join(' · '):'未提及'}</span></summary><DimensionBasis dimension={d}/>{items.map(item=><InsightRow key={item.id} item={item} value={edits[item.id]} onEdit={onEdit} onLocate={onLocate}/>)}</details>;
 })}</div>;
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
 const [analysis,setAnalysis]=useState(null);const [confirmed,setConfirmed]=useState(null);const [edits,setEdits]=useState({});const [answers,setAnswers]=useState({});const [filter,setFilter]=useState('all');const [busy,setBusy]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [health,setHealth]=useState(null);const [seconds,setSeconds]=useState(0);const [located,setLocated]=useState(null);const [reviewed,setReviewed]=useState(false);
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
  try{const data=await api('/api/analyze',{sources,sampleId:sample?.id||null,parentAnalysisId:analysis?.analysisId||null},controller.current.signal);setSupplements(next);setAnalysis(data);setEdits({});setAnswers({});setFilter('all');setLocated(null);setNotice('理解完成，请核对事实、推断和待确认项。');}catch(e){setError(e.name==='AbortError'?'已取消。本次输入保留，可重新理解。':e.message);}finally{setBusy(false);}
 }
 async function confirm(){
  setSaving(true);setError('');try{const request={analysisId:analysis.analysisId,edits:Object.entries(edits).filter(([,value])=>value.trim()).map(([id,value])=>({id,value}))};const data=await api('/api/confirm',request);downloadJson(data);setConfirmed(data);setNotice(data.gate.status==='paused'?'洞察已保存，产品适配判断保持暂停。':'洞察已确认保存，可交给后续 ima 核验。');}catch(e){setError(e.message);}finally{setSaving(false);}
 }
 const rows=analysis?.understanding.observations||[];
 return <>
 <header><div className="brand"><span className="brand-symbol">听</span><div>华为 PC 营销助手<small>客户需求理解</small></div></div><div className="connection"><i className={health?.configured?'connected':''}/>{health===null?'检查服务':health.configured?'DeepSeek 已配置':'DeepSeek 未配置'}</div></header>
 <main>
  <div className="intro"><div><h1>从客户原话，看清选购重点。</h1><p>依据帖子调研形成的理解标准，整理需求、保留未知，再确认真正值得追问的问题。</p></div><span className="standard-version">{researchSources.length} 篇需求帖 · {dimensions.length} 个理解维度</span></div>
  <div className="workspace">
   <section className="input-panel" ref={sourceRef}>
    <div className="panel-title"><h2>客户原话</h2><span>自由输入 / 粘贴场景卡</span></div>
    <label htmlFor="scenario">说说客户的日常、任务和困扰</label>
    <textarea ref={inputRef} id="scenario" className="scenario" maxLength={8000} disabled={busy} value={text} onChange={e=>{setText(e.target.value);setReviewed(false);}} placeholder={'例如：经常出差，用 WPS 处理几万行表格。想轻一点，最好少带充电器，还希望能和已有平板一起用。预算没定。'}/>
    <div className="input-bottom"><span>自然描述即可，无需逐项填表</span><span>{text.length} / 8000</span></div>
    <label htmlFor="product">想了解的产品 <small>可留空</small></label>
    <input id="product" maxLength={200} disabled={busy} value={product} onChange={e=>{setProduct(e.target.value);setReviewed(false);}} placeholder="客户明确提及的候选品牌或型号"/>
    {sample?<details className="provenance"><summary>{sample.label}</summary><p><strong>源帖依据：</strong>{sample.basis}</p><p><strong>测试改编：</strong>{sample.fiction}</p><a href={researchSources.find(s=>s.id===sample.sourceId)?.url} target="_blank" rel="noreferrer">查看源帖 ↗</a></details>:null}
    {supplements.length?<details className="provenance"><summary>已纳入理解的 {supplements.length} 次补充</summary>{supplements.map(s=><p key={s.id}>{s.text}</p>)}<button className="text-button" disabled={busy} onClick={()=>{setSupplements([]);setReviewed(false);}}>清除补充，重新理解</button></details>:null}
    {located?<div className="located"><strong>已定位输入依据 · {located.sourceId}</strong><p>“{located.quote}”</p><small>字符 {located.start}–{located.end}；区间末尾不含在内</small></div>:null}
    <div className="analyze-actions"><button className="primary" disabled={!text.trim()||busy||!health?.configured} onClick={analyze}>{busy?<><span className="spinner"/> 正在理解 · {seconds}s</>:analysis?'重新理解场景 ↗':'开始理解场景 ↗'}</button>{busy?<button className="text-button" onClick={()=>controller.current?.abort()}>取消</button>:null}</div>
    <p className="privacy">场景将发送给 DeepSeek。请省略姓名、电话等无关个人信息。</p>
    <p className="analysis-rule">只追问会改变适配判断的关键条件，每轮最多 3 个；其他缺失可以留白。</p>
    <SamplePicker onSelect={selectSample} disabled={busy}/>
    <Research/>
   </section>
   <section className="output-panel">
    <div className="panel-title"><h2>按理解维度核对需求</h2><span>{analysis?`${rows.length} 条观察`:`${dimensions.length} 个维度`}</span></div>
    <div role="status" aria-live="polite">{busy?<div className="status-banner">正在按理解标准提取需求、校对原文依据。最多等待约 55 秒。</div>:null}{notice?<div className="notice">{notice}</div>:null}</div>
    {error?<div role="alert" className="error">{error}</div>:null}
    {stale?<div className="warning">输入已变化，以下是旧版本。请重新理解后确认。</div>:null}
    {!analysis?<DimensionOverview/>:<>
     <div className="result-summary"><strong>产品意向：{analysis.understanding.product.name||'暂未指定'}</strong><span>{analysis.understanding.product.status==='ambiguous'?'存在歧义，需确认':'意向不代表适配'}</span></div>
     <Questions analysis={analysis} answers={answers} onAnswer={(id,v)=>{setAnswers(a=>({...a,[id]:v}));setReviewed(false);}} onLocate={locate}/>
     <div className="filters" role="group" aria-label="筛选洞察">{[['all','全部'],...Object.entries(kindLabel)].map(([key,label])=><button key={key} className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}<small>{key==='all'?rows.length:rows.filter(o=>o.kind===key).length}</small></button>)}</div>
     <p className="edit-hint">每个维度保留原话、推断和未知。点击内容可更正；明确说过仅代表输入陈述。</p>
     <DimensionResults rows={rows} filter={filter} edits={edits} onEdit={(id,v)=>{setEdits(old=>({...old,[id]:v}));setReviewed(false);}} onLocate={locate}/>
     <div className="handoff"><strong>{analysis.gate.reasons.length>1?'洞察可保存 · 产品适配暂缓':'确认后交给后续核验'}</strong><p>关键条件未确认时保留暂停。产品价格、规格和兼容性仍需 ima 核验；确认后可在下方接入检索与生成。</p>
      {dirty?<div className="warning">修订尚未纳入模型理解，请先“重新理解场景”。</div>:null}
      <label className="checkbox"><input type="checkbox" checked={reviewed} disabled={dirty||stale||busy} onChange={e=>setReviewed(e.target.checked)}/>我已核对本轮洞察，接受保留的未知与适配暂停</label>
      <button className="primary" disabled={!reviewed||dirty||stale||busy||saving} onClick={confirm}>{saving?'正在保存…':'确认并保存洞察 ↓'}</button>
      <small className="call-proof">真实调用 · {analysis.call.model} · {(analysis.call.durationMs/1000).toFixed(1)}s · {analysis.call.attempts} 次尝试</small>
     </div>
    </>}
   </section>
  </div>
  {confirmed&&!stale&&!dirty&&reviewed?<Handoff key={confirmed.analysisId} analysis={confirmed}/>:null}
 </main>
 <footer><span>客户原话 → 按维度理解 → 人工确认</span><span>理解标准 v{standardVersion} · 帖子依据可追溯</span></footer>
 </>;
}
createRoot(document.getElementById('root')).render(<App/>);
