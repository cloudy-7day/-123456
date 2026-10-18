import React,{useState,useEffect,useRef} from 'react';
import {api,downloadJson} from './api';
import {suggestProduct} from '../shared/product-suggestion.mjs';
import {ResultView} from './ResultView';
import {ProductCard} from './ProductCard';

export function Handoff({analysis,sceneLabel='校园学习',platform='小红书',autoStart=false,preferredProduct='',onGeneratingChange=()=>{}}){
 const [product,setProduct]=useState(preferredProduct||analysis.understanding.product.name||'');
 const [recommendation,setRecommendation]=useState({candidates:[],limitations:[]});
 const [catalogReady,setCatalogReady]=useState(false),[suggestion,setSuggestion]=useState(''),[optionsOpen,setOptionsOpen]=useState(false);const inFlight=useRef(false);const autoStarted=useRef(false),productEdited=useRef(false);
 const platforms=[platform];const [products,setProducts]=useState([]);
 useEffect(()=>{let cancelled=false;fetch('/api/products').then(r=>{if(!r.ok)throw Error('资料目录读取失败，请重试。');return r.json();}).then(d=>{if(cancelled)return;setProducts(d.products||[]);if(!productEdited.current){const candidate=suggestProduct(analysis,d.products||[]);setRecommendation(candidate);setProduct(preferredProduct||candidate.name);setSuggestion(preferredProduct?'已使用你指定的型号，原始客户意向仍单独保留。':candidate.reason);setOptionsOpen(!preferredProduct&&!candidate.name);}setCatalogReady(true);}).catch(e=>{if(!cancelled){setError(e.message);setCatalogReady(true);}});return()=>{cancelled=true;};},[analysis,preferredProduct]);

 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [progress,setProgress]=useState('');
 const [result,setResult]=useState(null);const [selected,setSelected]=useState('');
 const [connection,setConnection]=useState(null);
 const isManual=productEdited.current||Boolean(preferredProduct);
 const request=()=>({analysisId:analysis.analysisId,product,productConfirmed:true,productOrigin:isManual?'salesperson_selection':analysis.understanding.product.name?'input_match':'system_candidate',platforms,goal:`面向${sceneLabel}场景，在${platform}发布完整文案并给出店员演示脚本，引导咨询和到店体验。场景标签仅是发布方向，不能冒充客户原话或新增事实。`});
 const unresolved=analysis.gate.reasons.filter(r=>!(r==='产品意向存在歧义'&&isManual&&products.some(p=>p.name===product)));
 const blocked=unresolved.length>0;
 function chooseProduct(name){productEdited.current=true;autoStarted.current=true;setProduct(name);setResult(null);setProgress('');setError('');setSuggestion('已更换本轮产品，请点击生成以使用新型号的资料与图片。');}
 async function check(){setBusy(true);try{const r=await fetch('/api/status');setConnection(await r.json());}catch{setError('连接检查失败，请检查本机服务。');}finally{setBusy(false);}}
 async function exportTasks(){setError('');try{const data=await api('/api/handoff',request());downloadJson(data,'handoff-'+analysis.analysisId+'.json');}catch(e){setError(e.message);}}
 async function generate(){
  if(inFlight.current)return;
  if(!catalogReady){setError('正在读取资料目录，请稍后再试。');return;}
  autoStarted.current=true;
  if(blocked){setError('请先处理原文中的冲突：'+analysis.gate.reasons.join('；'));return;}
  if(!product.trim()){setError('请从产品目录选择一个具体型号。其他未知信息无需补齐。');return;}
  if(!products.some(p=>p.name===product)){setError('请选择资料目录中的完整型号与系统版本。');return;}
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
    if(event.type==='result'){terminal=true;setResult(event.result);setSelected(event.result.results[0]?.platform||'');setProgress(event.result.complete?'文案与店员脚本已生成。':'部分平台失败或暂停成稿；已保留所有返回的结果与原因。');}
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
 return <section className="integration focused-generation"><div className="panel-title"><h2>{sceneLabel} · {platform}</h2><span>文案 + 店员演示脚本</span></div>
 {blocked?<div className="warning">关键条件尚未确认：{analysis.gate.reasons.join('；')}。请先补充并重新理解。</div>:null}
 <div className="selection-summary"><div><span className="eyebrow">{isManual?'本轮指定':analysis.understanding.product.name?'来自原文':'需求匹配候选'}</span><h3>{product||'请选择本轮产品'}</h3><p>{suggestion}</p>{!isManual?(recommendation.limitations||[]).map((s,i)=><p className="fine" key={i}>{s}</p>):null}</div>{selectedProduct?<ProductCard product={selectedProduct} reasons={reasons}/>:null}</div>
 <details className="generation-options" open={optionsOpen} onToggle={e=>setOptionsOpen(e.currentTarget.open)}><summary>查看或更换检索产品</summary>
 {ranked.length>1?<><p className="fine">其他候选 · 点击选择后，重新生成本轮内容</p><div className="candidate-grid">{ranked.map(c=>{const p=products.find(x=>x.name===c.name);return p?<ProductCard key={p.id} product={p} reasons={c.reasons} selected={product===p.name} disabled={busy} onSelect={chooseProduct}/>:null;})}</div></>:null}
 <label>从资料库选择具体型号<input list="knowledge-products" value={product} maxLength={120} disabled={busy} placeholder="输入型号，或从列表中选择" onChange={e=>chooseProduct(e.target.value)}/></label>
 <datalist id="knowledge-products">{products.map(p=><option key={p.id} value={p.name}/>)}</datalist>
 <p className="fine">这是本轮检索对象，产品事实与图片来自你提供的资料包。型号和系统版本需一致。</p>

 </details>
 <div className="integration-actions"><button className="primary" disabled={busy} onClick={generate}>{busy?'正在生成…':'按当前候选生成'}</button></div>
 <div role="status" aria-live="polite">{progress}</div>{error?<div role="alert" className="error">{error}</div>:null}
 {result?<div className="generation-results">{result.errors.map(e=><p className="error" key={e.platform}>{e.platform}：{e.message}</p>)}
 {active?<ResultView result={active} onCopy={async()=>{try{await navigator.clipboard.writeText([active.output.content.title,active.output.content.body,active.output.content.call_to_action].join('\n\n'));setProgress('文案已复制');}catch{setError('复制失败，请选择正文手动复制。');}}}/>:null}</div>:null}
 <details className="developer-details"><summary>连接检查与对接数据</summary><div className="integration-actions"><button disabled={busy} onClick={check}>检查接口连接</button><button disabled={busy} onClick={exportTasks}>导出兼容任务包</button>{result?<button onClick={()=>downloadJson(result,'store-agent-'+analysis.analysisId+'.json')}>下载完整对接数据</button>:null}</div>
 {connection?<p>资料库：{knowledge?.ok?(knowledge.mode==='local'?'本地资料包可用':knowledge.mode==='cached'?'缓存资料可用':'已连接'):knowledge?.error||'未确认'}；DeepSeek：{connection.deepseek?.ok?'已连接':connection.deepseek?.error||'未确认'}</p>:null}</details>
 </section>;
}
