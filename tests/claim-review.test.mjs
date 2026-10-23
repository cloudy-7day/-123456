import test from 'node:test';
import assert from 'node:assert/strict';
let api;
try { api = await import('../src/claim-review.mjs'); } catch {}
const sources=[{ref:'S1',kind:'text',title:'产品事实.md',text:'采用3:2比例屏幕。支持在兼容设备间使用华为分享传送文件。'}, {ref:'I1',kind:'image',title:'演示画面',description:'手机协同'}];
const output={content:{title:'准备好下一次汇报',body:'采用3:2比例屏幕。[S1]\n搭配兼容设备，用华为分享传送文件。[S1]',call_to_action:'你的小组资料放在哪里？'},image_plan:[]};
test('year in exact selected model heading is identity evidence, never a free pass for specs or other versions',()=>{
 const sources=[{ref:'S1',kind:'text',title:'产品事实.md',text:'# HUAWEI MateBook D 16 SE 版 2024 - 产品事实\n\n配备独立数字键盘。'}];
 const raw={claims:[{segment_id:'C1',status:'supported',reason:'键盘原文',evidence:[{source_ref:'S1',quote:'配备独立数字键盘。'}]}]};
 const options={product:'MateBook D 16 SE 版（Windows 系列）'};
 const verify=text=>api.validateClaimReview(raw,[{id:'C1',location:'content.body',text}],sources,options).passed;
 assert.equal(verify('HUAWEI MateBook D 16 SE 版 2024 配备独立数字键盘。'),true);
 assert.equal(verify('MateBook D 16 SE 版 2025 配备独立数字键盘。'),false);
 assert.equal(verify('MateBook D 16 SE 版 2024 配备32GB内存与独立数字键盘。'),false);
 assert.equal(verify('MateBook D 16 2024 配备独立数字键盘。'),false);
});
function review(segments){return {claims:segments.map(s=>({segment_id:s.id,status:s.location==='content.body'?'supported':'not_applicable',reason:'核对任务表达或产品原文',evidence:s.location==='content.body'?[{source_ref:'S1',quote:s.text.includes('分享')?'支持在兼容设备间使用华为分享传送文件。':'采用3:2比例屏幕。'}]:[]}))};}
test('review segments cover title, every body sentence, CTA and image captions',()=>{
 assert.ok(api?.reviewSegments,'claim review module must exist');
 const segments=api.reviewSegments({...output,image_plan:[{caption:'电脑会自动整理全部资料',position:'首图',source_ref:'I1'}]});
 assert(segments.some(s=>s.location==='image_plan.0.caption'));
 assert.equal(segments.filter(s=>s.location==='content.body').length,2);
 assert.equal(new Set(segments.map(s=>s.id)).size,segments.length);
});
test('valid original excerpts and full coverage pass without claiming human certification',()=>{
 assert.ok(api);const segments=api.reviewSegments(output);const result=api.validateClaimReview(review(segments),segments,sources);
 assert.equal(result.passed,true);assert.equal(result.method,'model_assisted_source_check');
});
test('missing sentence, empty claims and invented excerpt cannot pass',()=>{
 assert.ok(api);const segments=api.reviewSegments(output);
 for(const raw of [{claims:[]},{claims:review(segments).claims.slice(1)},{claims:review(segments).claims.map(c=>c.status==='supported'?{...c,evidence:[{source_ref:'S1',quote:'所有软件无需安装即可运行'}]}:c)}]){
  assert.equal(api.validateClaimReview(raw,segments,sources).passed,false);
 }
});
test('image metadata, unsupported claims and hidden qualification cannot validate product promises',()=>{
 assert.ok(api);const segments=api.reviewSegments(output);
 for(const patch of [{status:'unsupported'},{evidence:[{source_ref:'I1',quote:'手机协同'}]},{status:'qualified',qualification:'搭配特定版本'}]){
  const raw=review(segments);Object.assign(raw.claims.find(c=>c.status==='supported'),patch);
  assert.equal(api.validateClaimReview(raw,segments,sources).passed,false);
 }
});
test('numbers absent from quoted evidence cannot be accepted as supported',()=>{
 assert.ok(api);const segments=api.reviewSegments({...output,content:{...output.content,body:'屏幕为4:3比例。[S1]'}});
 assert.equal(api.validateClaimReview(review(segments),segments,sources).passed,false);
});
test('not-applicable cannot bypass concrete numerical or automation promises',()=>{
 for(const text of ['整机仅980g','一键批注所有文件，效率提升50%']){
  const segments=[{id:'C1',location:'content.body',text}];
  assert.equal(api.validateClaimReview({claims:[{segment_id:'C1',status:'not_applicable',reason:'情境',evidence:[]}]},segments,sources).passed,false);
 }
});
test('numeric tokens cannot match a substring of a different number',()=>{
 const segments=[{id:'C1',location:'content.body',text:'内存16GB'}];
 const raw={claims:[{segment_id:'C1',status:'supported',reason:'参数',evidence:[{source_ref:'S1',quote:'内存216GB。'}]}]};
 assert.equal(api.validateClaimReview(raw,segments,[{ref:'S1',kind:'text',text:'内存216GB。'}]).passed,false);
});
test('selected model digits are identity, while positive specifications still require matching evidence',()=>{
 const segments=[{id:'C1',location:'content.body',text:'HUAWEI MateBook 14（鸿蒙版）支持3:2比例屏幕。'}];
 const raw={claims:[{segment_id:'C1',status:'supported',reason:'屏幕比例',evidence:[{source_ref:'S1',quote:'采用3:2比例屏幕。'}]}]};
 assert.equal(api.validateClaimReview(raw,segments,sources,{product:'HUAWEI MateBook 14（鸿蒙版）'}).passed,true);
 segments[0].text='MateBook 14（鸿蒙版）支持3:2比例屏幕。';
 assert.equal(api.validateClaimReview(raw,segments,sources,{product:'HUAWEI MateBook 14（鸿蒙版）'}).passed,true);
 segments[0].text='MateBook 14（鸿蒙版）支持14小时续航。';
 assert.equal(api.validateClaimReview(raw,segments,sources,{product:'HUAWEI MateBook 14（鸿蒙版）'}).passed,false);
 segments[0].text='HUAWEI MateBook 14（鸿蒙版）支持4:3比例屏幕。';
 assert.equal(api.validateClaimReview(raw,segments,sources,{product:'HUAWEI MateBook 14（鸿蒙版）'}).passed,false);
});
test('image disclaimer negates performance promises but cannot hide a positive claim after it',()=>{
 const segments=[{id:'C1',location:'image_plan.0.caption',text:'机身侧面展示，不代表性能、续航或具体效果。'}];
 const raw={claims:[{segment_id:'C1',status:'not_applicable',reason:'外观图标签与使用边界',evidence:[]}]};
 assert.equal(api.validateClaimReview(raw,segments,sources).passed,true);
 segments[0].text+='但是支持全部软件。';
 assert.equal(api.validateClaimReview(raw,segments,sources).passed,false);
});
test('plain topic labels and explicit image non-claims do not imply product functionality',()=>{
 for(const text of ['#小组汇报 #大学生日常 #鸿蒙电脑','原野绿键盘外观，不据此推断输入体验或性能。']){
  const s=[{id:'C1',location:'content.body',text}];
  assert.equal(api.validateClaimReview({claims:[{segment_id:'C1',status:'not_applicable',reason:'话题或图片非承诺',evidence:[]}]},s,sources).passed,true);
 }
});

test('OS identity in scene headlines and model hashtags does not imply a capability',()=>{
 for(const text of ['一台鸿蒙电脑从寝室做到图书馆','下一站带上 HarmonyOS 电脑','#小组汇报 #大学生日常 #HUAWEI MateBook 14 #鸿蒙电脑']){
  const s=[{id:'C1',location:'content.body',text}];
  assert.equal(api.validateClaimReview({claims:[{segment_id:'C1',status:'not_applicable',reason:'型号身份或普通场景叙事',evidence:[]}]},s,sources).passed,true);
 }
});

test('OS-labelled compatibility and automation promises still require evidence',()=>{
 for(const text of ['鸿蒙电脑支持所有Windows软件','#鸿蒙电脑 #一键批注所有文件','#HarmonyOS #续航20小时']){
  const s=[{id:'C1',location:'content.body',text}];
  assert.equal(api.validateClaimReview({claims:[{segment_id:'C1',status:'not_applicable',reason:'标签',evidence:[]}]},s,sources).passed,false);
 }
});

test('explicit compatibility uncertainty is not a positive compatibility promise',()=>{
 const s=[{id:'C1',location:'image_plan.0.caption',text:'丰富接口轻薄侧面，展示机身侧面接口布局，具体可用接口与显示兼容需按实际机型核验。'}];
 const raw={claims:[{segment_id:'C1',status:'not_applicable',reason:'外观标签，兼容性尚待确认',evidence:[]}]};
 assert.equal(api.validateClaimReview(raw,s,sources).passed,true);
 s[0].text+='但是兼容所有软件。';
 assert.equal(api.validateClaimReview(raw,s,sources).passed,false);
 s[0].text='兼容所有软件需核验。';
 assert.equal(api.validateClaimReview(raw,s,sources).passed,false);
});

test('a disclaimer cannot swallow a positive capability after conjunctions or sentence boundaries',()=>{
 const raw={claims:[{segment_id:'C1',status:'not_applicable',reason:'声称仅为说明',evidence:[]}]};
 for(const text of [
  '未验证兼容性而且支持任何软件',
  '不代表续航并且支持任何软件',
  '不据此推断性能同时电脑一键生成全部方案',
  '兼容性需核验而且支持全部插件',
  '未验证兼容性,支持全部软件',
  '不证明性能;电脑支持全部软件',
  '不代表性能。电脑支持全部软件',
 ]){
  assert.equal(api.validateClaimReview(raw,[{id:'C1',location:'content.body',text}],sources).passed,false,text);
 }
});

test('universal software and no-stutter promises cannot be skipped, including hashtags',()=>{
 const raw={claims:[{segment_id:'C1',status:'not_applicable',reason:'任务或标签',evidence:[]}]};
 for(const text of ['该电脑运行任何软件都不会卡顿','本机运行所有应用','电脑永远不卡顿','#零卡顿 #办公电脑']){
  assert.equal(api.validateClaimReview(raw,[{id:'C1',location:'content.body',text}],sources).passed,false,text);
 }
});

test('ordinary manual tasks and separate negative clauses remain non-product claims',()=>{
 const raw={claims:[{segment_id:'C1',status:'not_applicable',reason:'手动任务或否定声明',evidence:[]}]};
 for(const text of [
  '你整理资料并且手动修改同一份汇报',
  '你先阅读公开资料，同时逐项核对待办，避免遗漏',
  '机身侧面标签，不代表性能，而且不证明续航',
  '未验证兼容性，并且不据此推断软件性能',
 ]){
  assert.equal(api.validateClaimReview(raw,[{id:'C1',location:'content.body',text}],sources).passed,true,text);
 }
});

test('finding versions on one computer is ordinary narrative while cross-device synchronization is a capability',()=>{
 const raw={claims:[{segment_id:'C1',status:'not_applicable',reason:'手动任务叙事',evidence:[]}]};
 const text='老师同学提的意见，你当场自己记下来，回到文档里一条条对应到具体页面和段落——这一步电脑替不了你，但素材都在同一台机器里，不用再跨设备找版本。';
 assert.equal(api.validateClaimReview(raw,[{id:'C1',location:'content.body',text}],sources).passed,true);
 for(const promise of ['跨设备自动同步全部资料','跨设备文件同步','跨设备远程操控手机']){
  assert.equal(api.validateClaimReview(raw,[{id:'C1',location:'content.body',text:promise}],sources).passed,false,promise);
 }
});
test('pure pending support statements are not promises while adjacent positive claims still need evidence',()=>{
 for(const text of ['手写笔及具体应用支持情况需另行确认。','手写笔支持情况以实际销售版本和官方说明为准。']){
  const segments=[{id:'C1',location:'image_plan.0.caption',text}];
  assert.equal(api.validateClaimReview({claims:[{segment_id:'C1',status:'not_applicable',reason:'未知说明',evidence:[]}]},segments,[]).passed,true);
 }
 const segments=[{id:'C1',text:'手写笔支持情况需另行确认，但它支持全部应用自动批注。'}];
 assert.equal(api.validateClaimReview({claims:[{segment_id:'C1',status:'not_applicable',reason:'未知说明',evidence:[]}]},segments,[]).passed,false);
 const hidden=[{id:'C1',text:'本机支持所有软件其支持情况需另行确认。'}];
 assert.equal(api.validateClaimReview({claims:[{segment_id:'C1',status:'not_applicable',reason:'未知说明',evidence:[]}]},hidden,[]).passed,false);
});

test('whole-device appearance is a visual label but adjoining performance or touch claims still need evidence',()=>{
 const raw={claims:[{segment_id:'C1',status:'not_applicable',reason:'外观标签',evidence:[]}]};
 for(const [text,passed] of [['展示整机外观。',true],['整机外观轻薄，续航提升50%。',false],['整机外观图支持触控操作。',false]]){
  assert.equal(api.validateClaimReview(raw,[{id:'C1',location:'image_plan.0.caption',text}],[]).passed,passed,text);
 }
});
