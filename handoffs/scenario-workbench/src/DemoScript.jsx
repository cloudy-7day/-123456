import React from 'react';
import {demoScriptText} from '../shared/demo-script.mjs';
import {downloadBlob} from './output';
export function DemoScript({script,product,paused,disabled,onNotice,onError}){
 const text=()=>demoScriptText(script,{product,paused});
 async function copy(){try{await navigator.clipboard.writeText(text());onNotice('店员演示脚本已复制。');}catch{onError('复制失败，请使用下载脚本。');}}
 return <section className="demo-script" aria-label="店员演示脚本"><div className="section-heading"><div><p className="eyebrow">把需求带到现场验证</p><h2>店员演示脚本</h2></div><div className="script-actions"><button className="secondary" disabled={disabled||!script} onClick={copy}>复制脚本</button><button className="secondary" disabled={disabled||!script} onClick={()=>downloadBlob(new Blob([text()],{type:'text/plain;charset=utf-8'}),'店员演示脚本.txt')}>下载脚本</button></div></div>
 {script?<><div className="script-intro"><h3>{script.title}</h3><p>建议 {script.durationMinutes} 分钟 · 待现场执行</p><p>{paused?'关键条件尚待确认，当前脚本用于验证需求，适配判断保持暂停。':'根据现场结果确认下一步，不预设演示已经成功。'}</p></div><div className="script-setup"><div><h3>演示前准备</h3><ul>{script.preparation.map((x,i)=><li key={i}>{x}</li>)}</ul></div><div><h3>开场话术</h3><blockquote>{script.opening}</blockquote></div></div><div className="script-steps">{script.steps.map((s,i)=><article key={i}><header><span>0{i+1}</span><h3>{s.title}</h3></header><div className="script-step-grid"><div><h4>店员说</h4><blockquote>{s.say}</blockquote><h4>向客户确认</h4><p>{s.question}</p></div><div><h4>现场做</h4><p>{s.action}</p><h4>观察与记录</h4><p>{s.observe}</p></div></div><div className="script-branch"><strong>未通过 / 条件不足时</strong><p>{s.onIssue}</p></div></article>)}</div><div className="script-close"><h3>结束话术</h3><blockquote>{script.closing}</blockquote><p>现场记录请填写：软件版本 / 样机配置、测试任务、实际观察、客户反馈、未解决问题与下一步。下载脚本已附记录栏。</p></div></>:<p className="muted">生成后，这里会提供可直接使用的开场话术、逐步操作、客户提问、观察记录与异常处理。脚本随内容包一起导出。</p>}
 </section>;
}
