const systems=['Windows 11','Windows 10','Windows','HarmonyOS','macOS','Linux'];
export function normalizeSystem(value){const v=value.toLowerCase();if(/windows\s*11|win\s*11/.test(v))return 'Windows 11';if(/windows\s*10|win\s*10/.test(v))return 'Windows 10';if(/windows|win系统/.test(v))return 'Windows';if(/harmony|鸿蒙/.test(v))return 'HarmonyOS';if(/macos|苹果系统/.test(v))return 'macOS';if(/linux/.test(v))return 'Linux';return null;}
export function extractRequirements(text,override={}){
 const requirements=[],uncertain=[];const clauses=String(text).normalize('NFKC').split(/[。！？；;\n]/).map(s=>s.trim()).filter(Boolean);
 for(const clause of clauses){
  const hard=/必须|硬性|硬上限|不能超过|不得超过|不超过|上限|最多|要求|只能|只接受|至少|不接受|不要|不考虑/.test(clause);
  const soft=/左右|大概|尽量|最好|优先|偏好/.test(clause)&&!hard;
  const range=clause.match(/预算[^\d]{0,12}(\d+(?:\.\d+)?)\s*(万|千|[kK])?\s*(?:元|块)?\s*(?:到|至|[-–—~～])\s*(\d+(?:\.\d+)?)\s*(万|千|[kK])?\s*(?:元|块|以内|以下|$|[，,])/);
  const money=range?[range[0],range[3],range[4]||range[2]]:clause.match(/(?:预算|上限|最多|不超过|不能超过|控制在)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(万|千|[kK])?\s*(?:元|块|以内|以下|$|[，,])/);
  if(money&&!soft){const amount=Number(money[1])*({'万':10000,'千':1000,k:1000,K:1000}[money[2]]||1);if(amount>0)requirements.push({kind:'budget',value:amount,label:`预算上限 ¥${amount.toLocaleString('zh-CN')}`,quote:clause,scope:/配件|套装|总预算|总价|合计/.test(clause)?'total':'computer'});}
  const os=normalizeSystem(clause);
  for(const part of clause.split(/[，,]/)){
   const partHard=/必须|硬性|要求|只能|只接受|不接受|不要|不考虑/.test(part);
   const partOS=normalizeSystem(part);
   if(partOS&&partHard&&!/不要求|无需|不必|没有.{0,5}(?:系统|操作系统)要求/.test(part))requirements.push({kind:/不接受|不要|不考虑/.test(part)?'exclude_os':'os',value:partOS,label:`${/不接受|不要|不考虑/.test(part)?'不接受':'必须使用'} ${partOS}`,quote:part});
   if(partHard&&/AutoCAD|SolidWorks|Photoshop|WPS|Office|本地.{0,8}(?:运行|使用|用)|插件/.test(part))requirements.push({kind:'software',value:part,label:'必须满足指定软件与运行方式',quote:part});
  }
  // Preserve other explicit requirements rather than silently treating them as preferences.
  if(hard&&!os&&!money&&!/AutoCAD|SolidWorks|Photoshop|WPS|Office|本地.{0,8}(?:运行|使用|用)|插件/.test(clause))requirements.push({kind:'other',value:clause,label:'其他硬性要求待逐项核实',quote:clause});
  if(soft&&(os||money))uncertain.push(clause);
 }
 let result=requirements.map(r=>r.kind==='budget'&&override.scope?{...r,scope:override.scope}:r);
 if(Object.hasOwn(override,'os')){result=result.filter(r=>!['os','exclude_os'].includes(r.kind));if(override.os)result.push({kind:'os',value:override.os,label:`必须使用 ${override.os}`,quote:'店员确认的硬性系统：'+override.os});}
 if(Object.hasOwn(override,'budget')){result=result.filter(r=>r.kind!=='budget');if(override.budget)result.push({kind:'budget',value:override.budget,label:`预算上限 ¥${override.budget.toLocaleString('zh-CN')}`,quote:'店员确认的预算上限：'+override.budget+'元',scope:override.scope||'total'});}
 return {requirements:[...new Map(result.map(r=>[r.kind+':'+r.value,r])).values()],preferences:uncertain};
}
export function validateFilterInput(input){
 if(!input||typeof input.text!=='string'||input.text.length>16000)throw new Error('请检查筛选场景。');
 const override=input.override||{};
 if(typeof override!=='object'||Array.isArray(override)||Object.keys(override).some(k=>!['os','budget','scope'].includes(k)))throw new Error('筛选条件格式不正确。');
 if(Object.hasOwn(override,'os')&&override.os!==null&&!systems.includes(override.os))throw new Error('请选择支持的系统条件。');
 if(Object.hasOwn(override,'budget')&&override.budget!==null&&(!Number.isFinite(override.budget)||override.budget<=0||override.budget>1000000))throw new Error('预算上限应为有效金额。');
 if(override.scope&&!['total','computer'].includes(override.scope))throw new Error('预算范围不正确。');
 return {text:input.text,override};
}
export function filterInputFromSources(sources){
 const overrideSource=sources.findLast(s=>s.id==='hard_filters');let override={};
 if(overrideSource){try{override=JSON.parse(overrideSource.text);}catch{throw new Error('硬性条件格式不正确。');}}
 return validateFilterInput({text:sources.filter(s=>s.type!=='product'&&s.id!=='hard_filters').map(s=>s.text).join('\n'),override});
}
export function evaluateProducts(products,requirements){
 return products.map(product=>{
  const checks=requirements.map(r=>{
   if(r.kind==='os'||r.kind==='exclude_os'){
    const match=product.systems.some(os=>r.value==='Windows'?os.startsWith('Windows'):os===r.value);
    const excluded=r.kind==='exclude_os';
    const matches=os=>r.value==='Windows'?os.startsWith('Windows'):os===r.value;
    const status=!product.systems.length?'pending':excluded?(product.systems.every(matches)?'excluded':'pass'):(match?'pass':'excluded');
    return {kind:r.kind,label:r.label,status,reason:!product.systems.length?'系统资料缺失':status==='excluded'?`资料系统为 ${product.systems.join(' / ')}，与要求冲突`:`需选 ${excluded?product.systems.filter(os=>!matches(os)).join(' / '):r.value} 版本；不能混用其他系统配置`,source:product.systemSource};
   }
   if(r.kind==='budget')return {kind:r.kind,label:r.label,status:'pending',reason:product.priceStatus+(r.scope==='total'?'；还需核对必要配件后的总价':'；需核对所选配置的有效报价'),source:product.priceSource||null};
   return {kind:r.kind,label:r.label,status:'pending',reason:r.kind==='software'?'系统匹配不代表软件兼容，需要对应版本和运行方式的资料或验证结果':`需补充针对“${r.quote}”的直接依据`,source:null};
  });
  const requiredOS=requirements.filter(r=>r.kind==='os').map(r=>r.value);const excludedOS=requirements.filter(r=>r.kind==='exclude_os').map(r=>r.value);
  const contradictory=requiredOS.some(os=>excludedOS.some(ex=>ex===os||(ex==='Windows'&&os.startsWith('Windows'))))||requiredOS.some(a=>requiredOS.some(b=>a!==b&&!(a==='Windows'&&b.startsWith('Windows'))&&!(b==='Windows'&&a.startsWith('Windows'))));
  if(contradictory)checks.push({kind:'conflict',label:'系统条件互相冲突',status:'excluded',reason:'请先确认唯一的系统硬要求，不能由系统代替客户取舍。'});
  return {...product,checks,status:checks.some(c=>c.status==='excluded')?'excluded':checks.some(c=>c.status==='pending')?'pending':'eligible'};
 });
}
