const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/^(huawei|华为)\s*/,'').replace(/\s+/g,'');
const taskFeatures=[
 ['portable',/携带|背电脑|通勤|轻便|轻薄|图书馆|出差/],
 ['large_screen',/大屏|(?:16|17|18)\s*英寸/],
 ['screen',/阅读|文档|课程网页|看书/],
 ['keyboard',/编程|写代码|打字|键盘|写论文|写作/],
 ['oled',/OLED|色彩|屏幕显示/i],
 ['pen',/手写|画画|绘图/],
 ['privacy',/隐私|防窥/],
 ['foldable',/折叠/],
];
const limitations=['候选依据是资料中的产品特征，具体销售版本仍需核对。','仅按已列证据匹配；重量上限、接口、内存等未参与匹配的硬性条件仍需逐项核验。','知识库未提供可用的本次成交价，尚未验证预算适配。','课程软件、AI 算力和系统兼容性尚未验证，请到店按实际任务试用。'];
const clauses=text=>String(text||'').split(/[，,。；;！!\n]|但是|而且|并且|不过|但/).map(x=>x.trim()).filter(Boolean);
const uncertain=/不清楚|不知道|不确定|未知|待确认|是否|不了解/;
const negative=/不需要|不想|不要|不用|不使用|不接受|不选|拒绝|排除|无需|不考虑|不在意|不追求|不要求|没必要|没有.*需求/;
const excludedSystem=/不接受|不能|不使用|不用|不要|不选|不考虑|不支持|拒绝|排除|禁止/;
const flexibleSystem=/都行|均可|也行|都可以|也可以|无所谓|不限|不强求|不强制|不要求|不在意|非必须|不是必须|不一定|不需要|无需|不必|没有.*要求/;
function restrictSystems(observations,products){
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
 const positive=observations.filter(o=>o.kind==='fact'&&!['budget','os','devices','product'].includes(o.category)).flatMap(o=>clauses(o.value)).filter(x=>!negative.test(x)&&!uncertain.test(x)&&!/[不没未]/.test(x));
 const desired=new Set(taskFeatures.filter(([,pattern])=>positive.some(text=>pattern.test(text))).map(([id])=>id));
 const candidates=allowed.map((p,index)=>({name:p.name,index,reasons:(p.features||[]).filter(f=>desired.has(f.id)&&f.evidence&&f.source_path).map(({label,evidence,source_path})=>({label,evidence,source_path}))}))
  .filter(p=>p.reasons.length).sort((a,b)=>b.reasons.length-a.reasons.length||a.index-b.index).slice(0,3).map(({index,...p})=>p);
 if(!candidates.length)return empty('当前明确需求尚未匹配到有资料依据的产品特征，请选择本轮型号。');
 return {name:candidates[0].name,reason:'根据明确需求与知识库产品特征提出候选；可查看依据并更换，不代表客户已选择。',candidates,limitations:[...limitations]};
}
