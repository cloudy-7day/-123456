import React from 'react';

export function ResultView({result,onCopy}) {
  const {output,sources,delivery}=result;
  const blocked=delivery?.status==='blocked';
  const images=new Map(sources.filter(s=>s.kind==='image').map(s=>[s.ref,s]));
  return <div className="result-view">
    {result.meta.retrieval?.mode==='cached'?<div className="warning">使用此前保存的 ima 原文与图片，未执行新检索。资料保存于 {result.meta.retrieval.source_created_at}。</div>:null}
    <div className={blocked?'error':delivery?.status==='needs_images'?'warning':'notice'} role="status">
      {blocked?'资料存在待核对项，已暂停成稿。':delivery?.status==='needs_images'?'文字草稿已生成，配图仍需补充。':'图文草稿已生成，使用前请核对事实与图片。'}
      {(delivery?.reasons||[]).map((text,i)=><p key={i}>{text}</p>)}
    </div>
    {!blocked?<section aria-label="顾客图文"><h3>{output.content.title}</h3><p className="copy-body">{output.content.body}</p><p>{output.content.call_to_action}</p></section>:null}
    <button disabled={blocked} onClick={onCopy}>复制本平台文案</button>
    <h3>配图计划</h3>
    {output.image_plan.length?<div className="image-plans">{output.image_plan.map(item=>{
      const source=images.get(item.source_ref);
      return <figure key={item.source_ref}>{source?.local_path?<img className="source-image" src={'/media/'+source.local_path.split('/').pop()} alt={source.title}/>:null}<figcaption><strong>{item.position} · {item.source_ref}</strong><p>{item.caption}</p><small>{source?.title}</small></figcaption></figure>;
    })}</div>:<p>暂无配图；请结合待确认项处理。</p>}
    <h3>需求画像</h3><p className="copy-body">{output.customer_insight}</p>
    <h3>内容策略与表达依据</h3><p className="copy-body">{output.strategy}</p>
    <h3>待确认与待核验</h3>{output.pending_confirmation.length?<ul>{output.pending_confirmation.map((s,i)=><li key={i}>{s}</li>)}</ul>:<p>未列出待确认项，仍需人工核验。</p>}
    <h3>报价说明</h3><p className="copy-body">{output.sales_plan.quote}</p>
    <h3>约3分钟到店演示</h3><p className="copy-body">{output.sales_plan.demo_script}</p>
    <h3>跟进话术草稿</h3><p className="fine">第1、3、7天建议，仅供店员选择使用，未发送消息。</p>{output.follow_up.map(item=><article className="follow-up" key={item.day}><strong>第{item.day}天</strong><p>{item.message}</p></article>)}
    <h3>实际使用的来源</h3><p>{output.source_refs.join(' · ')}</p>
    <details><summary>查看原文与完整数据</summary>{sources.map(s=><div key={s.ref}><h4>{s.ref} · {s.title}</h4>{s.kind==='image'?<p>{s.path}</p>:<p className="copy-body">{s.text}</p>}</div>)}<pre>{JSON.stringify(output,null,2)}</pre></details>
    <p className="fine">{result.checks.note} 本平台耗时 {(result.meta.duration_ms/1000).toFixed(1)} 秒。</p>
  </div>;
}
