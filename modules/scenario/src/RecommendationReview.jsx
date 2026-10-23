import React from 'react';
export function RecommendationReview({recommendation}){
 if(!recommendation.counts)return null;
 const {counts,requirements,candidates}=recommendation;
 return <details className="recommendation-review"><summary>为什么推荐这款？查看筛选过程</summary>
  <p className="fine">资料库 {counts.total} 款 → 满足明确系统要求 {counts.system_allowed} 款 → 命中需求证据 {counts.matched} 款。下方展示前三个候选。</p>
  <div className="recommendation-needs">{requirements.map(r=><span key={r.id} title={r.source_text}>{r.label}{r.priority?' · 优先':''} · {r.weight} 分</span>)}</div>
  <p className="fine">分数仅表示本次需求的证据匹配程度，不是性能排名。明确“最看重、优先”的需求加倍；通用阅读、输入各 1 分，专项需求 3—4 分。同分按型号名称稳定排列。</p>
  <div className="recommendation-comparison">{candidates.map(c=><article key={c.name}><h4>{c.name}<span>{c.score} 分</span></h4><ul>{c.reasons.map(r=><li key={r.id}>{r.requirement} → {r.label}（+{r.points}）<details><summary>原话与产品依据</summary><p>需求：{r.source_text}</p><p>{r.evidence}</p><small>{r.source_path}</small></details></li>)}</ul>{c.unmatched.length?<p className="fine">本轮未匹配到证据：{c.unmatched.join('、')}；不等于产品不支持。</p>:null}</article>)}</div>
 </details>;
}
