import React,{useState} from 'react';
import {roleExamples,buildRoleExample,supplementExamples} from '../shared/role-examples.mjs';
import {taskTemplates} from '../shared/scenario-card.mjs';

export function ExamplePicker({onApply}){
 const [roleId,setRoleId]=useState('student');
 const [selections,setSelections]=useState(()=>Object.fromEntries(roleExamples.map(r=>[r.id,[...r.defaults]])));
 const role=roleExamples.find(r=>r.id===roleId),selected=selections[roleId];
 function toggle(id){setSelections(old=>({...old,[roleId]:old[roleId].includes(id)?old[roleId].filter(s=>s!==id):[...old[roleId],id]}));}
 const preview=selected.length?buildRoleExample(roleId,selected):null;
 return <div className="example-picker">
  <p className="example-intro">从身份选一个任务示例，或直接写下客户描述。任务与问题会自动整理，无需逐项填表。</p>
  <div className="task-starters" aria-label="主要示例">{roleExamples.filter(r=>taskTemplates[r.id]).map(r=>{const t=taskTemplates[r.id];return <article className="task-starter" key={r.id}><span className="eyebrow">{t.entry}入口 · 虚构任务示例</span><h3>{t.title}</h3><p className="task-route">{r.scenes.filter(s=>r.defaults.includes(s.id)).map(s=>s.label).join(' → ')}</p><p>{t.problem}</p><p className="example-selection-brief">{r.selectionBrief}</p><p>按所选渠道创作 · 产品可自动匹配</p><button type="button" onClick={()=>{setRoleId(r.id);setSelections(old=>({...old,[r.id]:[...r.defaults]}));onApply(buildRoleExample(r.id,r.defaults));}}>填入{r.label}示例</button></article>;})}</div>
  <details><summary>赛题业务场景补充示例</summary><p className="fine">借鉴队友的任务式输入，按赛题业务场景补充。以下均为可修改的虚构营销任务。</p><div className="supplement-examples">{supplementExamples.map(example=><button key={example.id} type="button" onClick={()=>onApply(example)}>{example.title} ↗</button>)}</div></details>
  <details><summary>调整学生或职场会议的场景</summary>
  <div className="example-roles" aria-label="示例身份">{roleExamples.map(r=><button type="button" key={r.id} aria-pressed={r.id===roleId} onClick={()=>setRoleId(r.id)}>{r.label}</button>)}</div>
  <div className="example-scene-heading"><strong>{role.label}的场景</strong><span>可多选 · 已选 {selected.length} 项</span></div>
  <div className="example-scenes" role="group" aria-label={role.label+'场景选项'}>{role.scenes.map(s=><label key={s.id} className={selected.includes(s.id)?'selected':''}><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/><span><strong>{s.label}</strong><small>{s.detail}</small></span></label>)}</div>
  {preview?<details className="example-preview"><summary>预览组合后的示例</summary><p>{preview.text}</p></details>:<p role="status">至少选择一个场景即可填入示例。</p>}
  <button type="button" className="example-apply" disabled={!preview} onClick={()=>onApply(preview)}>填入这些场景</button>
  <small className="example-hint">点击填入会替换上方输入；切换身份和勾选场景不会改动已写内容。</small>
 </details></div>;
}
