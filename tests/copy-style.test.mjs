import test from 'node:test';
import assert from 'node:assert/strict';
import {omitScreenSpecs,preparePublicationStyle} from '../src/copy-style.mjs';
test('screen modifiers become task copy without changing model, conditions or citations',()=>{
 assert.equal(omitScreenSpecs('MateBook D 16 配备 16 英寸大屏，整理讨论稿更宽裕。[S1]'),'MateBook D 16 配备 大屏，整理讨论稿更宽裕。[S1]');
 assert.equal(omitScreenSpecs('查看 3:2 比例的屏幕；特定版本支持触控。'),'查看 屏幕；特定版本支持触控。');
 assert.equal(omitScreenSpecs('至少 16 英寸、16GB 内存；接口待核对。'),'至少 16 英寸、16GB 内存；接口待核对。');
});
test('missing topic labels are added before review without inventing product claims or rewriting content',()=>{
 const draft={content:{title:'开会',body:'📋 会前\n整理材料。',call_to_action:'哪一步最费心？'}};
 const prepared=preparePublicationStyle({platform:'小红书',scenario:'职场会议'},draft);
 assert.equal(prepared.content.body,'📋 会前\n整理材料。\n\n#职场日常 #项目会议');
 assert.equal(draft.content.body,'📋 会前\n整理材料。');
 assert.deepEqual(preparePublicationStyle({platform:'朋友圈'},draft),draft);
 assert.deepEqual(preparePublicationStyle({platform:'小红书'},prepared),prepared);
});
