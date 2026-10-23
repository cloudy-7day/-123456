import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationBlocks} from '../modules/scenario/shared/publish-copy.mjs';

test('publication interleaves verified images with story sections, deduplicating source and file',()=>{
 const sources=[{ref:'I1',kind:'image',local_path:'assets/a.jpg'},{ref:'I2',kind:'image',local_path:'assets/b.jpg'},{ref:'I3',kind:'image',local_path:'assets/a.jpg'}];
 const blocks=publicationBlocks('开场\n\n🏠 寝室\n整理资料\n\n📚 图书馆\n阅读\n\n#校园', [{source_ref:'I1'},{source_ref:'I2'},{source_ref:'I1'},{source_ref:'I3'},{source_ref:'I99'}],sources);
 assert.deepEqual(blocks.filter(b=>b.type==='image').map(b=>b.source.ref),['I1','I2']);
 assert.equal(blocks[1].type,'image');
 assert.equal(blocks.at(-1).type,'topics');
 assert(blocks.findIndex(b=>b.type==='image')<blocks.findLastIndex(b=>b.type==='scene'));
});
test('text-only and single-paragraph publications remain readable',()=>{
 assert.equal(publicationBlocks('正文',[],[]).length,1);
 assert.equal(publicationBlocks('正文',[{source_ref:'I1'}],[{ref:'I1',kind:'image',local_path:'x.jpg'}]).at(-1).type,'image');
});
