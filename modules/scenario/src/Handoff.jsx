import {guideTo} from './guided-motion';
import React,{useState,useEffect,useRef} from 'react';
import {api,downloadJson} from './api';
import {suggestProduct,restrictSystems} from '../shared/product-suggestion.mjs';
import {ResultView} from './ResultView';
import {ProductCard} from './ProductCard';
import {RecommendationReview} from './RecommendationReview';

export function Handoff({analysis,businessScenario='auto',contentGoal,sceneLabel='按身份与任务展开',platform='小红书',autoStart=false,presentationReady=true,preferredProduct='',onGeneratingChange=()=>{},onProgress,onMatch,onComplete,onRetrieval}){
 const workRef=useRef(null),resultRef=useRef(null),errorRef=useRef(null);

 const [product,setProduct]=useState(preferredProduct||analysis.understanding.product.name||'');
 const [recommendation,setRecommendation]=useState({candidates:[],limitations:[]});
 const [catalogReady,setCatalogReady]=useState(false),[suggestion,setSuggestion]=useState(''),[optionsOpen,setOptionsOpen]=useState(false);const inFlight=useRef(false);const autoStarted=useRef(false),productEdited=useRef(false);
 const platforms=[platform];const [products,setProducts]=useState([]);
 useEffect(()=>{let cancelled=false;fetch('/api/products').then(r=>{if(!r.ok)throw Error('资料目录读取失败，请重试。');return r.json();}).then(d=>{if(cancelled)return;setProducts(d.products||[]);if(!productEdited.current){const candidate=suggestProduct(analysis,d.products||[]);setRecommendation(candidate);setProduct(preferredProduct||candidate.name);setSuggestion(preferredProduct?'已使用你指定的型号，原始客户意向仍单独保留。':candidate.reason);setOptionsOpen(!preferredProduct&&!candidate.name);}setCatalogReady(true);}).catch(e=>{if(!cancelled){setError(e.message);setCatalogReady(true);}});return()=>{cancelled=true;};},[analysis,preferredProduct]);

 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [progress,setProgress]=useState('');
 const [result,setResult]=useState(null);const [settled,setSettled]=useState(false);const [selected,setSelected]=useState('');
 const hasResults=Boolean(result?.results?.length);
 const hasResultErrors=Boolean(result?.errors?.length);
 useEffect(()=>{if(settled&&!busy&&(hasResults||hasResultErrors)){guideTo(resultRef.current);onComplete?.(Boolean(result?.complete));}},[settled,busy]);
 useEffect(()=>{if(progress)onProgress?.(progress);},[progress,onProgress]);
 useEffect(()=>{if(product)onMatch?.({product,reason:suggestion,reasons:recommendation.candidates?.find(c=>c.name===product)?.reasons||[]});},[product,suggestion,recommendation,onMatch]);
 useEffect(()=>{if(error)guideTo(errorRef.current);},[error]);
 const [connection,setConnection]=useState(null);
 const isManual=productEdited.current||Boolean(preferredProduct);
 const request=()=>({analysisId:analysis.analysisId,product,productConfirmed:true,productOrigin:isManual?'salesperson_selection':analysis.understanding.product.name?'input_match':'system_candidate',platforms,businessScenario,...(contentGoal?{contentGoal}:{}),goal:`在${platform}输出一篇完整多场景文案与配图。界面场景偏好为“${sceneLabel}”，它不能覆盖输入中的身份与实际任务，也不能据此把客户改写为学生。先识别职业、角色或多重身份，再按本次任务展开2—3个具体工作/生活片段，说明问题、对应产品事实和选择华为的理由。职业只帮助提出相关情境，不自动推定专科、执业领域、设备、软件、预算或权限。输入不足时可用条件式场景完成草稿；同一职业不同任务也须写出不同内容。朋友圈围绕一个核心卖点和一个具体任务写60—150字短文，给出有据的咨询或到店体验引导，不用小红书式长篇分栏、标题党和话题堆叠；小红书保留完整场景叙事。最终交付完整文案，不输出建议方向、提纲或分时店员话术；产品和系统能力必须有当前型号的资料依据。`});
 const unresolved=analysis.gate.reasons.filter(r=>!(r==='产品意向存在歧义'&&isManual&&products.some(p=>p.name===product)));
 const blocked=unresolved.length>0;
 function chooseProduct(name){productEdited.current=true;autoStarted.current=true;setProduct(name);setResult(null);setProgress('');setError('');setSuggestion('已更换本轮产品，请点击生成以使用新型号的资料与图片。');}
 async function check(){setBusy(true);try{const r=await fetch('/api/status');setConnection(await r.json());}catch{setError('连接检查失败，请检查本机服务。');}finally{setBusy(false);}}
 async function exportTasks(){setError('');try{const data=await api('/api/handoff',request());downloadJson(data,'handoff-'+analysis.analysisId+'.json');}catch(e){setError(e.message);}}
 async function generate(){
  if(inFlight.current||!presentationReady)return;
  if(!catalogReady){setError('正在读取资料目录，请稍后再试。');return;}
  autoStarted.current=true;
  if(blocked){setError('请先处理原文中的冲突：'+analysis.gate.reasons.join('；'));return;}
  if(!product.trim()){setError('请从产品目录选择一个具体型号。其他未知信息无需补齐。');return;}
  if(!products.some(p=>p.name===product)){setError('请选择资料目录中的完整型号与系统版本。');return;}
  if(!restrictSystems(analysis.understanding.observations,products.filter(p=>p.name===product)).length){setError('所选产品与明确的系统要求冲突，请更换型号或修改原始需求后重新理解。');return;}
  inFlight.current=true;setSettled(false);setBusy(true);onGeneratingChange(true);setError('');setResult(null);setSelected('');setProgress('正在查找产品资料与图片…');let terminal=false;
  try{
   const response=await fetch('/api/run-scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request())});
   if(!response.ok){const d=await response.json();throw Error(d.error?.message||d.error||'任务提交失败');}
   const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
   const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);
    if(event.type==='evidence')onRetrieval?.(event.retrieval);
    if(event.type==='progress')setProgress((event.platform?event.platform+' · ':'')+event.message);
    if(event.type==='platform_result'){
      setProgress(event.platform+'内容已返回，正在整理完整交付…');
      setResult(old=>({...old,complete:false,results:[...(old?.results||[]).filter(x=>x.platform!==event.platform),{platform:event.platform,result:event.result}],errors:old?.errors||[]}));
      setSelected(old=>old||event.platform);
    }
    if(event.type==='platform_error')setResult(old=>({...old,complete:false,results:old?.results||[],errors:[...(old?.errors||[]),{platform:event.platform,message:event.message}]}));
    if(event.type==='error'){terminal=true;throw Error(event.message);}
    if(event.type==='result'){terminal=true;setSettled(true);setResult(event.result);setSelected(event.result.results[0]?.platform||'');setProgress(event.result.complete?`${platform}文案与配图已生成。`:event.result.errors?.length?'生成中断，输入已保留；请查看下方原因。':'文案仍有未通过核验的表达，请查看下方问题句。');}
   };
   try{while(true){const {done,value}=await reader.read();pending+=decoder.decode(value,{stream:!done});const lines=pending.split('\n');pending=lines.pop();for(const line of lines)consume(line);if(done){consume(pending);break;}}}finally{reader.releaseLock();}
   if(!terminal)throw Error('连接中断，未收到最终结果，不能认定生成成功。');
  }catch(e){setError(e.message);setProgress('');}finally{inFlight.current=false;setBusy(false);onGeneratingChange(false);}
 }
 useEffect(()=>{if(autoStart&&catalogReady&&!blocked&&!productEdited.current&&product.trim()&&!autoStarted.current){autoStarted.current=true;void generate();}},[autoStart,catalogReady,blocked,product]);
 const active=result?.results.find(r=>r.platform===selected)?.result;
 const knowledge=connection?.knowledge||connection?.ima;
 const selectedProduct=products.find(p=>p.name===product);
 const ranked=(recommendation.candidates||[]).slice(0,3);
 const reasons=ranked.find(p=>p.name===product)?.reasons||[];
 return <section ref={workRef} className="integration focused-generation"><div className="panel-title"><h2>{sceneLabel} · {platform}</h2><span>完整文案 + 配图</span></div>
 {blocked?<div className="warning">关键条件尚未确认：{analysis.gate.reasons.join('；')}。请先补充并重新理解。</div>:null}
 <details className="selection-details" open={optionsOpen||!product?true:undefined}><summary>选型与待确认项 · {product||'请选择产品'}</summary><div className="selection-summary"><div><span className="eyebrow">{isManual?'本轮指定':analysis.understanding.product.name?'来自原文':'需求匹配候选'}</span><h3>{product||'请选择本轮产品'}</h3><p>{suggestion}</p>{!isManual?(recommendation.limitations||[]).map((s,i)=><p className="fine" key={i}>{s}</p>):null}</div>{selectedProduct?<ProductCard product={selectedProduct} reasons={reasons}/>:null}</div>
 {!isManual?<RecommendationReview recommendation={recommendation}/>:null}
 <details className="generation-options" open={optionsOpen} onToggle={e=>setOptionsOpen(e.currentTarget.open)}><summary>查看或更换检索产品</summary>
 {ranked.length>1?<><p className="fine">其他候选 · 点击选择后，重新生成本轮内容</p><div className="candidate-grid">{ranked.map(c=>{const p=products.find(x=>x.name===c.name);return p?<ProductCard key={p.id} product={p} reasons={c.reasons} selected={product===p.name} disabled={busy} onSelect={chooseProduct}/>:null;})}</div></>:null}
 <label>从资料库选择具体型号<input list="knowledge-products" value={product} maxLength={120} disabled={busy} placeholder="输入型号，或从列表中选择" onChange={e=>chooseProduct(e.target.value)}/></label>
 <datalist id="knowledge-products">{products.map(p=><option key={p.id} value={p.name}/>)}</datalist>
 <p className="fine">这是本轮检索对象，产品事实与图片来自你提供的资料包。型号和系统版本需一致。</p>

 </details>
 </details>
 <div className="integration-actions"><button className="primary" disabled={busy||!presentationReady} onClick={generate}>{busy?'正在生成…':!presentationReady?'正在展示场景分析…':'按当前候选生成'}</button></div>
 <div role="status" aria-live="polite">{progress}</div>{error?<div ref={errorRef} role="alert" className="error">{error}</div>:null}
 {result&&settled?<div ref={resultRef} className="generation-results">{result.errors.map(e=><p className="error" key={e.platform}>{e.platform}：{e.message}</p>)}
 {active?<ResultView result={active} onCopy={async text=>{try{await navigator.clipboard.writeText(text);setProgress('文案已复制');}catch{setError('复制失败，请选择正文手动复制。');}}}/>:null}</div>:null}
 <details className="developer-details"><summary>连接检查与对接数据</summary><div className="integration-actions"><button disabled={busy} onClick={check}>检查接口连接</button><button disabled={busy} onClick={exportTasks}>导出兼容任务包</button>{result&&!result.results.some(r=>r.result?.delivery?.status==='blocked'||r.result?.checks?.semantic_review==='blocked')?<button onClick={()=>downloadJson(result,'store-agent-'+analysis.analysisId+'.json')}>下载完整对接数据</button>:null}</div>
 {connection?<p>资料库：{knowledge?.ok?(knowledge.mode==='local'?'本地资料包可用':knowledge.mode==='cached'?'缓存资料可用':'已连接'):knowledge?.error||'未确认'}；DeepSeek：{connection.deepseek?.ok?'已连接':connection.deepseek?.error||'未确认'}</p>:null}</details>
 </section>;
}
