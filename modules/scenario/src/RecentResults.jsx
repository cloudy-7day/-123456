import {guideTo} from './guided-motion';
import React,{useState,useRef,useEffect} from 'react';
import {ResultView} from './ResultView';
import {downloadJson} from './api';

export function RecentResults(){
 const resultRef=useRef(null);const [navigation,setNavigation]=useState(0);
 useEffect(()=>{if(navigation)guideTo(resultRef.current);},[navigation]);
 const [batch,setBatch]=useState(null),[selected,setSelected]=useState(''),[open,setOpen]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [examples,setExamples]=useState([]),[exampleLabel,setExampleLabel]=useState('');
 function chooseBatch(data,label=''){setBatch(data);setSelected(data.results.find(x=>x.platform==='小红书')?.platform||data.results[0]?.platform||'');setExampleLabel(label);setOpen(true);setNavigation(n=>n+1);}
 async function loadExamples(){setBusy(true);setMessage('');try{const response=await fetch('/api/scenario-examples');const data=await response.json();if(!response.ok)throw Error(data.error?.message||data.error||'读取失败');setExamples(data.examples||[]);if(data.examples?.length)chooseBatch(data.examples[0].result,data.examples[0].label);else setMessage('尚未保存本地跑通示例。');}catch(error){setMessage(error.message);}finally{setBusy(false);}}
 async function load(){
  if(open&&!exampleLabel){setOpen(false);return;}
  setBusy(true);setMessage('');
  try {const response=await fetch('/api/scenario-latest');const data=await response.json();if(!response.ok)throw Error(data.error||'读取失败');chooseBatch(data);}
  catch(error){setMessage(error.message);}finally{setBusy(false);}
 }
 const result=batch?.results.find(x=>x.platform===selected)?.result;
 return <section className="recent-results"><button className="text-button" disabled={busy} onClick={load}>{busy?'正在读取…':open&&!exampleLabel?'收起上次方案':'查看上次生成方案'}</button><button className="text-button" disabled={busy} onClick={loadExamples}>查看本地跑通示例</button><p role="status">{message}</p>
 {examples.length?<div className="filters" aria-label="已保存的本地示例">{examples.map(example=><button key={example.id} aria-pressed={exampleLabel===example.label} onClick={()=>chooseBatch(example.result,example.label)}>{example.label}</button>)}</div>:null}
 {open&&batch?<div ref={resultRef} className="integration generation-results"><h2>{exampleLabel?`本地跑通示例 · ${exampleLabel}`:"上次生成方案"}</h2><p className="fine">这是已保存的结果，不代表当前输入已经重新生成。</p>{batch.errors.map(e=><p className="error" key={e.platform}>{e.platform}：{e.message}</p>)}<div className="filters">{batch.results.map(x=><button key={x.platform} className={selected===x.platform?'selected':''} onClick={()=>{setSelected(x.platform);setNavigation(n=>n+1);}}>{x.platform}</button>)}</div>{result?<><ResultView result={result} onCopy={async text=>{try{await navigator.clipboard.writeText(text);setMessage('文案已复制');}catch{setMessage('复制失败，请手动选择正文。');}}}/></>:null}<details className="developer-details"><summary>完整对接数据</summary>{!batch.results.some(x=>x.result?.delivery?.status==='blocked'||x.result?.checks?.semantic_review==='blocked')?<button onClick={()=>downloadJson(batch,'store-agent-batch.json')}>下载完整对接数据</button>:null}</details></div>:null}
 </section>;
}
