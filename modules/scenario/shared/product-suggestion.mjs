const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/^(huawei|华为)\s*/,'').replace(/\s+/g,'');
const taskFeatures=[
 ['portable',/携带|背电脑|带电脑|通勤|轻便|轻薄|图书馆|出差|差旅/],
 ['large_screen',/大屏|(?:16|17|18)\s*英寸/],
 ['screen',/阅读|文档|课程网页|看书|读.{0,8}(?:文献|资料|合同)|(?:审阅|对照|比对).{0,8}合同|合同.{0,8}(?:审阅|对照|比对)|(?:整理|展示|修订|修改).{0,16}(?:讨论稿|项目方案|会议材料)/],
 ['keyboard',/编程|写代码|打字|键盘|写论文|写作|(?:记录|整理).{0,16}(?:讨论结论|行动项|会议纪要)|(?:修订|修改).{0,8}(?:项目方案|讨论稿)/],
 ['oled',/OLED|色彩|屏幕显示/i],
 ['pen',/手写|画画|绘图/],
 ['privacy',/隐私|防窥/],
 ['foldable',/折叠/],
 ['touch',/触控|触屏|手指.{0,5}(?:点|翻)/],
 ['numpad',/数字键盘|数字小键盘/],
];
const featureWeights={portable:3,large_screen:4,screen:1,keyboard:1,oled:3,pen:3,privacy:3,foldable:4,touch:3,numpad:3};
const featureLabels={portable:'携带与移动使用',large_screen:'大屏展示',screen:'阅读与查看材料',keyboard:'文字输入',oled:'OLED 显示',pen:'手写输入',privacy:'隐私控制',foldable:'折叠形态',touch:'屏幕触控',numpad:'独立数字键盘'};
const limitations=['候选依据是资料中的产品特征，具体销售版本仍需核对。','仅按已列证据匹配；重量上限、接口、内存等未参与匹配的硬性条件仍需逐项核验。','知识库未提供可用的本次成交价，尚未验证预算适配。','专业软件、机构系统及实际工作流兼容性尚未验证，需按具体任务核对。'];
const clauses=text=>String(text||'').split(/[，,。；;！!\n]|但是|而且|并且|不过|但/).map(x=>x.trim()).filter(Boolean);
const uncertain=/不清楚|不知道|不确定|未知|待确认|是否|不了解/;
const negative=/不需要|不想|不要|不用|不使用|不接受|不选|拒绝|排除|无需|不考虑|不在意|不追求|不要求|没必要|没有.*需求/;
const excludedSystem=/不接受|不能|不使用|不用|不要|不选|不考虑|不支持|拒绝|排除|禁止/;
const flexibleSystem=/都行|均可|也行|都可以|也可以|无所谓|不限|不强求|不强制|不要求|不在意|非必须|不是必须|不一定|不需要|无需|不必|没有.*要求/;
export function restrictSystems(observations,products){
 let candidates=products;
 const positive=new Set(),excluded=new Set();
 for(const observation of observations.filter(o=>o.kind==='fact')){
  for(const text of clauses(observation.value)){
   if(uncertain.test(text)||flexibleSystem.test(text)||(/或/.test(text)&&!excludedSystem.test(text)))continue;
   // A clear exclusion remains a restriction even when extraction classified it as a task or preference.
   if(observation.category!=='os'&&!/必须|只能|要求|只用/.test(text)&&!excludedSystem.test(text))continue;
   for(const [system,pattern] of [['Windows',/windows/i],['HarmonyOS',/鸿蒙|harmony/i],['Linux',/linux/i],['macOS',/macos|苹果系统/i]]){
    if(!pattern.test(text))continue;
    if(excludedSystem.test(text))excluded.add(system);
    else positive.add(system);
   }
  }
 }
 if(positive.size>1)return [];
 if(positive.size)candidates=candidates.filter(p=>positive.has(p.system));
 return candidates.filter(p=>!excluded.has(p.system));
}
export function suggestProduct(analysis,products){
 const {product,observations=[]}=analysis.understanding;
 const empty=reason=>({name:'',reason,candidates:[],limitations:[...limitations]});
 if(!products.length)return empty('资料目录未取得，请重试。');
 if(product.status==='ambiguous')return empty('输入包含多个产品意向，请选择一个具体型号。');
 const allowed=restrictSystems(observations,products);
 if(!allowed.length)return empty('资料目录中没有符合明确系统限制的候选，请核对系统要求或手动选择。');
 if(product.name){
  const query=normalize(product.name);
  const matches=products.filter(p=>normalize(p.name)===query||normalize(p.model)===query);
  const related=products.filter(p=>normalize(p.model).startsWith(query));
  if(matches.length!==1||!(normalize(matches[0].name)===query||related.length===1))return empty('型号或系统版本不明确，请从资料目录选一个；无需填写其他未知信息。');
  const selected=matches[0];
  if(!allowed.includes(selected))return empty('输入指定的型号与明确系统限制冲突，请核对后选择。');
  return {name:selected.name,reason:'已从资料目录匹配输入中的型号；适配仍需核验。',candidates:[{name:selected.name,reasons:[]}],limitations:[...limitations]};
 }
 // An action item awaiting confirmation is the object of a known work task,
 // not uncertainty about whether the customer needs to perform that task.
 const positive=observations.filter(o=>o.kind==='fact'&&!['budget','os','devices','product'].includes(o.category)).flatMap(o=>clauses(o.value)).map(x=>x.replace(/待确认的?行动项/g,'行动项')).filter(x=>!negative.test(x)&&!uncertain.test(x)&&!/[不没未]/.test(x.replace(/不同(?=版本|的版本|格式|的格式|文件|的文件|合同|的合同)/g,'')));
 const requirements=taskFeatures.flatMap(([id,pattern])=>{
  const mentions=positive.filter(text=>pattern.test(text));if(!mentions.length)return [];
  const priority=mentions.some(text=>/最看重|首要|优先|更在意|最重要/.test(text));
  return [{id,label:featureLabels[id],weight:featureWeights[id]*(priority?2:1),priority,source_text:mentions.join('；')}];
 });
 const ranked=allowed.map(p=>{
  const reasons=requirements.flatMap(r=>{
   const f=(p.features||[]).find(f=>f.id===r.id&&f.evidence&&f.source_path);
   return f?[{...f,requirement:r.label,source_text:r.source_text,points:r.weight}]:[];
  });
  return {name:p.name,score:reasons.reduce((sum,r)=>sum+r.points,0),reasons,unmatched:requirements.filter(r=>!reasons.some(f=>f.id===r.id)).map(r=>r.label)};
 }).filter(p=>p.reasons.length).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'zh-CN'));
 const candidates=ranked.slice(0,3);
 if(!candidates.length)return empty('当前明确需求尚未匹配到有资料依据的产品特征，请选择本轮型号。');
 const tied=ranked.filter(p=>p.score===candidates[0].score).length;
 return {name:candidates[0].name,reason:`本轮候选优先匹配${candidates[0].reasons.map(r=>r.requirement).join('、')}。${tied>1?'有 '+tied+' 款同分，当前按型号名称稳定展示，可查看并更换；不代表唯一最优。':'按明确需求的加权匹配排序，可查看依据并更换。'}`,candidates,requirements,method:'weighted-evidence-v1',counts:{total:products.length,system_allowed:allowed.length,matched:ranked.length},limitations:[...limitations]};
}
