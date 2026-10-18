import React,{useState} from 'react';
import {ResultView} from './ResultView';
import {downloadJson} from './api';

export function RecentResults(){
 const [batch,setBatch]=useState(null),[selected,setSelected]=useState(''),[open,setOpen]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function load(){
  if(open){setOpen(false);return;}
  setBusy(true);setMessage('');
  try {const response=await fetch('/api/scenario-latest');const data=await response.json();if(!response.ok)throw Error(data.error||'读取失败');setBatch(data);setSelected(data.results.find(x=>x.platform==='小红书')?.platform||data.results[0]?.platform||'');setOpen(true);}
  catch(error){setMessage(error.message);}finally{setBusy(false);}
 }
 const result=batch?.results.find(x=>x.platform===selected)?.result;
 return <section className="recent-results"><button className="text-button" disabled={busy} onClick={load}>{busy?'正在读取…':open?'收起上次方案':'查看上次生成方案'}</button><p role="status">{message}</p>
 {open&&batch?<div className="integration generation-results"><h2>上次生成方案</h2><p className="fine">这是已保存的结果，不代表当前输入已经重新生成。</p>{batch.errors.map(e=><p className="error" key={e.platform}>{e.platform}：{e.message}</p>)}<div className="filters">{batch.results.map(x=><button key={x.platform} className={selected===x.platform?'selected':''} onClick={()=>setSelected(x.platform)}>{x.platform}</button>)}</div>{result?<><ResultView result={result} onCopy={async text=>{try{await navigator.clipboard.writeText(text);setMessage('文案已复制');}catch{setMessage('复制失败，请手动选择正文。');}}}/></>:null}<details className="developer-details"><summary>完整对接数据</summary><button onClick={()=>downloadJson(batch,'store-agent-batch.json')}>下载完整对接数据</button></details></div>:null}
 </section>;
}
