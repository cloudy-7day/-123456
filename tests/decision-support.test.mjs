import test from 'node:test';
import assert from 'node:assert/strict';
import {explainDecision} from '../modules/scenario/shared/decision-support.mjs';
import {numericRequirements} from '../modules/scenario/shared/product-suggestion.mjs';
import {productProfile,productFeatures} from '../src/product-profile.mjs';
import {dimensions,standardVersion,understandingResearchSources} from '../modules/scenario/shared/standards.mjs';
import {categories,validateUnderstanding,modelSchema} from '../modules/scenario/shared/contract.mjs';

const product=(name,weight,screen='14 英寸',system='Windows')=>{
 const path=`library/${name}/产品事实.md`;
 const text=`# ${name} - 产品事实\n\n## 尺寸与重量\n\n重量\n\n${weight}\n\n## 屏幕\n\n尺寸\n\n${screen}\n\n## 键盘和触控板\n\n全尺寸背光键盘\n`;
 return {name,model:name,system,profile:productProfile(text,path),features:productFeatures(text,path)};
};
const catalog=[product('轻本','约 0.98 kg'),product('大屏本','1.7 kg','16 英寸'),product('鸿蒙本','约 1.32 kg','14.2 英寸','HarmonyOS')];
const fact=(value,category='task')=>({kind:'fact',category,value,evidence:[{sourceId:'scenario',quote:value}]});
const analysis=(...observations)=>({understanding:{observations,product:{status:'unspecified',name:null},conflicts:[],questions:[]},input:{sources:[]}});

test('research standard restores twelve dimensions, nineteen categories and twelve bounded sources',()=>{
 assert.equal(dimensions.length,12);assert.equal(Object.keys(categories).length,19);assert.equal(understandingResearchSources.length,12);assert.equal(standardVersion,'0.3');
 assert.deepEqual(new Set(dimensions.flatMap(d=>d.keys)),new Set(Object.keys(categories)));
 assert(dimensions.every(d=>d.sources.every(id=>understandingResearchSources.some(s=>s.id===id))));
 const s=[{id:'scenario',text:'每天处理几万行表格'}];
 const input={observations:[{id:'o1',category:'performance',kind:'fact',value:s[0].text,evidence:[{sourceId:'scenario',quote:s[0].text}],rationale:'原话',critical:false}],questions:[],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}};
 const parsed=validateUnderstanding(input,s);assert.equal(parsed.observations.length,19);assert.equal(parsed.observations.find(o=>o.category==='mobility').value,null);
 input.questions=Array.from({length:3},(_,i)=>({id:`q${i}`,topic:'task',question:'问什么',why:'为什么',priority:'optional',evidence:[]}));assert.equal(modelSchema.safeParse(input).success,false);
});
test('profiles preserve units, absent data, multiple versions and partial-device conditions',()=>{
 const p=product('多配置','798 g\n\n805 g\n\n*依配置而不同。','展开态：18 英寸\n\n折叠态：13 英寸');
 assert.equal(p.profile.weight.min,.798);assert.equal(p.profile.weight.max,.805);assert.equal(p.profile.weight.status,'conditional');
 assert.equal(p.profile.screen.scope,'multiple_states');assert.equal(p.profile.screen.values.length,2);
 const missing=productProfile('## 屏幕\n\n未提供尺寸','source');assert.equal(missing.weight.status,'unknown');assert.equal(missing.weight.min,null);assert.deepEqual(missing.weight.values,[]);
 const partial=product('折叠','1.16 kg（不含键盘）');assert.equal(partial.profile.weight.scope,'partial_device');
 assert.equal(product('中文单位','980 克').profile.weight.min,.98);
});
test('hard weight and screen conflicts exclude with both customer and source evidence',()=>{
 const a=analysis(fact('每天背电脑'),fact('电脑重量不能超过1.1kg','mobility'));
 const r=explainDecision(a,catalog);assert.deepEqual(r.candidates.map(c=>c.name),['轻本']);assert.deepEqual(new Set(r.exclusions.map(c=>c.name)),new Set(['大屏本','鸿蒙本']));
 assert(r.exclusions.every(x=>x.evidence[0].quote==='电脑重量不能超过1.1kg'&&x.source_evidence[0].source_path));
 const s=explainDecision(analysis(fact('屏幕至少16英寸','experience')),catalog);assert.deepEqual(s.candidates.map(c=>c.name),['大屏本']);assert.equal(s.exclusions.length,2);
 const manual=explainDecision(a,catalog,{manualProduct:'大屏本'});assert.deepEqual(manual.candidates,[]);assert(manual.exclusions.some(x=>x.name==='大屏本'));
});
test('preferences and unknowns do not become hard numbers, price is never guessed',()=>{
 for(const value of ['希望1kg左右最好','重量没有上限','不确定重量不能超过1kg','希望屏幕16英寸'])assert.equal(numericRequirements([fact(value)]).length,0);
 const r=explainDecision(analysis(fact('每天携带'),fact('预算硬上限3000元','budget')),catalog);
 assert.equal(r.exclusions.length,0);assert(r.limitations.some(x=>/成交价/.test(x)));assert(!r.questions.some(q=>q.topic==='budget'));
});
test('strict numerical bounds retain their strict meaning instead of silently becoming inclusive',()=>{
 const exact=[product('整重','1.0 kg','14 英寸')];
 assert.equal(explainDecision(analysis(fact('电脑重量必须低于1kg','mobility')),exact).exclusions.length,1);
 assert.equal(explainDecision(analysis(fact('电脑重量不超过1kg','mobility')),exact).exclusions.length,0);
 assert.equal(explainDecision(analysis(fact('屏幕必须大于14英寸','experience')),exact).exclusions.length,1);
});
test('mixed configurations and missing measurements remain conditional rather than certified or falsely excluded',()=>{
 const variants=[product('两种版本','1.1 kg\n\n1.5 kg'),product('折叠本','1.0 kg（不含键盘）'),product('重量未知','未提供')];
 const r=explainDecision(analysis(fact('每天带电脑'),fact('电脑含充电器总重不能超过1.2kg','mobility')),variants);
 assert.equal(r.exclusions.length,0);assert(r.limitations.some(x=>/具体版本及所需配件总重/.test(x)));assert(r.limitations.some(x=>/缺少可核对/.test(x)));
 assert(r.candidates.every(c=>c.evidence_status==='candidate_requires_review'));
});
test('decision questions are bounded, cite real input, and never infer work from occupation',()=>{
 assert.deepEqual(explainDecision(analysis(fact('我是一名医生','situation')),catalog).questions,[]);
 const a=analysis(fact('我需要剪辑视频，学AI'),fact('想把手机照片传到电脑','collaboration'),fact('每天背电脑'));
 const r=explainDecision(a,catalog);assert.equal(r.questions.length,2);assert.deepEqual(r.questions.map(q=>q.id),['software_workflow','collaboration_devices']);assert(r.questions.every(q=>q.why&&q.affects.length&&q.evidence[0].quote));
});
test('answered decision IDs, including unknown answers, are not asked again',()=>{
 const a=analysis(fact('学AI'),fact('要手机协同','collaboration'));
 a.input.sources=[{type:'revision',text:'关键追问 software_workflow（software）的客户补充，以此为准：不知道'},{type:'revision',text:'关键追问 collaboration_devices（collaboration）的客户补充，以此为准：Mate 60，鸿蒙5，传照片'}];
 const r=explainDecision(a,catalog);assert(!r.questions.some(q=>['software_workflow','collaboration_devices'].includes(q.id)));
});
test('fully supplied software and device details avoid repeated questions',()=>{
 const a=analysis(fact('本机用AutoCAD 2024，无额外插件','software'),fact('做三维建模','performance'),fact('希望多屏协同','collaboration'),fact('Mate 60，鸿蒙5','devices'));
 const r=explainDecision(a,catalog);assert(!r.questions.some(q=>['software_workflow','collaboration_devices'].includes(q.id)));
});
test('system restrictions apply to manual selections, while device ownership alone does not imply cooperation',()=>{
 const r=explainDecision(analysis(fact('必须Windows','os'),fact('每天携带')),catalog,{manualProduct:'鸿蒙本'});
 assert.equal(r.candidates.length,0);assert(r.exclusions.some(x=>x.name==='鸿蒙本'&&x.evidence.length));
 assert(!explainDecision(analysis(fact('我有华为手机，想买电脑','devices')),catalog).questions.some(q=>q.id==='collaboration_devices'));
 assert.equal(explainDecision(analysis(fact('每天携带')),catalog,{manualProduct:'不存在的型号'}).candidates.length,0);
 const ambiguous=analysis(fact('电脑重量不能超过1.1kg'));ambiguous.understanding.product={status:'ambiguous',name:null};assert.equal(explainDecision(ambiguous,catalog).candidates.length,0);
});

test('quoted colloquial mobility activates evidence-backed candidates and a useful weight question',()=>{
 for(const value of ['背着电脑跑来跑去','每天在学校和家两头奔波']){
  const r=explainDecision(analysis(fact(value,'mobility')),catalog);
  assert(r.candidates.some(c=>c.reasons.some(reason=>reason.label==='便于携带')));
  assert(r.questions.some(q=>q.id==='weight_limit'&&q.evidence.some(e=>e.quote===value)));
  assert.equal(r.exclusions.length,0); // qualitative language is never a hard numerical limit
 }
});

test('collaboration category enables colloquial clarification without inventing a product feature',()=>{
 const value='资料在手机电脑间搬来搬去';
 const r=explainDecision(analysis(fact(value,'collaboration')),catalog);
 assert(r.questions.some(q=>q.id==='collaboration_devices'&&q.evidence.some(e=>e.quote===value)));
 assert.deepEqual(r.candidates,[]); // these fixtures contain no product collaboration evidence
});

test('experience facts distinguish screen and text input rather than mapping every experience to both',()=>{
 const screen=explainDecision(analysis(fact('希望显示区域宽敞一些','experience')),catalog);
 assert(screen.candidates.length);assert(screen.candidates.every(c=>c.reasons.every(r=>r.label==='屏幕尺寸')));
 assert(screen.questions.some(q=>q.id==='screen_need'));
 const keyboard=explainDecision(analysis(fact('每天要敲很多字，希望键帽舒服','experience')),catalog);
 assert(keyboard.candidates.length);assert(keyboard.candidates.every(c=>c.reasons.every(r=>r.label==='全尺寸键盘')));
 assert(!keyboard.questions.some(q=>q.id==='screen_need'));
});

test('negated and indifferent category facts, inferred needs, unknown rows and battery-only needs do not fabricate intent',()=>{
 for(const [category,value] of [
  ['mobility','不在意背着电脑跑来跑去'],['mobility','电脑轻重无所谓'],['mobility','不需要轻便'],
  ['collaboration','不需要资料在手机电脑间搬来搬去'],['collaboration','不在意手机电脑协同'],['collaboration','多设备互传无所谓'],
  ['experience','不在意显示区域大小'],['experience','键盘手感无所谓'],['mobility','只希望电池能撑一天'],
 ]){
  const r=explainDecision(analysis(fact(value,category)),catalog);
  assert.deepEqual(r.candidates,[],value);assert.deepEqual(r.questions,[],value);
 }
 const padded=Object.keys(categories).map(category=>({category,kind:'unknown',value:null,evidence:[]}));
 padded.push({...fact('背着电脑跑来跑去','mobility'),kind:'inference'});
 padded.push({...fact('资料在手机电脑间搬来搬去','collaboration'),kind:'inference'});
 const r=explainDecision(analysis(...padded),catalog);assert.deepEqual(r.candidates,[]);assert.deepEqual(r.questions,[]);assert.deepEqual(r.exclusions,[]);
});


test('later explicit phone collaboration decline suppresses stale transfer question without deleting facts',()=>{
 const old=fact('资料在手机和电脑之间搬来搬去','task');
 const declined={...fact('暂时没有手机协同的要求','collaboration'),evidence:[{sourceId:'revision-1',quote:'暂时没有手机协同的要求'}]};
 const a=analysis(old,declined);a.input.sources=[{id:'scenario',type:'scenario',text:old.value},{id:'revision-1',type:'revision',text:declined.value}];
 assert(explainDecision(analysis(old),catalog).questions.some(q=>q.id==='collaboration_devices'));
 assert(!explainDecision(a,catalog).questions.some(q=>q.id==='collaboration_devices'));
 assert.equal(a.understanding.observations[0].value,old.value);
 for(const invalid of [{...declined,kind:'inference'},{...declined,value:'不确定是否没有手机协同的要求'}]){
  const b=analysis(old,invalid);b.input.sources=a.input.sources;
  assert(explainDecision(b,catalog).questions.some(q=>q.id==='collaboration_devices'));
 }
});

test('phone collaboration decline preserves tablet needs and a later explicit phone requirement',()=>{
 const old=fact('资料在手机和电脑之间搬来搬去','task');
 const declined={...fact('暂时没有手机协同的要求','collaboration'),evidence:[{sourceId:'revision-1',quote:'暂时没有手机协同的要求'}]};
 const tablet=fact('需要平板投屏','collaboration');
 const a=analysis(old,declined,tablet);a.input.sources=[{id:'scenario',type:'scenario'},{id:'revision-1',type:'revision'}];
 const retained=explainDecision(a,catalog).questions.find(q=>q.id==='collaboration_devices');
 assert(retained);assert.deepEqual(retained.evidence.map(e=>e.quote),[tablet.value]);
 const renewed={...fact('现在需要手机传照片','collaboration'),evidence:[{sourceId:'revision-2',quote:'现在需要手机传照片'}]};
 const b=analysis(old,declined,renewed);b.input.sources=[...a.input.sources,{id:'revision-2',type:'revision'}];
 assert.deepEqual(explainDecision(b,catalog).questions.find(q=>q.id==='collaboration_devices').evidence.map(e=>e.quote),[renewed.value]);
});
