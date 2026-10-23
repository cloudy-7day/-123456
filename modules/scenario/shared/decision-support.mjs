import {suggestProduct,assessProductConstraints,numericRequirements,restrictSystems,positiveFactClauses,portableIntent} from './product-suggestion.mjs';

const uncertain=/不清楚|不知道|不确定|未知|待确认|没定|未定|不了解|是否/;
const evidenceOf=items=>items.flatMap(o=>o.evidence?.length?o.evidence:[{sourceId:'customer_input',quote:o.value}]);
const unique=items=>[...new Set(items)];
const requirementClauses=text=>String(text||'').split(/[，,。；;！!\n]|但是|而且|并且|不过|但/).map(t=>t.trim()).filter(Boolean);
const collaborationTopic=/协同|互传|传文件|传照片|传资料|投屏|镜像|扩展屏|拓展屏|碰一碰|搬(?:来搬去|资料|文件)/;
const declinedCollaboration=text=>!uncertain.test(text)&&collaborationTopic.test(text)&&(/(?:没有|不需要|无需|不要求|不用|不考虑|不打算).{0,18}(?:协同|互传|传文件|传照片|传资料|投屏|镜像|扩展屏|拓展屏|碰一碰)/.test(text)||/(?:协同|互传|投屏|扩展屏|拓展屏).{0,12}(?:没有.*(?:需求|要求)|不需要|无要求|无需求)/.test(text));
const collaborationScope=text=>/手机/.test(text)?'phone':/平板/.test(text)?'tablet':'any';
function activeCollaborationSignals(positive,facts,sources){
 const order=new Map((sources||[]).map((source,i)=>[source.id,i]));
 const sourceOrder=observation=>Math.max(0,...(observation.evidence||[]).map(e=>order.get(e.sourceId)??0));
 const declined=facts.flatMap(observation=>requirementClauses(observation.value).filter(declinedCollaboration).map(text=>({scope:collaborationScope(text),order:sourceOrder(observation)})));
 return positive.filter(({observation,text})=>observation.category==='collaboration'||/传(?:文件|照片|素材)|(?:手机|平板).*(?:传|投屏|协同|互传|整理到|拷|搬)|多屏|投屏|镜像|扩展屏|拓展屏|碰一碰/.test(text))
  .filter(({observation,text})=>!declined.some(d=>d.order>=sourceOrder(observation)&&(d.scope==='any'||d.scope===collaborationScope(text))));
}


// This layer explains evidence-backed choices. It does not certify purchase suitability.
export function explainDecision(analysis,catalog,{manualProduct}={}){
 const products=Array.isArray(catalog)?catalog:catalog?.products||[];
 const understanding=analysis?.understanding||{product:{status:'unspecified',name:null},observations:[]};
 const facts=(understanding.observations||[]).filter(o=>o.kind==='fact'&&typeof o.value==='string');
 const positive=positiveFactClauses(facts);
 const signalFacts=predicate=>[...new Set(positive.filter(predicate).map(signal=>signal.observation))];
 const text=facts.map(o=>o.value).join('；');
 const checked=assessProductConstraints(facts,products);
 const suggested=suggestProduct({understanding:{...understanding,product:understanding.product||{status:'unspecified',name:null}}},products);
 const limitations=[...suggested.limitations,...checked.limitations];
 let candidates=suggested.candidates.map(c=>({...c,evidence_status:'candidate_requires_review'}));
 if(manualProduct){
  const chosen=products.find(p=>p.name===manualProduct);
  if(!chosen){candidates=[];limitations.push('手动产品不在当前目录中，请选择完整型号及系统版本。');}
  else if(checked.products.includes(chosen))candidates=[{name:chosen.name,reasons:suggested.candidates.find(c=>c.name===chosen.name)?.reasons||[],evidence_status:'manually_selected_requires_review'}];
  else candidates=[];
 }
 // Hard numbers can identify useful candidates even when no optional feature keyword occurs.
 const limits=numericRequirements(facts);
 if(!manualProduct&&understanding.product?.status!=='ambiguous'&&!understanding.product?.name&&!candidates.length&&limits.length){
  candidates=checked.products.map(p=>({name:p.name,evidence_status:'candidate_requires_review',reasons:limits.flatMap(limit=>{
   const field=p.profile?.[limit.kind];
   if(!field?.values?.length||!field.values.every(v=>v.evidence&&v.source_path))return [];
   return [{label:`${limit.kind==='weight'?'重量':'屏幕'}资料与已给数值要求对照，具体版本待核验`,evidence:field.values.map(v=>v.evidence).join('\n'),source_path:field.values[0].source_path}];
  })})).filter(c=>c.reasons.length).slice(0,3);
 }
 const targets=manualProduct?checked.products.filter(p=>p.name===manualProduct):checked.products;
 const revisions=(analysis?.input?.sources||[]).filter(s=>s.type==='revision').map(s=>s.text||'');
 const questions=[];
 const add=(id,topic,question,why,affects,relevant)=>{
  if(revisions.some(t=>t.includes(id)||t.includes(question)))return;
  if(!relevant.length||!targets.length)return;
  questions.push({id,topic,question,why,affects,evidence:evidenceOf(relevant)});
 };
 const taskFacts=facts.filter(o=>!['product','budget','os'].includes(o.category));
 const workload=taskFacts.filter(o=>/AI|模型|训练|剪辑|渲染|三维|建模|几万行|宏|插件|AutoCAD|编程|写代码/i.test(o.value)&&!/(?:不做|不需要|不用|无需|不要求).{0,8}(?:AI|模型|训练|剪辑|渲染|三维|建模|宏|插件)/i.test(o.value));
 const softwareKnown=facts.some(o=>o.category==='software'&&!uncertain.test(o.value)&&/\d|无插件|没有插件|仅.*网页|仅.*浏览器/.test(o.value));
 const runKnown=/本地|本机|远程|云端|服务器|网页版|浏览器/.test(text.replace(/(?:不清楚|不知道|不确定|尚未确认)[^；。]*/g,''));
 if(workload.length&&!(softwareKnown&&runKnown))add('software_workflow','software','必须使用哪些软件、版本或插件？主要在本机运行，还是连接远程环境？','具体软件与运行方式会改变系统选择和需要核验的能力；“编程/AI/剪辑”本身不能证明某机型适配。',['系统候选','软件兼容核验','本地或远程任务边界'],workload);
 const collaboration=[...new Set(activeCollaborationSignals(positive,facts,analysis?.input?.sources).map(signal=>signal.observation))];
 const deviceFacts=facts.filter(o=>['devices','collaboration'].includes(o.category));
 const deviceKnown=deviceFacts.some(o=>!uncertain.test(o.value)&&/(?:Mate|Pura|nova|iPhone|iPad|MatePad|荣耀|小米|vivo|OPPO|Pixel).{0,12}\d/i.test(o.value))&&deviceFacts.some(o=>!uncertain.test(o.value)&&/(?:HarmonyOS|鸿蒙|iOS|Android|安卓|系统).{0,5}\d/i.test(o.value));
 if(collaboration.length&&!deviceKnown)add('collaboration_devices','collaboration','要与哪款手机或平板协同、系统版本是什么？最需要传文件、投屏还是扩展屏？','同品牌不代表每个设备、版本和动作都支持；答案决定该检索哪些功能条件。',['设备协同功能证据','型号与版本条件'],collaboration);
 const systemRelevant=facts.filter(o=>/系统|Windows|鸿蒙|Harmony|Linux|macOS/i.test(o.value));
 const systemResolved=restrictSystems(facts,products).length<products.length||systemRelevant.some(o=>/都行|均可|不限|无.*要求|不强求/.test(o.value));
 if(!questions.some(q=>q.id==='software_workflow')&&!systemResolved&&new Set(targets.map(p=>p.system)).size>1&&systemRelevant.length)add('system_choice','os','电脑系统有必须使用或不能接受的选项吗？如果没有限制，也可以直接说明。','当前目录含不同系统，只有明确要求才用于排除；不会从职业或手机品牌代替你决定。',['系统候选排除'],systemRelevant);
 const mobility=signalFacts(signal=>portableIntent(signal)||/重量/.test(signal.text));
 const distinctWeights=new Set(targets.flatMap(p=>p.profile?.weight?.values?.map(v=>v.value)||[])).size>1;
 if(mobility.length&&distinctWeights&&!limits.some(l=>l.kind==='weight')&&!/重量.*(?:无上限|没.*上限|不限|只是偏好)/.test(text))add('weight_limit','mobility','轻便是偏好，还是有不能超过的重量？若有上限，是只算电脑还是包含键盘、充电器？','不同候选的重量与计重范围不同，明确上限才会用于筛选。',['重量候选排除','配件与配置核验'],mobility);
 const screenFacts=signalFacts(({observation,text})=>/大屏|小屏|屏幕尺寸|屏幕大小/.test(text)||(observation.category==='experience'&&/显示区域|显示空间|屏幕.{0,8}(?:大|小|宽)/.test(text)));
 const distinctScreens=new Set(targets.flatMap(p=>p.profile?.screen?.values?.map(v=>v.value)||[])).size>1;
 if(screenFacts.length&&distinctScreens&&!limits.some(l=>l.kind==='screen')&&!/屏幕.*(?:无.*限制|不限|只是偏好)/.test(text))add('screen_need','experience','屏幕大小是偏好还是必须条件？如果必须，请说明尺寸范围，以及是否接受折叠屏的不同状态。','展开屏尺寸与日常使用状态不等价，明确后才能比较或排除。',['屏幕尺寸候选','展开或折叠状态核验'],screenFacts);
 if(!candidates.length)limitations.push(suggested.reason);
 return {candidates,questions:questions.slice(0,2),exclusions:checked.exclusions,limitations:unique(limitations)};
}
