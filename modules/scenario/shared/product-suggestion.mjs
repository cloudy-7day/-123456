const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/^(huawei|华为)\s*/,'').replace(/\s+/g,'');
const taskFeatures=[
 ['portable',/携带|背(?:着)?电脑|带(?:着)?电脑|通勤|轻便|轻薄|图书馆|出差|差旅/],
 ['large_screen',/大屏|(?:16|17|18)\s*英寸/],
 ['screen',/阅读|文档|课程网页|看书|读.{0,8}(?:文献|资料|合同)|(?:审阅|对照|比对).{0,8}合同|合同.{0,8}(?:审阅|对照|比对)/],
 ['keyboard',/编程|写代码|打字|键盘|写论文|写作/],
 ['oled',/OLED|色彩|屏幕显示/i],
 ['pen',/手写|画画|绘图/],
 ['privacy',/隐私|防窥/],
 ['foldable',/折叠/],
];
const limitations=['候选依据是资料中的产品特征，具体销售版本仍需核对。','仅按已列证据匹配；重量与屏幕硬性条件仅在资料口径明确时筛选，接口、内存等其余条件仍需逐项核验。','知识库未提供可用的本次成交价，尚未验证预算适配。','专业软件、机构系统及实际工作流兼容性尚未验证，需按具体任务核对。'];
const clauses=text=>String(text||'').split(/[，,。；;！!\n]|但是|而且|并且|不过|但/).map(x=>x.trim()).filter(Boolean);
const uncertain=/不清楚|不知道|不确定|未知|待确认|是否|不了解/;
const negative=/不需要|不想|不要|不用|不使用|不接受|不选|拒绝|排除|无需|不考虑|不在意|不追求|不要求|不关心|不看重|不介意|没必要|没有.*需求|无所谓|随便|都行|均可/;
const excludedSystem=/不接受|不能|不使用|不用|不要|不选|不考虑|不支持|拒绝|排除|禁止/;
const flexibleSystem=/都行|均可|也行|都可以|也可以|无所谓|不限|不强求|不强制|不要求|不在意|非必须|不是必须|不一定|不需要|无需|不必|没有.*要求/;
// Categories are a soft signal only for explicitly quoted positive facts. Unknown rows
// are deliberately present in every analysis and must never activate a feature.
export function positiveFactClauses(observations=[]){
 return observations.filter(o=>o.kind==='fact'&&typeof o.value==='string').flatMap(observation=>clauses(observation.value)
  .filter(text=>!negative.test(text)&&!uncertain.test(text)&&!/[不没未]/.test(text.replace(/不同(?=版本|的版本|格式|的格式|文件|的文件|合同|的合同)/g,'')))
  .map(text=>({observation,text})));
}
export function portableIntent({observation,text}){
 if(/携带|背(?:着)?电脑|带(?:着)?电脑|通勤|轻便|轻薄|图书馆|出差|差旅/.test(text))return true;
 // A battery-only requirement is not evidence of a request for a light chassis.
 return observation.category==='mobility'&&(!/续航|电池|电量|充电|插座|离电/.test(text)||/随身|拎着|跑来跑去|来回跑|出门/.test(text));
}
const systems=[['Windows',/windows/i],['HarmonyOS',/鸿蒙|harmony(?:os)?/i],['Linux',/linux/i],['macOS',/macos|苹果系统/i]];
const conditionalSystem=/如果|假如|假设|要是|可能|也许|据说|听说/;
const nonExclusiveSystem=/不(?:是)?只|并非只|不(?:是)?仅|并非仅|不仅|不只|不限于/;
const exclusiveRuntime=(text,pattern)=>new RegExp(`(?:只|仅)(?:支持|兼容)\\s*(?:${pattern.source})|(?:只|仅)(?:能|可)?(?:在)?\\s*(?:${pattern.source})\\s*(?:系统)?(?:上|下)?\\s*(?:运行|安装|使用|可用)`,'i').test(text);
function softwareNotRequired(text){
 return /(?:不使用|不用|不需要|无需|不考虑|不打算使用|不再使用).{0,32}(?:软件|应用|程序|插件|工具)/.test(text)||/(?:软件|应用|程序|插件|工具).{0,12}(?:不用了|不再使用|已停用|已经停用)/.test(text);
}
export function restrictSystems(observations=[],products=[]){
 let candidates=products;
 const positive=new Set(),excluded=new Set(),facts=observations.filter(o=>o.kind==='fact'&&typeof o.value==='string');
 // A supported remote/web alternative changes the required runtime, not automatically
 // the host OS. Keep compatibility unverified; only an explicit alternative relaxes it.
 const explicitClauses=positiveFactClauses(facts).map(x=>x.text).filter(t=>!conditionalSystem.test(t));
 const localRequired=explicitClauses.some(t=>/(?:必须|只能|要求).{0,8}(?:本机|本地).{0,8}(?:运行|安装|使用)/.test(t)||/(?:本机|本地).{0,8}(?:必须|只能).{0,8}(?:运行|安装|使用)/.test(t));
 const alternativeAccepted=!localRequired&&explicitClauses.some(t=>/(?:远程桌面|远程运行|远程环境|云端运行|云桌面|网页版|浏览器使用|虚拟机|兼容层)/.test(t)&&/(?:可以|接受|愿意|允许|已有|有可用|改用|通过|使用)/.test(t));
 for(const observation of facts){
  for(const text of clauses(observation.value)){
   if(uncertain.test(text)||conditionalSystem.test(text)||flexibleSystem.test(text)||nonExclusiveSystem.test(text)||(/或/.test(text)&&!excludedSystem.test(text)))continue;
   const softwareContext=observation.category==='software'||/软件|应用|程序|插件|工具/.test(text);
   if(softwareContext&&softwareNotRequired(text))continue;
   for(const [system,pattern] of systems){
    if(!pattern.test(text))continue;
    const runtimeOnly=softwareContext&&exclusiveRuntime(text,pattern);
    if(runtimeOnly){
     if(!alternativeAccepted)positive.add(system);
     continue;
    }
    // A clear exclusion remains a restriction even when extracted outside the OS category.
    if(observation.category!=='os'&&!/必须|只能|要求|只用/.test(text)&&!excludedSystem.test(text))continue;
    if(excludedSystem.test(text))excluded.add(system);
    else positive.add(system);
   }
  }
 }
 if(positive.size>1)return [];
 if(positive.size)candidates=candidates.filter(p=>positive.has(p.system));
 return candidates.filter(p=>!excluded.has(p.system));
}
const observedEvidence=o=>o.evidence?.length?o.evidence:[{sourceId:'customer_input',quote:o.value}];
export function numericRequirements(observations=[]){
 const limits=[];
 for(const o of observations.filter(o=>o.kind==='fact')){
  for(const text of clauses(o.value)){
   if(uncertain.test(text)||/不是必须|不要求|没有.*上限|不限制/.test(text))continue;
   const units='(kg|g|公斤|千克|克)';
   const maxWeight=new RegExp('(?:重量|机身|整机|电脑|含.{0,8}配件|总重).{0,12}?(?:不能超过|不得超过|不超过|最多|上限(?:是|为)?|必须低于|必须小于|必须不超过)\\s*(\\d+(?:\\.\\d+)?)\\s*'+units,'i');
   const withinWeight=new RegExp('(?:重量|机身|整机|电脑|总重).{0,8}?(?:必须|只能).{0,4}?(\\d+(?:\\.\\d+)?)\\s*'+units+'(?:以内|以下)','i');
   const w=text.match(maxWeight)||text.match(withinWeight);
   if(w){const n=Number(w[1])*(/^(g|克)$/i.test(w[2])?.001:1);limits.push({kind:'weight',operator:'max',exclusive:/必须低于|必须小于/.test(w[0]),value:n,unit:'kg',scope:/含.*(?:充电器|配件|键盘)|总重|总携带/.test(text)?'total':'device',evidence:observedEvidence(o),text});}
   const screenMin=text.match(/(?:屏幕|屏|尺寸).{0,10}?(?:至少|不能小于|不得小于|不小于|最低|必须大于|必须达到)\s*(\d+(?:\.\d+)?)\s*英寸/);
   const screenMax=text.match(/(?:屏幕|屏|尺寸).{0,10}?(?:不能超过|不得超过|不超过|最多|最大|必须小于)\s*(\d+(?:\.\d+)?)\s*英寸/);
   const screenBound=text.match(/(?:屏幕|屏|尺寸).{0,10}?必须\s*(\d+(?:\.\d+)?)\s*英寸(以上|以下)/);
   if(screenMin)limits.push({kind:'screen',operator:'min',exclusive:/必须大于/.test(screenMin[0]),value:Number(screenMin[1]),unit:'inch',evidence:observedEvidence(o),text});
   if(screenMax)limits.push({kind:'screen',operator:'max',exclusive:/必须小于/.test(screenMax[0]),value:Number(screenMax[1]),unit:'inch',evidence:observedEvidence(o),text});
   if(screenBound)limits.push({kind:'screen',operator:screenBound[2]==='以上'?'min':'max',value:Number(screenBound[1]),unit:'inch',evidence:observedEvidence(o),text});
  }
 }
 return limits;
}
export function assessProductConstraints(observations=[],products=[]){
 const systemAllowed=new Set(restrictSystems(observations,products));
 const limits=numericRequirements(observations),exclusions=[],warnings=[];
 for(const p of products){
  if(!systemAllowed.has(p)){
   const evidence=observations.filter(o=>o.kind==='fact'&&/windows|鸿蒙|harmony|linux|macos|苹果系统/i.test(o.value)).flatMap(observedEvidence);
   exclusions.push({name:p.name,reason:'目录系统与客户明确的系统限制冲突。',evidence,source_evidence:[{evidence:`产品目录：${p.name}；系统：${p.system}`,source_path:p.profile?.source_path||p.features?.[0]?.source_path||'knowledge/catalog.json'}]});
   continue;
  }
  for(const limit of limits){
   const field=p.profile?.[limit.kind];
   const values=(field?.values||[]).filter(v=>Number.isFinite(v.value)&&v.evidence&&v.source_path);
   if(!values.length){warnings.push(`${p.name}：缺少可核对的${limit.kind==='weight'?'重量':'屏幕尺寸'}数据，未判定满足“${limit.text}”。`);continue;}
   const outside=v=>limit.operator==='max'?(limit.exclusive?v.value>=limit.value:v.value>limit.value):(limit.exclusive?v.value<=limit.value:v.value<limit.value);
   const fails=values.every(outside);
   if(fails){exclusions.push({name:p.name,reason:`资料所列${limit.kind==='weight'?'重量':'屏幕尺寸'}均不符合“${limit.text}”。`,evidence:limit.evidence,source_evidence:values.map(({evidence,source_path})=>({evidence,source_path}))});break;}
   const partlyFails=values.some(outside);
   if(partlyFails||field.status==='conditional'||field.scope==='partial_device'||limit.scope==='total')warnings.push(`${p.name}：${limit.kind==='weight'?'重量':'屏幕'}有配置、状态或测量口径条件；“${limit.text}”仍需确认具体版本${limit.scope==='total'?'及所需配件总重':''}。`);
  }
 }
 return {products:products.filter(p=>!exclusions.some(x=>x.name===p.name)),exclusions,limitations:[...new Set(warnings)]};
}
export function suggestProduct(analysis,products){
 const {product,observations=[]}=analysis.understanding;
 const empty=reason=>({name:'',reason,candidates:[],limitations:[...limitations]});
 if(!products.length)return empty('资料目录未取得，请重试。');
 if(product.status==='ambiguous')return empty('输入包含多个产品意向，请选择一个具体型号。');
 const allowed=assessProductConstraints(observations,products).products;
 if(!allowed.length)return empty('资料目录中没有符合已核对硬性限制的候选，请核对原始要求及产品资料。');
 if(product.name){
  const query=normalize(product.name);
  const matches=products.filter(p=>normalize(p.name)===query||normalize(p.model)===query);
  const related=products.filter(p=>normalize(p.model).startsWith(query));
  if(matches.length!==1||!(normalize(matches[0].name)===query||related.length===1))return empty('型号或系统版本不明确，请从资料目录选一个；无需填写其他未知信息。');
  const selected=matches[0];
  if(!allowed.includes(selected))return empty('输入指定的型号与明确系统、重量或屏幕限制冲突，请核对后选择。');
  return {name:selected.name,reason:'已从资料目录匹配输入中的型号；适配仍需核验。',candidates:[{name:selected.name,reasons:[]}],limitations:[...limitations]};
 }
 const positive=positiveFactClauses(observations).filter(({observation:o})=>!['budget','os','devices','product'].includes(o.category));
 const desired=new Set(taskFeatures.filter(([,pattern])=>positive.some(({text})=>pattern.test(text))).map(([id])=>id));
 for(const signal of positive){
  if(portableIntent(signal))desired.add('portable');
  if(signal.observation.category==='experience'){
   if(/屏|显示|看字|文字显示|画面/.test(signal.text))desired.add('screen');
   if(/键盘|敲字|码字|触控板|键帽|键程|输入文字|文字输入/.test(signal.text))desired.add('keyboard');
  }
 }
 const candidates=allowed.map((p,index)=>({name:p.name,index,reasons:(p.features||[]).filter(f=>desired.has(f.id)&&f.evidence&&f.source_path).map(({label,evidence,source_path})=>({label,evidence,source_path}))}))
  .filter(p=>p.reasons.length).sort((a,b)=>b.reasons.length-a.reasons.length||a.index-b.index).slice(0,3).map(({index,...p})=>p);
 if(!candidates.length)return empty('当前明确需求尚未匹配到有资料依据的产品特征，请选择本轮型号。');
 return {name:candidates[0].name,reason:'根据明确需求与知识库产品特征提出候选；可查看依据并更换，不代表客户已选择。',candidates,limitations:[...limitations]};
}
