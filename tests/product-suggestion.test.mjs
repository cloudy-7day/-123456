import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestProduct as suggest,restrictSystems} from '../modules/scenario/shared/product-suggestion.mjs';
const feature=id=>({id,label:id,evidence:`verified ${id}`,source_path:'library/product/产品事实.md'});
const products=[
 {name:'HUAWEI MateBook 14（鸿蒙版）',model:'HUAWEI MateBook 14',system:'HarmonyOS',features:['portable','keyboard','screen'].map(feature)},
 {name:'MateBook 14 酷睿 Ultra（Windows 系列）',model:'MateBook 14 酷睿 Ultra',system:'Windows',features:['portable','keyboard'].map(feature)},
 {name:'MateBook D 16（Windows 系列）',model:'MateBook D 16',system:'Windows',features:['large_screen','keyboard'].map(feature)},
];
const analysis=(value,kind='fact',category='task',product={status:'unspecified',name:null})=>({understanding:{product,observations:[{category,kind,value}]}});
test('candidates change with explicit needs and retain fact evidence',()=>{
 const carry=suggest(analysis('每天背电脑去图书馆，希望轻便'),products);
 const screen=suggest(analysis('希望大屏，16英寸'),products);
 assert.equal(carry.name,products[0].name);assert.equal(screen.name,products[2].name);
 assert(carry.candidates[0].reasons[0].source_path);assert.match(carry.reason,/候选/);
 assert(carry.limitations.some(x=>/预算/.test(x)));
});
test('programming candidate uses keyboard evidence and never assumes software compatibility',()=>{
 const result=suggest(analysis('要写代码，学一点AI'),products);
 assert.equal(result.name,products[0].name);
 assert.equal(result.candidates[0].reasons[0].label,'keyboard');
 assert(result.limitations.some(x=>/软件|算力/.test(x)));
});
test('unknown, inferred and negated needs never create positive matches; no hardcoded fallback',()=>{
 for(const a of [analysis('要轻便','unknown'),analysis('要轻便','inference'),analysis('不需要轻薄，也不需要大屏'),analysis('不喜欢大屏'),analysis('没考虑过轻薄'),analysis('预算7000元'),analysis('不了解电脑')])assert.equal(suggest(a,products).name,'');
 assert.equal(suggest(analysis('不需要轻薄，希望大屏'),products).name,products[2].name);
 assert.equal(suggest(analysis('要轻便'),[]).name,'');
});
test('explicit model respected, ambiguity not guessed and hard system restriction enforced',()=>{
 const specified={status:'specified',name:products[0].name};
 assert.equal(suggest(analysis('要大屏','fact','task',specified),products).name,products[0].name);
 assert.equal(suggest(analysis('要轻便','fact','task',{status:'ambiguous',name:'MateBook 14'}),products).name,'');
 assert.equal(suggest(analysis('必须Windows','fact','os',specified),products).name,'');
 assert.equal(suggest(analysis('必须Linux','fact','os'),products).name,'');
 const a=analysis('每天携带');a.understanding.observations.push({category:'os',kind:'fact',value:'必须Windows'});
 assert.equal(suggest(a,products).name,products[1].name);
 a.understanding.observations[1].value='不使用鸿蒙，只用Windows';
 assert.equal(suggest(a,products).name,products[1].name);
});
test('reading matches screen facts without claiming eye protection',()=>{
 const result=suggest(analysis('阅读文档、查看课程网页'),products);
 assert.equal(result.name,products[0].name);assert.equal(result.candidates[0].reasons[0].label,'screen');
 assert(result.limitations.some(x=>/硬性条件/.test(x)));
});
test('explicit negative system constraints apply across observation categories',()=>{
 for(const category of ['constraint','preference','task','os']){
  for(const value of ['不接受鸿蒙','不能使用鸿蒙','不接受鸿蒙或Linux','不使用鸿蒙，只用Windows']){
   const a=analysis('每天携带');a.understanding.observations.push({category,kind:'fact',value});
   const result=suggest(a,products);
   assert.equal(result.name,products[1].name,`${category}: ${value}`);
   assert(result.candidates.every(c=>!c.name.includes('鸿蒙')));
  }
 }
});
test('flexible or uncertain system mentions do not become hard restrictions',()=>{
 for(const category of ['constraint','os']){
  for(const value of ['不需要Windows也行','Windows也可以','Windows不是必须','不确定是否不能使用鸿蒙']){
   const a=analysis('每天携带');a.understanding.observations.push({category,kind:'fact',value});
   assert.equal(suggest(a,products).name,products[0].name,`${category}: ${value}`);
   a.understanding.product={status:'specified',name:products[1].name};
   assert.equal(suggest(a,products).name,products[1].name,`${category}: ${value}`);
  }
 }
});

// Professional identities alone are not product requirements; explicit work tasks are.
test('professional task wording matches evidence without inferring needs from occupation',()=>{
 for(const text of ['我会读公开医学文献','对照不同版本的合同','审阅合同']){
  const r=suggest(analysis(text),products);assert.equal(r.name,products[0].name);assert.equal(r.candidates[0].reasons[0].label,'screen');
 }
 for(const text of ['带电脑记录报告要点','差旅途中整理资料'])assert.equal(suggest(analysis(text),products).candidates[0]?.reasons[0].label,'portable');
 for(const text of ['我是一名医生','我是一名律师','不需要带电脑','不用读文献','是否要审阅合同','不同意带电脑'])assert.equal(suggest(analysis(text),products).name,'');
});


test('explicit exclusive software runtime narrows OS even when the OS row is only inferred',()=>{
 for(const value of ['我使用的软件已经明确只支持 Windows','软件只支持 Windows','软件仅能在Windows运行','这个应用仅兼容Windows','所需程序只能在 Windows 系统上运行']){
  for(const category of ['software','task','constraint']){
   const a=analysis('每天背电脑去图书馆');
   a.understanding.observations.push({kind:'fact',category,value},{kind:'inference',category:'os',value:'可能倾向或需要 Windows 系统环境'});
   assert.deepEqual(restrictSystems(a.understanding.observations,products).map(p=>p.system),['Windows','Windows'],`${category}: ${value}`);
   const r=suggest(a,products);assert.equal(r.name,products[1].name);assert(r.candidates.every(c=>!c.name.includes('鸿蒙')));
   assert(r.limitations.some(t=>/兼容性尚未验证/.test(t)));
  }
 }
});

test('uncertain, inferred, conditional, nonexclusive and unneeded software do not hard-filter systems',()=>{
 for(const value of ['不确定是否只支持Windows','软件可能只支持Windows','如果软件只支持Windows','软件不是只支持Windows','软件不仅支持Windows','我不使用只支持Windows的软件','我不用仅能在Windows运行的工具','软件只支持Windows或鸿蒙','我用Windows版WPS']){
  assert.deepEqual(restrictSystems([{kind:'fact',category:'software',value}],products),products,value);
 }
 for(const kind of ['inference','unknown'])assert.deepEqual(restrictSystems([{kind,category:'software',value:'软件只支持Windows'}],products),products);
});

test('explicit alternative execution relaxes software-derived host OS only, not direct system or local requirements',()=>{
 const software={kind:'fact',category:'software',value:'软件只支持Windows'};
 for(const value of ['可以使用网页版','接受远程桌面','已有可用的云桌面'])assert.deepEqual(restrictSystems([software,{kind:'fact',category:'software',value}],products),products,value);
 for(const value of ['不接受远程桌面','不确定是否可以使用网页版','如果可以使用网页版'])assert.deepEqual(restrictSystems([software,{kind:'fact',category:'software',value}],products).map(p=>p.system),['Windows','Windows'],value);
 for(const requirement of [{kind:'fact',category:'os',value:'必须Windows'},{kind:'fact',category:'software',value:'必须在本机运行'}]){
  assert.deepEqual(restrictSystems([software,{kind:'fact',category:'software',value:'可以使用网页版'},requirement],products).map(p=>p.system),['Windows','Windows']);
 }
 assert.deepEqual(restrictSystems([{...software,value:'软件只支持Windows，但我可以使用网页版'}],products),products);
});
