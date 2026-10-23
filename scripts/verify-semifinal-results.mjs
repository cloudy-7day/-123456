import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checkCopyQuality} from '../src/editorial.mjs';
import {publishText} from '../modules/scenario/shared/publish-copy.mjs';

const cases=[['student','开学季 · 学生','小红书'],['meeting','职场办公 · 会议','小红书'],['meeting-moments','职场办公 · 会议','朋友圈']];
const rows=[],products=new Set(),platforms=new Set(),scenes=new Set();
for(const [id,scene,platform] of cases){
 const batch=JSON.parse(await fs.readFile(`output/semifinal-${id}.json`,'utf8'));
 assert.equal(batch.complete,true,id+' complete');
 const r=batch.results.find(x=>x.platform===platform)?.result;
 assert(r,id+' platform');assert.equal(r.checks.semantic_review,'passed');
 assert.equal(r.copy_quality?.passed,true,id+' stored quality check');
 assert.deepEqual(checkCopyQuality({input:r.input,output:r.output}).issues,[],id+' current quality rules');
 assert.equal(r.review_trace.at(-1).passed,true);
 assert(r.output.image_plan.length>=(platform==='小红书'?3:1));
 assert(r.output.image_plan.length<=(platform==='小红书'?6:3));
 for(const item of r.output.image_plan)assert(r.sources.some(s=>s.ref===item.source_ref&&s.kind==='image'&&s.local_path));
 assert.equal((await fs.readFile(`output/semifinal-${id}.txt`,'utf8')).replace(/\r\n/g,'\n'),publishText(r.output.content));
 products.add(r.input.product);platforms.add(platform);scenes.add(scene);
 rows.push({id,scene,platform,product:r.input.product,title:r.output.content.title,images:r.output.image_plan.length,rounds:r.review_trace.length,characters:r.copy_quality.body_han_count,created_at:batch.created_at,run_id:batch.run_id});
}
assert.equal(platforms.size,2);assert.equal(scenes.size,2);assert(products.size>=2,'different requirements select different products');
const lines=['# 有为智选：本地三组运行验收','',
 '验收范围：真实输入理解、需求选型、知识库检索、图文生成、逐句核验与文案质量检查；页面自动化另检验复制、导出、手机布局与配图尺寸。','',
 '| 业务场景 | 平台 | 匹配型号 | 正文汉字 | 配图 | 核验轮次 | 成果 |','|---|---|---|---:|---:|---:|---|',
 ...rows.map(x=>`| ${x.scene} | ${x.platform} | ${x.product} | ${x.characters} | ${x.images} | ${x.rounds} | [完整文案](semifinal-${x.id}.txt) · [运行与证据](semifinal-${x.id}.json) |`),'',
 '本次是本地运行验收，不代表官方评审结论。资料为原比赛知识库与已有官方图片补充；图片为产品资料图，不冒充真实使用场景。事实检查是模型辅助原文核验，保留逐句记录，不等同人工认证。','',
 '运行标识：',...rows.map(x=>`- ${x.id}：${x.run_id}；${x.created_at}`),'',
 '尚未推送 GitHub 或魔搭；复赛发布、说明书和连续运行视频另行准备。',''];
await fs.writeFile('output/acceptance-summary.md',lines.join('\n'));
await fs.writeFile('output/acceptance-manifest.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify({passed:true,scenes:scenes.size,platforms:platforms.size,results:rows},null,2));
