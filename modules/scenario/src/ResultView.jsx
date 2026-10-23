import React, { useEffect, useRef, useState } from 'react';
import { downloadText } from './api';
import { publicationBlocks, publicationHtml, publicationCopy, publicationText, publicationCards } from '../shared/publication.mjs';
import { drawPublicationCard } from '../shared/card-renderer.mjs';
import { zipFiles } from '../shared/zip.mjs';
import './publication.css';

const verdictNames={supported:'有依据',rejected:'未通过',unsupported:'证据不足',contradicted:'资料冲突',missing_conditions:'缺少条件',non_product:'非产品主张',not_applicable:'不涉及产品主张',verified:'已检查',passed:'辅助审查通过',blocked:'暂停交付',error:'审查未完成',not_performed:'未执行'};
const mediaUrl=source=>/^output\/media\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(source?.local_path||'')?'/media/'+source.local_path.split('/').pop():null;
const fileData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
const loadImage=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('产品图片未能读取，请重试。'));image.src=src;});
function saveBlob(blob,filename){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function cardCanvas(card){
 const url=mediaUrl({local_path:card.imagePath});
 if(card.imageRef&&!url)throw Error('产品原图未准备完整，请补图后导出。');
 return drawPublicationCard(document.createElement('canvas'),card,url?await loadImage(url):null);
}
function PublicationCard({card}){
 const canvas=useRef(null),[error,setError]=useState('');
 const pointsKey=JSON.stringify(card.points||[]);
 useEffect(()=>{let active=true;setError('');void cardCanvas(card).then(rendered=>{if(active&&canvas.current){canvas.current.width=rendered.width;canvas.current.height=rendered.height;canvas.current.getContext('2d').drawImage(rendered,0,0);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[card.heading,card.body,card.imagePath,card.imageRef,card.product,card.index,card.kind,pointsKey]);
 return <figure className="note-card"><canvas ref={canvas} width="1200" height="1600" role="img" aria-label={`${card.index===0?'封面':`图卡 ${card.index}`}：${card.heading}。${card.body}`}/><figcaption>{card.index===0?'封面':`第 ${card.index+1} 张`} · {card.heading}</figcaption>{error?<p className="error">{error}</p>:null}</figure>;
}
function EvidenceImage({plan,source}){return <figure>{mediaUrl(source)?<img className="source-image" loading="lazy" src={mediaUrl(source)} alt={publicationText(plan.caption)}/>:<p>图片待补</p>}<figcaption>{publicationText(plan.caption)}</figcaption></figure>;}
export function ResultView({result,onCopy}){
 const {output,sources,delivery}=result;
 const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
 const blocked=delivery?.status==='blocked',images=new Map(sources.filter(s=>s.kind==='image').map(s=>[s.ref,s]));
 const copy=publicationCopy(output),cards=publicationCards(result),pack=output.marketing_package;
 const retrieval=result.meta?.retrieval,review=result.checks?.claim_review,platform=result.input?.platform||'营销';
 async function exportPublication(format='html'){
  setExporting(true);setExportError('');
  try{
   if(format==='zip'){
    const files=await Promise.all(cards.map(async(card,index)=>{const canvas=await cardCanvas(card);const blob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图卡导出失败')),'image/png'));return {name:`${String(index+1).padStart(2,'0')}-${index===0?'封面':'图卡'}.png`,data:new Uint8Array(await blob.arrayBuffer())};}));
    files.push({name:'发布正文.txt',data:copy});
    files.push({name:'咨询回复-供店员参考.txt',data:(pack?.consultation_replies||[]).map(item=>`客户：${publicationText(item.question)}\n回复：${publicationText(item.reply)}`).join('\n\n')});
    saveBlob(zipFiles(files),`${platform}-图文素材.zip`);
   }else{
    const entries=await Promise.all(output.image_plan.map(async plan=>{const url=mediaUrl(images.get(plan.source_ref));if(!url)throw Error('配图未准备完整，请补图后导出。');const response=await fetch(url);if(!response.ok)throw Error('配图读取失败，请重试。');return [plan.source_ref,await fileData(await response.blob())];}));
    const pngs=await Promise.all(cards.map(async card=>(await cardCanvas(card)).toDataURL('image/png')));
    saveBlob(new Blob([publicationHtml(result,Object.fromEntries(entries),pngs)],{type:'text/html;charset=utf-8'}),`${platform}-图文草稿.html`);
   }
  }catch(error){setExportError(error.message);}finally{setExporting(false);}
 }
 return <div className="result-view">
  {retrieval?.mode==='cached'?<div className="warning">使用此前保存的资料。原始资料日期：{retrieval.source_created_at}。</div>:null}
  {blocked?<div className="error" role="alert">已暂停成稿与复制。{(delivery.reasons||[]).map((text,i)=><p key={i}>{text}</p>)}</div>:<>
   {cards.length?<section className="publication-package" aria-label="小红书图卡"><div className="deliverable-heading"><div><h3>这一套图文，准备好了</h3><p className="fine">1 张封面 + 3 张判断卡 · 图片与文案一起下载</p></div><button className="primary" disabled={exporting||delivery?.status==='needs_images'} onClick={()=>exportPublication('zip')}>{exporting?'正在打包…':'下载图文素材'}</button></div><div className="note-card-grid">{cards.map(card=><PublicationCard key={card.index} card={card}/>)}</div></section>:null}
   <section className="deliverable" aria-label="完整文案"><div className="deliverable-heading"><h3>完整文案</h3><button onClick={onCopy}>复制文案</button></div><h4 className="copy-title">{publicationText(output.content.title)}</h4>
    {cards.length?<p className="copy-body">{publicationText(output.content.body)}</p>:publicationBlocks(output).map((block,index)=><div className="publication-block" key={index}>{block.beforeImages.map(plan=><EvidenceImage key={plan.source_ref} plan={plan} source={images.get(plan.source_ref)}/>)}<p className="copy-body">{publicationText(block.text)}</p>{block.images.map(plan=><EvidenceImage key={plan.source_ref} plan={plan} source={images.get(plan.source_ref)}/>)}</div>)}
    <p className="copy-body">{publicationText(output.content.call_to_action)}</p>{delivery?.status==='needs_images'?<p className="warning">{(delivery.reasons||['配图不足，请补充后使用。']).join('；')}</p>:null}
   </section>
   <div className="integration-actions"><button onClick={()=>downloadText(copy,`${platform}文案.txt`)}>导出{platform}文案</button><button disabled={exporting||delivery?.status==='needs_images'} onClick={()=>exportPublication('html')}>{exporting?'正在打包图片…':'导出图文 HTML'}</button></div>
   {exportError?<p className="error" role="alert">{exportError}</p>:null}
   {pack?.consultation_replies?.length?<details className="supporting-details consultation-replies"><summary>客户来问了，怎么回 · 2 条参考</summary>{pack.consultation_replies.map((item,index)=><article key={index}><h4>{publicationText(item.question)}</h4><p>{publicationText(item.reply)}</p><button onClick={()=>navigator.clipboard.writeText(publicationText(item.reply)).catch(()=>setExportError('复制失败，请选中文本复制。'))}>复制这条回复</button></article>)}</details>:null}
  </>}
  <details className="supporting-details"><summary>{blocked?'查看核验问题':review?.status==='passed'?'资料依据与核验记录':'查看核验状态'}{review?.claims?.length?` · ${review.claims.length} 项`:''}</summary><p className="fine">产品资料：{retrieval?.archive_name||'随附知识库'}。模型辅助审查：{verdictNames[review?.status]||'未执行'}；具体配置与实际使用条件请核对。</p>{(review?.claims||[]).map((claim,index)=><article className="claim-record" key={claim.id||index}><strong>{verdictNames[claim.status||claim.verdict]||claim.status||claim.verdict}</strong><p>{claim.text||claim.claim||claim.sentence}</p><p className="fine">{claim.reason}</p>{claim.quote?<blockquote>{claim.quote}</blockquote>:null}</article>)}{(review?.issues||[]).map((issue,index)=><p key={index}>{typeof issue==='string'?issue:issue.message||issue.reason}</p>)}
   <h3>使用条件与待确认事项</h3><ul>{output.pending_confirmation.map((text,i)=><li key={i}>{text}</li>)}</ul><p className="fine">{result.checks?.note}</p>{sources.filter(s=>output.source_refs.includes(s.ref)).map(source=><details key={source.ref}><summary>{source.ref} · {source.title}</summary><p className="copy-body">{source.text||source.path}</p></details>)}
  </details>
 </div>;
}
