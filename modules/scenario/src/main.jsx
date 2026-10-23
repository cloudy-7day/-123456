import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {categories} from '../shared/categories.mjs';
import {ExamplePicker,commuteExample} from './ExamplePicker';
import {api} from './api';
import {sceneOptions,channelOptions} from '../shared/experience.mjs';
import './style.css';
import {Handoff} from './Handoff';
import {RecentResults} from './RecentResults';
import './store-design.css';

const kindLabel={fact:'明确说过',inference:'合理推断',unknown:'待确认'};
const storeSupportOptions=[
 {id:'selection_guidance',label:'仅整理选购要点',detail:'默认选项，不附加门店服务承诺'},
 {id:'software_check',label:'核对软件 / 版本',detail:'邀请客户提供软件名与版本，再协助核对'},
 {id:'in_store_demo',label:'到店试机',detail:'确认门店能提供体验后再选择'},
];
function SourceEvidence({evidence,onLocate}){return evidence.length?<div className="evidence">{evidence.map((e,i)=><button key={i} title="在左侧定位原文" onClick={()=>onLocate(e)}>“{e.quote}” <span>↖ 原文</span></button>)}</div>:<p className="no-evidence">输入未提供 · 保留未知</p>;}
function InsightRow({item,value,onEdit,onLocate,disabled=false}){
 return <article className={`insight ${item.kind}`}><div className="insight-head"><strong>{categories[item.category]}</strong><span className={`badge ${item.kind}`}>{kindLabel[item.kind]}</span>{item.critical?<small>影响适配</small>:null}</div><label className="sr-only" htmlFor={`edit-${item.id}`}>修改{categories[item.category]} {item.id}</label><textarea id={`edit-${item.id}`} rows={Math.max(1,Math.ceil((value??item.value??'').length/35))} value={value??item.value??''} disabled={disabled} placeholder="未知，可补充客户确认的信息" onChange={e=>onEdit(item.id,e.target.value)}/>{item.rationale?<p className="rationale">{item.rationale}</p>:null}<SourceEvidence evidence={item.evidence} onLocate={onLocate}/></article>;
}
function Questions({analysis,answers,onAnswer,onLocate,disabled=false}){
 const [optional,setOptional]=useState(false);const questions=analysis.understanding.questions;
 return <section className="questions"><div className="section-line"><h3>后续核验建议</h3><span>{questions.length} 项可稍后核验</span></div>{analysis.understanding.conflicts.map((c,i)=><div className="conflict" key={i}><strong>记录有冲突</strong><p>{c.description}</p><SourceEvidence evidence={c.evidence} onLocate={onLocate}/>{!questions.length?<label>{c.resolutionQuestion}<input disabled={disabled} value={answers[`conflict_${i}`]||''} onChange={e=>onAnswer(`conflict_${i}`,e.target.value)} placeholder="写下客户确认，以此为准"/></label>:null}</div>)}{questions.filter(q=>q.priority==='blocking'||optional).map(q=><div className="question" key={q.id}><label htmlFor={`q-${q.id}`}>{q.question}<span>{'可稍后'}</span></label><p>为什么问：{q.why}</p><input id={`q-${q.id}`} disabled={disabled} value={answers[q.id]||''} onChange={e=>onAnswer(q.id,e.target.value)} placeholder="可留空，先按已有资料生成草稿"/></div>)}{questions.some(q=>q.priority==='optional')?<button className="text-button" onClick={()=>setOptional(!optional)}>{optional?'收起':'查看'}非关键补充</button>:null}{!questions.length&&!analysis.understanding.conflicts.length?<p className="fine">没有需要现在补填的信息。未提供的条件保留待核验。</p>:null}</section>;
}
function App(){
 const [selectionMode,setSelectionMode]=useState('auto'),[manualProduct,setManualProduct]=useState('');
 const [storeSupport,setStoreSupport]=useState('selection_guidance');
 const [handoffChoice,setHandoffChoice]=useState(null),[decisionAnswers,setDecisionAnswers]=useState({});
 const decisionDirty=Object.values(decisionAnswers).some(value=>value.trim());
 const [catalog,setCatalog]=useState([]),[catalogError,setCatalogError]=useState('');
 async function loadCatalog(){setCatalogError('');try{const r=await fetch('/api/products');const d=await r.json();if(!r.ok)throw Error('产品资料暂时未能读取');setCatalog(d.products||[]);}catch(e){setCatalogError(e.message);}}
 useEffect(()=>{void loadCatalog();},[]);
 const [generating,setGenerating]=useState(false);const [generationIntent,setGenerationIntent]=useState(0);
 const [scene,setScene]=useState('auto');const [channel,setChannel]=useState('xiaohongshu');const [text,setText]=useState('');const [sample,setSample]=useState(null);const [supplements,setSupplements]=useState([]);
 const [analysis,setAnalysis]=useState(null);const [confirmed,setConfirmed]=useState(null);const [edits,setEdits]=useState({});const [answers,setAnswers]=useState({});const [filter,setFilter]=useState('all');const [busy,setBusy]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [health,setHealth]=useState(null);const [seconds,setSeconds]=useState(0);const [located,setLocated]=useState(null);const [reviewed,setReviewed]=useState(false);
 const controller=useRef(null);const inputRef=useRef(null);const sourceRef=useRef(null);
 useEffect(()=>{fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({configured:false}));return()=>controller.current?.abort();},[]);
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[busy]);
 const inputSources=[{id:'scenario',type:'scenario',text:text.trim()},...supplements];
 const stale=Boolean(analysis)&&JSON.stringify(analysis.input.sources)!==JSON.stringify(inputSources);
 const dirty=Object.keys(edits).length>0||Object.values(answers).some(v=>v.trim());
 function selectSample(s){
  const demoProduct=s.id===commuteExample.id?catalog.find(p=>p.system==='Windows'&&(p.id==='pc-53440547941ce8f1'||p.name==='MateBook 14 酷睿 Ultra（Windows 系列）')):null;
  setScene('auto');setConfirmed(null);setSelectionMode(demoProduct?'manual':'auto');setManualProduct(demoProduct?.name||'');setStoreSupport('selection_guidance');setHandoffChoice(null);setDecisionAnswers({});
  setText(s.text);setSample(s);setSupplements([]);setAnalysis(null);setEdits({});setAnswers({});setError('');setNotice('');setReviewed(false);
 }
 function locate(e){setLocated(e);sourceRef.current?.scrollIntoView({behavior:'smooth',block:'center'});if(e.sourceId==='scenario'){inputRef.current?.focus();inputRef.current?.setSelectionRange(e.start,e.end);}}
 async function analyze(){
  if(decisionDirty){setError('请先根据回答更新候选，再继续。');return null;}
  setHandoffChoice(null);
  setConfirmed(null);
  setError('');setNotice('');setSeconds(0);setBusy(true);setReviewed(false);controller.current=new AbortController();
  let next=[...supplements];
  const correction=Object.entries(edits).map(([id,value])=>{const o=analysis?.understanding.observations.find(o=>o.id===id);return o?`${categories[o.category]}更正，以此为准：${value.trim()||'此前判断撤回，目前未知'}`:'';}).filter(Boolean);
  Object.entries(answers).filter(([,v])=>v.trim()).forEach(([id,value])=>{const q=analysis?.understanding.questions.find(q=>q.id===id)?.question||analysis?.understanding.conflicts[Number(id.split('_')[1])]?.resolutionQuestion||'确认';correction.push(`针对“${q}”的客户补充，以此为准：${value}`);});
  if(correction.length)next.push({id:`revision_${Date.now()}`,type:'revision',text:correction.join('\n')});
  const sources=[{id:'scenario',type:'scenario',text:text.trim()},...next];
  try{const data=await api('/api/analyze',{sources,sampleId:sample?.id||null,parentAnalysisId:analysis?.analysisId||null},controller.current.signal);setSupplements(next);setAnalysis(data);setEdits({});setAnswers({});setFilter('all');setLocated(null);setNotice('已自动提取需求；未知信息可留待核验，直接继续生成草稿。');return data;}catch(e){setError(e.name==='AbortError'?'已取消。本次输入保留，可重新理解。':e.message);return null;}finally{setBusy(false);}
 }
 async function confirm(){
  if(decisionDirty){setError('请先根据回答更新候选，再生成文案。');return;}
  setSaving(true);setError('');
  try{
   if(selectionMode==='manual'&&!catalog.some(p=>p.name===manualProduct)){setError('请先选择本轮指定的产品型号，或切回按需求推荐。');return;}
   const current=(!analysis||dirty||stale)?await analyze():analysis;
   if(!current)return;
   const unresolved=current.gate.reasons.filter(r=>!['洞察尚未人工确认','产品意向存在歧义'].includes(r));
   if(unresolved.length){setError('原文有需要先澄清的冲突：'+unresolved.join('；'));return;}
   const data=await api('/api/confirm',{analysisId:current.analysisId,edits:[]});
   setConfirmed(data);setReviewed(true);setGenerationIntent(n=>n+1);setNotice('已整理需求，正在准备资料与草稿。');
  }catch(e){setError(e.message);}finally{setSaving(false);}
 }
 async function clarifyDecision(questions,values,selection={}){
  const lines=questions.filter(q=>values[q.id]?.trim()).map(q=>`关键追问 ${q.id}（${q.topic}）的客户补充，以此为准：${values[q.id].trim()}`);
  if(!lines.length)return;
  const selectedProduct=selection.isManual&&catalog.some(p=>p.name===selection.product)?selection.product:'';
  setBusy(true);setConfirmed(null);setError('');setReviewed(false);setSeconds(0);
  controller.current=new AbortController();
  const next=[...supplements,{id:`revision_${Date.now()}`,type:'revision',text:lines.join('\n')}];
  setSupplements(next);
  setDecisionAnswers({});
  try{
   const data=await api('/api/analyze',{sources:[{id:'scenario',type:'scenario',text:text.trim()},...next],parentAnalysisId:analysis.analysisId},controller.current.signal);
   setSupplements(next);setAnalysis(data);setEdits({});setAnswers({});setHandoffChoice(selectedProduct?{analysisId:data.analysisId,product:selectedProduct}:null);
   const confirmedData=await api('/api/confirm',{analysisId:data.analysisId,edits:[]});
   setConfirmed(confirmedData);setReviewed(true);setGenerationIntent(n=>n+1);setNotice('已纳入你的回答，正在更新候选与依据。');
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const rows=analysis?.understanding.observations||[];const visibleRows=rows.filter(o=>filter==='all'||o.kind===filter);
 const selectedScene=sceneOptions.find(s=>s.id===scene),selectedChannel=channelOptions.find(c=>c.id===channel);
 const critical=analysis?.gate.reasons.filter(r=>r!=='洞察尚未人工确认')||[];
 const facts=rows.filter(o=>o.kind==='fact').slice(0,3);
 const chosenProduct=catalog.find(p=>p.name===manualProduct);
 return <><header className="store-header"><div className="brand"><span className="brand-wordmark">HUAWEI<span>PC</span></span><span className="brand-divider"/><div>门店增长助手<small>华为产业赛道 · 参赛作品</small></div></div><span className="connection"><i className={health?.configured?'connected':''}/>{health?.configured?'服务已就绪':'检查模型配置'}</span></header>
 <main className="focused-main clerk-workspace"><div className="intro store-intro simple-store-intro"><div><span className="eyebrow">从客户的一句困扰开始</span><h1>把选购困扰，写成一套图文。</h1><p>写下客户的实际情况，生成有产品依据、可以继续聊下去的{selectedChannel.label}内容。</p></div><span className="format-note">封面 · 正文 · 内容卡</span></div>
 {health?.retrievalMode==='cached'?<div className="warning">当前使用此前保存的资料，未执行新检索。</div>:null}
 <fieldset className="scenario-inputs" disabled={generating||busy||saving} aria-label="场景输入与确认">
 <section className="input-panel complete-input clerk-input" ref={sourceRef}>
 <div className="input-editor">
 <div className="input-heading"><label htmlFor="scenario">客户现在最困扰什么？</label><button type="button" className="example-shortcut" onClick={()=>selectSample(commuteExample)}>填入通勤示例 <span aria-hidden="true">↗</span></button></div>
 <textarea ref={inputRef} id="scenario" className="scenario" maxLength={1800} value={text} onChange={e=>{setText(e.target.value);setSample(null);setHandoffChoice(null);setDecisionAnswers({});setSupplements([]);setEdits({});setAnswers({});setConfirmed(null);setReviewed(false);}} placeholder={commuteExample.text}/>
 <div className="input-bottom"><span>说清要做什么、哪里不方便；不知道的可以留空</span><span>{text.length} / 1800</span></div>
 {sample?<p className="sample-caption">{sample.label} · {sample.fiction}{sample.id===commuteExample.id&&chosenProduct?' 已单独选好本轮演示产品，可随时更换。':''}</p>:null}
 <details className="input-settings"><summary>更多设置与示例 <span>{selectedChannel.label}</span></summary>
 <div className="selection-row"><div><h2>发布渠道</h2><div className="choice-tabs" role="tablist" aria-label="发布渠道">{channelOptions.map(c=><button role="tab" key={c.id} aria-selected={channel===c.id} disabled={!c.enabled} onClick={()=>setChannel(c.id)}>{c.label}</button>)}</div></div><div><h2>场景偏好</h2><div className="choice-tabs" role="tablist" aria-label="客户场景">{sceneOptions.map(s=><button role="tab" key={s.id} aria-selected={scene===s.id} disabled={!s.enabled} onClick={()=>setScene(s.id)}>{s.label}</button>)}</div></div></div>
 <details className="provenance"><summary>其他输入示例</summary><ExamplePicker onApply={selectSample}/></details>
 <button className="text-button" disabled={!text.trim()||!health?.configured||decisionDirty} onClick={analyze}>仅查看理解</button>
 <p className="privacy">场景将发送给 DeepSeek，请省略无关个人信息。场景偏好只组织内容，不补造客户事实。产品依据来自已接入的资料库。</p>
 </details>
 {supplements.length?<details className="provenance"><summary>已纳入 {supplements.length} 次补充</summary>{supplements.map(s=><p key={s.id}>{s.text}</p>)}</details>:null}
 {located?<p className="fine">已定位原文：“{located.quote}”</p>:null}
 </div>
 <aside className="product-entry simple-product-entry">
 <label htmlFor="designated-product">这次想介绍哪款电脑？</label>
 <select id="designated-product" disabled={decisionDirty} value={selectionMode==='manual'?manualProduct:''} onChange={e=>{setSelectionMode(e.target.value?'manual':'auto');setManualProduct(e.target.value);setHandoffChoice(null);setConfirmed(null);setReviewed(false);}}><option value="">按客户需求推荐</option>{catalog.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select>
 <p className="selection-note">{chosenProduct&&selectionMode==='manual'?'本轮介绍该型号，客户未说过的条件仍保留未知。':'有明确型号可直接选择；自动推荐会按已知需求匹配。'}</p>
 {catalogError?<p className="error">{catalogError} <button className="text-button" onClick={loadCatalog}>重新读取</button></p>:null}
 <fieldset className="store-support"><legend>这次门店能帮什么？</legend><div className="support-options">{storeSupportOptions.map(option=><label key={option.id} className={storeSupport===option.id?'selected':''}><input type="radio" name="store-support" value={option.id} checked={storeSupport===option.id} disabled={decisionDirty} onChange={()=>{setStoreSupport(option.id);setConfirmed(null);setReviewed(false);}}/><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</div></fieldset>
 </aside>
 <div className="clerk-submit"><p>{selectedChannel.label} · 按已知信息成稿，未知条件留待核对</p><button className="primary" disabled={!text.trim()||!health?.configured||decisionDirty} onClick={confirm}>{busy?`正在整理需求 · ${seconds}s`:saving?'正在准备…':generating?'正在生成图文…':`生成${selectedChannel.label}图文`}</button></div>
 </section>
 <div role="status" aria-live="polite">{notice&&(busy||saving||generating)?<p className="notice">{notice}</p>:null}</div>{error?<div role="alert" className="error">{error}</div>:null}{stale?<div className="warning">输入已修改，点击生成会按新输入重新理解。</div>:null}
 {analysis?<section className="understanding-panel">
 <details id="understanding" key={analysis.analysisId} open={critical.length>0?true:undefined}>
 <summary><strong>查看客户理解与原文依据</strong><span>{rows.length} 条提取结果 · 可选修改</span></summary>
 <div className="understanding-brief"><p><strong>已提取：</strong>{facts.map(o=>o.value).join('；')||'暂无可确认的客户事实。'}</p><p><strong>客户提到的产品：</strong>{analysis.understanding.product.name||'未指定'}</p></div>
 <Questions disabled={decisionDirty} analysis={analysis} answers={answers} onAnswer={(id,v)=>{setAnswers(a=>({...a,[id]:v}));setReviewed(false);}} onLocate={locate}/>
 <div className="filters" role="group" aria-label="筛选洞察">{[['all','全部'],...Object.entries(kindLabel)].map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>
 <div className="insight-list">{visibleRows.map(item=><InsightRow key={item.id} disabled={decisionDirty} item={item} value={edits[item.id]} onEdit={(id,v)=>{setEdits(old=>({...old,[id]:v}));setReviewed(false);}} onLocate={locate}/>)}</div>
 {critical.length?<div className="warning">请先补充关键条件：{critical.join('；')}</div>:null}
 {dirty?<div className="warning">修改尚未用于成稿，请更新后继续。</div>:null}
 <div className="compact-confirm"><p className="fine">软件、预算和已有设备等未知信息可以留空。</p><button className="primary" disabled={!text.trim()||!health?.configured||decisionDirty} onClick={confirm}>{saving?'正在整理…':dirty||stale?'整理补充并继续生成':'继续生成草稿'}</button></div>
 </details>
 </section>:null}</fieldset>
 {confirmed&&!stale&&!dirty&&reviewed?<Handoff key={confirmed.analysisId+scene+channel+generationIntent+selectionMode+manualProduct+storeSupport} preferredProduct={selectionMode==='manual'?manualProduct:''} restoredProduct={handoffChoice?.analysisId===confirmed.analysisId?handoffChoice.product:''} storeSupport={storeSupport} decisionAnswers={decisionAnswers} onDecisionAnswer={(id,value)=>setDecisionAnswers(old=>({...old,[id]:value}))} onProductChange={product=>setHandoffChoice({analysisId:confirmed.analysisId,product})} autoStart={true} analysis={confirmed} sceneLabel={selectedScene.label} platform={selectedChannel.label} onGeneratingChange={setGenerating} onClarify={clarifyDecision}/>:null}
 <RecentResults/>
 </main><footer><span>HUAWEI PC · 门店增长助手</span><span>参赛演示作品 · 资料有据，使用前核对</span></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
