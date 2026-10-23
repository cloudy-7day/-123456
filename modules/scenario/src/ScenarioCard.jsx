import React from 'react';
import {cardKindLabels} from '../shared/scenario-card.mjs';
function Value({item}){return <><span className={'card-origin '+item.kind}>{cardKindLabels[item.kind]}</span><p>{item.value}</p></>;}
export function ScenarioCard({card,onEdit,stale=false}){
 return <section className="task-scenario-card" aria-label="本轮场景卡">
  <div className="task-card-heading"><div><span className="eyebrow">从身份到任务</span><h2>本轮场景卡 · {card.title}</h2></div>{onEdit?<button type="button" className="text-button" onClick={onEdit}>修改原始描述</button>:null}</div>
  {stale?<p className="warning">输入已修改；继续生成时会自动更新这张卡。</p>:null}
  <div className="task-card-grid">
   <div><h3>面向谁</h3><Value item={card.identity}/>{card.business_scene?<><h3>业务场景</h3><Value item={card.business_scene}/></>:null}</div>
   <div><h3>主要问题</h3><Value item={card.problem}/></div>
   <div className="task-card-tasks"><h3>要完成什么</h3><ol>{card.tasks.map((item,i)=><li key={i}>{item.scene_label?<strong>{item.scene_label} · </strong>:null}<Value item={item}/></li>)}</ol></div>
   <div><h3>本轮发布渠道</h3><p>{card.platform.value}</p><p className="fine">围绕任务、遇到的麻烦和有依据的产品帮助，串成一篇完整文案。</p></div>
  </div>
  <details className="task-card-evidence"><summary>查看购买阶段、产品与提取依据</summary><div className="task-card-grid"><div><h3>购买阶段</h3><Value item={card.buying_stage}/></div><div><h3>本轮产品</h3><Value item={card.product}/></div></div>
   {[card.identity,...card.tasks,card.problem,card.buying_stage,card.goal].filter(x=>x.evidence.length).map((item,i)=><div className="task-card-quote" key={i}><p>{item.value}</p>{item.evidence.map((e,j)=><blockquote key={j}>“{e.quote}”</blockquote>)}</div>)}
  </details>
  <p className="fine">建议补充用于写作情境，不代表客户已确认；预算、已有设备等未说明的信息无需补齐。</p>
 </section>;
}
