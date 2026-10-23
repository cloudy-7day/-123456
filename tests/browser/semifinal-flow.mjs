// Existing Playwright regression replays synthetic API data; live UI is checked separately with CUA.
// Run against a built local app. No model, search, or other external API is called.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=(process.env.LOCAL_APP_URL||'http://127.0.0.1:8792').replace(/\/$/,'');
const dest=process.env.EVIDENCE_DIR||'output/semifinal';
await fs.mkdir(dest,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const first={id:'synthetic-harmony',name:'HUAWEI MateBook 14（鸿蒙版）',model:'HUAWEI MateBook 14',system:'HarmonyOS',features:[{id:'portable',label:'合成便携资料',evidence:'仅用于交互回归的便携资料',source_path:'synthetic/产品事实.md'}]};
const second={id:'synthetic-windows',name:'MateBook 14 酷睿 Ultra（Windows 系列）',model:'MateBook 14 酷睿 Ultra',system:'Windows',features:[{id:'portable',label:'合成便携资料',evidence:'仅用于交互回归的便携资料',source_path:'synthetic/产品事实.md'}]};
let sequence=0,lastAnalysis,decisionFails=false,analysisFails=false,excludeSecond=false;
const runRequests=[],analysisRequests=[],decisionRequests=[];
const output={customer_insight:'合成测试客户',strategy:'合成测试策略',content:{title:'合成测试文案',body:'第一段：这是用于验证交互的合成内容。\n\n第二段：不是产品能力或真实体验证明。',call_to_action:'合成测试互动'},image_plan:[],source_refs:['S1'],pending_confirmation:['这是一组明确标注的浏览器测试数据。']};
const saved={complete:true,errors:[],results:[{platform:'小红书',result:{input:{product:first.name,platform:'小红书'},output,sources:[{ref:'S1',kind:'text',title:'合成测试资料',text:'不是产品事实。'}],meta:{retrieval:{mode:'local'}},checks:{claim_review:{status:'passed',claims:[],issues:[]},note:'合成测试'},delivery:{status:'draft',reasons:[]}}}]};
await page.route('**/api/health',r=>r.fulfill({json:{configured:true,retrievalMode:'local'}}));
await page.route('**/api/products',r=>r.fulfill({json:{products:[first,second]}}));
await page.route('**/api/scenario-latest',r=>r.fulfill({status:404,json:{error:'无历史'}}));
await page.route('**/api/analyze',r=>{
 const input=r.request().postDataJSON();analysisRequests.push(input);
 if(analysisFails)return r.fulfill({status:503,json:{error:{message:'合成的连接失败'}}});
 const named=[first,second].find(p=>input.sources[0].text.includes(p.name));
 lastAnalysis={analysisId:`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,input,understanding:{observations:[{id:'o1',category:'task',kind:'fact',value:'每天背电脑出差',evidence:[],critical:false}],questions:[],conflicts:[],product:{status:named?'specified':'unspecified',name:named?.name||null,evidence:[]}},gate:{reasons:['洞察尚未人工确认'],status:'paused'}};
 return r.fulfill({json:lastAnalysis});
});
await page.route('**/api/confirm',r=>r.fulfill({json:{...lastAnalysis,review:{status:'confirmed'},gate:{reasons:[],status:'ready_for_ima'}}}));
await page.route('**/api/decision',r=>{
 const input=r.request().postDataJSON();decisionRequests.push(input);
 if(decisionFails)return r.fulfill({status:503,json:{error:{message:'合成决策失败'}}});
 const answered=lastAnalysis.input.sources.some(s=>s.type==='revision')||lastAnalysis.understanding.product.name;
 return r.fulfill({json:{candidates:[{name:input.manualProduct||lastAnalysis.understanding.product.name||first.name,reasons:[]}],questions:answered?[]:[{id:'weight_limit',topic:'mobility',question:'是否有不能超过的重量？',why:'它会改变候选排除。',affects:['重量限制'],evidence:[]}],exclusions:excludeSecond?[{name:second.name,reason:'合成资料中的重量超过客户明确上限'}]:[],limitations:['合成测试限制'],retrieval:{mode:'synthetic'}}});
});
await page.route('**/api/run-scenario',r=>{
 const req=r.request().postDataJSON();runRequests.push(req);
 const result=structuredClone(saved);result.results[0].platform=req.platforms[0];result.results[0].result.input={product:req.product,platform:req.platforms[0]};
 return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',result})+'\n'});
});
const go=()=>page.goto(base+'/scenario/');
const generation=()=>page.locator('.focused-generation>.integration-actions button.primary');
const model=()=>page.getByLabel('从资料库选择具体型号');
const generateTop=()=>page.locator('.clerk-submit button.primary');
async function expand(selector){const details=page.locator(selector);if(!await details.evaluate(e=>e.open))await details.locator(':scope>summary').click();}
async function finished(){await page.locator('.focused-generation .result-view').waitFor();await page.waitForFunction(()=>!document.querySelector('#scenario').matches(':disabled'));}
try{
 await go();assert.match(await page.title(),/华为|门店/);assert(await page.locator('main').innerText());
 assert.equal(await page.locator('.input-settings').evaluate(e=>e.open),false,'channel and implementation details start collapsed');
 assert.equal(await page.getByRole('radio',{name:'仅整理选购要点',exact:false}).isChecked(),true);
 await page.screenshot({path:path.join(dest,'clerk-entry-desktop.png'),fullPage:true});
 await page.locator('#scenario').fill('每天背电脑出差，想找轻便一点的。');
 await generateTop().click();await finished();
 assert.equal(runRequests.length,1,'nonblocking questions must not force a second generation click');
 assert.equal(runRequests[0].store_support,'selection_guidance');
 assert.equal(await page.locator('#understanding').evaluate(e=>e.open),false);
 assert.equal(await page.locator('.selection-review').evaluate(e=>e.open),false);
 await expand('.selection-review');
 await page.getByRole('region',{name:'关键追问'}).waitFor();

 // Dirty followups hide the obsolete draft and block all generation/export entrances.
 await page.locator('#decision-weight_limit').fill('只算电脑，不能超过1.3kg');
 assert.equal(await generation().isDisabled(),true);
 assert.equal(await generateTop().isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'继续生成草稿',exact:true,includeHidden:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'导出兼容任务包',exact:true,includeHidden:true}).isDisabled(),true);
 assert.equal(await page.locator('.focused-generation .result-view').count(),0,'pending answers must not leave a stale draft copyable');
 await page.locator('#decision-weight_limit').fill('   ');
 assert.equal(await generation().isEnabled(),true,'whitespace is not a pending answer');
 assert.equal(await page.getByRole('button',{name:'根据回答更新候选',exact:true}).isDisabled(),true);
 assert.equal(runRequests.length,1,'clearing an answer does not silently regenerate');

 const decisionBeforeTyping=decisionRequests.length;
 await model().fill('M');await model().fill(second.name);
 assert.equal(runRequests.length,1,'editing a model never auto-generates');
 assert.equal(decisionRequests.length,decisionBeforeTyping,'typing does not remount or refetch the decision');
 await page.locator('#decision-weight_limit').fill('轻便只是偏好，没有上限');
 await expand('.input-settings');
 await page.getByRole('tab',{name:'公众号',exact:true}).click();
 await page.getByRole('region',{name:'关键追问'}).waitFor();
 assert.equal(await model().inputValue(),second.name,'manual product survives a platform switch before answering');
 assert.equal(await page.locator('#decision-weight_limit').inputValue(),'轻便只是偏好，没有上限');
 assert.equal(await generation().isDisabled(),true,'switching platform must not bypass pending answers');
 assert.equal(runRequests.length,1);
 await page.locator('#decision-weight_limit').fill('');
 assert.equal(await generation().isEnabled(),true,'clearing the answer restores limited generation');
 await page.waitForTimeout(100);
 assert.equal(runRequests.length,1,'a platform remount with pending answers cannot later generate silently');
 await page.locator('#decision-weight_limit').fill('轻便只是偏好，没有上限');
 await page.screenshot({path:path.join(dest,'pending-answer-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'根据回答更新候选',exact:true}).click();await finished();
 assert.equal(runRequests.length,2,'successful clarification generates exactly once');
 assert.equal(runRequests.at(-1).product,second.name,'manual product survives clarification');
 assert.equal(runRequests.at(-1).productOrigin,'salesperson_selection');
 assert(analysisRequests.at(-1).sources.some(s=>s.type==='revision'&&s.text.includes('weight_limit')&&s.text.includes('没有上限')));
 assert.equal(await page.getByRole('region',{name:'关键追问'}).count(),0,'answered questions are no longer shown');

 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出图文 HTML',exact:true}).click();
 const file=await download;await file.saveAs(path.join(dest,'synthetic-publication.html'));
 assert((await fs.readFile(path.join(dest,'synthetic-publication.html'),'utf8')).includes('第二段'));
 await page.getByRole('tab',{name:'小红书',exact:true}).click();await finished();
 assert.equal(runRequests.length,3,'one platform switch produces one generation');
 assert.deepEqual(runRequests.at(-1).platforms,['小红书']);
 assert.equal(runRequests.at(-1).product,second.name,'manual product survives switching after answering');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(dest,'synthetic-mobile.png'),fullPage:true});

 // New customer input discards the previous handoff choice and followups.
 await page.locator('#scenario').fill('新的客户场景：我明确想要 '+first.name);
 assert.equal(await page.locator('.focused-generation').count(),0,'new raw input clears the old result');
 await generateTop().click();await finished();
 assert.equal(runRequests.length,4);assert.equal(runRequests.at(-1).product,first.name);
 assert.equal(runRequests.at(-1).productOrigin,'input_match');
 assert.equal(analysisRequests.at(-1).sources.length,1,'old clarification must not leak into a new customer input');

 // Commute example picks a real catalog entry separately. Service consent is independent of customer facts.
 await go();await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'填入通勤示例',exact:false}).click();
 const commute='每天背电脑坐地铁通勤，还要带充电器；主要写文档、开视频会议，想轻一点，但不清楚常用软件是否适配。';
 assert.equal(await page.locator('#scenario').inputValue(),commute);
 assert.equal(await page.locator('#designated-product').inputValue(),second.name);
 await page.screenshot({path:path.join(dest,'commute-entry-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(dest,'commute-entry-mobile.png'),fullPage:true});
 assert.equal(await page.getByRole('radio',{name:'仅整理选购要点',exact:false}).isChecked(),true);
 await page.getByRole('radio',{name:'核对软件 / 版本',exact:false}).check();
 await generateTop().click();await finished();
 assert.equal(runRequests.at(-1).store_support,'software_check');
 assert.equal(runRequests.at(-1).product,second.name);
 assert.deepEqual(analysisRequests.at(-1).sources,[{id:'scenario',type:'scenario',text:commute}]);
 const beforeServiceChange=runRequests.length;
 await page.getByRole('radio',{name:'到店试机',exact:false}).check();
 assert.equal(await page.locator('.focused-generation').count(),0,'changed store service hides obsolete output');
 assert.equal(runRequests.length,beforeServiceChange,'service changes require an explicit generation click');
 await generateTop().click();await finished();assert.equal(runRequests.at(-1).store_support,'in_store_demo');

 // A known hard conflict cannot be bypassed by manually selecting the excluded model.
 excludeSecond=true;await go();await page.locator('#scenario').fill('合成约束：电脑不能超过1.3kg。');
 await page.locator('#designated-product').selectOption(second.name);const beforeConflict=runRequests.length;
 await generateTop().click();await page.getByText('当前型号不满足明确条件：',{exact:false}).waitFor();
 assert.equal(runRequests.length,beforeConflict);assert.equal(await generation().isDisabled(),true);
 await expand('.selection-review');await model().fill(first.name);await generation().click();await finished();
 assert.equal(runRequests.length,beforeConflict+1);assert.equal(runRequests.at(-1).product,first.name);excludeSecond=false;

 // Failed matching offers one clear manual action; failed clarification retains the answer.
 decisionFails=true;await go();await page.locator('#scenario').fill('每天背电脑出差');
 const before=runRequests.length;
 await generateTop().click();await page.getByText('自动匹配暂不可用。',{exact:false}).waitFor();
 assert.equal(runRequests.length,before);assert.equal(await generation().textContent(),'按现有资料生成');
 decisionFails=false;await go();await page.locator('#scenario').fill('每天背电脑出差');
 await generateTop().click();await finished();await expand('.selection-review');
 await page.locator('#decision-weight_limit').fill('只算电脑，不能超过1.3kg');analysisFails=true;
 await page.getByRole('button',{name:'根据回答更新候选',exact:true}).click();
 await page.getByRole('alert').getByText('合成的连接失败',{exact:true}).waitFor();
 assert((await page.locator('body').textContent()).includes('只算电脑，不能超过1.3kg'),'failed reanalysis retains the submitted answer');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(dest,'browser-checks.json'),JSON.stringify({passed:true,browser_path:'Existing Playwright mock regression; live UI verified separately with CUA',viewports:['1440x1000','390x844'],checks:['one-click nonblocking draft','advanced information collapsed','default service has no extra offer','commute example exact source and separate catalog product','service option sent independently','service change does not silently generate','pending answers hide stale copy','pending answer blocks all generation and export','clearing answer does not regenerate','manual product survives platform and clarification','new source clears old handoff choice','manual hard conflict blocked','decision failure no auto generation','failed clarification retains answer','HTML export','mobile overflow','no page errors'],requests:runRequests.length},null,2));
 console.log('PASS semifinal UI: one-click draft, separate store service, collapsed details, hard constraints, dirty answer guard, manual model continuity, error recovery, mobile');
}finally{await browser.close();}
