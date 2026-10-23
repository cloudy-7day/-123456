const noDiagnostics={record:async()=>{},list:async()=>[]};
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as knowledge from '../src/local-knowledge.mjs';
import {createScenarioService} from '../src/scenario-service.mjs';
import {productFeatures} from '../src/product-profile.mjs';
test('portable feature requires every listed complete-device weight within limit',()=>{
 const features=weight=>productFeatures(`## 尺寸与重量\n\n重量\n\n${weight}\n\n*依配置可能有所差异。\n\n## 键盘和触控板\n\n全尺寸背光键盘\n`,'root/产品事实.md');
 assert(features('约 1.2 kg').some(f=>f.id==='portable'&&/依配置/.test(f.evidence)));
 for(const weight of ['约 1.2 kg（不含键盘）','约 1.2 kg\n\n高配约 1.6 kg','重量待定'])assert(!features(weight).some(f=>f.id==='portable'));
});
test('catalog profiles keep source evidence, qualify features and preview original image bytes',async()=>{
 const catalog=await knowledge.localCatalog();
 assert(catalog.products.every(p=>Array.isArray(p.features)));
 const fold=catalog.products.find(p=>/Fold/.test(p.name));
 assert(!fold.features.some(f=>f.id==='portable'));
 assert(fold.features.some(f=>f.id==='large_screen'&&/展开/.test(f.evidence)));
 assert(fold.features.some(f=>f.id==='foldable'));
 assert(fold.features.some(f=>f.id==='screen'&&/展开态.*18 英寸/s.test(f.evidence)));
 for(const p of catalog.products){
  assert(p.features.every(f=>f.evidence&&f.source_path.endsWith('/产品事实.md')));
  assert(p.preview,`${p.name} needs a product photo`);
  assert(p.preview.url.startsWith(`/api/product-image/${p.id}?v=`));
  const image=await knowledge.productPreview(p.id);
  assert.equal(image.asset.visual_review?.preview,true,`${p.name} preview must be visually reviewed`);
  assert.equal(image.asset.visual_review?.role,'product');
  assert.equal(image.asset.path,p.preview.path);
  assert.equal(createHash('sha256').update(image.bytes).digest('hex'),image.asset.sha256);
  let headers,body;
  await createScenarioService({}, {diagnostics:noDiagnostics})({method:'GET'},{writeHead:(status,value)=>{assert.equal(status,200);headers=value;},end:value=>{body=value;}},p.preview.url.split('?')[0],()=>assert.fail('preview should be an image response'));
  assert.match(headers['Content-Type'],/^image\//);assert.equal(headers['X-Content-Type-Options'],'nosniff');assert.deepEqual(body,image.bytes);
 }
});
test('catalog skips invalid image and fact assets, preview route hides invalid ids and paths',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'product-profile-'));
 try{
  const catalog={schema_version:1,knowledge_base:'test',products:[{id:'pc-1234567890abcdef',name:'test',model:'test',system:'Windows',path:'root/product',documents:[{title:'产品事实.md',path:'root/product/产品事实.md',file:'assets/'+ 'a'.repeat(64)+'.md',sha256:'a'.repeat(64)}],images:[{title:'bad',path:'other/product/a.png',file:'../secret',extension:'png',sha256:'b'.repeat(64)}]}]};
  await fs.writeFile(path.join(directory,'catalog.json'),JSON.stringify(catalog));
  const result=await knowledge.localCatalog(directory);
  assert.equal(result.products[0].preview,null);assert.deepEqual(result.products[0].features,[]);
  const handle=createScenarioService({knowledgeDir:directory}, {diagnostics:noDiagnostics});
  for(const id of ['pc-1234567890abcdef','unknown','../secret','%2e%2e']){
   let response;await handle({method:'GET'},{},`/api/product-image/${id}`,(status,body)=>{response={status,body};});
   assert.equal(response.status,404);assert.equal(response.body.error,'未找到可用产品图片');
  }
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
