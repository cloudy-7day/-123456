import {guideTo,useIntroGuide} from './guided-motion';
import React,{useState,useEffect,useRef,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {categories} from '../shared/categories.mjs';
import {ExamplePicker} from './ExamplePicker';
import {api} from './api';
import {sceneOptions,channelOptions} from '../shared/experience.mjs';
import './style.css';
import {Handoff} from './Handoff';
import {RecentResults} from './RecentResults';
import {ProductCard,ProductVisual} from './ProductCard';
import './store-design.css';
import {ScenarioCard} from './ScenarioCard';
import {buildScenarioCard} from '../shared/scenario-card.mjs';
import './scenario-card.css';
import './stage-layout.css';
import './compact-workspace.css';
import {AnalysisFlow} from './AnalysisFlow';
import {buildRoleExample,roleExamples} from '../shared/role-examples.mjs';

const kindLabel={fact:'明确说过',inference:'合理推断',unknown:'待确认'};
function SourceEvidence({evidence,onLocate}){return evidence.length?<div className="evidence">{evidence.map((e,i)=><button key={i} title="在左侧定位原文" onClick={()=>onLocate(e)}>“{e.quote}” <span>↖ 原文</span></button>)}</div>:<p className="no-evidence">输入未提供 · 保留未知</p>;}
function InsightRow({item,value,onEdit,onLocate}){
 return <article className={`insight ${item.kind}`}><div className="insight-head"><strong>{categories[item.category]}</strong><span className={`badge ${item.kind}`}>{kindLabel[item.kind]}</span>{item.critical?<small>影响适配</small>:null}</div><label className="sr-only" htmlFor={`edit-${item.id}`}>修改{categories[item.category]} {item.id}</label><textarea id={`edit-${item.id}`} rows={Math.max(1,Math.ceil((value??item.value??'').length/35))} value={value??item.value??''} placeholder="未知，可补充客户确认的信息" onChange={e=>onEdit(item.id,e.target.value)}/>{item.rationale?<p className="rationale">{item.rationale}</p>:null}<SourceEvidence evidence={item.evidence} onLocate={onLocate}/></article>;
}
function Questions({analysis,answers,onAnswer,onLocate}){
 const [optional,setOptional]=useState(false);const questions=analysis.understanding.questions;
 return <section className="questions"><div className="section-line"><h3>后续核验建议</h3><span>{questions.length} 项可稍后核验</span></div>{analysis.understanding.conflicts.map((c,i)=><div className="conflict" key={i}><strong>记录有冲突</strong><p>{c.description}</p><SourceEvidence evidence={c.evidence} onLocate={onLocate}/>{!questions.length?<label>{c.resolutionQuestion}<input value={answers[`conflict_${i}`]||''} onChange={e=>onAnswer(`conflict_${i}`,e.target.value)} placeholder="写下客户确认，以此为准"/></label>:null}</div>)}{questions.filter(q=>q.priority==='blocking'||optional).map(q=><div className="question" key={q.id}><label htmlFor={`q-${q.id}`}>{q.question}<span>{'可稍后'}</span></label><p>为什么问：{q.why}</p><input id={`q-${q.id}`} value={answers[q.id]||''} onChange={e=>onAnswer(q.id,e.target.value)} placeholder="可留空，先按已有资料生成草稿"/></div>)}{questions.some(q=>q.priority==='optional')?<button className="text-button" onClick={()=>setOptional(!optional)}>{optional?'收起':'查看'}非关键补充</button>:null}{!questions.length&&!analysis.understanding.conflicts.length?<p className="fine">没有需要现在补填的信息。未提供的条件保留待核验。</p>:null}</section>;
}
function App(){
 const [selectionMode,setSelectionMode]=useState('auto'),[manualProduct,setManualProduct]=useState('');
 const [catalog,setCatalog]=useState([]),[catalogError,setCatalogError]=useState('');
 async function loadCatalog(){setCatalogError('');try{const r=await fetch('/api/products');const d=await r.json();if(!r.ok)throw Error('产品资料暂时未能读取');setCatalog(d.products||[]);}catch(e){setCatalogError(e.message);}}
 useEffect(()=>{void loadCatalog();},[]);
 const [presented,setPresented]=useState(null),[retrieval,setRetrieval]=useState(null);const [generating,setGenerating]=useState(false);const [generationIntent,setGenerationIntent]=useState(0);
 const contentGoal=undefined,contentGoalSelected=false;const [stage,setStage]=useState(1),[runProgress,setRunProgress]=useState(''),[match,setMatch]=useState(null);const [scene,setScene]=useState('auto');const [channel,setChannel]=useState('xiaohongshu');const [text,setText]=useState('');const [sample,setSample]=useState(null);const [supplements,setSupplements]=useState([]);
 const [analysis,setAnalysis]=useState(null);const [confirmed,setConfirmed]=useState(null);const [edits,setEdits]=useState({});const [answers,setAnswers]=useState({});const [filter,setFilter]=useState('all');const [busy,setBusy]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [health,setHealth]=useState(null);const [seconds,setSeconds]=useState(0);const [located,setLocated]=useState(null);const [reviewed,setReviewed]=useState(false);
 const markPresented=useCallback(()=>setPresented(analysis?.analysisId),[analysis?.analysisId]);
 const controller=useRef(null);const inputRef=useRef(null);const sourceRef=useRef(null);
 useEffect(()=>{fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({configured:false}));return()=>controller.current?.abort();},[]);
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[busy]);
 useIntroGuide(sourceRef);
 useEffect(()=>{const header=document.querySelector(".store-header");const observer=new ResizeObserver(()=>document.documentElement.style.setProperty("--header-height",header.getBoundingClientRect().height+"px"));observer.observe(header);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(error)guideTo(document.querySelector('.focused-main [role=alert]'));},[error]);
 useEffect(()=>{if(analysis||busy)guideTo(document.querySelector('.understanding-panel'));},[analysis,busy]);
 const inputSources=[{id:'scenario',type:'scenario',text:text.trim()},...supplements];
 const stale=Boolean(analysis)&&JSON.stringify(analysis.input.sources)!==JSON.stringify(inputSources);
 const dirty=Object.keys(edits).length>0||Object.values(answers).some(v=>v.trim());
 function selectSample(s){setStage(1);setRunProgress('');setMatch(null);setScene(sceneOptions.find(x=>x.businessScenario===s.businessScenario)?.id||'auto');if(s.platform)setChannel(channelOptions.find(x=>x.label===s.platform&&x.enabled)?.id||'xiaohongshu');setConfirmed(null);setSelectionMode('auto');setManualProduct('');setText(s.text+(s.product&&!s.text.includes(s.product)?'\n关注产品：'+s.product:''));setSample(s);setSupplements([]);setAnalysis(null);setEdits({});setAnswers({});setError('');setNotice('');setReviewed(false);}
 function locate(e){setLocated(e);sourceRef.current?.scrollIntoView({behavior:'smooth',block:'center'});if(e.sourceId==='scenario'){inputRef.current?.focus();inputRef.current?.setSelectionRange(e.start,e.end);}}
 async function analyze(){
  setConfirmed(null);
  setMatch(null);setRetrieval(null);setRunProgress('正在提取客户身份、实际任务与主要问题…');
  setError('');setNotice('');setSeconds(0);setBusy(true);setReviewed(false);controller.current=new AbortController();
  let next=[...supplements];
  const correction=Object.entries(edits).map(([id,value])=>{const o=analysis?.understanding.observations.find(o=>o.id===id);return o?`${categories[o.category]}更正，以此为准：${value.trim()||'此前判断撤回，目前未知'}`:'';}).filter(Boolean);
  Object.entries(answers).filter(([,v])=>v.trim()).forEach(([id,value])=>{const q=analysis?.understanding.questions.find(q=>q.id===id)?.question||analysis?.understanding.conflicts[Number(id.split('_')[1])]?.resolutionQuestion||'确认';correction.push(`针对“${q}”的客户补充，以此为准：${value}`);});
  if(correction.length)next.push({id:`revision_${Date.now()}`,type:'revision',text:correction.join('\n')});
  const sources=[{id:'scenario',type:'scenario',text:text.trim()},...next];
  try{const data=await api('/api/analyze',{sources,sampleId:sample?.id||null,parentAnalysisId:analysis?.analysisId||null},controller.current.signal);setSupplements(next);setAnalysis(data);setEdits({});setAnswers({});setFilter('all');setLocated(null);setNotice('已自动提取需求；未知信息可留待核验，直接继续生成草稿。');return data;}catch(e){setError(e.name==='AbortError'?'已取消。本次输入保留，可重新理解。':e.message);return null;}finally{setBusy(false);}
 }
 async function confirm(){
  setPresented(null);setRetrieval(null);setStage(2);setRunProgress('正在从完整描述提取身份、任务与主要问题…');setMatch(null);setSaving(true);setError('');
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
 const rows=analysis?.understanding.observations||[];const visibleRows=rows.filter(o=>filter==='all'||o.kind===filter);
 const selectedScene=sceneOptions.find(s=>s.id===scene),selectedChannel=channelOptions.find(c=>c.id===channel);
 const critical=analysis?.gate.reasons.filter(r=>r!=='洞察尚未人工确认')||[];
 const facts=rows.filter(o=>o.kind==='fact').slice(0,3);
 const chosenProduct=catalog.find(p=>p.name===manualProduct);
 const showcase=catalog.find(p=>p.system==='Windows'&&p.preview)||catalog.find(p=>p.preview);
 return <><header className="store-header"><div className="brand"><span className="brand-wordmark">HUAWEI<span>PC</span></span><span className="brand-divider"/><div>有为智选<small>华为产业赛道 · 参赛作品</small></div></div><div className="header-workflow"><ol className="journey" aria-label="工作流程">{["描述客户场景","匹配或指定产品","交付文案与配图"].map((label,i)=><li key={label} className={stage>=i+1?"active":""} aria-current={stage===i+1?"step":undefined}><span>{String(i+1).padStart(2,"0")}</span>{label}</li>)}</ol><span className="connection"><i className={health?.configured?"connected":""}/>{health?.configured?"服务已就绪":"检查模型配置"}</span></div></header>
 <main className="focused-main"><div className="intro store-intro"><div><span className="eyebrow">懂客户 · 有依据 · 会表达</span><h1>把产品亮点，<br/><span>讲进客户的生活。</span></h1><p>从客户的职业与生活，找到真实场景。<br/>把选择华为的理由，写成适合小红书或朋友圈的完整图文。</p></div><div className="intro-art"><ProductVisual product={showcase}/>{showcase?<p>{showcase.model} <span>· 知识库产品展示</span></p>:<p>HUAWEI MateBook · 场景营销工作台</p>}</div></div>

 {health?.retrievalMode==='cached'?<div className="warning">当前使用此前保存的资料，未执行新检索。</div>:null}
 <fieldset className="scenario-inputs" disabled={generating||busy||saving} aria-label="场景输入与确认">
 <section className="input-panel complete-input" ref={sourceRef}>
 <div className="input-editor"><div className="compact-heading"><h2>客户现在最困扰什么？</h2><button type="button" onClick={()=>selectSample(buildRoleExample('student',roleExamples.find(r=>r.id==='student').defaults))}>填入学生示例 ↗</button></div>

 <label htmlFor="scenario">完整场景描述</label><textarea ref={inputRef} id="scenario" className="scenario" maxLength={1800} value={text} onChange={e=>{setStage(1);setText(e.target.value);setSupplements([]);setEdits({});setAnswers({});setConfirmed(null);setReviewed(false);}} placeholder="例如：我是大学生，正在做一份小组汇报。在寝室整理素材，到教室展示并记录反馈，去图书馆查资料和修改。经常背电脑走动，最看重触控翻阅。请讲清华为电脑怎样帮我把这份汇报做完。不清楚的信息可以不填。"/>
 <div className="input-bottom"><span>只需一段完整描述，无需逐项填写维度</span><span>{text.length} / 1800</span></div>

 <details className="workspace-options"><summary>更多设置与示例<span>{selectedChannel.label} · {selectionMode==='auto'?'按需求匹配':'指定产品'}</span></summary> <div className="selection-row"><div><h2>内容场景偏好</h2><div className="choice-tabs" role="tablist" aria-label="内容场景偏好">{sceneOptions.map(s=><button role="tab" key={s.id} aria-selected={scene===s.id} disabled={!s.enabled} title={s.enabled?s.label:'后续开放'} onClick={()=>{setScene(s.id);setConfirmed(null);setStage(1);}}>{s.label}{!s.enabled?<small>待开放</small>:null}</button>)}</div></div><div><h2>发布渠道</h2><div className="choice-tabs" role="tablist" aria-label="发布渠道">{channelOptions.map(c=><button role="tab" key={c.id} aria-selected={channel===c.id} disabled={!c.enabled} title={c.enabled?c.label:'后续开放'} onClick={()=>{setChannel(c.id);setConfirmed(null);setStage(1);}}>{c.label}{!c.enabled?<small>待开放</small>:null}</button>)}</div></div></div> <ExamplePicker onApply={selectSample}/><details className="provenance"><summary>示例来源说明</summary>{sample?<p>{sample.label}；{sample.fiction}</p>:null}</details>
 {supplements.length?<details className="provenance"><summary>已纳入 {supplements.length} 次补充</summary>{supplements.map(s=><p key={s.id}>{s.text}</p>)}</details>:null}
 {located?<p className="fine">已定位原文：“{located.quote}”</p>:null}<aside className="product-entry"><span className="eyebrow">本轮产品</span><h2>有目标，也有选择。</h2><p className="entry-description">已知型号可直接指定。没有型号，就让需求带路。</p>
 <div className="selection-mode" role="group" aria-label="产品选择方式"><button aria-pressed={selectionMode==='auto'} onClick={()=>{setSelectionMode('auto');setConfirmed(null);}}>按需求推荐</button><button aria-pressed={selectionMode==='manual'} onClick={()=>{setSelectionMode('manual');setConfirmed(null);}}>指定产品</button></div>
 {selectionMode==='manual'?<><label htmlFor="designated-product">本轮指定产品</label><select id="designated-product" value={manualProduct} onChange={e=>{setManualProduct(e.target.value);setConfirmed(null);}}><option value="">请选择完整型号与系统</option>{catalog.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select>{chosenProduct?<ProductCard product={chosenProduct}/>:<div className="selection-empty"><span>由你来定</span><p>适合评委指定产品、门店主推机型，或已有明确购机意向的客户。</p></div>}<p className="selection-note">此处是本轮内容的产品选择，不会改写客户原话。</p></>:<div className="auto-selection-info"><div className="auto-symbol" aria-hidden="true">✦</div><h3>先懂需求，再选候选。</h3><p>自动提取携带、阅读、输入等任务，从知识库匹配可用于这次内容的产品。</p><ul><li>原文已指定型号时，优先匹配</li><li>展示推荐理由，支持随时更换</li><li>价格与软件适配，留待实际核验</li></ul><span className="selection-note">生成时自动匹配 · 无需额外填表</span></div>}
 {catalogError?<p className="error">{catalogError} <button className="text-button" onClick={loadCatalog}>重新读取</button></p>:null}
 </aside></details>
 <div className="analyze-actions"><button className="primary" disabled={!text.trim()||!health?.configured} onClick={confirm}>{busy?`正在整理需求 · ${seconds}s`:`生成${selectedChannel.label}文案`}</button><button className="text-button" disabled={!text.trim()||!health?.configured} onClick={analyze}>仅查看理解</button></div>
 <p className="privacy">场景将发送给 DeepSeek，请省略无关个人信息。场景标签用于组织内容，不会据此补造客户事实。</p>
 </div>
 </section>
 <div role="status" aria-live="polite">{notice?<p className="notice">{notice}</p>:null}</div>{error?<div role="alert" className="error">{error}</div>:null}{stale?<div className="warning">输入已修改，请重新理解后生成。</div>:null}
 {analysis||busy?<section className="understanding-panel" aria-label="场景分析">
 <AnalysisFlow key={(analysis?.analysisId||'pending')+generationIntent} card={analysis?buildScenarioCard(analysis,{businessScenario:selectedScene.businessScenario,platform:selectedChannel.label}):null} match={match} retrieval={retrieval} progress={runProgress} working={busy||saving||generating} onPresented={markPresented}/>

 {analysis?<>
 <details className="analysis-record"><summary>展开完整场景卡与原文依据</summary><ScenarioCard card={buildScenarioCard(analysis,{businessScenario:selectedScene.businessScenario,contentGoal:contentGoalSelected?contentGoal:undefined,product:selectionMode==='manual'?manualProduct:undefined,platform:selectedChannel.label})} stale={stale||dirty} onEdit={()=>{guideTo(sourceRef.current);inputRef.current?.focus({preventScroll:true});}}/>
 <details id="understanding" key={analysis.analysisId} open={critical.length>0?true:undefined}>
 <summary><strong>理解与确认</strong><span>{rows.length} 条提取结果 · 点击展开或收起</span></summary>
 <p className="fine">以下是需求提取摘要与原文依据，可按需修改。</p>
 <Questions analysis={analysis} answers={answers} onAnswer={(id,v)=>{setAnswers(a=>({...a,[id]:v}));setReviewed(false);}} onLocate={locate}/>
 <div className="filters" role="group" aria-label="筛选洞察">{[['all','全部'],...Object.entries(kindLabel)].map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>
 <div className="insight-list">{visibleRows.map(item=><InsightRow key={item.id} item={item} value={edits[item.id]} onEdit={(id,v)=>{setEdits(old=>({...old,[id]:v}));setReviewed(false);}} onLocate={locate}/>)}</div>
 </details>
 </details>
 {critical.length?<div className="warning">请先展开并补充关键条件：{critical.join('；')}</div>:null}
 {dirty?<div className="warning">已记录你的修改，点击继续会自动整理，无需回到顶部重新分析。</div>:null}
 <div className="compact-confirm" style={{display:generating||saving?'none':undefined}}><p className="fine">软件、预算和已有设备等未知信息可以留空，先生成有依据的草稿。</p><button className="primary" disabled={!text.trim()||!health?.configured} onClick={confirm}>{saving?'正在整理…':dirty||stale?'整理补充并继续生成':stage===3?'重新生成图文':'继续生成草稿'}</button></div>
 </>:<div className="analysis-placeholder">正在把完整描述整理为「身份 → 具体任务 → 主要问题」。分析就绪后会直接显示在这里。</div>}</section>:null}</fieldset>
 {confirmed&&!stale&&!dirty&&reviewed?<Handoff key={confirmed.analysisId+scene+channel+contentGoal+generationIntent+selectionMode+manualProduct} businessScenario={selectedScene.businessScenario} contentGoal={contentGoalSelected?contentGoal:undefined} preferredProduct={selectionMode==='manual'?manualProduct:''} autoStart={presented===analysis.analysisId} presentationReady={presented===analysis.analysisId} analysis={confirmed} sceneLabel={selectedScene.label} platform={selectedChannel.label} onGeneratingChange={value=>{setGenerating(value);if(value){setStage(2);guideTo(document.querySelector(".understanding-panel"));}}} onProgress={setRunProgress} onRetrieval={setRetrieval} onMatch={setMatch} onComplete={complete=>{if(complete)setStage(3);}}/>:null}
 <RecentResults/>
 </main><footer><span>HUAWEI PC · 有为智选</span><span>参赛演示作品 · 资料有据，使用前核对</span></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
