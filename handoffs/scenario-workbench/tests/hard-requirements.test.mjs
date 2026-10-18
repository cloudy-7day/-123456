import test from 'node:test';
import assert from 'node:assert/strict';
import {extractRequirements,evaluateProducts,validateFilterInput,filterInputFromSources} from '../shared/hard-requirements.mjs';
const catalog=[{name:'鸿蒙机型',systems:['HarmonyOS'],priceStatus:'历史快照，需核实报价'},{name:'双系统配置机型',systems:['Windows 11','Linux'],priceStatus:'无有效报价'},{name:'Windows 单系统',systems:['Windows 11'],priceStatus:'无有效报价'}];
const filter=text=>evaluateProducts(catalog,extractRequirements(text).requirements);
test('系统硬要求排除不符合型号，偏好不淘汰',()=>{assert.deepEqual(filter('只接受鸿蒙系统。').map(p=>p.status),['eligible','excluded','excluded']);assert.deepEqual(filter('必须使用 Windows 11。').map(p=>p.status),['excluded','eligible','eligible']);assert.ok(filter('最好是鸿蒙系统。').every(p=>p.status==='eligible'));});
test('预算支持元、k、万和范围上限，历史价格不能作为已满足依据',()=>{for(const text of ['预算硬上限 8000 元，含配件。','预算不超过8k。','预算0.8万元。','预算7000到8000元。']){const r=extractRequirements(text).requirements;assert.equal(r.find(r=>r.kind==='budget')?.value,8000,text);assert.ok(evaluateProducts(catalog,r).every(p=>p.status==='pending'));}assert.equal(extractRequirements('预算大概8000元左右。').requirements.length,0);});
test('软件硬要求不会被系统匹配替代',()=>{const results=filter('必须使用鸿蒙系统。必须在本地用 AutoCAD 2024。');assert.equal(results[0].status,'pending');assert.equal(results[1].status,'excluded');assert.ok(results[0].checks.some(c=>c.kind==='software'&&c.status==='pending'));});
test('系统冲突不擅自择一，Windows排除覆盖具体版本',()=>{assert.ok(filter('必须使用Windows 11。不接受Windows。').every(p=>p.status==='excluded'));assert.deepEqual(filter('不接受Windows。').map(p=>p.status),['eligible','eligible','excluded']);});
test('明确更正覆盖原系统与预算条件，保留其他硬要求',()=>{const r=extractRequirements('只接受Windows。预算8000元。必须在本地用AutoCAD。',{os:'HarmonyOS',budget:null});assert.deepEqual(r.requirements.map(r=>r.kind),['software','os']);assert.equal(r.requirements[1].value,'HarmonyOS');assert.equal(extractRequirements('预算8000元。',{scope:'total'}).requirements[0].scope,'total');});
test('服务端读取相同筛选条件并验证输入',()=>{const input=filterInputFromSources([{id:'s',type:'scenario',text:'预算8000元。'},{id:'product',type:'product',text:'Windows机型'},{id:'hard_filters',type:'revision',text:'{"budget":null}'}]);assert.equal(extractRequirements(input.text,input.override).requirements.length,0);assert.throws(()=>validateFilterInput({text:'test',override:{budget:-1}}));assert.throws(()=>validateFilterInput({text:'test',override:{os:'unknown'}}));});

test('预算硬要求不会把旧设备系统或普通软件描述提升为硬要求',()=>{const r=extractRequirements('旧电脑是Windows 11，常用WPS，预算硬上限8000元。');assert.deepEqual(r.requirements.map(r=>r.kind),['budget']);});
