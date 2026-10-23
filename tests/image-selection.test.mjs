import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectDiverseImages, reviewImagePlan, imageDiversityMetadata } from '../src/image-selection.mjs';
const image=(id,description,extra={})=>({ref:id,kind:'image',sha256:id,path:`product/${id}.png`,title:description,description,...extra});
test('different colors of the same angle do not fill image quota',()=>{
  const result=selectDiverseImages([image('a','绿色正面产品展示'),image('b','粉色正面产品展示'),image('c','侧面接口'),image('d','键盘俯视')],{productPath:'product',minimum:3});
  assert.deepEqual(result.images.map(x=>x.ref),['a','c','d']);
  assert.equal(result.rejected[0].reason,'same-angle');
  assert.equal(result.missing,0);
});
test('byte duplicates, conservative visual duplicates, and foreign products are rejected separately',()=>{
  const reviewIndex={assets:{a:{dhash:'0000000000000000',ahash:'0000000000000000'},b:{dhash:'0000000000000001',ahash:'0000000000000001'}}};
  const result=selectDiverseImages([image('a','创作场景'),image('a','再一份'),image('b','其他展示'),image('c','接口',{path:'product-other/c.png'})],{productPath:'product',reviewIndex});
  assert.equal(result.images.length,1);
  assert.deepEqual(result.rejected.map(x=>x.reason),['exact-duplicate','visual-near-duplicate','wrong-product']);
  assert.equal(result.missing,2);
  assert.match(result.warnings.join(''),/缺.*2/);
});
test('unknown angles are not falsely claimed to be visually distinct',()=>{
  assert.equal(imageDiversityMetadata(image('a','无角度说明'),{assets:{}}).angle_group,null);
});

test('visual review rejects misleading filenames and stays bound to original bytes',()=>{
 const chip=image('chip','精致产品外观',{visual_review:{sha256:'chip',allowed:false}});
 const valid=image('laptop','整机',{visual_review:{sha256:'laptop',allowed:true,angle_group:'front'}});
 const changed=image('new-bytes','整机',{visual_review:{sha256:'old-bytes',allowed:true}});
 const r=selectDiverseImages([chip,valid,changed]);
 assert.deepEqual(r.images,[valid]);assert(r.rejected.every(x=>x.reason==='visual-content-not-approved'));
});
test('review removes repeated model choices and fills with distinct owned candidates',()=>{
  const sources=[image('a','正面展示'),image('b','正面粉色展示'),image('c','侧面接口'),image('d','键盘俯视')];
  const result=reviewImagePlan([{source_ref:'a',caption:'外观'},{source_ref:'b',caption:'外观'},{source_ref:'bogus'}],sources,{productPath:'product'});
  assert.deepEqual(result.image_plan.map(x=>x.source_ref),['a','c','d']);
  assert.equal(result.missing,0);
  assert.equal(result.image_plan[1].caption,'产品外观图');
});
test('missing distinct images stays missing instead of repeating candidates',()=>{
  const result=reviewImagePlan([], [image('a','正面展示'),image('b','正面展示')],{productPath:'product'});
  assert.equal(result.image_plan.length,1);
  assert.equal(result.missing,2);
});
test('offline fingerprints cover the current original image catalog by SHA',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../knowledge/catalog.json',import.meta.url)));
  const index=JSON.parse(fs.readFileSync(new URL('../knowledge/image-diversity.json',import.meta.url)));
  for(const product of catalog.products)for(const asset of product.images){
    assert.equal(index.assets[asset.sha256]?.product_id,product.id);
    assert.match(index.assets[asset.sha256].dhash,/^[a-f0-9]{16}$/);
    assert.match(index.assets[asset.sha256].ahash,/^[a-f0-9]{16}$/);
  }
});
