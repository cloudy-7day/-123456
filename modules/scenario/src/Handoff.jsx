import React,{useState,useEffect,useRef} from 'react';
import {api,downloadJson} from './api';
import {suggestProduct,restrictSystems} from '../shared/product-suggestion.mjs';
import {ResultView} from './ResultView';
import {ProductCard} from './ProductCard';
import {DecisionQuestions} from './DecisionQuestions';
import {explainDecision} from '../shared/decision-support.mjs';
import {publicationCopy} from '../shared/publication.mjs';

export function Handoff({analysis,sceneLabel='按身份与任务展开',platform='小红书',storeSupport='selection_guidance',autoStart=false,preferredProduct='',restoredProduct='',decisionAnswers={},onDecisionAnswer=()=>{},onProductChange=()=>{},onGeneratingChange=()=>{},onClarify=()=>{}}){
 const [initialProduct]=useState(restoredProduct||preferredProduct);
 const [product,setProduct]=useState(initialProduct||analysis.understanding.product.name||'');
 const [recommendation,setRecommendation]=useState({candidates:[],limitations:[]});
 const [decision,setDecision]=useState(null),[decisionReady,setDecisionReady]=useState(false);
 useEffect(()=>{let cancelled=false;api('/api/decision',{analysisId:analysis.analysisId,manualProduct:initialProduct}).then(value=>{if(!cancelled)setDecision(value);}).catch(()=>{if(!cancelled)setDecision({failed:true,retrieval:{mode:'unavailable'}});}).finally(()=>{if(!cancelled)setDecisionReady(true);});return()=>{cancelled=true;};},[analysis.analysisId,initialProduct]);
 const [catalogReady,setCatalogReady]=useState(false),[suggestion,setSuggestion]=useState(''),[optionsOpen,setOptionsOpen]=useState(()=>Object.values(decisionAnswers).some(value=>value.trim()));const inFlight=useRef(false);const autoStarted=useRef(Object.values(decisionAnswers).some(value=>value.trim())),productEdited=useRef(false),resultRef=useRef(null),presentedResult=useRef(null);
 const platforms=[platform];const [products,setProducts]=useState([]);
 useEffect(()=>{if(decision?.failed&&catalogReady){setDecision({...explainDecision(analysis,products,{manualProduct:initialProduct}),retrieval:{mode:'local_decision_fallback'},fallback:true});return;}if(decision&&catalogReady&&!productEdited.current){setRecommendation(old=>({...old,candidates:decision.candidates||old.candidates,limitations:decision.limitations||old.limitations}));if(decision.candidates)setProduct(initialProduct||decision.candidates[0]?.name||'');}},[decision,catalogReady,initialProduct,analysis,products]);
 useEffect(()=>{let cancelled=false;fetch('/api/products').then(r=>{if(!r.ok)throw Error('资料目录读取失败，请重试。');return r.json();}).then(d=>{if(cancelled)return;setProducts(d.products||[]);if(!productEdited.current){const candidate=suggestProduct(analysis,d.products||[]);setRecommendation(candidate);setProduct(initialProduct||candidate.name);setSuggestion(initialProduct?'已使用你指定的型号，原始客户意向仍单独保留。':candidate.reason);setOptionsOpen(Object.values(decisionAnswers).some(value=>value.trim())||(!initialProduct&&!candidate.name));}setCatalogReady(true);}).catch(e=>{if(!cancelled){setError(e.message);setCatalogReady(true);}});return()=>{cancelled=true;};},[analysis,initialProduct]);

 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [progress,setProgress]=useState('');
 const [result,setResult]=useState(null);const [selected,setSelected]=useState('');
 const [connection,setConnection]=useState(null);
 const isManual=productEdited.current||Boolean(initialProduct);
 const decisionDirty=Object.values(decisionAnswers).some(value=>value.trim());
 const request=()=>({analysisId:analysis.analysisId,product,productConfirmed:true,productOrigin:isManual?'salesperson_selection':analysis.understanding.product.name?'input_match':'system_candidate',platforms,store_support:storeSupport,goal:`在${platform}交付一套可直接查看的图文。围绕客户输入中最关键的一件选购困扰，用具体任务、当前型号的产品依据与待核对条件帮助读者做判断。不要为了凑场景扩写身份或生活经历。界面场景偏好为“${sceneLabel}”，它只能组织表达，不能覆盖客户原话。不要推定设备、软件版本、预算、权限或使用体验。未知信息保留未知，不能写成产品已兼容；门店帮助仅以独立的 store_support 选项为准。成稿要有明确主线、简短易读，不能以建议方向或提纲代替正文。`});
 const unresolved=analysis.gate.reasons.filter(r=>!(r==='产品意向存在歧义'&&isManual&&products.some(p=>p.name===product)));
 const blocked=unresolved.length>0;
 const productConflict=decision?.exclusions?.find(item=>item.name===product);
 function chooseProduct(name){productEdited.current=true;autoStarted.current=true;setProduct(name);onProductChange(name);setResult(null);setProgress('');setError('');setSuggestion('已更换本轮产品，请点击生成以使用新型号的资料与图片。');}
 async function check(){setBusy(true);try{const r=await fetch('/api/status');setConnection(await r.json());}catch{setError('连接检查失败，请检查本机服务。');}finally{setBusy(false);}}
 async function exportTasks(){if(productConflict){setError('所选产品不满足已明确的条件，请先更换型号。');return;}if(decisionDirty){setError('请先根据回答更新候选，再导出任务。');return;}setError('');try{const data=await api('/api/handoff',request());downloadJson(data,'handoff-'+analysis.analysisId+'.json');}catch(e){setError(e.message);}}
 async function generate(){
  if(inFlight.current)return;
  if(decisionDirty){setError('请先根据回答更新候选，再生成文案。');return;}
  if(!catalogReady){setError('正在读取资料目录，请稍后再试。');return;}
  autoStarted.current=true;
  if(blocked){setError('请先处理原文中的冲突：'+analysis.gate.reasons.join('；'));return;}
  if(productConflict){setError('所选产品不满足已明确的条件：'+productConflict.reason);setOptionsOpen(true);return;}
  if(!product.trim()){setError('请从产品目录选择一个具体型号。其他未知信息无需补齐。');return;}
  if(!products.some(p=>p.name===product)){setError('请选择资料目录中的完整型号与系统版本。');return;}
  if(!restrictSystems(analysis.understanding.observations,products.filter(p=>p.name===product)).length){setError('所选产品与明确的系统要求冲突，请更换型号或修改原始需求后重新理解。');return;}
  inFlight.current=true;setBusy(true);onGeneratingChange(true);setError('');setResult(null);setSelected('');setProgress('正在查找产品资料与图片…');let terminal=false;
  try{
   const response=await fetch('/api/run-scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request())});
   if(!response.ok){const d=await response.json();throw Error(d.error?.message||d.error||'任务提交失败');}
   const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
   const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);
    if(event.type==='progress')setProgress((event.platform?event.platform+' · ':'')+event.message);
    if(event.type==='platform_result'){
      setProgress(event.platform+'已返回，可先查看；其余平台继续生成…');
      setResult(old=>({...old,complete:false,results:[...(old?.results||[]).filter(x=>x.platform!==event.platform),{platform:event.platform,result:event.result}],errors:old?.errors||[]}));
      setSelected(old=>old||event.platform);
    }
    if(event.type==='platform_error')setResult(old=>({...old,complete:false,results:old?.results||[],errors:[...(old?.errors||[]),{platform:event.platform,message:event.message}]}));
    if(event.type==='error'){terminal=true;throw Error(event.message);}
    if(event.type==='result'){terminal=true;setResult(event.result);setSelected(event.result.results[0]?.platform||'');setProgress(event.result.complete?`${platform}文案与配图已生成。`:'部分平台失败或暂停成稿；已保留所有返回的结果与原因。');}
   };
   try{while(true){const {done,value}=await reader.read();pending+=decoder.decode(value,{stream:!done});const lines=pending.split('\n');pending=lines.pop();for(const line of lines)consume(line);if(done){consume(pending);break;}}}finally{reader.releaseLock();}
   if(!terminal)throw Error('连接中断，未收到最终结果，不能认定生成成功。');
  }catch(e){setError(e.message);setProgress('');}finally{inFlight.current=false;setBusy(false);onGeneratingChange(false);}
 }
 useEffect(()=>{const settled=!decision?.candidates||product===(initialProduct||decision.candidates[0]?.name);if(autoStart&&catalogReady&&decisionReady&&!decision?.failed&&!decision?.fallback&&settled&&!decisionDirty&&!blocked&&!productConflict&&!productEdited.current&&product.trim()&&!autoStarted.current){autoStarted.current=true;void generate();}},[autoStart,catalogReady,decisionReady,decision,decisionDirty,blocked,productConflict,product,initialProduct]);
 const active=decisionDirty?null:result?.results.find(r=>r.platform===selected)?.result;
 useEffect(()=>{if(result?.results.length&&!busy&&result!==presentedResult.current){presentedResult.current=result;resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}},[result,busy]);
 const knowledge=connection?.knowledge||connection?.ima;
 const selectedProduct=products.find(p=>p.name===product);
 const ranked=(recommendation.candidates||[]).slice(0,3);
 const reasons=ranked.find(p=>p.name===product)?.reasons||[];
 const generationFailed=['blocked','failed'].includes(active?.delivery?.status)||Boolean(result?.errors?.length)||(!active&&Boolean(error));
 const resultHeading=generationFailed?'这次图文还需调整':active?.delivery?.status==='needs_images'?'文案已整理，配图还需补齐':active?'这一套图文，已为你整理好':busy?'正在生成这套图文':'图文与选型';
 return <section className="integration focused-generation" ref={resultRef}>
 <div className="panel-title"><h2>{resultHeading}</h2><span>{platform}</span></div>
 <p className="generation-context">{product||'尚未选定产品'}{product?' · ':''}{isManual?'你指定的产品':'按已知需求匹配'}</p>
 {blocked?<div className="warning">关键条件尚未确认：{analysis.gate.reasons.join('；')}。请先在客户理解中补充并重新生成。</div>:null}
 {productConflict?<div className="warning">当前型号不满足明确条件：{productConflict.reason}。请展开下方选型设置更换型号。</div>:null}
 {!decisionReady?<p role="status">正在对照产品资料，保留尚不确定的条件…</p>:null}
 {decision?.failed||decision?.fallback?<p className="warning">自动匹配暂不可用。请在下方核对产品，点击“按现有资料生成”继续。</p>:null}
 {catalogReady&&decisionReady&&!product?<p className="warning">现有信息不足以选定型号。请在下方选择要介绍的产品，再点击生成。</p>:null}
 {decisionDirty?<p className="warning">补充回答尚未用于成稿，请展开下方选型设置并更新，或清空回答。</p>:null}
 <div role="status" aria-live="polite">{progress}</div>{error?<div role="alert" className="error">{error}</div>:null}
 {result?<div className="generation-results">{result.errors.map(e=><p className="error" key={e.platform}>{e.platform}：{e.message}</p>)}
 {active?<ResultView result={active} onCopy={async()=>{try{await navigator.clipboard.writeText(publicationCopy(active.output));setProgress('文案已复制');}catch{setError('复制失败，请选择正文手动复制。');}}}/>:null}</div>:null}
 <details className="generation-options selection-review" open={optionsOpen} onToggle={e=>setOptionsOpen(e.currentTarget.open)}><summary>选型与待确认项 <span>{decision?.questions?.length?`${decision.questions.length} 项可选补充`:'查看或更换产品'}</span></summary>
 <p className="fine">未知信息可以先保留；填入新回答后，请更新再成稿。</p>
 {decision?<DecisionQuestions decision={decision} answers={decisionAnswers} onAnswer={onDecisionAnswer} onClarify={(questions,answers)=>onClarify(questions,answers,{product,isManual})} busy={busy}/>:null}
 <div className="selection-summary"><div><span className="eyebrow">{isManual?'本轮指定':analysis.understanding.product.name?'来自原文':'需求匹配候选'}</span><h3>{product||'请选择本轮产品'}</h3><p>{suggestion}</p>{(recommendation.limitations||[]).map((s,i)=><p className="fine" key={i}>{s}</p>)}</div>{selectedProduct?<ProductCard product={selectedProduct} reasons={reasons}/>:null}</div>
 {ranked.length>1?<><p className="fine">其他候选 · 选择后重新生成</p><div className="candidate-grid">{ranked.map(c=>{const p=products.find(x=>x.name===c.name);return p?<ProductCard key={p.id} product={p} reasons={c.reasons} selected={product===p.name} disabled={busy} onSelect={chooseProduct}/>:null;})}</div></>:null}
 <label>从资料库选择具体型号<input list="knowledge-products" value={product} maxLength={120} disabled={busy} placeholder="输入型号，或从列表中选择" onChange={e=>chooseProduct(e.target.value)}/></label>
 <datalist id="knowledge-products">{products.map(p=><option key={p.id} value={p.name}/>)}</datalist>
 <p className="fine">型号和系统版本需一致；选择产品不会改写客户原话。</p>
 </details>
 <div className="integration-actions"><button className="primary" disabled={busy||!decisionReady||decisionDirty||blocked||Boolean(productConflict)} onClick={generate}>{busy?'正在生成图文…':result?'重新生成图文':decision?.failed||decision?.fallback?'按现有资料生成':'按当前信息生成图文'}</button></div>
 <details className="developer-details"><summary>资料与接口明细</summary>
 {decision?.retrieval?.mode==='unavailable'?<p className="fine">补充场景检索暂不可用，当前候选根据已读取的产品资料整理。</p>:null}
 <div className="integration-actions"><button disabled={busy} onClick={check}>检查接口连接</button><button disabled={busy||decisionDirty||Boolean(productConflict)} onClick={exportTasks}>导出兼容任务包</button>{result?<button onClick={()=>downloadJson(result,'store-agent-'+analysis.analysisId+'.json')}>下载完整对接数据</button>:null}</div>
 {connection?<p>资料库：{knowledge?.ok?(knowledge.mode==='local'?'本地资料包可用':knowledge.mode==='cached'?'缓存资料可用':'已连接'):knowledge?.error||'未确认'}；DeepSeek：{connection.deepseek?.ok?'已连接':connection.deepseek?.error||'未确认'}</p>:null}</details>
 </section>;
}
