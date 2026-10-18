import React,{useState} from 'react';
import {downloadText} from './api';

export function ResultView({result,onCopy}) {
 const {output,sources,delivery}=result;
 const [message,setMessage]=useState('');
 const blocked=delivery?.status==='blocked';
 const images=new Map(sources.filter(s=>s.kind==='image').map(s=>[s.ref,s]));
 const copy=[output.content.title,output.content.body,output.content.call_to_action].join('\n\n');
 const script=output.sales_plan.demo_script;
 const retrieval=result.meta?.retrieval;
 async function copyScript(){try{await navigator.clipboard.writeText(script);setMessage('店员脚本已复制');}catch{setMessage('复制失败，请手动选择脚本。');}}
 return <div className="result-view">
  {retrieval?.mode==='cached'?<div className="warning">使用此前保存的资料，未执行新检索。原始资料日期：{retrieval.source_created_at}。</div>:null}
  {retrieval?.mode==='local'?<p className="source-label">资料来源：{retrieval.archive_name||'本地知识库资料包'} · 图片取自对应产品目录</p>:null}
  {blocked?<div className="error" role="alert">资料存在待核对项，已暂停成稿。{(delivery.reasons||[]).map((s,i)=><p key={i}>{s}</p>)}</div>:null}
  {!blocked?<>
   <section className="deliverable" aria-label="完整文案"><div className="deliverable-heading"><h3>完整文案</h3><button onClick={onCopy}>复制文案</button></div>
    <h4 className="copy-title">{output.content.title}</h4><p className="copy-body">{output.content.body}</p><p className="copy-body">{output.content.call_to_action}</p>
    {output.image_plan.length?<div className="document-images"><h4>配图 · {output.image_plan.length} 张</h4><div className="image-plans">{output.image_plan.map(item=>{const source=images.get(item.source_ref);return <figure key={item.source_ref}>{source?.local_path?<img className="source-image" src={'/media/'+source.local_path.split('/').pop()} alt={source.title}/>:null}<figcaption><strong>{item.position} · {item.source_ref}</strong><p>{item.caption}</p><small>{source?.title}</small></figcaption></figure>;})}</div></div>:null}
    {delivery?.status==='needs_images'?<p className="warning">{(delivery.reasons||['配图不足，请补充后使用。']).join('；')}</p>:null}
   </section>
   <section className="deliverable clerk-script" aria-label="店员演示脚本"><div className="deliverable-heading"><h3>店员演示脚本</h3><button onClick={copyScript}>复制店员脚本</button></div><p className="fine">约 3 分钟 · 现场话术、操作与检查点</p><p className="copy-body">{script}</p></section>
   <button className="primary" onClick={()=>downloadText('完整文案\n\n'+copy+'\n\n店员演示脚本\n\n'+script)}>导出文案与脚本</button>
  </>:null}
  <p role="status">{message}</p>
  <details className="supporting-details"><summary>查看理解摘要与核验依据{output.pending_confirmation.length?` · ${output.pending_confirmation.length} 项待核验`:''}</summary>
   <h3>需求画像</h3><p className="copy-body">{output.customer_insight}</p><h3>表达策略</h3><p className="copy-body">{output.strategy}</p>
   <h3>待核验事项</h3><ul>{output.pending_confirmation.map((s,i)=><li key={i}>{s}</li>)}</ul>
   <p className="copy-body">{output.sales_plan.quote}</p><p className="fine">{result.checks?.note}</p>
   {sources.filter(s=>output.source_refs.includes(s.ref)).map(s=><details key={s.ref}><summary>{s.ref} · {s.title}</summary><p className="copy-body">{s.text||s.path}</p></details>)}
  </details>
 </div>;
}
