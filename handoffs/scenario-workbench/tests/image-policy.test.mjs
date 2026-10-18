import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertLocalImagePath} from '../shared/image-policy.mjs';
import {assertRegisteredImage,localImage} from '../server/local-kb.mjs';
import {renderCard} from '../src/output.js';
test('预览与导出共用的入口拒绝外链、内嵌图片、越界路径',async()=>{
 for(const path of ['https://example.com/a.jpg','//example.com/a.png','data:image/png;base64,abc','blob:fake','/assets/huawei-logo.svg','/assets/ima/../a','/assets/ima/'+'a'.repeat(24)+'?url=https://example.com']){
  assert.throws(()=>assertLocalImagePath(path));await assert.rejects(renderCard({image:path},0),/ima 本地知识库/);
 }
 assert.equal(assertLocalImagePath('/assets/ima/'+'a'.repeat(24)),'/assets/ima/'+'a'.repeat(24));
});
test('形似本地路径但未登记的图片被拒绝',()=>{
 assert.throws(()=>assertRegisteredImage({id:'a'.repeat(24),assetPath:'/assets/ima/'+'a'.repeat(24)},'测试型号'),e=>e.code==='IMA_IMAGE_ONLY');
});
test('真实库素材允许读取，伪造来源或挪用其他型号被拒绝',async t=>{
 let index;try{index=JSON.parse(await readFile(process.env.IMA_LOCAL_INDEX||new URL('../.local/knowledge-base-index.json',import.meta.url)));}catch{t.skip('无本地测试知识库');return;}
 const p=index.products[0],i=p.images[0],input={...i,assetPath:'/assets/ima/'+i.id,sourceProduct:i.product};
 assert.equal(assertRegisteredImage(input,p.name).id,i.id);
 assert((await localImage(i.id)).data.length>0);
 assert.throws(()=>assertRegisteredImage({...input,sourceUrl:'https://example.com'},p.name),e=>e.code==='IMA_IMAGE_ONLY');
 assert.throws(()=>assertRegisteredImage(input,index.products[1].name),e=>e.code==='IMA_IMAGE_ONLY');
});
