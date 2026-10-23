import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalKnowledge, loadLocalKnowledge } from '../src/local-knowledge.mjs';

test('context retrieval is injectable and isolated from complete source documents and approved images', async()=>{
  const data=await loadLocalKnowledge(), product=data.products[0];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'retrieval-merge-'));
  let request;
  try {
    const hit={id:'context-one',text:'辅助场景示例，不是真实客户',source_type:'scenario',supports_product_fact:false};
    const client=new LocalKnowledge({localOutputRoot:root,searchClient:{search:async(query,options)=>{
      request={query,options}; return {results:[hit],mode:'lexical',warnings:[],stats:{returned:1}};
    }}});
    const result=await client.retrieve({product:product.id,scenario:'图书馆写论文',platform:'小红书'});
    assert.ok(request,'searchClient must be used');
    assert.equal(request.options.productId,product.id);
    assert.equal(request.options.mode,'lexical');
    assert.equal(request.options.platform,'小红书');
    assert.equal(request.options.diversifyTypes,true);
    assert.deepEqual(result.context_retrieval.results,[hit]);
    assert.equal(result.context_retrieval.stats.returned,1);
    assert.ok(!result.sources.some(source=>source.text?.includes(hit.text)));
    for(const document of product.documents){
      const original=await client.read(document,product);
      assert.equal(result.sources.find(source=>source.path===document.path).text,new TextDecoder('utf-8',{fatal:true}).decode(original).replace(/^\uFEFF/,''));
    }
    for(const image of result.sources.filter(source=>source.kind==='image')){
      assert.equal(image.visual_review.sha256,image.sha256);
      assert.equal(image.visual_review.allowed,true);
    }
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('failed auxiliary search retains full factual evidence and exposes failure honestly',async()=>{
  const data=await loadLocalKnowledge(), root=await fs.mkdtemp(path.join(os.tmpdir(),'retrieval-merge-'));
  try {
    const result=await new LocalKnowledge({localOutputRoot:root,searchClient:{search:async()=>{throw Error('offline test');}}}).retrieve({product:data.products[0].id,goal:'选购'});
    assert.equal(result.context_retrieval.mode,'unavailable');
    assert.match(result.context_retrieval.warnings.join(' '),/offline test/);
    assert.equal(result.sources.filter(s=>s.kind==='text').length,data.products[0].documents.length);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
