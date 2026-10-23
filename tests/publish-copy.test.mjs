import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanReferences,publishText,copyBlocks,publicationContent} from '../modules/scenario/shared/publish-copy.mjs';

test('publication hides citation markers but preserves model names and ordinary brackets',()=>{
 assert.equal(cleanReferences('屏幕[S1][S2]，协同【s3】与照片［I2］。'), '屏幕，协同与照片。');
 assert.equal(cleanReferences('显示[S1, S2]与协同【s2、s3】。'), '显示与协同。');
 assert.equal(cleanReferences('S1 型号【校园生活】[预算待定]，支持 3:2。'),'S1 型号【校园生活】[预算待定]，支持 3:2。');
});

test('copy and text export share clean complete copy without mutating source evidence',()=>{
 const content={title:'## 校园日常[S1]',body:'🏠 **在寝室**\n整理素材【s2】。\n\n#校园生活 #华为电脑',call_to_action:'你会怎么用？[S1]'};
 const before=structuredClone(content);
 assert.equal(publishText(content),'校园日常\n\n🏠 在寝室\n整理素材。\n\n#校园生活 #华为电脑\n\n你会怎么用？');
 assert.deepEqual(content,before);
});

test('visual blocks distinguish scene headings, paragraphs and topics without inventing text',()=>{
 const blocks=copyBlocks('开场正文[S1]。\n\n🏠 寝室：整理创作素材\n把照片放入作业。\n\n## 图书馆\n阅读资料。\n\n#校园生活 #华为电脑');
 assert.deepEqual(blocks.map(b=>b.type),['paragraph','scene','scene','topics']);
 assert.equal(blocks[1].heading,'🏠 寝室：整理创作素材');
 assert.equal(blocks[1].text,'把照片放入作业。');
 assert.deepEqual(blocks[3].tags,['#校园生活','#华为电脑']);
});
test('a long emoji paragraph gets a short scene heading without replacing its words',()=>{
 const body='🏠 寝室里，同学发来资料。'+ '你按小组分工整理素材。'.repeat(10);
 const [block]=copyBlocks(body);
 assert.equal(block.type,'scene');assert.equal(block.heading,'🏠 寝室里');
 assert.equal(block.text,'同学发来资料。'+'你按小组分工整理素材。'.repeat(10));
});
test('publication puts existing topic labels in one place and preserves source output',()=>{
 const original={title:'标题',body:'正文[S1]。\n\n#学习 #校园',call_to_action:'你怎么做？#校园 #汇报'};
 const visible=publicationContent(original);
 assert.equal(visible.body,'正文。\n\n#学习 #校园 #汇报');assert.equal(visible.call_to_action,'你怎么做？');
 assert.equal(original.call_to_action,'你怎么做？#校园 #汇报');
 assert.equal(publishText(original),'标题\n\n正文。\n\n#学习 #校园 #汇报\n\n你怎么做？');
});
