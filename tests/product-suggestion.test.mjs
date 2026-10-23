import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestProduct as suggest} from '../modules/scenario/shared/product-suggestion.mjs';
import {localCatalog} from '../src/local-knowledge.mjs';
import {roleExamples} from '../modules/scenario/shared/role-examples.mjs';
const feature=id=>({id,label:id,evidence:`verified ${id}`,source_path:'library/product/产品事实.md'});
const products=[
 {name:'HUAWEI MateBook 14（鸿蒙版）',model:'HUAWEI MateBook 14',system:'HarmonyOS',features:['portable','keyboard','screen'].map(feature)},
 {name:'MateBook 14 酷睿 Ultra（Windows 系列）',model:'MateBook 14 酷睿 Ultra',system:'Windows',features:['portable','keyboard'].map(feature)},
 {name:'MateBook D 16（Windows 系列）',model:'MateBook D 16',system:'Windows',features:['large_screen','keyboard'].map(feature)},
];
const analysis=(value,kind='fact',category='task',product={status:'unspecified',name:null})=>({understanding:{product,observations:[{category,kind,value}]}});

test('two fictional examples select different models from task preferences, not role IDs',async()=>{
 const {products:catalog}=await localCatalog();
 const student=roleExamples.find(r=>r.id==='student'),meeting=roleExamples.find(r=>r.id==='meeting');
 const s=suggest(analysis(student.selectionBrief),catalog),m=suggest(analysis(meeting.selectionBrief),catalog);
 assert(s.name);assert(m.name);assert.notEqual(s.name,m.name);
 assert(s.candidates[0].reasons.some(r=>r.id==='touch'));
 assert(m.candidates[0].reasons.some(r=>r.id==='large_screen'));
 assert(m.candidates[0].reasons.some(r=>r.id==='numpad'));
 assert(m.candidates.every(c=>catalog.find(p=>p.name===c.name).system==='Windows'));
 assert.equal(suggest(analysis('我是一名学生'),catalog).name,'');
 assert.equal(suggest(analysis(meeting.selectionBrief),[...catalog].reverse()).name,m.name);
});

test('explicit priorities outweigh generic matches and expose comparable evidence scores independent of directory order',()=>{
 const catalog=[{name:'轻薄阅读款',model:'轻薄阅读款',system:'Windows',features:['portable','screen','keyboard'].map(feature)},{name:'大屏款',model:'大屏款',system:'Windows',features:['large_screen','screen'].map(feature)}];
 const a=analysis('要携带电脑阅读文档打字，但最看重大屏');
 const first=suggest(a,catalog),reversed=suggest(a,[...catalog].reverse());
 assert.equal(first.name,'大屏款');assert.equal(reversed.name,first.name);
 assert(first.candidates[0].score>first.candidates[1].score);
 assert(first.requirements.some(r=>r.id==='large_screen'&&r.priority));
 assert(first.candidates[0].reasons.every(r=>r.requirement&&r.points&&r.evidence));
});
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

test('meeting preparation and action-item tasks match factual features without inferring occupation needs',()=>{
 const r=suggest(analysis('整理项目方案讨论稿，记录讨论结论和待确认的行动项'),products);
 assert.equal(r.name,products[0].name);
 assert(r.candidates[0].reasons.some(x=>x.label==='screen'));
 assert(r.candidates[0].reasons.some(x=>x.label==='keyboard'));
 for(const text of ['我是职场工作人员','不需要记录行动项','是否需要整理讨论稿'])assert.equal(suggest(analysis(text),products).name,'');
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
