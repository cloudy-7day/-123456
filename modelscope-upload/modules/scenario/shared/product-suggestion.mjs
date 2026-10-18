const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/^(huawei|华为)\s*/,'').replace(/\s+/g,'');
export function suggestProduct(analysis,products){
 const {product,observations}=analysis.understanding;
 if(!products.length)return {name:'',reason:'资料目录未取得，请重试。'};
 if(product.status==='ambiguous')return {name:'',reason:'输入包含多个产品意向，请选择一个具体型号。'};
 if(product.name){
  const query=normalize(product.name);
  const matches=products.filter(p=>normalize(p.name)===query||normalize(p.model)===query);
  const related=products.filter(p=>normalize(p.model).startsWith(query));
  if(matches.length===1&&(normalize(matches[0].name)===query||related.length===1))return {name:matches[0].name,reason:'已从资料目录匹配输入中的型号；适配仍需核验。'};
  return {name:'',reason:'型号或系统版本不明确，请从资料目录选一个；无需填写其他未知信息。'};
 }
 const os=observations.filter(o=>o.kind==='fact'&&o.category==='os').map(o=>o.value).join(' ');
 let candidates=products;
 if(os){
  // Only apply unambiguous positive OS requirements; do not guess around negations.
  if(/不|非|除|或|linux|mac/i.test(os))return {name:'',reason:'存在系统限制，请选择本轮具体检索对象；兼容性待核验。'};
  const windows=/windows/i.test(os),harmony=/鸿蒙|harmony/i.test(os);
  if(windows!==harmony)candidates=products.filter(p=>p.system===(windows?'Windows':'HarmonyOS'));
 }
 const candidate=candidates.find(p=>p.system==='Windows'&&/MateBook 14/i.test(p.model))||candidates[0];
 return {name:candidate?.name||'',reason:candidate?'先从资料库选择此型号作为文案候选，可修改；未验证课程软件、AI算力或预算适配，也不代表客户已选择。':'没有对应系统的候选资料，请选择其他检索对象。'};
}
