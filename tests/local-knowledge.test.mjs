const noDiagnostics={record:async()=>{},list:async()=>[]};
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { retrieveEvidence } from '../src/evidence-cache.mjs';
import { config, ROOT } from '../src/config.mjs';
import { createScenarioService } from '../src/scenario-service.mjs';
let api; try { api=await import('../src/local-knowledge.mjs'); } catch {}

test('image ranking retrieves later scene details before generic colors and deduplicates bytes',()=>{
  assert.equal(typeof api.rankKnowledgeImages,'function');
  const generic=Array.from({length:6},(_,i)=>({title:`配色${i}`,sha256:`color${i}`}));
  const keyboard={title:'舒适键盘细节',sha256:'keyboard'};
  const carry={title:'轻薄机身细节',sha256:'carry'};
  const images=[...generic,keyboard,carry,{...keyboard,title:'另一文件名'}];
  const ranked=api.rankKnowledgeImages(images,{scenario:'每天背电脑去图书馆写代码'});
  assert.deepEqual(new Set(ranked.slice(0,2).map(x=>x.sha256)),new Set(['keyboard','carry']));
  assert.equal(ranked.filter(x=>x.sha256==='keyboard').length,1);
  assert.equal(images.length,9,'ranking must not mutate source catalog');
});

test('image ranking preserves unmatched order and prefers clear originals',()=>{
  assert.equal(typeof api.rankKnowledgeImages,'function');
  const images=[{title:'模糊屏幕',sha256:'blur'},{title:'外观一',sha256:'one'},{title:'外观二',sha256:'two'}];
  assert.deepEqual(api.rankKnowledgeImages(images,{scenario:'普通选购'}).map(x=>x.sha256),['one','two','blur']);
});

test('bundled catalog has distinct systems and stable unique product IDs',async()=>{
  assert.ok(api?.localCatalog,'local catalog implementation required');
  const catalog=await api.localCatalog();
  assert.equal(catalog.products.length,10);
  assert.equal(new Set(catalog.products.map(p=>p.id)).size,10);
  assert.equal(catalog.retrieval.mode,'local');
  assert.equal(catalog.retrieval.archive_name,'华为PC知识库(2).zip');
  assert.equal(catalog.retrieval.archive_version,'v7');
  assert(catalog.products.some(p=>p.system==='HarmonyOS'));
  assert(catalog.products.some(p=>p.system==='Windows'));
});

test('local default ignores stale cache environment',()=>{
  const prior=process.env.KNOWLEDGE_SOURCE;
  try {delete process.env.KNOWLEDGE_SOURCE;assert.equal(config().knowledgeSource,'local');}
  finally {if(prior!==undefined)process.env.KNOWLEDGE_SOURCE=prior;}
});

test('local retrieval uses only selected model documents and archive image bytes without ima',async()=>{
  assert.ok(api?.LocalKnowledge,'local retriever implementation required');
  const outputRoot=await fs.mkdtemp(path.join(os.tmpdir(),'local-kb-'));
  try {
    const catalog=await api.localCatalog();
    const product=catalog.products.find(p=>p.model==='HUAWEI MateBook 14'&&p.system==='HarmonyOS');
    const result=await retrieveEvidence({retrieve:()=>assert.fail('local mode must never contact ima')},{product:product.name},{knowledgeSource:'local',evidenceCacheFile:'does-not-exist',localOutputRoot:outputRoot});
    assert.equal(result.retrieval.product_id,product.id);
    assert.equal(result.kb_name,catalog.knowledge_base);
    assert(result.sources.some(s=>s.kind==='text'&&s.text.includes('麒麟 X90')));
    assert(result.sources.every(s=>s.path.startsWith(result.retrieval.product_path+'/')));
    assert(!result.sources.some(s=>s.path.includes('02-MateBook-Windows')));
    const images=result.sources.filter(s=>s.kind==='image');
    assert(images.length>=3);
    for(const source of images){
      assert.match(source.local_path,/^output\/media\/[a-f0-9-]{36}\.(png|jpg|webp)$/);
      const bytes=await fs.readFile(path.join(outputRoot,source.local_path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
      assert(api.imageExtension(bytes));
      assert(source.description);
    }
  } finally {await fs.rm(outputRoot,{recursive:true,force:true});}
});

test('partial model, wrong system, and unknown model cannot resolve',async()=>{
  assert.ok(api?.LocalKnowledge);
  const client=new api.LocalKnowledge();
  for(const product of ['MateBook 14','MateBook','MateBook Pro（Windows版）','invented model']) {
    await assert.rejects(client.retrieve({product}),/完整型号|系统|多个/);
  }
});

test('bundled files and image index hashes are valid and limited to each product directory',async()=>{
  assert.ok(api?.loadLocalKnowledge);
  const data=await api.loadLocalKnowledge();
  for(const p of data.products){
    assert(p.documents.some(d=>d.title==='产品事实.md'));
    for(const asset of [...p.documents,...p.images]){
      assert(asset.path.startsWith(p.path+'/'));
      const bytes=await fs.readFile(path.join(ROOT,'knowledge',asset.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
      if(p.images.includes(asset))assert.equal(api.imageExtension(bytes),asset.extension);
    }
  }
});

test('image signatures reject disguised text and path traversal cannot load assets',async()=>{
  assert.ok(api?.imageExtension);
  assert.equal(api.imageExtension(Buffer.from('<html>not an image</html>')),null);
  assert.throws(()=>api.assetPath(path.join(ROOT,'knowledge'),'../secrets'),/路径/);
  assert.throws(()=>api.assetPath(path.join(ROOT,'knowledge'),'C:/secret'),/路径/);
});

test('catalog and local health are available without API credentials',async()=>{
  const handle=createScenarioService({knowledgeSource:'local',apiKey:'',model:'unused'}, {diagnostics:noDiagnostics});
  for(const route of ['/api/products','/api/health']){
    let response;
    assert.equal(await handle({method:'GET'},{},route,(status,body)=>{response={status,body};}),true);
    assert.equal(response.status,200);
    if(route==='/api/products')assert.equal(response.body.products.length,10);
    else {
      assert.equal(response.body.configured,false);
      assert.equal(response.body.retrievalMode,'local');
      assert.equal(response.body.imaStatus,'not_required');
      assert.equal(response.body.knowledge.ok,true);
    }
  }
});
