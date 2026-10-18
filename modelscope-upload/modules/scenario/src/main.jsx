import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {categories} from '../shared/categories.mjs';
import {samples} from '../shared/samples.mjs';
import {api} from './api';
import {sceneOptions,channelOptions} from '../shared/experience.mjs';
import './style.css';
import {Handoff} from './Handoff';
import {RecentResults} from './RecentResults';

const kindLabel={fact:'明确说过',inference:'合理推断',unknown:'待确认'};
function SourceEvidence({evidence,onLocate}){return evidence.length?<div className="evidence">{evidence.map((e,i)=><button key={i} title="在左侧定位原文" onClick={()=>onLocate(e)}>“{e.quote}” <span>↖ 原文</span></button>)}</div>:<p className="no-evidence">输入未提供 · 保留未知</p>;}
function InsightRow({item,value,onEdit,onLocate}){
 return <article className={`insight ${item.kind}`}><div className="insight-head"><strong>{categories[item.category]}</strong><span className={`badge ${item.kind}`}>{kindLabel[item.kind]}</span>{item.critical?<small>影响适配</small>:null}</div><label className="sr-only" htmlFor={`edit-${item.id}`}>修改{categories[item.category]} {item.id}</label><textarea id={`edit-${item.id}`} rows={Math.max(1,Math.ceil((value??item.value??'').length/35))} value={value??item.value??''} placeholder="未知，可补充客户确认的信息" onChange={e=>onEdit(item.id,e.target.value)}/>{item.rationale?<p className="rationale">{item.rationale}</p>:null}<SourceEvidence evidence={item.evidence} onLocate={onLocate}/></article>;
}
function Questions({analysis,answers,onAnswer,onLocate}){
 const [optional,setOptional]=useState(false);const questions=analysis.understanding.questions;
 return <section className="questions"><div className="section-line"><h3>值得再问一句</h3><span>{questions.filter(q=>q.priority==='blocking').length} 个关键问题</span></div>{analysis.understanding.conflicts.map((c,i)=><div className="conflict" key={i}><strong>记录有冲突</strong><p>{c.description}</p><SourceEvidence evidence={c.evidence} onLocate={onLocate}/>{!questions.length?<label>{c.resolutionQuestion}<input value={answers[`conflict_${i}`]||''} onChange={e=>onAnswer(`conflict_${i}`,e.target.value)} placeholder="写下客户确认，以此为准"/></label>:null}</div>)}{questions.filter(q=>q.priority==='blocking'||optional).map(q=><div className="question" key={q.id}><label htmlFor={`q-${q.id}`}>{q.question}<span>{q.priority==='blocking'?'关键':'可稍后'}</span></label><p>为什么问：{q.why}</p><input id={`q-${q.id}`} value={answers[q.id]||''} onChange={e=>onAnswer(q.id,e.target.value)} placeholder="暂时问不到可以留空；保存后仍暂停适配"/></div>)}{questions.some(q=>q.priority==='optional')?<button className="text-button" onClick={()=>setOptional(!optional)}>{optional?'收起':'查看'}非关键补充</button>:null}{!questions.length&&!analysis.understanding.conflicts.length?<p className="fine">本轮没有必须追问的问题。未提供的信息仍保留未知。</p>:null}</section>;
}
function App(){
 const [generating,setGenerating]=useState(false);
 const [scene,setScene]=useState('campus');const [channel,setChannel]=useState('xiaohongshu');const [text,setText]=useState('');const [sample,setSample]=useState(null);const [supplements,setSupplements]=useState([]);
 const [analysis,setAnalysis]=useState(null);const [confirmed,setConfirmed]=useState(null);const [edits,setEdits]=useState({});const [answers,setAnswers]=useState({});const [filter,setFilter]=useState('all');const [busy,setBusy]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [health,setHealth]=useState(null);const [seconds,setSeconds]=useState(0);const [located,setLocated]=useState(null);const [reviewed,setReviewed]=useState(false);
 const controller=useRef(null);const inputRef=useRef(null);const sourceRef=useRef(null);
 useEffect(()=>{fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({configured:false}));return()=>controller.current?.abort();},[]);
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[busy]);
 const inputSources=[{id:'scenario',type:'scenario',text:text.trim()},...supplements];
 const stale=Boolean(analysis)&&JSON.stringify(analysis.input.sources)!==JSON.stringify(inputSources);
 const dirty=Object.keys(edits).length>0||Object.values(answers).some(v=>v.trim());
 function selectSample(s){setConfirmed(null);setText(s.text+(s.product&&!s.text.includes(s.product)?'\n关注产品：'+s.product:''));setSample(s);setSupplements([]);setAnalysis(null);setEdits({});setAnswers({});setError('');setNotice('');setReviewed(false);}
 function locate(e){setLocated(e);sourceRef.current?.scrollIntoView({behavior:'smooth',block:'center'});if(e.sourceId==='scenario'){inputRef.current?.focus();inputRef.current?.setSelectionRange(e.start,e.end);}}
 async function analyze(){
  setConfirmed(null);
  setError('');setNotice('');setSeconds(0);setBusy(true);setReviewed(false);controller.current=new AbortController();
  let next=[...supplements];
  const correction=Object.entries(edits).map(([id,value])=>{const o=analysis?.understanding.observations.find(o=>o.id===id);return o?`${categories[o.category]}更正，以此为准：${value.trim()||'此前判断撤回，目前未知'}`:'';}).filter(Boolean);
  Object.entries(answers).filter(([,v])=>v.trim()).forEach(([id,value])=>{const q=analysis?.understanding.questions.find(q=>q.id===id)?.question||analysis?.understanding.conflicts[Number(id.split('_')[1])]?.resolutionQuestion||'确认';correction.push(`针对“${q}”的客户补充，以此为准：${value}`);});
  if(correction.length)next.push({id:`revision_${Date.now()}`,type:'revision',text:correction.join('\n')});
  const sources=[{id:'scenario',type:'scenario',text:text.trim()},...next];
  try{const data=await api('/api/analyze',{sources,sampleId:sample?.id||null,parentAnalysisId:analysis?.analysisId||null},controller.current.signal);setSupplements(next);setAnalysis(data);setEdits({});setAnswers({});setFilter('all');setLocated(null);setNotice('理解完成，请核对事实、推断和待确认项。');}catch(e){setError(e.name==='AbortError'?'已取消。本次输入保留，可重新理解。':e.message);}finally{setBusy(false);}
 }
 async function confirm(){
  setSaving(true);setError('');try{const request={analysisId:analysis.analysisId,edits:Object.entries(edits).filter(([,value])=>value.trim()).map(([id,value])=>({id,value}))};const data=await api('/api/confirm',request);setConfirmed(data);setNotice(data.gate.status==='paused'?'洞察已保存，产品适配判断保持暂停。':'需求已确认，可以生成文案与店员脚本。');}catch(e){setError(e.message);}finally{setSaving(false);}
 }
 const rows=analysis?.understanding.observations||[];const visibleRows=rows.filter(o=>filter==='all'||o.kind===filter);
 const selectedScene=sceneOptions.find(s=>s.id===scene),selectedChannel=channelOptions.find(c=>c.id===channel);
 const critical=analysis?.gate.reasons.filter(r=>r!=='洞察尚未人工确认')||[];
 const facts=rows.filter(o=>o.kind==='fact').slice(0,3);
 return <><header><div className="brand"><span className="brand-symbol">华</span><div>门店增长助手<small>从客户场景，到文案与到店演示</small></div></div><span className="connection">{health?.configured?'服务已就绪':'检查模型配置'}</span></header>
 <main className="focused-main"><div className="intro"><div><h1>把产品亮点，讲进客户的生活。</h1><p>描述完整场景，自动提取需求，生成可用的文案与店员演示脚本。</p></div></div>
 {health?.retrievalMode==='cached'?<div className="warning">当前使用此前保存的资料，未执行新检索。</div>:null}
 <fieldset className="scenario-inputs" disabled={generating||busy||saving} aria-label="场景输入与确认">
 <section className="input-panel complete-input" ref={sourceRef}>
 <div className="selection-row"><div><h2>客户场景</h2><div className="choice-tabs" role="tablist" aria-label="客户场景">{sceneOptions.map(s=><button role="tab" key={s.id} aria-selected={scene===s.id} disabled={!s.enabled} title={s.enabled?s.label:'后续开放'} onClick={()=>setScene(s.id)}>{s.label}{!s.enabled?<small>待开放</small>:null}</button>)}</div></div><div><h2>发布渠道</h2><div className="choice-tabs" role="tablist" aria-label="发布渠道">{channelOptions.map(c=><button role="tab" key={c.id} aria-selected={channel===c.id} disabled={!c.enabled} title={c.enabled?c.label:'后续开放'} onClick={()=>setChannel(c.id)}>{c.label}{!c.enabled?<small>待开放</small>:null}</button>)}</div></div></div>
 <label htmlFor="scenario">完整场景描述</label><textarea ref={inputRef} id="scenario" className="scenario" maxLength={1800} value={text} onChange={e=>{setText(e.target.value);setSupplements([]);setEdits({});setAnswers({});setConfirmed(null);setReviewed(false);}} placeholder="把客户的完整需求粘贴到这里，例如学习任务、使用地点、关注的产品和顾虑。系统会自动提取维度，没提到的信息保留未知。"/>
 <div className="input-bottom"><span>只需一段完整描述，无需逐项填写维度</span><span>{text.length} / 1800</span></div>
 <details className="provenance"><summary>需要输入示例？</summary><button className="text-button" onClick={()=>selectSample(samples[0])}>填入校园学习模拟场景</button><p>示例仅用于试用，填入后可直接修改。</p>{sample?<p>{sample.label}；{sample.fiction}</p>:null}</details>
 {supplements.length?<details className="provenance"><summary>已纳入 {supplements.length} 次补充</summary>{supplements.map(s=><p key={s.id}>{s.text}</p>)}</details>:null}
 {located?<p className="fine">已定位原文：“{located.quote}”</p>:null}
 <div className="analyze-actions"><button className="primary" disabled={!text.trim()||!health?.configured} onClick={analyze}>{busy?`正在理解 · ${seconds}s`:analysis?'重新理解完整输入':'理解完整输入'}</button></div>
 <p className="privacy">场景将发送给 DeepSeek，请省略无关个人信息。场景标签用于组织内容，不会据此补造客户事实。</p>
 </section>
 <div role="status" aria-live="polite">{notice?<p className="notice">{notice}</p>:null}</div>{error?<div role="alert" className="error">{error}</div>:null}{stale?<div className="warning">输入已修改，请重新理解后生成。</div>:null}
 {analysis?<section className="understanding-panel">
 <details id="understanding" key={analysis.analysisId} open={critical.length>0?true:undefined}>
 <summary><strong>理解与确认</strong><span>{rows.length} 条提取结果 · 点击展开或收起</span></summary>
 <p className="fine">以下是需求提取摘要与原文依据，可按需修改。</p>
 <Questions analysis={analysis} answers={answers} onAnswer={(id,v)=>{setAnswers(a=>({...a,[id]:v}));setReviewed(false);}} onLocate={locate}/>
 <div className="filters" role="group" aria-label="筛选洞察">{[['all','全部'],...Object.entries(kindLabel)].map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>
 <div className="insight-list">{visibleRows.map(item=><InsightRow key={item.id} item={item} value={edits[item.id]} onEdit={(id,v)=>{setEdits(old=>({...old,[id]:v}));setReviewed(false);}} onLocate={locate}/>)}</div>
 </details>
 <div className="understanding-brief"><p><strong>已提取：</strong>{facts.map(o=>o.value).join('；')||'暂无可确认的客户事实。'}</p><p><strong>产品意向：</strong>{analysis.understanding.product.name||'输入未指定，可在下一步选择检索产品。'}</p></div>
 {critical.length?<div className="warning">请先展开并补充关键条件：{critical.join('；')}</div>:null}
 {dirty?<div className="warning">更正尚未纳入理解，请先重新理解完整输入。</div>:null}
 <div className="compact-confirm"><label className="checkbox"><input type="checkbox" checked={reviewed} disabled={dirty||stale} onChange={e=>setReviewed(e.target.checked)}/>我已确认提取摘要，可继续生成</label><button className="primary" disabled={!reviewed||dirty||stale} onClick={confirm}>{saving?'确认中…':confirmed?'已确认，可继续生成':'确认理解并继续'}</button></div>
 </section>:null}</fieldset>
 {confirmed&&!stale&&!dirty&&reviewed?<Handoff key={confirmed.analysisId+scene+channel} analysis={confirmed} sceneLabel={selectedScene.label} platform={selectedChannel.label} onGeneratingChange={setGenerating}/>:null}
 <RecentResults/>
 </main><footer><span>完整输入 → 理解摘要 → 文案与店员脚本</span><span>资料有据 · 使用前核对</span></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
