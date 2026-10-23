import React,{useState} from 'react';
import {roleExamples,buildRoleExample} from '../shared/role-examples.mjs';

export const commuteExample={
 id:'commute-lightweight',
 label:'通勤示例',
 text:'每天背电脑坐地铁通勤，还要带充电器；主要写文档、开视频会议，想轻一点，但不清楚常用软件是否适配。',
 fiction:'演示场景，可按实际客户情况修改。',
};

export function ExamplePicker({onApply}){
 const [roleId,setRoleId]=useState('student');
 const [selections,setSelections]=useState(()=>Object.fromEntries(roleExamples.map(r=>[r.id,[...r.defaults]])));
 const role=roleExamples.find(r=>r.id===roleId),selected=selections[roleId];
 function toggle(id){setSelections(old=>({...old,[roleId]:old[roleId].includes(id)?old[roleId].filter(s=>s!==id):[...old[roleId],id]}));}
 const preview=selected.length?buildRoleExample(roleId,selected):null;
 return <div className="example-picker">
  <p className="example-intro">也可以从其他身份与任务开始。示例可以自由修改。</p>
  <div className="example-roles" aria-label="示例身份">{roleExamples.map(r=><button type="button" key={r.id} aria-pressed={r.id===roleId} onClick={()=>setRoleId(r.id)}>{r.label}</button>)}</div>
  <div className="example-scene-heading"><strong>{role.label}的场景</strong><span>可多选 · 已选 {selected.length} 项</span></div>
  <div className="example-scenes" role="group" aria-label={role.label+'场景选项'}>{role.scenes.map(s=><label key={s.id} className={selected.includes(s.id)?'selected':''}><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/><span><strong>{s.label}</strong><small>{s.detail}</small></span></label>)}</div>
  {preview?<details className="example-preview"><summary>预览组合后的示例</summary><p>{preview.text}</p></details>:<p role="status">至少选择一个场景即可填入示例。</p>}
  <button type="button" className="example-apply" disabled={!preview} onClick={()=>onApply(preview)}>填入这些场景</button>
  <small className="example-hint">点击填入会替换上方输入；切换身份和勾选场景不会改动已写内容。</small>
 </div>;
}
