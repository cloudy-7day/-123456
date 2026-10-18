import React,{useState} from 'react';
import {api,downloadJson} from './api';
import {ResultView} from './ResultView';

export function Handoff({analysis,onGeneratingChange=()=>{}}){
 const [product,setProduct]=useState(analysis.understanding.product.name||'');
 const [productConfirmed,setProductConfirmed]=useState(false);
 const [platforms,setPlatforms]=useState(['小红书','公众号','朋友圈']);
 const [audience,setAudience]=useState('');const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [progress,setProgress]=useState('');
 const [result,setResult]=useState(null);const [selected,setSelected]=useState('');
 const [connection,setConnection]=useState(null);
 const request=()=>({analysisId:analysis.analysisId,product,productConfirmed,platforms,audience});
 const blocked=analysis.gate.status!=='ready_for_ima';
 async function check(){setBusy(true);try{const r=await fetch('/api/status');setConnection(await r.json());}catch{setError('连接检查失败，请检查本机服务。');}finally{setBusy(false);}}
 async function exportTasks(){setError('');try{const data=await api('/api/handoff',request());downloadJson(data,'handoff-'+analysis.analysisId+'.json');}catch(e){setError(e.message);}}
 async function generate(){
  setBusy(true);onGeneratingChange(true);setError('');setResult(null);setSelected('');setProgress('正在准备任务…');let terminal=false;
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
    if(event.type==='result'){terminal=true;setResult(event.result);setSelected(event.result.results[0]?.platform||'');setProgress(event.result.complete?'所有所选平台已返回草稿；请逐项检查内容、配图与待确认项。':'部分平台失败或暂停成稿；已保留所有返回的结果与原因。');}
   };
   try{while(true){const {done,value}=await reader.read();pending+=decoder.decode(value,{stream:!done});const lines=pending.split('\n');pending=lines.pop();for(const line of lines)consume(line);if(done){consume(pending);break;}}}finally{reader.releaseLock();}
   if(!terminal)throw Error('连接中断，未收到最终结果，不能认定生成成功。');
  }catch(e){setError(e.message);setProgress('');}finally{setBusy(false);onGeneratingChange(false);}
 }
 const active=result?.results.find(r=>r.platform===selected)?.result;
 return <section className="integration"><div className="panel-title"><span className="step-num">03</span><h2>接入产品资料与营销生成</h2></div>
 <p className="fine">按已确认的需求检索产品资料，分别生成各平台内容。<a href="/" target="_blank" rel="noreferrer">打开单平台表单</a></p>
 {blocked?<div className="warning">已保存洞察，但关键条件仍未确认：{analysis.gate.reasons.join('；')}。请先补充并重新理解。</div>:null}
 <label>本轮检索的完整型号<input value={product} maxLength={120} disabled={busy} placeholder="例如：MateBook 14 酷睿 Ultra" onChange={e=>{setProduct(e.target.value);setProductConfirmed(false);setResult(null);}}/></label>
 <p className="fine">保留客户原始意向；这里是销售选择的检索对象，不能代表已满足软件、系统或预算要求。未选型号时先停在此处。</p>
 <label className="checkbox"><input type="checkbox" checked={productConfirmed} disabled={busy} onChange={e=>setProductConfirmed(e.target.checked)}/>已确认型号与系统版本，用于资料检索</label>
 <label>客户身份补充（可留空，留空保持未知）<input value={audience} maxLength={500} disabled={busy} onChange={e=>{setAudience(e.target.value);setResult(null);}}/></label>
 <fieldset><legend>生成平台</legend>{['小红书','公众号','朋友圈','门店海报'].map(p=><label className="checkbox" key={p}><input type="checkbox" checked={platforms.includes(p)} disabled={busy} onChange={e=>{setPlatforms(old=>e.target.checked?[...old,p]:old.filter(x=>x!==p));setResult(null);}}/>{p}</label>)}</fieldset>
 <div className="integration-actions"><button disabled={busy} onClick={check}>检查接口连接</button><button disabled={busy||blocked||!productConfirmed||!product.trim()||!platforms.length} onClick={exportTasks}>导出兼容任务包</button><button className="primary" disabled={busy||blocked||!productConfirmed||!product.trim()||!platforms.length} onClick={generate}>{busy?'处理中…':'检索并生成所选平台'}</button></div>
 {connection?<div className="connection-result">ima：{connection.ima?.ok?(connection.ima.mode==='cached'?'使用缓存资料，未验证实时检索':'已验证连接'):connection.ima?.error||'连接未确认'}<br/>DeepSeek：{connection.deepseek?.ok?'已验证连接':connection.deepseek?.error||'连接未确认'}</div>:null}
 <div role="status" aria-live="polite">{progress}</div>{error?<div role="alert" className="error">{error}</div>:null}
 {result?<div className="generation-results">{result.errors.map(e=><p className="error" key={e.platform}>{e.platform}：{e.message}</p>)}<div className="filters">{result.results.map(r=><button key={r.platform} className={selected===r.platform?'selected':''} onClick={()=>setSelected(r.platform)}>{r.platform}</button>)}</div>
 {active?<><ResultView result={active} onCopy={async()=>{try{await navigator.clipboard.writeText([active.output.content.title,active.output.content.body,active.output.content.call_to_action].join('\n\n'));setProgress('文案已复制');}catch{setError('复制失败，请选择正文手动复制。');}}}/><button onClick={()=>downloadJson(active,'result-'+selected+'.json')}>下载本平台结果</button></>:null}
 <button onClick={()=>downloadJson(result,'shadow-'+analysis.analysisId+'.json')}>下载全平台结果包</button></div>:null}
 </section>;
}
